// The polish audit from docs/AUDIT.md: every screen, overlay and error state, at each width and theme.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [320, 375, 768, 1280];
const THEMES = ['light', 'dark'] as const;
const VIEWER = 'http://127.0.0.1:4410';
const STUDIO = 'http://127.0.0.1:4412';
const SITE = 'http://127.0.0.1:4411';
const STUDIO_WITH_FILE = 'http://127.0.0.1:4413';

interface Screen {
  name: string;
  open: (page: Page, theme: string) => Promise<unknown>;
  /** Studio's chrome is always light, so it only needs one pass. */
  lightOnly?: boolean;
}

const viewerTab = (tab: string) => (page: Page, theme: string) => page.goto(`${VIEWER}/?tab=${tab}&theme=${theme}`);

const SCREENS: Screen[] = [
  { name: 'viewer overview', open: viewerTab('overview') },
  { name: 'viewer features', open: viewerTab('features') },
  {
    name: 'viewer feature matrix',
    open: async (page, theme) => {
      await viewerTab('features')(page, theme);
      await page.getByRole('button', { name: 'Who gets what' }).click();
    },
  },
  { name: 'viewer data', open: viewerTab('data') },
  {
    name: 'viewer record details',
    open: async (page, theme) => {
      await viewerTab('data')(page, theme);
      await page.locator('table.al-table tbody tr').first().click();
      await expect(page.getByRole('complementary', { name: 'Record details' })).toBeVisible();
    },
  },
  {
    name: 'viewer empty search',
    open: async (page, theme) => {
      await viewerTab('data')(page, theme);
      await page.getByRole('searchbox').fill('nothing matches this');
    },
  },
  { name: 'viewer walkthroughs', open: viewerTab('scenarios') },
  {
    name: 'viewer walkthrough in progress',
    open: async (page, theme) => {
      await viewerTab('scenarios')(page, theme);
      await page.getByRole('button', { name: /Send an invoice/ }).click();
      await page.getByRole('button', { name: 'Next' }).click();
      await page.getByRole('button', { name: 'Next' }).click();
    },
  },
  {
    name: 'viewer generated demo',
    open: async (page, theme) => {
      // Reduced motion, so contrast is measured on settled text and not halfway through a fade.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await viewerTab('scenarios')(page, theme);
      await page.getByRole('button', { name: 'Generate demo' }).click();
      await expect(page.getByRole('region', { name: 'Product demo video' })).toBeVisible({ timeout: 15_000 });
    },
  },
  {
    name: 'viewer in embedded mode',
    open: (page, theme) => page.goto(`${VIEWER}/?embed=1&theme=${theme}`),
  },
  {
    name: 'viewer failed fetch',
    open: async (page, theme) => {
      await page.route('**/missing.json', (route) => route.fulfill({ status: 404, body: 'gone' }));
      await page.goto(`${VIEWER}/?manifest=/missing.json&theme=${theme}`);
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  {
    name: 'viewer attach dialog',
    open: async (page, theme) => {
      await viewerTab('overview')(page, theme);
      await page.getByRole('button', { name: 'Attach project' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  {
    name: 'viewer invalid manifest',
    open: async (page, theme) => {
      await page.route('**/broken.json', (route) => route.fulfill({ json: { app: {} } }));
      await page.goto(`${VIEWER}/?manifest=/broken.json&theme=${theme}`);
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  {
    name: 'built site',
    open: async (page, theme) => {
      await page.goto(`${SITE}/?theme=${theme}`);
      await expect(page.locator('h1')).toBeVisible();
    },
  },
  {
    name: 'web component',
    open: async (page) => {
      await page.goto(`${SITE}/embed.html`);
      await expect(page.getByText('Inline feature')).toBeVisible();
    },
  },
  { name: 'studio form', lightOnly: true, open: (page) => page.goto(STUDIO) },
  {
    name: 'studio saving a file',
    lightOnly: true,
    open: async (page) => {
      // The response is mocked because studio.spec reads this file, and tests run in parallel.
      await page.route('**/__app-lens/manifest', (route) =>
        route.request().method() === 'PUT'
          ? route.fulfill({ json: { saved: '/home/someone/projects/a-rather-long-folder-name/another-long-folder-name/app-lens.json' } })
          : route.fallback());
      await page.goto(STUDIO_WITH_FILE);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText(/^Saved /)).toBeVisible();
    },
  },
  {
    name: 'studio form sections open',
    lightOnly: true,
    open: async (page) => {
      await page.goto(STUDIO);
      await page.locator('details:not([open]) > summary').evaluateAll((items) => items.forEach((item) => (item as HTMLElement).click()));
    },
  },
  {
    name: 'studio json',
    lightOnly: true,
    open: async (page) => {
      await page.goto(STUDIO);
      await page.getByRole('button', { name: 'JSON' }).click();
    },
  },
  {
    name: 'studio problems',
    lightOnly: true,
    open: async (page) => {
      await page.goto(STUDIO);
      await page.getByRole('button', { name: 'JSON' }).click();
      await page.getByRole('textbox', { name: 'Manifest JSON' }).fill('{"app":{}}');
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  {
    name: 'studio broken json',
    lightOnly: true,
    open: async (page) => {
      await page.goto(STUDIO);
      await page.getByRole('button', { name: 'JSON' }).click();
      await page.getByRole('textbox', { name: 'Manifest JSON' }).fill('{ broken');
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  {
    name: 'studio attach dialog',
    lightOnly: true,
    open: async (page) => {
      await page.goto(STUDIO);
      await page.getByRole('button', { name: 'Attach project' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  {
    name: 'studio ai dialog with error',
    lightOnly: true,
    open: async (page) => {
      await page.route('**/__app-lens/draft', (route) => route.fulfill({ status: 400, json: { error: 'Set ANTHROPIC_API_KEY first.' } }));
      await page.goto(STUDIO);
      await page.getByRole('button', { name: 'Draft with AI' }).click();
      await page.getByRole('textbox', { name: 'Source text' }).fill('# Notes');
      await page.getByRole('button', { name: 'Draft manifest' }).click();
      await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    },
  },
  {
    name: 'studio draft review',
    lightOnly: true,
    open: async (page) => {
      await page.route('**/__app-lens/draft', (route) =>
        route.fulfill({ json: { manifest: { app: { name: 'Drafted' }, features: [{ id: 'one', title: 'One' }] } } }));
      await page.goto(STUDIO);
      await page.getByRole('button', { name: 'Draft with AI' }).click();
      await page.getByRole('textbox', { name: 'Source text' }).fill('# Notes');
      await page.getByRole('button', { name: 'Draft manifest' }).click();
      await expect(page.getByRole('region', { name: 'Review draft' })).toBeVisible();
    },
  },
];

for (const screen of SCREENS) {
  for (const theme of screen.lightOnly ? ['light'] : THEMES) {
    for (const width of WIDTHS) {
      test(`${screen.name}, ${theme}, ${width}px`, async ({ page }) => {
        const problems: string[] = [];
        page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
        page.on('console', (message) => {
          if (message.type() === 'error' && !/status of 40[04]/.test(message.text())) problems.push(`console: ${message.text()}`);
        });

        await page.setViewportSize({ width, height: 800 });
        await screen.open(page, theme);
        await page.waitForTimeout(350);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 0) problems.push(`scrolls sideways by ${overflow}px`);

        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        for (const violation of violations) {
          for (const node of violation.nodes) problems.push(`axe ${violation.id}: ${node.target.join(' ')}`);
        }

        expect(problems).toEqual([]);
      });
    }
  }
}

for (const [name, url, opener] of [
  ['viewer attach', VIEWER, 'Attach project'],
  ['studio attach', STUDIO, 'Attach project'],
  ['studio AI', STUDIO, 'Draft with AI'],
] as const) {
  test(`${name} dialog works from the keyboard`, async ({ page }) => {
    await page.goto(url);
    const button = page.getByRole('button', { name: opener });
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const inDialog = () => page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')));
    await expect.poll(inDialog).toBe(true);

    for (let press = 0; press < 25; press++) {
      await page.keyboard.press(press % 5 === 4 ? 'Shift+Tab' : 'Tab');
      expect(await inDialog()).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
  });
}

test('typing in the Studio AI dialog keeps focus in the field', async ({ page }) => {
  await page.goto(STUDIO);
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  const source = page.getByRole('textbox', { name: 'Source text' });
  await source.focus();
  await page.keyboard.type('# Notes');
  await expect(source).toHaveValue('# Notes');
  await expect(source).toBeFocused();
});

test('a strict content security policy sees no violations', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await page.goto(SITE);
  await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
});
