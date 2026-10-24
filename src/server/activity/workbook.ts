import 'server-only';
import ExcelJS from 'exceljs';
import { centerTypeLabels } from '@/domain/centers';
import { reportRules, type ActivityReport, type Buckets } from '@/domain/activity';

const values = (b: Buckets) => [b.registered, b.zero, b.short, b.medium, b.long, b.unresolved];
const labels = ['Registered', 'Zero days', '1–5 days', '6–13 days', '14+ days', 'Unresolved'];
export async function activityWorkbook(reports: ActivityReport[]) {
  const book = new ExcelJS.Workbook();
  book.creator = 'iCare Admin Portal';
  book.created = new Date();
  const summary = book.addWorksheet('Center summary'),
    classes = book.addWorksheet('Class breakdown'),
    rules = book.addWorksheet('Report rules');
  summary.addRow([
    'Center',
    'Type',
    'Month',
    'Academic year',
    'As of',
    'Ending date (exclusive)',
    'Group',
    ...labels,
  ]);
  classes.addRow(['Center', 'Type', 'Month', 'Academic year', 'Class', 'Group', ...labels]);
  for (const report of reports) {
    for (const [name, group] of [
      ['All', report.totals.all],
      ['Demo', report.totals.demo],
      ['Non-demo', report.totals.nonDemo],
    ] as const)
      summary.addRow([
        report.center.name,
        centerTypeLabels[report.center.type],
        report.period,
        report.academicYear?.title ?? '',
        report.asOf,
        report.endExclusive,
        name,
        ...values(group),
      ]);
    for (const row of report.classes)
      for (const [name, group] of [
        ['All', row.all],
        ['Demo', row.demo],
        ['Non-demo', row.nonDemo],
      ] as const)
        classes.addRow([
          report.center.name,
          centerTypeLabels[report.center.type],
          report.period,
          report.academicYear?.title ?? '',
          row.name,
          name,
          ...values(group),
        ]);
  }
  rules.addRow(['Rule', 'Value']);
  rules.addRow(['Policy', reports[0]?.policy ?? '']);
  for (const rule of reportRules) rules.addRow(['Interpretation', rule]);
  rules.addRow([
    'Boundary',
    'Stored calendar dates are used without shifting historical timestamps. The database date supplies the current cutoff.',
  ]);
  rules.addRow([
    'School correction',
    'The latest event before month start is used, including the last day of the previous month.',
  ]);
  rules.addRow([
    'Privacy',
    'No child names, identifiers, dates of birth or contact information are exported.',
  ]);
  rules.addRow([
    'Financial status',
    'This workbook is not an invoice, attendance register or payment calculation.',
  ]);
  rules.addRow([
    'Roster scope',
    'Class and parent must belong to the selected center. Center totals are unique records; class totals can overlap.',
  ]);
  for (const report of reports) {
    rules.addRow([
      report.center.name,
      `Deleted records ${report.includeDeleted ? 'included' : 'excluded'}; interval ${report.start} to ${report.endExclusive} (exclusive).`,
    ]);
    for (const [key, value] of Object.entries(report.quality))
      rules.addRow([`${report.center.name} · ${key}`, value]);
  }
  for (const sheet of book.worksheets) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    sheet.getRow(1).height = 27;
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2475D0' } };
    sheet.columns.forEach((column, i) => {
      column.width =
        sheet === rules
          ? i === 0
            ? 34
            : 110
          : i === 0
            ? 32
            : sheet === classes && i === 4
              ? 28
              : 18;
      column.alignment = { vertical: 'top', wrapText: true };
    });
    for (let row = 2; row <= sheet.rowCount; row++) {
      if (row % 2 === 0)
        sheet.getRow(row).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F7FF' },
        };
    }
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
