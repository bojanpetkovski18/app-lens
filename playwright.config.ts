import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4410' },
  webServer: [
    {
      command: 'node packages/cli/dist/cli.js preview apps/viewer/dist --port 4410',
      url: 'http://127.0.0.1:4410',
      reuseExistingServer: false,
    },
    {
      command: 'node e2e/serve-site.mjs',
      url: 'http://127.0.0.1:4411',
      reuseExistingServer: false,
    },
  ],
});
