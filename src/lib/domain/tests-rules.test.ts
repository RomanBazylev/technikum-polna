import { describe, expect, it } from 'vitest';
import { findViolations, weekStart, type AnnouncedTest } from './tests-rules';

const test1: AnnouncedTest = {
  id: 'mat-1',
  subject: 'matematyka',
  date: '2026-10-14',
  announcedOn: '2026-10-05',
};

describe('начало недели', () => {
  it('среда относится к понедельнику той же недели', () => {
    expect(weekStart('2026-10-14')).toBe('2026-10-12');
  });

  it('воскресенье относится к предыдущему понедельнику, а не к следующему', () => {
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
  });

  it('понедельник это он сам', () => {
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });
});

describe('§ 52 ust. 4 pkt 3, объявление минимум за неделю', () => {
  it('девять дней предупреждения нарушением не является', () => {
    expect(findViolations([test1])).toEqual([]);
  });

  it('три дня это нарушение и оно названо', () => {
    const late = { ...test1, announcedOn: '2026-10-11' };
    expect(findViolations([late])).toEqual([
      { rule: 'notice', testId: 'mat-1', noticeDays: 3 },
    ]);
  });

  it('ровно семь дней ещё допустимо', () => {
    const exact = { ...test1, announcedOn: '2026-10-07' };
    expect(findViolations([exact])).toEqual([]);
  });
});

describe('§ 52 ust. 4 pkt 5, не больше одной в день и трёх в неделю', () => {
  it('две работы в один день это нарушение', () => {
    const same = [test1, { ...test1, id: 'fiz-1', subject: 'fizyka' }];
    expect(findViolations(same)).toContainEqual({
      rule: 'per-day',
      date: '2026-10-14',
      count: 2,
    });
  });

  it('четыре работы за неделю это нарушение', () => {
    const week: AnnouncedTest[] = [
      { id: 'a', subject: 'matematyka', date: '2026-10-12', announcedOn: '2026-10-01' },
      { id: 'b', subject: 'fizyka', date: '2026-10-13', announcedOn: '2026-10-01' },
      { id: 'c', subject: 'polski', date: '2026-10-15', announcedOn: '2026-10-01' },
      { id: 'd', subject: 'chemia', date: '2026-10-16', announcedOn: '2026-10-01' },
    ];
    expect(findViolations(week)).toContainEqual({
      rule: 'per-week',
      weekStart: '2026-10-12',
      count: 4,
    });
  });

  it('три работы за неделю в разные дни нарушением не являются', () => {
    const week: AnnouncedTest[] = [
      { id: 'a', subject: 'matematyka', date: '2026-10-12', announcedOn: '2026-10-01' },
      { id: 'b', subject: 'fizyka', date: '2026-10-14', announcedOn: '2026-10-01' },
      { id: 'c', subject: 'polski', date: '2026-10-16', announcedOn: '2026-10-01' },
    ];
    expect(findViolations(week)).toEqual([]);
  });

  it('работы в разные недели не складываются', () => {
    const spread: AnnouncedTest[] = [
      { id: 'a', subject: 'matematyka', date: '2026-10-15', announcedOn: '2026-10-01' },
      { id: 'b', subject: 'fizyka', date: '2026-10-16', announcedOn: '2026-10-01' },
      { id: 'c', subject: 'polski', date: '2026-10-19', announcedOn: '2026-10-01' },
      { id: 'd', subject: 'chemia', date: '2026-10-20', announcedOn: '2026-10-01' },
    ];
    expect(findViolations(spread)).toEqual([]);
  });
});
