/* ICPC site — shared data loading + page rendering.
   No build step: every page includes this file and sets <body data-page="...">. */

/* ---------- navigation ----------
   Rendered from here so six pages can't drift out of sync. */

const NAV = [
  ['index.html',       'Home',                'home'],
  ['contestants.html', 'Contestants',         'contestants'],
  ['individual.html',  'Individual Contests', 'individual'],
  ['rules.html',       'Rules',               'rules'],
  ['timeline.html',    'Timeline',            'timeline'],
];

function renderNav() {
  const el = $('#nav');
  if (!el) return;
  // contest.html highlights "Individual Contests" via data-nav.
  const active = document.body.dataset.nav || document.body.dataset.page;
  el.innerHTML = NAV.map(([href, label, key]) =>
    `<a href="${href}"${key === active ? ' class="active"' : ''}>${label}</a>`).join('');
}

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

/* ---------- Codeforces rating colours ----------
   Thresholds per Codeforces. Legendary grandmasters (3000+) render fully red
   rather than with the black first letter; nobody here is close, and it can be
   special-cased if that changes. */

function cfClass(rating) {
  if (rating == null) return 'cf-unrated';
  if (rating >= 2400) return 'cf-gm';
  if (rating >= 2100) return 'cf-master';
  if (rating >= 1900) return 'cf-cm';
  if (rating >= 1600) return 'cf-expert';
  if (rating >= 1400) return 'cf-specialist';
  if (rating >= 1200) return 'cf-pupil';
  return 'cf-newbie';
}

/* Single source of truth for how a handle is rendered anywhere on the site. */
function handleLink(data, handle) {
  const p = data.byHandle.get(handle.toLowerCase());
  const rating = p?.rating ?? null;
  const title = p?.rank ? `${p.rank} · ${rating}` : 'unrated';
  return `<a class="handle cf ${cfClass(rating)}" title="${esc(title)}"` +
    ` href="https://codeforces.com/profile/${encodeURIComponent(handle)}"` +
    ` target="_blank" rel="noopener">${esc(handle)}</a>`;
}

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

/* A person's name always links to their profile. Falls back to plain text when
   the handle isn't on the roster (e.g. a scoreboard entry we can't resolve). */
function nameLink(data, handle) {
  const name = nameFor(data, handle);
  if (!name) return '<span class="muted">—</span>';
  return `<a class="name-link" href="profile.html?handle=${encodeURIComponent(handle)}">${esc(name)}</a>`;
}

/* ---------- pages ---------- */

async function pageHome() {
  const data = await loadAll();
  const { ranked } = overallRanking(data);

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
        <td class="name-cell">${nameLink(data, p.handle)}</td>
        <td>${handleLink(data, p.handle)}</td>
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
      <td class="name-cell">${nameLink(data, r.handle)}</td>
      <td>${handleLink(data, r.handle)}</td>
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
         .map((p) => `<span class="chip cf ${cfClass(p.rating ?? null)}"
                            title="${esc(p.name)}">${esc(p.handle)}</span>`)
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
    return `<tr${placeAttr(row.rank)}>
      <td class="rank-col">${row.rank}</td>
      <td class="name-cell">${nameLink(data, row.handle)}</td>
      <td>${handleLink(data, row.handle)}</td>
      <td class="num-col">${row.solved}</td>
      <td class="num-col">${row.penalty}</td>
      ${row.cells.map(verdictCell).join('')}
    </tr>`;
  }).join('');

  $('#contest-note').innerHTML =
    `Penalty is solve time in minutes plus ${data.perRejection} minutes per rejected ` +
    `submission on a solved problem. <code>·</code> means the problem was never attempted.`;
}

/* ---------- radar chart ----------
   Single series, so no legend: the heading names it. Grid is solid hairlines
   (dashes read as "threshold"). Values also render as a table beside the chart
   so nothing is reachable only by colour or hover. The viewBox is sized to fit
   the outermost axis labels — a radar that clips its own labels is the classic
   failure here. */

const RADAR = { w: 430, h: 300, r: 100, labelGap: 24 };

function radarSVG(axes, values, max) {
  const { w, h, r, labelGap } = RADAR;
  const cx = w / 2, cy = h / 2;
  const n = axes.length;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const at = (i, radius) => [cx + Math.cos(ang(i)) * radius, cy + Math.sin(ang(i)) * radius];
  const poly = (radius) =>
    Array.from({ length: n }, (_, i) => at(i, radius).map((v) => v.toFixed(1)).join(',')).join(' ');

  const rings = [0.25, 0.5, 0.75, 1]
    .map((f) => `<polygon class="radar-ring" points="${poly(r * f)}"/>`).join('');

  const spokes = Array.from({ length: n }, (_, i) => {
    const [x, y] = at(i, r);
    return `<line class="radar-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join('');

  const shape = Array.from({ length: n }, (_, i) =>
    at(i, r * (values[i] / max)).map((v) => v.toFixed(1)).join(',')).join(' ');

  const dots = Array.from({ length: n }, (_, i) => {
    const [x, y] = at(i, r * (values[i] / max));
    return `<circle class="radar-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4">` +
      `<title>${esc(axes[i].name)}: ${values[i]} / ${max}</title></circle>`;
  }).join('');

  const labels = Array.from({ length: n }, (_, i) => {
    const [x, y] = at(i, r + labelGap);
    const dx = Math.cos(ang(i));
    const anchor = Math.abs(dx) < 0.3 ? 'middle' : (dx > 0 ? 'start' : 'end');
    // Nudge top/bottom labels off the vertex so they don't sit on the spoke.
    const dy = Math.sin(ang(i));
    const yAdj = Math.abs(dy) < 0.3 ? 4 : (dy > 0 ? 12 : -4);
    return `<text class="radar-label" x="${x.toFixed(1)}" y="${(y + yAdj).toFixed(1)}"` +
      ` text-anchor="${anchor}">${esc(axes[i].short)}</text>`;
  }).join('');

  return `<svg class="radar" viewBox="0 0 ${w} ${h}" role="img"
    aria-label="Ability by topic, ${axes.map((a, i) => `${a.name} ${values[i]} of ${max}`).join(', ')}">
    ${rings}${spokes}
    <polygon class="radar-area" points="${shape}"/>
    ${dots}${labels}
  </svg>`;
}

function radarTable(axes, values, max) {
  return `<table class="radar-table"><tbody>${
    axes.map((a, i) => `<tr>
      <td>${esc(a.name)}</td>
      <td class="num-col">${values[i]}<span class="muted"> / ${max}</span></td>
    </tr>`).join('')}</tbody></table>`;
}

/* ---------- profile ---------- */

async function pageProfile() {
  const data = await loadAll();
  const handle = new URLSearchParams(location.search).get('handle') || '';
  const person = data.byHandle.get(handle.toLowerCase());

  if (!person) {
    $('#profile-body').innerHTML =
      `<div class="empty">No contestant with handle <code>${esc(handle)}</code>.<br>` +
      `<a href="contestants.html">Back to contestants</a></div>`;
    return;
  }

  document.title = `${person.name} · NTU ICPC`;
  $('#profile-name').textContent = person.name;
  $('#profile-handle').innerHTML = handleLink(data, person.handle);

  // --- Codeforces + contact facts
  // Rating and rank always show (their absence is meaningful: "unrated").
  // Optional facts are omitted entirely rather than rendered as an empty dash.
  const facts = [
    ['Rating', person.rating ?? '—'],
    ['Rank', person.rank ?? 'unrated'],
    ['Max rating', person.maxRating],
    ['Max rank', person.maxRank],
    ['Country', person.country],
    ['Organization', person.organization],
  ].filter(([, v], i) => i < 2 || (v !== null && v !== undefined && v !== ''));

  $('#profile-facts').innerHTML = facts.map(([k, v]) =>
    `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`).join('');

  const contact = $('#profile-contact');
  contact.innerHTML = person.email
    ? `<div class="fact"><dt>Email</dt><dd><a href="mailto:${esc(person.email)}">${esc(person.email)}</a></dd></div>`
    : '';
  // Hide the whole section, heading included, when there's nothing in it.
  $('#contact-heading').hidden = !person.email;
  contact.hidden = !person.email;

  // --- contest history
  const history = [];
  for (const c of data.contests) {
    const row = c.standings.find((r) => r.handle.toLowerCase() === handle.toLowerCase());
    if (row) history.push({ c, row });
  }

  $('#profile-history').innerHTML = history.length
    ? `<div class="table-scroll"><table>
         <thead><tr><th>Contest</th><th class="num-col">Rank</th>
           <th class="num-col">Solved</th><th class="num-col">Penalty</th></tr></thead>
         <tbody>${history.map(({ c, row }) => `<tr${placeAttr(row.rank)}>
           <td><a href="contest.html?id=${encodeURIComponent(c.id)}">${esc(c.title)}</a></td>
           <td class="rank-col">${row.rank}</td>
           <td class="num-col">${row.solved}</td>
           <td class="num-col">${row.penalty}</td></tr>`).join('')}
         </tbody></table></div>`
    : '<div class="empty">Has not competed in a recorded contest yet.</div>';

  // --- radar
  const skills = await loadJSON('data/skills.json');
  const values = skills.scores[person.handle];

  if (!values) {
    $('#profile-radar').innerHTML = '<div class="empty">No ability data.</div>';
  } else {
    $('#profile-radar').innerHTML =
      `<div class="radar-wrap">
         ${radarSVG(skills.axes, values, skills.max)}
         ${radarTable(skills.axes, values, skills.max)}
       </div>`;
    if (skills.placeholder) {
      $('#radar-warning').innerHTML =
        `<strong>Placeholder data.</strong> These scores are randomly generated ` +
        `and are not an assessment of this person. They exist so the chart has ` +
        `something to draw until real values replace them.`;
      $('#radar-warning').hidden = false;
    }
  }
}

/* ---------- rules ---------- */

async function pageRules() {
  const data = await loadAll();
  // Pulled from the data so the prose can't drift from what the site computes.
  const p = data.perRejection;
  document.querySelectorAll('.penalty-value').forEach((el) => { el.textContent = p; });
  $('#penalty-example').textContent = `89 + ${p} = ${89 + p}`;
  $('#contest-count').textContent = data.contests.length;
}

/* ---------- timeline ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function eventCard(e, state) {
  const when = formatDate(e.date);
  return `<li class="event ${state}" data-type="${esc(e.type || 'other')}">
    <div class="event-date">${when ? esc(when) : '<span class="muted">TBD</span>'}</div>
    <div class="event-body">
      <div class="event-head">
        <span class="event-title">${esc(e.title)}</span>
        <span class="badge badge-${esc(e.type || 'other')}">${esc(e.type || 'other')}</span>
        ${e.placeholder ? '<span class="badge badge-placeholder">placeholder</span>' : ''}
      </div>
      ${e.detail ? `<p class="event-detail">${esc(e.detail)}</p>` : ''}
      ${e.url ? `<a class="event-link" href="${esc(e.url)}">Details →</a>` : ''}
    </div>
  </li>`;
}

async function pageTimeline() {
  const { events } = await loadJSON('data/timeline.json');
  const today = todayISO();

  const dated = events.filter((e) => formatDate(e.date));
  const undated = events.filter((e) => !formatDate(e.date));

  const upcoming = dated.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = dated.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date));

  const section = (title, list, state) => list.length
    ? `<h2>${title}</h2><ul class="timeline">${list.map((e) => eventCard(e, state)).join('')}</ul>`
    : '';

  const html =
    section('Upcoming', upcoming, 'upcoming') +
    section('To be scheduled', undated, 'undated') +
    section('Past', past, 'past');

  $('#timeline-body').innerHTML = html ||
    '<div class="empty">No dates yet. Add them to <code>data/timeline.json</code>.</div>';

  const n = events.filter((e) => e.placeholder).length;
  $('#timeline-note').innerHTML = n
    ? `${n} of these are placeholders with no real date set yet — edit ` +
      `<code>data/timeline.json</code> to fill them in.`
    : '';
}

/* ---------- boot ---------- */

const PAGES = {
  home: pageHome,
  contestants: pageContestants,
  individual: pageIndividual,
  contest: pageContest,
  rules: pageRules,
  timeline: pageTimeline,
  profile: pageProfile,
};

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  const run = PAGES[document.body.dataset.page];
  if (run) run().catch((err) => fail($('#main-content') || document.body, err));
});
