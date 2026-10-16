import { defineConfig, devices } from '@playwright/test';

const PORT = 5291;

/** Windows screenshot runs draw every frame; let them use the GPU. */
const GPU_ARGS =
  process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    : [];

/**
 * The hero frames: staged moments rendered by dev/hero.html, which exists
 * only on the dev server, so this runs against `vite`, not the build.
 *
 *   npx playwright test -c ports/mind-the-ox/dev
 *   HERO_SIZES=1440x900,844x390 npx playwright test -c ports/mind-the-ox/dev
 */
export default defineConfig({
  testDir: '.',
  testMatch: /\.screens\.ts$/,
  outputDir: 'test-results',
  timeout: 120_000,
  fullyParallel: true,
  workers: 3,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}/`,
    launchOptions: { args: GPU_ARGS },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: '../../..',
    url: `http://localhost:${PORT}/hall/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
