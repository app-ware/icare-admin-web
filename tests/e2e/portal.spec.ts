import { test, expect, type Page } from '@playwright/test';
const origin = 'http://127.0.0.1:3101';
async function demo(page: Page, role = 'admin') {
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

test('protected routes, safe cookies, origin checks and logout reject replay', async ({
  page,
  request,
}, info) => {
  await page.goto('/centers');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(await page.content()).not.toContain('Little Cedar Nursery');
  expect((await request.get('/api/centers')).status()).toBe(401);
  expect((await request.get('/api/live/centers')).status()).toBe(401);
  expect(
    (
      await request.post('/api/auth/preview', {
        data: { role: 'admin' },
        headers: { Origin: 'https://other.example' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/auth/login', {
        data: { username: 'not-a-real-account', password: 'not-a-real-password' },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(503);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('login.png'), fullPage: true, caret: 'initial' });
  await demo(page);
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === 'icare_session')!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe('Lax');
  expect(session.value).toHaveLength(43);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('overview.png'),
    fullPage: true,
    caret: 'initial',
  });
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  const replay = await request.get('/api/centers', {
    headers: { Cookie: `icare_session=${session.value}` },
  });
  expect(replay.status()).toBe(401);
});

test('directory filters, profile persistence and stale updates work', async ({ page }, info) => {
  await demo(page);
  await page.goto('/centers');
  await expect(page.getByRole('heading', { name: 'Care centers', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search centers' }).fill('horizon');
  await expect(page.getByRole('status')).toHaveText('1 center found');
  await page.getByRole('textbox', { name: 'Search centers' }).fill('');
  await page.getByLabel('Center type', { exact: true }).selectOption('4');
  await expect(page.getByRole('link', { name: 'View Horizon School' })).toBeVisible();
  await page.getByLabel('Activation status').selectOption('inactive');
  await expect(page.getByRole('heading', { name: 'No centers match these filters' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(page.getByRole('link', { name: 'View Little Cedar Nursery' })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('directory.png'),
    fullPage: true,
    caret: 'initial',
  });
  const before = await (await page.request.get('/api/centers/1/101')).json();
  await page.getByRole('link', { name: 'View Little Cedar Nursery' }).click();
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  const manager = `Demo manager ${info.project.name} ${Date.now()}`;
  await page.getByLabel('Manager name').fill(manager);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Center profile saved');
  await page.reload();
  await expect(page.getByText(manager, { exact: true })).toBeVisible();
  const stale = await page.request.patch('/api/centers/1/101', {
    data: { revision: before.revision, profile: { ...before.profile, manager: 'Stale manager' } },
    headers: { Origin: origin },
  });
  expect(stale.status()).toBe(409);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('center-profile.png'),
    fullPage: true,
    caret: 'initial',
  });
  const current = await (await page.request.get('/api/centers/1/101')).json();
  expect(
    (
      await page.request.patch('/api/centers/1/101', {
        data: { revision: current.revision, profile: before.profile },
        headers: { Origin: origin },
      })
    ).ok(),
  ).toBe(true);
});

test('creation drafts survive reload and publish only into the demo workspace', async ({
  page,
}, info) => {
  await demo(page);
  await page.goto('/centers');
  await page.getByRole('button', { name: 'New center draft', exact: true }).click();
  const suffix = Date.now().toString();
  const name = `Demo Sky ${suffix}`;
  await page.getByRole('textbox', { name: 'Domain', exact: true }).fill(`sky${suffix}`);
  await page.getByLabel('Center type', { exact: true }).last().selectOption('4');
  await page.getByRole('textbox', { name: 'Center name', exact: true }).fill(name);
  await page.getByLabel('Manager name').fill('Demo manager');
  await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Contact email').fill('admin@example.com');
  await page.getByLabel('Address', { exact: true }).fill('Demo campus');
  await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Latitude', { exact: true }).fill('-33.9');
  await page.getByLabel('Longitude', { exact: true }).fill('-70.6');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'My drafts', exact: false }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  const row = page.locator('.draft-row').filter({ hasText: name });
  await row.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('textbox', { name: 'Center name', exact: true })).toHaveValue(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByLabel('Contact email')).toHaveValue('admin@example.com');
  await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('-33.9');
  await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible();
  await expect(page.getByLabel('Choose draft logo', { exact: true })).toBeEnabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('School');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('center-draft.png'),
    fullPage: true,
    caret: 'initial',
  });
  await page.getByRole('button', { name: 'Add to demo directory' }).click();
  await expect(page).toHaveURL(/\/centers\/4\/\d+$/);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('-33.9, -70.6', { exact: true })).toBeVisible();
});

test('dealer scope and session revocation are enforced by APIs', async ({
  page,
  browser,
}, info) => {
  await demo(page, 'dealer');
  await page.goto('/centers');
  await expect(page.getByRole('status')).toHaveText('2 centers found');
  expect((await page.request.get('/api/centers/4/102')).status()).toBe(403);
  expect((await page.request.get('/api/centers/4/101')).status()).toBe(403);
  expect((await page.request.get('/api/live/centers')).status()).toBe(403);
  const own = await (await page.request.get('/api/centers/1/101')).json();
  expect(
    (
      await page.request.patch('/api/centers/4/102', {
        data: { revision: own.revision, profile: own.profile },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(403);
  const other = await browser.newContext();
  try {
    const otherLogin = await other.request.post(`${origin}/api/auth/preview`, {
      data: { role: 'dealer' },
      headers: { Origin: origin },
    });
    expect(otherLogin.ok()).toBe(true);
    await page.goto('/access');
    await expect(
      page.getByRole('heading', { name: 'Access & sessions', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('2 assigned centers').first()).toBeVisible();
    await page.getByRole('button', { name: 'Sign out other sessions' }).click();
    await expect(page.getByRole('status')).toContainText('Other sessions signed out');
    expect((await other.request.get(`${origin}/api/centers`)).status()).toBe(401);
    expect((await page.request.get('/api/centers')).status()).toBe(200);
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath('access-sessions.png'),
      fullPage: true,
      caret: 'initial',
    });
  } finally {
    await other.close();
  }
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  }
  await page.goto('/payments');
  await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible();
  await expect(
    page.getByText('Accounting is waiting for its database to become available.'),
  ).toBeVisible();
  await noOverflow(page);
});
