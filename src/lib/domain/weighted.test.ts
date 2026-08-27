import { describe, expect, it } from 'vitest';
import { canBeClassified, gradeNeededFor, weightedAverage } from './weighted';

const entries = [
  { grade: 3, weight: 1 },
  { grade: 4, weight: 3 },
  { grade: 2, weight: 1 },
] as const;

describe('средневзвешенное', () => {
  it('учитывает веса, а не считает простое среднее', () => {
    // (3*1 + 4*3 + 2*1) / 5 = 3,4, тогда как простое среднее дало бы 3.
    expect(weightedAverage(entries)).toBeCloseTo(3.4, 5);
  });

  it('на пустом списке возвращает null, а не ноль', () => {
    expect(weightedAverage([])).toBeNull();
  });

  it('нулевые веса это ошибка', () => {
    expect(() => weightedAverage([{ grade: 4, weight: 0 }])).toThrow();
  });
});

describe('какая оценка нужна', () => {
  it('находит наименьшую достаточную', () => {
    const outcome = gradeNeededFor(entries, 3.5, 2);
    expect(outcome.kind).toBe('possible');
    if (outcome.kind !== 'possible') throw new Error('ожидался возможный исход');
    expect(outcome.needed).toBe(4);
    expect(outcome.projected).toBeGreaterThanOrEqual(3.5);
  });

  it('честно говорит, когда цель уже достигнута', () => {
    expect(gradeNeededFor(entries, 3, 1).kind).toBe('already-there');
  });

  it('честно говорит, когда цель недостижима одной оценкой', () => {
    const outcome = gradeNeededFor(entries, 5.5, 1);
    expect(outcome.kind).toBe('impossible');
    if (outcome.kind !== 'impossible') throw new Error('ожидался недостижимый исход');
    expect(outcome.bestPossible).toBeLessThan(5.5);
  });

  it('без оценок отвечает нечего считать', () => {
    expect(gradeNeededFor([], 4, 1).kind).toBe('no-grades');
  });

  it('вес будущей оценки влияет на ответ', () => {
    const light = gradeNeededFor(entries, 3.6, 1);
    const heavy = gradeNeededFor(entries, 3.6, 5);
    expect(light.kind).toBe('possible');
    expect(heavy.kind).toBe('possible');
    if (light.kind !== 'possible' || heavy.kind !== 'possible') throw new Error('ожидались оба');
    // Работа с большим весом тянет среднее сильнее, поэтому требует меньшего.
    expect(heavy.needed).toBeLessThanOrEqual(light.needed);
  });
});

describe('§ 53 ust. 2, минимум три оценки', () => {
  it('при двух оценках предупреждает, что итог не выставят', () => {
    expect(canBeClassified(entries.slice(0, 2))).toEqual({ ok: false, missing: 1 });
  });

  it('при трёх всё в порядке', () => {
    expect(canBeClassified(entries)).toEqual({ ok: true, missing: 0 });
  });
});
