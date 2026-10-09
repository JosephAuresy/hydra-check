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


const stats = {}; // file -> {models, bad_models, rows, bad_rows, ex}
let done = 0;
for (const t of targets) {
  let names;
  try { names = fs.readdirSync(t.dir); } catch (e) { continue; }
  if (!names.includes('file.cio') || !names.some(n => /^hru-data\.hru$/i.test(n))) continue; // SWAT+ only
  const hasSuccess = names.some(n => n.toLowerCase() === 'success.fin');
  if (!(hasSuccess || t.status)) continue; // working models only
  done++;
  for (const n of names) {
    const low = n.toLowerCase();
    if (!/\.(hru|hyd|sol|fld|sno|aqu|cha|res|lum|ini|plt|cal|sdc|lte|str|ops|dtl|cnt|con|sim|cli|bsn|prt|dat|wet|exc|rec|ele|def|pst|sft|slt|out|org|ops|tes|hmd|pcp|slr|tmp|wnd|sta|wgn|cs|sed|fert|pest|till|urb|mgt|cos|ini|cha|rte|hlt|dp|pth|fp|sdr|hum|dpt|cf|ls|aa)$/.test(low) && !low.endsWith('.txt')) continue;
    if (/(_day|_mon|_yr|_aa)\./.test(low) || /^(diagnostics|success|fin|file\.cio)/.test(low) || /\.(out|cbc|hds)$/.test(low)) continue;
    const p = path.join(t.dir, n);
    let st; try { st = fs.statSync(p); } catch (e) { continue; }
    if (!st.isFile() || st.size > 8 * 1024 * 1024 || st.size === 0) continue;
    const lines = fs.readFileSync(p, 'latin1').split(/\r?\n/);
    if (lines.length < 4) continue;
    const hdr = lines[1].trim().split(/\s+/);
    if (hdr.length < 3 || /^[-\d.]+$/.test(hdr[0]) || !/[A-Za-z_]/.test(hdr[1])) continue; // line 2 must be a header of names
    let rowsN = 0, bad = 0;
    for (let i = 2; i < lines.length; i++) {
      const l = lines[i].trim(); if (!l) continue;
      rowsN++;
      if (l.split(/\s+/).length !== hdr.length) bad++;
    }
    const k = low;
    const s = stats[k] = stats[k] || { models: 0, bad_models: 0, rows: 0, bad_rows: 0, hdr: hdr.length, ex: [] };
    s.models++; s.rows += rowsN; s.bad_rows += bad;
    if (bad > 0) { s.bad_models++; if (s.ex.length < 2) s.ex.push(path.basename(t.dir.replace(/\/Scenarios.*$/, '')) + ' (' + bad + '/' + rowsN + ')'); }
  }
}
console.log('working SWAT+ models scanned:', done);
Object.keys(stats).sort((a, b) => stats[b].models - stats[a].models).forEach(k => {
  const s = stats[k];
  console.log(k.padEnd(28), 'models', String(s.models).padStart(3), ' with bad rows', String(s.bad_models).padStart(3), ' rows', String(s.rows).padStart(7), ' bad', String(s.bad_rows).padStart(6), s.ex.join('; '));
});
