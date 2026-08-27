#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import process from 'node:process';

/**
 * Проверяет то, чего схема коллекции проверить не может: парность языков,
 * ссылочную целостность между файлами и просроченные даты пересмотра.
 * Схемы полей остаются на zod во время сборки Astro.
 */

const CONTENT = 'content';
const errors = [];
const warnings = [];

// Один и тот же файл встречается в нескольких проходах, поэтому сообщения
// не должны дублироваться: повторы прячут настоящие ошибки.
const fail = (message) => {
  if (!errors.includes(message)) errors.push(message);
};
const warn = (message) => {
  if (!warnings.includes(message)) warnings.push(message);
};

function listMarkdown(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .filter((name) => typeof name === 'string' && name.endsWith('.md'))
    .map((name) => name.replace(/\\/g, '/'));
}

/**
 * Разбирает только тот поднабор YAML, который встречается в нашем
 * фронтматтере: скаляры и простые списки строк. Полноценные схемы всё равно
 * проверяет zod при сборке, здесь нужны лишь несколько полей.
 */
function readFrontmatter(path) {
  // Редакторы под Windows пишут BOM, из-за которого файл перестаёт начинаться
  // с разделителя и валидатор ругался бы на отсутствие фронтматтера вместо
  // настоящей ошибки.
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (match === null) {
    fail(`${path}: отсутствует фронтматтер`);
    return {};
  }
  const data = {};
  let currentKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item !== null && currentKey !== null) {
      const value = item[1].trim();
      if (!value.includes(':')) {
        (data[currentKey] ??= []).push(value.replace(/^['"]|['"]$/g, ''));
      }
      continue;
    }
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair === null) continue;
    currentKey = pair[1];
    const value = pair[2].trim();
    data[currentKey] = value === '' ? [] : value.replace(/^['"]|['"]$/g, '');
  }
  return data;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${path}: ${error.message}`);
    return [];
  }
}

// 1. Справочник обязан существовать на обоих языках.
const handbookPl = listMarkdown(join(CONTENT, 'handbook', 'pl'));
const handbookRu = listMarkdown(join(CONTENT, 'handbook', 'ru'));
// map(basename) передал бы индекс вторым аргументом, а это параметр suffix.
const plSlugs = new Set(handbookPl.map((path) => basename(path)));
const ruSlugs = new Set(handbookRu.map((path) => basename(path)));

for (const slug of plSlugs) {
  if (!ruSlugs.has(slug)) {
    fail(`handbook/${slug}: есть польская версия, нет русской. Справочник двуязычен по схеме коллекции.`);
  }
}
for (const slug of ruSlugs) {
  if (!plSlugs.has(slug)) {
    fail(`handbook/${slug}: есть русская версия, нет польской.`);
  }
}

// 2. Уникальность идентификаторов в справочных данных.
const glossary = readJson(join(CONTENT, 'glossary.json'));
const obligations = readJson(join(CONTENT, 'obligations.json'));

function checkUniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) fail(`${label}: повторяющийся id «${item.id}»`);
    seen.add(item.id);
  }
  return seen;
}

const glossaryIds = checkUniqueIds(glossary, 'glossary.json');
checkUniqueIds(obligations, 'obligations.json');

// 3. Темы ссылаются только на существующие термины.
for (const relative of listMarkdown(join(CONTENT, 'topics'))) {
  const path = join(CONTENT, 'topics', relative);
  const data = readFrontmatter(path);
  for (const term of data.terms ?? []) {
    if (!glossaryIds.has(term)) {
      fail(`topics/${relative}: термин «${term}» отсутствует в glossary.json`);
    }
  }
}

// 4. Каждая обязанность несёт правовое основание: номер параграфа весит
//    больше пересказа, поэтому пустое поле здесь недопустимо.
for (const item of obligations) {
  if (typeof item.legalBasis !== 'string' || item.legalBasis.trim() === '') {
    fail(`obligations.json: «${item.id}» без legalBasis`);
  }
}

// 5. Защита от лицензий с NC вторым рубежом. Первый - тип EmbeddableLicense,
//    в который такие варианты просто не входят.
const forbidden = /CC[- ]BY[- ]NC/i;
const everything = JSON.stringify({ glossary, obligations });
if (forbidden.test(everything)) {
  fail('Найдена лицензия с NC. Такой материал можно только ссылать, но не встраивать.');
}

// 6. Отчёт по просроченным датам пересмотра. Не роняет сборку: устаревший
//    текст лучше живого падения, но молчать о нём нельзя.
const today = new Date().toISOString().slice(0, 10);
const withReview = [
  ...obligations.map((item) => ({ where: `obligations.json/${item.id}`, reviewBy: item.reviewBy })),
  ...[...listMarkdown(join(CONTENT, 'handbook')), ...listMarkdown(join(CONTENT, 'topics'))].map(
    (relative) => {
      const dir = existsSync(join(CONTENT, 'handbook', relative)) ? 'handbook' : 'topics';
      return {
        where: `${dir}/${relative}`,
        reviewBy: readFrontmatter(join(CONTENT, dir, relative)).reviewBy,
      };
    },
  ),
];

for (const item of withReview) {
  if (typeof item.reviewBy === 'string' && item.reviewBy < today) {
    warn(`${item.where}: срок пересмотра истёк ${item.reviewBy}`);
  }
}

for (const message of warnings) console.warn(`ПРЕДУПРЕЖДЕНИЕ  ${message}`);
for (const message of errors) console.error(`ОШИБКА  ${message}`);

if (errors.length > 0) {
  console.error(`\nВалидация контента провалена: ошибок ${errors.length}.`);
  process.exit(1);
}
console.log(
  `Контент в порядке. Терминов: ${glossary.length}, обязанностей: ${obligations.length}, ` +
    `статей справочника: ${plSlugs.size}. Предупреждений: ${warnings.length}.`,
);
