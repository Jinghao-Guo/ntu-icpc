#!/usr/bin/env python3
"""Refresh Codeforces ratings and regenerate the public roster.

    python3 tools/refresh-ratings.py

Reads  data/contestants.private.json  (source of truth, holds emails)
Writes data/contestants.private.json  (ratings updated in place)
       data/contestants.json          (public: no emails)

Run this after a rating update, alongside adding a new contest.
"""

import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRIVATE = ROOT / "data" / "contestants.private.json"
PUBLIC = ROOT / "data" / "contestants.json"
API = "https://codeforces.com/api/user.info?handles="


def fetch(handles):
    with urllib.request.urlopen(API + ";".join(handles), timeout=45) as r:
        return json.load(r)["result"]


def main():
    if not PRIVATE.exists():
        sys.exit(f"missing {PRIVATE}\nIt is gitignored — restore it from your backup.")

    roster = json.loads(PRIVATE.read_text())
    handles = [p["handle"] for p in roster]

    # One request covers every handle. Codeforces rejects the whole batch if any
    # single handle is unknown, so fall back to probing to name the culprit.
    ordered = True
    try:
        users = fetch(handles)
    except urllib.error.HTTPError as e:
        print("batch failed:", json.load(e).get("comment"), file=sys.stderr)
        ordered = False
        users, bad = [], []
        for h in handles:
            try:
                users += fetch([h])
            except Exception:
                bad.append(h)
            time.sleep(0.35)
        if bad:
            print("unknown handles (fix these in the roster):", ", ".join(bad),
                  file=sys.stderr)

    # Pair by position, not by name. Codeforces returns results in request order
    # and resolves renamed accounts, so asking for an old handle yields the new
    # one — matching on the name string would silently drop those people.
    if ordered and len(users) == len(roster):
        pairs = list(zip(roster, users))
    else:
        info = {u["handle"].lower(): u for u in users}
        pairs = [(p, info.get(p["handle"].lower())) for p in roster]

    hits = 0
    for p, u in pairs:
        if not u:
            print(f"no Codeforces data for {p['handle']}", file=sys.stderr)
            continue
        hits += 1
        if p["handle"].lower() != u["handle"].lower():
            print(f"handle renamed on Codeforces: {p['handle']} → {u['handle']}")
        p["handle"] = u["handle"]          # adopt Codeforces' exact spelling
        p["rating"] = u.get("rating")      # None when unrated
        p["rank"] = u.get("rank")

    PRIVATE.write_text(json.dumps(roster, indent=2, ensure_ascii=False) + "\n")

    public = [{k: p.get(k) for k in ("name", "handle", "rating", "rank")}
              for p in roster]
    PUBLIC.write_text(json.dumps(public, indent=2, ensure_ascii=False) + "\n")

    leaked = [p for p in public if "email" in p]
    assert not leaked, "email leaked into the public roster"

    rated = sum(1 for p in roster if p.get("rating"))
    print(f"updated {hits}/{len(roster)} handles — {rated} rated, {len(roster) - rated} unrated")
    print(f"wrote {PUBLIC.relative_to(ROOT)} (no emails) and "
          f"{PRIVATE.relative_to(ROOT)} (local only)")


if __name__ == "__main__":
    main()
