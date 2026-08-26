#!/usr/bin/env node
import { generateSW } from 'workbox-build';
import process from 'node:process';

/**
 * Сервис-воркер собирается отдельным шагом после astro build и pagefind,
 * а не плагином Vite. Причина простая: плагин запускается внутри сборки Astro
 * и до финального содержимого dist не добирается, из-за чего воркер молча не
 * появлялся. Отдельный шаг работает по готовой папке и виден в логе.
 */

const BASE = '/technikum-polna/';

const { count, size, warnings } = await generateSW({
  globDirectory: 'dist',
  globPatterns: ['**/*.{html,css,js,svg,woff2,webmanifest}'],
  // WebAssembly песочниц грузится с jsDelivr по требованию, индекс поиска
  // тянется частями. Ни то ни другое не должно попадать в предзагрузку:
  // иначе первый визит с мобильного интернета стоил бы мегабайты.
  globIgnores: ['**/*.wasm', 'pagefind/**'],
  swDest: 'dist/sw.js',
  modifyURLPrefix: { '': BASE },
  navigateFallback: `${BASE}index.html`,
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: false,
  // Карты исходников workbox весят больше самого воркера и в продакшене
  // не нужны никому.
  sourcemap: false,
});

for (const warning of warnings) console.warn(`ПРЕДУПРЕЖДЕНИЕ  ${warning}`);

const kilobytes = Math.round(size / 1024);
console.log(`Service worker собран: файлов ${count}, объём предзагрузки ${kilobytes} КБ.`);

if (kilobytes > 900) {
  console.error('Предзагрузка слишком тяжёлая для мобильного интернета.');
  process.exit(1);
}
