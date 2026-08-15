# NTU ICPC

Static site archiving our ICPC training contest results. No build step, no
dependencies — GitHub Pages serves the files as-is.

## Local preview

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening the `.html` files directly with
`file://` will **not** work: the browser blocks `fetch()` of the JSON data.

## Deploying to GitHub Pages

```sh
git init
git add -A
git commit -m "ICPC standings site"
git branch -M main
git remote add origin git@github.com:<user>/<repo>.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch →
`main` / `(root)`**. The site appears at
`https://<user>.github.io/<repo>/` within a minute or two.

All paths are relative, so the site works at any subpath without configuration.
`.nojekyll` stops GitHub from running the files through Jekyll.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Landing page: current top 3, latest contest, links to everything |
| `contestants.html` | Full roster with handles and best finish |
| `individual.html` | Overall ranking + list of individual contests |
| `contest.html?id=<id>` | One contest's scoreboard and its Codeforces link |
| `rules.html` | How scoring and ranking work |
| `timeline.html` | Key dates |

Contest pages are driven by a query parameter, so adding a contest never
requires a new HTML file. The nav is rendered from the `NAV` array in
`assets/app.js` so six pages can't drift apart; each page declares itself with
`<body data-page="...">`.

## Adding a timeline entry

Edit `data/timeline.json`:

```json
{
  "date": "2026-09-14",
  "title": "Individual Contest 2",
  "type": "contest",
  "detail": "Second individual round.",
  "url": "contest.html?id=individual-02"
}
```

`type` is one of `contest`, `team`, `deadline`, `other` and picks the badge
colour. Entries are split into Upcoming / To be scheduled / Past automatically;
today counts as upcoming. An entry with `"placeholder": true` renders with a
visible placeholder badge — drop the flag once the date is real. An empty or
malformed `date` lands under "To be scheduled" rather than breaking the page.

## Adding a contest

1. Create `data/contests/<id>.json`:

   ```json
   {
     "id": "individual-02",
     "problems": ["A", "B", "C", "D"],
     "standings": [
       { "rank": 1, "handle": "someone", "solved": 4, "penalty": 210,
         "cells": ["+ 00:20", "+1 01:05", "-2", "+ 00:45"] }
     ]
   }
   ```

2. Append an entry to the `contests` array in `data/contests.json`.

That's it — the overall ranking, stats, and contest list all recompute.

### Cell format

Cells mirror exactly what the Codeforces scoreboard prints:

| Cell | Meaning |
|---|---|
| `+ 00:13` | Solved at 13 minutes, first try |
| `+2 01:19` | Solved at 79 minutes after 2 rejections |
| `-3` | 3 rejections, never solved |
| `""` | Never attempted |

So transcribing a new scoreboard is a straight copy.

`solved` and `penalty` are stored *and* recomputed from the cells on page load.
A mismatch logs a warning to the browser console, which catches transcription
slips instead of silently publishing a wrong table.

## Ranking

Overall placement is **average finishing position**, counting only the contests
a person entered. Ties break on contests played (more is better), then best
single finish. Roster members with no contests yet are listed separately under
"Yet to compete" rather than ranked with a placeholder score.

Penalty follows ICPC convention: solve time in minutes, plus 20 minutes per
rejected submission on a problem that was eventually solved. The 20 is
configurable via `penaltyPerRejection` in `data/contests.json`.

## Privacy

`data/` is served as static files on a public site, so anything committed there
is fetchable at `https://<user>.github.io/<repo>/data/...` regardless of whether
a page renders it.

Email addresses are therefore **not** in the committed data. The split:

| File | Contents | Committed |
|---|---|---|
| `data/contestants.json` | name + handle + rating + rank | yes |
| `data/contestants.private.json` | + email | **no** (gitignored) |

The source roster screenshots are gitignored for the same reason — they show the
email column.

If you ever need to regenerate the public file from the private one, or refresh
Codeforces ratings:

```sh
python3 tools/refresh-ratings.py
```

That reads `data/contestants.private.json`, updates every rating from the
Codeforces API, and rewrites `data/contestants.json` without emails. Run it
whenever you add a contest.

It pairs the API response **by position, not by handle name** — Codeforces
resolves renamed accounts, so asking for an old handle returns the new one.
Matching on the string would silently drop anyone who has renamed. The script
prints a line when it detects a rename.

## Handle colours

Handles are coloured by Codeforces rating, using Codeforces' own values:

| Rating | Rank | Colour |
|---|---|---|
| 2400+ | grandmaster | red |
| 2100–2399 | master / international master | orange |
| 1900–2099 | candidate master | violet |
| 1600–1899 | expert | blue |
| 1400–1599 | specialist | cyan |
| 1200–1399 | pupil | green |
| < 1200 | newbie | gray |
| — | unrated | default text |

Ratings are baked into `data/contestants.json` rather than fetched in the
browser, so pages render instantly and don't put every visitor's page load on
Codeforces' API. The cost is that they go stale until you re-run the refresh
script. Hovering a handle shows its rank and rating.

Legendary grandmasters (3000+) render fully red rather than with Codeforces'
black first letter — nobody is close, and it is a small special case to add.

## Data provenance

The roster and the Contest 1 scoreboard were transcribed from screenshots. Every
row of Contest 1 was checked arithmetically — derived penalties match the stored
values for all 22 rows.

Three handles were spelled differently in the roster spreadsheet than in the
Codeforces scoreboard. The scoreboard spelling is used, since Codeforces renders
the real account name:

| Roster | Used |
|---|---|
| `YangJakie` | `YangJackie` |
| `Onolt-kh` | `Onolt_kh` |
| `ICanSeeForever` | `iCanSeeForever` |
