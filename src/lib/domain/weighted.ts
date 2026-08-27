import { MIN_GRADES_PER_PERIOD, type PolishGrade } from './grading';

/**
 * Средневзвешенное и обратная к нему задача. Librus среднее считает, но
 * ответить на вопрос «что мне нужно получить, чтобы вышла четвёрка» не умеет,
 * а спрашивает это каждый ученик каждую четверть.
 */

export type GradeEntry = { grade: PolishGrade; weight: number };

export function weightedAverage(entries: readonly GradeEntry[]): number | null {
  if (entries.length === 0) return null;
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Суммарный вес оценок должен быть больше нуля');
  }
  const total = entries.reduce((sum, entry) => sum + entry.grade * entry.weight, 0);
  return total / totalWeight;
}

export type TargetOutcome =
  | { kind: 'already-there'; average: number }
  | { kind: 'possible'; needed: PolishGrade; average: number; projected: number }
  | { kind: 'impossible'; average: number; bestPossible: number }
  | { kind: 'no-grades' };

/**
 * Какую оценку с заданным весом надо получить, чтобы средневзвешенное
 * достигло цели. Возвращает наименьшую достаточную, а не любую подходящую.
 */
export function gradeNeededFor(
  entries: readonly GradeEntry[],
  target: number,
  weight: number,
): TargetOutcome {
  if (weight <= 0) {
    throw new Error('Вес будущей оценки должен быть больше нуля');
  }
  const average = weightedAverage(entries);
  if (average === null) return { kind: 'no-grades' };
  if (average >= target) return { kind: 'already-there', average };

  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const total = entries.reduce((sum, entry) => sum + entry.grade * entry.weight, 0);
  const projectedWith = (grade: PolishGrade): number =>
    (total + grade * weight) / (totalWeight + weight);

  const candidates: PolishGrade[] = [1, 2, 3, 4, 5, 6];
  for (const grade of candidates) {
    const projected = projectedWith(grade);
    if (projected >= target) {
      return { kind: 'possible', needed: grade, average, projected };
    }
  }
  return { kind: 'impossible', average, bestPossible: projectedWith(6) };
}

/**
 * § 53 ust. 2: семестровая оценка требует не менее трёх текущих.
 * Считать среднее по одной-двум оценкам можно, но выставить итог нельзя,
 * и об этом стоит предупредить, а не молча показать красивое число.
 */
export function canBeClassified(entries: readonly GradeEntry[]): {
  ok: boolean;
  missing: number;
} {
  const missing = Math.max(0, MIN_GRADES_PER_PERIOD - entries.length);
  return { ok: missing === 0, missing };
}
