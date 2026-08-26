import { defineConfig, devices } from '@playwright/test';

/**
 * По умолчанию проверяем живой адрес на GitHub Pages, а не localhost.
 * Именно так ловится поломка проектного сайта под подпутём: локально стили
 * находятся всегда, а в продакшене отваливаются.
 */
const baseURL =
  process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://romanbazylev.github.io/technikum-polna/';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
