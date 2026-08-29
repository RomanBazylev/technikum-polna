import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { handbookSchema } from './lib/content/handbookSchema';

/**
 * YAML сам превращает незакавыченную дату в объект Date, поэтому нормализуем
 * её на границе, а не требуем от каждого автора помнить про кавычки.
 */
const isoDate = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается YYYY-MM-DD'),
);

const monthDay = z.string().regex(/^\d{2}-\d{2}$/, 'Ожидается MM-DD');
const bilingualNote = z.object({ pl: z.string().min(1), ru: z.string().min(1) });
const mappingStatus = z.enum(['confirmed', 'framework', 'unconfirmed']);
const documentProvenance = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  documentDate: isoDate.nullable(),
  retrievedAt: isoDate,
  scope: z.enum(['subject', 'hours', 'track', 'textbook']),
  status: mappingStatus,
});
const programmeSource = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  documentDate: isoDate,
  retrievedAt: isoDate,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  legalBasis: z.string().min(1),
  reuseBasis: z.string().min(1),
});

/**
 * Происхождение материала. У ссылочного варианта нет поля с содержимым, поэтому
 * скопировать чужой текст нельзя технически. Список встраиваемых лицензий не
 * содержит вариантов с NC: Pi-stacja и Khan Academy лежат под CC BY-NC-SA,
 * а такой материал нельзя объединять с нашей CC BY-SA на одной странице.
 */
const source = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('link-only'),
    provider: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    why: z.string().min(1, 'Объясните, почему источник только ссылочный'),
  }),
  z.object({
    kind: z.literal('embeddable'),
    title: z.string().min(1),
    url: z.string().url(),
    license: z.enum(['public-domain', 'CC-BY-3.0', 'CC-BY-SA-4.0', 'LAL-1.3']),
    attribution: z.string().min(1),
  }),
  z.object({
    kind: z.literal('authored'),
    author: z.string().min(1),
    license: z.literal('CC-BY-SA-4.0'),
  }),
]);

/**
 * Справочник. Тело статьи живёт отдельным файлом на каждый язык, в
 * content/handbook/pl и content/handbook/ru, чтобы markdown оставался
 * markdown. Парность файлов проверяет scripts/validate-content.mjs.
 */
const handbook = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/handbook' }),
  schema: handbookSchema,
});

/** Темы предметов. Польский обязателен, русский только на уровне терминов. */
const topics = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/topics' }),
  schema: z.object({
    title: z.string().min(1),
    subject: z.string().min(1),
    grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    effects: z.array(z.string().regex(/^INF\.0[34]\.\d{1,2}(\.\d{1,2})?$/)).default([]),
    terms: z.array(z.string()).default([]),
    mappingStatus,
    mappingNote: bilingualNote,
    sources: z.array(source).default([]),
    reviewBy: isoDate.optional(),
  }),
});

const glossary = defineCollection({
  loader: file('./content/glossary.json'),
  schema: z.object({
    id: z.string().min(1),
    pl: z.string().min(1),
    ru: z.string().min(1),
    en: z.string().optional(),
    category: z.enum(['szkola', 'ocenianie', 'egzamin', 'programowanie', 'urzedy']),
    note: z.object({ pl: z.string(), ru: z.string() }).partial().optional(),
  }),
});

const obligations = defineCollection({
  loader: file('./content/obligations.json'),
  schema: z.object({
    id: z.string().min(1),
    title: z.object({ pl: z.string().min(1), ru: z.string().min(1) }),
    what: z.object({ pl: z.string().min(1), ru: z.string().min(1) }),
    anchor: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('always') }),
      z.object({ kind: z.literal('annual-window'), from: monthDay, to: monthDay }),
      z.object({ kind: z.literal('fixed-date'), from: isoDate, to: isoDate }),
      z.object({
        kind: z.literal('before-event'),
        event: z.enum(['rada-klasyfikacyjna', 'koniec-zajec', 'poczatek-roku']),
        days: z.number().int().positive(),
      }),
      z.object({
        kind: z.literal('after-event'),
        event: z.literal('absence-ended'),
        days: z.number().int().positive(),
      }),
      z.object({ kind: z.literal('from-age'), years: z.number().int().positive() }),
    ]),
    appliesTo: z.union([
      z.literal('wszyscy'),
      z.literal('cudzoziemcy'),
      z.object({ grade: z.number().int().min(1).max(5) }),
    ]),
    legalBasis: z.string().min(1, 'Номер параграфа обязателен: он весит больше пересказа'),
    handledAt: z.enum(['szkola', 'ops', 'esdos', 'librus', 'zus']),
    sources: z.array(source).default([]),
    reviewBy: isoDate.optional(),
  }),
});

/** Ось программы, воспроизводимо извлечённая из официального PDF ORE. */
const effects = defineCollection({
  loader: file('./content/effects.json'),
  schema: z.object({
    id: z.string().regex(/^INF\.0[34]\.\d{1,2}$/),
    qualification: z.enum(['INF.03', 'INF.04']),
    name: z.string().min(1),
    subjects: z.array(z.string().min(1)),
    grades: z.array(z.number().int().min(1).max(5)),
    mappingStatus,
    mappingNote: bilingualNote,
    source: programmeSource,
    effects: z.array(
      z.object({
        id: z.string().regex(/^INF\.0[34]\.\d{1,2}\.\d{1,2}$/),
        text: z.string().min(1),
        source: programmeSource,
      }),
    ).min(1),
  }),
});

const subjects = defineCollection({
  loader: file('./content/subjects.json'),
  schema: z.object({
    id: z.string().min(1),
    name: z.object({ pl: z.string().min(1), ru: z.string().min(1) }),
    track: z.enum(['ogolny', 'rozszerzony', 'jezyk', 'zawodowy']),
    // null означает, что распределение часов по классам определяет директор.
    hoursByGrade: z.array(z.number().int().min(0)).length(5).nullable(),
    textbook: z.string().optional(),
    note: bilingualNote.optional(),
    mappingStatus,
    mappingNote: bilingualNote,
    sources: z.array(documentProvenance).min(1),
  }),
});

/**
 * Полка лектур. Снимок ответа Wolne Lektury, обновляется скриптом
 * `npm run content:refresh`, а не при каждой сборке: так сборка остаётся
 * детерминированной и не зависит от доступности чужого сервера.
 */
const lektury = defineCollection({
  loader: file('./content/lektury.json'),
  schema: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    author: z.string(),
    url: z.string().url(),
    hasAudio: z.boolean(),
    epoch: z.string(),
    genre: z.string(),
  }),
});

export const collections = {
  handbook,
  topics,
  glossary,
  obligations,
  effects,
  subjects,
  lektury,
};
