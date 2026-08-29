# Pochodzenie mapy programu

Stan źródeł: 2026-08-29.

## Efekty INF.03 i INF.04

Źródłem osi jest oficjalny dokument Ośrodka Rozwoju Edukacji:

- "Podstawa programowa kształcenia w zawodzie szkolnictwa branżowego: technik programista 351406"
- https://ore.edu.pl/wp-content/uploads/2020/03/technik-programista.pdf
- pobrano 2026-08-28
- SHA-256: `c5bd05ab10520590c0912f15059e12f943a6c87f6c03394337a39784b9c3aa86`
- podstawa prawna: Dz.U. 2019 poz. 991, załącznik nr 28

`scripts/extract-programme-provenance.py` pobiera PDF, odrzuca plik o innym
skrócie, wydobywa lewą kolumnę tabel i zapisuje `content/effects.json`.
Pośredni zrzut tekstu z metadanymi jest w
`content/provenance/technik-programista-ore-extract.txt`.

Odtworzenie danych:

```powershell
python -m pip install pypdf==6.16.1
python scripts/extract-programme-provenance.py --check
```

Parser wymaga 58 szczegółowych efektów INF.03 i 61 efektów INF.04. Sprawdza
też ciągłość numeracji w każdej jednostce. Testy parsera uruchamia `npm test`.

Każda jednostka w JSON ma adres, tytuł i datę dokumentu, datę pobrania,
SHA-256 oraz podstawę prawną. Każdy szczegółowy efekt ma własny kod i tekst.

## Przedmioty i godziny

Nazwy przedmiotów i programów potwierdza szkolny dokument:

- "Szkolny zestaw programów nauczania obowiązujący od roku szkolnego 2026/2027"
- https://technikumpolna.pl/wp-content/uploads/2026/07/Szkolny-zestaw-programow-nauczania-2026.pdf
- pobrano 2026-08-28

Rozszerzenia i języki potwierdza strona kierunku:

- "Technik programista"
- https://technikumpolna.pl/offer/programmer-technician/
- pobrano 2026-08-28

Podręczniki wskazuje szkolny wykaz:

- "Podręczniki i programy nauczania na rok szkolny 2026/2027"
- https://technikumpolna.pl/for-student/textbooks/
- pobrano 2026-08-29

Godziny pochodzą z obowiązującego ramowego planu:

- "Rozporządzenie Ministra Edukacji z dnia 22 lipca 2026 r. w sprawie
  ramowych planów nauczania dla publicznych szkół", załącznik nr 5
- https://api.sejm.gov.pl/eli/acts/DU/2026/1028/text.pdf
- pobrano 2026-08-29

`mappingStatus: "framework"` oznacza rozkład podany w rozporządzeniu.
`mappingStatus: "unconfirmed"` i `hoursByGrade: null` oznaczają, że szkoła
potwierdziła przedmiot, ale nie opublikowała rozkładu godzin tego oddziału.
Brak daty wydania na stronie szkoły zapisujemy jako `documentDate: null`.

## Tematy i uczciwie opisane braki

Mapa ma po jednej pozycji na każdy szczegółowy efekt, razem 119 plików.
Każdy plik wskazuje kod efektu i dokument ORE. To kompletna mapa wymagań,
nie plan lekcji ani autorski podręcznik.

Szkoła nie opublikowała przypisania efektów do klas, przedmiotów zawodowych
ani kolejności realizacji. Dlatego każde takie przypisanie ma
`mappingStatus: "unconfirmed"` oraz widoczną notę po polsku i rosyjsku.
Nie dodano teorii dla przedmiotów, których poprawności nie da się sprawdzić
uruchomieniem kodu.
