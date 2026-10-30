import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const shortManifest = { app: { name: 'Clip', tagline: 'A very short demo', theme: { primary: '#0f766e' } }, mock: { seed: 'clip', baseDate: '2025-01-15' } };

test('records the demo to a real WebM file', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/short.json', (route) => route.fulfill({ json: shortManifest }));
  await page.goto('/?manifest=short.json&tab=scenarios');
  await page.getByRole('button', { name: 'Generate demo' }).click();
  await page.getByRole('button', { name: 'Download video (WebM)' }).click({ timeout: 15_000 });
  await expect(page.getByRole('status')).toContainText('Recording');
  const download = await page.waitForEvent('download', { timeout: 30_000 });
  expect(download.suggestedFilename()).toBe('clip-demo.webm');
  const file = readFileSync(await download.path());
  expect([...file.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  expect(file.length).toBeGreaterThan(5_000);
});

test('downloads the one-pager from the overview', async ({ page }) => {
  await page.goto('/');
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF' }).click()]);
  expect(pdf.suggestedFilename()).toBe('invoiceflow.pdf');
  expect(readFileSync(await pdf.path()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('downloads records as CSV', async ({ page }) => {
  await page.goto('/?tab=data');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()]);
  expect(csv.suggestedFilename()).toBe('customer.csv');
  expect(readFileSync(await csv.path(), 'utf8').split('\r\n')[0]).toBe('id,company,contact,email,country,since');
});

test('iframe hosts receive resize and analytics messages', async ({ page }) => {
  await page.goto('/');
  const messages = await page.evaluate(() => new Promise<string[]>((resolve) => {
    const seen: string[] = [];
    addEventListener('message', (event) => {
      seen.push(event.data.type === 'app-lens:event' ? event.data.event.type : event.data.type);
      if (seen.includes('tab_viewed') && seen.includes('app-lens:resize')) resolve(seen);
    });
    const frame = document.createElement('iframe');
    frame.src = '/?embed=1';
    document.body.append(frame);
  }));
  expect(messages).toEqual(expect.arrayContaining(['tab_viewed', 'app-lens:resize']));
});
