#!/usr/bin/env python3
"""Extract technician-programmer effects from the official ORE PDF.

Requirements:
    Python 3.12+
    pypdf 6.16.1

The PDF tables place effects in the left column and verification criteria in
the right column. This script keeps the left column, joins wrapped lines, and
writes both the normalized intermediate artifact and the derived JSON.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://ore.edu.pl/wp-content/uploads/2020/03/technik-programista.pdf"
SOURCE_SHA256 = "c5bd05ab10520590c0912f15059e12f943a6c87f6c03394337a39784b9c3aa86"
SOURCE_TITLE = (
    "Podstawa programowa kształcenia w zawodzie szkolnictwa branżowego: "
    "technik programista 351406"
)
SOURCE_DATE = "2019-05-16"
RETRIEVED_AT = "2026-08-28"
RAW_PATH = ROOT / "content" / "provenance" / "technik-programista-ore-extract.txt"
OUTPUT_PATH = ROOT / "content" / "effects.json"

UNIT_NAMES = {
    "INF.03.1": "Bezpieczeństwo i higiena pracy",
    "INF.03.2": "Podstawy informatyki",
    "INF.03.3": "Projektowanie stron internetowych",
    "INF.03.4": "Projektowanie i administrowanie bazami danych",
    "INF.03.5": "Programowanie aplikacji internetowych",
    "INF.03.6": "Język obcy zawodowy",
    "INF.03.7": "Kompetencje personalne i społeczne",
    "INF.03.8": "Organizacja pracy małych zespołów",
    "INF.04.1": "Bezpieczeństwo i higiena pracy",
    "INF.04.2": "Podstawy informatyki",
    "INF.04.3": "Projektowanie oprogramowania",
    "INF.04.4": "Programowanie obiektowe",
    "INF.04.5": "Programowanie aplikacji desktopowych",
    "INF.04.6": "Programowanie aplikacji mobilnych",
    "INF.04.7": "Programowanie aplikacji zaawansowanych webowych",
    "INF.04.8": "Testowanie i dokumentowanie aplikacji",
    "INF.04.9": "Język obcy zawodowy",
    "INF.04.10": "Kompetencje personalne i społeczne",
    "INF.04.11": "Organizacja pracy małych zespołów",
}

UNIT_MAPPING = {
    "INF.03.1": (["podstawy informatyki"], [1]),
    "INF.03.2": (["podstawy informatyki"], [1, 2]),
    "INF.03.3": (
        ["witryny internetowe", "pracownia programowania aplikacji internetowych"],
        [1, 2],
    ),
    "INF.03.4": (["bazy danych", "pracownia baz danych"], [1, 2]),
    "INF.03.5": (["pracownia programowania aplikacji internetowych"], [2, 3]),
    "INF.03.6": (["język angielski zawodowy"], [2, 3]),
    "INF.03.7": (["podstawy informatyki"], [1, 2, 3]),
    "INF.03.8": (["pracownia programowania aplikacji internetowych"], [2, 3]),
    "INF.04.1": (["projektowanie oprogramowania"], [2]),
    "INF.04.2": (["projektowanie oprogramowania"], [2, 3]),
    "INF.04.3": (["projektowanie oprogramowania"], [3, 4]),
    "INF.04.4": (["programowanie obiektowe"], [3, 4]),
    "INF.04.5": (["pracownia programowania aplikacji desktopowych"], [3, 4]),
    "INF.04.6": (["pracownia programowania aplikacji mobilnych"], [4, 5]),
    "INF.04.7": (
        ["pracownia programowania zaawansowanych aplikacji webowych"],
        [4, 5],
    ),
    "INF.04.8": (
        ["pracownia programowania zaawansowanych aplikacji webowych"],
        [4, 5],
    ),
    "INF.04.9": (["język angielski zawodowy"], [3, 4]),
    "INF.04.10": (["projektowanie oprogramowania"], [3, 4, 5]),
    "INF.04.11": (["zajęcia specjalizujące"], [4, 5]),
}

EXPECTED_COUNTS = {"INF.03": 58, "INF.04": 61}
UNIT_RE = re.compile(r"^(INF\.0[34]\.(?:[1-9]|10|11))\.\s+(.+)$")
ITEM_RE = re.compile(r"^\s*(\d+)\)\s+(.+)$")

# The source uses a two-column table. A few long left-column cells overlap page
# numbers or right-column criteria in pypdf's layout extraction. These values
# are manual transcriptions checked against the PDF image, keyed by effect ID.
CANONICAL_OVERRIDES = {
    "INF.03.2.3": "charakteryzuje systemy informatyczne oraz rozróżnia systemy informatyczne pod względem funkcjonalności",
    "INF.03.2.7": "stosuje zasady cyberbezpieczeństwa",
    "INF.03.4.2": "tworzy diagramy E/R (Entity-Relationship Diagram)",
    "INF.03.6.2": (
        "rozumie proste wypowiedzi ustne artykułowane wyraźnie, w standardowej odmianie "
        "języka obcego nowożytnego, a także proste wypowiedzi pisemne w języku obcym "
        "nowożytnym, w zakresie umożliwiającym realizację zadań zawodowych: "
        "a) rozumie proste wypowiedzi ustne dotyczące czynności zawodowych (np. rozmowy, "
        "wiadomości, komunikaty, instrukcje lub filmy instruktażowe, prezentacje), "
        "artykułowane wyraźnie, w standardowej odmianie języka "
        "b) rozumie proste wypowiedzi pisemne dotyczące czynności zawodowych (np. napisy, "
        "broszury, instrukcje obsługi, przewodniki, dokumentację zawodową)"
    ),
    "INF.03.6.3": (
        "samodzielnie tworzy krótkie, proste, spójne i logiczne wypowiedzi ustne i pisemne "
        "w języku obcym nowożytnym, w zakresie umożliwiającym realizację zadań zawodowych: "
        "a) tworzy krótkie, proste, spójne i logiczne wypowiedzi ustne dotyczące czynności "
        "zawodowych (np. polecenie, komunikat, instrukcję) "
        "b) tworzy krótkie, proste, spójne i logiczne wypowiedzi pisemne dotyczące czynności "
        "zawodowych (np. komunikat, e-mail, instrukcję, wiadomość, CV, list motywacyjny, "
        "dokument związany z wykonywanym zawodem – według wzoru)"
    ),
    "INF.03.6.4": (
        "uczestniczy w rozmowie w typowych sytuacjach związanych z realizacją zadań "
        "zawodowych – reaguje w języku obcym nowożytnym w sposób zrozumiały, adekwatnie "
        "do sytuacji komunikacyjnej, ustnie lub w formie prostego tekstu: "
        "a) reaguje ustnie (np. podczas rozmowy z innym pracownikiem, klientem, "
        "kontrahentem, w tym podczas rozmowy telefonicznej) w typowych sytuacjach "
        "związanych z wykonywaniem czynności zawodowych "
        "b) reaguje w formie prostego tekstu pisanego (np. wiadomość, formularz, e-mail, "
        "dokument związany z wykonywanym zawodem) w typowych sytuacjach związanych "
        "z wykonywaniem czynności zawodowych"
    ),
    "INF.03.6.5": (
        "zmienia formę przekazu ustnego lub pisemnego w języku obcym nowożytnym "
        "w typowych sytuacjach związanych z wykonywaniem czynności zawodowych"
    ),
    "INF.03.6.6": (
        "wykorzystuje strategie służące doskonaleniu własnych umiejętności językowych "
        "oraz podnoszące świadomość językową: a) wykorzystuje techniki samodzielnej nauki "
        "języka b) współdziała w grupie c) korzysta ze źródeł informacji w języku obcym "
        "nowożytnym d) stosuje strategie komunikacyjne i kompensacyjne"
    ),
    "INF.03.7.1": "przestrzega zasad kultury osobistej i etyki zawodowej",
    "INF.03.7.6": "doskonali umiejętności zawodowe",
    "INF.03.7.7": "stosuje zasady komunikacji interpersonalnej",
    "INF.03.7.8": "negocjuje warunki porozumień",
    "INF.03.7.9": "stosuje metody i techniki rozwiązywania problemów",
    "INF.03.7.10": "współpracuje w zespole",
    "INF.03.8.1": "planuje i organizuje pracę zespołu w celu wykonania przydzielonych zadań",
    "INF.03.8.2": "dobiera osoby do wykonania przydzielonych zadań",
    "INF.03.8.3": "kieruje wykonaniem przydzielonych zadań",
    "INF.03.8.4": "ocenia jakość wykonania przydzielonych zadań",
    "INF.03.8.5": (
        "wprowadza rozwiązania techniczne i organizacyjne wpływające na poprawę warunków "
        "i jakości pracy"
    ),
    "INF.04.2.3": "charakteryzuje systemy informatyczne oraz rozróżnia systemy informatyczne pod względem funkcjonalności",
    "INF.04.3.1": "posługuje się prostymi typami danych",
    "INF.04.9.1": (
        "posługuje się podstawowym zasobem środków językowych w języku obcym nowożytnym "
        "(ze szczególnym uwzględnieniem środków leksykalnych) umożliwiającym realizację "
        "czynności zawodowych w zakresie tematów związanych: a) ze stanowiskiem pracy "
        "i jego wyposażeniem b) z głównymi technologiami stosowanymi w danym zawodzie "
        "c) z dokumentacją związaną z danym zawodem d) z usługami świadczonymi w danym zawodzie"
    ),
    "INF.04.9.2": (
        "rozumie proste wypowiedzi ustne artykułowane wyraźnie, w standardowej odmianie "
        "języka obcego nowożytnego, a także proste wypowiedzi pisemne w języku obcym "
        "nowożytnym w zakresie umożliwiającym realizację zadań zawodowych: "
        "a) rozumie proste wypowiedzi ustne dotyczące czynności zawodowych (np. rozmowy, "
        "wiadomości, komunikaty, instrukcje czy filmy instruktażowe, prezentacje), "
        "artykułowane wyraźnie, w standardowej odmianie języka "
        "b) rozumie proste wypowiedzi pisemne dotyczące czynności zawodowych (np. napisy, "
        "broszury, instrukcje obsługi, przewodniki, dokumentację zawodową)"
    ),
    "INF.04.9.3": (
        "samodzielnie tworzy krótkie, proste, spójne i logiczne wypowiedzi ustne i pisemne "
        "w języku obcym nowożytnym w zakresie umożliwiającym realizację zadań zawodowych: "
        "a) tworzy krótkie, proste, spójne i logiczne wypowiedzi ustne dotyczące czynności "
        "zawodowych (np. polecenie, komunikat, instrukcję) "
        "b) tworzy krótkie, proste, spójne i logiczne wypowiedzi pisemne dotyczące czynności "
        "zawodowych (np. komunikat, e-mail, instrukcję, wiadomość, CV, list motywacyjny, "
        "dokument związany z wykonywanym zawodem – według wzoru)"
    ),
    "INF.04.9.4": (
        "uczestniczy w rozmowie w typowych sytuacjach związanych z realizacją zadań "
        "zawodowych – reaguje w języku obcym nowożytnym w sposób zrozumiały, adekwatnie "
        "do sytuacji komunikacyjnej, ustnie lub w formie prostego tekstu: "
        "a) reaguje ustnie (np. podczas rozmowy z innym pracownikiem, klientem, "
        "kontrahentem, w tym podczas rozmowy telefonicznej) w typowych sytuacjach "
        "związanych z wykonywaniem czynności zawodowych "
        "b) reaguje w formie prostego tekstu pisanego (np. wiadomość, formularz, e-mail, "
        "dokument związany z wykonywanym zawodem) w typowych sytuacjach związanych "
        "z wykonywaniem czynności zawodowych"
    ),
    "INF.04.9.5": (
        "zmienia formę przekazu ustnego lub pisemnego w języku obcym nowożytnym "
        "w typowych sytuacjach związanych z wykonywaniem czynności zawodowych"
    ),
    "INF.04.9.6": (
        "wykorzystuje strategie służące doskonaleniu własnych umiejętności językowych "
        "oraz podnoszące świadomość językową: a) wykorzystuje techniki samodzielnej pracy "
        "nad językiem b) współdziała w grupie c) korzysta ze źródeł informacji w języku "
        "obcym nowożytnym d) stosuje strategie komunikacyjne i kompensacyjne"
    ),
    "INF.04.10.1": "przestrzega zasad kultury osobistej i etyki zawodowej",
    "INF.04.10.2": "planuje wykonanie zadania",
    "INF.04.10.3": "ponosi odpowiedzialność za podejmowane działania",
    "INF.04.10.4": "wykazuje się kreatywnością i otwartością na zmiany",
    "INF.04.10.5": "stosuje techniki radzenia sobie ze stresem",
    "INF.04.10.6": "doskonali umiejętności zawodowe",
    "INF.04.11.5": (
        "wprowadza rozwiązania techniczne i organizacyjne wpływające na poprawę warunków "
        "i jakości pracy"
    ),
}


@dataclass
class Effect:
    unit: str
    number: int
    text: str


def download_source() -> bytes:
    with urllib.request.urlopen(SOURCE_URL, timeout=120) as response:
        return response.read()


def verify_source(data: bytes) -> None:
    digest = hashlib.sha256(data).hexdigest()
    if digest != SOURCE_SHA256:
        raise RuntimeError(
            f"ORE PDF checksum changed: expected {SOURCE_SHA256}, received {digest}"
        )


def normalize(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    replacements = {
        "s yste m": "system",
        "s yste my": "systemy",
        "wywa nia": "wywania",
        "informatyczn y": "informatyczny",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def extract_left_column(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    lines: list[str] = []
    for page in reader.pages:
        text = page.extract_text(extraction_mode="layout") or ""
        for line in text.splitlines():
            if line.startswith("Dziennik Ustaw"):
                continue
            lines.append(line[:86].rstrip())
    return "\n".join(lines)


def parse_effects(raw: str) -> list[Effect]:
    effects: list[Effect] = []
    unit: str | None = None
    current_number: int | None = None
    current_parts: list[str] = []

    def flush() -> None:
        nonlocal current_number, current_parts
        if unit is not None and current_number is not None:
            effects.append(Effect(unit, current_number, normalize(" ".join(current_parts))))
        current_number = None
        current_parts = []

    for original_line in raw.splitlines():
        line = normalize(original_line)
        if line.startswith("WARUNKI REALIZACJI KSZTAŁCENIA"):
            flush()
            break
        unit_match = UNIT_RE.match(line)
        if unit_match and unit_match.group(1) in UNIT_NAMES:
            flush()
            unit = unit_match.group(1)
            continue
        if unit is None:
            continue
        item_match = ITEM_RE.match(line)
        if item_match:
            number = int(item_match.group(1))
            if current_number is None or number == current_number + 1:
                flush()
                current_number = number
                current_parts = [item_match.group(2)]
                continue
        if current_number is not None and line:
            current_parts.append(line)
    flush()
    return effects


def build_output(effects: list[Effect]) -> list[dict[str, object]]:
    by_unit: dict[str, list[Effect]] = {unit: [] for unit in UNIT_NAMES}
    for effect in effects:
        by_unit[effect.unit].append(effect)

    for unit, items in by_unit.items():
        numbers = [effect.number for effect in items]
        expected = list(range(1, len(items) + 1))
        if numbers != expected:
            raise RuntimeError(
                f"{unit} has non-contiguous effect numbers: expected {expected}, got {numbers}"
            )

    actual = {
        qualification: sum(
            len(items) for unit, items in by_unit.items() if unit.startswith(qualification)
        )
        for qualification in EXPECTED_COUNTS
    }
    if actual != EXPECTED_COUNTS:
        unit_counts = {unit: len(items) for unit, items in by_unit.items()}
        raise RuntimeError(
            f"Unexpected effect counts: expected {EXPECTED_COUNTS}, got {actual}; "
            f"units: {unit_counts}"
        )

    source = {
        "url": SOURCE_URL,
        "title": SOURCE_TITLE,
        "documentDate": SOURCE_DATE,
        "retrievedAt": RETRIEVED_AT,
        "sha256": SOURCE_SHA256,
        "legalBasis": "Dz.U. 2019 poz. 991, załącznik nr 28",
        "reuseBasis": (
            "Tekst urzędowy wyłączony z prawa autorskiego na podstawie "
            "art. 4 pkt 1 ustawy o prawie autorskim i prawach pokrewnych"
        ),
    }
    output = []
    for unit, name in UNIT_NAMES.items():
        subjects, grades = UNIT_MAPPING[unit]
        output.append(
            {
                "id": unit,
                "qualification": unit[:6],
                "name": name,
                "subjects": subjects,
                "grades": grades,
                "mappingStatus": "unconfirmed",
                "mappingNote": {
                    "pl": (
                        "Przypisanie do przedmiotów i klas jest mapą roboczą. "
                        "Szkoła nie publikuje planu z takim podziałem."
                    ),
                    "ru": (
                        "Привязка к предметам и классам является рабочей картой. "
                        "Школа не публикует план с таким распределением."
                    ),
                },
                "source": source,
                "effects": [
                    {
                        "id": f"{unit}.{effect.number}",
                        "text": CANONICAL_OVERRIDES.get(
                            f"{unit}.{effect.number}", effect.text
                        ),
                        "source": source,
                    }
                    for effect in by_unit[unit]
                ],
            }
        )
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="compare generated artifacts with committed files without writing",
    )
    args = parser.parse_args()

    data = download_source()
    verify_source(data)
    raw = extract_left_column(data)
    output = build_output(parse_effects(raw))
    raw_with_header = (
        f"Source: {SOURCE_URL}\n"
        f"Title: {SOURCE_TITLE}\n"
        f"Document date: {SOURCE_DATE}\n"
        f"Retrieved: {RETRIEVED_AT}\n"
        f"SHA-256: {SOURCE_SHA256}\n\n"
        f"{raw}\n"
    )
    json_text = json.dumps(output, ensure_ascii=False, indent=2) + "\n"

    if args.check:
        mismatches = []
        if not RAW_PATH.exists() or RAW_PATH.read_text(encoding="utf-8") != raw_with_header:
            mismatches.append(str(RAW_PATH.relative_to(ROOT)))
        if not OUTPUT_PATH.exists() or OUTPUT_PATH.read_text(encoding="utf-8") != json_text:
            mismatches.append(str(OUTPUT_PATH.relative_to(ROOT)))
        if mismatches:
            print("Outdated generated files: " + ", ".join(mismatches), file=sys.stderr)
            return 1
        print("Programme extraction matches committed artifacts.")
        return 0

    RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
    RAW_PATH.write_text(raw_with_header, encoding="utf-8", newline="\n")
    OUTPUT_PATH.write_text(json_text, encoding="utf-8", newline="\n")
    counts = {
        qualification: sum(len(unit["effects"]) for unit in output if unit["qualification"] == qualification)
        for qualification in EXPECTED_COUNTS
    }
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} with {counts}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
