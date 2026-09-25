import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Browser tests for Skyline Showdown, kept with the port:
 *
 *   npx playwright test -c ports/skyline-showdown --project=smoke
 *   npx playwright test -c ports/skyline-showdown --project=screens
 *   npx playwright test -c ports/skyline-showdown --project=playtest
 *
 * They run against the production build, like the Hall's.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: true,
  // Each test renders every frame of a match; more than a few at once starves them all.
  workers: 3,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/skyline-showdown/`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'screens',
      testMatch: /\.screens\.ts$/,
      timeout: 300_000,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'playtest',
      testMatch: /\.playtest\.ts$/,
      timeout: 900_000,
      // Every frame is rendered while game time is stepped; a small window keeps that quick.
      use: { ...devices['Desktop Chrome'], viewport: { width: 800, height: 450 } },
    },
  ],
});
