import { SEED_SQL } from './seed';
import { PHP_WASM_MODULE } from './php';

/**
 * Настоящий PHP 8.3 в браузере поверх php-wasm, с mysqli_* поверх той же базы,
 * что и песочница SQL.
 *
 * Почему так, а не через wordpress/mysql-on-sqlite, как обычно советуют:
 * сборка php-wasm не содержит ни sqlite3, ни pdo_sqlite (проверено вызовом
 * PDO::getAvailableDrivers, там один pgsql), поэтому PDO-совместимой подложке
 * не к чему подключаться. Зато в сборке есть vrzno, синхронный мост в
 * JavaScript. Через него mysqli_query отдаёт запрос в sql.js, который на
 * странице всё равно уже есть. Побочная выгода: не тянем в MIT-репозиторий
 * код под GPL-2.0.
 */

const BRIDGE = '__tehnikumSql';

type SqlDatabase = {
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  run: (sql: string) => void;
};

type PhpInstance = {
  binary: Promise<unknown>;
  addEventListener: (type: string, listener: (event: { detail: string }) => void) => void;
  run: (code: string) => Promise<number>;
};

export type PhpResult = { output: string; errors: string };

export type PhpRunner = (code: string) => Promise<PhpResult>;

type BridgeRequest = { op: 'query'; sql: string };

type BridgeAnswer =
  | { ok: true; columns: string[] | null; rows: unknown[][] }
  | { ok: false; error: string };

export async function createPhpRunner(onProgress: (note: string) => void): Promise<PhpRunner> {
  onProgress('Baza SQLite…');
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs({
    locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm`,
  });
  const database = new SQL.Database() as unknown as SqlDatabase;
  database.run(SEED_SQL);
  installBridge(database);

  onProgress('Silnik PHP, około 3,3 MB…');
  const module = (await import(/* @vite-ignore */ PHP_WASM_MODULE)) as {
    PhpWeb: new () => PhpInstance;
  };
  const php = new module.PhpWeb();
  await php.binary;

  let output = '';
  let errors = '';
  php.addEventListener('output', (event) => {
    output += event.detail;
  });
  php.addEventListener('error', (event) => {
    errors += event.detail;
  });

  onProgress('Warstwa mysqli…');
  // Шим объявляется отдельным запуском и переживает следующие: так номера
  // строк в ошибках совпадают с тем, что ученик видит в своём редакторе.
  await php.run(MYSQLI_SHIM);
  output = '';
  errors = '';

  return async (code: string) => {
    output = '';
    errors = '';
    await php.run(code);
    return { output, errors };
  };
}

function installBridge(database: SqlDatabase): void {
  const handler = (packed: string): string => {
    const request = decodePacket(packed) as BridgeRequest;
    return encodePacket(runQuery(database, request.sql));
  };
  (globalThis as Record<string, unknown>)[BRIDGE] = handler;
}

function runQuery(database: SqlDatabase, sql: string): BridgeAnswer {
  try {
    const tables = database.exec(sql);
    const first = tables[0];
    if (first === undefined) return { ok: true, columns: null, rows: [] };
    return { ok: true, columns: first.columns, rows: first.values };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** btoa не переживает польские буквы, поэтому UTF-8 кодируется вручную. */
function encodePacket(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodePacket(packed: string): unknown {
  const bytes = Uint8Array.from(atob(packed), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const MYSQLI_SHIM = `<?php
define('MYSQLI_ASSOC', 1);
define('MYSQLI_NUM', 2);
define('MYSQLI_BOTH', 3);

class TehnikumLink { public $error = ''; }

class TehnikumResult {
    public $columns = [];
    public $rows = [];
    public $cursor = 0;
    public function __construct($columns, $rows) {
        $this->columns = $columns;
        $this->rows = $rows;
    }
}

function tehnikum_ask($request) {
    $answer = vrzno_eval('globalThis.${BRIDGE}("' . base64_encode(json_encode($request)) . '")');
    return json_decode(base64_decode($answer), true);
}

function tehnikum_niedostepne($nazwa, $powod) {
    trigger_error($nazwa . ' nie działa w tej piaskownicy. ' . $powod, E_USER_ERROR);
}

function mysqli_connect($host = null, $user = null, $password = null, $database = null) {
    return new TehnikumLink();
}

function mysqli_query($link, $sql) {
    $answer = tehnikum_ask(['op' => 'query', 'sql' => $sql]);
    if ($answer['ok'] !== true) {
        $link->error = $answer['error'];
        return false;
    }
    $link->error = '';
    if ($answer['columns'] === null) return true;
    return new TehnikumResult($answer['columns'], $answer['rows']);
}

function mysqli_fetch_row($result) {
    if (!($result instanceof TehnikumResult)) return null;
    if ($result->cursor >= count($result->rows)) return null;
    return $result->rows[$result->cursor++];
}

function mysqli_fetch_assoc($result) {
    $row = mysqli_fetch_row($result);
    return $row === null ? null : array_combine($result->columns, $row);
}

function mysqli_fetch_array($result, $mode = MYSQLI_BOTH) {
    $row = mysqli_fetch_row($result);
    if ($row === null) return null;
    if ($mode === MYSQLI_NUM) return $row;
    $assoc = array_combine($result->columns, $row);
    return $mode === MYSQLI_ASSOC ? $assoc : $row + $assoc;
}

function mysqli_num_rows($result) {
    return $result instanceof TehnikumResult ? count($result->rows) : 0;
}

function mysqli_error($link) {
    return $link instanceof TehnikumLink ? $link->error : '';
}

function mysqli_real_escape_string($link, $text) {
    return str_replace(
        ["\\\\", "'", '"', "\\n", "\\r"],
        ["\\\\\\\\", "\\\\'", '\\\\"', "\\\\n", "\\\\r"],
        $text
    );
}

function mysqli_set_charset($link, $charset) { return true; }

function mysqli_close($link) { return true; }

function mysqli_prepare($link, $sql) {
    tehnikum_niedostepne('mysqli_prepare', 'Rozwiązania INF.03 składają SQL i wywołują mysqli_query.');
}
function mysqli_stmt_bind_param() { tehnikum_niedostepne('mysqli_stmt_bind_param', 'Nie ma przygotowanych zapytań.'); }
function mysqli_stmt_execute() { tehnikum_niedostepne('mysqli_stmt_execute', 'Nie ma przygotowanych zapytań.'); }
function mysqli_stmt_get_result() { tehnikum_niedostepne('mysqli_stmt_get_result', 'Nie ma przygotowanych zapytań.'); }
function mysqli_multi_query($link, $sql) {
    tehnikum_niedostepne('mysqli_multi_query', 'Rozdziel polecenia na osobne wywołania mysqli_query.');
}

class mysqli {
    public function __construct() {
        tehnikum_niedostepne('new mysqli', 'Ta piaskownica zna tylko styl proceduralny: mysqli_connect i mysqli_query.');
    }
}
`;
