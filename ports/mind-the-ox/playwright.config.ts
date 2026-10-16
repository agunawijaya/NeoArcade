import { defineConfig, devices } from '@playwright/test';

const PORT = 4178;

/** Screenshot and playtest runs draw every frame; on Windows, let them use the GPU. */
const GPU_ARGS =
  process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    : [];

/**
 * Browser tests for Mind the Ox, kept with the port:
 *
 *   npx playwright test -c ports/mind-the-ox --project=smoke --project=phone
 *   npx playwright test -c ports/mind-the-ox --project='determinism-*'
 *   npx playwright test -c ports/mind-the-ox --project=playtest
 *   npx playwright test -c ports/mind-the-ox --project=screens
 *
 * The game runs from a production build of this page alone (dev/build-page.ts),
 * so another port's work in progress cannot stop these tests. The
 * determinism check runs the engine itself in Chromium, Firefox and WebKit.
 * The art-direction stills of staged scenes run on the dev server instead:
 * see dev/playwright.config.ts.
 */
export default defineConfig({
  testDir: 'e2e',
  // Our own folder: other ports' test runs clean up the shared one at the root.
  outputDir: 'test-results',
  timeout: 120_000,
  fullyParallel: true,
  workers: 3,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/mind-the-ox/`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx tsx ports/mind-the-ox/dev/build-page.ts && npx vite preview --outDir node_modules/.cache/mind-the-ox-page --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://localhost:${PORT}/mind-the-ox/`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: { args: GPU_ARGS },
      },
    },
    {
      name: 'phone',
      testMatch: /game\.spec\.ts$/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 844, height: 390 },
        launchOptions: { args: GPU_ARGS },
      },
    },
    ...(['chromium', 'firefox', 'webkit'] as const).map((browserName) => ({
      name: `determinism-${browserName}`,
      testMatch: /\.determinism\.ts$/,
      use: { browserName },
    })),
    {
      name: 'screens',
      testMatch: /\.screens\.ts$/,
      timeout: 600_000,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: GPU_ARGS } },
    },
    {
      name: 'playtest',
      testMatch: /\.playtest\.ts$/,
      timeout: 900_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 800, height: 500 },
        launchOptions: { args: GPU_ARGS },
      },
    },
  ],
});
