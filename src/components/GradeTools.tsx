import { useMemo, useState } from 'preact/hooks';
import { GRADE_NAMES, percentToGrade, type PolishGrade } from '../lib/domain/grading';
import { canBeClassified, gradeNeededFor, weightedAverage, type GradeEntry } from '../lib/domain/weighted';

const DEFAULT_ENTRIES: GradeEntry[] = [
  { grade: 3, weight: 1 },
  { grade: 4, weight: 3 },
];

export default function GradeTools() {
  const [points, setPoints] = useState(18);
  const [maxPoints, setMaxPoints] = useState(24);
  const [entries, setEntries] = useState<GradeEntry[]>(DEFAULT_ENTRIES);
  const [target, setTarget] = useState(4);
  const [futureWeight, setFutureWeight] = useState(2);

  const percent = maxPoints > 0 ? (points / maxPoints) * 100 : 0;
  const grade = maxPoints > 0 ? percentToGrade(Math.min(100, Math.max(0, percent))) : 1;

  const average = useMemo(() => {
    try {
      return weightedAverage(entries);
    } catch {
      return null;
    }
  }, [entries]);

  const outcome = useMemo(() => {
    try {
      return gradeNeededFor(entries, target, futureWeight);
    } catch {
      return { kind: 'no-grades' as const };
    }
  }, [entries, target, futureWeight]);

  const classification = canBeClassified(entries);

  return (
    <>
      <section className="rounded-card border border-[var(--color-line)] p-4">
        <h2 className="font-medium">Punkty na ocenę · Баллы в оценку</h2>
        <p className="mt-1 text-label text-[var(--color-muted)]">Skala z § 52 ust. 4 pkt 13 statutu TKK.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-label">
          <label className="block">
            <span className="text-[var(--color-muted)]">Zdobyte punkty</span>
            <input
              type="number"
              min={0}
              value={points}
              onInput={(e) => setPoints(Math.max(0, Number((e.currentTarget as HTMLInputElement).value)))}
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
            />
          </label>
          <label className="block">
            <span className="text-[var(--color-muted)]">Maksimum</span>
            <input
              type="number"
              min={1}
              value={maxPoints}
              onInput={(e) => setMaxPoints(Math.max(1, Number((e.currentTarget as HTMLInputElement).value)))}
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
            />
          </label>
        </div>

        <p className="mt-4 text-display font-semibold">
          {grade} <span className="text-body font-normal text-[var(--color-muted)]">{GRADE_NAMES[grade]}</span>
        </p>
        <p className="text-label text-[var(--color-faint)]">{percent.toFixed(1)}%</p>
      </section>

      <section className="mt-4 rounded-card border border-[var(--color-line)] p-4">
        <h2 className="font-medium">Jaka ocena jest potrzebna · Какая оценка нужна</h2>
        <p className="mt-1 text-label text-[var(--color-muted)]">
          Librus liczy średnią, ale odwrotnego pytania nie zadaje.
        </p>

        <ul className="mt-3 flex flex-col gap-2">
          {entries.map((entry, index) => (
            <li key={index} className="flex items-center gap-2 text-label">
              <select
                value={String(entry.grade)}
                onChange={(e) => {
                  const value = Number((e.currentTarget as HTMLSelectElement).value) as PolishGrade;
                  setEntries((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, grade: value } : item)),
                  );
                }}
                className="rounded-lg border border-[var(--color-line)] bg-transparent p-2"
              >
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <option key={value} value={String(value)}>
                    {value}
                  </option>
                ))}
              </select>
              <span className="text-[var(--color-faint)]">waga</span>
              <input
                type="number"
                min={1}
                value={entry.weight}
                onInput={(e) => {
                  const value = Math.max(1, Number((e.currentTarget as HTMLInputElement).value));
                  setEntries((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, weight: value } : item)),
                  );
                }}
                className="w-20 rounded-lg border border-[var(--color-line)] bg-transparent p-2"
              />
              <button
                type="button"
                onClick={() => setEntries((prev) => prev.filter((_, i) => i !== index))}
                className="ml-auto rounded border border-[var(--color-line)] px-2 py-1 text-micro"
              >
                Usuń
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setEntries((prev) => [...prev, { grade: 4, weight: 1 }])}
          className="mt-2 rounded-lg border border-[var(--color-line)] px-3 py-1 text-label"
        >
          Dodaj ocenę
        </button>

        <div className="mt-4 grid grid-cols-2 gap-3 text-label">
          <label className="block">
            <span className="text-[var(--color-muted)]">Cel średniej</span>
            <input
              type="number"
              step="0.1"
              min={1}
              max={6}
              value={target}
              onInput={(e) => setTarget(Number((e.currentTarget as HTMLInputElement).value))}
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
            />
          </label>
          <label className="block">
            <span className="text-[var(--color-muted)]">Waga przyszłej oceny</span>
            <input
              type="number"
              min={1}
              value={futureWeight}
              onInput={(e) =>
                setFutureWeight(Math.max(1, Number((e.currentTarget as HTMLInputElement).value)))
              }
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
            />
          </label>
        </div>

        <div className="mt-4 rounded-lg border-l-4 border-[var(--color-accent)] p-3">
          <p className="text-label text-[var(--color-muted)]">
            Średnia ważona: {average === null ? 'brak ocen' : average.toFixed(2)}
          </p>
          <p className="mt-1 font-medium">{describeOutcome(outcome)}</p>
          {classification.ok ? null : (
            <p className="mt-2 text-micro text-[var(--color-muted)]">
              § 53 ust. 2: do wystawienia oceny okresowej brakuje jeszcze {classification.missing}{' '}
              ocen cząstkowych.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

function describeOutcome(outcome: ReturnType<typeof gradeNeededFor>): string {
  switch (outcome.kind) {
    case 'no-grades':
      return 'Dodaj choć jedną ocenę · Добавьте хотя бы одну оценку';
    case 'already-there':
      return 'Cel już osiągnięty · Цель уже достигнута';
    case 'possible':
      return `Wystarczy ${outcome.needed}, wyjdzie ${outcome.projected.toFixed(2)}`;
    case 'impossible':
      return `Jedną oceną się nie da, maksimum ${outcome.bestPossible.toFixed(2)}`;
    default: {
      const exhaustive: never = outcome;
      throw new Error(`Необработанный исход: ${JSON.stringify(exhaustive)}`);
    }
  }
}
