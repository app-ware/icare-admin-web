import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';

// Static source inspection only. Does not load legacy configuration or connect to SQL.
if (!process.argv[2]) throw new Error('Usage: npm run audit:legacy -- <legacy-project-directory>');
const source = resolve(process.argv[2]);
const destination = resolve('docs/generated');
const excluded = new Set(['.git', '.svn', '.vs', 'packages', 'Bin', 'node_modules']);
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(full)));
    else result.push(full);
  }
  return result.sort();
}
const matches = (text, regex, pick = 1) => [...text.matchAll(regex)].map((m) => m[pick]);
const unique = (values) => [...new Set(values)].sort();
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;
const normalize = (file) => relative(source, file).replaceAll('\\', '/');
const inputFiles = await walk(source);
const relevant = inputFiles.filter((f) =>
  /\.(vb|aspx|svc|config|sln|publishproj|pubxml|css|js)$/i.test(f),
);
const files = [];
const pages = [];
const operations = [];
const modelContracts = [];
const config = [];
for (const file of relevant) {
  const text = await readFile(file, 'utf8');
  const analysisText = file.endsWith('.vb')
    ? text.replace(/^[ \t]*'[^\r\n]*/gm, (match) => ' '.repeat(match.length))
    : text.replace(/<%--[\s\S]*?--%>|<!--[\s\S]*?-->/g, (match) => match.replace(/[^\r\n]/g, ' '));
  const name = normalize(file);
  files.push({
    path: name,
    lines: text.split('\n').length,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
  });
  if (file.endsWith('.aspx')) {
    const codePath = file + '.vb';
    const rawCode = await readFile(codePath, 'utf8').catch(() => '');
    const code = rawCode.replace(/^[ \t]*'[^\r\n]*/gm, (match) => ' '.repeat(match.length));
    const controls = [
      ...analysisText.matchAll(/<(?:(asp|ajaxToolkit|cc1):([\w]+)|([\w]+))\b([^>]*?)(?:\/?>)/gi),
    ].flatMap((m) => {
      const attrs = Object.fromEntries(
        [...m[4].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((a) => [a[1].toLowerCase(), a[2]]),
      );
      if (!m[1] && attrs.runat?.toLowerCase() !== 'server') return [];
      return [
        {
          line: lineAt(text, m.index),
          type: m[1] ? `${m[1]}:${m[2]}` : `html-server:${m[3]}`,
          ...Object.fromEntries(
            Object.entries(attrs).filter(([key]) =>
              [
                'id',
                'text',
                'value',
                'datafield',
                'datatextfield',
                'datavaluefield',
                'datakeynames',
                'dataformatstring',
                'sortexpression',
                'validationexpression',
                'validationgroup',
                'controltovalidate',
                'controltocompare',
                'errormessage',
                'commandname',
                'commandargument',
                'onclientclick',
                'visible',
                'enabled',
                'textmode',
                'maxlength',
                'required',
                'minvalue',
                'maxvalue',
                'checked',
                'selected',
                'operator',
                'readonly',
                'type',
              ].includes(key),
            ),
          ),
        },
      ];
    });
    pages.push({
      path: name,
      codePath: name + '.vb',
      authenticationGuard: /If Session\("UserID"\) Is Nothing Then/i.test(code),
      roleChecks: code
        .split(/\r?\n/)
        .flatMap((line, i) =>
          /isAdmin|Session\("UserID"\)\s*=\s*\d+|filterUserID|UserID\s*<>\s*\d+/i.test(line)
            ? [{ line: i + 1, expression: line.trim() }]
            : [],
        ),
      handlers: [
        ...code.matchAll(
          /^[ \t]*(?:(?:Public|Private|Protected|Friend|Shared|Overloads|Overrides)[ \t]+)*(Sub|Function)[ \t]+(\w+)[ \t]*([^\r\n]*)/gim,
        ),
      ].map((m) => ({
        line: lineAt(code, m.index),
        kind: m[1],
        name: m[2],
        signature: m[3].trim(),
      })),
      calls: unique(
        matches(
          code,
          /\b((?:BaseData|CentersData|AccountingData|FileUtils|GeneralUtils|Logging)(?:\.\w+)+)\s*\(/g,
        ),
      ),
      sessions: unique(matches(code, /Session(?:\.Add\()?\(?"([^"]+)"/g)),
      destinations: unique(
        matches(code, /(?:redirectTo\([^\r\n]*?|Response\.Redirect\()"([\w]+\.aspx)"/gi),
      ),
      queryKeys: unique(matches(code, /(?:QueryString|Request)\("([^"]+)"\)/g)),
      externalScripts: unique(
        matches(analysisText, /(?:src|href)="(https?:\/\/[^"?]+)(?:\?[^"<]*)?"/g),
      ),
      browserFunctions: unique(matches(analysisText, /function\s+(\w+)\s*\(/g)),
      controls,
    });
  }
  if (file.endsWith('.vb')) {
    const starts = [
      ...analysisText.matchAll(
        /^[ \t]*(?:(?:Public|Private|Protected|Friend|Shared|Overloads|Overrides)[ \t]+)*(Sub|Function)[ \t]+(\w+)[ \t]*([^\r\n]*)/gim,
      ),
    ];
    for (const method of starts) {
      const rest = analysisText.slice(method.index);
      const end = rest.search(new RegExp(`^[ \\t]*End ${method[1]}\\b`, 'mi'));
      const body = end < 0 ? rest : rest.slice(0, end);
      if (/SqlCommand|\.Open(?:Accounting|Logging)?Connection\(/i.test(body)) {
        const namespace = [];
        for (const scope of analysisText
          .slice(0, method.index)
          .matchAll(
            /^[ \t]*(?:(?:Public|Private|Friend|Protected)[ \t]+)?(?:(Module|Class)[ \t]+(\w+)|(End[ \t]+(?:Module|Class)))/gim,
          )) {
          if (scope[3]) namespace.pop();
          else namespace.push(scope[2]);
        }
        operations.push({
          path: name,
          line: lineAt(text, method.index),
          name: method[2],
          signature: method[3].trim(),
          classContext: namespace,
          connections: unique(
            matches(body, /DA\.(Open(?:Accounting|Logging)?Connection\([^\r\n]*\))/g),
          ),
          procedures: unique(matches(body, /New SqlCommand\("([\w.]+)"/g)),
          parameters: [
            ...body.matchAll(/\.Parameters\.Add(?:WithValue)?\("([^"]+)"\s*(?:,\s*([^\r\n]*))?/g),
          ].map((m) => {
            let direction = /Direction\s*=\s*ParameterDirection.Output/.test(m[0])
              ? 'output'
              : 'input';
            const prefix = body.slice(body.lastIndexOf('\n', m.index) + 1, m.index);
            const variable = prefix.match(/(\w+)(?:\s+As\s+[\w.]+)?\s*=\s*\w+$/i)?.[1];
            if (variable) {
              const assigned = body.match(
                new RegExp(`\\b${variable}\\.Direction\\s*=\\s*ParameterDirection\\.(\\w+)`, 'i'),
              )?.[1];
              if (assigned) direction = assigned.toLowerCase();
            }
            return {
              name: m[1],
              declaration: m[2]?.split('.Value')[0].split('.Direction')[0].trim() ?? '',
              direction,
            };
          }),
          tableTypes: unique(matches(body, /\.TypeName\s*=\s*"([^"]+)"/g)),
          sqlFragments: body
            .split(/\r?\n/)
            .map((value, i) => ({ line: lineAt(text, method.index) + i, value: value.trim() }))
            .filter(
              (v) =>
                /\b(?:SQL|sql)\s*(?:&?=)|(?:SELECT|UPDATE|INSERT INTO|DELETE FROM|FROM dbo\.|JOIN )/i.test(
                  v.value,
                ) && !v.value.startsWith("'"),
            ),
        });
      }
    }
    if (/obj[^/\\]+\.vb$|AccountingDataContracts\.vb$|enums\.vb$/i.test(file)) {
      modelContracts.push({
        path: name,
        classes: matches(analysisText, /(?:Public Class|Enum)\s+(\w+)/g),
        properties: analysisText
          .split(/\r?\n/)
          .map((value, i) => ({ line: i + 1, declaration: value.trim() }))
          .filter((v) => /Public (?:Property|\w+ As)|^\w+\s*=\s*-?\d+/.test(v.declaration)),
      });
    }
  }
  if (/\.config$|\.pubxml$/i.test(file)) {
    // Store key names and risk flags; never copy values or connection strings.
    config.push({
      path: name,
      appSettingKeys: unique(matches(text, /<add\s+key="([^"]+)"/g)),
      connectionNames: unique(matches(text, /<add\s+name="([^"]+)"[^>]*connectionString=/g)),
      externalConfigFiles: unique(matches(text, /configSource="([^"]+)"/g)),
      flags: {
        containsPassword: /(?:password|pwd)\s*=/i.test(text),
        containsEmbeddedKey:
          /(?:api[_-]?key|merchant[_-]?(?:key|hash)|client[_-]?secret)\s*=/i.test(text),
        containsHttpUrl: /http:\/\//i.test(text),
        persistSecurityInfo: /Persist Security Info\s*=\s*True/i.test(text),
        debugEnabled: /debug="true"/i.test(text),
        customErrorsOff: /customErrors\s+mode="Off"/i.test(text),
        sqlAuthentication: /(?:user id|uid)\s*=/i.test(text),
      },
    });
  }
}
const procedures = unique(operations.flatMap((op) => op.procedures));
const report = {
  schemaVersion: 1,
  sourceRootLabel: 'iCareAdmin-Web',
  method:
    'Static source inspection; configuration values redacted; no live SQL or server inspection.',
  counts: {
    files: files.length,
    pages: pages.length,
    databaseOperations: operations.length,
    distinctProcedures: procedures.length,
    serverControls: pages.reduce((total, page) => total + page.controls.length, 0),
    staticImageAssets: inputFiles.filter((file) => /\.(png|jpe?g|gif|bmp|svg|ico)$/i.test(file))
      .length,
  },
  files,
  pages,
  operations,
  modelContracts,
  configuration: config,
  procedures,
};
await mkdir(destination, { recursive: true });
await writeFile(join(destination, 'legacy-inventory.json'), JSON.stringify(report, null, 2) + '\n');
const md = [
  '# Generated source inventory',
  '',
  report.method,
  '',
  `Pages: ${pages.length}. Database-access methods: ${operations.length}. Distinct literal procedure names: ${procedures.length}.`,
  '',
  '## Pages',
  '',
  '| Page | Login guard | Events / functions | Database / utility calls | Destinations |',
  '| --- | --- | --- | --- | --- |',
  ...pages.map(
    (p) =>
      `| ${p.path} | ${p.authenticationGuard ? 'Present' : 'Absent'} | ${p.handlers.map((h) => h.name).join(', ')} | ${p.calls.join(', ')} | ${p.destinations.join(', ')} |`,
  ),
  '',
  '## Database call contracts',
  '',
  ...operations.flatMap((op) => [
    `### ${op.name} — ${op.path}:${op.line}`,
    '',
    `Signature: \`${op.signature}\``,
    '',
    `Connections: ${op.connections.map((x) => '`' + x + '`').join(', ') || 'Indirect'}. Procedures: ${op.procedures.join(', ') || 'Inline SQL'}.`,
    '',
    '| Parameter | Declaration | Direction |',
    '| --- | --- | --- |',
    ...op.parameters.map(
      (p) => `| ${p.name} | ${p.declaration.replaceAll('|', '\\|')} | ${p.direction} |`,
    ),
    '',
    ...(op.tableTypes.length ? ['Table types: ' + op.tableTypes.join(', '), ''] : []),
  ]),
  '## Full detail',
  '',
  'See `legacy-inventory.json` for controls, SQL fragments, models, configuration key names, transitions, and source fingerprints. Generated findings require human interpretation, especially commented code and database-side behavior.',
  '',
];
await writeFile(join(destination, 'legacy-inventory.md'), md.join('\n'));
console.log(JSON.stringify({ ...report.counts, destination, procedures }, null, 2));
