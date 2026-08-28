import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_PREFIX,
  STORAGE_KEY,
  appStateSchema,
  defaultState,
  exportState,
  importState,
  loadState,
  saveState,
} from './appState';

class MemoryStorage {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe('загрузка состояния', () => {
  it('на пустом хранилище отдаёт значения по умолчанию', () => {
    const outcome = loadState(storage);
    expect(outcome.kind).toBe('fresh');
    expect(outcome.state.profile.grade).toBe(1);
  });

  it('переживает круг сохранения и чтения', () => {
    const state = defaultState();
    state.profile.birthDate = '2011-03-15';
    state.progress['inf-03-3'] = 'learning';
    saveState(storage, state);

    const outcome = loadState(storage);
    expect(outcome.kind).toBe('loaded');
    expect(outcome.state).toEqual(state);
  });
});

describe('повреждённые данные', () => {
  it('не стирает мусор, а кладёт его в резервный ключ', () => {
    storage.setItem(STORAGE_KEY, '{ это не json');
    const outcome = loadState(storage, new Date('2026-09-01T10:00:00.000Z'));

    expect(outcome.kind).toBe('recovered');
    if (outcome.kind !== 'recovered') throw new Error('ожидалось восстановление');
    expect(outcome.backupKey).toBe(`${BACKUP_PREFIX}2026-09-01T10:00:00.000Z`);
    expect(storage.getItem(outcome.backupKey)).toBe('{ это не json');
    expect(outcome.state).toEqual(defaultState());
  });

  it('сохраняет исходник и при непрохождении схемы', () => {
    const broken = JSON.stringify({ version: 1, profile: { grade: 9 } });
    storage.setItem(STORAGE_KEY, broken);
    const outcome = loadState(storage, new Date('2026-09-02T08:30:00.000Z'));

    expect(outcome.kind).toBe('recovered');
    expect(storage.keys().some((key) => key.startsWith(BACKUP_PREFIX))).toBe(true);
    expect(storage.getItem(`${BACKUP_PREFIX}2026-09-02T08:30:00.000Z`)).toBe(broken);
  });

  it('массив вместо объекта тоже уходит в резерв', () => {
    storage.setItem(STORAGE_KEY, '[1,2,3]');
    expect(loadState(storage).kind).toBe('recovered');
  });
});

describe('экспорт и импорт', () => {
  it('состояние проходит круг через файл', () => {
    const state = defaultState();
    state.settings.showRussian = false;
    state.profile.languageGroup = 'hiszpanski';

    const outcome = importState(exportState(state));
    expect(outcome).toEqual({ kind: 'ok', state });
  });

  it('чужой файл отвергается с внятной причиной', () => {
    const outcome = importState('{"version":1}');
    expect(outcome.kind).toBe('error');
  });

  it('не-JSON отвергается без исключения', () => {
    expect(importState('nope').kind).toBe('error');
  });
});

describe('схема', () => {
  it('не пропускает неизвестную оценку прогресса', () => {
    const state = { ...defaultState(), progress: { x: 'mastered' } };
    expect(appStateSchema.safeParse(state).success).toBe(false);
  });

  it('пропускает дополнительные поля в срезах, которыми ещё владеет П2', () => {
    const state = {
      ...defaultState(),
      grades: [{ id: 'mat-1', value: 4, weight: 2 }],
    };
    expect(appStateSchema.safeParse(state).success).toBe(true);
  });

  it('расписание разбирается по настоящей форме урока', () => {
    const state = {
      ...defaultState(),
      timetable: [{ id: 'sr-3', day: 'sr', slot: 3, subjectId: 'fizyka', room: '204' }],
    };
    expect(appStateSchema.safeParse(state).success).toBe(true);
  });

  it('шестой день недели расписанием не является', () => {
    const state = {
      ...defaultState(),
      timetable: [{ id: 'sob-1', day: 'sob', slot: 1, subjectId: 'fizyka' }],
    };
    expect(appStateSchema.safeParse(state).success).toBe(false);
  });
});

describe('миграция с версии 1 на 2', () => {
  /** Состояние в том виде, в каком его писала версия 1. */
  const version1 = {
    version: 1,
    profile: {
      grade: 1,
      languageGroup: null,
      uiLocale: 'pl',
      birthDate: '2011-03-15',
    },
    timetable: [
      { id: 'sr-3', day: 'sr', slot: 3, subjectId: 'fizyka' },
      { id: 'mon-1', subject: 'matematyka', room: '204' },
    ],
    attendance: [],
    grades: [{ id: 'mat-1', value: 4 }],
    homework: [],
    progress: { 'inf-03-3': 'learning' },
    teachers: [{ id: 'stary-wpis' }],
    settings: { theme: 'system', showRussian: true },
  };

  it('поднимает версию и достраивает недостающие срезы', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(version1));
    const outcome = loadState(storage);

    expect(outcome.kind).toBe('loaded');
    expect(outcome.state.version).toBe(2);
    expect(outcome.state.announcedTests).toEqual([]);
    expect(outcome.state.settings.bells).toEqual({ firstLessonStart: 480, breakMinutes: 10 });
  });

  it('выбрасывает нечитаемые записи, но не всё состояние', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(version1));
    const outcome = loadState(storage);

    // Запись без дня и номера уроком стать не может, поэтому уходит. Оценки,
    // прогресс и дата рождения к ней отношения не имеют и остаются на месте.
    expect(outcome.state.timetable).toEqual([
      { id: 'sr-3', day: 'sr', slot: 3, subjectId: 'fizyka' },
    ]);
    expect(outcome.state.teachers).toEqual([]);
    expect(outcome.state.grades).toEqual([{ id: 'mat-1', value: 4 }]);
    expect(outcome.state.progress).toEqual({ 'inf-03-3': 'learning' });
    expect(outcome.state.profile.birthDate).toBe('2011-03-15');
  });

  it('ничего не кладёт в резервный ключ: терять было нечего', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(version1));
    loadState(storage);
    expect(storage.keys().some((key) => key.startsWith(BACKUP_PREFIX))).toBe(false);
  });

  it('уже настроенные звонки миграция не трогает', () => {
    const tuned = {
      ...version1,
      settings: { theme: 'dark', showRussian: false, bells: { firstLessonStart: 495, breakMinutes: 15 } },
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(tuned));
    const outcome = loadState(storage);

    expect(outcome.state.settings.bells).toEqual({ firstLessonStart: 495, breakMinutes: 15 });
  });
});
