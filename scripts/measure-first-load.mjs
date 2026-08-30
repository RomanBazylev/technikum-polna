import { chromium } from '@playwright/test';

/**
 * Считает, сколько байт уходит по сети при первом заходе на страницу с пустым
 * кешем: HTML, CSS, шрифты и весь JavaScript, который выполняется без
 * взаимодействия. Бюджет - 300 КБ на мобильном интернете, и превышение
 * возвращает ненулевой код, чтобы прогон падал вместе с остальными воротами.
 *
 *   node scripts/measure-first-load.mjs http://localhost:4321/technikum-polna/
 */

const BUDGET_KB = 300;

const ROUTES = [
  '',
  'nauka/',
  'egzaminy/',
  'szkola/',
  'szkola/pierwszy-tydzien/',
  'szkola/zasady/',
  'szkola/prawa-cudzoziemca/',
  'szkola/pieniadze-i-dojazd/',
  'szkola/kalendarz/',
  'szkola/kontakt/',
  'plan/',
  'kalkulatory/',
  'lektury/',
  'zasoby/',
  'warsztat/',
];

const baseUrl = process.argv[2] ?? 'http://localhost:4321/technikum-polna/';

const browser = await chromium.launch();
const rows = [];

for (const route of ROUTES) {
  // Свежий контекст на каждый маршрут: иначе второй заход считался бы по
  // прогретому кешу и показывал бы бюджет, которого у первого гостя нет.
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 412, height: 915 },
  });
  const page = await context.newPage();

  let bytes = 0;
  const byType = new Map();
  page.on('response', async (response) => {
    if (response.status() >= 300) return;
    const buffer = await response.body().catch(() => null);
    if (buffer === null) return;
    bytes += buffer.byteLength;
    const kind = new URL(response.url()).pathname.split('.').pop() ?? 'other';
    byType.set(kind, (byType.get(kind) ?? 0) + buffer.byteLength);
  });

  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  rows.push({
    route: route === '' ? '/' : `/${route}`,
    kb: Number((bytes / 1024).toFixed(1)),
    top: [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([kind, size]) => `${kind} ${(size / 1024).toFixed(0)}`)
      .join(' '),
  });

  await context.close();
}

await browser.close();

console.log('route'.padEnd(16), 'first load'.padStart(11), '  breakdown (kB)');
let over = 0;
for (const row of rows) {
  const flag = row.kb > BUDGET_KB ? ' OVER BUDGET' : '';
  if (row.kb > BUDGET_KB) over += 1;
  console.log(row.route.padEnd(16), `${row.kb} kB`.padStart(11), ` ${row.top}${flag}`);
}
console.log(`\nbudget ${BUDGET_KB} kB, over: ${over}`);
process.exit(over === 0 ? 0 : 1);
