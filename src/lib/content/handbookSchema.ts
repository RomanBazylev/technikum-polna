import { z } from 'zod';

const isoDate = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается YYYY-MM-DD'),
);

const sourceSchema = z.discriminatedUnion('kind', [
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

export const handbookSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  section: z.enum([
    'pierwszy-tydzien',
    'zasady',
    'prawa-cudzoziemca',
    'pieniadze-i-dojazd',
    'kalendarz',
    'kontakt',
  ]),
  order: z.number().int().nonnegative(),
  legalBasis: z.array(z.string()).default([]),
  sources: z.array(sourceSchema).default([]),
  reviewBy: isoDate.optional(),
});
