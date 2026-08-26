import { z } from 'zod';

/**
 * Единственный владелец localStorage. Шесть подсистем получают срезы, а не
 * собственные ключи: иначе экспорт и миграция стали бы невозможны, а имена
 * ключей разъехались бы при первом же изменении формата.
 */

export const APP_STATE_VERSION = 1;
export const STORAGE_KEY = 'tkk-polna:state';
export const BACKUP_PREFIX = 'tkk-polna:state-backup:';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Элементами этих коллекций владеет спецификация П2 «Калькуляторы».
 * Фундамент фиксирует только имена срезов и требует идентификатор, а
 * остальные поля пропускает, чтобы добавление поля в П2 не требовало миграции.
 */
const opaqueRecord = z.object({ id: z.string().min(1) }).catchall(z.unknown());

export const appStateSchema = z.object({
  version: z.literal(APP_STATE_VERSION),
  profile: z.object({
    grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    languageGroup: z.enum(['niemiecki', 'hiszpanski']).nullable(),
    uiLocale: z.enum(['pl', 'ru']),
    birthDate: isoDate.nullable(),
  }),
  timetable: z.array(opaqueRecord),
  attendance: z.array(opaqueRecord),
  grades: z.array(opaqueRecord),
  homework: z.array(opaqueRecord),
  progress: z.record(z.string(), z.enum(['new', 'learning', 'known'])),
  teachers: z.array(opaqueRecord),
  settings: z.object({
    theme: z.enum(['system', 'light', 'dark']),
    showRussian: z.boolean(),
  }),
});

export type AppState = z.infer<typeof appStateSchema>;

export function defaultState(): AppState {
  return {
    version: APP_STATE_VERSION,
    profile: { grade: 1, languageGroup: null, uiLocale: 'pl', birthDate: null },
    timetable: [],
    attendance: [],
    grades: [],
    homework: [],
    progress: {},
    teachers: [],
    settings: { theme: 'system', showRussian: true },
  };
}

/**
 * Миграции с версии N на N+1. Пока пусто: версия одна. Точка расширения
 * оставлена намеренно, чтобы первая же смена формата не потребовала
 * переделывать загрузку.
 */
export const migrations: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> =
  {};

export type LoadOutcome =
  | { kind: 'loaded'; state: AppState }
  | { kind: 'fresh'; state: AppState }
  | { kind: 'recovered'; state: AppState; backupKey: string; reason: string };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function applyMigrations(input: Record<string, unknown>): Record<string, unknown> {
  let current = input;
  let version = typeof current['version'] === 'number' ? (current['version'] as number) : 0;
  while (version < APP_STATE_VERSION) {
    const step = migrations[version];
    if (step === undefined) break;
    current = step(current);
    version += 1;
  }
  return current;
}

/**
 * Разбирает сохранённое состояние. При неустранимой ошибке кладёт сырое
 * значение под ключ с меткой времени и стартует с пустого. Потерять расписание
 * и полгода отметок из-за нашей миграции недопустимо, поэтому ничего не
 * затирается молча.
 */
export function loadState(storage: StorageLike, now: Date = new Date()): LoadOutcome {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return { kind: 'fresh', state: defaultState() };

  const backup = (reason: string): LoadOutcome => {
    const backupKey = `${BACKUP_PREFIX}${now.toISOString()}`;
    storage.setItem(backupKey, raw);
    return { kind: 'recovered', state: defaultState(), backupKey, reason };
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return backup('Сохранённые данные не являются корректным JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return backup('Сохранённые данные не являются объектом состояния');
  }

  const migrated = applyMigrations(parsed as Record<string, unknown>);
  const result = appStateSchema.safeParse(migrated);
  if (!result.success) {
    return backup(result.error.issues.map((issue) => issue.message).join('; '));
  }
  return { kind: 'loaded', state: result.data };
}

export function saveState(storage: StorageLike, state: AppState): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export type ImportOutcome =
  | { kind: 'ok'; state: AppState }
  | { kind: 'error'; message: string };

export function importState(payload: string): ImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { kind: 'error', message: 'Файл не является корректным JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'error', message: 'Файл не содержит объекта состояния' };
  }
  const result = appStateSchema.safeParse(applyMigrations(parsed as Record<string, unknown>));
  return result.success
    ? { kind: 'ok', state: result.data }
    : { kind: 'error', message: result.error.issues.map((i) => i.message).join('; ') };
}

export function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}
