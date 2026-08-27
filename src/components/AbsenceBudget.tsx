import { useMemo, useState } from 'preact/hooks';
import { behaviourOutlook, classificationRisk } from '../lib/domain/attendance';

/**
 * Не «у тебя 82 процента», а «по математике можно пропустить ещё 11 часов».
 * Формулировка союзника, а не доносчика: приложение на стороне ученика.
 */
export default function AbsenceBudget() {
  const [plannedHours, setPlannedHours] = useState(60);
  const [missedHours, setMissedHours] = useState(8);
  const [unexcusedHours, setUnexcusedHours] = useState(3);
  const [lateArrivals, setLateArrivals] = useState(2);

  const risk = useMemo(() => {
    if (plannedHours <= 0) return null;
    return classificationRisk({ plannedHours, missedHours });
  }, [plannedHours, missedHours]);

  const behaviour = useMemo(
    () => behaviourOutlook(unexcusedHours, lateArrivals),
    [unexcusedHours, lateArrivals],
  );

  return (
    <section className="rounded-xl border border-[var(--color-line)] p-4">
      <h2 className="font-medium">Budżet nieobecności · Бюджет пропусков</h2>
      <p className="mt-1 text-sm opacity-70">
        Dwa progi działają niezależnie: klasyfikacja liczy wszystkie godziny, zachowanie tylko
        nieusprawiedliwione.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Field label="Godzin przedmiotu" value={plannedHours} onChange={setPlannedHours} min={1} />
        <Field label="Opuszczono razem" value={missedHours} onChange={setMissedHours} />
        <Field
          label="W tym nieusprawiedliwione"
          value={unexcusedHours}
          onChange={setUnexcusedHours}
        />
        <Field label="Spóźnienia" value={lateArrivals} onChange={setLateArrivals} />
      </div>

      {risk === null ? null : (
        <div
          className={`mt-4 rounded-lg border-l-4 p-3 ${
            risk.atRisk ? 'border-[var(--color-bad)]' : 'border-[var(--color-good)]'
          }`}
        >
          <p className="font-medium">
            {risk.atRisk
              ? 'Próg przekroczony, grozi nieklasyfikowanie'
              : `Możesz opuścić jeszcze ${risk.hoursLeft} godz.`}
          </p>
          <p className="text-sm opacity-70">
            {risk.atRisk
              ? 'Порог превышен, грозит неаттестация'
              : `Можно пропустить ещё ${risk.hoursLeft} часов`}
          </p>
          <p className="mt-1 text-xs opacity-60">
            § 54 ust. 1: nieobecność powyżej połowy godzin, czyli powyżej {risk.thresholdHours}.
            Usprawiedliwienie tu nie pomaga, liczy się sama nieobecność.
          </p>
        </div>
      )}

      <div className="mt-3 rounded-lg border-l-4 border-[var(--color-accent)] p-3">
        <p className="font-medium">
          Zachowanie: najwyżej {behaviour.attainable}
        </p>
        <p className="mt-1 text-sm opacity-80">
          {behaviour.limitedBy === 'hours' || behaviour.limitedBy === 'both'
            ? 'Kolejna nieusprawiedliwiona godzina obniża próg.'
            : `Jeszcze ${behaviour.unexcusedHoursLeft} godz. do obniżenia progu.`}{' '}
          {behaviour.lateArrivalsLeft === Number.POSITIVE_INFINITY
            ? null
            : `Spóźnień w zapasie: ${behaviour.lateArrivalsLeft}.`}
        </p>
        <p className="mt-1 text-xs opacity-60">
          § 58: wzorowe wymaga zera nieusprawiedliwionych godzin, dalej progi 7, 15, 30 i 50.
        </p>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <label className="block">
      <span className="opacity-80">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onInput={(event) => {
          const raw = Number((event.currentTarget as HTMLInputElement).value);
          onChange(Number.isFinite(raw) ? Math.max(min, raw) : min);
        }}
        className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
      />
    </label>
  );
}
