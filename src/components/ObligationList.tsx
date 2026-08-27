import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  resolveAnchor,
  toIsoDate,
  type Obligation,
  type ObligationStatus,
  type ResolutionContext,
} from '../lib/domain/obligations';

type Props = { obligations: Obligation[] };

type Tone = 'open' | 'soon' | 'late' | 'quiet';

const TONE_CLASS: Record<Tone, string> = {
  open: 'border-[var(--color-good)]',
  soon: 'border-[var(--color-accent)]',
  late: 'border-[var(--color-warn)]',
  quiet: 'border-[var(--color-line)]',
};

function describe(status: ObligationStatus): {
  tone: Tone;
  pl: string;
  ru: string;
  footnote?: string;
} {
  switch (status.kind) {
    case 'open':
      return {
        tone: 'open',
        pl: `Można złożyć, zostało dni: ${status.daysLeft}`,
        ru: `Можно подать, осталось дней: ${status.daysLeft}`,
      };
    case 'upcoming':
      return {
        tone: 'soon',
        pl: `Otwiera się ${status.from}, za dni: ${status.daysUntilOpen}`,
        ru: `Откроется ${status.from}`,
        // Свежий промах — сноска, а не заголовок: действие всё равно
        // возможно только в следующем окне.
        ...(status.justMissed === undefined
          ? {}
          : {
              footnote: `Poprzednie okno zamknęło się ${status.justMissed.to}, ${status.justMissed.daysSince} dni temu.`,
            }),
      };
    case 'overdue':
      return { tone: 'late', pl: `Termin minął ${status.to}`, ru: `Срок прошёл ${status.to}` };
    case 'not-yet':
      return {
        tone: 'quiet',
        pl: `Zacznie obowiązywać ${status.from}`,
        ru: `Начнёт действовать ${status.from}`,
      };
    case 'in-force':
      return {
        tone: 'open',
        pl: `Obowiązuje od ${status.since}`,
        ru: `Действует с ${status.since}`,
      };
    case 'standing':
      return {
        tone: 'open',
        pl: 'Bez terminu, można w każdej chwili',
        ru: 'Без срока, можно в любой момент',
      };
    case 'needs-data':
      return status.missing === 'birthDate'
        ? {
            tone: 'quiet',
            pl: 'Podaj datę urodzenia w ustawieniach',
            ru: 'Укажите дату рождения в настройках',
          }
        : {
            tone: 'quiet',
            pl: `Brakuje danych: ${status.missing}`,
            ru: 'Не хватает данных',
          };
    default: {
      const exhaustive: never = status;
      throw new Error(`Необработанный статус: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Открытое сверху, потом скорое, потом остальное. */
function rank(status: ObligationStatus): number {
  switch (status.kind) {
    case 'open':
      return 0;
    case 'upcoming':
      return 1;
    case 'in-force':
      return 2;
    // Постоянные права ниже срочного, но выше просроченного: они не горят,
    // но и не устарели.
    case 'standing':
      return 3;
    case 'overdue':
      return 4;
    case 'not-yet':
      return 5;
    case 'needs-data':
      return 6;
    default: {
      const exhaustive: never = status;
      throw new Error(`Необработанный статус: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export default function ObligationList({ obligations }: Props) {
  const [birthDate, setBirthDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Модуль состояния тянет zod, поэтому грузим его после отрисовки:
    // в критический чанк валидатор схемы попадать не должен.
    void import('../lib/state/appState').then(({ browserStorage, loadState }) => {
      const storage = browserStorage();
      if (storage === null || cancelled) return;
      setBirthDate(loadState(storage).state.profile.birthDate);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const context: ResolutionContext = {
      today: toIsoDate(Date.now()),
      schoolEvents: {},
      birthDate,
      absenceEndedOn: null,
    };
    return obligations
      .map((obligation) => ({ obligation, status: resolveAnchor(obligation.anchor, context) }))
      .sort((a, b) => rank(a.status) - rank(b.status));
  }, [obligations, birthDate]);

  // Пункты, которые нельзя посчитать без данных, не должны выглядеть как
  // поломка в общем списке. Они уезжают в свёрнутый блок внизу.
  const actionable = rows.filter(({ status }) => status.kind !== 'needs-data');
  const pending = rows.filter(({ status }) => status.kind === 'needs-data');

  return (
    <>
      <ul className="flex flex-col gap-3">
        {actionable.map(({ obligation, status }) => {
          const { tone, pl, ru, footnote } = describe(status);
          return (
            <li
              key={obligation.id}
              className={`rounded-xl border-l-4 bg-[var(--color-ink-soft)]/60 p-4 ${TONE_CLASS[tone]}`}
            >
              <p className="text-xs font-medium uppercase tracking-wide">{pl}</p>
              <p className="text-xs opacity-60">{ru}</p>
              <h2 className="mt-2 font-medium">{obligation.title.pl}</h2>
              <p className="text-sm opacity-70">{obligation.title.ru}</p>
              <p className="mt-2 text-sm">{obligation.what.ru}</p>
              {footnote === undefined ? null : (
                <p className="mt-2 text-xs opacity-50">{footnote}</p>
              )}
              <p className="mt-2 text-xs opacity-60">
                {obligation.legalBasis} · {obligation.handledAt}
              </p>
            </li>
          );
        })}
      </ul>

      {pending.length === 0 ? null : (
        <details className="mt-4 rounded-xl border border-[var(--color-line)] p-4 text-sm">
          <summary className="cursor-pointer opacity-70">
            Wymaga uzupełnienia danych: {pending.length} · Нужны данные: {pending.length}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {pending.map(({ obligation, status }) => (
              <li key={obligation.id} className="opacity-80">
                <span className="font-medium">{obligation.title.pl}</span>
                <span className="opacity-60"> — {describe(status).pl}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
