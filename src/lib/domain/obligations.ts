import type { IsoDate, Localized, MonthDay, Grade } from './types';

export type SchoolEvent = 'rada-klasyfikacyjna' | 'koniec-zajec' | 'poczatek-roku';
export type PersonalEvent = 'absence-ended';

/**
 * Сроки в школьной жизни отсчитываются от разного, поэтому якорей пять.
 * Свести их к одной дате нельзя: stypendium szkolne повторяется каждый год,
 * просьба о повышении оценки привязана к педсовету, оправдание пропуска -
 * к выздоровлению, а обязанность возить школьный билет - ко дню рождения.
 */
export type DeadlineAnchor =
  | { kind: 'annual-window'; from: MonthDay; to: MonthDay }
  | { kind: 'fixed-date'; from: IsoDate; to: IsoDate }
  | { kind: 'before-event'; event: SchoolEvent; days: number }
  | { kind: 'after-event'; event: PersonalEvent; days: number }
  | { kind: 'from-age'; years: number };

export type Obligation = {
  id: string;
  title: Localized;
  what: Localized;
  anchor: DeadlineAnchor;
  appliesTo: 'wszyscy' | 'cudzoziemcy' | { grade: Grade };
  legalBasis: string;
  handledAt: 'szkola' | 'ops' | 'esdos' | 'librus' | 'zus';
  reviewBy?: IsoDate;
};

export type ResolutionContext = {
  today: IsoDate;
  schoolEvents: Partial<Record<SchoolEvent, IsoDate>>;
  birthDate?: IsoDate | null;
  absenceEndedOn?: IsoDate | null;
};

export type ObligationStatus =
  | { kind: 'upcoming'; from: IsoDate; to: IsoDate; daysUntilOpen: number }
  | { kind: 'open'; from: IsoDate | null; to: IsoDate; daysLeft: number }
  /**
   * Для ежегодного окна заполняется nextOccurrence: сказать «просрочено на 344
   * дня» и промолчать про следующий сентябрь означало бы спрятать единственное
   * действие, которое ученику ещё доступно.
   */
  | { kind: 'overdue'; to: IsoDate; daysSince: number; nextOccurrence?: IsoDate }
  | { kind: 'not-yet'; from: IsoDate; daysUntil: number }
  | { kind: 'in-force'; since: IsoDate }
  | { kind: 'needs-data'; missing: string };

const DAY_MS = 86_400_000;

export function parseIsoDate(value: IsoDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`Ожидалась дата в формате YYYY-MM-DD, получено: ${value}`);
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toIsoDate(timestamp: number): IsoDate {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to) - parseIsoDate(from)) / DAY_MS);
}

function parseMonthDay(value: MonthDay): { month: number; day: number } {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`Ожидался день года в формате MM-DD, получено: ${value}`);
  }
  return { month: Number(match[1]), day: Number(match[2]) };
}

/**
 * Учебный год в Польше начинается 1 сентября, поэтому 2027-02-01 относится
 * к году 2026/2027 и возвращает 2026.
 */
export function schoolYearStart(today: IsoDate): number {
  const date = new Date(parseIsoDate(today));
  const month = date.getUTCMonth() + 1;
  return month >= 9 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/**
 * Разворачивает ежегодное окно на текущий учебный год. Месяцы с сентября
 * по декабрь попадают в первый календарный год, с января по август - во
 * второй, поэтому окно вроде 12-20..01-10 корректно пересекает Новый год.
 */
export function windowForSchoolYear(
  anchor: { from: MonthDay; to: MonthDay },
  startYear: number,
): { from: IsoDate; to: IsoDate } {
  const from = parseMonthDay(anchor.from);
  const to = parseMonthDay(anchor.to);
  const yearFor = (month: number): number => (month >= 9 ? startYear : startYear + 1);
  return {
    from: toIsoDate(Date.UTC(yearFor(from.month), from.month - 1, from.day)),
    to: toIsoDate(Date.UTC(yearFor(to.month), to.month - 1, to.day)),
  };
}

export function resolveAnnualWindow(
  anchor: { from: MonthDay; to: MonthDay },
  today: IsoDate,
): { from: IsoDate; to: IsoDate } {
  return windowForSchoolYear(anchor, schoolYearStart(today));
}

function addYears(date: IsoDate, years: number): IsoDate {
  const parsed = new Date(parseIsoDate(date));
  return toIsoDate(
    Date.UTC(parsed.getUTCFullYear() + years, parsed.getUTCMonth(), parsed.getUTCDate()),
  );
}

function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(parseIsoDate(date) + days * DAY_MS);
}

function statusForWindow(
  today: IsoDate,
  from: IsoDate | null,
  to: IsoDate,
  nextOccurrence?: IsoDate,
): ObligationStatus {
  if (from !== null && daysBetween(today, from) > 0) {
    return { kind: 'upcoming', from, to, daysUntilOpen: daysBetween(today, from) };
  }
  const daysLeft = daysBetween(today, to);
  if (daysLeft >= 0) {
    return { kind: 'open', from, to, daysLeft };
  }
  return nextOccurrence === undefined
    ? { kind: 'overdue', to, daysSince: -daysLeft }
    : { kind: 'overdue', to, daysSince: -daysLeft, nextOccurrence };
}

export function resolveAnchor(
  anchor: DeadlineAnchor,
  context: ResolutionContext,
): ObligationStatus {
  switch (anchor.kind) {
    case 'annual-window': {
      const startYear = schoolYearStart(context.today);
      const window = windowForSchoolYear(anchor, startYear);
      const next = windowForSchoolYear(anchor, startYear + 1);
      return statusForWindow(context.today, window.from, window.to, next.from);
    }
    case 'fixed-date':
      return statusForWindow(context.today, anchor.from, anchor.to);
    case 'before-event': {
      const eventDate = context.schoolEvents[anchor.event];
      if (eventDate === undefined) {
        return { kind: 'needs-data', missing: anchor.event };
      }
      return statusForWindow(context.today, null, addDays(eventDate, -anchor.days));
    }
    case 'after-event': {
      const eventDate = context.absenceEndedOn;
      if (eventDate === null || eventDate === undefined) {
        return { kind: 'needs-data', missing: 'absenceEndedOn' };
      }
      return statusForWindow(context.today, eventDate, addDays(eventDate, anchor.days));
    }
    case 'from-age': {
      const birthDate = context.birthDate;
      if (birthDate === null || birthDate === undefined) {
        return { kind: 'needs-data', missing: 'birthDate' };
      }
      const since = addYears(birthDate, anchor.years);
      const daysUntil = daysBetween(context.today, since);
      return daysUntil > 0
        ? { kind: 'not-yet', from: since, daysUntil }
        : { kind: 'in-force', since };
    }
    default: {
      const exhaustive: never = anchor;
      throw new Error(`Необработанный якорь: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function appliesToStudent(
  obligation: Obligation,
  student: { grade: Grade; isForeign: boolean },
): boolean {
  const target = obligation.appliesTo;
  if (target === 'wszyscy') return true;
  if (target === 'cudzoziemcy') return student.isForeign;
  return target.grade === student.grade;
}
