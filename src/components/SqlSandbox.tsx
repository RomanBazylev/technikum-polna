import { useCallback, useRef, useState } from 'preact/hooks';
import { SEED_SQL, SILENT_DIFFERENCES, SQL_TASKS } from '../lib/sandbox/seed';

type QueryResult =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'table'; columns: string[]; rows: unknown[][]; rowCount: number }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

type Database = {
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  run: (sql: string) => void;
};

/**
 * Песочница SQL на SQLite в браузере. MySQL, который стоит на экзамене,
 * в браузер не помещается ни в каком виде, поэтому расхождения диалектов
 * показаны прямо здесь, а не спрятаны.
 */
export default function SqlSandbox() {
  const [sql, setSql] = useState(SQL_TASKS[0]?.starter ?? 'SELECT 1;');
  const [result, setResult] = useState<QueryResult>({ kind: 'idle' });
  const dbRef = useRef<Database | null>(null);

  const ensureDatabase = useCallback(async (): Promise<Database> => {
    if (dbRef.current !== null) return dbRef.current;
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs({
      locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm`,
    });
    const database = new SQL.Database() as unknown as Database;
    database.run(SEED_SQL);
    dbRef.current = database;
    return database;
  }, []);

  const run = useCallback(async () => {
    setResult({ kind: 'loading' });
    try {
      const database = await ensureDatabase();
      const output = database.exec(sql);
      const first = output[0];
      if (first === undefined) {
        setResult({ kind: 'empty' });
        return;
      }
      setResult({
        kind: 'table',
        columns: first.columns,
        rows: first.values.slice(0, 50),
        rowCount: first.values.length,
      });
    } catch (error) {
      setResult({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [ensureDatabase, sql]);

  return (
    <section className="rounded-xl border border-[var(--color-line)] p-4">
      <h2 className="font-medium">Piaskownica SQL · Песочница SQL</h2>
      <p className="mt-1 text-sm opacity-70">
        Baza ładuje się dopiero po pierwszym uruchomieniu zapytania, około 640 kB.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {SQL_TASKS.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => {
              setSql(task.starter);
              setResult({ kind: 'idle' });
            }}
            className="rounded-lg border border-[var(--color-line)] px-3 py-1 text-xs"
          >
            {task.id}
          </button>
        ))}
      </div>

      <textarea
        value={sql}
        onInput={(event) => setSql((event.currentTarget as HTMLTextAreaElement).value)}
        spellcheck={false}
        rows={8}
        aria-label="Zapytanie SQL"
        className="mt-3 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-ink)] p-3 font-mono text-sm text-[var(--color-paper)]"
      />

      <button
        type="button"
        onClick={() => void run()}
        className="mt-2 rounded-lg border border-[var(--color-accent)] px-4 py-2 text-sm text-[var(--color-accent)]"
      >
        Uruchom · Выполнить
      </button>

      <div className="mt-4">{renderResult(result)}</div>

      <details className="mt-5 rounded-lg border border-[var(--color-warn)] p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Czym to się różni od egzaminu · Чем это отличается от экзамена
        </summary>
        <p className="mt-2 opacity-80">
          Egzamin INF.03 odbywa się na MySQL w XAMPP, a w przeglądarce działa SQLite. Trzy różnice
          nie dają błędu, tylko zły wynik, więc warto je znać na pamięć.
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {SILENT_DIFFERENCES.map((item) => (
            <li key={item.title}>
              <span className="font-medium">{item.title}.</span>{' '}
              <span className="opacity-80">{item.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs opacity-70">
          Import dowolnego zrzutu z phpMyAdmin, obsługa samego phpMyAdmin i uruchamianie Apache
          nie dają się tu odtworzyć. To ćwiczy się na XAMPP-ie, i tego nie zastąpimy.
        </p>
      </details>
    </section>
  );
}

function renderResult(result: QueryResult) {
  switch (result.kind) {
    case 'idle':
      return <p className="text-sm opacity-60">Naciśnij „Uruchom”.</p>;
    case 'loading':
      return <p className="text-sm opacity-60">Ładowanie silnika bazy…</p>;
    case 'empty':
      return <p className="text-sm opacity-70">Zapytanie wykonane, brak wyników do pokazania.</p>;
    case 'error':
      return (
        <p className="rounded-lg border-l-4 border-[var(--color-bad)] p-3 text-sm">
          {result.message}
        </p>
      );
    case 'table':
      return (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase opacity-60">
                <tr>
                  {result.columns.map((column) => (
                    <th key={column} className="p-2 text-left">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={index} className="border-t border-[var(--color-line)]">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="p-2">
                        {cell === null ? <span className="opacity-40">NULL</span> : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs opacity-60">
            Wierszy: {result.rowCount}
            {result.rowCount > result.rows.length ? `, pokazano ${result.rows.length}` : ''}
          </p>
        </>
      );
    default: {
      const exhaustive: never = result;
      throw new Error(`Необработанный результат: ${JSON.stringify(exhaustive)}`);
    }
  }
}
