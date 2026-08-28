/**
 * Бюджет пропусков по уставу TKK. Считается сразу против двух независимых
 * порогов, потому что ученика бьют оба и по-разному:
 *
 * § 54 ust. 1 - неаттестация по предмету при пропуске больше половины часов,
 * независимо от того, оправданы пропуски или нет.
 *
 * § 58 - оценка поведения, где считаются только неоправданные часы, и там
 * лестница из пяти порогов плюс отдельный счёт опозданий.
 *
 * Librus фиксирует пропуски, но ничего о последствиях не думает. Пороги берутся
 * из устава конкретной школы, поэтому национальный поставщик такого и не делает.
 */

export type BehaviourGrade =
  | 'wzorowe'
  | 'bardzo dobre'
  | 'dobre'
  | 'poprawne'
  | 'nieodpowiednie'
  | 'naganne';

/** § 58: верхняя граница неоправданных часов и опозданий за полугодие. */
export const BEHAVIOUR_LADDER: ReadonlyArray<{
  grade: BehaviourGrade;
  maxUnexcusedHours: number;
  maxLateArrivals: number;
}> = [
  { grade: 'wzorowe', maxUnexcusedHours: 0, maxLateArrivals: 5 },
  { grade: 'bardzo dobre', maxUnexcusedHours: 7, maxLateArrivals: 7 },
  { grade: 'dobre', maxUnexcusedHours: 15, maxLateArrivals: 10 },
  { grade: 'poprawne', maxUnexcusedHours: 30, maxLateArrivals: 15 },
  { grade: 'nieodpowiednie', maxUnexcusedHours: 50, maxLateArrivals: Number.POSITIVE_INFINITY },
];

export type BehaviourOutlook = {
  /** Лучшая достижимая оценка при текущих числах. */
  attainable: BehaviourGrade;
  /** Сколько ещё неоправданных часов до потери текущего уровня. */
  unexcusedHoursLeft: number;
  /** Сколько ещё опозданий до потери текущего уровня. */
  lateArrivalsLeft: number;
  /** Что именно упирается: часы, опоздания или оба. */
  limitedBy: 'hours' | 'late' | 'both' | 'none';
};

export function behaviourOutlook(
  unexcusedHours: number,
  lateArrivals: number,
): BehaviourOutlook {
  const step = BEHAVIOUR_LADDER.find(
    (item) => unexcusedHours <= item.maxUnexcusedHours && lateArrivals <= item.maxLateArrivals,
  );

  if (step === undefined) {
    return {
      attainable: 'naganne',
      unexcusedHoursLeft: 0,
      lateArrivalsLeft: 0,
      limitedBy: 'both',
    };
  }

  const hoursLeft = step.maxUnexcusedHours - unexcusedHours;
  const lateLeft =
    step.maxLateArrivals === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : step.maxLateArrivals - lateArrivals;

  const limitedBy: BehaviourOutlook['limitedBy'] =
    hoursLeft === 0 && lateLeft === 0
      ? 'both'
      : hoursLeft === 0
        ? 'hours'
        : lateLeft === 0
          ? 'late'
          : 'none';

  return {
    attainable: step.grade,
    unexcusedHoursLeft: hoursLeft,
    lateArrivalsLeft: lateLeft,
    limitedBy,
  };
}

export type SubjectAttendance = {
  /** Часов по предмету запланировано за период. */
  plannedHours: number;
  /** Пропущено всего, включая оправданные: § 54 не делает разницы. */
  missedHours: number;
};

export type ClassificationRisk = {
  /** Порог, после которого наступает неаттестация: строго больше половины. */
  thresholdHours: number;
  /** Сколько ещё часов можно пропустить, оставаясь аттестованным. */
  hoursLeft: number;
  atRisk: boolean;
  missedPercent: number;
};

export function classificationRisk(input: SubjectAttendance): ClassificationRisk {
  if (input.plannedHours <= 0) {
    throw new Error('Количество запланированных часов должно быть больше нуля');
  }
  const half = input.plannedHours / 2;
  // § 54: «nieobecności przekraczającej połowę czasu». Ровно половина ещё не
  // превышение, поэтому допустимый максимум - последнее целое число часов,
  // которое не больше половины.
  const maxAllowed = Math.floor(half);
  return {
    thresholdHours: maxAllowed,
    hoursLeft: Math.max(0, maxAllowed - input.missedHours),
    atRisk: input.missedHours > half,
    missedPercent: (input.missedHours / input.plannedHours) * 100,
  };
}
