import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  MAX_SLOT,
  WEEKDAYS,
  WEEKDAY_NAME,
  formatMinutes,
  lessonAt,
  lessonId,
  nextLesson,
  schoolDayAfter,
  slotWindow,
  whatToBring,
  type BellConfig,
  type NextLesson,
  type SubjectRef,
  type Weekday,
} from '../lib/domain/timetable';
import { useAppState } from '../lib/state/useAppState';

type Props = { subjects: SubjectRef[] };

const MIN_VISIBLE_SLOTS = 6;
const TICK_MS = 30_000;

type GapUnits = { minute: string; hour: string; day: string };

const GAP_UNITS: Record<'pl' | 'ru', GapUnits> = {
  pl: { minute: 'min', hour: 'godz.', day: 'dni' },
  ru: { minute: 'мин', hour: 'ч', day: 'дн.' },
};

function gap(minutes: number, units: GapUnits): string {
  if (minutes < 60) return `${minutes} ${units.minute}`;
  if (minutes < 1440) {
    return `${Math.floor(minutes / 60)} ${units.hour} ${minutes % 60} ${units.minute}`;
  }
  return `${Math.round(minutes / 1440)} ${units.day}`;
}

function describeNext(
  outcome: NextLesson,
  nameOf: (subjectId: string) => string,
  bells: BellConfig,
): { pl: string; ru: string } {
  switch (outcome.kind) {
    case 'during':
      return {
        pl: `Trwa ${nameOf(outcome.lesson.subjectId)}, do dzwonka ${gap(outcome.minutesLeft, GAP_UNITS.pl)}`,
        ru: `Идёт ${nameOf(outcome.lesson.subjectId)}, до звонка ${gap(outcome.minutesLeft, GAP_UNITS.ru)}`,
      };
    case 'upcoming': {
      const start = formatMinutes(slotWindow(outcome.lesson.slot, bells).start);
      const day = WEEKDAY_NAME[outcome.lesson.day];
      return {
        pl: `Następna lekcja: ${nameOf(outcome.lesson.subjectId)}, ${day.pl} ${start}, za ${gap(outcome.minutesUntil, GAP_UNITS.pl)}`,
        ru: `Следующий урок: ${nameOf(outcome.lesson.subjectId)}, ${day.ru} ${start}, через ${gap(outcome.minutesUntil, GAP_UNITS.ru)}`,
      };
    }
    case 'empty':
      return {
        pl: 'Plan jest jeszcze pusty. Wypełnij go poniżej, wtedy policzymy resztę.',
        ru: 'Расписание пока пустое. Заполните его ниже, остальное посчитаем.',
      };
    default: {
      const exhaustive: never = outcome;
      throw new Error(`Необработанный исход: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function timeInputValue(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Расписание живёт только в этом браузере, поэтому и панель «что взять», и
 * обратный отсчёт до звонка стоят здесь же, над сеткой: ответ важнее редактора,
 * а данных для ответа больше нигде нет.
 */
export default function Timetable({ subjects }: Props) {
  const { state, ready, update } = useAppState();
  // Отрисовка на сборке не знает времени визита, поэтому часы включаются
  // только в браузере: иначе в HTML запеклась бы дата сборки.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const nameOf = useMemo(() => {
    const byId = new Map(subjects.map((subject) => [subject.id, subject.pl]));
    return (subjectId: string): string => byId.get(subjectId) ?? subjectId;
  }, [subjects]);

  const bells = state.settings.bells;
  const week = state.timetable;

  const visibleSlots = useMemo(() => {
    const highest = week.reduce((max, lesson) => Math.max(max, lesson.slot), 0);
    const count = Math.min(MAX_SLOT, Math.max(MIN_VISIBLE_SLOTS, highest + 1));
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [week]);

  const upNext = now === null ? null : describeNext(nextLesson(now, week, bells), nameOf, bells);
  const tomorrow = now === null ? null : schoolDayAfter(now);
  const bring = tomorrow === null ? [] : whatToBring(tomorrow, week, subjects);

  const setSubject = (day: Weekday, slot: number, subjectId: string) => {
    update((previous) => {
      const rest = previous.timetable.filter(
        (lesson) => !(lesson.day === day && lesson.slot === slot),
      );
      if (subjectId === '') return { ...previous, timetable: rest };
      const current = lessonAt(previous.timetable, day, slot);
      return {
        ...previous,
        timetable: [...rest, { ...(current ?? {}), id: lessonId(day, slot), day, slot, subjectId }],
      };
    });
  };

  const setField = (day: Weekday, slot: number, field: 'room' | 'teacher', raw: string) => {
    const value = raw === '' ? undefined : raw;
    update((previous) => ({
      ...previous,
      timetable: previous.timetable.map((lesson) => {
        if (lesson.day !== day || lesson.slot !== slot) return lesson;
        return field === 'room' ? { ...lesson, room: value } : { ...lesson, teacher: value };
      }),
    }));
  };

  const setBells = (patch: Partial<BellConfig>) => {
    update((previous) => ({
      ...previous,
      settings: { ...previous.settings, bells: { ...previous.settings.bells, ...patch } },
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-card border-l-4 border-[var(--color-accent)] bg-[var(--color-ink-soft)] p-4">
        <h2 className="font-medium">Do dzwonka · До звонка</h2>
        {upNext === null ? (
          <p className="mt-1 text-label text-[var(--color-faint)]">Liczymy…</p>
        ) : (
          <>
            <p className="mt-1">{upNext.pl}</p>
            <p className="text-label text-[var(--color-muted)]">{upNext.ru}</p>
          </>
        )}
      </section>

      <section className="rounded-card border border-[var(--color-line)] p-4">
        <h2 className="font-medium">
          {tomorrow === null
            ? 'Co wziąć · Что взять'
            : `Na ${WEEKDAY_NAME[tomorrow].plAcc} weź · На ${WEEKDAY_NAME[tomorrow].ruAcc} возьми`}
        </h2>
        {bring.length === 0 ? (
          <p className="mt-1 text-label text-[var(--color-muted)]">
            Nic z podręczników. Albo plan na ten dzień jest pusty, albo te przedmioty nie mają
            wpisanej książki. · Из учебников ничего.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {bring.map((item) => (
              <li key={item.textbook} className="text-label">
                <span className="font-medium">{item.textbook}</span>
                <span className="block text-micro text-[var(--color-faint)]">{item.subjects.join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-[var(--color-line)] p-4">
        <h2 className="font-medium">Plan lekcji · Расписание</h2>
        <p className="mt-1 text-label text-[var(--color-muted)]">
          Szkoła nie publikuje rozkładu dzwonków, więc godziny liczymy z tych dwóch pól. Lekcja trwa
          45 minut, § 21 ust. 6 statutu. · Школа не публикует расписание звонков, поэтому время
          считается из этих двух полей.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 text-label">
          <label className="block">
            <span className="text-[var(--color-muted)]">Pierwsza lekcja o · Первый урок в</span>
            <input
              type="time"
              value={timeInputValue(bells.firstLessonStart)}
              disabled={!ready}
              onInput={(event) => {
                const [hours, minutes] = (event.currentTarget as HTMLInputElement).value.split(':');
                const parsed = Number(hours) * 60 + Number(minutes);
                if (Number.isFinite(parsed)) setBells({ firstLessonStart: parsed });
              }}
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
            />
          </label>
          <label className="block">
            <span className="text-[var(--color-muted)]">Przerwa, minut · Перемена</span>
            <input
              type="number"
              min={0}
              max={60}
              value={bells.breakMinutes}
              disabled={!ready}
              onInput={(event) => {
                const raw = Number((event.currentTarget as HTMLInputElement).value);
                if (Number.isFinite(raw)) {
                  setBells({ breakMinutes: Math.min(60, Math.max(0, Math.round(raw))) });
                }
              }}
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-5 sm:gap-2">
          {WEEKDAYS.map((day) => (
            <div key={day}>
              <h3 className="text-micro font-medium uppercase tracking-wide text-[var(--color-muted)]">
                <span className="sm:hidden">{WEEKDAY_NAME[day].pl}</span>
                <span className="hidden sm:inline">{WEEKDAY_NAME[day].short}</span>
              </h3>
              <div className="mt-2 flex flex-col gap-2">
                {visibleSlots.map((slot) => {
                  const lesson = lessonAt(week, day, slot);
                  const bell = slotWindow(slot, bells);
                  return (
                    <div
                      key={slot}
                      className="rounded-lg border border-[var(--color-line)] p-2 text-label"
                    >
                      <span className="block text-micro text-[var(--color-faint)]">
                        {slot}. {formatMinutes(bell.start)}–{formatMinutes(bell.end)}
                      </span>
                      <select
                        aria-label={`${WEEKDAY_NAME[day].pl}, lekcja ${slot}`}
                        value={lesson?.subjectId ?? ''}
                        disabled={!ready}
                        onChange={(event) =>
                          setSubject(day, slot, (event.currentTarget as HTMLSelectElement).value)
                        }
                        className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-1"
                      >
                        <option value="">—</option>
                        {subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.pl}
                          </option>
                        ))}
                      </select>
                      {lesson === null ? null : (
                        <div className="mt-1 flex gap-1">
                          <input
                            aria-label={`Sala, ${WEEKDAY_NAME[day].pl} ${slot}`}
                            placeholder="sala"
                            value={lesson.room ?? ''}
                            onInput={(event) =>
                              setField(
                                day,
                                slot,
                                'room',
                                (event.currentTarget as HTMLInputElement).value,
                              )
                            }
                            className="w-full min-w-0 rounded border border-[var(--color-line)] bg-transparent p-1 text-micro"
                          />
                          <input
                            aria-label={`Nauczyciel, ${WEEKDAY_NAME[day].pl} ${slot}`}
                            placeholder="nauczyciel"
                            value={lesson.teacher ?? ''}
                            onInput={(event) =>
                              setField(
                                day,
                                slot,
                                'teacher',
                                (event.currentTarget as HTMLInputElement).value,
                              )
                            }
                            className="w-full min-w-0 rounded border border-[var(--color-line)] bg-transparent p-1 text-micro"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-micro text-[var(--color-faint)]">
          Plan zostaje w tej przeglądarce. Nikt go nie widzi, my też nie. · Расписание остаётся в
          этом браузере, его не видит никто, включая нас.
        </p>
      </section>
    </div>
  );
}
