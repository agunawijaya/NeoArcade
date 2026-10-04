import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/** Screenshot and playtest runs draw every frame; on Windows, let them use the GPU. */
const GPU_ARGS =
  process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    : [];

/**
 * Browser tests for Long Haul, kept with the port:
 *
 *   npx playwright test -c ports/long-haul --project=smoke --project=phone
 *   npx playwright test -c ports/long-haul --project='determinism-*'
 *   npx playwright test -c ports/long-haul --project=screens
 *   npx playwright test -c ports/long-haul --project=playtest
 *
 * The game runs from the production build, like the Hall's tests. The
 * determinism check runs the engine itself in Chromium, Firefox and WebKit.
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 120_000,
  fullyParallel: true,
  workers: 3,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/long-haul/`,
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
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'phone',
      testMatch: /game\.spec\.ts$/,
      use: { ...devices['Pixel 7'], viewport: { width: 844, height: 390 } },
    },
    ...(['chromium', 'firefox', 'webkit'] as const).map((browserName) => ({
      name: `determinism-${browserName}`,
      testMatch: /\.determinism\.ts$/,
      use: { browserName },
    })),
    {
      name: 'screens',
      testMatch: /\.screens\.ts$/,
      timeout: 900_000,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: GPU_ARGS } },
    },
    {
      name: 'playtest',
      testMatch: /\.playtest\.ts$/,
      timeout: 1_800_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 960, height: 600 },
        launchOptions: { args: GPU_ARGS },
      },
    },
  ],
});
