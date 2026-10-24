import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const readJson = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const source = await readJson('docs/generated/legacy-inventory.json');
const databases = {};
for (const role of ['secure', 'nursery', 'school']) {
  databases[role] = await readJson(`.local/db-audit/active/${role}.json`);
}
const root = 'docs/generated/database';
await mkdir(root, { recursive: true });
await mkdir('.local/db-audit/review', { recursive: true });
const roleForCatalog = (catalog, fallback) => {
  if (!catalog) return fallback;
  return (
    {
      icare: 'nursery',
      icare_school: 'school',
      icare_secure: 'secure',
      icare_accounting: 'accounting',
      icare_log: 'logging',
    }[catalog.toLowerCase()] ?? `external:${catalog}`
  );
};
const rolesFor = (operation) => [
  ...new Set(
    operation.connections.flatMap((connection) => {
      if (connection.startsWith('OpenAccounting')) return ['accounting'];
      if (connection.startsWith('OpenLogging')) return ['logging'];
      if (connection === 'OpenConnection()') return ['secure'];
      if (connection.includes('.School')) return ['school'];
      if (/OpenConnection\((?:1|enums.CenterType.Nursery)\)/.test(connection)) return ['nursery'];
      return ['nursery', 'school'];
    }),
  ),
];
// Review copies intentionally hide SQL literal values; these are evidence, not runnable migrations.
const redactLiterals = (definition) =>
  definition?.replace(/N?'(?:''|[^'])*'/g, (literal) => {
    if (literal === "''" || /^N?'(?:SHA2_512|SHA2_256|SHA1|MD5|_|,|MM\/dd\/yyyy)'$/i.test(literal))
      return literal;
    return "'[SQL literal withheld]'";
  }) ?? null;
const roots = [];
for (const operation of source.operations) {
  for (const role of rolesFor(operation)) {
    for (const name of operation.procedures)
      roots.push({
        role,
        schema: 'dbo',
        name,
        caller: operation.name,
        sourceLine: operation.line,
        sourceParameters: operation.parameters,
      });
  }
}
for (const name of ['isDealerSuperAdmin', 'isCenterDomainAvailable', 'getCenterDomain'])
  roots.push({
    role: 'secure',
    schema: 'dbo',
    name,
    caller: 'inline SQL function',
    sourceParameters: [],
  });
const key = (ref) => `${ref.role}.${ref.schema}.${ref.name}`.toLowerCase();
const modules = new Map();
for (const [role, database] of Object.entries(databases))
  for (const module of database.queries.modules)
    modules.set(key({ role, schema: module.schema_name, name: module.name }), module);
const queue = [...roots];
const visited = new Map();
while (queue.length) {
  const item = queue.shift();
  if (visited.has(key(item))) continue;
  const module = modules.get(key(item));
  const dependencies = (databases[item.role]?.queries.dependencies ?? []).filter(
    (dependency) =>
      dependency.source_schema?.toLowerCase() === item.schema.toLowerCase() &&
      dependency.source_object?.toLowerCase() === item.name.toLowerCase(),
  );
  const refs = [
    ...new Map(
      dependencies.map((dependency) => {
        const ref = {
          role: roleForCatalog(dependency.referenced_database_name, item.role),
          schema: dependency.referenced_schema_name ?? 'dbo',
          name: dependency.referenced_entity_name,
          externalServer: dependency.referenced_server_name !== null,
        };
        return [key(ref), ref];
      }),
    ).values(),
  ];
  const object = (databases[item.role]?.queries.objects ?? []).find(
    (o) =>
      o.schema_name?.toLowerCase() === item.schema.toLowerCase() &&
      o.name?.toLowerCase() === item.name?.toLowerCase(),
  );
  const tableType = (databases[item.role]?.queries.table_types ?? []).find(
    (t) =>
      t.schema_name?.toLowerCase() === item.schema.toLowerCase() &&
      t.table_type_name?.toLowerCase() === item.name?.toLowerCase(),
  );
  const record = {
    role: item.role,
    schema: item.schema,
    name: item.name,
    available: !!object || !!tableType,
    moduleDefinitionAvailable: !!module,
    objectType: object?.type_desc ?? (tableType ? 'USER_TABLE_TYPE' : null),
    dependencies: refs,
  };
  visited.set(key(item), record);
  if (module) {
    for (const ref of refs) if (ref.name && !ref.externalServer) queue.push(ref);
  }
}
const contracts = roots.map((ref) => {
  const module = modules.get(key(ref));
  const parameters = (databases[ref.role]?.queries.parameters ?? []).filter(
    (parameter) =>
      parameter.schema_name === ref.schema &&
      parameter.object_name.toLowerCase() === ref.name.toLowerCase(),
  );
  const databaseNames = new Set(
    parameters.map((parameter) => parameter.name?.toLowerCase()).filter(Boolean),
  );
  const passed = ref.sourceParameters.filter(
    (parameter) => parameter.name.toLowerCase() !== 'retval',
  );
  const unknownPassed = passed
    .filter(
      (parameter) =>
        !databaseNames.has(parameter.name.toLowerCase()) &&
        !(
          ref.role === 'nursery' &&
          ref.name === 'iCareAdmin_addCareCenter' &&
          parameter.name === '@academicYearID'
        ),
    )
    .map((parameter) => parameter.name);
  return {
    ...ref,
    available: !!module,
    parameters,
    unexpectedCallerParameters: module ? unknownPassed : [],
    definitionSha256: module?.definition
      ? createHash('sha256').update(module.definition).digest('hex')
      : null,
  };
});
const summary = {
  inspectedAtUtc: databases.secure.inspected_at_utc,
  scope:
    'Configured active endpoint; system metadata and bounded non-personal reference reads; no application procedure executions or customer row reads.',
  databases: Object.fromEntries(
    Object.entries(databases).map(([role, db]) => [
      role,
      {
        environment: db.queries.environment[0],
        connection: db.queries.connection_security[0],
        tableCount: db.queries.row_estimates.length,
        moduleCount: db.queries.modules.length,
        objects: db.queries.objects.length,
        foreignKeyCount: new Set(db.queries.foreign_keys.map((f) => f.name)).size,
        untrustedForeignKeyCount: new Set(
          db.queries.foreign_keys
            .filter((f) => f.is_not_trusted || f.is_disabled)
            .map((f) => f.name),
        ).size,
        definitionUnavailable: db.queries.modules.filter((m) => !m.definition).map((m) => m.name),
      },
    ]),
  ),
  contracts,
  dependencyClosure: [...visited.values()],
};
await writeFile(
  join(root, 'contracts-and-dependencies.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
for (const [role, db] of Object.entries(databases)) {
  const schema = {
    role,
    inspectedAtUtc: db.inspected_at_utc,
    environment: db.queries.environment,
    connection: db.queries.connection_security,
    columns: db.queries.columns,
    indexes: db.queries.indexes,
    foreignKeys: db.queries.foreign_keys,
    checks: db.queries.check_constraints,
    tableTypes: db.queries.table_types,
    objects: db.queries.objects,
    parameters: db.queries.parameters,
    dependencies: db.queries.dependencies,
    synonyms: db.queries.synonyms,
    rowEstimates: db.queries.row_estimates,
    permissions: db.queries.permissions,
    roleMemberships: db.queries.role_memberships,
  };
  // Default/computed/check/index definitions are masked as well.
  for (const rows of [schema.columns, schema.indexes, schema.checks])
    for (const row of rows)
      for (const prop of [
        'default_definition',
        'computed_definition',
        'definition',
        'filter_definition',
      ])
        if (typeof row[prop] === 'string') row[prop] = redactLiterals(row[prop]);
  await writeFile(join(root, `${role}-schema.json`), JSON.stringify(schema, null, 2) + '\n');
  const review = db.queries.modules.filter(
    (module) =>
      visited.has(key({ role, schema: module.schema_name, name: module.name })) ||
      module.type_desc === 'SQL_TRIGGER' ||
      /^(?:iCareAdmin_|authenticate|dealerHasAccess|getHashedPassword|getKeyText|updateUserPassword|addNewCenterUser|utils_)/i.test(
        module.name,
      ),
  );
  for (const module of review) {
    const text = redactLiterals(module.definition);
    await writeFile(
      `.local/db-audit/review/${role}.${module.schema_name}.${module.name}.sql`,
      text ?? '-- Definition unavailable',
    );
  }
  const entries = review.map((module) => ({
    schema: module.schema_name,
    name: module.name,
    type: module.type_desc,
    definition: redactLiterals(module.definition),
    lines: module.definition?.split('\n').length ?? 0,
  }));
  await writeFile(
    join(root, `${role}-reviewed-modules.json`),
    JSON.stringify(entries, null, 2) + '\n',
  );
  const supplemental = await readJson(`.local/db-audit/active/${role}-contracts.json`);
  await writeFile(
    join(root, `${role}-reference-and-result-contracts.json`),
    JSON.stringify(supplemental, null, 2) + '\n',
  );
}
const rows = Object.entries(databases).map(([role, db]) => ({
  role,
  tables: db.queries.row_estimates.length,
  procedures: db.queries.modules.filter((m) => m.type_desc === 'SQL_STORED_PROCEDURE').length,
  functions: db.queries.modules.filter((m) => m.type_desc.includes('FUNCTION')).length,
  views: db.queries.modules.filter((m) => m.type_desc === 'VIEW').length,
  triggers: db.queries.modules.filter((m) => m.type_desc === 'SQL_TRIGGER').length,
}));
const md = [
  '# Verified database metadata evidence',
  '',
  'Read-only inspection of the configured **active** endpoint on 21 October 2026. These files do not establish the state of the unreachable production/local endpoint variants. Accounting and logging catalogs are absent from the active server.',
  '',
  '| Role | Tables | Procedures | Functions | Views | Triggers |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    (r) =>
      `| ${r.role} | ${r.tables} | ${r.procedures} | ${r.functions} | ${r.views} | ${r.triggers} |`,
  ),
  '',
  '## Files',
  '',
  '- `*-schema.json`: object catalog, table/view columns, keys/indexes, checks, SQL table types, dependencies, estimated row counts, permission metadata. No customer rows.',
  '- `*-reviewed-modules.json`: admin dependency modules plus identity/compatibility helpers; SQL string literals withheld. These are review copies, not executable migration scripts.',
  '- `*-reference-and-result-contracts.json`: bounded non-personal seed/reference rows and system-compiler first-result metadata; no application stored procedure was executed.',
  '- `contracts-and-dependencies.json`: source-to-database procedure mapping and dependency closure. Conditional source branches and unreachable generic helper paths require interpretation.',
  '',
  '## Direct source procedure contracts',
  '',
  '| Role | Procedure / function | Source caller | Available | Unexpected passed names |',
  '| --- | --- | --- | --- | --- |',
  ...contracts.map(
    (c) =>
      `| ${c.role} | ${c.schema}.${c.name} | ${c.caller} | ${c.available ? 'Yes' : databases[c.role] ? 'Absent' : 'Database unavailable'} | ${c.unexpectedCallerParameters.join(', ')} |`,
  ),
  '',
  'The nursery add-center call conditionally omits school-only academicYearID; this is handled explicitly rather than flagged as an error. School gateway and invoice-tracker generic-helper paths lack procedures, but their normal legacy list queries exclude school centers. The school monthly class method truly accepts an academic year rather than nursery month parameters.',
  '',
  '## Interpretation',
  '',
  'See [the database inspection](../../07-database-inspection.md) for conclusions, corrections to the initial source-only audit, verified transaction boundaries, authorization differences, and remaining blockers. Raw exports are kept under ignored `.local/db-audit/`; configuration values and customer records are not copied to this evidence set.',
  '',
];
await writeFile(join(root, 'README.md'), md.join('\n'));
console.log(
  JSON.stringify(
    {
      databases: summary.databases,
      contractCount: contracts.length,
      unexpectedCallerParameters: contracts
        .filter((c) => c.unexpectedCallerParameters.length)
        .map((c) => ({
          role: c.role,
          name: c.name,
          caller: c.caller,
          unexpected: c.unexpectedCallerParameters,
        })),
      absentOnReachableDatabases: contracts
        .filter((c) => databases[c.role] && !c.available)
        .map((c) => ({ role: c.role, name: c.name })),
      dependencyClosureSize: visited.size,
      reviewCopies: '.local/db-audit/review',
    },
    null,
    2,
  ),
);
