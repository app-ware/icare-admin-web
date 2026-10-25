import { test, expect, type Page } from '@playwright/test';

const headers = { Origin: 'http://127.0.0.1:3101' };
async function demo(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Demo role').selectOption(role);
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
}
test('status review confirms changes, preserves filters and recovers from concurrent edits', async ({
  page,
}, info) => {
  await demo(page, 'admin');
  await page.goto('/status');
  await expect(page.getByRole('heading', { name: 'Center status', exact: true })).toBeVisible();
  await page
    .getByLabel('Search centers', { exact: true })
    .pressSequentially('Little Cedar', { delay: 15 });
  await expect(page.getByLabel('Search centers', { exact: true })).toHaveValue('Little Cedar');
  await expect(page.locator('.status-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Center type', exact: true }).selectOption('1');
  await page.getByRole('combobox', { name: 'Assigned dealer', exact: true }).selectOption('900002');
  await expect(page).toHaveURL(/dealerId=900002/);
  await page.reload();
  await expect(page.getByLabel('Search centers', { exact: true })).toHaveValue('Little Cedar');
  await expect(page.locator('.status-card')).toHaveCount(1);
  const before = await (await page.request.get('/api/status/1/101')).json();
  const target = before.center.code === 1 ? '0' : '1';
  await page
    .getByRole('button', { name: 'Review status for Little Cedar Nursery', exact: true })
    .click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('New status').selectOption(target);
  await dialog.getByLabel('Reason for change').fill('Browser acceptance maintenance');
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Review status change' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('status-review.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Confirm status change', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'status saved' })).toContainText(
    'status saved',
  );
  const saved = await (await page.request.get('/api/status/1/101')).json();
  expect(saved.center.code).toBe(Number(target));
  expect(saved.history[0].reason).toBe('Browser acceptance maintenance');
  expect(saved.history[0].state).toBe('committed');
  await page
    .getByRole('button', { name: 'Review status for Little Cedar Nursery', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Portal status history')).toContainText(
    'Browser acceptance maintenance',
  );
  await dialog.getByLabel('New status').selectOption(target === '1' ? '0' : '1');
  await dialog.getByLabel('Reason for change').fill('A stale browser change');
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click();
  expect(
    (
      await page.request.patch('/api/status/1/101', {
        headers,
        data: {
          revision: saved.center.revision,
          active: target !== '1',
          reason: 'Updated in another browser',
        },
      })
    ).status(),
  ).toBe(200);
  await dialog.getByRole('button', { name: 'Confirm status change', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('This status changed');
  await dialog.getByRole('button', { name: 'Reload current status', exact: true }).click();
  await expect(dialog.getByLabel('New status')).toHaveValue('');
  await expect(dialog.getByLabel('Portal status history')).toContainText(
    'Updated in another browser',
  );
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Activation status', exact: true })
    .selectOption('review');
  await expect(page.getByRole('heading', { name: 'No matching centers' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Activation status', exact: true }).selectOption('all');
  await expect(page.locator('.status-card')).toHaveCount(1);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('status.png'), fullPage: true });
});

test('status API separates page-9 reads, owned writes, center types and trusted identity', async ({
  page,
  browser,
}) => {
  expect((await page.request.get('/api/status')).status()).toBe(401);
  await demo(page, 'dealer');
  const list = await (await page.request.get('/api/status')).json();
  expect(list.items.map((c: any) => c.id).sort()).toEqual([101, 103, 104]);
  expect(list.canFilterDealer).toBe(false);
  await page.goto('/status?q=Bright');
  await page.getByRole('button', { name: 'Review status for Bright Steps', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('view-only');
  await expect(dialog.getByLabel('New status')).toHaveCount(0);
  const readOnly = await (await page.request.get('/api/status/3/104')).json();
  expect(readOnly.center.canManage).toBe(false);
  expect(
    (
      await page.request.patch('/api/status/3/104', {
        headers,
        data: {
          active: false,
          reason: 'Page-9 cannot authorize changes',
          revision: readOnly.center.revision,
        },
      })
    ).status(),
  ).toBe(403);
  for (const route of [
    '/api/status/4/101',
    '/api/status/4/102',
    '/api/status?dealerId=900001',
    '/api/centers/3/104',
  ])
    expect((await page.request.get(route)).status()).toBe(403);
  for (const route of ['/api/status/2/101', '/api/status?sql=anything', '/api/status?page=100001'])
    expect((await page.request.get(route)).status()).toBe(422);
  const owned = await (await page.request.get('/api/status/1/103')).json();
  const data = {
    active: owned.center.code !== 1,
    revision: owned.center.revision,
    reason: 'Owner acceptance change',
  };
  expect(
    (
      await page.request.patch('/api/status/1/103', {
        headers: { Origin: 'https://other.example' },
        data,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch('/api/status/1/103', { headers, data: { ...data, actorId: 900001 } })
    ).status(),
  ).toBe(422);
  expect((await page.request.patch('/api/status/1/103', { headers, data })).status()).toBe(200);
  expect((await page.request.patch('/api/status/1/103', { headers, data })).status()).toBe(409);
  const fresh = await (await page.request.get('/api/status/1/103')).json();
  // Restore fictional fixture state without affecting any live data.
  expect(
    (
      await page.request.patch('/api/status/1/103', {
        headers,
        data: { ...data, revision: fresh.center.revision, active: owned.center.code === 1 },
      })
    ).status(),
  ).toBe(200);
  const anonymous = await browser.newContext();
  try {
    expect((await anonymous.request.get('http://127.0.0.1:3101/api/status/1/101')).status()).toBe(
      401,
    );
  } finally {
    await anonymous.close();
  }
});
