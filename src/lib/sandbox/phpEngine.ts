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

type SqlValue = string | number | null | Uint8Array;

type SqlStatement = {
  bind: (values?: SqlValue[]) => boolean;
  step: () => boolean;
  get: () => SqlValue[];
  getColumnNames: () => string[];
  free: () => boolean;
};

type SqlDatabase = {
  exec: (sql: string) => Array<{ columns: string[]; values: SqlValue[][] }>;
  run: (sql: string) => void;
  prepare: (sql: string) => SqlStatement;
  getRowsModified: () => number;
};

type PhpInstance = {
  binary: Promise<unknown>;
  addEventListener: (type: string, listener: (event: { detail: string }) => void) => void;
  run: (code: string) => Promise<number>;
};

export type PhpResult = { output: string; errors: string };

export type PhpRunner = (code: string) => Promise<PhpResult>;

type BridgeRequest =
  | { op: 'prepare'; sql: string }
  | { op: 'query'; sql: string; params?: SqlValue[] };

type BridgeAnswer =
  | { ok: true; kind: 'prepared'; placeholderCount: number }
  | {
      ok: true;
      kind: 'result';
      columns: string[] | null;
      rows: SqlValue[][];
      affectedRows: number;
      insertId: number;
    }
  | { ok: false; error: string };

type SqlScanState =
  | { kind: 'code' }
  | { kind: 'single-quote' }
  | { kind: 'double-quote' }
  | { kind: 'backtick' }
  | { kind: 'line-comment' }
  | { kind: 'block-comment' };

export type SqlAnalysis = { placeholderCount: number; hasMultipleStatements: boolean };

export function analyzeSql(sql: string): SqlAnalysis {
  let state: SqlScanState = { kind: 'code' };
  let placeholderCount = 0;
  let statementEnded = false;
  let hasMultipleStatements = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index] ?? '';
    const next = sql[index + 1] ?? '';

    switch (state.kind) {
      case 'code':
        if (/\s/u.test(character)) continue;
        if (character === '-' && next === '-') {
          state = { kind: 'line-comment' };
          index += 1;
        } else if (character === '/' && next === '*') {
          state = { kind: 'block-comment' };
          index += 1;
        } else if (character === "'") {
          if (statementEnded) hasMultipleStatements = true;
          state = { kind: 'single-quote' };
        } else if (character === '"') {
          if (statementEnded) hasMultipleStatements = true;
          state = { kind: 'double-quote' };
        } else if (character === '`') {
          if (statementEnded) hasMultipleStatements = true;
          state = { kind: 'backtick' };
        } else if (character === ';') {
          statementEnded = true;
        } else {
          if (statementEnded) hasMultipleStatements = true;
          if (character === '?') placeholderCount += 1;
        }
        break;
      case 'single-quote':
        if (character === '\\') {
          index += 1;
        } else if (character === "'" && next === "'") {
          index += 1;
        } else if (character === "'") {
          state = { kind: 'code' };
        }
        break;
      case 'double-quote':
        if (character === '\\') {
          index += 1;
        } else if (character === '"' && next === '"') {
          index += 1;
        } else if (character === '"') {
          state = { kind: 'code' };
        }
        break;
      case 'backtick':
        if (character === '`' && next === '`') {
          index += 1;
        } else if (character === '`') {
          state = { kind: 'code' };
        }
        break;
      case 'line-comment':
        if (character === '\n' || character === '\r') state = { kind: 'code' };
        break;
      case 'block-comment':
        if (character === '*' && next === '/') {
          state = { kind: 'code' };
          index += 1;
        }
        break;
      default: {
        const exhaustive: never = state;
        throw new Error(`Nieobsługiwany stan analizatora SQL: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  return { placeholderCount, hasMultipleStatements };
}

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
    return encodePacket(runBridgeRequest(database, request));
  };
  (globalThis as Record<string, unknown>)[BRIDGE] = handler;
}

function runBridgeRequest(database: SqlDatabase, request: BridgeRequest): BridgeAnswer {
  const analysis = analyzeSql(request.sql);
  if (analysis.hasMultipleStatements) {
    return {
      ok: false,
      error:
        'Wiele poleceń SQL w jednym wywołaniu nie jest obsługiwane. Uruchom każde polecenie osobno.',
    };
  }

  try {
    const statement = database.prepare(request.sql);
    if (request.op === 'prepare') {
      statement.free();
      return { ok: true, kind: 'prepared', placeholderCount: analysis.placeholderCount };
    }

    const rows: SqlValue[][] = [];
    try {
      statement.bind(request.params);
      const columns = statement.getColumnNames();
      while (statement.step()) rows.push(statement.get());
      const affectedRows = columns.length === 0 ? database.getRowsModified() : rows.length;
      return {
        ok: true,
        kind: 'result',
        columns: columns.length === 0 ? null : columns,
        rows,
        affectedRows,
        insertId: isInsert(request.sql) ? readInsertId(database) : 0,
      };
    } finally {
      statement.free();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function isInsert(sql: string): boolean {
  const withoutLeadingComments = sql.replace(
    /^(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*/u,
    '',
  );
  return /^(?:INSERT|REPLACE)\b/iu.test(withoutLeadingComments);
}

function readInsertId(database: SqlDatabase): number {
  const value = database.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0];
  return typeof value === 'number' ? value : 0;
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

class mysqli_result {
    public $columns = [];
    public $rows = [];
    public $cursor = 0;
    public $num_rows = 0;
    public $field_count = 0;
    public function __construct($columns, $rows) {
        $this->columns = $columns;
        $this->rows = $rows;
        $this->num_rows = count($rows);
        $this->field_count = count($columns);
    }
    public function fetch_row() { return mysqli_fetch_row($this); }
    public function fetch_assoc() { return mysqli_fetch_assoc($this); }
    public function fetch_array($mode = MYSQLI_BOTH) { return mysqli_fetch_array($this, $mode); }
    public function fetch_object($class = "stdClass", $constructor_args = []) {
        return mysqli_fetch_object($this, $class, $constructor_args);
    }
    public function free() { $this->rows = []; $this->cursor = 0; return true; }
    public function close() { return $this->free(); }
}

function tehnikum_ask($request) {
    $answer = vrzno_eval('globalThis.${BRIDGE}("' . base64_encode(json_encode($request)) . '")');
    return json_decode(base64_decode($answer), true);
}

function tehnikum_niedostepne($nazwa, $powod) {
    $komunikat = $nazwa . ' nie działa w tej piaskownicy. ' . $powod;
    die('<strong>BŁĄD:</strong> ' . htmlspecialchars($komunikat, ENT_QUOTES, 'UTF-8'));
}

class mysqli_stmt {
    public $affected_rows = 0;
    public $insert_id = 0;
    public $errno = 0;
    public $error = '';
    public $num_rows = 0;
    private $link;
    private $sql;
    private $placeholder_count;
    private $bound_types = '';
    private $bound_params = [];
    private $bound_result = [];
    private $result = null;
    private $closed = false;

    public function __construct($link, $sql, $placeholder_count) {
        $this->link = $link;
        $this->sql = $sql;
        $this->placeholder_count = $placeholder_count;
    }

    public function bind_param($types, &...$vars) {
        if ($this->closed) return $this->fail('Instrukcja jest zamknięta.');
        if (strlen($types) !== count($vars) || count($vars) !== $this->placeholder_count) {
            return $this->fail('Liczba typów, zmiennych i znaczników ? musi być taka sama.');
        }
        if (preg_match('/[^idsb]/', $types)) {
            return $this->fail('bind_param obsługuje tylko typy i, d, s oraz b.');
        }
        $this->bound_types = $types;
        $this->bound_params = [];
        foreach ($vars as &$value) $this->bound_params[] =& $value;
        $this->clear_error();
        return true;
    }

    public function execute() {
        if ($this->closed) return $this->fail('Instrukcja jest zamknięta.');
        if (count($this->bound_params) !== $this->placeholder_count) {
            return $this->fail('Nie powiązano wszystkich parametrów. Wywołaj bind_param przed execute.');
        }
        $params = [];
        foreach ($this->bound_params as $index => $value) {
            if ($value === null) {
                $params[] = null;
                continue;
            }
            $params[] = match ($this->bound_types[$index]) {
                'i' => intval($value),
                'd' => floatval($value),
                's', 'b' => strval($value),
            };
        }
        $answer = tehnikum_ask([
            'op' => 'query',
            'sql' => $this->sql,
            'params' => $params,
        ]);
        if ($answer['ok'] !== true) return $this->fail($answer['error']);
        $this->clear_error();
        $this->affected_rows = $answer['affectedRows'];
        $this->insert_id = $answer['insertId'];
        $this->link->affected_rows = $this->affected_rows;
        $this->link->insert_id = $this->insert_id;
        $this->result = $answer['columns'] === null
            ? null
            : new mysqli_result($answer['columns'], $answer['rows']);
        $this->num_rows = $this->result === null ? 0 : $this->result->num_rows;
        return true;
    }

    public function get_result() {
        if ($this->result === null) return false;
        return $this->result;
    }

    public function bind_result(&...$vars) {
        if ($this->result === null) return $this->fail('Najpierw wykonaj zapytanie zwracające kolumny.');
        if (count($vars) !== $this->result->field_count) {
            return $this->fail('Liczba zmiennych bind_result musi odpowiadać liczbie kolumn.');
        }
        $this->bound_result = [];
        foreach ($vars as &$value) $this->bound_result[] =& $value;
        $this->clear_error();
        return true;
    }

    public function fetch() {
        if ($this->result === null) return $this->fail('Brak wyniku do pobrania.');
        if (count($this->bound_result) !== $this->result->field_count) {
            return $this->fail('Wywołaj bind_result przed fetch.');
        }
        $row = $this->result->fetch_row();
        if ($row === null) return null;
        foreach ($row as $index => $value) $this->bound_result[$index] = $value;
        return true;
    }

    public function close() {
        $this->closed = true;
        $this->result = null;
        $this->bound_types = '';
        $this->bound_params = [];
        $this->bound_result = [];
        return true;
    }

    private function fail($message) {
        $this->errno = 1;
        $this->error = $message;
        $this->link->set_error($message);
        return false;
    }

    private function clear_error() {
        $this->errno = 0;
        $this->error = '';
        $this->link->clear_error();
    }
}

class mysqli {
    public $affected_rows = 0;
    public $client_info = 'tehnikum vrzno/sql.js mysqli shim';
    public $connect_errno = 0;
    public $connect_error = null;
    public $errno = 0;
    public $error = '';
    public $field_count = 0;
    public $host_info = 'sql.js in browser';
    public $insert_id = 0;
    public $server_info = 'SQLite via sql.js, not MySQL';
    private $closed = false;

    public function __construct(
        $hostname = null,
        $username = null,
        $password = null,
        $database = null,
        $port = null,
        $socket = null
    ) {}

    public function query($sql) {
        if ($this->closed) return $this->set_error('Połączenie jest zamknięte.');
        $answer = tehnikum_ask(['op' => 'query', 'sql' => $sql, 'params' => []]);
        if ($answer['ok'] !== true) return $this->set_error($answer['error']);
        $this->clear_error();
        $this->affected_rows = $answer['affectedRows'];
        $this->insert_id = $answer['insertId'];
        $this->field_count = $answer['columns'] === null ? 0 : count($answer['columns']);
        if ($answer['columns'] === null) return true;
        return new mysqli_result($answer['columns'], $answer['rows']);
    }

    public function prepare($sql) {
        if ($this->closed) return $this->set_error('Połączenie jest zamknięte.');
        $answer = tehnikum_ask(['op' => 'prepare', 'sql' => $sql]);
        if ($answer['ok'] !== true) return $this->set_error($answer['error']);
        $this->clear_error();
        return new mysqli_stmt($this, $sql, $answer['placeholderCount']);
    }

    public function set_charset($charset) {
        if (strtolower($charset) !== 'utf8' && strtolower($charset) !== 'utf8mb4') {
            return $this->set_error('Ta piaskownica obsługuje tylko UTF-8.');
        }
        $this->clear_error();
        return true;
    }

    public function real_escape_string($text) {
        return str_replace("'", "''", $text);
    }

    public function select_db($database) { return true; }

    public function multi_query($sql) {
        tehnikum_niedostepne(
            'mysqli::multi_query',
            'Warstwa sql.js wykonuje dokładnie jedno polecenie. Rozdziel SQL na osobne wywołania query.'
        );
    }

    public function close() {
        $this->closed = true;
        return true;
    }

    public function set_error($message) {
        $this->errno = 1;
        $this->error = $message;
        return false;
    }

    public function clear_error() {
        $this->errno = 0;
        $this->error = '';
    }
}

function mysqli_connect($host = null, $user = null, $password = null, $database = null, $port = null, $socket = null) {
    return new mysqli($host, $user, $password, $database, $port, $socket);
}

function mysqli_connect_errno() { return 0; }
function mysqli_connect_error() { return null; }
function mysqli_query($link, $sql) { return $link->query($sql); }
function mysqli_prepare($link, $sql) { return $link->prepare($sql); }

function mysqli_fetch_row($result) {
    if (!($result instanceof mysqli_result)) return null;
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

function mysqli_fetch_object($result, $class = "stdClass", $constructor_args = []) {
    $row = mysqli_fetch_assoc($result);
    if ($row === null) return null;
    $object = new $class(...$constructor_args);
    foreach ($row as $key => $value) $object->$key = $value;
    return $object;
}

function mysqli_num_rows($result) {
    return $result instanceof mysqli_result ? $result->num_rows : 0;
}

function mysqli_error($link) { return $link instanceof mysqli ? $link->error : ''; }
function mysqli_errno($link) { return $link instanceof mysqli ? $link->errno : 0; }
function mysqli_affected_rows($link) { return $link instanceof mysqli ? $link->affected_rows : -1; }
function mysqli_insert_id($link) { return $link instanceof mysqli ? $link->insert_id : 0; }
function mysqli_real_escape_string($link, $text) { return $link->real_escape_string($text); }
function mysqli_set_charset($link, $charset) { return $link->set_charset($charset); }
function mysqli_select_db($link, $database) { return $link->select_db($database); }
function mysqli_close($link) { return $link->close(); }
function mysqli_free_result($result) { return $result->free(); }

function mysqli_stmt_bind_param($statement, $types, &...$vars) {
    return $statement->bind_param($types, ...$vars);
}
function mysqli_stmt_execute($statement) { return $statement->execute(); }
function mysqli_stmt_get_result($statement) { return $statement->get_result(); }
function mysqli_stmt_bind_result($statement, &...$vars) {
    return $statement->bind_result(...$vars);
}
function mysqli_stmt_fetch($statement) { return $statement->fetch(); }
function mysqli_stmt_close($statement) { return $statement->close(); }
function mysqli_stmt_error($statement) { return $statement->error; }
function mysqli_stmt_errno($statement) { return $statement->errno; }
function mysqli_stmt_affected_rows($statement) { return $statement->affected_rows; }
function mysqli_stmt_insert_id($statement) { return $statement->insert_id; }
function mysqli_stmt_num_rows($statement) { return $statement->num_rows; }

function mysqli_multi_query($link, $sql) {
    tehnikum_niedostepne(
        'mysqli_multi_query',
        'Warstwa sql.js wykonuje dokładnie jedno polecenie. Rozdziel SQL na osobne wywołania mysqli_query.'
    );
}
`;
