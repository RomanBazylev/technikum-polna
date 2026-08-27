import { describe, expect, it } from 'vitest';
import { behaviourOutlook, classificationRisk } from './attendance';

describe('§ 54 ust. 1, неаттестация при пропуске больше половины часов', () => {
  it('на 60 часах предмета можно пропустить 30, но не 31', () => {
    expect(classificationRisk({ plannedHours: 60, missedHours: 30 })).toMatchObject({
      thresholdHours: 30,
      hoursLeft: 0,
      atRisk: false,
    });
    expect(classificationRisk({ plannedHours: 60, missedHours: 31 }).atRisk).toBe(true);
  });

  it('показывает остаток, а не абстрактный процент', () => {
    const risk = classificationRisk({ plannedHours: 60, missedHours: 19 });
    expect(risk.hoursLeft).toBe(11);
    expect(risk.atRisk).toBe(false);
  });

  it('нечётное число часов округляется в пользу ученика', () => {
    // Половина от 45 это 22,5. Пропуск 22 часов ещё не превышение.
    const risk = classificationRisk({ plannedHours: 45, missedHours: 22 });
    expect(risk.thresholdHours).toBe(22);
    expect(risk.atRisk).toBe(false);
    expect(classificationRisk({ plannedHours: 45, missedHours: 23 }).atRisk).toBe(true);
  });

  it('оправданность пропусков не учитывается, § 54 её не различает', () => {
    const risk = classificationRisk({ plannedHours: 100, missedHours: 51 });
    expect(risk.atRisk).toBe(true);
  });

  it('нулевые часы это ошибка, а не деление на ноль', () => {
    expect(() => classificationRisk({ plannedHours: 0, missedHours: 0 })).toThrow();
  });
});

describe('§ 58, лестница оценки поведения', () => {
  it('образцовое требует ровно нуля неоправданных часов', () => {
    expect(behaviourOutlook(0, 0)).toMatchObject({
      attainable: 'wzorowe',
      unexcusedHoursLeft: 0,
      lateArrivalsLeft: 5,
    });
    expect(behaviourOutlook(1, 0).attainable).toBe('bardzo dobre');
  });

  it('семь часов ещё очень хорошо, восемь уже хорошо', () => {
    expect(behaviourOutlook(7, 0).attainable).toBe('bardzo dobre');
    expect(behaviourOutlook(8, 0).attainable).toBe('dobre');
  });

  it('опоздания ограничивают отдельно от часов', () => {
    // Часов ноль, но шесть опозданий уже снимают образцовое.
    expect(behaviourOutlook(0, 6).attainable).toBe('bardzo dobre');
    expect(behaviourOutlook(0, 6).limitedBy).toBe('none');
  });

  it('показывает, что именно упирается', () => {
    expect(behaviourOutlook(7, 3).limitedBy).toBe('hours');
    expect(behaviourOutlook(3, 7).limitedBy).toBe('late');
    expect(behaviourOutlook(7, 7).limitedBy).toBe('both');
  });

  it('больше пятидесяти часов это уже naganne', () => {
    expect(behaviourOutlook(51, 0).attainable).toBe('naganne');
  });

  it('остаток часов считается до потери текущего уровня', () => {
    expect(behaviourOutlook(10, 2).unexcusedHoursLeft).toBe(5);
  });
});
