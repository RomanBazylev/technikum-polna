import { useMemo, useState } from 'preact/hooks';
import {
  MIN_NOTICE_DAYS,
  findViolations,
  type AnnouncedTest,
  type RuleViolation,
} from '../lib/domain/tests-rules';
import type { SubjectRef } from '../lib/domain/timetable';
import { useAppState } from '../lib/state/useAppState';

type Props = { subjects: SubjectRef[] };

/**
 * Номер параграфа выводится рядом с каждым нарушением: в разговоре с учителем
 * он весит больше пересказа. Пункт 3 - предупреждение за неделю, пункт 5 -
 * ограничения на количество работ.
 */
const PARAGRAPH = {
  notice: '§ 52 ust. 4 pkt 3',
  count: '§ 52 ust. 4 pkt 5',
} as const;

function describeViolation(
  violation: RuleViolation,
  nameOf: (subjectId: string) => string,
  testById: Map<string, AnnouncedTest>,
): { paragraph: string; pl: string; ru: string } {
  switch (violation.rule) {
    case 'notice': {
      const test = testById.get(violation.testId);
      const subject = test === undefined ? '' : `${nameOf(test.subject)}, `;
      return {
        paragraph: PARAGRAPH.notice,
        pl: `${subject}zapowiedź na ${violation.noticeDays} dni przed pracą. Statut wymaga ${MIN_NOTICE_DAYS}.`,
        ru: `Предупредили за ${violation.noticeDays} дн., устав требует ${MIN_NOTICE_DAYS}.`,
      };
    }
    case 'per-day':
      return {
        paragraph: PARAGRAPH.count,
        pl: `${violation.date}: prac pisemnych ${violation.count}, a w jednym dniu może być tylko jedna.`,
        ru: `${violation.date}: работ ${violation.count}, а в день допускается одна.`,
      };
    case 'per-week':
      return {
        paragraph: PARAGRAPH.count,
        pl: `Tydzień od ${violation.weekStart}: prac pisemnych ${violation.count}, a w tygodniu mogą być najwyżej trzy.`,
        ru: `Неделя с ${violation.weekStart}: работ ${violation.count}, а в неделю допускается три.`,
      };
    default: {
      const exhaustive: never = violation;
      throw new Error(`Необработанное нарушение: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export default function TestRuleCheck({ subjects }: Props) {
  const { state, ready, update } = useAppState();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [announcedOn, setAnnouncedOn] = useState('');

  const nameOf = useMemo(() => {
    const byId = new Map(subjects.map((subject) => [subject.id, subject.pl]));
    return (id: string): string => byId.get(id) ?? id;
  }, [subjects]);

  const tests = state.announcedTests;
  const violations = useMemo(() => findViolations(tests), [tests]);
  const testById = useMemo(() => new Map(tests.map((test) => [test.id, test])), [tests]);

  const complete = subjectId !== '' && date !== '' && announcedOn !== '';

  const add = () => {
    if (!complete) return;
    update((previous) => {
      // Ключ естественный, поэтому повторный ввод той же работы ничего не
      // задваивает и не выдумывает нарушения «две работы в один день».
      const id = `${subjectId}|${date}|${announcedOn}`;
      const rest = previous.announcedTests.filter((test) => test.id !== id);
      return {
        ...previous,
        announcedTests: [...rest, { id, subject: subjectId, date, announcedOn }].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      };
    });
    setDate('');
    setAnnouncedOn('');
  };

  const remove = (id: string) => {
    update((previous) => ({
      ...previous,
      announcedTests: previous.announcedTests.filter((test) => test.id !== id),
    }));
  };

  return (
    <section className="rounded-xl border border-[var(--color-line)] p-4">
      <h2 className="font-medium">Czy ta praca jest legalna · Законна ли эта работа</h2>
      <p className="mt-1 text-sm opacity-70">
        Wpisz zapowiedziane sprawdziany, a policzymy je według statutu. Krótka kartkówka z trzech
        ostatnich tematów pod te limity nie podlega. · Короткая kartkówka из трёх последних тем под
        эти ограничения не попадает.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <label className="block">
          <span className="opacity-80">Przedmiot · Предмет</span>
          <select
            value={subjectId}
            disabled={!ready}
            onChange={(event) => setSubjectId((event.currentTarget as HTMLSelectElement).value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.pl}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="opacity-80">Data pracy · Дата работы</span>
          <input
            type="date"
            value={date}
            disabled={!ready}
            onInput={(event) => setDate((event.currentTarget as HTMLInputElement).value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
          />
        </label>
        <label className="block">
          <span className="opacity-80">Zapowiedziano · Объявили</span>
          <input
            type="date"
            value={announcedOn}
            disabled={!ready}
            onInput={(event) => setAnnouncedOn((event.currentTarget as HTMLInputElement).value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={add}
        disabled={!complete}
        className="mt-3 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm disabled:opacity-40"
      >
        Dodaj pracę · Добавить работу
      </button>

      {violations.length === 0 ? (
        <p className="mt-4 rounded-lg border-l-4 border-[var(--color-good)] p-3 text-sm">
          {tests.length === 0
            ? 'Nic jeszcze nie wpisano. · Пока ничего не записано.'
            : 'Wszystko zgodne ze statutem. · Всё по уставу.'}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {violations.map((violation) => {
            const described = describeViolation(violation, nameOf, testById);
            return (
              <li
                key={`${violation.rule}-${described.pl}`}
                className="rounded-lg border-l-4 border-[var(--color-warn)] p-3"
              >
                <p className="text-xs font-medium uppercase tracking-wide">{described.paragraph}</p>
                <p className="mt-1 text-sm">{described.pl}</p>
                <p className="text-xs opacity-70">{described.ru}</p>
              </li>
            );
          })}
          <li className="mt-1 text-xs opacity-60">
            Statut jest po Twojej stronie. Pokaż nauczycielowi numer punktu i poproś o przeniesienie.
            · Устав на твоей стороне: покажи номер пункта и попроси перенести.
          </li>
        </ul>
      )}

      {tests.length === 0 ? null : (
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {tests.map((test) => (
            <li
              key={test.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-line)] p-2"
            >
              <span>
                <span className="font-medium">{nameOf(test.subject)}</span>
                <span className="block text-xs opacity-60">
                  {test.date}, zapowiedziano {test.announcedOn}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(test.id)}
                aria-label={`Usuń pracę ${nameOf(test.subject)} ${test.date}`}
                className="rounded border border-[var(--color-line)] px-2 py-1 text-xs opacity-70"
              >
                Usuń
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
