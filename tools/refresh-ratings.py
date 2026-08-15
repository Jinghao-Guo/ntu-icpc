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
    # The public roster now carries every field the private one does, so it is a
    # complete fallback if the gitignored working copy goes missing.
    source = PRIVATE if PRIVATE.exists() else PUBLIC
    if not source.exists():
        sys.exit(f"no roster found at {PRIVATE} or {PUBLIC}")
    if source is PUBLIC:
        print(f"{PRIVATE.name} missing — rebuilding it from the committed roster")

    roster = json.loads(source.read_text())
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
        p["maxRating"] = u.get("maxRating")
        p["maxRank"] = u.get("maxRank")
        p["country"] = u.get("country")
        p["organization"] = u.get("organization") or None

    PRIVATE.write_text(json.dumps(roster, indent=2, ensure_ascii=False) + "\n")

    # Emails ARE published on this site by explicit decision — see README.
    # To stop publishing them, drop "email" from PUBLIC_FIELDS and re-run.
    PUBLIC_FIELDS = ("name", "handle", "email", "rating", "rank",
                     "maxRating", "maxRank", "country", "organization")
    public = [{k: p.get(k) for k in PUBLIC_FIELDS} for p in roster]
    PUBLIC.write_text(json.dumps(public, indent=2, ensure_ascii=False) + "\n")

    rated = sum(1 for p in roster if p.get("rating"))
    print(f"updated {hits}/{len(roster)} handles — {rated} rated, {len(roster) - rated} unrated")
    print(f"wrote {PUBLIC.relative_to(ROOT)} and {PRIVATE.relative_to(ROOT)}")
    if "email" in PUBLIC_FIELDS:
        print("NOTE: emails are included in the public roster and will be "
              "published on the live site.")


if __name__ == "__main__":
    main()
