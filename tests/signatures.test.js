/* Error-message signatures of the "Paste an error message" mode (and the known-error passages of "Ask the docs").
 *   node tests/signatures.test.js
 * Each case is a real message (taken from a forum thread or printed by an engine in the benchmark) and the signature it must trigger;
 * the negative cases are texts that matched a signature by accident before it was tightened. */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('const SIGNATURES = [');
const b = html.indexOf('\n];', a) + 3;
const SIGNATURES = eval('(function(){ const ATTR = new Proxy({}, {get: () => "x"}); ' + html.slice(a, b).replace('const SIGNATURES =', 'return ') + ' })()');

const match = txt => SIGNATURES.filter(s => s.re.test(txt)).map(s => s.title);
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('FAIL', name); } }
function expect(txt, titlePart, name) { const m = match(txt); ok(m.some(t => t.includes(titlePart)), name + '  (got: ' + JSON.stringify(m) + ')'); }
function expectNot(txt, titlePart, name) { const m = match(txt); ok(!m.some(t => t.includes(titlePart)), name + '  (got: ' + JSON.stringify(m) + ')'); }

expect('ERROR REPORT: 1. Could not open "gwf_solver.ims" on unit 1026. Specified file status OLD.', 'cannot be opened', 'MF6 file cannot be opened');
expect('*** ERROR OPENING FILE "MODFLOW\\mf_1000.upw" ON UNIT  5134', 'cannot be opened', 'NWT error opening file');
expect('ERROR: Required block "DIMENSIONS" not found. Found block "GRIDDATA" instead.', 'required block', 'MF6 required block');
expect('ERROR REPORT: 1. Input file tag not found: "SAVE_FLOW" in block "OPTIONS".', 'not recognized', 'MF6 unknown keyword');
expect('Unknown MST option: SORPTION', 'not recognized', 'MF6 unknown option');
expect('ERROR REPORT: 1. Model does not have any active nodes. Ensure IDOMAIN array has some values greater than zero.', 'no active cell', 'MF6 no active nodes');
expect('1. Cell is already a constant head ((1,1,5)).', 'constant head', 'MF6 duplicate CHD');
expect('ERROR REPORT: 1. Could not find flow package with name UZF-2.', 'flow package', 'MF6 flow package name');
expect('Model package type not supported [model=GWF, type=CHDD6].', 'package type', 'MF6 package type');
expect('ERROR READING ARRAY CONTROL RECORD FOR TOP ELEVATION OF LAYER 1', 'array header', 'array control record');
expect('forrtl: severe (59): list-directed I/O syntax error, unit 113', 'array header', 'list-directed syntax error');
expect('forrtl: severe (257): formatted I/O to unit open for unformatted transfers', 'binary', 'formatted vs unformatted');
expect('FERT NO =           99  NOT IN FERT LIST FILE     SAID =            4', 'not in its list file', 'APEX fertilizer not in list');
expect('WPM1 NO =          999  NOT IN MO WEATHER LIST FILE', 'not in its list file', 'APEX weather not in list');
expect('File A48309.DLY IS MISSING.', 'file named in the run files', 'APEX file missing');
expect('forrtl: severe (408): fort: (3): Subscript #1 of the array NISA has value -842150451 which is less than the lower bound of 1', 'subscript', 'subscript out of range');
expect('forrtl: severe (24): end-of-file during read, unit 12, file D:\\calibration\\txtinout\\PARMS.DAT', 'control or parameter file', 'APEX PARMS.DAT end of file');
expect('forrtl: severe (24): end-of-file during read, unit 12, file D:\\calibration\\txtinout\\PARMS.DAT', 'End-of-file', 'generic end of file still matches');

/* former false matches */
expectNot('WDLSTCOM.DAT\n FPSOD    PSOCOM.DAT\n FRFDT    RFDTLST.DAT\n File A48309.DLY IS MISSING.', 'Decision-table', 'RFDTLST.DAT is not a decision table');
expectNot('Nandini wrote that the finance numbers look fine', 'NaN', 'the letters nan inside a word are not NaN');
expect('gwflow: aquifer head returned NaN at cell 1043', 'NaN', 'NaN still matches');
expect('lum.dtl: decision table does not fire', 'Decision-table', 'decision table still matches');


/* the single box: a text is matched against the signatures only when it reads like an error */
const e0 = html.indexOf('const ERRORISH = ');
const ERRORISH = eval(html.slice(e0 + 'const ERRORISH = '.length, html.indexOf(';', html.indexOf('/i', e0))));
const hitsFor = txt => ERRORISH.test(txt) ? SIGNATURES.filter(s => s.re.test(txt)).map(s => s.title) : [];
ok(hitsFor('How do I set the projection of my DEM?').length === 0, 'an ordinary question about projections is not a known error');
ok(hitsFor('What is the coordinate system used by SWAT+?').length === 0, 'an ordinary question about coordinates is not a known error');
ok(hitsFor('forrtl: severe (24): end-of-file during read, unit 30020').length > 0, 'a pasted forrtl error is matched');
ok(hitsFor('File A48309.DLY IS MISSING.').some(t => t.includes('file named')), 'APEX missing file is matched through the guard');
const g0 = html.indexOf('const EXAMPLE_ERRORS = [');
const EXAMPLE_ERRORS = eval(html.slice(g0 + 'const EXAMPLE_ERRORS = '.length, html.indexOf('\n];', g0) + 3));
EXAMPLE_ERRORS.forEach(x => ok(hitsFor(x.text).length > 0, 'gallery example "' + x.title + '" is matched by some known error'));

console.log(pass + '/' + (pass + fail) + ' passed' + ' (' + SIGNATURES.length + ' signatures)');
process.exit(fail ? 1 : 0);
