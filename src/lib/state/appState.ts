import { z } from 'zod';
import { DEFAULT_BELLS, MAX_SLOT, WEEKDAYS } from '../domain/timetable';

/**
 * Единственный владелец localStorage. Шесть подсистем получают срезы, а не
 * собственные ключи: иначе экспорт и миграция стали бы невозможны, а имена
 * ключей разъехались бы при первом же изменении формата.
 */

export const APP_STATE_VERSION = 2;
export const STORAGE_KEY = 'tkk-polna:state';
export const BACKUP_PREFIX = 'tkk-polna:state-backup:';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Форма записей посещаемости, оценок и домашних заданий пока не определена:
 * ими владеет спецификация П2 «Калькуляторы». До тех пор схема требует только
 * идентификатор, чтобы добавление поля не требовало миграции. Расписание,
 * учителя и контрольные из этой группы уже вышли: у них есть свои схемы ниже.
 */
const opaqueRecord = z.object({ id: z.string().min(1) }).catchall(z.unknown());

const lessonSchema = z.object({
  id: z.string().min(1),
  day: z.enum(WEEKDAYS),
  slot: z.number().int().min(1).max(MAX_SLOT),
  subjectId: z.string().min(1),
  room: z.string().optional(),
  teacher: z.string().optional(),
});

/**
 * Ни имя, ни почта не проверяются на содержимое намеренно. Запись идёт на
 * каждое нажатие клавиши, поэтому наполовину стёртое имя или недописанный
 * адрес попали бы в хранилище и при следующей загрузке уронили бы разбор всего
 * состояния в резервный ключ. Схема здесь отвечает за форму, а не за смысл.
 */
const teacherSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  subjectId: z.string().min(1),
  room: z.string().optional(),
  email: z.string().optional(),
});

const announcedTestSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  date: isoDate,
  announcedOn: isoDate,
});

const bellsSchema = z.object({
  firstLessonStart: z.number().int().min(0).max(1439),
  breakMinutes: z.number().int().min(0).max(120),
});

export const appStateSchema = z.object({
  version: z.literal(APP_STATE_VERSION),
  profile: z.object({
    grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    languageGroup: z.enum(['niemiecki', 'hiszpanski']).nullable(),
    uiLocale: z.enum(['pl', 'ru']),
    birthDate: isoDate.nullable(),
  }),
  timetable: z.array(lessonSchema),
  attendance: z.array(opaqueRecord),
  grades: z.array(opaqueRecord),
  homework: z.array(opaqueRecord),
  announcedTests: z.array(announcedTestSchema),
  progress: z.record(z.string(), z.enum(['new', 'learning', 'known'])),
  teachers: z.array(teacherSchema),
  /**
   * Из настроек читаются только bells. Тема мертва: приложение тёмное, светлая
   * половина media-запроса удалена. Переключателя языка тоже нет, интерфейс
   * двуязычный по построению. Поля оставлены, потому что их удаление стоит
   * миграции на версию 3 и риска для сохранённого расписания, а пользы не даёт.
   */
  settings: z.object({
    theme: z.enum(['system', 'light', 'dark']),
    showRussian: z.boolean(),
    bells: bellsSchema,
  }),
});

export type AppState = z.infer<typeof appStateSchema>;
export type TeacherEntry = z.infer<typeof teacherSchema>;

export function defaultState(): AppState {
  return {
    version: APP_STATE_VERSION,
    profile: { grade: 1, languageGroup: null, uiLocale: 'pl', birthDate: null },
    timetable: [],
    attendance: [],
    grades: [],
    homework: [],
    announcedTests: [],
    progress: {},
    teachers: [],
    settings: { theme: 'system', showRussian: true, bells: { ...DEFAULT_BELLS } },
  };
}

/**
 * Оставляет только те элементы, которые разбираются новой схемой. Версия 1
 * требовала от элемента лишь идентификатор, поэтому строгая проверка уронила бы
 * загрузку целиком, а вместе с ней и отметки, и прогресс по темам, и дату
 * рождения. Потеря строки расписания стоит одного нажатия, потеря состояния -
 * полугода.
 */
function keepParsable<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function withBells(settings: unknown): unknown {
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    return settings;
  }
  const existing = (settings as Record<string, unknown>)['bells'];
  return bellsSchema.safeParse(existing).success
    ? settings
    : { ...settings, bells: { ...DEFAULT_BELLS } };
}

/** Миграции с версии N на N+1. */
export const migrations: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> =
  {
    1: (state) => ({
      ...state,
      version: 2,
      timetable: keepParsable(state['timetable'], lessonSchema),
      teachers: keepParsable(state['teachers'], teacherSchema),
      announcedTests: keepParsable(state['announcedTests'], announcedTestSchema),
      settings: withBells(state['settings']),
    }),
  };

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
