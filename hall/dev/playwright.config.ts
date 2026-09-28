import { defineConfig, devices } from '@playwright/test';

const PORT = 5288;

/**
 * Screenshots of every Arcade Pass state, driven through the Pass Lab. The
 * Lab only exists on the dev server, so unlike the Hall's own browser tests
 * these run against `vite`, not the production build:
 *
 *   npx playwright test -c hall/dev
 *   SCREENSHOT_DIR=somewhere PASS_SHOTS=pass-mid,toast npx playwright test -c hall/dev
 */
export default defineConfig({
  testDir: '.',
  testMatch: /\.screens\.ts$/,
  timeout: 90_000,
  fullyParallel: true,
  workers: 4,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}/`,
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://localhost:${PORT}/hall/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
