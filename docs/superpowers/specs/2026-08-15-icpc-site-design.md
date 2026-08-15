# NTU ICPC results site — v1 design

**Date:** 2026-08-15
**Status:** Approved, implemented

## Goal

A GitHub Pages site archiving the training group's contest results. v1 covers the
roster and the first individual contest, and must make adding contest 2 nearly
free.

## Scope

Three page types, as requested:

1. **Home** — orientation and current standings at a glance.
2. **Contestants** — the roster.
3. **Individual Contests** — overall ranking across rounds, drilling into a
   per-contest page showing that contest's scoreboard and its Codeforces link.

## Architecture

Hand-written static HTML/CSS/JS with data in JSON. No build step, no
dependencies, no CI. GitHub Pages serves the files as committed.

Chosen over Jekyll (Liquid is awkward for table logic; local preview needs Ruby)
and over React + Actions (heavy machinery for three pages, and a build that can
break between the author and the published site).

```
index.html                        home
contestants.html                  roster
individual.html                   overall ranking + contest list
contest.html?id=<id>              one contest's scoreboard
rules.html                        scoring and ranking rules
timeline.html                     key dates
assets/style.css                  theme
assets/app.js                     nav, loading, ranking, rendering
data/contestants.json             roster (public: no emails)
data/contests.json                contest registry
data/contests/<id>.json           one contest's standings
data/timeline.json                dated events
tools/refresh-ratings.py          pull Codeforces ratings
```

Contest pages are driven by a **query parameter, not a file per contest**. This
is the central decision: adding a contest must never mean copying HTML. A new
round is one JSON file plus one registry line.

The nav is rendered from a single array in `app.js` rather than hand-written per
page. At six pages, six copies of a nav block is a guaranteed source of drift.

### Rules and timeline pages (added after v1)

**Rules** is prose, not data — a schema for prose would be over-engineering. The
two values that could drift from the code (the penalty constant and the contest
count) are injected from the data at render time, so the page cannot contradict
what the site computes.

Scope is deliberately narrow: individual contest ranking only. Team rules and
selection criteria were considered and left out until they exist. A brief
penalty explanation is folded into the ranking section because "placement" is
meaningless without it.

**Timeline** is data-driven (`data/timeline.json`), being a list of dated
records. Events split into Upcoming / To be scheduled / Past, today counting as
upcoming. Entries carry an explicit `placeholder` flag rendering a visible
badge — seeded content must never read as real scheduling. Dates compare as ISO
strings against a locally-computed today, avoiding timezone drift from `Date`
parsing; empty or malformed dates degrade to "To be scheduled" rather than
throwing.

The home page's stat tiles were removed at the user's request.

### Module boundaries

`app.js` separates into four layers that can each be reasoned about alone:

| Layer | Responsibility |
|---|---|
| `parseCell` / `toMinutes` | Codeforces cell string → structured verdict |
| `loadAll` | fetch + join roster with contests; cached |
| `overallRanking` | pure function: data → ranked list + non-participants |
| `page*` | DOM rendering, one function per page |

Only the `page*` layer touches the DOM, so the ranking rule can be tested
headlessly. It was: the implementation was verified by running these functions
in Node against the real data.

## Data model

### Cell format

Cells store exactly what the Codeforces scoreboard prints, so transcribing a new
contest is a straight copy rather than a translation:

| Cell | Meaning |
|---|---|
| `+ 00:13` | solved at 13 min, first try |
| `+2 01:19` | solved at 79 min after 2 rejections |
| `-3` | 3 rejections, never solved |
| `""` | never attempted |

### Self-checking totals

`solved` and `penalty` are stored *and* recomputed from the cells on load. A
mismatch logs a console warning. The data came from a screenshot transcription,
so the file that could be wrong checks itself instead of silently publishing a
wrong table.

## Ranking

**Overall placement = average finishing position**, over contests entered only.
Ties break on contests played (more is better), then best single finish, then
name.

Roster members who have not competed are listed separately as "Yet to compete"
rather than ranked last with a placeholder score — a person who missed round 1
has no measured performance, and inventing one would be wrong.

Penalty follows ICPC convention: solve time in minutes plus 20 minutes per
rejection on a solved problem. Configurable via `penaltyPerRejection`.

## Source data

33 contestants across two roster screenshots; 22 scoreboard rows for contest 1
over 6 problems (A–F). The screenshot was cut off after rank 22; per the user,
ranks 1–22 are treated as the complete standings.

Every row was verified arithmetically — derived penalty matches the stored value
for all 22 rows, which confirms the transcription.

Three handles differed between the roster spreadsheet and the scoreboard. The
scoreboard spelling wins, since Codeforces renders the real account name:

| Roster | Used |
|---|---|
| `YangJakie` | `YangJackie` |
| `Onolt-kh` | `Onolt_kh` |
| `ICanSeeForever` | `iCanSeeForever` |

A 4th roster column was cut off in the source image and is excluded from v1.

## Theme and handle colours (added after v1)

The site uses a white background. Palette values were checked against WCAG AA:
body text 17.9:1, muted text 5.7:1, links 5.2:1, verdict colours ≥4.8:1.

Handles are coloured by Codeforces rating using Codeforces' own hex values.
These are *deliberately* not adjusted for contrast — orange (2.3:1) and cyan
(2.8:1) fail AA on white, but competitive programmers read rank by colour
instantly and Codeforces itself renders them this way on a white page.
Recognition beats compliance here; handles are bolded to compensate, and rank
plus rating are available on hover for anyone the colour does not serve.

Ratings are baked into the data by `tools/refresh-ratings.py` rather than
fetched client-side, so pages render instantly and visitors do not each hit the
Codeforces API. They go stale until the script is re-run.

The refresh script pairs API responses **positionally**. Codeforces resolves
renamed accounts, so requesting an old handle returns the new one; name-matching
silently dropped a renamed contestant during implementation.

## Deliberately excluded from v1

Country flags (the scoreboard shows them, but inferring nationality from a small
icon risks getting a real person's country wrong), per-contestant detail pages,
sortable/filterable tables, and team contests. The data layout accommodates all
of them later.

## Known constraint

`.table-scroll` sets `overflow-x: auto` for wide scoreboards on narrow screens.
That makes it the nearest scrollport, so a `position: sticky` table header
offsets from the table's own top and covers the first row instead of tracking
the viewport. Sticky headers were therefore dropped; horizontal scrolling
matters more, and tables are only 22–33 rows.

## Verification

- All three JSON files parse.
- Ranking and parsing logic executed in Node against the real data: 22/22 rows
  arithmetically consistent, every scoreboard handle resolves to a roster
  member, 22 ranked + 11 yet-to-compete = 33 roster.
- All four pages rendered in headless Chromium with zero console errors, and
  inspected visually.
