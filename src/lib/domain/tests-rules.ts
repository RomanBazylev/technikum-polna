import type { IsoDate } from './types';
import { daysBetween, parseIsoDate } from './obligations';

/**
 * § 52 ust. 4 pkt 3-5 устава: письменная работа объявляется минимум за неделю,
 * и на класс не может приходиться больше одной в день и трёх в неделю.
 * Короткая kartkówka по трём последним темам под ограничение не попадает и
 * может быть без предупреждения.
 */

export type AnnouncedTest = {
  id: string;
  subject: string;
  /** Дата проведения. */
  date: IsoDate;
  /** Когда работу объявили и записали в дневник. */
  announcedOn: IsoDate;
};

export type RuleViolation =
  | { rule: 'notice'; testId: string; noticeDays: number }
  | { rule: 'per-day'; date: IsoDate; count: number }
  | { rule: 'per-week'; weekStart: IsoDate; count: number };

export const MIN_NOTICE_DAYS = 7;
export const MAX_PER_DAY = 1;
export const MAX_PER_WEEK = 3;

/** Понедельник недели, в которую попадает дата. */
export function weekStart(date: IsoDate): IsoDate {
  const parsed = new Date(parseIsoDate(date));
  const day = parsed.getUTCDay();
  const shift = day === 0 ? 6 : day - 1;
  parsed.setUTCDate(parsed.getUTCDate() - shift);
  return parsed.toISOString().slice(0, 10);
}

export function findViolations(tests: readonly AnnouncedTest[]): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const test of tests) {
    const noticeDays = daysBetween(test.announcedOn, test.date);
    if (noticeDays < MIN_NOTICE_DAYS) {
      violations.push({ rule: 'notice', testId: test.id, noticeDays });
    }
  }

  const perDay = new Map<IsoDate, number>();
  const perWeek = new Map<IsoDate, number>();
  for (const test of tests) {
    perDay.set(test.date, (perDay.get(test.date) ?? 0) + 1);
    const week = weekStart(test.date);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }

  for (const [date, count] of perDay) {
    if (count > MAX_PER_DAY) violations.push({ rule: 'per-day', date, count });
  }
  for (const [week, count] of perWeek) {
    if (count > MAX_PER_WEEK) violations.push({ rule: 'per-week', weekStart: week, count });
  }

  return violations;
}
