// The published bundle is a single file — the page ships as a string, never
// as an asset. String.raw + no backticks/dollar-brace keeps the inline JS
// literal-safe inside this template.
export const PANEL_PAGE: string = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>crasp panel</title>
<style>
:root {
  --bg: #f6f7f9; --surface: #ffffff; --border: #e3e6ea;
  --text: #1a2129; --muted: #6b7684;
  --ok: #1a9e5c; --adv: #2f6fdb; --warn: #c77d0a; --deny: #d43c3c;
  --ok-soft: #e2f5ea; --adv-soft: #e7eefc; --warn-soft: #fbf0dc; --deny-soft: #fbe5e5;
  --accent: #1a9e5c;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e1116; --surface: #161b22; --border: #262d36;
    --text: #e6ebf1; --muted: #8b96a3;
    --ok: #3fce85; --adv: #6ba1f2; --warn: #e8a33d; --deny: #f0716b;
    --ok-soft: #12301f; --adv-soft: #14233c; --warn-soft: #35270e; --deny-soft: #3a1717;
    --accent: #3fce85;
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { color-scheme: light dark; }
body {
  background: var(--bg); color: var(--text);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  padding: 0 20px 48px;
}
header {
  max-width: 1100px; margin: 0 auto; padding: 22px 0 18px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 20px; letter-spacing: -0.02em; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); transition: background .3s; }
.dot.live { background: var(--ok); box-shadow: 0 0 0 4px var(--ok-soft); }
.totals { display: flex; gap: 8px; flex-wrap: wrap; }
.pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 999px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--border); background: var(--surface); color: var(--muted);
}
.pill b { font-variant-numeric: tabular-nums; }
.pill.ok b { color: var(--ok); } .pill.adv b { color: var(--adv); }
.pill.warn b { color: var(--warn); } .pill.deny b { color: var(--deny); }
.range { display: flex; gap: 2px; border: 1px solid var(--border); border-radius: 999px; padding: 2px; background: var(--surface); }
.range button {
  border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px;
  font-weight: 600; padding: 3px 12px; border-radius: 999px; cursor: pointer;
}
.range button.on { background: var(--accent); color: var(--surface); }
main { max-width: 1100px; margin: 0 auto; display: grid; gap: 16px; }
.grid { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
@media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 18px 20px;
}
.card h2 {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em;
  color: var(--muted); margin-bottom: 14px;
}
ul { list-style: none; }
#projects li { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid var(--border); }
#projects li:first-child { border-top: 0; }
.health { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.health.ok { background: var(--ok); } .health.bad { background: var(--deny); }
.pname { font-weight: 600; }
.plast { margin-left: auto; color: var(--muted); font-size: 12.5px; font-variant-numeric: tabular-nums; }
.pproblems { color: var(--deny); font-size: 12.5px; }
svg { width: 100%; height: auto; display: block; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
td { padding: 6px 0; border-top: 1px solid var(--border); }
tr:first-child td { border-top: 0; }
td.num { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
td.rule { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.bar-cell { width: 40%; padding-left: 12px; }
.bar { height: 6px; border-radius: 3px; background: var(--accent); opacity: .75; }
#feed li {
  display: flex; align-items: baseline; gap: 10px; padding: 8px 0;
  border-top: 1px solid var(--border); font-size: 14px;
}
#feed li:first-child { border-top: 0; }
#feed li.fresh { animation: slidein .35s ease; }
@keyframes slidein { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12.5px; flex: none; width: 62px; }
.proj { color: var(--muted); font-size: 12.5px; flex: none; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool { font-weight: 600; flex: none; width: 74px; }
.target {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;
}
.badge {
  flex: none; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 2px 8px; border-radius: 999px;
}
.badge.ok { color: var(--ok); background: var(--ok-soft); }
.badge.adv { color: var(--adv); background: var(--adv-soft); }
.badge.warn { color: var(--warn); background: var(--warn-soft); }
.badge.deny { color: var(--deny); background: var(--deny-soft); }
.rid { color: var(--muted); font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex: none; }
.empty { text-align: center; padding: 36px 16px; color: var(--muted); }
.empty .big { font-size: 17px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.empty code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px;
}
</style>
</head>
<body>
<header>
  <div class="brand"><span id="live-dot" class="dot"></span>crasp</div>
  <div class="totals">
    <span class="pill ok">&#10003; <b id="t-clean">0</b> clean</span>
    <span class="pill adv">&#9670; <b id="t-advisory">0</b> advisory</span>
    <span class="pill warn">&#9888; <b id="t-ask">0</b> asked</span>
    <span class="pill deny">&#10005; <b id="t-denied">0</b> denied</span>
  </div>
  <nav class="range" id="range" aria-label="History range">
    <button data-range="30" class="on">30d</button>
    <button data-range="90">90d</button>
    <button data-range="live">live</button>
  </nav>
</header>
<main>
  <section class="grid">
    <div class="card">
      <h2>Protection</h2>
      <ul id="projects"></ul>
      <div id="projects-empty" class="empty" hidden>
        <div class="big">No projects registered yet</div>
        <div>Run <code>npx @crasp/cli setup</code> in a project to protect it.</div>
      </div>
    </div>
    <div class="card">
      <h2>Last 30 days</h2>
      <svg id="chart" viewBox="0 0 600 150" preserveAspectRatio="none" aria-label="Daily event counts"></svg>
    </div>
  </section>
  <section class="grid">
    <div class="card"><h2>Top rules</h2><table id="rules"></table></div>
    <div class="card"><h2>By project</h2><table id="by-project"></table></div>
  </section>
  <section class="card">
    <h2>Live feed</h2>
    <div id="feed-empty" class="empty" hidden>
      <div class="big">Waiting for your first event&hellip;</div>
      <div>Use Claude Code in a protected project and checks will stream in here.</div>
    </div>
    <ul id="feed"></ul>
  </section>
</main>
<script>
(function () {
  var MAX_FEED = 200;
  var BUCKET_CLASS = { clean: 'ok', advisory: 'adv', ask: 'warn', denied: 'deny' };
  var totals = { clean: 0, advisory: 0, ask: 0, denied: 0 };

  function el(id) { return document.getElementById(id); }
  function text(tag, cls, value) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    n.textContent = value == null ? '' : String(value);
    return n;
  }
  function bucket(outcome) {
    if (outcome === 'denied') return 'denied';
    if (outcome === 'ask' || outcome === 'inbound-flagged') return 'ask';
    if (outcome === 'advisory') return 'advisory';
    return 'clean';
  }
  function badgeLabel(outcome) {
    if (outcome === 'denied') return 'blocked';
    if (outcome === 'inbound-flagged') return 'flagged';
    return outcome;
  }
  function renderTotals() {
    el('t-clean').textContent = totals.clean;
    el('t-advisory').textContent = totals.advisory;
    el('t-ask').textContent = totals.ask;
    el('t-denied').textContent = totals.denied;
  }
  function feedRow(ev, fresh) {
    var li = document.createElement('li');
    if (fresh) li.className = 'fresh';
    var d = new Date(ev.ts);
    var hh = String(d.getHours()); if (hh.length < 2) hh = '0' + hh;
    var mm = String(d.getMinutes()); if (mm.length < 2) mm = '0' + mm;
    var ss = String(d.getSeconds()); if (ss.length < 2) ss = '0' + ss;
    li.appendChild(text('span', 'time', hh + ':' + mm + ':' + ss));
    li.appendChild(text('span', 'proj', ev.project));
    li.appendChild(text('span', 'tool', ev.tool));
    li.appendChild(text('span', 'target', ev.filePath));
    if (ev.ruleId) li.appendChild(text('span', 'rid', ev.ruleId));
    li.appendChild(text('span', 'badge ' + BUCKET_CLASS[bucket(ev.outcome)], badgeLabel(ev.outcome)));
    return li;
  }
  function addLive(ev) {
    el('feed-empty').hidden = true;
    var feed = el('feed');
    feed.insertBefore(feedRow(ev, true), feed.firstChild);
    while (feed.children.length > MAX_FEED) feed.removeChild(feed.lastChild);
    totals[bucket(ev.outcome)] += 1;
    renderTotals();
  }
  function renderProjects(projects) {
    el('projects-empty').hidden = projects.length > 0;
    var ul = el('projects');
    ul.textContent = '';
    projects.forEach(function (p) {
      var li = document.createElement('li');
      li.appendChild(text('span', 'health ' + (p.healthy ? 'ok' : 'bad'), ''));
      li.appendChild(text('span', 'pname', p.name));
      if (!p.healthy) li.appendChild(text('span', 'pproblems', p.problems.length + ' problem' + (p.problems.length === 1 ? '' : 's')));
      var last = p.lastEventTs ? new Date(p.lastEventTs).toLocaleString() : 'no events yet';
      li.appendChild(text('span', 'plast', last));
      li.title = p.path + (p.problems.length ? '\n' + p.problems.join('\n') : '');
      ul.appendChild(li);
    });
  }
  function renderChart(daily) {
    var svg = el('chart');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!daily.length) return;
    var W = 600, H = 150, PAD = 2;
    var bw = (W - PAD * (daily.length - 1)) / daily.length;
    var max = 1;
    daily.forEach(function (d) { max = Math.max(max, d.clean + d.advisory + d.ask + d.denied); });
    var ns = 'http://www.w3.org/2000/svg';
    var colors = { clean: 'var(--ok)', advisory: 'var(--adv)', ask: 'var(--warn)', denied: 'var(--deny)' };
    daily.forEach(function (d, i) {
      var x = i * (bw + PAD);
      var y = H;
      var total = d.clean + d.advisory + d.ask + d.denied;
      ['clean', 'advisory', 'ask', 'denied'].forEach(function (k) {
        if (!d[k]) return;
        var h = (d[k] / max) * (H - 10);
        y -= h;
        var r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', x); r.setAttribute('y', y);
        r.setAttribute('width', bw); r.setAttribute('height', h);
        r.setAttribute('rx', 1.5);
        r.setAttribute('fill', colors[k]);
        svg.appendChild(r);
      });
      if (total === 0) {
        var stub = document.createElementNS(ns, 'rect');
        stub.setAttribute('x', x); stub.setAttribute('y', H - 2);
        stub.setAttribute('width', bw); stub.setAttribute('height', 2);
        stub.setAttribute('fill', 'var(--border)');
        svg.appendChild(stub);
      }
      var title = document.createElementNS(ns, 'title');
      title.textContent = d.date + ': ' + total + ' events';
      svg.appendChild(title);
    });
  }
  function renderRankTable(id, rows, labelKey, labelClass) {
    var table = el(id);
    table.textContent = '';
    if (!rows.length) {
      var tr0 = document.createElement('tr');
      var td0 = text('td', null, 'Nothing yet');
      td0.style.color = 'var(--muted)';
      tr0.appendChild(td0);
      table.appendChild(tr0);
      return;
    }
    var max = rows[0].count;
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.appendChild(text('td', labelClass, r[labelKey]));
      tr.appendChild(text('td', 'num', r.count));
      var barCell = document.createElement('td');
      barCell.className = 'bar-cell';
      var bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.width = Math.max(4, Math.round((r.count / max) * 100)) + '%';
      barCell.appendChild(bar);
      tr.appendChild(barCell);
      table.appendChild(tr);
    });
  }

  var range = '30';
  function clearView() {
    totals = { clean: 0, advisory: 0, ask: 0, denied: 0 };
    renderTotals();
    el('feed').textContent = '';
    el('feed-empty').hidden = false;
    renderChart([]);
    renderRankTable('rules', [], 'ruleId', 'rule');
    renderRankTable('by-project', [], 'project', null);
  }
  function loadRange(next) {
    range = next;
    var buttons = el('range').querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].className = buttons[i].getAttribute('data-range') === next ? 'on' : '';
    }
    if (next === 'live') {
      clearView();
      return;
    }
    fetch('/api/bootstrap?days=' + next).then(function (r) { return r.json(); }).then(function (b) {
      if (range !== next) return; // user switched again while loading
      totals = b.aggregates.today;
      renderTotals();
      renderProjects(b.projects);
      renderChart(b.aggregates.daily);
      renderRankTable('rules', b.aggregates.topRules, 'ruleId', 'rule');
      renderRankTable('by-project', b.aggregates.byProject, 'project', null);
      var feed = el('feed');
      feed.textContent = '';
      el('feed-empty').hidden = b.events.length > 0;
      b.events.slice(0, 50).forEach(function (ev) { feed.appendChild(feedRow(ev, false)); });
    });
  }
  el('range').addEventListener('click', function (e) {
    var target = e.target;
    var r = target && target.getAttribute ? target.getAttribute('data-range') : null;
    if (r && r !== range) loadRange(r);
  });
  loadRange('30');

  var es = new EventSource('/api/stream');
  es.onopen = function () { el('live-dot').classList.add('live'); };
  es.onerror = function () { el('live-dot').classList.remove('live'); };
  es.onmessage = function (m) {
    try { addLive(JSON.parse(m.data)); } catch (e) { /* skip malformed frame */ }
  };
})();
</script>
</body>
</html>`;
