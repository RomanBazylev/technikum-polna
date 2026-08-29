/**
 * Всё, что нужно показать до скачивания движка PHP. Лежит отдельно от
 * phpEngine.ts, потому что тот тянет за собой текст шима и sql.js: экран
 * с предупреждением о трафике не имеет права стоить этого трафика.
 */

/** Версия закреплена: alpha-теги php-wasm иногда меняют состав расширений. */
export const PHP_WASM_VERSION = '0.0.9-alpha-32';

export const PHP_WASM_MODULE = `https://cdn.jsdelivr.net/npm/php-wasm@${PHP_WASM_VERSION}/PhpWeb.mjs`;

/**
 * Замерено 27.08.2026 по ответам jsDelivr со сжатием brotli: движок 2,77 МБ,
 * libxml2 0,41 МБ, обвязка 0,09 МБ. В распакованном виде это 12,9 МБ, но по
 * сети едет столько, сколько здесь написано, и ученику важно именно это.
 */
export const PHP_DOWNLOAD_MB = 3.3;

/** Движок SQLite, если ученик не открывал перед этим песочницу SQL. */
export const SQL_DOWNLOAD_MB = 0.64;

export type Connection =
  | { kind: 'unknown' }
  | { kind: 'data-saver' }
  | { kind: 'slow'; effectiveType: string }
  | { kind: 'fine'; effectiveType: string };

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

export function readConnection(): Connection {
  if (typeof navigator === 'undefined') return { kind: 'unknown' };
  const information = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (information === undefined) return { kind: 'unknown' };
  if (information.saveData === true) return { kind: 'data-saver' };
  const effectiveType = information.effectiveType;
  if (effectiveType === undefined) return { kind: 'unknown' };
  if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
    return { kind: 'slow', effectiveType };
  }
  return { kind: 'fine', effectiveType };
}

export type PhpTask = { id: string; label: string; starter: string };

/** Форма практического задания INF.03: запрос, обход результата, вывод в HTML. */
export const PHP_TASKS: readonly PhpTask[] = [
  {
    id: 'lista',
    label: 'Lista uczniów',
    starter: `<?php
$polaczenie = mysqli_connect("localhost", "root", "", "szkola");
mysqli_set_charset($polaczenie, "utf8");

$wynik = mysqli_query($polaczenie, "SELECT imie, nazwisko FROM uczniowie WHERE klasa = '1B' ORDER BY nazwisko");
if (!$wynik) {
    die("Blad zapytania: " . mysqli_error($polaczenie));
}

echo "<h3>Uczniowie klasy 1B</h3>";
echo "<ul>";
while ($uczen = mysqli_fetch_assoc($wynik)) {
    echo "<li>" . $uczen["imie"] . " " . $uczen["nazwisko"] . "</li>";
}
echo "</ul>";

mysqli_close($polaczenie);
`,
  },
  {
    id: 'tabela',
    label: 'Tabela z JOIN',
    starter: `<?php
$polaczenie = mysqli_connect("localhost", "root", "", "szkola");

$sql = "SELECT u.nazwisko, p.nazwa, o.ocena
        FROM oceny o
        JOIN uczniowie u ON u.id = o.uczen_id
        JOIN przedmioty p ON p.id = o.przedmiot_id
        ORDER BY u.nazwisko";
$wynik = mysqli_query($polaczenie, $sql);

echo "<table border='1'>";
echo "<tr><th>Nazwisko</th><th>Przedmiot</th><th>Ocena</th></tr>";
while ($w = mysqli_fetch_assoc($wynik)) {
    echo "<tr>";
    echo "<td>" . $w["nazwisko"] . "</td>";
    echo "<td>" . $w["nazwa"] . "</td>";
    echo "<td>" . $w["ocena"] . "</td>";
    echo "</tr>";
}
echo "</table>";
echo "<p>Wierszy: " . mysqli_num_rows($wynik) . "</p>";

mysqli_close($polaczenie);
`,
  },
  {
    id: 'srednia',
    label: 'Średnia ważona',
    starter: `<?php
$polaczenie = mysqli_connect("localhost", "root", "", "szkola");

$sql = "SELECT u.nazwisko,
               ROUND(SUM(o.ocena * o.waga) * 1.0 / SUM(o.waga), 2) AS srednia
        FROM oceny o
        JOIN uczniowie u ON u.id = o.uczen_id
        GROUP BY u.id
        ORDER BY srednia DESC";
$wynik = mysqli_query($polaczenie, $sql);

echo "<ol>";
while ($w = mysqli_fetch_assoc($wynik)) {
    echo "<li>" . $w["nazwisko"] . ": " . $w["srednia"] . "</li>";
}
echo "</ol>";

mysqli_close($polaczenie);
`,
  },
  {
    id: 'prepared',
    label: 'Prepared statement',
    starter: `<?php
$db = new mysqli("localhost", "root", "", "szkola");
$klasa = "1B";
$stmt = $db->prepare(
    "SELECT imie, nazwisko FROM uczniowie WHERE klasa = ? ORDER BY nazwisko"
);
$stmt->bind_param("s", $klasa);
$stmt->execute();
$wynik = $stmt->get_result();

echo "<h3>Prepared statement: klasa 1B</h3><ul>";
while ($uczen = $wynik->fetch_assoc()) {
    echo "<li>" . $uczen["imie"] . " " . $uczen["nazwisko"] . "</li>";
}
echo "</ul><p>Wierszy: " . $wynik->num_rows . "</p>";

$stmt->close();
$db->close();
`,
  },
];

/**
 * Границы, о которых ученик должен узнать до практики, а не посреди неё.
 */
export const PHP_BOUNDARIES: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: 'Warstwa zgodności, nie MySQL · Совместимый слой, не MySQL',
    detail:
      'PHP 8.3 działa naprawdę, ale mysqli jest lokalnym mostem vrzno → JavaScript → sql.js. Nie ma serwera MySQL, logowania, sieci ani jego ustawień. · PHP настоящий, но mysqli здесь совместимый мост к sql.js.',
  },
  {
    title: 'Dialekt SQLite · Диалект SQLite',
    detail:
      'Prepared statements i zwykłe query trafiają do SQLite. AUTO_INCREMENT, ENGINE=InnoDB, funkcje MySQL oraz trzy ciche różnice opisane wyżej nie zachowują się jak na XAMPP-ie. · Запросы выполняет SQLite, поэтому синтаксис и функции MySQL отличаются.',
  },
  {
    title: 'Jedno polecenie · Один запрос',
    detail:
      'mysqli_multi_query i mysqli::multi_query kończą program czytelnym błędem. Obsługa wielu zestawów wyników różniłaby się od MySQL, więc każde polecenie uruchamiaj osobno. · multi_query не поддерживается и завершает программу с явной ошибкой.',
  },
  {
    title: 'Bez serwera WWW · Без веб-сервера',
    detail:
      'Nie ma Apache, routingu, sesji, obsługi formularzy ani uploadu. $_GET, $_POST, $_SESSION i $_FILES nie odwzorowują żądania HTTP. · Нет Apache, HTTP-запросов, сессий, форм и загрузки файлов.',
  },
];
