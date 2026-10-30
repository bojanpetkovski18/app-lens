import { expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('drafts a showcase from a folder without leaving the browser', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'app-lens-attach-'));
  const project = join(dir, 'demo-project');
  mkdirSync(join(project, 'src/pages'), { recursive: true });
  writeFileSync(join(project, 'package.json'), '{"name":"picked-folder","description":"Drafted in the browser"}');
  writeFileSync(join(project, '.env'), 'SECRET=never-read');
  writeFileSync(join(project, 'src/pages/reports.tsx'), 'export default null;');

  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/');
  await page.getByRole('button', { name: 'Attach project' }).click();
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles(project);
  await expect(page.locator('h1')).toHaveText('Picked folder');
  await page.getByRole('tab', { name: /Features/ }).click();
  await expect(page.getByText('Reports')).toBeVisible();
  expect(requests.some((url) => /attach/.test(url))).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});

test('a static viewer points to the CLI for links and sites', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Attach project' }).click();
  await page.getByRole('button', { name: 'Website URL' }).click();
  await page.getByRole('textbox').fill('www.example.com');
  await page.getByRole('button', { name: 'Draft manifest' }).click();
  await expect(page.getByRole('alert')).toContainText('app-lens attach www.example.com');
});

test('Escape closes the dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Attach project' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
