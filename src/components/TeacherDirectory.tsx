import { useMemo } from 'preact/hooks';
import type { SubjectRef } from '../lib/domain/timetable';
import type { TeacherEntry } from '../lib/state/appState';
import { useAppState } from '../lib/state/useAppState';

type Props = { subjects: SubjectRef[] };

function nextId(existing: readonly TeacherEntry[]): string {
  const highest = existing.reduce((max, entry) => {
    const parsed = Number(entry.id);
    return Number.isInteger(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return String(highest + 1);
}

/**
 * Кто какой предмет ведёт, школа не публикует, поэтому справочник заполняет
 * сам ученик. В репозиторий он не попадает никогда: публикация собранных
 * учениками персональных данных учителей создала бы вопрос по RODO на ровном
 * месте. Оценок и отзывов здесь нет и не будет - это решение, а не недоделка.
 */
export default function TeacherDirectory({ subjects }: Props) {
  const { state, ready, update } = useAppState();

  const nameOf = useMemo(() => {
    const byId = new Map(subjects.map((subject) => [subject.id, subject.pl]));
    return (id: string): string => byId.get(id) ?? id;
  }, [subjects]);

  const teachers = state.teachers;

  const add = () => {
    const subjectId = subjects[0]?.id;
    if (subjectId === undefined) return;
    update((previous) => ({
      ...previous,
      teachers: [...previous.teachers, { id: nextId(previous.teachers), name: '', subjectId }],
    }));
  };

  const patch = (id: string, change: Partial<Omit<TeacherEntry, 'id'>>) => {
    update((previous) => ({
      ...previous,
      teachers: previous.teachers.map((entry) =>
        entry.id === id ? { ...entry, ...change } : entry,
      ),
    }));
  };

  const remove = (id: string) => {
    update((previous) => ({
      ...previous,
      teachers: previous.teachers.filter((entry) => entry.id !== id),
    }));
  };

  return (
    <section className="rounded-xl border border-[var(--color-line)] p-4">
      <h2 className="font-medium">Kto czego uczy · Кто что ведёт</h2>
      <p className="mt-1 text-sm opacity-80">
        Szkoła nie publikuje przydziału nauczycieli do przedmiotów, więc tę listę prowadzisz sam.
        Zostaje wyłącznie w tej przeglądarce i nigdy nie trafia do repozytorium: publikowanie danych
        osobowych nauczycieli zebranych przez uczniów to problem z RODO, którego nie ma po co
        tworzyć.
      </p>
      <p className="mt-2 text-sm opacity-70">
        Школа не публикует, кто какой предмет ведёт, поэтому список ведёшь ты. Он остаётся только в
        этом браузере и никогда не попадает в репозиторий: публикация персональных данных учителей,
        собранных учениками, создала бы вопрос по RODO без всякой необходимости.
      </p>
      <p className="mt-2 text-xs opacity-60">
        Ocen i opinii tu nie ma świadomie. · Оценок и отзывов здесь нет намеренно.
      </p>

      {teachers.length === 0 ? (
        <p className="mt-4 text-sm opacity-70">
          Pusto. Dodaj pierwszego nauczyciela, kiedy poznasz plan. · Пусто. Добавь первого учителя,
          когда узнаешь расписание.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {teachers.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-[var(--color-line)] p-3">
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs opacity-70">Imię i nazwisko · Имя</span>
                  <input
                    value={entry.name}
                    placeholder="np. Beata Markulis"
                    onInput={(event) =>
                      patch(entry.id, { name: (event.currentTarget as HTMLInputElement).value })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
                  />
                </label>
                <label className="block">
                  <span className="text-xs opacity-70">Przedmiot · Предмет</span>
                  <select
                    value={entry.subjectId}
                    onChange={(event) =>
                      patch(entry.id, {
                        subjectId: (event.currentTarget as HTMLSelectElement).value,
                      })
                    }
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
                  <span className="text-xs opacity-70">Sala · Кабинет</span>
                  <input
                    value={entry.room ?? ''}
                    placeholder="np. 204"
                    onInput={(event) =>
                      patch(entry.id, {
                        room: (event.currentTarget as HTMLInputElement).value || undefined,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
                  />
                </label>
                <label className="block">
                  <span className="text-xs opacity-70">Poczta szkolna · Школьная почта</span>
                  <input
                    type="email"
                    value={entry.email ?? ''}
                    placeholder="opcjonalnie"
                    onInput={(event) =>
                      patch(entry.id, {
                        email: (event.currentTarget as HTMLInputElement).value || undefined,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
                  />
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs opacity-60">{nameOf(entry.subjectId)}</span>
                <button
                  type="button"
                  onClick={() => remove(entry.id)}
                  aria-label={`Usuń wpis ${entry.name === '' ? entry.id : entry.name}`}
                  className="rounded border border-[var(--color-line)] px-2 py-1 text-xs opacity-70"
                >
                  Usuń
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={add}
        disabled={!ready}
        className="mt-4 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm disabled:opacity-40"
      >
        Dodaj nauczyciela · Добавить учителя
      </button>
    </section>
  );
}
