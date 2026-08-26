import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  resolveAnchor,
  resolveAnnualWindow,
  schoolYearStart,
  type ResolutionContext,
} from './obligations';

const base: ResolutionContext = { today: '2026-09-05', schoolEvents: {} };

describe('учебный год', () => {
  it('сентябрь и позже относятся к году, который начался', () => {
    expect(schoolYearStart('2026-09-01')).toBe(2026);
    expect(schoolYearStart('2026-12-31')).toBe(2026);
  });

  it('январь и позже относятся к году, который начался прошлой осенью', () => {
    expect(schoolYearStart('2027-01-01')).toBe(2026);
    expect(schoolYearStart('2027-08-31')).toBe(2026);
  });
});

describe('ежегодное окно', () => {
  it('разворачивается на текущий учебный год', () => {
    expect(resolveAnnualWindow({ from: '09-01', to: '09-15' }, '2026-09-05')).toEqual({
      from: '2026-09-01',
      to: '2026-09-15',
    });
  });

  it('весеннее окно попадает во второй календарный год', () => {
    expect(resolveAnnualWindow({ from: '02-15', to: '04-30' }, '2026-11-20')).toEqual({
      from: '2027-02-15',
      to: '2027-04-30',
    });
  });

  it('окно, пересекающее Новый год, не схлопывается', () => {
    expect(resolveAnnualWindow({ from: '12-20', to: '01-10' }, '2026-12-25')).toEqual({
      from: '2026-12-20',
      to: '2027-01-10',
    });
  });
});

describe('stypendium szkolne, 1-15 сентября', () => {
  const anchor = { kind: 'annual-window', from: '09-01', to: '09-15' } as const;

  it('5 сентября открыто, осталось 10 дней', () => {
    const status = resolveAnchor(anchor, { ...base, today: '2026-09-05' });
    expect(status).toEqual({
      kind: 'open',
      from: '2026-09-01',
      to: '2026-09-15',
      daysLeft: 10,
    });
  });

  it('20 сентября просрочено и показывает следующее окно', () => {
    const status = resolveAnchor(anchor, { ...base, today: '2026-09-20' });
    expect(status).toEqual({
      kind: 'overdue',
      to: '2026-09-15',
      daysSince: 5,
      nextOccurrence: '2027-09-01',
    });
  });

  it('в последний день ещё открыто', () => {
    const status = resolveAnchor(anchor, { ...base, today: '2026-09-15' });
    expect(status.kind).toBe('open');
  });

  it('в конце августа зовёт на ближайший сентябрь, а не на прошлогодний', () => {
    const status = resolveAnchor(anchor, { ...base, today: '2026-08-25' });
    expect(status.kind).toBe('overdue');
    expect(status).toMatchObject({ nextOccurrence: '2026-09-01' });
  });
});

describe('якорь до школьного события', () => {
  const anchor = { kind: 'before-event', event: 'rada-klasyfikacyjna', days: 14 } as const;
  const context: ResolutionContext = {
    today: '2027-06-01',
    schoolEvents: { 'rada-klasyfikacyjna': '2027-06-18' },
  };

  it('срок это дата события минус дни', () => {
    expect(resolveAnchor(anchor, context)).toEqual({
      kind: 'open',
      from: null,
      to: '2027-06-04',
      daysLeft: 3,
    });
  });

  it('после срока просрочено', () => {
    const status = resolveAnchor(anchor, { ...context, today: '2027-06-10' });
    expect(status).toEqual({ kind: 'overdue', to: '2027-06-04', daysSince: 6 });
  });

  it('без даты события честно сообщает о нехватке данных', () => {
    const status = resolveAnchor(anchor, { today: '2027-06-01', schoolEvents: {} });
    expect(status).toEqual({ kind: 'needs-data', missing: 'rada-klasyfikacyjna' });
  });
});

describe('оправдание пропуска, 7 дней после выздоровления', () => {
  const anchor = { kind: 'after-event', event: 'absence-ended', days: 7 } as const;

  it('считается от события, а не от сегодня', () => {
    const status = resolveAnchor(anchor, {
      today: '2026-10-03',
      schoolEvents: {},
      absenceEndedOn: '2026-10-01',
    });
    expect(status).toEqual({
      kind: 'open',
      from: '2026-10-01',
      to: '2026-10-08',
      daysLeft: 5,
    });
  });

  it('на девятый день уже поздно', () => {
    const status = resolveAnchor(anchor, {
      today: '2026-10-10',
      schoolEvents: {},
      absenceEndedOn: '2026-10-01',
    });
    expect(status).toEqual({ kind: 'overdue', to: '2026-10-08', daysSince: 2 });
  });

  it('без даты события просит данные', () => {
    expect(resolveAnchor(anchor, base)).toEqual({
      kind: 'needs-data',
      missing: 'absenceEndedOn',
    });
  });
});

describe('правило, включающееся с возрастом', () => {
  const school = { kind: 'from-age', years: 16 } as const;
  const adult = { kind: 'from-age', years: 18 } as const;
  const birthDate = '2011-03-15';

  it('до дня рождения ещё не действует', () => {
    const status = resolveAnchor(school, { ...base, today: '2026-09-05', birthDate });
    expect(status).toEqual({ kind: 'not-yet', from: '2027-03-15', daysUntil: 191 });
  });

  it('в сам день рождения уже действует', () => {
    const status = resolveAnchor(school, { ...base, today: '2027-03-15', birthDate });
    expect(status).toEqual({ kind: 'in-force', since: '2027-03-15' });
  });

  it('совершеннолетие считается от той же даты', () => {
    const status = resolveAnchor(adult, { ...base, today: '2029-03-14', birthDate });
    expect(status).toEqual({ kind: 'not-yet', from: '2029-03-15', daysUntil: 1 });
  });

  it('без даты рождения просит данные, а не молчит', () => {
    expect(resolveAnchor(school, base)).toEqual({
      kind: 'needs-data',
      missing: 'birthDate',
    });
  });
});

describe('разбор дат', () => {
  it('считает разницу в днях через границу года', () => {
    expect(daysBetween('2026-12-20', '2027-01-10')).toBe(21);
  });

  it('отвергает мусор вместо тихого NaN', () => {
    expect(() => daysBetween('20.12.2026', '2027-01-10')).toThrow();
  });
});
