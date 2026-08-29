from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("extract-programme-provenance.py")
SPEC = importlib.util.spec_from_file_location("programme_extractor", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load {SCRIPT_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ProgrammeExtractorTests(unittest.TestCase):
    def parsed_effects(self):
        raw = MODULE.RAW_PATH.read_text(encoding="utf-8").split("\n\n", 1)[1]
        return MODULE.parse_effects(raw)

    def test_committed_extract_has_both_complete_qualifications(self):
        output = MODULE.build_output(self.parsed_effects())
        counts = {
            qualification: sum(
                len(unit["effects"])
                for unit in output
                if unit["qualification"] == qualification
            )
            for qualification in MODULE.EXPECTED_COUNTS
        }
        self.assertEqual(counts, {"INF.03": 58, "INF.04": 61})

    def test_rejects_duplicate_effect_number_even_when_total_count_matches(self):
        effects = self.parsed_effects()
        effects[1].number = effects[0].number

        with self.assertRaisesRegex(RuntimeError, "non-contiguous"):
            MODULE.build_output(effects)


if __name__ == "__main__":
    unittest.main()
