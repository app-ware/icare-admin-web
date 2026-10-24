import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:3101',
  headers = { Origin: origin };
const path = (key: string, center = 101, type = 1) => `/api/center-users/${type}/${center}/${key}`;
const update = (user: any, changes: Record<string, unknown> = {}) => ({
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  active: user.active,
  revision: user.revision,
  ...changes,
});
test('center user profiles and secure sign-in are scoped, reviewed and conflict safe', async ({
  page,
  browser,
}, info) => {
  await page.goto('/login');
  await page.getByLabel('Demo role').selectOption('dealer');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
  await page.goto('/users?centerId=101&centerType=1');
  await expect(page.getByRole('heading', { name: 'Center users', exact: true })).toBeVisible();
  await expect(page.locator('.user-card')).toHaveCount(4);
  expect(await page.locator('.user-legacy-note').count()).toBe(0);
  const staff = await (await page.request.get(path('l_2'))).json();
  const local = await (await page.request.get(path('l_3'))).json();
  page.on('dialog', (dialog) => void dialog.accept());
  try {
    await page.getByRole('textbox', { name: 'Search center users', exact: true }).fill('sam');
    await expect(page.locator('.user-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Manage user Sam River', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('textbox', { name: 'First name', exact: true })).toHaveValue(
      'Sam',
    );
    expect(await dialog.locator('input[type=password]').count()).toBe(0);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const concurrent = await page.request.patch(path('l_2'), {
      headers,
      data: update(staff, { lastName: 'Updated elsewhere' }),
    });
    expect(concurrent.status()).toBe(200);
    await dialog
      .getByRole('textbox', { name: 'First name', exact: true })
      .fill(`Sam ${info.project.name}`);
    await dialog.getByRole('button', { name: 'Review changes', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save user changes', exact: true }).click();
    await expect(
      dialog.getByText('This user changed. Reload the latest account before saving.', {
        exact: false,
      }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Reload current user', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Last name', exact: true })).toHaveValue(
      'Updated elsewhere',
    );
    await dialog
      .getByRole('textbox', { name: 'First name', exact: true })
      .fill(`Sam ${info.project.name}`);
    await dialog.getByRole('combobox', { name: /^Secure sign-in/ }).selectOption('disabled');
    await dialog.getByRole('button', { name: 'Review changes', exact: true }).click();
    await expect(
      dialog.getByText('This changes database-backed secure sign-in.', { exact: false }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Save user changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    let saved = await (await page.request.get(path('l_2'))).json();
    expect(saved.active).toBe(false);
    expect(saved.username).toBe(staff.username);
    expect(saved.roles).toEqual(staff.roles);
    await page.getByRole('textbox', { name: 'Search center users', exact: true }).fill('');
    await expect(page.locator('.user-card')).toHaveCount(4);
    await page.getByRole('button', { name: 'Manage user Taylor Reed', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: /^Secure sign-in/ }).selectOption('disabled');
    await dialog.getByRole('button', { name: 'Review changes', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save user changes', exact: true }).click();
    await expect(
      dialog.getByText('Keep at least one enabled, linked center administrator.', { exact: false }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'View user cedar.unlinked', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Mapping review required', { exact: false })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'First name', exact: true })).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Review changes', exact: true }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Close details', exact: true }).click();
    await page.getByRole('button', { name: 'Manage user Casey Lane', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('combobox', { name: /^Secure sign-in/ })).toBeDisabled();
    await dialog.getByRole('textbox', { name: 'Last name', exact: true }).fill('Profile only');
    await dialog.getByRole('button', { name: 'Review changes', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save user changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await (await page.request.get(path('l_3'))).json()).active).toBeNull();
    saved = await (await page.request.get(path('l_2'))).json();
    for (const extra of [
      { password: 'Not-Accepted-123' },
      { username: 'changed' },
      { isAdmin: true },
    ])
      expect(
        (
          await page.request.patch(path('l_2'), { headers, data: { ...update(saved), ...extra } })
        ).status(),
      ).toBe(422);
    expect(
      (
        await page.request.patch(path('l_2'), {
          headers: { Origin: 'https://other.example' },
          data: update(saved),
        })
      ).status(),
    ).toBe(403);
    expect((await page.request.post('/api/center-users', { headers, data: {} })).status()).toBe(
      405,
    );
    expect((await page.request.get('/api/center-users?centerId=102&centerType=4')).status()).toBe(
      403,
    );
    expect((await page.request.get(path('l_1', 102, 4))).status()).toBe(403);
    const ownOther = await (await page.request.get(path('l_1', 103))).json();
    expect(ownOther.username).toBe('olive.admin');
    await page.getByRole('button', { name: 'Change center', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByRole('textbox', { name: 'Search centers for users', exact: true })
      .fill('Horizon');
    await expect(dialog.getByText('No accessible centers match your search.')).toBeVisible();
    await dialog
      .getByRole('textbox', { name: 'Search centers for users', exact: true })
      .fill('Olive');
    await dialog.getByRole('button', { name: 'Choose Olive Grove Nursery', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Manage user Avery Wren', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.user-card')).toHaveCount(1);
    const admin = await browser.newContext({ baseURL: origin });
    try {
      await admin.request.post('/api/auth/preview', { headers, data: { role: 'admin' } });
      const school = await admin.request.get(path('l_1', 102, 4));
      expect(school.status()).toBe(200);
      expect((await school.json()).username).toBe('horizon.admin');
    } finally {
      await admin.close();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: info.outputPath('center-users.png'),
      fullPage: true,
      caret: 'initial',
    });
  } finally {
    for (const [key, original] of [
      ['l_2', staff],
      ['l_3', local],
    ] as const) {
      const latest = await (await page.request.get(path(key))).json();
      expect(
        (
          await page.request.patch(path(key), {
            headers,
            data: update(original, { revision: latest.revision }),
          })
        ).status(),
      ).toBe(200);
    }
  }
});
