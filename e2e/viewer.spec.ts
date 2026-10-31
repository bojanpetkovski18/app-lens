import { expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.beforeEach(({ page }, testInfo) => {
  page.on('pageerror', (error) => testInfo.attach('pageerror', { body: error.message }));
});

test('switches samples and filters by persona', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('InvoiceFlow');
  await page.selectOption('.al-picker select', { label: 'TaskPilot' });
  await expect(page.locator('h1')).toHaveText('TaskPilot');
  await page.getByRole('group', { name: 'View as persona' }).getByRole('button', { name: 'Team lead' }).click();
  await page.getByRole('tab', { name: /Features/ }).click();
  await expect(page.getByText(/Showing \d+ of 5 features/)).toBeVisible();
  await page.getByRole('button', { name: 'Who gets what' }).click();
  await expect(page.locator('table.al-matrix')).toBeVisible();
});

test('searches data and follows a reference', async ({ page }) => {
  await page.goto('/?tab=data');
  await page.getByRole('navigation', { name: 'Data types' }).getByRole('button', { name: /Invoice/ }).click();
  await page.getByRole('searchbox').fill('INV-0001');
  await expect(page.locator('table.al-table tbody tr')).toHaveCount(1);
  await page.locator('table.al-table tbody tr').first().click();
  const details = page.getByRole('complementary', { name: 'Record details' });
  await details.locator('.al-link').click();
  await expect(page.getByRole('navigation', { name: 'Data types' }).locator('[aria-current=true]')).toContainText('Customer');
  await expect(page.getByRole('searchbox')).toHaveValue('');
});

test('generates the demo and seeks with the keyboard', async ({ page }) => {
  await page.goto('/?tab=scenarios');
  await page.getByRole('button', { name: 'Generate demo' }).click();
  await expect(page.locator('.al-video')).toBeVisible({ timeout: 10_000 });
  await page.locator('.al-video').focus();
  await page.keyboard.press('k');
  const before = await page.locator('.al-video-controls .al-num').textContent();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.al-video-controls .al-num')).not.toHaveText(before ?? '');
});

test('embed mode hides the top bar and applies URL theming', async ({ page }) => {
  await page.goto('/?embed=1&theme=dark&tab=features');
  await expect(page.locator('.al-root')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.al-topbar')).toHaveCount(0);
  await expect(page.getByRole('tab', { selected: true })).toContainText('Features');
});

test('an attached project does not leave a dead link in the address bar', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'app-lens-link-'));
  const project = join(dir, 'link-project');
  mkdirSync(project);
  writeFileSync(join(project, 'package.json'), '{"name":"picked-folder"}');
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Attach project' }).click();
    await page.getByRole('dialog').locator('input[type=file]').setInputFiles(project);
    await expect(page.locator('h1')).toHaveText('Picked folder');
    await page.selectOption('.al-picker select', { label: 'TaskPilot' });
    await page.selectOption('.al-picker select', { label: 'link-project' });
    await expect(page.locator('h1')).toHaveText('Picked folder');
    await page.reload();
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
