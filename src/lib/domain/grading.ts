/**
 * Шкала оценок Technikum Kinematograficzno-Komputerowego, § 52 ust. 1 и
 * ust. 4 pkt 13 устава. Пороги школьные, а не общенациональные, поэтому
 * при изменении устава правится здесь и падает соответствующий тест.
 */

export type PolishGrade = 1 | 2 | 3 | 4 | 5 | 6;

export const GRADE_NAMES: Record<PolishGrade, string> = {
  1: 'niedostateczny',
  2: 'dopuszczający',
  3: 'dostateczny',
  4: 'dobry',
  5: 'bardzo dobry',
  6: 'celujący',
};

/** Нижняя граница процентов для каждой оценки, § 52 ust. 4 pkt 13. */
const THRESHOLDS: ReadonlyArray<{ min: number; grade: PolishGrade }> = [
  { min: 99, grade: 6 },
  { min: 91, grade: 5 },
  { min: 76, grade: 4 },
  { min: 61, grade: 3 },
  { min: 46, grade: 2 },
  { min: 0, grade: 1 },
];

export function percentToGrade(percent: number): PolishGrade {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error(`Процент должен быть от 0 до 100, получено: ${percent}`);
  }
  for (const threshold of THRESHOLDS) {
    if (percent >= threshold.min) return threshold.grade;
  }
  return 1;
}

export function scoreToGrade(points: number, maxPoints: number): PolishGrade {
  if (maxPoints <= 0) {
    throw new Error('Максимум баллов должен быть больше нуля');
  }
  return percentToGrade((points / maxPoints) * 100);
}

/** Минимальный процент, при котором ещё выставляется эта оценка. */
export function minPercentFor(grade: PolishGrade): number {
  const found = THRESHOLDS.find((threshold) => threshold.grade === grade);
  if (found === undefined) {
    throw new Error(`Неизвестная оценка: ${grade}`);
  }
  return found.min;
}

/**
 * § 53 ust. 2: семестровая или годовая оценка требует не менее трёх текущих.
 * Возвращает, сколько оценок ещё не хватает.
 */
export const MIN_GRADES_PER_PERIOD = 3;

export function gradesStillNeeded(count: number): number {
  return Math.max(0, MIN_GRADES_PER_PERIOD - count);
}
