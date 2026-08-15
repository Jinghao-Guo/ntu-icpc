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
| `index.html` | Landing page: stats, current top 3, latest contest |
| `contestants.html` | Full roster with handles and best finish |
| `individual.html` | Overall ranking + list of individual contests |
| `contest.html?id=<id>` | One contest's scoreboard and its Codeforces link |

Contest pages are driven by a query parameter, so adding a contest never
requires a new HTML file.

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
| `data/contestants.json` | name + handle | yes |
| `data/contestants.private.json` | name + handle + email | **no** (gitignored) |

The source roster screenshots are gitignored for the same reason — they show the
email column.

If you ever need to regenerate the public file from the private one:

```sh
python3 -c "import json;s=json.load(open('data/contestants.private.json'));json.dump([{'name':p['name'],'handle':p['handle']} for p in s],open('data/contestants.json','w'),indent=2,ensure_ascii=False)"
```

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
