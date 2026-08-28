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

  it('окно, пересекающее начало учебного года, не выворачивается наизнанку', () => {
    // Раньше год считался для каждой границы отдельно, и Dobry Start с окном
    // 1 июля - 30 ноября превращался в 2026-07-01 … 2025-11-30.
    expect(resolveAnnualWindow({ from: '07-01', to: '11-30' }, '2026-08-27')).toEqual({
      from: '2026-07-01',
      to: '2026-11-30',
    });
  });

  it('конец не может оказаться раньше начала ни при каком дне года', () => {
    const anchors = [
      { from: '07-01', to: '11-30' },
      { from: '09-01', to: '09-15' },
      { from: '12-20', to: '01-10' },
      { from: '02-15', to: '04-30' },
      { from: '11-30', to: '07-01' },
    ];
    for (const anchor of anchors) {
      for (const today of ['2026-01-15', '2026-06-30', '2026-08-27', '2026-09-01', '2026-12-31']) {
        const window = resolveAnnualWindow(anchor, today);
        expect(daysBetween(window.from, window.to), `${JSON.stringify(anchor)} @ ${today}`)
          .toBeGreaterThanOrEqual(0);
      }
    }
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

  it('20 сентября зовёт на следующий год и помечает свежий промах', () => {
    const status = resolveAnchor(anchor, { ...base, today: '2026-09-20' });
    expect(status).toEqual({
      kind: 'upcoming',
      from: '2027-09-01',
      to: '2027-09-15',
      daysUntilOpen: 346,
      justMissed: { to: '2026-09-15', daysSince: 5 },
    });
  });

  it('в последний день ещё открыто', () => {
    const status = resolveAnchor(anchor, { ...base, today: '2026-09-15' });
    expect(status.kind).toBe('open');
  });

  it('27 августа показывает ближайший сентябрь, а не прошлогодний промах', () => {
    // Тот самый случай со скриншота: до окна пять дней, а карточка писала
    // «termin minął».
    const status = resolveAnchor(anchor, { ...base, today: '2026-08-27' });
    expect(status).toEqual({
      kind: 'upcoming',
      from: '2026-09-01',
      to: '2026-09-15',
      daysUntilOpen: 5,
    });
  });

  it('промах годовой давности не выдаётся за свежий', () => {
    const status = resolveAnchor(anchor, { ...base, today: '2026-08-27' });
    expect(status).not.toHaveProperty('justMissed');
  });
});

describe('Dobry Start, 1 июля - 30 ноября', () => {
  const anchor = { kind: 'annual-window', from: '07-01', to: '11-30' } as const;

  it('27 августа окно открыто, а не просрочено', () => {
    const status = resolveAnchor(anchor, { ...base, today: '2026-08-27' });
    expect(status).toEqual({
      kind: 'open',
      from: '2026-07-01',
      to: '2026-11-30',
      daysLeft: 95,
    });
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

  // Школа не публикует дату педсовета, поэтому это состояние - обычное, а не
  // исключение. Ученику всё равно надо знать, что просьба подаётся за две
  // недели, и правило показывается вместо жалобы на нехватку данных.
  it('без даты события показывает само правило', () => {
    const status = resolveAnchor(anchor, { today: '2027-06-01', schoolEvents: {} });
    expect(status).toEqual({ kind: 'relative-rule', direction: 'before', days: 14 });
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

  it('пока пропуска не было, показывает срок как правило', () => {
    expect(resolveAnchor(anchor, base)).toEqual({
      kind: 'relative-rule',
      direction: 'after',
      days: 7,
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

  it('без даты рождения просит именно её, а не молчит', () => {
    expect(resolveAnchor(school, base)).toEqual({ kind: 'needs-birth-date' });
  });
});

describe('постоянное право без срока', () => {
  const anchor = { kind: 'always' } as const;

  it('никогда не горит и не устаревает', () => {
    for (const today of ['2026-09-05', '2027-02-14', '2030-12-31']) {
      expect(resolveAnchor(anchor, { ...base, today })).toEqual({ kind: 'standing' });
    }
  });

  it('не требует ни даты рождения, ни школьных событий', () => {
    expect(resolveAnchor(anchor, { today: '2026-09-05', schoolEvents: {} }).kind).toBe(
      'standing',
    );
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
