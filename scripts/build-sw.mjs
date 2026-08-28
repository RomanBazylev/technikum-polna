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
  // Движок SQLite не предзагружается, но кэшируется после первого запуска
  // песочницы, чтобы второй заход работал офлайн и без повторной оплаты
  // мегабайтов мобильного трафика.
  runtimeCaching: [
    {
      urlPattern: /\.wasm$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'wasm-on-demand',
        expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 90 },
      },
    },
    // Движок PHP приезжает с jsDelivr, и без его обвязки закешированный wasm
    // бесполезен: во второй заход песочница всё равно пошла бы в сеть за
    // мегабайтами. Правило стоит после wasm, чтобы сам бинарник остался
    // в своём кэше со своим сроком жизни.
    {
      urlPattern: /^https:\/\/cdn\.jsdelivr\.net\//,
      handler: 'CacheFirst',
      options: {
        cacheName: 'php-engine-on-demand',
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
      },
    },
  ],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  // Новая версия применяется сразу, а не ждёт закрытия всех вкладок.
  // С режимом ожидания посетитель залипал на той версии, которую увидел
  // первый раз, и сайт выглядел мёртвым, хотя обновления выходили.
  // Незавершённой работы, которую можно потерять при обновлении, здесь нет:
  // всё пользовательское лежит в localStorage и переживает перезагрузку.
  skipWaiting: true,
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
