import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:3101';
const headers = { Origin: origin };
const update = (d: any, changes: Record<string, unknown> = {}) => ({
  name: d.name,
  email: d.email,
  active: d.active,
  isSuperAdmin: d.isSuperAdmin,
  centers: d.centers.map((c: any) => ({ id: c.id, type: c.type })),
  revision: d.revision,
  ...changes,
});
test('administrators manage dealers with conflict review and scoped session revocation', async ({
  page,
  browser,
}, info) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
  await page.goto('/dealers');
  await expect(page.getByRole('heading', { name: 'Dealers', exact: true })).toBeVisible();
  const username = `qa.ui.${info.project.name}.${Date.now()}`;
  const name = `Browser Dealer ${info.project.name}`;
  await page.getByRole('button', { name: 'New dealer', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Display name', exact: true }).fill(name);
  await dialog.getByRole('textbox', { name: /^Username/ }).fill(username);
  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('browser@example.test');
  await dialog.getByLabel(/^Initial password/).fill('Fictional-Demo-Password-123');
  await dialog.getByRole('checkbox', { name: /Little Cedar Nursery/ }).check();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Review changes', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Review dealer access' })).toBeVisible();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Create dealer', exact: true }).click();
  await expect(page.getByText(`${name} created.`, { exact: true })).toBeVisible();
  const directory = await (
    await page.request.get(`${origin}/api/dealers?q=${encodeURIComponent(username)}`)
  ).json();
  expect(directory.total).toBe(1);
  const id = directory.items[0].id;
  let account = await (await page.request.get(`${origin}/api/dealers/${id}`)).json();
  expect(account.centerCount).toBe(1);
  for (const key of ['password', 'user_password', 'password_salt', 'access_token'])
    expect(account).not.toHaveProperty(key);
  const duplicate = await page.request.post(`${origin}/api/dealers`, {
    headers,
    data: {
      name,
      username,
      password: 'Fictional-Demo-Password-123',
      email: '',
      active: true,
      isSuperAdmin: false,
      centers: [],
    },
  });
  expect(duplicate.status()).toBe(409);
  await page.getByRole('button', { name: `Manage ${name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue(
    name,
  );
  const concurrent = await page.request.patch(`${origin}/api/dealers/${id}`, {
    headers,
    data: update(account, { name: `${name} updated elsewhere` }),
  });
  expect(concurrent.status()).toBe(200);
  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('changed@example.test');
  await dialog.getByRole('button', { name: 'Review changes', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    dialog.getByText('This account changed. Reload it before saving.', { exact: false }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Reload current account', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue(
    `${name} updated elsewhere`,
  );
  await dialog.getByRole('checkbox', { name: /Little Cedar Nursery/ }).uncheck();
  await dialog.getByRole('checkbox', { name: /Horizon School/ }).check();
  await dialog.getByRole('checkbox', { name: /^Account active/ }).uncheck();
  await dialog.getByRole('button', { name: 'Review changes', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  account = await (await page.request.get(`${origin}/api/dealers/${id}`)).json();
  expect(account.active).toBe(false);
  expect(account.centers.map((c: any) => [c.id, c.type])).toEqual([[102, 4]]);
  const self = await (await page.request.get(`${origin}/api/dealers/900001`)).json();
  const lockout = await page.request.patch(`${origin}/api/dealers/900001`, {
    headers,
    data: update(self, { active: false }),
  });
  expect(lockout.status()).toBe(409);
  expect((await lockout.json()).error.code).toBe('SELF_LOCKOUT');
  const crossSite = await page.request.post(`${origin}/api/dealers`, {
    headers: { Origin: 'https://other.example' },
    data: {},
  });
  expect(crossSite.status()).toBe(403);
  const operator = await (await page.request.get(`${origin}/api/dealers/900002`)).json();
  const context = await browser.newContext({ baseURL: origin });
  let changed = false;
  try {
    expect(
      (
        await context.request.post('/api/auth/preview', { headers, data: { role: 'dealer' } })
      ).status(),
    ).toBe(200);
    for (const route of ['/api/dealers', '/api/dealers/centers', `/api/dealers/${id}`])
      expect((await context.request.get(route)).status()).toBe(403);
    expect(
      (
        await context.request.patch(`/api/dealers/900002`, {
          headers,
          data: { isSuperAdmin: true },
        })
      ).status(),
    ).toBe(403);
    const operatorPage = await context.newPage();
    await operatorPage.goto('/dealers');
    await expect(
      operatorPage.getByRole('heading', { name: 'Administrator access required' }),
    ).toBeVisible();
    expect(await operatorPage.getByRole('link', { name: 'Dealers', exact: true }).count()).toBe(0);
    const mutation = await page.request.patch(`${origin}/api/dealers/900002`, {
      headers,
      data: update(operator, { centers: [{ id: 102, type: 4 }] }),
    });
    expect(mutation.status()).toBe(200);
    changed = true;
    expect((await context.request.get('/api/centers')).status()).toBe(401);
    expect(
      (
        await context.request.post('/api/auth/preview', { headers, data: { role: 'dealer' } })
      ).status(),
    ).toBe(200);
    const scoped = await (await context.request.get('/api/centers')).json();
    expect(scoped.total).toBe(1);
    expect(scoped.items[0].type).toBe(4);
  } finally {
    if (changed) {
      const latest = await (await page.request.get(`${origin}/api/dealers/900002`)).json();
      expect(
        (
          await page.request.patch(`${origin}/api/dealers/900002`, {
            headers,
            data: update(operator, { revision: latest.revision }),
          })
        ).status(),
      ).toBe(200);
    }
    await context.close();
  }
  await page.getByRole('textbox', { name: 'Search dealers', exact: true }).fill(username);
  await expect(page.locator('.dealer-card')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: `Manage ${name} updated elsewhere`, exact: true }),
  ).toBeVisible();
  await expect(page.locator('.dealer-stats strong').first()).toHaveText('1');
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath('dealers.png'), fullPage: true, caret: 'initial' });
});
