/* Tests for the structured advice (src/advice.js):  node tests/advice_fields.test.js
 *
 *  1. every rule that can fire carries plain, steps and evidence on its finding (triggered with small fixtures, as the other rule tests do)
 *  2. every message of the characterization has advice; nothing can be added to rules or characterization without advice (source tripwires)
 *  3. no advice text mentions the tools that wrote it; evidence is one of the allowed kinds
 *  4. every 'measured here' evidence names a pilot case that exists in results/pilot_table.md (or the precision audit), and every
 *     "what the engine said" line agrees with that case (engine, exit code, number of results changed, largest change) */
'use strict';
const fs = require('fs');
const path = require('path');
const { runRules, ctx, HDA } = require('./rules_harness');

const NL = '\n';
let bad = 0, n = 0;
const check = (name, ok, extra) => { n++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : '\n      ' + extra)); };

const { TRIGGER, CHAR_UPLOADS } = require('./advice_triggers');

/* ─────────────── 1. every rule that can fire carries the fields ─────────────── */
const seen = new Set();
const needed = ['plain', 'steps', 'why', 'verify'];
for (const adv of HDA.ADVICE) {
  const t = TRIGGER[adv.id];
  if (!t) { check(`${adv.id}: has a trigger fixture in this test`, false, 'add one to TRIGGER'); continue; }
  const res = runRules(t[1], t[0], t[2] || Object.keys(t[1]));
  const f = res.find(x => x.id === adv.id);
  const crashed = res.find(x => /^RULE CRASHED/.test(x.title));
  check(`${adv.id}: the rule fires on its fixture and its finding carries the advice`, !!f && !crashed, crashed ? crashed.title : 'got ' + JSON.stringify(res.map(x => x.title)));
  if (!f) continue;
  seen.add(adv.id);
  const missing = needed.filter(k => !(f[k] && (k !== 'steps' || f.steps.length)));
  check(`${adv.id}: plain, steps, why, verify and evidence are all set`, missing.length === 0 && f.evidence && f.evidence.kind && f.evidence.ref, 'missing ' + missing.join());
  check(`${adv.id}: the finding still has its own title, detail and fix`, f.title && typeof f.detail === 'string' && f.detail.length > 20 && typeof f.fix === 'string');
}
for (const id of Object.keys(TRIGGER)) check(`trigger ${id} belongs to an advice entry`, HDA.ADVICE.some(a => a.id === id));
check('no two advice entries share an id', new Set(HDA.ADVICE.concat(HDA.CHAR_ADVICE).map(a => a.id)).size === HDA.ADVICE.length + HDA.CHAR_ADVICE.length);
check('every advice entry was reached by a finding', HDA.ADVICE.every(a => seen.has(a.id)));

/* ─────────────── 2. tripwires: a new finding or message cannot be added without advice ─────────────── */
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const sites = (html.match(/out\.push\(finding\(/g) || []).length;
check(`index.html has ${sites} out.push(finding( call sites; advice has ${HDA.ADVICE.length} entries (add advice with every new finding)`, sites === HDA.ADVICE.length);
const charSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'characterize.js'), 'utf8');
const pushes = (charSrc.match(/sys\.(missing|ambiguity|notes|problems)\.push/g) || []).length;
check(`characterize.js has ${pushes} message sites; advice has ${HDA.CHAR_ADVICE.length} entries (add advice with every new message)`, pushes === HDA.CHAR_ADVICE.length);

/* characterization: build uploads that produce the messages and check each one is matched */
const KINDS = ['problems', 'missing', 'ambiguity', 'notes'];
const produced = {};      /* advice id -> true when a message was matched to it */
let unmatched = [];
for (const [id, entries] of Object.entries(CHAR_UPLOADS)) {
  const r = HDA.characterize(entries);
  let hit = false;
  r.systems.forEach(s => KINDS.forEach(k => (s[k] || []).forEach(m => {
    const text = typeof m === 'string' ? m : m.title;
    const a = HDA.charAdviceFor(k, text);
    if (!a) unmatched.push(k + ': ' + text.slice(0, 90)); else { produced[a.id] = true; if (a.id === id) hit = true; }
  })));
  check(`${id}: an upload produces this message and the advice is attached to it`, hit);
}
check('every message the test uploads produce has advice', unmatched.length === 0, unmatched.join(' | '));
for (const a of HDA.CHAR_ADVICE) {
  if (a.unreachable) { check(`${a.id}: marked unreachable (its condition cannot be met today), so no upload is built for it`, !CHAR_UPLOADS[a.id]); continue; }
  check(`${a.id}: reached by a characterization upload`, !!produced[a.id]);
  check(`${a.id}: the sample message matches its own entry`, HDA.charAdviceFor(a.kind, a.sample) === a);
}
/* the MF6SWATP problem (source-defined) comes through as a problem object */
{
  const r = HDA.characterize(CHAR_UPLOADS['char.mf6swatp_gwflow']);
  const p = r.systems[0].problems[0];
  check('problems: the MF6SWATP + gwflow problem carries advice with evidence from the engine source', !!p && !!HDA.charAdviceFor('problems', p.title) && HDA.charAdviceFor('problems', p.title).evidence.kind === 'read in the engine source');
  const html1 = HDA.renderCharacterization(r, 0);
  check('rendering: the characterization panel has the Plain words / Technical switch with aria-pressed', /class="advsw"/.test(html1) && /aria-pressed="true"/.test(html1) && /data-advview="tech"/.test(html1));
  check('rendering: the original message text is still in the page (technical view)', html1.indexOf(p.detail.slice(0, 40)) >= 0);
}

/* ─────────────── 3. wording and evidence kinds ─────────────── */
const ALL = HDA.ADVICE.concat(HDA.CHAR_ADVICE);
const fieldsOf = a => [a.plain, a.why, a.verify, a.evidence && a.evidence.ref].concat(a.steps || [], (Array.isArray(a.engine) ? a.engine : a.engine ? [a.engine] : []).map(e => e.said));
const BANNED = new RegExp(['cl' + 'aude', 'anthr' + 'opic'].join('|'), 'i');   /* the names of the tools that wrote the code; they must not appear in anything the page shows */
check('no advice text names the tool that wrote it', !ALL.some(a => BANNED.test(JSON.stringify(a, (k, v) => v instanceof RegExp ? undefined : v))));
check('no rendered advice names the tool that wrote it', !ALL.some(a => BANNED.test(HDA.advicePlainHTML(a) + HDA.adviceTechHTML(a) + HDA.adviceEngineHTML(a) + HDA.adviceChipHTML(a))));
check('every evidence value is one of the allowed kinds', ALL.every(a => a.evidence && HDA.EVIDENCE_KINDS.indexOf(a.evidence.kind) >= 0), ALL.filter(a => !a.evidence || HDA.EVIDENCE_KINDS.indexOf(a.evidence.kind) < 0).map(a => a.id).join());
check('every evidence has a pointer (ref)', ALL.every(a => typeof a.evidence.ref === 'string' && a.evidence.ref.length > 10));
check('every entry has 2-5 steps, a plain text of at most 3 sentences, and no empty field', ALL.every(a => a.steps.length >= 2 && a.steps.length <= 5 && a.plain.split(/(?<=[.!?])\s+/).length <= 3 && fieldsOf(a).every(x => typeof x === 'string' && x.trim())),
  ALL.filter(a => !(a.steps.length >= 2 && a.steps.length <= 5 && a.plain.split(/(?<=[.!?])\s+/).length <= 3)).map(a => a.id).join());
check('weakly evidenced advice says so (community-reported entries state that it was not reproduced / not tested)', ALL.filter(a => a.evidence.kind === 'community-reported').every(a => /not reproduced|not tested|heuristic|design choice/i.test(a.evidence.ref)),
  ALL.filter(a => a.evidence.kind === 'community-reported' && !/not reproduced|not tested|heuristic|design choice/i.test(a.evidence.ref)).map(a => a.id).join());

/* ─────────────── 4. pilot cases ─────────────── */
const pilotMd = fs.readFileSync(path.join(__dirname, '..', 'results', 'pilot_table.md'), 'utf8').split(/\r?\n/);
const PILOT = {};
pilotMd.forEach(l => { const c = l.split('|').map(x => x.trim()); if (/^\d+$/.test(c[1])) PILOT[+c[1]] = { model: c[2], fault: c[3], engine: c[4], tool: c[5] }; });
check('the pilot table was read (22 cases)', Object.keys(PILOT).length === 22);
const MEASURED = ALL.filter(a => a.evidence.kind === 'measured here');
check('every "measured here" evidence names a pilot case that exists in results/pilot_table.md, or the precision audit',
  MEASURED.every(a => { const m = a.evidence.ref.match(/pilot cases? #\d+/g); return (m && (a.evidence.ref.match(/#(\d+)/g) || []).every(x => PILOT[+x.slice(1)])) || /precision audit/i.test(a.evidence.ref); }),
  MEASURED.filter(a => !/pilot case/.test(a.evidence.ref)).map(a => a.id).join());
const engines = [];
ALL.forEach(a => (Array.isArray(a.engine) ? a.engine : a.engine ? [a.engine] : []).forEach(e => engines.push([a, e])));
check(`${engines.length} engine lines: each points at an existing pilot case`, engines.every(([a, e]) => PILOT[e.pilot]));
const modelOK = (name, model) => name === model;
check('each engine line is about the engine of that pilot case (SWAT+, SWAT2012, SWAT-MODFLOW, MODFLOW 6, APEX, APEX-MODFLOW)', engines.every(([a, e]) => PILOT[e.pilot] && modelOK(e.name, PILOT[e.pilot].model)),
  engines.filter(([a, e]) => PILOT[e.pilot] && !modelOK(e.name, PILOT[e.pilot].model)).map(([a, e]) => a.id + ' says ' + e.name + ', case ' + e.pilot + ' is ' + PILOT[e.pilot].model).join('; '));
check('each engine line repeats the numbers of its pilot case (results changed, largest change, exit code)', engines.every(([a, e]) => {
  const row = PILOT[e.pilot].engine;
  const ch = e.said.match(/(\d+) results changed/), exit = e.said.match(/exit code (\d+)/), big = e.said.match(/([\d.,]+)%\)/);
  if (ch && !new RegExp(ch[1] + ' results changed').test(row)) return false;
  if (exit && !new RegExp('exit ' + exit[1]).test(row)) return false;
  if (big) { const m = row.match(/largest change ([\d.e+]+)%/); if (!m || Math.abs(Number(m[1]) - Number(big[1].replace(/,/g, ''))) > Math.max(1, Number(m[1]) * 0.01)) return false; }
  return true;
}), engines.map(([a, e]) => a.id + ': ' + e.said + ' <> ' + PILOT[e.pilot].engine).join('\n      '));
check('the benchmark cases the rules were built from all have advice with an engine line (pilot cases 2-19 where a rule or message exists)',
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].every(c => engines.some(([a, e]) => e.pilot === c)),
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].filter(c => !engines.some(([a, e]) => e.pilot === c)).join());

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
