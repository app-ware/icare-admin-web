import { defineConfig, devices } from '@playwright/test';
const channel =
  process.env.ICARE_E2E_BROWSER_CHANNEL || (process.platform === 'darwin' ? 'chrome' : 'msedge');
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3101', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', channel },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs --port 3101',
    url: 'http://127.0.0.1:3101/api/health',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      ICARE_NEXT_DIST_DIR: '.next-e2e',
      ICARE_STORAGE_PATH: '.local/e2e-portal.sqlite',
      ICARE_LIVE_DATA_ENABLED: 'false',
      ICARE_APP_ORIGIN: 'http://127.0.0.1:3101',
    },
  },
});
