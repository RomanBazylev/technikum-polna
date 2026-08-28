import {
  lessonsOn,
  nextLesson,
  schoolDayAfter,
  whatToBring,
  weekdayOf,
  type BellConfig,
  type BringItem,
  type Lesson,
  type SubjectRef,
  type Week,
  type Weekday,
} from './timetable';
import {
  findViolations,
  weekStart,
  type AnnouncedTest,
  type RuleViolation,
} from './tests-rules';

export type DailyLesson =
  | { kind: 'during'; lesson: Lesson; minutesLeft: number }
  | { kind: 'upcoming'; lesson: Lesson; minutesUntil: number }
  | { kind: 'done' }
  | { kind: 'no-school' };

export type DailyTest =
  | { kind: 'none' }
  | {
      kind: 'upcoming';
      test: AnnouncedTest;
      daysUntil: number;
      legal: boolean;
      violations: RuleViolation[];
    };

export type DailyBriefing =
  | { kind: 'empty' }
  | {
      kind: 'ready';
      lesson: DailyLesson;
      bringDay: Weekday;
      bring: BringItem[];
      test: DailyTest;
    };

const DAY_MS = 86_400_000;

function localIsoDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysFromToday(today: string, date: string): number {
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${date}T00:00:00Z`);
  return Math.round((end - start) / DAY_MS);
}

function violationAffects(test: AnnouncedTest, violation: RuleViolation): boolean {
  switch (violation.rule) {
    case 'notice':
      return violation.testId === test.id;
    case 'per-day':
      return violation.date === test.date;
    case 'per-week':
      return violation.weekStart === weekStart(test.date);
    default: {
      const exhaustive: never = violation;
      throw new Error(`Необработанное нарушение: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function dailyLesson(now: Date, week: Week, bells: BellConfig): DailyLesson {
  const today = weekdayOf(now);
  const outcome = nextLesson(now, week, bells);
  switch (outcome.kind) {
    case 'during':
      return outcome;
    case 'upcoming':
      if (today !== null && outcome.lesson.day === today) return outcome;
      return today === null || lessonsOn(week, today).length === 0
        ? { kind: 'no-school' }
        : { kind: 'done' };
    case 'empty':
      return { kind: 'no-school' };
    default: {
      const exhaustive: never = outcome;
      throw new Error(`Необработанный исход урока: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function dailyTest(now: Date, tests: readonly AnnouncedTest[]): DailyTest {
  const today = localIsoDate(now);
  const next = [...tests]
    .filter((test) => test.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date))[0];
  if (next === undefined) return { kind: 'none' };

  const violations = findViolations(tests).filter((violation) => violationAffects(next, violation));
  return {
    kind: 'upcoming',
    test: next,
    daysUntil: daysFromToday(today, next.date),
    legal: violations.length === 0,
    violations,
  };
}

/**
 * Весь ответ главной страницы — чистая функция от переданных часов и уже
 * сохранённых данных. Компонент отвечает только за обновление часов.
 */
export function dailyBriefing(
  now: Date,
  week: Week,
  bells: BellConfig,
  subjects: readonly SubjectRef[],
  tests: readonly AnnouncedTest[],
): DailyBriefing {
  if (week.length === 0) return { kind: 'empty' };
  const bringDay = schoolDayAfter(now);
  return {
    kind: 'ready',
    lesson: dailyLesson(now, week, bells),
    bringDay,
    bring: whatToBring(bringDay, week, subjects),
    test: dailyTest(now, tests),
  };
}
