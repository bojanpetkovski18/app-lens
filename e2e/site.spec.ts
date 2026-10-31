import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:4411' });

test('a built site runs under its content security policy', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto('/');
  await expect(page).toHaveTitle('TaskPilot · AppLens');
  await expect(page.locator('h1')).toHaveText('TaskPilot');
  await page.getByRole('tab', { name: /Data/ }).click();
  await expect(page.locator('table.al-table tbody tr').first()).toBeVisible();
  expect(violations).toEqual([]);
});

test('a pinned site ignores ?manifest= so links cannot spoof its content', async ({ page }) => {
  let requested = false;
  await page.route('https://evil.example/**', (route) => {
    requested = true;
    return route.abort();
  });
  await page.goto('/?manifest=https://evil.example/fake.json');
  await expect(page.locator('h1')).toHaveText('TaskPilot');
  expect(requested).toBe(false);
});

test('the web component finds inline JSON when its script loads first', async ({ page }) => {
  await page.goto('/embed.html');
  await expect(page.locator('#inline').getByText('InlineApp')).toBeVisible();
  await expect(page.locator('#inline').getByText('Inline feature')).toBeVisible();
  await expect(page.locator('#remote').getByRole('heading', { level: 1 })).toHaveText('TaskPilot');
});

test('instances share one stylesheet and stay styled', async ({ page }) => {
  await page.goto('/embed.html');
  await expect(page.locator('#remote').getByRole('heading', { level: 1 })).toBeVisible();
  const sheets = await page.evaluate(() => {
    const [a, b] = [...document.querySelectorAll('app-lens')].map((el) => el.shadowRoot?.adoptedStyleSheets[0]);
    return { same: !!a && a === b, rules: a?.cssRules.length ?? 0 };
  });
  expect(sheets.same).toBe(true);
  expect(sheets.rules).toBeGreaterThan(50);
});

test('fullscreen is detected inside the shadow root', async ({ page }) => {
  await page.goto('/embed.html');
  const remote = page.locator('#remote');
  await remote.getByRole('tab', { name: /Walkthroughs/ }).click();
  await remote.getByRole('button', { name: 'Generate demo' }).click();
  await expect(remote.getByRole('region', { name: 'Product demo video' })).toBeVisible({ timeout: 10_000 });
  await remote.getByRole('button', { name: 'Fullscreen' }).click();
  await expect(remote.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
});
