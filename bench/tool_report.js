/* What would the tool say about this folder?   node bench/tool_report.js <folder>   -> JSON on stdout
 * It sees the folder exactly as a user would drop it (including subfolders), BEFORE any run. */
'use strict';
const { runRules, loadFolderFull, HDA } = require('../tests/rules_harness');

const dir = process.argv[2];
const isOutput = (f, size) => size > 1024 * 1024 && /(_day|_mon|_yr|_aa)\.(txt|csv)$|\.out$|\.cbc$|\.hds$|\.hed$/i.test(f) && !/^diagnostics\.out$/i.test(f);
const full = loadFolderFull(dir, 8 * 1024 * 1024, isOutput, true);
const ch = HDA.characterize(full.entries);
const sys = ch.systems[0];
const fw = HDA.ruleKeyFor(sys);
const findings = fw ? runRules(full.files, fw, full.filenames) : [];
const text = f => [f.title, f.where, f.detail].filter(Boolean).join(' | ').replace(/<[^>]+>/g, '');
console.log(JSON.stringify({
  dir: require('path').basename(dir), nFiles: full.entries.length, identified: ch.identified, label: sys.label, coupling: sys.coupling, confidence: sys.couplingConfidence, ruleSet: fw,
  coverage: fw ? HDA.ruleCoverageText(sys, fw) : 'no rule set',
  findings: findings.map(f => ({ sev: f.sev, title: f.title, text: text(f) })),
  problems: (sys.problems || []).map(p => ({ sev: p.sev, title: p.title, text: p.title + ' | ' + p.detail })),
  ambiguity: sys.ambiguity, missing: sys.missing, notes: sys.notes
}));
