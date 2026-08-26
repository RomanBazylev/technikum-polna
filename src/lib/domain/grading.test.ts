import { describe, expect, it } from 'vitest';
import {
  GRADE_NAMES,
  gradesStillNeeded,
  minPercentFor,
  percentToGrade,
  scoreToGrade,
} from './grading';

describe('шкала § 52 ust. 4 pkt 13', () => {
  const boundaries: ReadonlyArray<[number, number]> = [
    [0, 1],
    [45, 1],
    [46, 2],
    [60, 2],
    [61, 3],
    [75, 3],
    [76, 4],
    [90, 4],
    [91, 5],
    [98, 5],
    [99, 6],
    [100, 6],
  ];

  it.each(boundaries)('%i процентов дают оценку %i', (percent, expected) => {
    expect(percentToGrade(percent)).toBe(expected);
  });

  it('нижние границы совпадают с уставом', () => {
    expect(minPercentFor(2)).toBe(46);
    expect(minPercentFor(6)).toBe(99);
  });

  it('отвергает невозможный процент', () => {
    expect(() => percentToGrade(-1)).toThrow();
    expect(() => percentToGrade(101)).toThrow();
  });
});

describe('баллы в оценку', () => {
  it('18 из 20 это 90 процентов и оценка dobry', () => {
    expect(scoreToGrade(18, 20)).toBe(4);
    expect(GRADE_NAMES[scoreToGrade(18, 20)]).toBe('dobry');
  });

  it('нулевой максимум это ошибка, а не деление на ноль', () => {
    expect(() => scoreToGrade(5, 0)).toThrow();
  });
});

describe('§ 53 ust. 2, минимум три оценки за период', () => {
  it('при одной оценке не хватает двух', () => {
    expect(gradesStillNeeded(1)).toBe(2);
  });

  it('при трёх и более не хватает ничего', () => {
    expect(gradesStillNeeded(3)).toBe(0);
    expect(gradesStillNeeded(9)).toBe(0);
  });
});
