import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, devices } from '@playwright/test';

/**
 * Снимает каждый экран на телефоне и на десктопе в .pw-shots/<label>/.
 * Адрес и метка задаются аргументами, поэтому один и тот же прогон делает
 * и «до» на живом сайте, и «после» на локальном превью:
 *
 *   node scripts/audit-ui.mjs before https://romanbazylev.github.io/technikum-polna/
 *   node scripts/audit-ui.mjs after  http://localhost:4321/technikum-polna/
 */

const ROUTES = [
  '',
  'nauka/',
  'egzaminy/',
  'szkola/',
  'plan/',
  'kalkulatory/',
  'lektury/',
  'zasoby/',
  'warsztat/',
];

const VIEWPORTS = [
  { name: 'phone', options: { ...devices['Pixel 7'], colorScheme: 'dark' } },
  { name: 'phonelight', options: { ...devices['Pixel 7'], colorScheme: 'light' } },
  { name: 'desktop', options: { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' } },
];

const label = process.argv[2] ?? 'before';
const baseUrl = process.argv[3] ?? 'https://romanbazylev.github.io/technikum-polna/';

const outDir = new URL(`../.pw-shots/${label}/`, import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const report = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext(viewport.options);
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  for (const route of ROUTES) {
    const slug = route === '' ? 'home' : route.replace(/\/$/, '').replace(/\//g, '-');
    consoleErrors.length = 0;
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    const above = await page.screenshot();
    await writeFile(new URL(`${viewport.name}-${slug}-fold.png`, outDir), above);
    const full = await page.screenshot({ fullPage: true });
    await writeFile(new URL(`${viewport.name}-${slug}-full.png`, outDir), full);

    const metrics = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        title: document.title,
        heading: document.querySelector('h1')?.textContent?.trim() ?? null,
        wordsAboveFold: text.slice(0, 900).split(/\s+/).filter(Boolean).length,
        totalWords: text.split(/\s+/).filter(Boolean).length,
        interactive: document.querySelectorAll(
          'button, a[href], input, select, textarea, summary',
        ).length,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });

    report.push({
      viewport: viewport.name,
      route: route === '' ? '/' : `/${route}`,
      ...metrics,
      viewportHeight: page.viewportSize()?.height ?? 0,
      screensToScroll: Number(
        (metrics.scrollHeight / (page.viewportSize()?.height ?? 1)).toFixed(1),
      ),
      consoleErrors: [...consoleErrors],
    });
  }

  await context.close();
}

await browser.close();
await writeFile(new URL('report.json', outDir), JSON.stringify(report, null, 2));

const phone = report.filter((row) => row.viewport === 'phone');
console.log(`\n${label} @ ${baseUrl}\n`);
console.log('route'.padEnd(16), 'words', 'links', 'screens', 'errors');
for (const row of phone) {
  console.log(
    row.route.padEnd(16),
    String(row.totalWords).padStart(5),
    String(row.interactive).padStart(5),
    String(row.screensToScroll).padStart(7),
    String(row.consoleErrors.length).padStart(6),
  );
}
