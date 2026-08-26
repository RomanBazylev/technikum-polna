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

function describe(status: ObligationStatus): { tone: Tone; pl: string; ru: string } {
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
      };
    case 'overdue':
      return status.nextOccurrence === undefined
        ? { tone: 'late', pl: `Termin minął ${status.to}`, ru: `Срок прошёл ${status.to}` }
        : {
            tone: 'late',
            pl: `Termin minął, następny raz ${status.nextOccurrence}`,
            ru: `Следующее окно ${status.nextOccurrence}`,
          };
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
    case 'overdue':
      return 3;
    case 'not-yet':
      return 4;
    case 'needs-data':
      return 5;
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

  return (
    <ul className="flex flex-col gap-3">
      {rows.map(({ obligation, status }) => {
        const { tone, pl, ru } = describe(status);
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
            <p className="mt-2 text-xs opacity-60">
              {obligation.legalBasis} · {obligation.handledAt}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
