import { useMemo, useState } from 'preact/hooks';
import { BEHAVIOUR_LADDER, behaviourOutlook, type BehaviourGrade } from '../lib/domain/attendance';
import { dni, godzin, spoznien } from '../lib/pl';

/**
 * Первое, что видит гость: не список чужих заявлений, а работающий ответ.
 * Лестница § 58 верна без единого ввода, потому что нулевые пропуски - это
 * тоже позиция на ней, и подсказывает то, чего не скажет ни один взрослый:
 * первый неоправданный час стоит дороже следующих семи.
 *
 * Счётчик живёт только в памяти вкладки. Приложение, которое запоминает, сколько
 * ты прогулял, работает на родителя, а не на ученика.
 */

const GRADE_COLOUR: Record<BehaviourGrade, string> = {
  wzorowe: 'var(--color-good)',
  'bardzo dobre': 'var(--color-good)',
  dobre: 'var(--color-accent)',
  poprawne: 'var(--color-warn)',
  nieodpowiednie: 'var(--color-warn)',
  naganne: 'var(--color-bad)',
};

const DAY_MS = 86_400_000;

/** Дней до ближайшего 1 сентября, если оно достаточно близко, чтобы это значило. */
function daysToSchoolYear(now: Date): number | null {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = Date.UTC(now.getFullYear(), 8, 1);
  const start = today <= thisYear ? thisYear : Date.UTC(now.getFullYear() + 1, 8, 1);
  const days = Math.round((start - today) / DAY_MS);
  return days <= 45 ? days : null;
}

function nextStep(grade: BehaviourGrade): { grade: BehaviourGrade; hours: number } | null {
  const index = BEHAVIOUR_LADDER.findIndex((step) => step.grade === grade);
  const next = index === -1 ? undefined : BEHAVIOUR_LADDER[index + 1];
  return next === undefined ? null : { grade: next.grade, hours: next.maxUnexcusedHours };
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <p className="text-micro text-[var(--color-faint)]">{label}</p>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          aria-label={`${label}: mniej`}
          disabled={value === 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="h-10 w-10 rounded-lg border border-[var(--color-line-strong)] text-title leading-none disabled:opacity-30"
        >
          −
        </button>
        <span className="min-w-9 text-center text-title font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`${label}: więcej`}
          onClick={() => onChange(value + 1)}
          className="h-10 w-10 rounded-lg border border-[var(--color-line-strong)] text-title leading-none"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function TodayHero() {
  const [unexcused, setUnexcused] = useState(0);
  const [late, setLate] = useState(0);

  const countdown = useMemo(() => daysToSchoolYear(new Date()), []);
  const outlook = useMemo(() => behaviourOutlook(unexcused, late), [unexcused, late]);
  const step = nextStep(outlook.attainable);
  const colour = GRADE_COLOUR[outlook.attainable];
  // naganne в лестнице нет, это падение с последней ступени, поэтому полоса
  // закрашивается целиком, а не остаётся пустой.
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
        // Пока отсчёт идёт, самый нужный ответ - что происходит первого сентября
        // и что взять с собой. Он лежит четвёртой вкладкой, куда никто не
        // полезет, поэтому плашка ведёт прямо в статью и исчезает вместе с ней.
        <a
          href={`${import.meta.env.BASE_URL}szkola/#pierwszy-tydzien`}
          className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent-soft)] px-3.5 py-1.5 text-micro font-semibold uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          {countdown === 0 ? 'Dziś zaczyna się rok' : `1 września za ${dni(countdown)}`}
          <span aria-hidden="true">· co wziąć →</span>
        </a>
      )}

      <p className="text-micro font-medium uppercase tracking-[0.14em] text-[var(--color-faint)]">
        Zachowanie · Поведение
      </p>
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
        <Stepper label="godziny bez usprawiedliwienia" value={unexcused} onChange={setUnexcused} />
        <Stepper label="spóźnienia" value={late} onChange={setLate} />
      </div>

      <p className="mt-4 text-micro text-[var(--color-faint)]">
        § 58 statutu TKK. Liczy się w tej karcie i nigdzie nie jest zapisywane.
      </p>
    </section>
  );
}
