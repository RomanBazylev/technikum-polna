# Technikum Polna

Przewodnik i narzędzia dla uczniów **Technikum Kinematograficzno-Komputerowego im. Krzysztofa Kieślowskiego**, ul. Polna 7 w Warszawie, kierunek **technik programista**.

Справочник и инструменты для учеников варшавского техникума на улице Польна, 7, специальность «техник-программист».

**https://romanbazylev.github.io/technikum-polna/**

Nieoficjalny projekt uczniowski. Szkoła go nie prowadzi i nie firmuje.

## Co to jest

Statyczna aplikacja bez serwera i bez kont. Wszystko, co wpiszesz, zostaje w Twojej przeglądarce — nie ma dokąd tego wysłać, bo backendu nie ma. To właściwość konstrukcji, nie obietnica z polityki prywatności.

Cztery zakładki odpowiadają czterem sytuacjom, w których uczeń sięga po telefon:

| Zakładka | Po co |
|---|---|
| Dziś | Terminy, o których nikt nie przypomni |
| Nauka | Mapa programu: temat, kod efektu, gdzie o tym poczytać |
| Egzaminy | INF.03, INF.04 i matura jedną linią przez pięć lat |
| Szkoła | Zasady, prawa, pieniądze i dojazd |

## Czego tu nie ma, i dlaczego

- **Kopii danych z Librusa.** Darmowa Synergia w przeglądarce ma już plan lekcji, oceny, frekwencję i zadania domowe. Budowanie tego od nowa oznaczałoby wieczne naprawianie scrapera przeciwko firmie, która w 2020 roku zamknęła Szkolny.eu, a serwerowa synchronizacja wymagałaby przechowywania cudzych haseł do dziennika.
- **Banku 2000 pytań egzaminacyjnych.** Istnieje kilka żywych projektów open source, między innymi [Marmo77/egzamin-programista](https://github.com/Marmo77/egzamin-programista) i [Chr1skyy](https://github.com/Chr1skyy/Egzamin-Zawodowy-E14-EE09-INF03) ze 125 arkuszami. Odsyłamy do nich.
- **Własnej teorii z przedmiotów, których poprawności nie da się sprawdzić uruchomieniem kodu.** Do matematyki, fizyki i polskiego prowadzimy na ZPE, Pi-stację i Wolne Lektury.
- **Reklam.** Poza kwestią gustu: licencja CC BY-NC-SA materiałów Pi-stacji i Khan Academy traktuje reklamę jako użycie komercyjne.
- **Ocen nauczycieli.** Katalog nauczycieli jest wyłącznie lokalny i nigdy nie trafia do repozytorium.

## Rozwój

```bash
npm install
npm run dev        # serwer deweloperski
npm test           # testy jednostkowe czystych funkcji
npm run validate   # spójność treści między plikami
npm run verify     # typy, treść, testy, build - to samo co w CI
```

`npm run test:e2e` sprawdza **żywy adres** na GitHub Pages, nie localhost. Poprawny build lokalnie i zepsute ścieżki w produkcji to najczęstsza awaria projektu na podścieżce, więc mierzymy tam, gdzie boli. Do sprawdzenia lokalnej kopii ustaw `PLAYWRIGHT_BASE_URL`.

## Treść

Materiały leżą w `content/` i są walidowane przy każdym buildzie.

- `handbook/pl` i `handbook/ru` — przewodnik. Każdy artykuł **musi** istnieć w obu językach; brak pary wywala CI.
- `topics/pl` — mapa programu. Rosyjski tylko na poziomie terminów, żeby uczeń czytał po polsku.
- `glossary.json` — słownik PL/RU z wymową.
- `obligations.json` — terminy z kotwicami czasowymi i podstawą prawną.

Każdy materiał niesie pole źródła. Wariant `link-only` nie ma pola na treść, więc skopiowanie cudzego tekstu jest niemożliwe technicznie, a lista licencji `embeddable` nie zawiera wariantów z NC.

## Licencja

Kod na licencji MIT. Treści tworzone w tym repozytorium na **CC BY-SA 4.0**.

Materiały CKE, ZPE i wydawnictw są wyłącznie linkowane, nigdy kopiowane.
