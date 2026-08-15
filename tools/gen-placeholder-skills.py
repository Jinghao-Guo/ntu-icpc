#!/usr/bin/env python3
"""Generate PLACEHOLDER ability scores for the profile radar charts.

    python3 tools/gen-placeholder-skills.py

These numbers are RANDOM. They are not assessments of anybody. They exist so the
radar chart has something to draw until real data replaces it, and the site
labels them as placeholder wherever they appear.

Scores are seeded from the handle, so they are stable across runs — a chart that
reshuffles on every reload looks broken.

To replace with real data: set "placeholder" to false in data/skills.json and
put real 0-10 values in "scores". Nothing else needs to change.
"""

import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ROSTER = ROOT / "data" / "contestants.json"
OUT = ROOT / "data" / "skills.json"

AXES = [
    {"name": "Implementation",  "short": "Impl"},
    {"name": "Math",            "short": "Math"},
    {"name": "Greedy",          "short": "Greedy"},
    {"name": "Dynamic Programming", "short": "DP"},
    {"name": "Graphs",          "short": "Graphs"},
    {"name": "Data Structures", "short": "DS"},
    {"name": "Strings",         "short": "Strings"},
    {"name": "Geometry",        "short": "Geom"},
]


def scores_for(handle):
    """Deterministic pseudo-random 3..10 per axis, seeded by handle."""
    digest = hashlib.sha256(handle.encode()).digest()
    return [3 + digest[i] % 8 for i in range(len(AXES))]


def main():
    roster = json.loads(ROSTER.read_text())
    out = {
        "_warning": "PLACEHOLDER DATA. These scores are randomly generated from "
                    "each handle and are not real assessments of anyone. The site "
                    "displays a placeholder notice while this flag is true.",
        "placeholder": True,
        "max": 10,
        "axes": AXES,
        "scores": {p["handle"]: scores_for(p["handle"]) for p in roster},
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out['scores'])} people "
          f"× {len(AXES)} axes (PLACEHOLDER)")


if __name__ == "__main__":
    main()
