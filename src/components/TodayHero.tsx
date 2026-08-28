import { useEffect, useMemo, useState } from 'preact/hooks';
import { BEHAVIOUR_LADDER, behaviourOutlook, type BehaviourGrade } from '../lib/domain/attendance';
import { dailyBriefing, type DailyBriefing, type DailyLesson } from '../lib/domain/daily';
import {
  WEEKDAY_NAME,
  formatMinutes,
  slotWindow,
  type SubjectRef,
} from '../lib/domain/timetable';
import type { RuleViolation } from '../lib/domain/tests-rules';
import { useAppState } from '../lib/state/useAppState';
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
const TICK_MS = 30_000;

type Props = {
  subjects: SubjectRef[];
  /** ISO-строка только для детерминированных проверок; продакшен передаёт часы браузера. */
  now?: string;
};

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

function BehaviourHero({ now }: { now: Date | null }) {
  const [unexcused, setUnexcused] = useState(0);
  const [late, setLate] = useState(0);

  const countdown = useMemo(() => (now === null ? null : daysToSchoolYear(now)), [now]);
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

function testBasis(violations: readonly RuleViolation[]): string {
  const paragraphs = new Set<string>();
  for (const violation of violations) {
    switch (violation.rule) {
      case 'notice':
        paragraphs.add('§ 52 ust. 4 pkt 3');
        break;
      case 'per-day':
      case 'per-week':
        paragraphs.add('§ 52 ust. 4 pkt 5');
        break;
      default: {
        const exhaustive: never = violation;
        throw new Error(`Необработанное нарушение: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
  return [...paragraphs].join(', ');
}

function LessonNow({
  lesson,
  subjectOf,
  bells,
}: {
  lesson: DailyLesson;
  subjectOf: (id: string) => SubjectRef | undefined;
  bells: Parameters<typeof slotWindow>[1];
}) {
  switch (lesson.kind) {
    case 'during': {
      const subject = subjectOf(lesson.lesson.subjectId);
      const end = formatMinutes(slotWindow(lesson.lesson.slot, bells).end);
      return (
        <>
          <p className="text-micro font-medium uppercase tracking-[0.14em] text-[var(--color-faint)]">
            Teraz · Сейчас
          </p>
          <p className="mt-1 text-display font-semibold text-[var(--color-good)]">
            {subject?.pl ?? lesson.lesson.subjectId}
          </p>
          <p className="mt-1 text-label text-[var(--color-muted)]">
            {subject?.ru ?? lesson.lesson.subjectId} · do {end}
            {lesson.lesson.room === undefined ? '' : ` · sala ${lesson.lesson.room}`}
          </p>
        </>
      );
    }
    case 'upcoming': {
      const subject = subjectOf(lesson.lesson.subjectId);
      const start = formatMinutes(slotWindow(lesson.lesson.slot, bells).start);
      return (
        <>
          <p className="text-micro font-medium uppercase tracking-[0.14em] text-[var(--color-faint)]">
            Następna lekcja · Следующий урок
          </p>
          <p className="mt-1 text-display font-semibold text-[var(--color-accent)]">
            {subject?.pl ?? lesson.lesson.subjectId}
          </p>
          <p className="mt-1 text-label text-[var(--color-muted)]">
            {subject?.ru ?? lesson.lesson.subjectId} · {start}
            {lesson.lesson.room === undefined ? '' : ` · sala ${lesson.lesson.room}`}
          </p>
        </>
      );
    }
    case 'done':
      return (
        <>
          <p className="text-micro font-medium uppercase tracking-[0.14em] text-[var(--color-faint)]">
            Lekcje · Уроки
          </p>
          <p className="mt-1 text-title font-semibold text-[var(--color-good)]">
            Na dziś koniec · На сегодня всё
          </p>
        </>
      );
    case 'no-school':
      return (
        <>
          <p className="text-micro font-medium uppercase tracking-[0.14em] text-[var(--color-faint)]">
            Lekcje · Уроки
          </p>
          <p className="mt-1 text-title font-semibold text-[var(--color-good)]">
            Dziś bez lekcji · Сегодня без уроков
          </p>
        </>
      );
    default: {
      const exhaustive: never = lesson;
      throw new Error(`Необработанное состояние урока: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function DailyHero({
  briefing,
  subjects,
  bells,
}: {
  briefing: Extract<DailyBriefing, { kind: 'ready' }>;
  subjects: SubjectRef[];
  bells: Parameters<typeof slotWindow>[1];
}) {
  const subjectOf = (id: string): SubjectRef | undefined =>
    subjects.find((subject) => subject.id === id);
  const test = briefing.test;

  return (
    <section className="rounded-tile border border-[var(--color-line-strong)] bg-[var(--color-ink-raised)] p-5">
      <LessonNow lesson={briefing.lesson} subjectOf={subjectOf} bells={bells} />

      <div className="mt-5 border-t border-[var(--color-line-strong)] pt-4">
        <p className="text-micro font-medium uppercase tracking-[0.12em] text-[var(--color-faint)]">
          Na {WEEKDAY_NAME[briefing.bringDay].plAcc} · На{' '}
          {WEEKDAY_NAME[briefing.bringDay].ruAcc}
        </p>
        {briefing.bring.length === 0 ? (
          <p className="mt-1 text-label">Nic z podręczników · Из учебников ничего</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5 text-label">
            {briefing.bring.map((item) => (
              <li key={item.textbook}>
                <span className="font-medium">{item.textbook}</span>
                <span className="block text-micro text-[var(--color-muted)]">
                  {item.subjects.join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t border-[var(--color-line-strong)] pt-4">
        <p className="text-micro font-medium uppercase tracking-[0.12em] text-[var(--color-faint)]">
          Najbliższa praca · Ближайшая работа
        </p>
        {test.kind === 'none' ? (
          <p className="mt-1 text-label">
            Brak zapowiedzianych prac · Объявленных работ нет
          </p>
        ) : (
          <>
            <p className="mt-1 font-medium">
              {subjectOf(test.test.subject)?.pl ?? test.test.subject} ·{' '}
              {test.daysUntil === 0
                ? 'dzisiaj'
                : test.daysUntil === 1
                  ? 'jutro'
                  : `za ${dni(test.daysUntil)}`}
            </p>
            <p className="text-micro text-[var(--color-muted)]">
              {subjectOf(test.test.subject)?.ru ?? test.test.subject} · {test.test.date}
            </p>
            <p
              className={`mt-2 text-label font-medium ${
                test.legal ? 'text-[var(--color-good)]' : 'text-[var(--color-warn)]'
              }`}
            >
              {test.legal
                ? 'Zgodnie ze statutem · По уставу'
                : `Może naruszać ${testBasis(test.violations)} · Возможно нарушение`}
            </p>
          </>
        )}
      </div>

      <a
        href={`${import.meta.env.BASE_URL}plan/`}
        className="mt-5 inline-flex min-h-11 items-center text-label font-medium text-[var(--color-accent)]"
      >
        Otwórz plan · Открыть расписание →
      </a>
    </section>
  );
}

export default function TodayHero({ subjects, now: fixedNow }: Props) {
  const { state, ready } = useAppState();
  const [now, setNow] = useState<Date | null>(() =>
    fixedNow === undefined ? null : new Date(fixedNow),
  );

  useEffect(() => {
    if (fixedNow !== undefined) return;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [fixedNow]);

  const briefing = useMemo(
    () =>
      now === null
        ? { kind: 'empty' as const }
        : dailyBriefing(
            now,
            state.timetable,
            state.settings.bells,
            subjects,
            state.announcedTests,
          ),
    [now, state, subjects],
  );

  return ready && briefing.kind === 'ready' ? (
    <DailyHero briefing={briefing} subjects={subjects} bells={state.settings.bells} />
  ) : (
    <BehaviourHero now={now} />
  );
}
