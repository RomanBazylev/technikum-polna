/**
 * Учебная база в духе практического задания INF.03: несколько связанных
 * таблиц, на которых отрабатываются JOIN, GROUP BY и агрегаты.
 * Схема записана в диалекте SQLite, потому что MySQL в браузер не помещается.
 */
export const SEED_SQL = `
CREATE TABLE uczniowie (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imie TEXT NOT NULL,
  nazwisko TEXT NOT NULL,
  klasa TEXT NOT NULL
);

CREATE TABLE przedmioty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nazwa TEXT NOT NULL,
  godziny INTEGER NOT NULL
);

CREATE TABLE oceny (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uczen_id INTEGER NOT NULL REFERENCES uczniowie(id),
  przedmiot_id INTEGER NOT NULL REFERENCES przedmioty(id),
  ocena INTEGER NOT NULL,
  waga INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL
);

INSERT INTO uczniowie (imie, nazwisko, klasa) VALUES
  ('Anna', 'Zielinska', '1B'),
  ('Bartek', 'Nowak', '1B'),
  ('Cezary', 'Adamczyk', '1B'),
  ('Dorota', 'Wisniewska', '2B'),
  ('Emil', 'Lewandowski', '2B');

INSERT INTO przedmioty (nazwa, godziny) VALUES
  ('matematyka', 14),
  ('witryny internetowe', 6),
  ('bazy danych', 4),
  ('jezyk polski', 16);

INSERT INTO oceny (uczen_id, przedmiot_id, ocena, waga, data) VALUES
  (1, 1, 5, 3, '2026-10-12'),
  (1, 2, 4, 1, '2026-10-19'),
  (1, 3, 3, 2, '2026-11-05'),
  (2, 1, 3, 3, '2026-10-12'),
  (2, 2, 5, 1, '2026-10-19'),
  (3, 1, 2, 3, '2026-10-12'),
  (3, 4, 4, 2, '2026-11-14'),
  (4, 1, 4, 3, '2026-10-13'),
  (4, 3, 5, 2, '2026-11-06'),
  (5, 4, 3, 2, '2026-11-14');
`;

export type SqlTask = {
  id: string;
  prompt: string;
  hint: string;
  starter: string;
};

/** Задачи в формате, близком к четырём запросам практической части INF.03. */
export const SQL_TASKS: readonly SqlTask[] = [
  {
    id: 'select-klasa',
    prompt: 'Wypisz imię i nazwisko wszystkich uczniów klasy 1B, posortowane po nazwisku.',
    hint: 'WHERE plus ORDER BY.',
    starter: 'SELECT imie, nazwisko\nFROM uczniowie\nWHERE klasa = \'1B\'\nORDER BY nazwisko;',
  },
  {
    id: 'join-oceny',
    prompt: 'Pokaż nazwisko ucznia, nazwę przedmiotu i ocenę dla każdej wystawionej oceny.',
    hint: 'Dwa złączenia INNER JOIN po kluczach obcych.',
    starter:
      'SELECT u.nazwisko, p.nazwa, o.ocena\nFROM oceny o\nJOIN uczniowie u ON u.id = o.uczen_id\nJOIN przedmioty p ON p.id = o.przedmiot_id;',
  },
  {
    id: 'srednia-wazona',
    prompt: 'Policz średnią ważoną ocen dla każdego ucznia i posortuj malejąco.',
    hint: 'SUM(ocena * waga) / SUM(waga), GROUP BY i ORDER BY.',
    starter:
      'SELECT u.nazwisko,\n       ROUND(SUM(o.ocena * o.waga) * 1.0 / SUM(o.waga), 2) AS srednia\nFROM oceny o\nJOIN uczniowie u ON u.id = o.uczen_id\nGROUP BY u.id\nORDER BY srednia DESC;',
  },
  {
    id: 'count-bez-ocen',
    prompt: 'Znajdź uczniów, którzy nie mają jeszcze ani jednej oceny.',
    hint: 'LEFT JOIN i warunek na NULL, albo NOT IN.',
    starter:
      'SELECT u.nazwisko\nFROM uczniowie u\nLEFT JOIN oceny o ON o.uczen_id = u.id\nWHERE o.id IS NULL;',
  },
];

/**
 * Три расхождения SQLite с MySQL, которые не дают ошибку, а дают неверный
 * ответ. Ученик, выучивший неверное поведение, оказывается в худшем положении,
 * чем не учившийся вовсе, поэтому они показаны прямо в интерфейсе.
 */
export const SILENT_DIFFERENCES: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: 'Dzielenie całkowite',
    detail:
      'W SQLite 5/2 daje 2, w MySQL 2.5. Dlatego w zadaniu ze średnią jest mnożenie przez 1.0.',
  },
  {
    title: 'Porównanie tekstu',
    detail:
      'SQLite rozróżnia wielkość liter przy =, MySQL przy domyślnym porównaniu nie rozróżnia.',
  },
  {
    title: 'Sortowanie polskich liter',
    detail:
      'MySQL z utf8mb4_polish_ci stawia ą obok a. SQLite wyrzuca wszystkie znaki diakrytyczne za z, więc ORDER BY nazwisko da inną kolejność niż na egzaminie.',
  },
];
