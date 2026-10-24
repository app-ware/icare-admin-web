import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
const headers = { Origin: 'http://127.0.0.1:3101' };
async function demo(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Demo role').selectOption(role);
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}
test('activity has scoped aggregate counts, responsive controls and report-only access', async ({
  page,
}, info) => {
  await demo(page, 'dealer');
  await page.goto('/activity?centerId=101&centerType=1&period=2024-03');
  await expect(page.getByRole('heading', { name: 'Class breakdown', exact: true })).toBeVisible();
  await expect(page.locator('.activity-metrics strong').first()).toHaveText('6');
  await expect(page.getByRole('columnheader', { name: '1–5 days' })).toBeVisible();
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  await expect(page.locator('.activity-table tbody tr').first().locator('td').first()).toHaveText(
    '1',
  );
  await page.getByRole('button', { name: 'All records', exact: true }).click();
  await expect(page.locator('.activity-table tbody tr').first().locator('td').first()).toHaveText(
    '3',
  );
  await page.getByLabel('Include deleted records').uncheck();
  await page.getByRole('button', { name: 'View activity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Class breakdown', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/includeDeleted=false/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Class breakdown', exact: true })).toBeVisible();
  await expect(page.getByLabel('Include deleted records')).not.toBeChecked();
  await noOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath('activity.png'),
    fullPage: true,
    caret: 'initial',
  });
  await page.getByRole('textbox', { name: 'Search activity centers', exact: true }).fill('Bright');
  await expect(page.locator('.activity-center-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'View activity for Bright Steps', exact: true }).click();
  await expect(page).toHaveURL(/centerId=104&centerType=3/);
  for (const route of [
    '/api/centers/3/104',
    '/api/center-users?centerId=104&centerType=3',
    '/api/activity?centerId=102&centerType=4&period=2024-03&academicYearId=2026&includeDeleted=false',
  ])
    expect((await page.request.get(route)).status()).toBe(403);
  expect((await page.request.get('/api/activity/centers?dealerId=900001')).status()).toBe(403);
  expect(
    (await page.request.get('/api/activity?centerId=101&centerType=1&period=2099-01')).status(),
  ).toBe(422);
  const report = await (
    await page.request.get('/api/activity?centerId=104&centerType=3&period=2024-03')
  ).json();
  expect(report.totals.all).toEqual({
    registered: 6,
    zero: 1,
    short: 1,
    medium: 1,
    long: 2,
    unresolved: 1,
  });
  expect(JSON.stringify(report)).not.toMatch(/child_id|childId|child_name|parent_id/);
  // A delayed old selection must not replace a newer draft month or its URL.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/activity?**', async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'View activity', exact: true }).click();
  await page.getByLabel('Activity month', { exact: true }).fill('2024-02');
  release();
  await expect(page.getByLabel('Activity month', { exact: true })).toHaveValue('2024-02');
  await page.unroute('**/api/activity?**');
  await page.getByRole('button', { name: 'View activity', exact: true }).click();
  await expect(page).toHaveURL(/period=2024-02/);
  await page.route('**/api/activity/context', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Metadata unavailable' } }),
    }),
  );
  await page.route('**/api/reports/exports', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'History unavailable' } }),
    }),
  );
  await page.getByRole('button', { name: 'Refresh activity centers' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Metadata unavailable' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'History unavailable' })).toBeVisible();
  await page.unroute('**/api/activity/context');
  await page.unroute('**/api/reports/exports');
  await page.getByRole('button', { name: 'Refresh activity centers' }).click();
  await expect(page.locator('.form-error[role="alert"]')).toHaveCount(0);
  await noOverflow(page);
});
test('Excel workbooks, account history, batch scope and School year selection work', async ({
  page,
  browser,
}, info) => {
  await demo(page, 'dealer');
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Activity reports', exact: true })).toBeVisible();
  await expect(page.getByLabel('Select Bright Steps', { exact: true })).toBeVisible();
  await page.getByLabel('Select Bright Steps', { exact: true }).check();
  await page.getByLabel('Select Little Cedar Nursery', { exact: true }).check();
  await page.getByLabel('Report month', { exact: true }).fill('2024-03');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate Excel workbook', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^icare-activity-2024-03-.*\.xlsx$/);
  const file = await download.path();
  expect(file).toBeTruthy();
  const buffer = await readFile(file!),
    book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as any);
  expect(book.worksheets.map((s) => s.name)).toEqual([
    'Center summary',
    'Class breakdown',
    'Report rules',
  ]);
  expect(book.worksheets[0].rowCount).toBe(7);
  expect(book.worksheets[0].getCell('H2').value).toBe(6);
  await expect(page.getByRole('status').filter({ hasText: 'Workbook generated' })).toBeVisible();
  await expect(page.locator('.activity-history-row').first()).toContainText('Generated');
  await noOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('reports.png'), fullPage: true, caret: 'initial' });
  const exportData = { period: '2024-03', includeDeleted: true, centers: [{ id: 101, type: 1 }] };
  expect(
    (
      await page.request.post('/api/reports/exports', {
        headers: { Origin: 'https://other.example' },
        data: exportData,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/reports/exports', {
        headers,
        data: { ...exportData, actor: 900001 },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.request.post('/api/reports/exports', {
        headers,
        data: {
          ...exportData,
          centers: [{ id: 102, type: 4 }],
          includeDeleted: false,
          academicYearId: 2026,
        },
      })
    ).status(),
  ).toBe(403);
  const other = await browser.newContext();
  const admin = await other.newPage();
  try {
    await demo(admin, 'admin');
    const own = await (await page.request.get('/api/reports/exports')).json(),
      otherHistory = await (await admin.request.get('/api/reports/exports')).json();
    expect(otherHistory.items.some((r: any) => own.items.some((o: any) => o.id === r.id))).toBe(
      false,
    );
    await admin.goto('/activity?centerId=102&centerType=4&period=2024-03');
    await expect(
      admin.getByRole('heading', { name: 'Class breakdown', exact: true }),
    ).toBeVisible();
    await expect(admin.getByRole('combobox', { name: 'Academic year', exact: true })).toHaveValue(
      '2026',
    );
    await admin.getByRole('combobox', { name: 'Academic year', exact: true }).selectOption('2025');
    await admin.getByRole('button', { name: 'View activity', exact: true }).click();
    await expect(admin).toHaveURL(/academicYearId=2025/);
    const school = await admin.request.post('/api/reports/exports', {
      headers,
      data: {
        period: '2024-03',
        includeDeleted: false,
        centers: [{ id: 102, type: 4 }],
        academicYearId: 2025,
      },
    });
    expect(school.status()).toBe(200);
    expect((await school.body()).subarray(0, 2).toString()).toBe('PK');
    expect(
      (
        await admin.request.post('/api/reports/exports', {
          headers,
          data: {
            period: '2024-03',
            includeDeleted: false,
            centers: [
              { id: 102, type: 4 },
              { id: 101, type: 1 },
            ],
            academicYearId: 2025,
          },
        })
      ).status(),
    ).toBe(422);
  } finally {
    await other.close();
  }
});
