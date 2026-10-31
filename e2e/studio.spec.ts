import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ baseURL: 'http://127.0.0.1:4412' });

test('form edits update the live preview and keep its tab', async ({ page }) => {
  await page.goto('/');
  const preview = page.getByRole('region', { name: 'Live preview' });
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText('My App');
  await preview.getByRole('tab', { name: /Data/ }).click();
  await page.getByRole('textbox', { name: 'Name' }).first().fill('Renamed App');
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Renamed App');
  await expect(preview.getByRole('tab', { name: /Data/ })).toHaveAttribute('aria-selected', 'true');
});

test('invalid JSON keeps the last preview and shows the problem', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'JSON' }).click();
  await page.getByRole('textbox', { name: 'Manifest JSON' }).fill('{ broken');
  await expect(page.getByRole('alert')).toContainText('problem');
  await expect(page.getByRole('region', { name: 'Live preview' }).getByRole('heading', { level: 1 })).toHaveText('My App');
  await expect(page.getByRole('button', { name: 'Form' })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('clicking a problem jumps to it in the JSON', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'JSON' }).click();
  const editor = page.getByRole('textbox', { name: 'Manifest JSON' });
  await editor.fill(JSON.stringify({ app: { name: 'A' }, features: [{ id: 'ok', title: 'T' }, { id: 'BAD ID', title: 'T' }] }, null, 2));
  await page.getByRole('button', { name: 'features[1].id' }).click();
  const position = await editor.evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionStart + 20));
  expect(position).toContain('"id": "BAD ID"');
});

test('adding a data type shows up in the preview', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Data types').first().click();
  await page.getByRole('button', { name: 'Add data type' }).click();
  await page.getByRole('region', { name: 'Live preview' }).getByRole('tab', { name: /Data/ }).click();
  await expect(page.getByRole('region', { name: 'Live preview' }).getByRole('button', { name: /Thing/ })).toBeVisible();
});

test('drafts wait for review before they change anything', async ({ page }) => {
  await page.route('**/__app-lens/draft', (route) => route.fulfill({ json: { manifest: { app: { name: 'From Claude' } }, repairs: 0 } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  await page.getByRole('textbox', { name: 'Source text' }).fill('# A readme');
  await page.getByRole('button', { name: 'Draft manifest' }).click();
  const review = page.getByRole('region', { name: 'Review draft' });
  await expect(review).toContainText('changed app: From Claude');
  await expect(page.getByRole('region', { name: 'Live preview' }).getByRole('heading', { level: 1 })).toHaveText('My App');
  await review.getByRole('button', { name: 'Apply draft' }).click();
  await expect(page.getByRole('region', { name: 'Live preview' }).getByRole('heading', { level: 1 })).toHaveText('From Claude');
});

test('explains that AI needs an API key when the server says so', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  await page.getByRole('textbox', { name: 'Source text' }).fill('# A readme');
  await page.route('**/__app-lens/draft', (route) => route.fulfill({ status: 422, json: { error: 'AI drafting needs Claude API access. Set ANTHROPIC_API_KEY.' } }));
  await page.getByRole('button', { name: 'Draft manifest' }).click();
  await expect(page.getByRole('alert')).toContainText('ANTHROPIC_API_KEY');
});

test('renaming a field keeps focus while typing', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Data types').first().click();
  const field = page.getByRole('textbox', { name: 'Field name' }).first();
  await field.click();
  await field.press('End');
  await page.keyboard.type('Xyz');
  await expect(page.getByRole('textbox', { name: 'Field name' }).first()).toHaveValue('companyXyz');
  await expect(page.getByRole('textbox', { name: 'Field name' }).first()).toBeFocused();
});

test('a draft survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Name' }).first().fill('Kept');
  await expect(page.getByRole('region', { name: 'Live preview' }).getByRole('heading', { level: 1 })).toHaveText('Kept');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Name' }).first()).toHaveValue('Kept');
});

test('opens a file and saves changes back to it', async ({ page }) => {
  await page.goto('http://127.0.0.1:4413/');
  const name = page.getByRole('textbox', { name: 'Name' }).first();
  await expect(name).toHaveValue('TaskPilot');
  await name.fill('TaskPilot Saved');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  const saved = JSON.parse(readFileSync('dist/e2e-opened.json', 'utf8'));
  expect(saved.app.name).toBe('TaskPilot Saved');
});
