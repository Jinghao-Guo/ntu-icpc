/* ICPC site — shared data loading + page rendering.
   No build step: every page includes this file and sets <body data-page="...">. */

/* ---------- tiny helpers ---------- */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const $ = (sel) => document.querySelector(sel);

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

function fail(el, err) {
  console.error(err);
  if (el) {
    el.innerHTML =
      `<div class="error">Could not load data: ${esc(err.message)}<br>` +
      `<span class="muted">If you opened this file directly, serve it instead: ` +
      `<code>python3 -m http.server</code></span></div>`;
  }
}

/* ---------- Codeforces cell parsing ----------
   '+ 00:13'   solved, no rejections
   '+2 01:19'  solved after 2 rejections
   '-3'        3 rejections, never solved
   ''          never attempted                     */

function parseCell(raw) {
  const s = (raw || '').trim();
  if (!s) return { state: 'none', wrong: 0, time: null };

  const ac = s.match(/^\+(\d*)\s*(\d+:\d{2})?$/);
  if (ac) return { state: 'ac', wrong: ac[1] ? +ac[1] : 0, time: ac[2] || null };

  const wa = s.match(/^-(\d+)$/);
  if (wa) return { state: 'wa', wrong: +wa[1], time: null };

  console.warn('Unrecognised standings cell:', raw);
  return { state: 'none', wrong: 0, time: null };
}

const toMinutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/* Recompute solved/penalty from the cells so a transcription slip surfaces
   as a console warning instead of silently shipping a wrong table. */
function verifyRow(row, perRejection) {
  let solved = 0;
  let penalty = 0;
  for (const raw of row.cells) {
    const c = parseCell(raw);
    if (c.state === 'ac') {
      solved += 1;
      penalty += toMinutes(c.time) + c.wrong * perRejection;
    }
  }
  if (solved !== row.solved || penalty !== row.penalty) {
    console.warn(
      `${row.handle}: stored ${row.solved}/${row.penalty}, ` +
      `derived ${solved}/${penalty} — check data file.`);
  }
  return { solved, penalty };
}

/* ---------- data access ---------- */

let _cache = null;

async function loadAll() {
  if (_cache) return _cache;

  const [roster, registry] = await Promise.all([
    loadJSON('data/contestants.json'),
    loadJSON('data/contests.json'),
  ]);

  const perRejection = registry.penaltyPerRejection ?? 20;
  const contests = registry.contests.slice();

  const results = await Promise.all(
    contests.map((c) => loadJSON(`data/contests/${c.id}.json`)));

  contests.forEach((c, i) => {
    c.standings = results[i].standings;
    c.problems = results[i].problems || c.problems;
    c.standings.forEach((r) => verifyRow(r, perRejection));
  });

  const byHandle = new Map();
  roster.forEach((p) => byHandle.set(p.handle.toLowerCase(), p));

  _cache = { roster, contests, byHandle, perRejection };
  return _cache;
}

const nameFor = (data, handle) =>
  data.byHandle.get(handle.toLowerCase())?.name ?? null;

/* ---------- overall ranking: average placement ---------- */

function overallRanking(data) {
  const acc = new Map(); // handle → { handle, ranks: [] }

  for (const c of data.contests) {
    for (const row of c.standings) {
      const key = row.handle.toLowerCase();
      if (!acc.has(key)) acc.set(key, { handle: row.handle, ranks: [] });
      acc.get(key).ranks.push(row.rank);
    }
  }

  const ranked = [...acc.values()].map((e) => ({
    handle: e.handle,
    name: nameFor(data, e.handle) ?? e.handle,
    played: e.ranks.length,
    best: Math.min(...e.ranks),
    avg: e.ranks.reduce((a, b) => a + b, 0) / e.ranks.length,
  }));

  ranked.sort((a, b) =>
    a.avg - b.avg ||
    b.played - a.played ||
    a.best - b.best ||
    a.name.localeCompare(b.name));

  ranked.forEach((r, i) => { r.place = i + 1; });

  const competed = new Set(acc.keys());
  const yetToCompete = data.roster
    .filter((p) => !competed.has(p.handle.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ranked, yetToCompete };
}

/* ---------- rendering ---------- */

function verdictCell(raw) {
  const c = parseCell(raw);
  if (c.state === 'ac') {
    return `<td class="verdict ac">` +
      `<span class="mark">+${c.wrong || ''}</span>` +
      `<span class="at">${esc(c.time || '')}</span></td>`;
  }
  if (c.state === 'wa') {
    return `<td class="verdict wa"><span class="mark">-${c.wrong}</span></td>`;
  }
  return `<td class="verdict none">·</td>`;
}

function placeAttr(n) { return n <= 3 ? ` data-place="${n}"` : ''; }

/* ---------- pages ---------- */

async function pageHome() {
  const data = await loadAll();
  const { ranked } = overallRanking(data);
  const problems = data.contests.reduce((n, c) => n + c.problems.length, 0);

  $('#stats').innerHTML = [
    [data.roster.length, 'Contestants'],
    [data.contests.length, 'Contests'],
    [problems, 'Problems'],
    [ranked.length, 'Have competed'],
  ].map(([n, label]) =>
    `<div class="stat"><div class="num">${n}</div><div class="label">${label}</div></div>`
  ).join('');

  const top = ranked.slice(0, 3);
  $('#podium').innerHTML = top.length
    ? top.map((r) => `
        <div class="slot" data-place="${r.place}">
          <div class="place">#${r.place}</div>
          <div class="who">${esc(r.name)}</div>
          <div class="meta"><code>${esc(r.handle)}</code> · avg place ${r.avg.toFixed(2)}</div>
        </div>`).join('')
    : '<div class="empty">No results yet.</div>';

  const latest = data.contests[data.contests.length - 1];
  if (latest) {
    $('#latest').innerHTML = `
      <a class="card" href="contest.html?id=${encodeURIComponent(latest.id)}">
        <h3>${esc(latest.title)}</h3>
        <p>${latest.standings.length} participants · ${latest.problems.length} problems
           ${latest.date ? ' · ' + esc(latest.date) : ''}</p>
      </a>`;
  }
}

async function pageContestants() {
  const data = await loadAll();
  const { ranked } = overallRanking(data);
  const placeOf = new Map(ranked.map((r) => [r.handle.toLowerCase(), r]));

  const rows = data.roster
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p, i) => {
      const r = placeOf.get(p.handle.toLowerCase());
      return `<tr>
        <td class="rank-col">${i + 1}</td>
        <td class="name-cell">${esc(p.name)}</td>
        <td><a class="handle" href="https://codeforces.com/profile/${encodeURIComponent(p.handle)}"
               target="_blank" rel="noopener">${esc(p.handle)}</a></td>
        <td class="num-col">${r ? r.played : '<span class="muted">0</span>'}</td>
        <td class="num-col">${r ? '#' + r.best : '<span class="muted">—</span>'}</td>
      </tr>`;
    }).join('');

  $('#roster').innerHTML = rows;
  $('#roster-count').textContent = data.roster.length;
}

async function pageIndividual() {
  const data = await loadAll();
  const { ranked, yetToCompete } = overallRanking(data);

  $('#overall').innerHTML = ranked.map((r) => `
    <tr${placeAttr(r.place)}>
      <td class="rank-col">${r.place}</td>
      <td class="name-cell">${esc(r.name)}</td>
      <td><a class="handle" href="https://codeforces.com/profile/${encodeURIComponent(r.handle)}"
             target="_blank" rel="noopener">${esc(r.handle)}</a></td>
      <td class="num-col">${r.avg.toFixed(2)}</td>
      <td class="num-col">${r.played}</td>
      <td class="num-col">#${r.best}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty">No results yet.</td></tr>';

  $('#contest-list').innerHTML = data.contests
    .slice()
    .reverse()
    .map((c) => `
      <a class="card" href="contest.html?id=${encodeURIComponent(c.id)}">
        <h3>${esc(c.title)}</h3>
        <p>${c.standings.length} participants · ${c.problems.length} problems
           ${c.date ? ' · ' + esc(c.date) : ''}</p>
      </a>`).join('');

  const pending = $('#pending');
  if (yetToCompete.length) {
    pending.innerHTML =
      `<h2>Yet to compete</h2>
       <p class="lede">${yetToCompete.length} roster members have not appeared in a
        contest yet, so they are not ranked above.</p>
       <div class="chips">${yetToCompete
         .map((p) => `<span class="chip" title="${esc(p.name)}">${esc(p.handle)}</span>`)
         .join('')}</div>`;
  }
}

async function pageContest() {
  const data = await loadAll();
  const id = new URLSearchParams(location.search).get('id');
  const contest = data.contests.find((c) => c.id === id)
    ?? data.contests[data.contests.length - 1];

  if (!contest) {
    $('#contest-body').innerHTML = '<div class="empty">No contest found.</div>';
    return;
  }

  document.title = `${contest.title} · NTU ICPC`;
  $('#contest-title').textContent = contest.title;

  $('#contest-meta').innerHTML =
    `<span class="pill">${contest.standings.length} participants</span>` +
    `<span class="pill">${contest.problems.length} problems</span>` +
    (contest.date ? `<span class="pill">${esc(contest.date)}</span>` : '');

  $('#contest-link').innerHTML = contest.url
    ? `<a class="btn" href="${esc(contest.url)}" target="_blank" rel="noopener">
         View on Codeforces →</a>`
    : '';

  $('#problem-heads').innerHTML =
    '<th class="rank-col">#</th><th>Name</th><th>Handle</th>' +
    '<th class="num-col">Solved</th><th class="num-col">Penalty</th>' +
    contest.problems.map((p) => `<th class="verdict">${esc(p)}</th>`).join('');

  $('#contest-standings').innerHTML = contest.standings.map((row) => {
    const name = nameFor(data, row.handle);
    return `<tr${placeAttr(row.rank)}>
      <td class="rank-col">${row.rank}</td>
      <td class="name-cell">${name ? esc(name) : '<span class="muted">—</span>'}</td>
      <td><a class="handle" href="https://codeforces.com/profile/${encodeURIComponent(row.handle)}"
             target="_blank" rel="noopener">${esc(row.handle)}</a></td>
      <td class="num-col">${row.solved}</td>
      <td class="num-col">${row.penalty}</td>
      ${row.cells.map(verdictCell).join('')}
    </tr>`;
  }).join('');

  $('#contest-note').innerHTML =
    `Penalty is solve time in minutes plus ${data.perRejection} minutes per rejected ` +
    `submission on a solved problem. <code>·</code> means the problem was never attempted.`;
}

/* ---------- boot ---------- */

const PAGES = {
  home: pageHome,
  contestants: pageContestants,
  individual: pageIndividual,
  contest: pageContest,
};

document.addEventListener('DOMContentLoaded', () => {
  const run = PAGES[document.body.dataset.page];
  if (run) run().catch((err) => fail($('#main-content') || document.body, err));
});
