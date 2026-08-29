import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { dni } from '../lib/pl';
import {
  resolveAnchor,
  toIsoDate,
  type Obligation,
  type ObligationStatus,
  type ResolutionContext,
} from '../lib/domain/obligations';

type Props = { obligations: Obligation[] };

type Tone = 'now' | 'soon' | 'late' | 'rule';

const BADGE_CLASS: Record<Tone, string> = {
  now: 'text-[var(--color-good)]',
  soon: 'text-[var(--color-accent)]',
  late: 'text-[var(--color-warn)]',
  rule: 'text-[var(--color-faint)]',
};

/** Короткая правая метка вместо строки заголовка на двух языках. */
function describe(status: ObligationStatus): { tone: Tone; badge: string; footnote?: string } {
  switch (status.kind) {
    case 'open':
      return {
        tone: 'now',
        badge: status.daysLeft === 0 ? 'dziś ostatni dzień' : `zostało ${dni(status.daysLeft)}`,
      };
    case 'upcoming':
      return {
        tone: 'soon',
        badge: `otwiera się za ${dni(status.daysUntilOpen)}`,
        // Свежий промах - сноска, а не заголовок: действие всё равно
        // возможно только в следующем окне.
        ...(status.justMissed === undefined
          ? {}
          : { footnote: `Poprzednie okno zamknęło się ${status.justMissed.to}.` }),
      };
    case 'overdue':
      return { tone: 'late', badge: `termin minął ${status.to}` };
    case 'not-yet':
      return { tone: 'rule', badge: `od ${status.from}` };
    case 'in-force':
      return { tone: 'now', badge: 'już Cię dotyczy' };
    case 'standing':
      return { tone: 'now', badge: 'kiedy chcesz' };
    case 'relative-rule':
      return {
        tone: 'rule',
        badge:
          status.direction === 'after'
            ? `${dni(status.days)} od zdarzenia`
            : `najpóźniej ${dni(status.days)} wcześniej`,
      };
    case 'needs-birth-date':
      return { tone: 'rule', badge: 'zależy od wieku' };
    default: {
      const exhaustive: never = status;
      throw new Error(`Необработанный статус: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Внутри одной группы ближе к верху то, что горит раньше. Без этого выплата
 * с окном на 94 дня вставала над стипендией, которую надо подать за три.
 */
function urgency(status: ObligationStatus): number {
  switch (status.kind) {
    case 'open':
      return status.daysLeft;
    case 'upcoming':
      return status.daysUntilOpen;
    case 'overdue':
      return status.daysSince;
    case 'not-yet':
      return status.daysUntil;
    case 'in-force':
    case 'standing':
    case 'relative-rule':
    case 'needs-birth-date':
      return 0;
    default: {
      const exhaustive: never = status;
      throw new Error(`Необработанный статус: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Что можно сделать сейчас - сверху, правила без срока - внизу. */
function rank(status: ObligationStatus): number {
  switch (status.kind) {
    case 'open':
      return 0;
    case 'upcoming':
      return 1;
    case 'in-force':
      return 2;
    case 'standing':
      return 3;
    case 'overdue':
      return 4;
    case 'not-yet':
      return 5;
    case 'relative-rule':
      return 6;
    case 'needs-birth-date':
      return 7;
    default: {
      const exhaustive: never = status;
      throw new Error(`Необработанный статус: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * «Ещё не прочитали» и «прочитали, там пусто» - разные состояния, и сводить их
 * к одному null нельзя. Загрузка асинхронная, потому что тянет zod, и на быстрой
 * машине гость успевает вписать дату раньше, чем она приедет. Тогда ответ
 * хранилища затирал только что введённое, и поле рождалось заново пустым.
 */
type DateState = { loaded: false } | { loaded: true; value: string | null };

export default function ObligationList({ obligations }: Props) {
  const [birthDate, setBirthDate] = useState<DateState>({ loaded: false });
  const [absenceEndedOn, setAbsenceEndedOn] = useState<DateState>({ loaded: false });

  useEffect(() => {
    // Модуль состояния тянет zod, поэтому грузим его после отрисовки:
    // в критический чанк валидатор схемы попадать не должен.
    void import('../lib/state/appState').then(({ browserStorage, loadState }) => {
      const storage = browserStorage();
      if (storage === null) return;
      const profile = loadState(storage).state.profile;
      setBirthDate((previous) =>
        previous.loaded ? previous : { loaded: true, value: profile.birthDate },
      );
      setAbsenceEndedOn((previous) =>
        previous.loaded ? previous : { loaded: true, value: profile.absenceEndedOn },
      );
    });
  }, []);

  // Запись асинхронная, а ввод даты меняется по нажатию клавиши. Значение
  // берётся из ссылки в момент записи, иначе поздно приехавший ранний вызов
  // затёр бы более свежий тем, что закрыл в замыкании.
  const pending = useRef<string | null>(null);
  const pendingAbsence = useRef<string | null>(null);
  const saveBirthDate = useCallback((raw: string) => {
    const value = raw === '' ? null : raw;
    pending.current = value;
    setBirthDate({ loaded: true, value });
    void import('../lib/state/appState').then(({ browserStorage, loadState, saveState }) => {
      const storage = browserStorage();
      if (storage === null) return;
      const current = loadState(storage).state;
      saveState(storage, {
        ...current,
        profile: { ...current.profile, birthDate: pending.current },
      });
    });
  }, []);

  const saveAbsenceEndedOn = useCallback((raw: string) => {
    const value = raw === '' ? null : raw;
    pendingAbsence.current = value;
    setAbsenceEndedOn({ loaded: true, value });
    void import('../lib/state/appState').then(({ browserStorage, loadState, saveState }) => {
      const storage = browserStorage();
      if (storage === null) return;
      const current = loadState(storage).state;
      saveState(storage, {
        ...current,
        profile: { ...current.profile, absenceEndedOn: pendingAbsence.current },
      });
    });
  }, []);

  const rows = useMemo(() => {
    const context: ResolutionContext = {
      today: toIsoDate(Date.now()),
      schoolEvents: {},
      birthDate: birthDate.loaded ? birthDate.value : null,
      absenceEndedOn: absenceEndedOn.loaded ? absenceEndedOn.value : null,
    };
    return obligations
      .map((obligation) => ({ obligation, status: resolveAnchor(obligation.anchor, context) }))
      .sort(
        (a, b) =>
          rank(a.status) - rank(b.status) || urgency(a.status) - urgency(b.status),
      );
  }, [obligations, birthDate, absenceEndedOn]);

  const locked = rows.filter(({ status }) => status.kind === 'needs-birth-date').length;
  const hasAfterEvent = obligations.some(({ anchor }) => anchor.kind === 'after-event');

  return (
    <>
      <ul className="flex flex-col gap-2">
        {rows.map(({ obligation, status }) => {
          const { tone, badge, footnote } = describe(status);
          return (
            <li key={obligation.id}>
              <details className="group rounded-card border border-[var(--color-line)] bg-[var(--color-ink-soft)]">
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
                  <span className="grow">
                    <span className="block text-body font-semibold">{obligation.title.pl}</span>
                    <span className="mt-0.5 block text-micro text-[var(--color-faint)]">
                      {obligation.title.ru}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-right text-label font-semibold tabular-nums ${BADGE_CLASS[tone]}`}
                  >
                    {badge}
                  </span>
                </summary>
                <div className="border-t border-[var(--color-line)] p-4 pt-3">
                  <p className="text-body text-[var(--color-muted)]">{obligation.what.ru}</p>
                  {footnote === undefined ? null : (
                    <p className="mt-2 text-label text-[var(--color-warn)]">{footnote}</p>
                  )}
                  <p className="mt-3 text-micro text-[var(--color-faint)]">
                    {obligation.legalBasis} · {obligation.handledAt}
                  </p>
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      {locked === 0 ? null : (
        <label className="mt-3 block rounded-card border border-dashed border-[var(--color-line-strong)] p-4">
          <span className="block text-body font-semibold">
            Dwie zasady włączają się z wiekiem
          </span>
          <span className="mt-1 block text-label text-[var(--color-muted)]">
            Legitymacja w kontroli od 16 lat, samodzielne usprawiedliwianie od 18. Podaj datę
            urodzenia, a policzymy je od razu.
          </span>
          <input
            type="date"
            value={birthDate.loaded ? (birthDate.value ?? '') : ''}
            onInput={(event) => saveBirthDate((event.currentTarget as HTMLInputElement).value)}
            className="mt-3 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-ink-raised)] p-2.5 text-body"
          />
          <span className="mt-2 block text-micro text-[var(--color-faint)]">
            Zostaje na tym urządzeniu. Остаётся на этом устройстве.
          </span>
        </label>
      )}

      {hasAfterEvent ? (
        <label className="mt-3 flex items-center gap-3 rounded-card border border-dashed border-[var(--color-line-strong)] p-3">
          <span className="grow">
            <span className="block text-label font-semibold">Koniec ostatniej nieobecności</span>
            <span className="block text-micro text-[var(--color-faint)]">
              Potrzebny do policzenia terminu usprawiedliwienia.
            </span>
          </span>
          <input
            aria-label="Koniec ostatniej nieobecności"
            type="date"
            value={absenceEndedOn.loaded ? (absenceEndedOn.value ?? '') : ''}
            onInput={(event) =>
              saveAbsenceEndedOn((event.currentTarget as HTMLInputElement).value)
            }
            className="w-36 shrink-0 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-ink-raised)] p-2 text-label"
          />
        </label>
      ) : null}
    </>
  );
}
