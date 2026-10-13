/* Evidence level and "What is inside" panel of the "Ask the docs" mode (logic only; the page's embeddings need a network).
 *   node tests/evidence.test.js
 * The functions are cut out of index.html and run against the page's own COVERAGE_DATA, with stubbed passages. */
'use strict';
const fs = require('fs');
const path = require('path');
const h = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').split('\r\n').join('\n');

function grabConst(name) {
  const k = h.indexOf('const ' + name + ' = ') + ('const ' + name + ' = ').length;
  let d = 0, e = k;
  for (; e < h.length; e++) { const c = h[e]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { e++; break; } } }
  return JSON.parse(h.slice(k, e));
}
const COVERAGE_DATA = grabConst('COVERAGE_DATA');

const i0 = h.indexOf('const COMPLEMENT = [');
const i1 = h.indexOf('function renderEvidence');
const src = h.slice(i0, i1);
const fn = new Function('COVERAGE_DATA', 'SRC', 'GROWTH_THRESHOLD', 'esc', '$', src + '; return {complementFor, topicNature, evidenceLevel, COMPLEMENT};')(
  COVERAGE_DATA, { docs: true, community: true, signatures: true }, 0.35, s => String(s), () => null);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };
const R = (c, s) => ({ c, s });
const com = (model, cat, name, s) => R({ type: 'community', model, cat, category: name, text: 'x' }, s);
const pdf = s => R({ type: 'pdf', text: 'x' }, s);
const sig = s => R({ type: 'signature', text: 'x' }, s);

// every category of the page maps to some complementary document
let unmapped = [];
Object.values(COVERAGE_DATA).forEach(f => f.categories.forEach(c => { if (!fn.COMPLEMENT.some(m => m.re.test(c.name))) unmapped.push(c.name); }));
ok(unmapped.length === 0, 'categories without a complement: ' + unmapped.join(' | '));
ok(fn.complementFor('Calibration & Sensitivity Analysis').some(d => /Moriasi/.test(d)), 'calibration is complemented by Moriasi');

// calibration topic = judgement, whatever the similarity
const calib = com('swat2012', 'CAT-04', 'Calibration & Sensitivity Analysis', 0.62);
let e = fn.evidenceLevel('How many parameters should I calibrate?', [pdf(0.6), calib], [calib], false);
ok(e.level === 'judg' && e.show, 'calibration topic is a judgement question');
// runtime crash with a signature and a manual passage = high
const crash = com('swat2012', 'CAT-03', 'Runtime Errors & Crashes', 0.55);
e = fn.evidenceLevel('forrtl 24 end of file', [sig(0.7), pdf(0.6), crash], [crash], false);
ok(e.level === 'high' && !e.show, 'two strong sources on a concrete topic = high');
// one strong source = medium
e = fn.evidenceLevel('what is esco', [pdf(0.6)], [com('swat2012', 'CAT-03', 'Runtime Errors & Crashes', 0.2)], false);
ok(e.level === 'med', 'one strong source = medium');
// weak match = low, and the answer carries the alternatives
e = fn.evidenceLevel('something vague', [pdf(0.4)], [com('swat2012', 'CAT-03', 'Runtime Errors & Crashes', 0.2)], false);
ok(e.level === 'low' && e.show, 'weak match = low');
// nothing close
e = fn.evidenceLevel('zzz', [pdf(0.1)], [com('swat2012', 'CAT-03', 'Runtime Errors & Crashes', 0.1)], false);
ok(e.level === 'none', 'nothing close = not covered');
// frontier wording wins over a strong match
e = fn.evidenceLevel('how to set the boundary conditions', [pdf(0.7), sig(0.7)], [], true);
ok(e.level === 'judg', 'frontier wording = judgement');
ok(e.reasons.some(r => /not|Best similarity/.test(r)) && e.reasons[e.reasons.length - 1].includes('Best similarity'), 'reasons end with the similarity values');

console.log(pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
