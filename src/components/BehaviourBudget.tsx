import { useMemo } from 'preact/hooks';
import { BEHAVIOUR_LADDER, behaviourOutlook, type BehaviourGrade } from '../lib/domain/attendance';
import { dni, godzin, spoznien } from '../lib/pl';
import { browserStorage, loadState } from '../lib/state/appState';
import { useAppState } from '../lib/state/useAppState';

const GRADE_COLOUR: Record<BehaviourGrade, string> = {
  wzorowe: 'var(--color-good)',
  'bardzo dobre': 'var(--color-good)',
  dobre: 'var(--color-accent)',
  poprawne: 'var(--color-warn)',
  nieodpowiednie: 'var(--color-warn)',
  naganne: 'var(--color-bad)',
};

type Props = {
  countdown?: number | null;
};

function nextStep(grade: BehaviourGrade): { grade: BehaviourGrade; hours: number } | null {
  const index = BEHAVIOUR_LADDER.findIndex((step) => step.grade === grade);
  const next = index === -1 ? undefined : BEHAVIOUR_LADDER[index + 1];
  return next === undefined ? null : { grade: next.grade, hours: next.maxUnexcusedHours };
}

function Stepper({
  label,
  value,
  onChange,
  enabled,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  enabled: boolean;
}) {
  return (
    <div>
      <p className="text-micro text-[var(--color-faint)]">{label}</p>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          aria-label={`${label}: mniej`}
          disabled={!enabled || value === 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="h-10 w-10 rounded-lg border border-[var(--color-line-strong)] text-title leading-none disabled:opacity-30"
        >
          −
        </button>
        <span className="min-w-9 text-center text-title font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`${label}: więcej`}
          disabled={!enabled}
          onClick={() => onChange(value + 1)}
          className="h-10 w-10 rounded-lg border border-[var(--color-line-strong)] text-title leading-none disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function BehaviourBudget({ countdown = null }: Props) {
  const { state, ready, update } = useAppState();
  const { unexcusedHours, lateArrivals } = state.calculators.behaviourBudget;
  const setValue = (patch: Partial<typeof state.calculators.behaviourBudget>) => {
    update((previous) => {
      const storage = browserStorage();
      const current = storage === null ? previous : loadState(storage).state;
      return {
        ...current,
        calculators: {
          ...current.calculators,
          behaviourBudget: { ...current.calculators.behaviourBudget, ...patch },
        },
      };
    });
  };

  const outlook = useMemo(
    () => behaviourOutlook(unexcusedHours, lateArrivals),
    [unexcusedHours, lateArrivals],
  );
  const step = nextStep(outlook.attainable);
  const colour = GRADE_COLOUR[outlook.attainable];
  const rung = BEHAVIOUR_LADDER.findIndex((item) => item.grade === outlook.attainable);
  const position = rung === -1 ? BEHAVIOUR_LADDER.length - 1 : rung;

  const spare =
    outlook.lateArrivalsLeft === Number.POSITIVE_INFINITY
      ? godzin(outlook.unexcusedHoursLeft)
      : `${godzin(outlook.unexcusedHoursLeft)} i ${spoznien(outlook.lateArrivalsLeft)}`;
  const consequence =
    outlook.limitedBy === 'none'
      ? `Zapas: ${spare}.`
      : step === null
        ? 'Niżej już nie ma.'
        : `Kolejna nieusprawiedliwiona godzina zbija na ${step.grade}, gdzie zapas to ${godzin(step.hours)}.`;

  return (
    <section className="rounded-tile border border-[var(--color-line-strong)] bg-[var(--color-ink-raised)] p-5">
      {countdown === null ? null : (
        <a
          href={`${import.meta.env.BASE_URL}szkola/pierwszy-tydzien/`}
          className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent-soft)] px-3.5 py-1.5 text-micro font-semibold uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          {countdown === 0 ? 'Dziś zaczyna się rok' : `1 września za ${dni(countdown)}`}
          <span aria-hidden="true">· co wziąć →</span>
        </a>
      )}

      <h2 className="text-micro font-medium uppercase tracking-[0.14em] text-[var(--color-faint)]">
        Zachowanie · Поведение
      </h2>
      <p className="mt-1 text-display font-semibold" style={{ color: colour }}>
        {outlook.attainable}
      </p>
      <p className="mt-2 text-body text-[var(--color-muted)]">{consequence}</p>

      <ol className="mt-4 flex gap-1" aria-hidden="true">
        {BEHAVIOUR_LADDER.map((item, index) => (
          <li
            key={item.grade}
            className="h-1.5 grow rounded-full"
            style={{ background: index <= position ? colour : 'var(--color-line)' }}
          />
        ))}
      </ol>

      <div className="mt-4 flex gap-6">
        <Stepper
          label="godziny bez usprawiedliwienia"
          value={unexcusedHours}
          onChange={(value) => setValue({ unexcusedHours: value })}
          enabled={ready}
        />
        <Stepper
          label="spóźnienia"
          value={lateArrivals}
          onChange={(value) => setValue({ lateArrivals: value })}
          enabled={ready}
        />
      </div>

      <p className="mt-4 text-micro text-[var(--color-faint)]">
        § 58 statutu TKK. Wartości zostają na tym urządzeniu i są uwzględniane w eksporcie JSON.
      </p>
    </section>
  );
}
