/* Precision audit: run the page's rules on real model folders and see what they say about models that DID run.
 *
 *   node tests/audit_fp.js            (prints a table; writes tests/audit_result.json)
 *
 * A finding on a model that ran to completion is a false positive candidate, because the model demonstrably worked.
 * "Ran" is decided without the tool: SWAT+ writes success.fin ("Execution successfully completed"); the published
 * and reference models (Park, Bailey, tutorials) are treated as working. Folders with no marker are reported apart. */
'use strict';
const fs = require('fs');
const path = require('path');
const { runRules, loadFolderFull, HDA } = require('./rules_harness');

const cfg = require('../bench/config');   // audit_targets: see bench/hydra_bench.config.example.json

const targets = cfg.auditTargets();

/* outputs are never inputs: do not read them (they can be hundreds of MB) */
const isOutput = (f, size) => size > 1024 * 1024 && /(_day|_mon|_yr|_aa)\.(txt|csv)$|\.out$|\.cbc$|\.hds$|\.hed$/i.test(f) && !/^diagnostics\.out$/i.test(f);

const rows = [];
let n = 0;
for (const t of targets) {
  n++;
  let full;
  try { full = loadFolderFull(t.dir, 40 * 1024 * 1024, isOutput); } catch (e) { continue; }
  const ch = HDA.characterize(full.entries);
  const sys = ch.systems[0];
  const fw = HDA.ruleKeyFor(sys);
  if (!fw) continue;
  const hasSuccess = full.filenames.some(f => f.toLowerCase() === 'success.fin');
  const status = t.status || (hasSuccess ? 'ran-ok' : 'no-success-marker');
  const res = runRules(full.files, fw, full.filenames);
  rows.push({ dir: path.basename(t.dir.replace(/\/Scenarios.*$/, '')) + (t.dir.includes('Scenarios') ? '' : ''), set: t.set, status, fw, coupling: sys.coupling,
    findings: res.map(f => ({ sev: f.sev, title: String(f.title).replace(/ in [^ ]+\.(mfn|nam|dis)$/i, ' in <file>'), where: f.where || '' })) });
  if (n % 20 === 0) process.stderr.write('.. ' + n + '/' + targets.length + '\n');
}

const working = r => r.status !== 'no-success-marker';
const W = rows.filter(working), U = rows.filter(r => !working(r));
const groups = {};
for (const r of rows) {
  const seen = new Set();
  for (const f of r.findings) {
    const k = f.sev.toUpperCase() + ' | ' + f.title;
    if (seen.has(k)) continue; seen.add(k);
    groups[k] = groups[k] || { work: 0, un: 0, ex: [] };
    if (working(r)) { groups[k].work++; if (groups[k].ex.length < 3) groups[k].ex.push(r.dir); } else groups[k].un++;
  }
}
console.log('Audited ' + rows.length + ' folders: ' + W.length + ' that ran/are published, ' + U.length + ' with no success marker\n');
console.log('Finding'.padEnd(78) + ' on working   on no-marker');
Object.keys(groups).sort((a, b) => groups[b].work - groups[a].work).forEach(k => {
  console.log(k.slice(0, 76).padEnd(78) + String(groups[k].work).padStart(4) + '/' + String(W.length).padEnd(8) + String(groups[k].un).padStart(4) + '/' + U.length);
});
const clean = W.filter(r => r.findings.length === 0).length;
console.log('\nWorking models with ZERO findings: ' + clean + '/' + W.length);
console.log('Working models with at least one ERROR: ' + W.filter(r => r.findings.some(f => f.sev === 'error')).length + '/' + W.length);
fs.writeFileSync(path.join(__dirname, 'audit_result.json'), JSON.stringify(rows, null, 1));
