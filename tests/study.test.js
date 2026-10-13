/* Optional feedback mode (?study=1):  node tests/study.test.js
 * Checks the log, the single list of fields that may leave it, the CSV, the consent gate of the remote exporter,
 * and that the page carries no study elements of its own. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'study.js'), 'utf8');
const ctx = vm.createContext({ console, URLSearchParams });
ctx.window = ctx;
vm.runInContext(src, ctx, { filename: 'study.js' });
const S = ctx.HDAStudy;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('FAIL', name); } }
const memStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; };

ok(S && typeof S.createLog === 'function', 'module loads without a document and does not mount anything');

/* log */
const store = memStore();
const log = S.createLog({ store, cohort: 'AGU Poster!' });
ok(/^P-[0-9A-F]{6}$/.test(log.participant_id), 'participant id is random, no personal part');
ok(log.cohort === 'aguposter', 'cohort label is reduced to safe characters');
const t1 = log.addAnswer({ query: 'forrtl: severe (24): end-of-file in D:\\Users\\jane\\model\\PARMS.DAT, mail jane@ttu.edu', kind: 'known-error', knownError: 'End-of-file', evidenceLevel: 'high', taskId: 'T07' });
ok(t1.trial === 1 && t1.usefulness === null && t1.outcome === null && t1.user_answer === null, 'a new record starts unrated');
ok(!/jane|D:\\/.test(t1._query_text) && /\[path\]/.test(t1._query_text) && /\[email\]/.test(t1._query_text), 'paths and e-mail addresses are redacted in the kept text');
log.update(1, { usefulness: 'somewhat', comment: 'Fine, call me at jane@ttu.edu or see C:\\work\\x.txt' });
ok(log.trials[0].usefulness === 'somewhat', 'usefulness is stored');
ok(!/jane|C:\\work/.test(log.trials[0].comment), 'comment is redacted');
log.update(1, { usefulness: 'maybe' });
ok(log.trials[0].usefulness === null, 'an unknown usefulness value is refused');
log.update(1, { comment: 'x'.repeat(900) });
ok(log.trials[0].comment.length === 500, 'comment is clipped to 500 characters');
const t2 = log.addAnswer({ query: 'what NSE is acceptable?', kind: 'search', evidenceLevel: 'judg' });
ok(t2.trial === 2 && t2.answer_kind === 'search' && t2.known_error === null, 'second record, search kind');
ok(t1.query_id === S.hash('FORRTL: severe (24): end-of-file in D:\\Users\\jane\\model\\PARMS.DAT, mail jane@ttu.edu  '.trim()), 'the question label ignores case and spacing');

/* survives a reload of the tab (same store) */
const log2 = S.createLog({ store });
ok(log2.participant_id === log.participant_id && log2.trials.length === 2, 'the log is restored from the tab storage with the same id');

/* what may leave */
const p0 = S.toExportPayload(log, { given: true, includeText: false });
const TRIAL_KEYS = ['trial', 'timestamp', 'task_id', 'query_id', 'query_chars', 'answer_kind', 'known_error', 'evidence_level', 'usefulness', 'comment', 'user_answer', 'outcome'].sort();
ok(p0.trials.every(t => JSON.stringify(Object.keys(t).sort()) === JSON.stringify(TRIAL_KEYS)), 'a record carries exactly the allowed fields');
ok(!/_query_text|query_text/.test(JSON.stringify(p0)) && p0.question_text_included === false, 'question text is absent unless the participant opts in');
const p1 = S.toExportPayload(log, { given: true, includeText: true });
ok(p1.question_text_included === true && p1.trials[0].query_text && !/jane/.test(p1.trials[0].query_text), 'with the opt-in the redacted text is included');
ok(!/_query_text/.test(JSON.stringify(p1)), 'the internal field name never leaves');
ok(p0.schema_version === 1 && p0.check_version === S.CHECK_VERSION && p0.participant_id === log.participant_id, 'payload carries version, schema and id');
ok(/^\d{4}-\d\d-\d\dT/.test(p0.trials[0].timestamp), 'timestamp is ISO');
ok(!('files' in p0) && !('path' in p0), 'no file fields exist in the payload');

/* csv */
const csv = S.toCsv(S.toExportPayload(log, { given: true, includeText: true }));
const lines = csv.trim().split('\r\n');
ok(lines.length === 3 && lines[0].startsWith('participant_id,check_version,cohort,trial,timestamp'), 'csv has a header and one row per answer');
ok(lines[1].includes(log.participant_id) && lines[1].includes('T07') && lines[1].includes('known-error'), 'csv row has the id, task and kind');
const gl = S.createLog({ store: memStore() });
gl.addAnswer({ query: 'q', kind: 'search', evidenceLevel: 'low' }); gl.update(1, { comment: '=HYPERLINK("http://x","y"), more' });
const gcsv = S.toCsv(S.toExportPayload(gl, {}));
ok(/"'=HYPERLINK\(""http:\/\/x"",""y""\), more"/.test(gcsv), 'a cell that starts like a formula is neutralized and quotes are escaped');

/* remote exporter: consent and endpoint gate */
let sent = null;
ctx.fetch = (url, opt) => { sent = { url, opt }; return Promise.resolve({}); };
(async () => {
  let err = null;
  try { await S.send(log, { given: false }); } catch (e) { err = e; }
  ok(err && /consent/.test(err.message) && sent === null, 'nothing is sent without consent');
  err = null;
  try { await S.send(log, { given: true }); } catch (e) { err = e; }
  ok(err && /endpoint/.test(err.message) && sent === null, 'nothing is sent while no endpoint is configured');
  ok(S.exporters.http.available() === false && S.exporters.json.remote === false && S.exporters.http.remote === true, 'the remote exporter is unavailable until configured');
  S.configure({ endpoint: 'https://example.org/collect' });
  const r = await S.send(log, { given: true, includeText: false });
  const body = JSON.parse(sent.opt.body);
  ok(r === 'sent' && sent.url === 'https://example.org/collect' && sent.opt.method === 'POST', 'with consent and an endpoint it posts');
  ok(!/query_text/.test(sent.opt.body) && body.trials.length === 2, 'the posted body is the sanitized payload');
  S.configure({ mapper: p => ({ body: 'entry.1=' + encodeURIComponent(JSON.stringify(p)), contentType: 'application/x-www-form-urlencoded' }) });
  await S.send(log, { given: true });
  ok(/^entry\.1=/.test(sent.opt.body) && sent.opt.headers['Content-Type'] === 'application/x-www-form-urlencoded', 'a mapper can reshape the request for another endpoint');
  S.configure({ endpoint: null, mapper: null });

  /* the page itself */
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const a = html.indexOf('/*<<HDA:src:start>>*/'), b = html.indexOf('/*<<HDA:src:end>>*/');
  const outside = html.slice(0, a) + html.slice(b);
  ok(!/study-bar|study-fb|studyConsent|studySend/.test(outside), 'no study element or style exists outside the module that builds it on request');
  ok(html.indexOf("'hda:answer'") > 0 && html.indexOf("'hda:ask'") > 0, 'the page announces the two events');
  ok(/get\('study'\) === '1'/.test(src), 'the mode is switched on only by ?study=1');

  console.log(pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})();
