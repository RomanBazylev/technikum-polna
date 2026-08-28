import { useCallback, useRef, useState } from 'preact/hooks';
import {
  PHP_BOUNDARIES,
  PHP_DOWNLOAD_MB,
  PHP_TASKS,
  PHP_WASM_VERSION,
  SQL_DOWNLOAD_MB,
  readConnection,
} from '../lib/sandbox/php';
import type { Connection } from '../lib/sandbox/php';
import type { PhpResult, PhpRunner } from '../lib/sandbox/phpEngine';

type Engine =
  | { kind: 'gate' }
  | { kind: 'loading'; note: string }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string };

const FIRST_TASK = PHP_TASKS[0];

/**
 * Настоящий PHP 8.3 с mysqli_* поверх учебной базы. Движок весит мегабайты,
 * поэтому не грузится, пока ученик не нажал кнопку: у школьника трафик
 * кончается быстрее терпения.
 */
export default function PhpSandbox() {
  const [engine, setEngine] = useState<Engine>({ kind: 'gate' });
  const [code, setCode] = useState(FIRST_TASK?.starter ?? '<?php\n');
  const [result, setResult] = useState<PhpResult | null>(null);
  const [running, setRunning] = useState(false);
  const runnerRef = useRef<PhpRunner | null>(null);

  const download = useCallback(async () => {
    setEngine({ kind: 'loading', note: 'Start…' });
    try {
      const { createPhpRunner } = await import('../lib/sandbox/phpEngine');
      runnerRef.current = await createPhpRunner((note) => setEngine({ kind: 'loading', note }));
      setEngine({ kind: 'ready' });
    } catch (error) {
      setEngine({
        kind: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const run = useCallback(async () => {
    const runner = runnerRef.current;
    if (runner === null) return;
    setRunning(true);
    try {
      setResult(await runner(code));
    } catch (error) {
      setResult({ output: '', errors: error instanceof Error ? error.message : String(error) });
    } finally {
      setRunning(false);
    }
  }, [code]);

  return (
    <section className="rounded-card border border-[var(--color-line)] p-4">
      <h2 className="font-medium">Piaskownica PHP · Песочница PHP</h2>
      <p className="mt-1 text-label text-[var(--color-muted)]">
        Prawdziwy PHP 8.3 z funkcjami <code>mysqli_*</code> na tej samej bazie co piaskownica SQL.
        Zadanie praktyczne INF.03 to dokładnie ten układ: zapytanie, pętla, wynik w HTML.
      </p>

      {renderEngine(engine, download)}

      {engine.kind === 'ready' ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {PHP_TASKS.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  setCode(task.starter);
                  setResult(null);
                }}
                className="rounded-lg border border-[var(--color-line)] px-3 py-1 text-micro"
              >
                {task.label}
              </button>
            ))}
          </div>

          <textarea
            value={code}
            onInput={(event) => setCode((event.currentTarget as HTMLTextAreaElement).value)}
            spellcheck={false}
            rows={16}
            aria-label="Kod PHP"
            className="mt-3 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-ink)] p-3 font-mono text-micro text-[var(--color-paper)]"
          />

          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="mt-2 rounded-lg border border-[var(--color-accent)] px-4 py-2 text-label text-[var(--color-accent)] disabled:opacity-50"
          >
            {running ? 'Wykonuję…' : 'Uruchom PHP · Выполнить'}
          </button>

          {result === null ? null : (
            <div className="mt-4">
              {result.errors === '' ? null : (
                <pre
                  data-testid="php-errors"
                  className="mb-3 overflow-x-auto rounded-lg border-l-4 border-[var(--color-bad)] p-3 text-micro whitespace-pre-wrap"
                >
                  {result.errors}
                </pre>
              )}
              <iframe
                data-testid="php-output"
                title="Wynik PHP"
                sandbox=""
                srcdoc={toDocument(result.output)}
                className="h-64 w-full rounded-lg border border-[var(--color-line)] bg-white"
              />
              <p className="mt-1 text-micro text-[var(--color-faint)]">
                Wynik pokazany tak, jak zobaczyłaby go przeglądarka na XAMPP-ie.
              </p>
            </div>
          )}
        </>
      ) : null}

      <details className="mt-5 rounded-lg border border-[var(--color-warn)] p-3 text-label">
        <summary className="cursor-pointer font-medium">
          Czego ta piaskownica nie umie · Чего эта песочница не умеет
        </summary>
        <ul className="mt-2 flex flex-col gap-2">
          {PHP_BOUNDARIES.map((item) => (
            <li key={item.title}>
              <span className="font-medium">{item.title}.</span>{' '}
              <span className="text-[var(--color-muted)]">{item.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-micro text-[var(--color-faint)]">
          Silnik: php-wasm {PHP_WASM_VERSION}, Apache-2.0, ładowany z jsDelivr.
        </p>
      </details>
    </section>
  );
}

function renderEngine(engine: Engine, download: () => Promise<void>) {
  switch (engine.kind) {
    case 'gate':
      return renderGate(download);
    case 'loading':
      return (
        <p className="mt-4 rounded-lg border border-[var(--color-line)] p-3 text-label text-[var(--color-muted)]">
          Pobieram silnik: {engine.note} Pierwszy raz trwa to kilkanaście sekund, potem leży w
          pamięci przeglądarki.
        </p>
      );
    case 'ready':
      return null;
    case 'failed':
      return (
        <p className="mt-4 rounded-lg border-l-4 border-[var(--color-bad)] p-3 text-label">
          Nie udało się pobrać silnika: {engine.message}. Sprawdź połączenie i spróbuj ponownie.
        </p>
      );
    default: {
      const exhaustive: never = engine;
      throw new Error(`Необработанное состояние движка: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function renderGate(download: () => Promise<void>) {
  const connection = readConnection();
  const total = (PHP_DOWNLOAD_MB + SQL_DOWNLOAD_MB).toFixed(1).replace('.', ',');
  return (
    <div
      data-testid="php-gate"
      className="mt-4 rounded-lg border border-[var(--color-warn)] p-4 text-label"
    >
      <p>
        <strong>Ta sekcja pobiera {total} MB.</strong> Nic nie ściąga się samo, dopóki nie
        naciśniesz przycisku. Najlepiej włącz Wi-Fi. · Раздел скачивает {total} МБ и не начинает
        сам.
      </p>
      <p className="mt-2 text-[var(--color-muted)]">{connectionAdvice(connection)}</p>
      <button
        type="button"
        onClick={() => void download()}
        className="mt-3 rounded-lg border border-[var(--color-accent)] px-4 py-2 text-label text-[var(--color-accent)]"
      >
        Pobierz silnik PHP ({total} MB)
      </button>
      <p className="mt-2 text-micro text-[var(--color-faint)]">
        Po pobraniu przeglądarka trzyma silnik w pamięci podręcznej, więc kolejny raz działa bez
        sieci.
      </p>
    </div>
  );
}

function connectionAdvice(connection: Connection): string {
  switch (connection.kind) {
    case 'data-saver':
      return 'Masz włączony oszczędzanie danych. Przy tym ustawieniu pobieranie zjadłoby zapas pakietu, więc lepiej poczekaj na Wi-Fi. · Включён режим экономии трафика.';
    case 'slow':
      return `Przeglądarka zgłasza wolne połączenie (${connection.effectiveType}). Na takim łączu pobieranie potrwa kilka minut i może się przerwać. Poczekaj na Wi-Fi. · Соединение медленное.`;
    case 'fine':
      return `Połączenie wygląda na szybkie (${connection.effectiveType}), pobieranie zajmie kilkanaście sekund.`;
    case 'unknown':
      return 'Przeglądarka nie mówi, jakie masz łącze. Jeśli jesteś na danych komórkowych, sprawdź najpierw zapas pakietu.';
    default: {
      const exhaustive: never = connection;
      throw new Error(`Необработанное соединение: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Вывод показывается в изолированном iframe: у ученика на экзамене HTML
 * рисует браузер, а не тёмная тема этого сайта, и таблица с border='1'
 * должна выглядеть ровно так, как выглядит на XAMPP.
 */
function toDocument(output: string): string {
  return `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;margin:12px;color:#111}table{border-collapse:collapse}td,th{padding:4px 8px}</style>${output}`;
}
