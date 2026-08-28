import { describe, expect, it } from 'vitest';
import { dailyBriefing } from './daily';
import {
  DEFAULT_BELLS,
  lessonId,
  type Lesson,
  type SubjectRef,
  type Weekday,
} from './timetable';
import type { AnnouncedTest } from './tests-rules';

const lesson = (day: Weekday, slot: number, subjectId: string): Lesson => ({
  id: lessonId(day, slot),
  day,
  slot,
  subjectId,
});

const week: Lesson[] = [
  lesson('pon', 1, 'matematyka'),
  lesson('pon', 2, 'fizyka'),
  lesson('wt', 1, 'jezyk-polski'),
];

const subjects: SubjectRef[] = [
  { id: 'matematyka', pl: 'Matematyka', ru: 'Математика', textbook: 'Matematyka 1' },
  { id: 'fizyka', pl: 'Fizyka', ru: 'Физика', textbook: 'Fizyka 1' },
  { id: 'jezyk-polski', pl: 'Język polski', ru: 'Польский', textbook: 'Przeszłość i dziś' },
];

const at = (day: number, hour: number, minute: number): Date =>
  new Date(2026, 8, day, hour, minute);

describe('сводка дня', () => {
  it('на пустом расписании оставляет главной прежнее пустое состояние', () => {
    expect(dailyBriefing(at(7, 8, 0), [], DEFAULT_BELLS, subjects, [])).toEqual({
      kind: 'empty',
    });
  });

  it('до урока показывает ближайший урок сегодняшнего дня', () => {
    const briefing = dailyBriefing(at(7, 7, 30), week, DEFAULT_BELLS, subjects, []);

    expect(briefing.kind).toBe('ready');
    if (briefing.kind !== 'ready') throw new Error('ожидалась дневная сводка');
    expect(briefing.lesson).toEqual({
      kind: 'upcoming',
      lesson: week[0],
      minutesUntil: 30,
    });
  });

  it('во время урока показывает текущий урок и остаток времени', () => {
    const briefing = dailyBriefing(at(7, 8, 20), week, DEFAULT_BELLS, subjects, []);

    expect(briefing.kind).toBe('ready');
    if (briefing.kind !== 'ready') throw new Error('ожидалась дневная сводка');
    expect(briefing.lesson).toEqual({
      kind: 'during',
      lesson: week[0],
      minutesLeft: 25,
    });
  });

  it('после последнего урока говорит, что школа на сегодня закончилась', () => {
    const briefing = dailyBriefing(at(7, 16, 0), week, DEFAULT_BELLS, subjects, []);

    expect(briefing.kind).toBe('ready');
    if (briefing.kind !== 'ready') throw new Error('ожидалась дневная сводка');
    expect(briefing.lesson).toEqual({ kind: 'done' });
  });

  it('в день без уроков не притворяется, что занятия уже закончились', () => {
    const briefing = dailyBriefing(at(9, 10, 0), week, DEFAULT_BELLS, subjects, []);

    expect(briefing.kind).toBe('ready');
    if (briefing.kind !== 'ready') throw new Error('ожидалась дневная сводка');
    expect(briefing.lesson).toEqual({ kind: 'no-school' });
  });

  it('собирает книги на следующий учебный день', () => {
    const briefing = dailyBriefing(at(7, 16, 0), week, DEFAULT_BELLS, subjects, []);

    expect(briefing.kind).toBe('ready');
    if (briefing.kind !== 'ready') throw new Error('ожидалась дневная сводка');
    expect(briefing.bringDay).toBe('wt');
    expect(briefing.bring).toEqual([
      { textbook: 'Przeszłość i dziś', subjects: ['Język polski'] },
    ]);
  });

  it('показывает ближайшую будущую работу и результат проверки устава', () => {
    const tests: AnnouncedTest[] = [
      {
        id: 'old',
        subject: 'fizyka',
        date: '2026-09-04',
        announcedOn: '2026-08-20',
      },
      {
        id: 'next',
        subject: 'matematyka',
        date: '2026-09-09',
        announcedOn: '2026-09-06',
      },
    ];
    const briefing = dailyBriefing(at(7, 16, 0), week, DEFAULT_BELLS, subjects, tests);

    expect(briefing.kind).toBe('ready');
    if (briefing.kind !== 'ready') throw new Error('ожидалась дневная сводка');
    expect(briefing.test).toMatchObject({
      kind: 'upcoming',
      test: tests[1],
      daysUntil: 2,
      legal: false,
      violations: [{ rule: 'notice', testId: 'next', noticeDays: 3 }],
    });
  });

  it('помечает работу с недельным предупреждением как законную', () => {
    const tests: AnnouncedTest[] = [
      {
        id: 'next',
        subject: 'matematyka',
        date: '2026-09-14',
        announcedOn: '2026-09-07',
      },
    ];
    const briefing = dailyBriefing(at(7, 16, 0), week, DEFAULT_BELLS, subjects, tests);

    expect(briefing.kind).toBe('ready');
    if (briefing.kind !== 'ready') throw new Error('ожидалась дневная сводка');
    expect(briefing.test).toMatchObject({
      kind: 'upcoming',
      test: tests[0],
      daysUntil: 7,
      legal: true,
      violations: [],
    });
  });

  it('при отсутствии будущих работ отвечает явно, а не оставляет пустое место', () => {
    const tests: AnnouncedTest[] = [
      {
        id: 'old',
        subject: 'fizyka',
        date: '2026-09-04',
        announcedOn: '2026-08-20',
      },
    ];
    const briefing = dailyBriefing(at(7, 16, 0), week, DEFAULT_BELLS, subjects, tests);

    expect(briefing.kind).toBe('ready');
    if (briefing.kind !== 'ready') throw new Error('ожидалась дневная сводка');
    expect(briefing.test).toEqual({ kind: 'none' });
  });
});
