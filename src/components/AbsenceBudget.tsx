import { useMemo } from 'preact/hooks';
import { classificationRisk } from '../lib/domain/attendance';
import { browserStorage, loadState } from '../lib/state/appState';
import { useAppState } from '../lib/state/useAppState';
import { godzin } from '../lib/pl';

/**
 * Не «у тебя 82 процента», а «по математике можно пропустить ещё 11 часов».
 * Формулировка союзника, а не доносчика: приложение на стороне ученика.
 *
 * Порог поведения по § 58 живёт на главной: он верен без единого ввода, а этот
 * счёт требует числа часов по предмету и потому остаётся калькулятором.
 */
export default function AbsenceBudget() {
  const { state, ready, update } = useAppState();
  const { plannedHours, missedHours } = state.calculators.absenceBudget;
  const setValue = (patch: Partial<typeof state.calculators.absenceBudget>) => {
    update((previous) => {
      const storage = browserStorage();
      const current = storage === null ? previous : loadState(storage).state;
      return {
        ...current,
        calculators: {
          ...current.calculators,
          absenceBudget: { ...current.calculators.absenceBudget, ...patch },
        },
      };
    });
  };

  const risk = useMemo(() => {
    if (plannedHours <= 0) return null;
    return classificationRisk({ plannedHours, missedHours });
  }, [plannedHours, missedHours]);

  return (
    <section className="rounded-tile border border-[var(--color-line)] bg-[var(--color-ink-soft)] p-5">
      <h2 className="text-title font-semibold">Ile jeszcze mogę opuścić</h2>
      <p className="mt-0.5 text-micro text-[var(--color-faint)]">Сколько ещё можно пропустить</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field
          label="Godzin przedmiotu"
          value={plannedHours}
          onChange={(value) => setValue({ plannedHours: value })}
          min={1}
          disabled={!ready}
        />
        <Field
          label="Opuszczono razem"
          value={missedHours}
          onChange={(value) => setValue({ missedHours: value })}
          disabled={!ready}
        />
      </div>

      {risk === null ? null : (
        <div className="mt-4">
          <p
            className="text-display font-semibold"
            style={{ color: risk.atRisk ? 'var(--color-bad)' : 'var(--color-good)' }}
          >
            {risk.atRisk ? 'Próg przekroczony' : godzin(risk.hoursLeft)}
          </p>
          <p className="mt-1 text-body text-[var(--color-muted)]">
            {risk.atRisk
              ? 'Grozi nieklasyfikowanie z tego przedmiotu.'
              : `Tyle jeszcze możesz opuścić z tego przedmiotu, licząc od zera.`}
          </p>
          <p className="mt-3 text-micro text-[var(--color-faint)]">
            § 54 ust. 1: nieobecność powyżej połowy godzin, czyli powyżej {risk.thresholdHours}.
            Usprawiedliwienie tu nie pomaga, liczy się sama nieobecność.
          </p>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  min = 0,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-label text-[var(--color-muted)]">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        disabled={disabled}
        onInput={(event) => {
          const raw = Number((event.currentTarget as HTMLInputElement).value);
          onChange(Number.isFinite(raw) ? Math.max(min, raw) : min);
        }}
        className="mt-1 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-ink-raised)] p-2.5 text-body tabular-nums"
      />
    </label>
  );
}
