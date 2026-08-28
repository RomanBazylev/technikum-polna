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
];

/**
 * Границы, о которых ученик должен узнать до практики, а не посреди неё.
 */
export const PHP_BOUNDARIES: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: 'Brak przygotowanych zapytań',
    detail:
      'mysqli_prepare, bind_param i execute zgłoszą tu błąd. Rozwiązania INF.03 budują SQL przez sklejanie i mysqli_query, więc do egzaminu to wystarcza, ale w prawdziwym projekcie przygotowane zapytania są jedyną obroną przed SQL injection.',
  },
  {
    title: 'Pod spodem jest SQLite, nie MySQL',
    detail:
      'Zapytania trafiają do tej samej bazy co piaskownica SQL. Trzy ciche różnice dialektów opisane są w piaskownicy SQL i obowiązują też tutaj.',
  },
  {
    title: 'Jedno zapytanie na wywołanie',
    detail:
      'mysqli_multi_query nie działa. Kilka poleceń rozdziel na osobne wywołania mysqli_query.',
  },
  {
    title: 'Nie ma Apache, sesji ani plików',
    detail:
      'Nie ma $_POST, $_SESSION, formularzy ani uploadu. To ćwiczy się na XAMPP-ie, bo tam sprawdza się też konfigurację stanowiska.',
  },
];
