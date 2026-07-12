// The published bundle is a single file — the page ships as a string, never
// as an asset. A raw template literal with no backticks or dollar-brace inside
// keeps the inline JS literal-safe. All user-influenced values reach the DOM
// only via textContent (the text() helper) or safe property writes, never via
// any HTML-parsing sink, so logged content can never inject markup.
export const PANEL_PAGE: string = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>crasp panel</title>
<style>
:root {
  --bg: #f4f6f8; --surface: #ffffff; --border: #dfe4e9;
  --text: #17202a; --muted: #5a6675;
  --ok: #178f53; --adv: #2a63c9; --warn: #b26f05; --deny: #cc3434;
  --ok-soft: #ddf3e7; --adv-soft: #e3ecfb; --warn-soft: #faeed6; --deny-soft: #fadddd;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e1116; --surface: #161b22; --border: #2a323d;
    --text: #edf2f7; --muted: #9aa7b4;
    --ok: #43d48b; --adv: #79aaf5; --warn: #edb04d; --deny: #f37f79;
    --ok-soft: #143423; --adv-soft: #172740; --warn-soft: #3a2b10; --deny-soft: #401b1b;
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { color-scheme: light dark; }
body {
  background: var(--bg); color: var(--text);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  padding: 0 20px 56px;
}
header {
  max-width: 880px; margin: 0 auto; padding: 20px 0 14px;
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); transition: background .3s; flex: none; }
.dot.live { background: var(--ok); box-shadow: 0 0 0 4px var(--ok-soft); }
.tabs { display: flex; gap: 4px; flex: 1; flex-wrap: wrap; }
.tabs a {
  text-decoration: none; color: var(--muted); font-weight: 600; font-size: 15px;
  padding: 7px 14px; border-radius: 8px;
}
.tabs a.on { color: var(--text); background: var(--surface); border: 1px solid var(--border); }
.range { display: flex; align-items: center; gap: 8px; }
.range-label { color: var(--muted); font-size: 12.5px; font-weight: 600; }
.range select {
  font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 5px 10px; cursor: pointer;
}
.live-restart {
  font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
  color: var(--text); background: transparent; border: 1px solid var(--border);
  border-radius: 8px; padding: 4px 10px;
}
.chart-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.legend { display: flex; gap: 12px; flex-wrap: wrap; }
.lg { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); }
.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.sw.ok { background: var(--ok); } .sw.adv { background: var(--adv); } .sw.warn { background: var(--warn); } .sw.deny { background: var(--deny); }
.chart-wrap { position: relative; }
#spark { height: 120px; }
.chart-axis { display: flex; justify-content: space-between; margin-top: 6px; color: var(--muted); font-size: 11px; }
.chart-tip {
  position: absolute; pointer-events: none; z-index: 5; transform: translate(-50%, -100%);
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 10px; font-size: 12.5px; box-shadow: 0 4px 14px rgba(0,0,0,.18); white-space: nowrap;
}
.chart-tip .tt-date { font-weight: 700; margin-bottom: 4px; }
.chart-tip .tt-row { display: flex; justify-content: space-between; gap: 14px; }
.chart-tip .tt-row .tt-n { font-variant-numeric: tabular-nums; }
.chart-tip .tt-total { border-top: 1px solid var(--border); margin-top: 4px; padding-top: 4px; font-weight: 700; }
.hovcol { fill: transparent; cursor: default; }
.hovcol.on { fill: var(--border); opacity: .35; }
.rules-intro { color: var(--muted); font-size: 13.5px; margin-bottom: 14px; }
.rule-count .unit { display: block; font-size: 10px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
main { max-width: 880px; margin: 0 auto; }
section[data-tab] { display: none; }
section[data-tab].on { display: block; }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; padding: 22px 24px; margin-bottom: 16px;
}
h2 {
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em;
  color: var(--muted); margin-bottom: 14px;
}
.banner { border-radius: 14px; padding: 26px 28px; margin-bottom: 16px; border: 1px solid var(--border); }
.banner.ok { background: var(--ok-soft); border-color: var(--ok); }
.banner.warn { background: var(--warn-soft); border-color: var(--warn); }
.banner.bad { background: var(--deny-soft); border-color: var(--deny); }
.banner .headline { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
.banner.ok .headline { color: var(--ok); }
.banner.warn .headline { color: var(--warn); }
.banner.bad .headline { color: var(--deny); }
.banner .sub { color: var(--text); margin-top: 6px; font-size: 15.5px; }
.stat-row { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; margin-bottom: 16px; }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 22px; }
.stat .n { font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; }
.stat .l { color: var(--muted); font-size: 13.5px; font-weight: 600; }
.stat.warn .n { color: var(--warn); } .stat.deny .n { color: var(--deny); } .stat.ok .n { color: var(--ok); }
svg { width: 100%; height: auto; display: block; }
.latest { color: var(--muted); font-size: 14.5px; }
.latest b { color: var(--text); }
.fresh-box { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 14px; color: var(--muted); }
.fresh-box button {
  font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
  color: var(--text); background: transparent; border: 1px solid var(--border);
  border-radius: 8px; padding: 6px 12px;
}
.fresh-box a { color: var(--adv); cursor: pointer; }
.chips { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.chips button {
  font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
  color: var(--muted); background: transparent; border: 1px solid var(--border);
  border-radius: 999px; padding: 5px 14px;
}
.chips button.on { color: var(--surface); background: var(--text); border-color: var(--text); }
ul { list-style: none; }
#feed li {
  display: flex; align-items: baseline; gap: 12px; padding: 11px 0; font-size: 15px;
  border-top: 1px solid var(--border);
}
#feed li:first-child { border-top: 0; }
#feed li.fresh-row { animation: slidein .35s ease; }
@keyframes slidein { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 13px; flex: none; width: 60px; }
.proj { color: var(--muted); font-size: 13px; flex: none; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sentence { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  flex: none; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 3px 10px; border-radius: 999px;
}
.badge.ok { color: var(--ok); background: var(--ok-soft); }
.badge.adv { color: var(--adv); background: var(--adv-soft); }
.badge.warn { color: var(--warn); background: var(--warn-soft); }
.badge.deny { color: var(--deny); background: var(--deny-soft); }
.rname { color: var(--muted); font-size: 12.5px; flex: none; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
li.runrow { color: var(--muted); font-size: 14px; cursor: pointer; }
li.runrow:hover { color: var(--text); }
.rule-row { display: flex; align-items: center; gap: 14px; padding: 13px 0; border-top: 1px solid var(--border); }
.rule-row:first-child { border-top: 0; }
.rule-main { flex: 1; min-width: 0; }
.rule-name { font-weight: 700; font-size: 15.5px; }
.rule-name .rid { font-weight: 400; color: var(--muted); font-size: 12.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-left: 8px; }
.rule-desc { color: var(--muted); font-size: 13.5px; margin-top: 2px; }
.rule-count { flex: none; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; width: 56px; text-align: right; }
.rule-bar { flex: none; width: 26%; }
.rule-bar > div { height: 8px; border-radius: 4px; }
.sev-critical { background: var(--deny); } .sev-high { background: var(--warn); }
.sev-medium { background: var(--adv); } .sev-low { background: var(--ok); }
.pcards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 14px; }
.pcard { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; }
.pcard.gone { opacity: .55; }
.pcard .prow { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 16.5px; }
.health { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.health.ok { background: var(--ok); } .health.bad { background: var(--deny); } .health.off { background: var(--muted); }
.ppath { color: var(--muted); font-size: 12px; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pmeta { color: var(--muted); font-size: 13.5px; margin-top: 10px; }
.pproblem { color: var(--deny); font-size: 13px; margin-top: 6px; }
.pcopy {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 9px;
  margin-top: 8px; cursor: pointer; display: inline-block;
}
.empty { text-align: center; padding: 40px 16px; color: var(--muted); font-size: 15px; }
.empty .big { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
@media (max-width: 640px) { .stat-row { grid-template-columns: minmax(0,1fr); } .tabs a { padding: 7px 10px; } }
</style>
</head>
<body>
<header>
  <div class="brand"><span id="live-dot" class="dot"></span>crasp panel</div>
  <nav class="tabs" id="tabs">
    <a href="#/overview" data-nav="overview" class="on">Overview</a>
    <a href="#/activity" data-nav="activity">Activity</a>
    <a href="#/rules" data-nav="rules">Rules</a>
    <a href="#/projects" data-nav="projects">Projects</a>
  </nav>
  <label class="range">
    <span class="range-label">Showing</span>
    <select id="range" aria-label="History range">
      <option value="live">Live</option>
      <option value="10">Last 10 days</option>
      <option value="15">Last 15 days</option>
      <option value="30" selected>Last 30 days</option>
      <option value="45">Last 45 days</option>
      <option value="60">Last 60 days</option>
      <option value="90">Last 90 days</option>
    </select>
    <button id="live-restart" class="live-restart" hidden>&#8635; Restart</button>
  </label>
</header>
<main>

<section data-tab="overview" class="on">
  <div class="banner ok" id="verdict">
    <div class="headline" id="verdict-headline">Loading&hellip;</div>
    <div class="sub" id="verdict-sub"></div>
  </div>
  <div class="stat-row">
    <div class="stat ok"><div class="n" id="s-checked">0</div><div class="l">checked today</div></div>
    <div class="stat warn"><div class="n" id="s-asked">0</div><div class="l">asked today</div></div>
    <div class="stat deny"><div class="n" id="s-blocked">0</div><div class="l">blocked today</div></div>
  </div>
  <div class="card">
    <div class="chart-head">
      <h2 id="chart-title">Last 30 days</h2>
      <div class="legend">
        <span class="lg"><i class="sw ok"></i>Clean</span>
        <span class="lg"><i class="sw adv"></i>Advisory</span>
        <span class="lg"><i class="sw warn"></i>Asked</span>
        <span class="lg"><i class="sw deny"></i>Blocked</span>
      </div>
    </div>
    <div class="chart-wrap">
      <svg id="spark" viewBox="0 0 600 120" preserveAspectRatio="none" aria-label="activity by day"></svg>
      <div id="chart-axis" class="chart-axis"></div>
      <div id="chart-tip" class="chart-tip" hidden></div>
    </div>
  </div>
  <div class="card">
    <div class="latest" id="latest">No events yet.</div>
  </div>
  <div class="card">
    <div class="fresh-box" id="fresh-box">
      <button id="start-fresh">Start fresh — count only from now</button>
      <span id="fresh-state"></span>
    </div>
  </div>
</section>

<section data-tab="activity">
  <div class="card">
    <div class="chips" id="chips">
      <button data-filter="all" class="on">All</button>
      <button data-filter="flagged">Flagged</button>
      <button data-filter="blocked">Blocked</button>
    </div>
    <div id="feed-empty" class="empty" hidden>
      <div class="big">Nothing here yet</div>
      <div>Use Claude Code in a protected project and checks will stream in live.</div>
    </div>
    <ul id="feed"></ul>
  </div>
</section>

<section data-tab="rules">
  <div class="card">
    <p class="rules-intro">Each protection below is a rule Claude's actions are checked against — and how many times it fired in the selected window.</p>
    <div id="rules-empty" class="empty" hidden>
      <div class="big">Nothing has fired in this window</div>
      <div>That is a good thing.</div>
    </div>
    <div id="rules-list"></div>
  </div>
</section>

<section data-tab="projects">
  <div class="pcards" id="pcards"></div>
</section>

</main>
<script>
(function () {
  var MAX_ROWS = 300;
  var BUCKET_CLASS = { clean: 'ok', advisory: 'adv', ask: 'warn', denied: 'deny' };

  var RULE_INFO = {
    'sensitive-env-file': ['Protected a .env file', 'Asked before Claude touched an environment/secrets file'],
    'sensitive-key-file': ['Protected a private key', 'Asked before Claude touched a key or certificate file'],
    'sensitive-cloud-credentials': ['Protected cloud credentials', 'Asked before Claude touched cloud credential files'],
    'token-leakage': ['Caught a leaked token', 'Blocked content containing an API key or token'],
    'credential-exfiltration': ['Stopped credential-theft text', 'Content matched instructions for stealing credentials'],
    'prompt-injection': ['Caught prompt injection', 'Text tried to override the assistant instructions'],
    'ssrf': ['Blocked metadata endpoint', 'Content referenced internal cloud metadata addresses'],
    'path-traversal': ['Caught path traversal', 'Content reached outside the project directory'],
    'code-execution': ['Flagged dynamic code execution', 'Content used eval-style code execution'],
    'data-exfiltration': ['Stopped data-exfiltration text', 'Content matched instructions for exporting private data'],
    'pii-exposure': ['Caught personal data', 'Content looked like SSNs, card or passport numbers'],
    'jailbreak-attempt': ['Caught a jailbreak attempt', 'Text tried to disable safety behavior'],
    'system-prompt-extraction': ['Blocked prompt extraction', 'Text asked to reveal hidden system instructions'],
    'credential-theft': ['Stopped credential-theft text', 'A policy rule for credential theft matched'],
    'bash-rm-rf': ['Asked before a destructive delete', 'An rm -rf style command needed your approval'],
    'bash-sudo': ['Asked before sudo', 'A privileged command needed your approval'],
    'bash-force-push': ['Asked before force-push', 'A git force-push needed your approval'],
    'bash-pipe-to-shell': ['Asked before curl-to-shell', 'Piping a download into a shell needed your approval'],
    'bash-outbound-fetch': ['Noticed an outbound fetch', 'A command sent a network request; data could leave your machine'],
    'bash-secret-exfil': ['Asked before secret exfiltration', 'A command tried to send secrets somewhere'],
    'bash-read-secret': ['Asked before reading secrets', 'A command read credential files'],
    'bash-history-wipe': ['Asked before history wipe', 'A command tried to clear shell history'],
    'bash-db-drop': ['Asked before dropping a database', 'A destructive database command needed approval'],
    'bash-disk-write': ['Asked before raw disk write', 'A command wrote directly to a disk device'],
    'bash-fork-bomb': ['Caught a fork bomb', 'A self-replicating shell pattern needed approval'],
    'bash-chmod-777': ['Asked before chmod 777', 'A command made files world-writable'],
    'bash-git-hard-reset': ['Asked before hard reset', 'A git hard reset would discard work'],
    'bash-global-install': ['Asked before global install', 'A package was being installed machine-wide'],
    'bash-publish': ['Asked before publishing', 'A publish/release command needed your approval'],
    'inbound-instruction-override': ['Injection in content Claude read', 'A webpage/file tried to give Claude new instructions'],
    'inbound-data-exfil-directive': ['Exfil directive in content', 'Content Claude read told it to send data somewhere'],
    'inbound-embedded-command': ['Embedded command in content', 'Content Claude read contained a hidden command'],
    'inbound-tool-injection': ['Tool-call injection in content', 'Content tried to trigger tool calls with secrets/URLs'],
    'inbound-trigger-on-read': ['Trigger phrase in content', 'Content tried to activate on being read'],
    'secret-generic-entropy': ['Possible unknown secret', 'A high-entropy string looked like a credential'],
    'secret-jwt': ['JWT token found', 'A JSON Web Token appeared in content'],
    'secret-pem': ['Private key found', 'A PEM/SSH private key appeared in content'],
    'secret-db-conn': ['Database credentials found', 'A connection string with credentials appeared'],
    'secret-url-creds': ['Credentials in a URL', 'A URL containing a password appeared'],
    'crasp-builtin-security': ['Built-in security rule', 'One of the always-on rules matched']
  };
  function providerRuleInfo(id) {
    if (id.indexOf('secret-') === 0) {
      var provider = id.slice(7).replace(/-/g, ' ');
      return [provider.charAt(0).toUpperCase() + provider.slice(1) + ' secret found',
              'A ' + provider + ' credential appeared in content and was stopped'];
    }
    return null;
  }
  function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }
  function ruleInfo(rawId) {
    var id = rawId == null ? '' : String(rawId); // a malformed log line could carry a non-string id
    if (has(RULE_INFO, id)) return RULE_INFO[id];
    var p = providerRuleInfo(id);
    if (p) return p;
    if (has(serverRules, id)) return [id, serverRules[id].description];
    return [id, ''];
  }

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
  function isFlagged(ev) { return bucket(ev.outcome) !== 'clean'; }
  // JSON-encode every semantic field (identity keyed on projectPath, which is
  // unique, not the display basename) so two same-named projects, a pre/post
  // pair, or a value containing our delimiter can never collide into one key.
  function eventKey(ev) {
    return JSON.stringify([ev.projectPath, ev.ts, ev.tool, ev.filePath, ev.outcome, ev.ruleId, ev.phase, ev.tier]);
  }
  function localDateKey(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var m = String(d.getMonth() + 1); if (m.length < 2) m = '0' + m;
    var day = String(d.getDate()); if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function hhmm(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '--:--';
    var h = String(d.getHours()); if (h.length < 2) h = '0' + h;
    var m = String(d.getMinutes()); if (m.length < 2) m = '0' + m;
    return h + ':' + m;
  }
  function isToday(ts) {
    var d = new Date(ts), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  function shortTarget(t) {
    if (t == null) return '';
    t = String(t);
    if (t.indexOf('/') === -1) return t.length > 64 ? t.slice(0, 61) + '…' : t;
    var parts = t.split('/').filter(Boolean);
    if (parts.length <= 2) return t;
    return '…/' + parts.slice(-2).join('/');
  }
  function scanLabel(tool) {
    if (tool === 'Bash') return 'scanned a command output';
    if (tool === 'WebFetch') return 'scanned a webpage Claude read';
    if (tool === 'WebSearch') return 'scanned search results';
    return 'scanned content Claude read';
  }
  function sentenceFor(ev) {
    var b = bucket(ev.outcome);
    var target = ev.filePath == null ? '' : String(ev.filePath);
    var isResultPlaceholder = target.charAt(0) === '(' || target === '';
    if (ev.phase === 'post') {
      var what = isResultPlaceholder ? scanLabel(ev.tool) : 'scanned ' + shortTarget(target);
      return b === 'clean' ? what + ' — clean' : what + ' — flagged as suspicious';
    }
    var head;
    if (ev.tool === 'Bash') head = isResultPlaceholder ? 'ran a command' : 'ran: ' + shortTarget(target);
    else if (ev.tool === 'Write') head = 'wrote to ' + shortTarget(target);
    else if (ev.tool === 'Edit') head = 'edited ' + shortTarget(target);
    else if (ev.tool === 'Read') head = 'read ' + shortTarget(target);
    else head = 'used ' + ev.tool + ' on ' + shortTarget(target);
    if (b === 'denied') return 'blocked — ' + head;
    if (b === 'ask') return 'asked you first — ' + head;
    if (b === 'advisory') return 'noted — ' + head;
    if (ev.outcome === 'exception') return head + ' (pre-approved exception)';
    return head;
  }
  function badgeLabel(outcome) {
    if (outcome === 'denied') return 'blocked';
    if (outcome === 'ask') return 'asked';
    if (outcome === 'inbound-flagged') return 'flagged';
    if (outcome === 'advisory') return 'noted';
    if (outcome === 'exception') return 'allowed';
    return 'clean';
  }

  // ---- state ----
  var range = '30';
  var filter = 'all';
  var events = [];            // newest first
  var boot = null;            // last bootstrap
  // Null-prototype maps so a rule id like "__proto__"/"toString" can't corrupt
  // lookups or vanish from Object.keys.
  var serverRules = Object.create(null); // id -> {description, severity}
  var seen = Object.create(null);        // eventKey -> true, SSE/bootstrap dedup
  var expandedRuns = Object.create(null);// runKey -> true, kept across re-renders
  var totals = { clean: 0, advisory: 0, ask: 0, denied: 0 };
  var FRESH_KEY = 'crasp-panel-since';
  var loadGen = 0;            // only the newest bootstrap response may apply
  var inflight = false;       // a bootstrap fetch is in progress
  var buffer = [];            // SSE events that arrived during an in-flight load
  var liveSince = null;       // Live mode's transient "count from now" stamp (in-memory)

  function freshTs() { try { return localStorage.getItem(FRESH_KEY); } catch (e) { return null; } }
  // The active cutoff: Live uses its in-memory stamp; every other range uses the
  // persisted "Start fresh" cutoff (if any). Compared by epoch everywhere.
  function activeCutoff() { return range === 'live' ? liveSince : freshTs(); }

  // ---- router ----
  function currentTab() {
    var h = location.hash.replace('#/', '');
    return (h === 'activity' || h === 'rules' || h === 'projects') ? h : 'overview';
  }
  function route() {
    var tab = currentTab();
    var secs = document.querySelectorAll('section[data-tab]');
    for (var i = 0; i < secs.length; i++) secs[i].className = secs[i].getAttribute('data-tab') === tab ? 'on' : '';
    var navs = document.querySelectorAll('#tabs a');
    for (var j = 0; j < navs.length; j++) navs[j].className = navs[j].getAttribute('data-nav') === tab ? 'on' : '';
  }
  window.addEventListener('hashchange', route);

  // ---- overview ----
  function renderVerdict() {
    if (!boot) return;
    var banner = el('verdict');
    var unhealthy = boot.projects.filter(function (p) { return !p.missing && !p.healthy; });
    var liveCount = boot.projects.filter(function (p) { return !p.missing; }).length;
    var state, headline, sub;
    if (totals.denied > 0 || unhealthy.length > 0) {
      state = 'bad'; headline = '✕ Attention';
      sub = unhealthy.length > 0
        ? unhealthy[0].name + ' protection is broken — run crasp status there' +
          (totals.denied > 0 ? ' · ' + totals.denied + ' blocked today' : '')
        : totals.denied + ' operation' + (totals.denied === 1 ? '' : 's') + ' blocked today — review Activity';
    } else if (totals.ask > 0 || totals.advisory > 0) {
      state = 'warn'; headline = '⚠ Needs a look';
      sub = totals.ask + ' asked · ' + totals.advisory + ' noted today — nothing was blocked';
    } else {
      state = 'ok'; headline = '✓ All clear';
      sub = liveCount + ' of ' + liveCount + ' project' + (liveCount === 1 ? '' : 's') + ' protected · ' +
        (totals.clean + totals.advisory + totals.ask + totals.denied) + ' checks today · nothing blocked';
    }
    banner.className = 'banner ' + state;
    el('verdict-headline').textContent = headline;
    el('verdict-sub').textContent = sub;
    el('s-checked').textContent = totals.clean + totals.advisory + totals.ask + totals.denied;
    el('s-asked').textContent = totals.ask;
    el('s-blocked').textContent = totals.denied;
  }
  function fmtAxis(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }
  function chartDays() {
    if (range === 'live') {
      // Build an ascending daily series from the live events (usually just today).
      var byDay = Object.create(null);
      events.forEach(function (ev) {
        var k = localDateKey(ev.ts);
        if (!k) return;
        if (!byDay[k]) byDay[k] = { date: k, clean: 0, advisory: 0, ask: 0, denied: 0 };
        byDay[k][bucket(ev.outcome)] += 1;
      });
      var keys = Object.keys(byDay).sort();
      if (!keys.length) return [{ date: localDateKey(new Date().toISOString()), clean: 0, advisory: 0, ask: 0, denied: 0 }];
      return keys.map(function (k) { return byDay[k]; });
    }
    if (!boot) return [];
    var n = Number(range) || 30;
    return boot.aggregates.daily.slice(-n);
  }
  function showTip(e, d, hov) {
    var tip = el('chart-tip');
    var rect = el('spark').parentNode.getBoundingClientRect();
    hov.setAttribute('class', 'hovcol on');
    tip.textContent = '';
    tip.appendChild(text('div', 'tt-date', fmtAxis(d.date)));
    [['Clean', d.clean], ['Advisory', d.advisory], ['Asked', d.ask], ['Blocked', d.denied]].forEach(function (row) {
      var r = document.createElement('div'); r.className = 'tt-row';
      r.appendChild(text('span', null, row[0]));
      r.appendChild(text('span', 'tt-n', row[1]));
      tip.appendChild(r);
    });
    var tot = document.createElement('div'); tot.className = 'tt-row tt-total';
    tot.appendChild(text('span', null, 'Total'));
    tot.appendChild(text('span', 'tt-n', d.clean + d.advisory + d.ask + d.denied));
    tip.appendChild(tot);
    tip.style.left = (e.clientX - rect.left) + 'px';
    tip.style.top = (e.clientY - rect.top - 10) + 'px';
    tip.hidden = false;
  }
  function renderChart() {
    var svg = el('spark');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var axis = el('chart-axis'); axis.textContent = '';
    el('chart-tip').hidden = true;
    el('chart-title').textContent = (range === 'live')
      ? 'Live — since ' + hhmm(liveSince || new Date().toISOString())
      : 'Last ' + (Number(range) || 30) + ' days';
    var daily = chartDays();
    if (!daily.length) return;
    var W = 600, H = 120, PAD = daily.length > 45 ? 1 : 2;
    var bw = (W - PAD * (daily.length - 1)) / daily.length;
    var max = 1;
    daily.forEach(function (d) { max = Math.max(max, d.clean + d.advisory + d.ask + d.denied); });
    var ns = 'http://www.w3.org/2000/svg';
    var colors = { clean: 'var(--ok)', advisory: 'var(--adv)', ask: 'var(--warn)', denied: 'var(--deny)' };
    daily.forEach(function (d, i) {
      var x = i * (bw + PAD), y = H;
      var total = d.clean + d.advisory + d.ask + d.denied;
      ['clean', 'advisory', 'ask', 'denied'].forEach(function (k) {
        if (!d[k]) return;
        var h = (d[k] / max) * (H - 6);
        y -= h;
        var r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', x); r.setAttribute('y', y);
        r.setAttribute('width', bw); r.setAttribute('height', h);
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
      // Full-height transparent hover column — the real bars are poor hit targets.
      var hov = document.createElementNS(ns, 'rect');
      hov.setAttribute('class', 'hovcol');
      hov.setAttribute('x', x); hov.setAttribute('y', 0);
      hov.setAttribute('width', bw + PAD); hov.setAttribute('height', H);
      (function (dd, hh) {
        hh.addEventListener('mousemove', function (e) { showTip(e, dd, hh); });
        hh.addEventListener('mouseleave', function () { hh.setAttribute('class', 'hovcol'); el('chart-tip').hidden = true; });
      })(d, hov);
      svg.appendChild(hov);
    });
    // Axis: first, last, and evenly-spaced interior — up to 5 labels.
    var count = Math.min(5, daily.length);
    var placed = Object.create(null);
    for (var a = 0; a < count; a++) {
      var ix = Math.round(a * (daily.length - 1) / Math.max(1, count - 1));
      if (placed[ix]) continue;
      placed[ix] = true;
      axis.appendChild(text('span', null, fmtAxis(daily[ix].date)));
    }
  }
  function renderLatest() {
    var target = el('latest');
    if (!events.length) { target.textContent = 'No events yet.'; return; }
    var ev = events[0];
    target.textContent = '';
    target.appendChild(text('span', null, 'Latest: '));
    target.appendChild(text('b', null, hhmm(ev.ts) + ' · ' + ev.project + ' · ' + sentenceFor(ev)));
  }
  function renderFresh() {
    var ts = freshTs();
    var state = el('fresh-state');
    state.textContent = '';
    if (ts) {
      state.appendChild(text('span', null, 'counting since ' + new Date(ts).toLocaleString() + ' · '));
      var undo = text('a', null, 'undo');
      undo.onclick = function () {
        try { localStorage.removeItem(FRESH_KEY); } catch (e) {}
        loadAll();
      };
      state.appendChild(undo);
    }
  }

  // ---- activity ----
  function matchesFilter(ev) {
    if (filter === 'all') return true;
    if (filter === 'flagged') return isFlagged(ev);
    return bucket(ev.outcome) === 'denied';
  }
  function feedRow(ev, fresh) {
    var li = document.createElement('li');
    if (fresh) li.className = 'fresh-row';
    li.appendChild(text('span', 'time', hhmm(ev.ts)));
    li.appendChild(text('span', 'proj', ev.project));
    var s = text('span', 'sentence', sentenceFor(ev));
    s.title = ev.filePath == null ? '' : String(ev.filePath);
    li.appendChild(s);
    if (ev.ruleId) li.appendChild(text('span', 'rname', ruleInfo(ev.ruleId)[0]));
    li.appendChild(text('span', 'badge ' + BUCKET_CLASS[bucket(ev.outcome)], badgeLabel(ev.outcome)));
    return li;
  }
  function runRow(run, key) {
    var li = document.createElement('li');
    li.className = 'runrow';
    li.textContent = '▸ ' + run.length + ' routine check' + (run.length === 1 ? '' : 's') +
      ' (' + hhmm(run[run.length - 1].ts) + '–' + hhmm(run[0].ts) + ')';
    li.onclick = function () { expandedRuns[key] = true; renderFeed(); };
    return li;
  }
  function renderFeed() {
    var feed = el('feed');
    feed.textContent = '';
    var visible = events.filter(matchesFilter).slice(0, MAX_ROWS);
    el('feed-empty').hidden = visible.length > 0;
    if (filter !== 'all') {
      visible.forEach(function (ev) { feed.appendChild(feedRow(ev, false)); });
      return;
    }
    var i = 0;
    while (i < visible.length) {
      if (isFlagged(visible[i])) { feed.appendChild(feedRow(visible[i], false)); i++; continue; }
      var run = [];
      while (i < visible.length && !isFlagged(visible[i])) { run.push(visible[i]); i++; }
      // Key a run by its OLDEST event so a prepended live clean event extends
      // the same run without losing its expanded state on re-render.
      var oldest = run[run.length - 1];
      var key = JSON.stringify([oldest.projectPath, oldest.ts, oldest.tool, oldest.filePath]);
      if (run.length < 3 || expandedRuns[key]) {
        run.forEach(function (ev) { feed.appendChild(feedRow(ev, false)); });
      } else {
        feed.appendChild(runRow(run, key));
      }
    }
  }

  // ---- rules ----
  function renderRules() {
    if (!boot) return;
    var list = el('rules-list');
    list.textContent = '';
    var counts = Object.create(null);
    events.forEach(function (ev) { if (ev.ruleId) counts[ev.ruleId] = (counts[ev.ruleId] || 0) + 1; });
    var ids = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || (a < b ? -1 : 1); });
    el('rules-empty').hidden = ids.length > 0;
    if (!ids.length) return;
    var max = counts[ids[0]];
    ids.forEach(function (id) {
      var info = ruleInfo(id);
      var sev = (serverRules[id] && serverRules[id].severity) ||
        (id.indexOf('secret-') === 0 ? 'critical' : id.indexOf('sensitive-') === 0 ? 'high' : id.indexOf('inbound-') === 0 ? 'high' : 'medium');
      var row = document.createElement('div');
      row.className = 'rule-row';
      var main = document.createElement('div');
      main.className = 'rule-main';
      var name = text('div', 'rule-name', info[0]);
      name.appendChild(text('span', 'rid', id));
      main.appendChild(name);
      if (info[1]) main.appendChild(text('div', 'rule-desc', info[1]));
      row.appendChild(main);
      var countCell = text('div', 'rule-count', counts[id]);
      countCell.appendChild(text('span', 'unit', 'times fired'));
      row.appendChild(countCell);
      var barWrap = document.createElement('div');
      barWrap.className = 'rule-bar';
      var bar = document.createElement('div');
      bar.className = 'sev-' + sev;
      bar.style.width = Math.max(6, Math.round((counts[id] / max) * 100)) + '%';
      barWrap.appendChild(bar);
      row.appendChild(barWrap);
      list.appendChild(row);
    });
  }

  // ---- projects ----
  function renderProjects() {
    if (!boot) return;
    var wrap = el('pcards');
    wrap.textContent = '';
    var counts = Object.create(null);
    events.forEach(function (ev) { counts[ev.projectPath] = (counts[ev.projectPath] || 0) + 1; });
    boot.projects.forEach(function (p) {
      var card = document.createElement('div');
      card.className = p.missing ? 'pcard gone' : 'pcard';
      var head = document.createElement('div');
      head.className = 'prow';
      head.appendChild(text('span', 'health ' + (p.missing ? 'off' : p.healthy ? 'ok' : 'bad'), ''));
      head.appendChild(text('span', null, p.name));
      card.appendChild(head);
      var pathLine = text('div', 'ppath', p.path);
      pathLine.title = p.path;
      card.appendChild(pathLine);
      if (p.missing) {
        card.appendChild(text('div', 'pmeta', 'folder missing — was this project moved or deleted?'));
      } else {
        var last = p.lastEventTs ? new Date(p.lastEventTs).toLocaleString() : 'no events yet';
        card.appendChild(text('div', 'pmeta', (counts[p.path] || 0) + ' events in window · last: ' + last));
        if (!p.healthy) p.problems.forEach(function (pr) { card.appendChild(text('div', 'pproblem', pr)); });
      }
      wrap.appendChild(card);
    });
    var add = document.createElement('div');
    add.className = 'pcard';
    add.appendChild(text('div', 'prow', 'Protect another project'));
    add.appendChild(text('div', 'pmeta', 'Run this once inside the project (click to copy):'));
    var cmd = text('div', 'pcopy', 'npx @crasp/cli setup');
    cmd.title = 'Click to copy';
    cmd.onclick = function () {
      try {
        if (navigator.clipboard) navigator.clipboard.writeText('npx @crasp/cli setup');
        cmd.textContent = 'copied ✓';
        setTimeout(function () { cmd.textContent = 'npx @crasp/cli setup'; }, 1200);
      } catch (e) { /* clipboard blocked — the text is still selectable */ }
    };
    add.appendChild(cmd);
    wrap.appendChild(add);
  }

  function renderAll() {
    renderVerdict(); renderChart(); renderLatest(); renderFresh();
    renderFeed(); renderRules(); renderProjects();
  }

  // ---- live event application (keeps aggregates + projects consistent) ----
  function bumpDaily(b, ev) {
    var key = localDateKey(ev.ts);
    if (!key) return;
    for (var i = 0; i < b.aggregates.daily.length; i++) {
      if (b.aggregates.daily[i].date === key) { b.aggregates.daily[i][bucket(ev.outcome)] += 1; return; }
    }
  }
  function bumpProject(b, ev) {
    for (var i = 0; i < b.projects.length; i++) {
      var p = b.projects[i];
      if (!p.missing && p.path === ev.projectPath) {
        if (!p.lastEventTs || Date.parse(ev.ts) > Date.parse(p.lastEventTs)) p.lastEventTs = ev.ts;
        return;
      }
    }
  }
  function applyLiveEvent(ev) {
    events.unshift(ev);
    if (events.length > 5000) events.pop();
    if (ev.ts && isToday(ev.ts)) totals[bucket(ev.outcome)] += 1;
    // In live the chart is derived from the events array; elsewhere bump the
    // server's daily buckets. Either way keep project last-seen fresh.
    if (boot) { if (range !== 'live') bumpDaily(boot, ev); bumpProject(boot, ev); }
    renderAll(); // includes chart + projects so no view goes stale
  }

  // ---- data ----
  function loadAll() {
    var myGen = ++loadGen;
    inflight = true;
    buffer = [];
    var isLive = range === 'live';
    // Live is just a windowed load with an in-memory since cutoff: the server
    // filters BOTH events and aggregates to >= liveSince, so tiles/feed/chart
    // zero automatically and count forward. No special client zeroing needed.
    var q = '/api/bootstrap?days=' + (isLive ? '30' : range);
    var cutoff = activeCutoff();
    if (cutoff) q += '&since=' + encodeURIComponent(cutoff);
    fetch(q).then(function (r) { return r.json(); }).then(function (b) {
      if (myGen !== loadGen) return; // a newer load superseded this one; it owns state
      boot = b;
      serverRules = Object.create(null);
      (b.rules || []).forEach(function (r) { serverRules[r.id] = r; });
      seen = Object.create(null);
      expandedRuns = Object.create(null);
      b.events.forEach(function (ev) { seen[eventKey(ev)] = true; });
      var merged = b.events.slice();
      totals = { clean: b.aggregates.today.clean, advisory: b.aggregates.today.advisory,
                 ask: b.aggregates.today.ask, denied: b.aggregates.today.denied };
      // Merge SSE events that arrived while this bootstrap was in flight (the
      // read-vs-tailer race), respecting the same cutoff and dedup.
      buffer.forEach(function (ev) {
        if (cutoff && ev.ts && Date.parse(ev.ts) < Date.parse(cutoff)) return;
        var k = eventKey(ev);
        if (seen[k]) return;
        seen[k] = true;
        merged.push(ev);
        if (ev.ts && isToday(ev.ts)) totals[bucket(ev.outcome)] += 1;
        if (!isLive) bumpDaily(b, ev);
        bumpProject(b, ev);
      });
      merged.sort(function (a, c) { return Date.parse(c.ts) - Date.parse(a.ts); }); // newest first, by instant
      events = merged;
      inflight = false;
      buffer = [];
      renderAll();
    }).catch(function () {
      el('live-dot').classList.remove('live');
      if (myGen !== loadGen) return; // a newer load owns state
      inflight = false;
      // Live must still read as zeroed if its bootstrap failed.
      if (isLive) { events = []; totals = { clean: 0, advisory: 0, ask: 0, denied: 0 }; renderAll(); }
      // Buffered SSE events must not be dropped — apply the unseen, in-cutoff ones.
      var pending = buffer;
      buffer = [];
      pending.forEach(function (ev) {
        if (cutoff && ev.ts && Date.parse(ev.ts) < Date.parse(cutoff)) return;
        var k = eventKey(ev);
        if (seen[k]) return;
        seen[k] = true;
        // A render throw (e.g. a malformed log line) must not escape the terminal
        // catch as an unhandled rejection or abort the rest.
        try { applyLiveEvent(ev); } catch (e) { /* skip this event */ }
      });
    });
  }

  el('start-fresh').onclick = function () {
    try { localStorage.setItem(FRESH_KEY, new Date().toISOString()); } catch (e) {}
    loadAll();
  };
  function selectRange(v) {
    range = v;
    liveSince = (v === 'live') ? new Date().toISOString() : null;
    el('live-restart').hidden = (v !== 'live');
    loadAll();
  }
  el('range').addEventListener('change', function (e) { selectRange(e.target.value); });
  // A native <select> emits no 'change' when Live is re-picked, so a dedicated
  // control re-stamps liveSince to restart the live session from zero.
  el('live-restart').onclick = function () { selectRange('live'); };
  el('chips').addEventListener('click', function (e) {
    var t = e.target;
    var f = t && t.getAttribute ? t.getAttribute('data-filter') : null;
    if (!f || f === filter) return;
    filter = f;
    var buttons = el('chips').querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].className = buttons[i].getAttribute('data-filter') === f ? 'on' : '';
    }
    renderFeed();
  });

  var everOpened = false;
  var es = new EventSource('/api/stream');
  es.onopen = function () {
    el('live-dot').classList.add('live');
    // On RE-connect, refetch: events written while the stream was down are not
    // replayed by the server, so a full bootstrap read reconciles them.
    if (everOpened) loadAll();
    everOpened = true;
  };
  es.onerror = function () { el('live-dot').classList.remove('live'); };
  es.onmessage = function (m) {
    var ev;
    try { ev = JSON.parse(m.data); } catch (e) { return; }
    var ts = activeCutoff();
    if (ts && ev.ts && Date.parse(ev.ts) < Date.parse(ts)) return;   // before the active cutoff
    if (inflight) { buffer.push(ev); return; }  // merged when the in-flight bootstrap resolves
    var key = eventKey(ev);
    if (seen[key]) return;                    // already delivered by bootstrap or an earlier frame
    seen[key] = true;
    try { applyLiveEvent(ev); } catch (e) { /* a malformed frame must not break the stream */ }
  };

  route();
  loadAll();
})();
</script>
</body>
</html>`;
