/**
 * Урок длится 45 минут, § 21 ust. 6 устава. Расписание звонков школа нигде не
 * публикует, поэтому начало первого урока и длину перемены задаёт сам ученик,
 * а времена остальных уроков выводятся из них. Единая перемена между всеми
 * уроками - честное упрощение: угадывать длинный обеденный перерыв, которого
 * мы не видели, хуже, чем дать поле для правки.
 */

export const LESSON_MINUTES = 45;

export const WEEKDAYS = ['pon', 'wt', 'sr', 'czw', 'pt'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Винительный падеж хранится отдельно, потому что «na środa» и «на среда»
 * одинаково неправильны в обоих языках, а склеивать заголовок из именительного
 * значило бы писать по-школьному неграмотно.
 */
export const WEEKDAY_NAME: Record<
  Weekday,
  { pl: string; ru: string; short: string; plAcc: string; ruAcc: string }
> = {
  pon: {
    pl: 'Poniedziałek',
    ru: 'Понедельник',
    short: 'Pon',
    plAcc: 'poniedziałek',
    ruAcc: 'понедельник',
  },
  wt: { pl: 'Wtorek', ru: 'Вторник', short: 'Wt', plAcc: 'wtorek', ruAcc: 'вторник' },
  sr: { pl: 'Środa', ru: 'Среда', short: 'Śr', plAcc: 'środę', ruAcc: 'среду' },
  czw: { pl: 'Czwartek', ru: 'Четверг', short: 'Czw', plAcc: 'czwartek', ruAcc: 'четверг' },
  pt: { pl: 'Piątek', ru: 'Пятница', short: 'Pt', plAcc: 'piątek', ruAcc: 'пятницу' },
};

/** Больше двенадцати уроков в день не бывает даже в самом тяжёлом варианте. */
export const MAX_SLOT = 12;

export type BellConfig = {
  /** Начало первого урока в минутах от полуночи. */
  firstLessonStart: number;
  breakMinutes: number;
};

export const DEFAULT_BELLS: BellConfig = { firstLessonStart: 8 * 60, breakMinutes: 10 };

/**
 * Урок в сетке недели. Пара «день плюс номер» - настоящий ключ, поэтому из неё
 * же выводится идентификатор: так в одну клетку невозможно положить два урока,
 * и проверять это отдельно не нужно.
 */
export type Lesson = {
  id: string;
  day: Weekday;
  slot: number;
  subjectId: string;
  room?: string;
  teacher?: string;
};

export type Week = readonly Lesson[];

/** Предмет в том виде, в каком его отдаёт коллекция subjects. */
export type SubjectRef = { id: string; pl: string; ru: string; textbook?: string };

export function lessonId(day: Weekday, slot: number): string {
  return `${day}-${slot}`;
}

export function lessonAt(week: Week, day: Weekday, slot: number): Lesson | null {
  return week.find((lesson) => lesson.day === day && lesson.slot === slot) ?? null;
}

export function lessonsOn(week: Week, day: Weekday): Lesson[] {
  return week.filter((lesson) => lesson.day === day).sort((a, b) => a.slot - b.slot);
}

export type UnknownTimetableCell = {
  day: Weekday;
  slot: number;
  value: string;
};

export type TimetableImport =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; lessons: Lesson[]; unknown: UnknownTimetableCell[] };

const DAY_ALIASES: Readonly<Record<string, Weekday>> = {
  pon: 'pon',
  poniedzialek: 'pon',
  понедельник: 'pon',
  monday: 'pon',
  wt: 'wt',
  wtorek: 'wt',
  вторник: 'wt',
  tuesday: 'wt',
  sr: 'sr',
  sroda: 'sr',
  среда: 'sr',
  wednesday: 'sr',
  czw: 'czw',
  czwartek: 'czw',
  четверг: 'czw',
  thursday: 'czw',
  pt: 'pt',
  piatek: 'pt',
  пятница: 'pt',
  friday: 'pt',
};

const SUBJECT_ALIASES: Readonly<Record<string, string>> = {
  polski: 'jezyk-polski',
  angielski: 'jezyk-angielski',
  niemiecki: 'jezyk-niemiecki',
  hiszpanski: 'jezyk-hiszpanski',
  wf: 'wychowanie-fizyczne',
  wuef: 'wychowanie-fizyczne',
  edb: 'edukacja-dla-bezpieczenstwa',
  biz: 'biznes-i-zarzadzanie',
  zawodowe: 'ksztalcenie-zawodowe',
};

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pl')
    .replaceAll('ł', 'l')
    .replace(/[._/\\()[\]{}:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitGridLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes('|')) return line.split('|');
  if (line.includes(';')) return line.split(';');
  if ((line.match(/,/g) ?? []).length >= 4) return line.split(',');
  return line.split(/\s{2,}/);
}

function subjectIndex(subjects: readonly SubjectRef[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const subject of subjects) {
    result.set(normalized(subject.id), subject.id);
    result.set(normalized(subject.pl), subject.id);
    result.set(normalized(subject.ru), subject.id);
  }
  for (const [alias, subjectId] of Object.entries(SUBJECT_ALIASES)) {
    if (subjects.some((subject) => subject.id === subjectId)) result.set(alias, subjectId);
  }
  return result;
}

function matchSubject(value: string, index: ReadonlyMap<string, string>): string | null {
  const cell = normalized(value);
  const exact = index.get(cell);
  if (exact !== undefined) return exact;

  const candidates = [...index.entries()]
    .filter(([name]) => cell.startsWith(`${name} `))
    .sort(([left], [right]) => right.length - left.length);
  return candidates[0]?.[1] ?? null;
}

/**
 * Разбирает сетку, скопированную из таблицы или школьного экспорта. Замена
 * расписания остаётся решением интерфейса: результат отдельно перечисляет
 * непонятные клетки, чтобы частичный разбор нельзя было принять молча.
 */
export function parseTimetableGrid(
  payload: string,
  subjects: readonly SubjectRef[],
): TimetableImport {
  const rows = payload
    .split(/\r?\n/)
    .map((line) => splitGridLine(line).map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell !== ''));
  if (rows.length === 0) return { kind: 'empty' };

  const headerRow = rows.findIndex((cells) => {
    const days = cells.flatMap((cell) => {
      const day = DAY_ALIASES[normalized(cell)];
      return day === undefined ? [] : [day];
    });
    return new Set(days).size === WEEKDAYS.length;
  });
  if (headerRow < 0) {
    return {
      kind: 'error',
      message: 'Nie znaleziono nagłówka z pięcioma dniami tygodnia.',
    };
  }

  const header = rows[headerRow] ?? [];
  const columns = new Map<Weekday, number>();
  header.forEach((cell, column) => {
    const day = DAY_ALIASES[normalized(cell)];
    if (day !== undefined) columns.set(day, column);
  });
  const firstDayColumn = Math.min(...columns.values());
  const index = subjectIndex(subjects);
  const lessons: Lesson[] = [];
  const unknown: UnknownTimetableCell[] = [];

  rows.slice(headerRow + 1).forEach((cells, rowIndex) => {
    const slotCell = cells.slice(0, firstDayColumn).find((cell) => /^\s*\d{1,2}\b/.test(cell));
    const parsedSlot = slotCell === undefined ? rowIndex + 1 : Number.parseInt(slotCell, 10);
    if (!Number.isInteger(parsedSlot) || parsedSlot < 1 || parsedSlot > MAX_SLOT) return;

    for (const day of WEEKDAYS) {
      const column = columns.get(day);
      const value = column === undefined ? '' : (cells[column] ?? '').trim();
      if (value === '' || /^[-–—]+$/.test(value)) continue;
      const subjectId = matchSubject(value, index);
      if (subjectId === null) {
        unknown.push({ day, slot: parsedSlot, value });
      } else {
        lessons.push({
          id: lessonId(day, parsedSlot),
          day,
          slot: parsedSlot,
          subjectId,
        });
      }
    }
  });

  return lessons.length === 0 && unknown.length === 0
    ? { kind: 'error', message: 'Tabela nie zawiera żadnych lekcji.' }
    : { kind: 'preview', lessons, unknown };
}

export function slotWindow(slot: number, bells: BellConfig): { start: number; end: number } {
  const start = bells.firstLessonStart + (slot - 1) * (LESSON_MINUTES + bells.breakMinutes);
  return { start, end: start + LESSON_MINUTES };
}

export function formatMinutes(minutesOfDay: number): string {
  const wrapped = ((minutesOfDay % 1440) + 1440) % 1440;
  return `${Math.floor(wrapped / 60)}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** Учебный день через offset суток от now, либо null для субботы и воскресенья. */
function weekdayAfter(now: Date, offset: number): Weekday | null {
  return WEEKDAYS[((now.getDay() + offset) % 7) - 1] ?? null;
}

/**
 * Ближайший учебный день после сегодняшнего. В пятницу вечером «завтра» - это
 * понедельник, и панель «что взять» должна показывать именно его.
 */
export function schoolDayAfter(now: Date): Weekday {
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = weekdayAfter(now, offset);
    if (day !== null) return day;
  }
  return 'pon';
}

export type NextLesson =
  | { kind: 'during'; lesson: Lesson; minutesLeft: number }
  | { kind: 'upcoming'; lesson: Lesson; minutesUntil: number }
  | { kind: 'empty' };

/**
 * Текущий или ближайший урок. Конец дня, выходные и пустой понедельник
 * перелистываются вперёд вплоть до того же дня следующей недели: расписание
 * повторяется, поэтому единственный урок в неделю всё равно найдётся.
 */
export function nextLesson(now: Date, week: Week, bells: BellConfig): NextLesson {
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  for (let offset = 0; offset <= 7; offset += 1) {
    const day = weekdayAfter(now, offset);
    if (day === null) continue;

    for (const lesson of lessonsOn(week, day)) {
      const { start, end } = slotWindow(lesson.slot, bells);
      if (offset > 0) {
        return { kind: 'upcoming', lesson, minutesUntil: offset * 1440 - minutesNow + start };
      }
      if (minutesNow < start) {
        return { kind: 'upcoming', lesson, minutesUntil: start - minutesNow };
      }
      if (minutesNow < end) {
        return { kind: 'during', lesson, minutesLeft: end - minutesNow };
      }
    }
  }

  return { kind: 'empty' };
}

/** Учебник и предметы, которым он нужен в этот день. */
export type BringItem = { textbook: string; subjects: string[] };

/**
 * В среду есть физика, значит надо взять «Fizyka 1, WSiP». Один учебник на два
 * предмета не должен попадать в список дважды, поэтому книги схлопываются, а
 * предметы под ними перечисляются.
 */
export function whatToBring(
  day: Weekday,
  week: Week,
  subjects: readonly SubjectRef[],
): BringItem[] {
  const byId = new Map(subjects.map((subject) => [subject.id, subject]));
  const items: BringItem[] = [];

  for (const lesson of lessonsOn(week, day)) {
    const subject = byId.get(lesson.subjectId);
    const textbook = subject?.textbook;
    if (subject === undefined || textbook === undefined) continue;

    const existing = items.find((item) => item.textbook === textbook);
    if (existing === undefined) {
      items.push({ textbook, subjects: [subject.pl] });
    } else if (!existing.subjects.includes(subject.pl)) {
      existing.subjects.push(subject.pl);
    }
  }

  return items;
}
