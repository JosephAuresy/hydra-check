/* Optional feedback mode, switched on only by  ?study=1  (optional: &cohort=name  &task=ID).
 *
 * Three parts that do not know about each other:
 *   1. the page announces what happened with two DOM events: 'hda:ask' (a question starts) and 'hda:answer' (an answer was shown);
 *   2. the log keeps one record per answer in this tab (sessionStorage; gone when the tab closes);
 *   3. exporters turn a sanitized copy of the log into a file or a request.
 * toExportPayload() is the only place that decides what may leave the log: a fixed list of fields. Files, logs and paths are never in the log;
 * the text of a question is added only when the participant ticks the box for it.
 * To connect an endpoint later:  HDAStudy.configure({ endpoint: 'https://...', mapper: function (payload) { return { body: ..., contentType: ... }; } }).
 * The module has no DOM access unless the URL asks for it, so it can be tested in node. */
(function (root) {
  'use strict';
  var S = root.HDAStudy = root.HDAStudy || {};
  var SCHEMA_VERSION = 1;
  var CHECK_VERSION = '0.1.0';
  var STORE_KEY = 'hdaStudyLog';
  var cfg = { endpoint: null, mapper: null };

  /* ---------- small helpers ---------- */
  function randomId() {
    var a = new Uint8Array(3);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a);
    else for (var i = 0; i < 3; i++) a[i] = Math.floor(Math.random() * 256);
    return 'P-' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').toUpperCase();
  }
  function hash(str) {                       /* FNV-1a, 32 bit: a stable label for a question, not a form of anonymity */
    var h = 0x811c9dc5;
    str = String(str).toLowerCase().replace(/\s+/g, ' ').trim();
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return 'q-' + ('00000000' + h.toString(16)).slice(-8);
  }
  function redact(t) {                       /* paths and e-mail addresses out of free text */
    return String(t == null ? '' : t)
      .replace(/(^|[^A-Za-z0-9])[A-Za-z]:[\\\/][^\s"'<>|]*/g, '$1[path]')
      .replace(/(^|[\s"'(])\/(?:[\w.\-]+\/)+[\w.\-]*/g, '$1[path]')
      .replace(/\\\\[\w.\-]+\\[^\s"'<>|]*/g, '[path]')
      .replace(/[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/g, '[email]');
  }
  function slug(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 32) || null; }
  function clip(t, n) { t = String(t == null ? '' : t); return t.length > n ? t.slice(0, n) : t; }

  /* ---------- the log ---------- */
  function createLog(opts) {
    opts = opts || {};
    var store = opts.store || null;          /* object with getItem / setItem / removeItem, or null */
    var state = null;
    if (store) { try { state = JSON.parse(store.getItem(STORE_KEY)); } catch (_) { state = null; } }
    if (!state || !state.participant_id || !Array.isArray(state.trials)) {
      state = { participant_id: randomId(), cohort: slug(opts.cohort), created_at: new Date().toISOString(), trials: [] };
    }
    if (opts.cohort && !state.cohort) state.cohort = slug(opts.cohort);
    function save() { if (store) { try { store.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* storage full or blocked: keep working in memory */ } } }
    save();
    return {
      get participant_id() { return state.participant_id; },
      get cohort() { return state.cohort; },
      get created_at() { return state.created_at; },
      get trials() { return state.trials; },
      /* one record per answer shown; the question text stays here (this tab only) and leaves only with the participant's opt-in */
      addAnswer: function (a) {
        var q = String(a.query || '');
        var t = {
          trial: state.trials.length + 1,
          timestamp: new Date().toISOString(),
          task_id: a.taskId || null,
          query_id: hash(q),
          query_chars: q.length,
          _query_text: redact(q).slice(0, 600),
          answer_kind: a.kind === 'known-error' ? 'known-error' : 'search',
          known_error: a.knownError || null,
          evidence_level: a.evidenceLevel || null,
          usefulness: null,
          comment: null,
          user_answer: null,      /* room for later: what the participant concluded */
          outcome: null           /* 'correct' | 'incorrect' | 'partial', set when an answer key exists */
        };
        state.trials.push(t); save(); return t;
      },
      update: function (n, patch) {
        var t = state.trials[n - 1]; if (!t) return null;
        if ('usefulness' in patch) t.usefulness = ['yes', 'somewhat', 'no'].indexOf(patch.usefulness) >= 0 ? patch.usefulness : null;
        if ('comment' in patch) t.comment = patch.comment ? clip(redact(patch.comment), 500) : null;
        save(); return t;
      },
      clear: function () { state.trials = []; save(); }
    };
  }

  /* ---------- what may leave the log ---------- */
  var TRIAL_FIELDS = ['trial', 'timestamp', 'task_id', 'query_id', 'query_chars', 'answer_kind', 'known_error', 'evidence_level', 'usefulness', 'comment', 'user_answer', 'outcome'];
  function toExportPayload(log, consent) {
    var includeText = !!(consent && consent.includeText);
    return {
      schema_version: SCHEMA_VERSION,
      check_version: CHECK_VERSION,
      participant_id: log.participant_id,
      cohort: log.cohort || null,
      exported_at: new Date().toISOString(),
      question_text_included: includeText,
      trials: log.trials.map(function (t) {
        var o = {};
        TRIAL_FIELDS.forEach(function (k) { o[k] = t[k] === undefined ? null : t[k]; });
        if (includeText) o.query_text = t._query_text || null;
        return o;
      })
    };
  }
  var CSV_COLUMNS = ['participant_id', 'check_version', 'cohort', 'trial', 'timestamp', 'task_id', 'query_id', 'query_chars', 'query_text', 'answer_kind', 'known_error', 'evidence_level', 'usefulness', 'comment', 'user_answer', 'outcome'];
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    v = String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;          /* a cell that starts like a formula is kept as text */
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toCsv(payload) {
    var rows = [CSV_COLUMNS.join(',')];
    payload.trials.forEach(function (t) {
      var r = {}; for (var k in t) r[k] = t[k];
      r.participant_id = payload.participant_id; r.check_version = payload.check_version; r.cohort = payload.cohort;
      rows.push(CSV_COLUMNS.map(function (c) { return csvCell(r[c]); }).join(','));
    });
    return rows.join('\r\n') + '\r\n';
  }

  /* ---------- exporters: each takes the sanitized payload and nothing else ---------- */
  function stamp(p) { return p.participant_id + '_' + p.exported_at.slice(0, 10).replace(/-/g, ''); }
  function saveFile(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  var exporters = {
    json: { label: 'Download JSON', remote: false, available: function () { return typeof document !== 'undefined'; },
            run: function (p) { saveFile('check-feedback_' + stamp(p) + '.json', JSON.stringify(p, null, 2), 'application/json'); return Promise.resolve('saved'); } },
    csv:  { label: 'Download CSV', remote: false, available: function () { return typeof document !== 'undefined'; },
            run: function (p) { saveFile('check-feedback_' + stamp(p) + '.csv', toCsv(p), 'text/csv'); return Promise.resolve('saved'); } },
    http: { label: 'Send results', remote: true, available: function () { return !!cfg.endpoint; },
            /* no-cors so that a plain form endpoint (Google Forms and similar) accepts it; the answer cannot be read, so success means "sent" */
            run: function (p) {
              var m = cfg.mapper ? cfg.mapper(p) : { body: JSON.stringify(p), contentType: 'text/plain;charset=UTF-8' };
              return root.fetch(cfg.endpoint, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': m.contentType }, body: m.body }).then(function () { return 'sent'; });
            } }
  };
  function send(log, consent) {                     /* a remote exporter never runs without consent */
    if (!consent || !consent.given) return Promise.reject(new Error('consent needed'));
    if (!exporters.http.available()) return Promise.reject(new Error('no endpoint configured'));
    return exporters.http.run(toExportPayload(log, consent));
  }

  S.CHECK_VERSION = CHECK_VERSION; S.SCHEMA_VERSION = SCHEMA_VERSION;
  S.createLog = createLog; S.toExportPayload = toExportPayload; S.toCsv = toCsv; S.redact = redact; S.hash = hash;
  S.exporters = exporters; S.send = send;
  S.configure = function (o) { if (o && 'endpoint' in o) cfg.endpoint = o.endpoint; if (o && 'mapper' in o) cfg.mapper = o.mapper; };

  /* ---------- browser side: built only when the URL asks for it ---------- */
  function wantsStudy() {
    try { return typeof document !== 'undefined' && typeof location !== 'undefined' && new URLSearchParams(location.search).get('study') === '1'; }
    catch (_) { return false; }
  }
  function mount() {
    var params = new URLSearchParams(location.search);
    var store = null; try { store = root.sessionStorage; store.getItem(STORE_KEY); } catch (_) { store = null; }
    var log = createLog({ store: store, cohort: params.get('cohort') });
    var taskId = slug(params.get('task'));
    var consent = { given: false, includeText: false };
    var current = null;                                        /* the record of the answer on screen */
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function $(id) { return document.getElementById(id); }

    var css = document.createElement('style');
    css.textContent =
      '.study-bar{background:var(--accent-bg);border-bottom:0.5px solid var(--border-strong);padding:8px 14px;font-size:13px;}' +
      '.study-bar .row{max-width:760px;margin:0 auto;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;}' +
      '.study-bar b{font-weight:600;color:var(--accent-text);}' +
      '.study-bar .sp{flex:1;}' +
      '.study-bar label{display:inline-flex;gap:6px;align-items:center;cursor:pointer;}' +
      '.study-bar button{font:inherit;padding:4px 12px;border-radius:8px;border:0.5px solid var(--accent);background:var(--surface);color:var(--accent-text);cursor:pointer;}' +
      '.study-bar button.primary{background:var(--accent);color:#fff;}' +
      '.study-bar button:disabled{opacity:.45;cursor:not-allowed;}' +
      '.study-bar details{width:100%;} .study-bar summary{cursor:pointer;color:var(--accent-text);} ' +
      '.study-bar pre{max-height:220px;overflow:auto;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:8px;font-size:11.5px;margin:6px 0 0;white-space:pre-wrap;}' +
      '.study-note{width:100%;color:var(--muted);font-size:12px;}' +
      '.study-fb{margin-top:12px;padding:12px 14px;background:var(--surface-1);border:0.5px solid var(--border);border-radius:10px;font-size:14px;}' +
      '.study-fb .opts{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:6px 0;}' +
      '.study-fb label{display:inline-flex;gap:6px;align-items:center;cursor:pointer;}' +
      '.study-fb input[type=text]{width:100%;font:inherit;padding:7px 10px;border:0.5px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--text);}' +
      '.study-fb .saved{font-size:12px;color:var(--green);margin-left:6px;}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.className = 'study-bar';
    bar.innerHTML =
      '<div class="row"><b>Feedback mode</b><span>ID ' + esc(log.participant_id) + '</span><span id="studyCount"></span><span class="sp"></span>' +
      '<button type="button" id="studyDl">Download results</button><button type="button" id="studyDlCsv" title="Same results as a spreadsheet file">CSV</button>' +
      '<button type="button" class="primary" id="studySend" disabled>Send results</button></div>' +
      '<div class="row" style="margin-top:6px;"><label><input type="checkbox" id="studyConsent"> I agree to share these anonymous results (no files, no logs).</label>' +
      '<label><input type="checkbox" id="studyText"> Also share the text of my questions.</label></div>' +
      '<div class="row"><span class="study-note" id="studyStatus">Nothing leaves this page until you tick the first box and press Send.</span>' +
      '<details><summary>Preview what would be sent</summary><pre id="studyPreview"></pre></details></div>';
    document.body.insertBefore(bar, document.body.firstChild);

    function payload() { return toExportPayload(log, consent); }
    function refresh() {
      var n = log.trials.length, rated = log.trials.filter(function (t) { return t.usefulness; }).length;
      $('studyCount').textContent = n + ' answer' + (n === 1 ? '' : 's') + ' logged, ' + rated + ' rated';
      var remoteOk = exporters.http.available();
      $('studySend').disabled = !(consent.given && remoteOk);
      $('studySend').title = remoteOk ? '' : 'Not connected yet: use Download results for now.';
      if ($('studyPreview') && $('studyPreview').parentElement.open) $('studyPreview').textContent = JSON.stringify(payload(), null, 2);
    }
    function status(t) { $('studyStatus').textContent = t; }
    $('studyConsent').onchange = function () { consent.given = this.checked; refresh(); };
    $('studyText').onchange = function () { consent.includeText = this.checked; refresh(); };
    $('studyDl').onclick = function () { exporters.json.run(payload()).then(function () { status('Saved a JSON file with ' + log.trials.length + ' answers.'); }); };
    $('studyDlCsv').onclick = function () { exporters.csv.run(payload()).then(function () { status('Saved a CSV file with ' + log.trials.length + ' answers.'); }); };
    $('studySend').onclick = function () {
      status('Sending...');
      send(log, consent).then(function () { status('Sent. Thank you. (A copy is still on this page: use Download results to keep one.)'); },
                              function (e) { status('Not sent: ' + e.message + '. Use Download results instead.'); });
    };
    bar.querySelector('details').addEventListener('toggle', refresh);

    function removeStrip() { var o = document.getElementById('studyFb'); if (o) o.remove(); current = null; }
    document.addEventListener('hda:ask', removeStrip);
    document.addEventListener('hda:answer', function (ev) {
      var d = ev.detail || {};
      removeStrip();
      current = log.addAnswer({ query: d.query, kind: d.kind, knownError: d.knownError, evidenceLevel: d.evidenceLevel, taskId: taskId });
      var host = $('ragAnswer');
      if (!host || !host.parentNode) { refresh(); return; }
      var fb = document.createElement('div');
      fb.className = 'study-fb'; fb.id = 'studyFb';
      fb.innerHTML = '<b>Was this useful?</b><div class="opts">' +
        ['yes|Yes', 'somewhat|Somewhat', 'no|No'].map(function (o) { var p = o.split('|'); return '<label><input type="radio" name="studyUse" value="' + p[0] + '"> ' + p[1] + '</label>'; }).join('') +
        '<span class="saved" id="studySaved" hidden>Saved</span></div>' +
        '<input type="text" id="studyComment" maxlength="500" placeholder="Comments (optional). Please leave out names and file paths." aria-label="Comments">';
      host.parentNode.insertBefore(fb, host.nextSibling);
      var n = current.trial;
      function saved() { var s = $('studySaved'); if (s) { s.hidden = false; } refresh(); }
      fb.querySelectorAll('input[name=studyUse]').forEach(function (r) { r.onchange = function () { log.update(n, { usefulness: r.value }); saved(); }; });
      $('studyComment').onchange = function () { log.update(n, { comment: this.value }); saved(); };
      refresh();
    });
    refresh();
  }
  if (wantsStudy()) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
