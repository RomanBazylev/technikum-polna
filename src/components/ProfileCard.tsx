import { useState } from 'preact/hooks';
import { exportState, importState } from '../lib/state/appState';
import { useAppState } from '../lib/state/useAppState';

const GRADES = [1, 2, 3, 4, 5] as const;

/**
 * Профиль нужен не ради анкеты. Без даты рождения движок сроков не может
 * посчитать два правила, которые включаются с 16 и с 18 лет, и они висят
 * в разделе «нужны данные».
 */
export default function ProfileCard() {
  const { state, ready, recovered, update } = useAppState();
  const [message, setMessage] = useState<string | null>(null);

  const download = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `technikum-polna-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    const outcome = importState(await file.text());
    if (outcome.kind === 'error') {
      setMessage(`Nie udało się wczytać pliku. ${outcome.message}`);
      return;
    }
    update(() => outcome.state);
    setMessage('Dane wczytane. Данные загружены.');
  };

  return (
    <section className="rounded-xl border border-[var(--color-line)] p-4">
      <h2 className="font-medium">Profil · Профиль</h2>
      <p className="mt-1 text-sm opacity-70">
        Zostaje na tym urządzeniu. Остаётся на этом устройстве.
      </p>

      {recovered !== null ? (
        <p className="mt-3 rounded-lg border border-[var(--color-warn)] p-3 text-sm">
          Poprzednie dane nie dały się odczytać, więc zostały zachowane pod kluczem{' '}
          <code>{recovered.backupKey}</code>, a aplikacja zaczęła od pustych. Nic nie skasowano.
        </p>
      ) : null}

      <label className="mt-4 block text-sm">
        <span className="opacity-80">Data urodzenia · Дата рождения</span>
        <input
          type="date"
          value={state.profile.birthDate ?? ''}
          disabled={!ready}
          onInput={(event) => {
            const value = (event.currentTarget as HTMLInputElement).value;
            update((previous) => ({
              ...previous,
              profile: { ...previous.profile, birthDate: value === '' ? null : value },
            }));
          }}
          className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
        />
        <span className="mt-1 block text-xs opacity-60">
          Potrzebna tylko do policzenia dwóch progów: obowiązkowej legitymacji od 16 lat i
          samodzielnego usprawiedliwiania od 18.
        </span>
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm opacity-80">Klasa · Класс</legend>
        <div className="mt-1 flex gap-2">
          {GRADES.map((grade) => (
            <button
              key={grade}
              type="button"
              disabled={!ready}
              onClick={() =>
                update((previous) => ({
                  ...previous,
                  profile: { ...previous.profile, grade },
                }))
              }
              className={`rounded-lg border px-3 py-1 text-sm ${
                state.profile.grade === grade
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-line)] opacity-60'
              }`}
            >
              {grade}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-sm opacity-80">Drugi język · Второй язык</legend>
        <div className="mt-1 flex gap-2">
          {(['niemiecki', 'hiszpanski'] as const).map((group) => (
            <button
              key={group}
              type="button"
              disabled={!ready}
              onClick={() =>
                update((previous) => ({
                  ...previous,
                  profile: {
                    ...previous.profile,
                    languageGroup: previous.profile.languageGroup === group ? null : group,
                  },
                }))
              }
              className={`rounded-lg border px-3 py-1 text-sm ${
                state.profile.languageGroup === group
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-line)] opacity-60'
              }`}
            >
              {group === 'niemiecki' ? '1Bn niemiecki' : '1Bh hiszpański'}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={download}
          className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
        >
          Zapisz do pliku
        </button>
        <label className="cursor-pointer rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm">
          Wczytaj z pliku
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = (event.currentTarget as HTMLInputElement).files?.[0];
              if (file !== undefined) void upload(file);
            }}
          />
        </label>
      </div>
      {message === null ? null : <p className="mt-3 text-sm opacity-80">{message}</p>}

      <p className="mt-4 text-xs opacity-60">
        Synchronizacji między telefonem a komputerem nie ma, bo nie ma serwera. Plik przenosi
        dane ręcznie. · Синхронизации нет, потому что нет сервера. Файл переносит данные вручную.
      </p>
    </section>
  );
}
