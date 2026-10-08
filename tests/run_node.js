/* Headless test runner:  node tests/run_node.js
 * Loads the same modules and test data the browser page uses, runs every case, exits 1 on any failure.
 * Real-sample cases need tests/fixtures.js (generate it with: python tests/make_fixtures.py). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const here = __dirname;
const ctx = vm.createContext({ console });
ctx.window = ctx;

function load(rel, optional) {
  const p = path.join(here, rel);
  if (!fs.existsSync(p)) {
    if (optional) return false;
    throw new Error('missing file: ' + p);
  }
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: p });
  return true;
}

load('../src/characterize.js');
load('../src/char_ui.js');
const haveFixtures = load('fixtures.js', true);
load('synthetic.js');
load('cases.js');

const fx = ctx.HDA_FIXTURES || {};
const syn = ctx.HDA_SYNTHETIC || {};
const results = [];
let skipped = 0;
for (const c of ctx.HDA_CASES) {
  const entries = c.entries ? c.entries() : (fx[c.fixture] ? fx[c.fixture].entries : (syn[c.fixture] || null));
  if (!entries) { skipped++; results.push({ name: c.name, real: c.real, ok: null, fails: ['fixture not available: ' + c.fixture] }); continue; }
  const fails = [];
  try { c.check(ctx.HDA.characterize(entries), fails); } catch (e) { fails.push('exception: ' + e.message); }
  results.push({ name: c.name, real: c.real, ok: fails.length === 0, fails });
}

let bad = 0;
for (const r of results) {
  const tag = r.ok === null ? 'SKIP' : (r.ok ? 'PASS' : 'FAIL');
  if (r.ok === false) bad++;
  console.log(tag + ' ' + (r.real ? '[real] ' : '[spec] ') + r.name + (r.ok ? '' : ' :: ' + r.fails.join(' | ')));
}
const ran = results.filter(r => r.ok !== null);
const real = ran.filter(r => r.real);
console.log('\n' + (ran.length - bad) + '/' + ran.length + ' passed (' + real.filter(r => r.ok).length + '/' + real.length + ' real-sample, ' +
  ran.filter(r => !r.real && r.ok).length + '/' + ran.filter(r => !r.real).length + ' spec)' +
  (skipped ? ', ' + skipped + ' skipped' + (haveFixtures ? '' : ' (no fixtures.js)') : ''));
process.exit(bad ? 1 : 0);
