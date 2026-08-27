#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import process from 'node:process';

/**
 * Полка лектур из Wolne Lektury. Забирается при сборке, а не у ученика:
 * так нет ни CORS, ни зависимости от доступности чужого сервера в момент визита.
 *
 * Результат коммитится как снимок. Если источник недоступен, сборка не падает,
 * а использует последний удачный снимок: чужая недоступность не имеет права
 * ломать наш выпуск.
 */

const COLLECTION = 'wybor-lektur-dla-uczniow-liceow';
const SOURCE = `https://wolnelektury.pl/api/collections/${COLLECTION}/`;
const TARGET = 'content/lektury.json';

function keepSnapshot(reason) {
  if (existsSync(TARGET)) {
    const existing = JSON.parse(readFileSync(TARGET, 'utf8'));
    console.warn(`ПРЕДУПРЕЖДЕНИЕ  ${reason}. Оставлен снимок: позиций ${existing.length}.`);
    process.exit(0);
  }
  console.error(`ОШИБКА  ${reason}, и снимка нет.`);
  process.exit(1);
}

let payload;
try {
  const response = await fetch(SOURCE, {
    headers: { 'User-Agent': 'technikum-polna (open source school app)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) keepSnapshot(`Wolne Lektury ответили ${response.status}`);
  payload = await response.json();
} catch (error) {
  keepSnapshot(`Wolne Lektury недоступны: ${error.message}`);
}

const books = (payload.books ?? [])
  .map((book) => ({
    id: book.slug,
    title: book.title,
    author: book.author,
    url: book.url,
    hasAudio: Boolean(book.has_audio),
    epoch: book.epoch ?? '',
    genre: book.genre ?? '',
  }))
  .filter((book) => typeof book.id === 'string' && book.id.length > 0)
  .sort((a, b) => a.author.localeCompare(b.author, 'pl') || a.title.localeCompare(b.title, 'pl'));

if (books.length === 0) keepSnapshot('Wolne Lektury вернули пустую подборку');

writeFileSync(TARGET, `${JSON.stringify(books, null, 2)}\n`, 'utf8');

const withAudio = books.filter((book) => book.hasAudio).length;
console.log(
  `Полка лектур обновлена: позиций ${books.length}, из них с аудиокнигой ${withAudio}. ` +
    `Источник: ${SOURCE}`,
);
