/* Regression tests for the SWAT+ table-rows rule (rows with a different number of fields than the header):  node tests/rule_tablerows.test.js */
'use strict';
const { runRules } = require('./rules_harness');
const NL = '\n';
const HDR = '      id  name                          topo             hydro              soil            lu_mgt   soil_plant_init         surf_stor              snow             field';
const row = (i, last) => '       ' + i + '  hru0000' + i + '              topohru0000' + i + '          hyd0000' + i + '             S2430          agrl_lum        soilplant1              null           snow001' + (last === false ? '' : '             null');
const hru = (n, last) => ['hru-data.hru: written by SWAT+ editor v3.1.4 for SWAT+ rev.61.0.2', HDR].concat(Array.from({ length: n }, (_, i) => row(i + 1, last))).join(NL) + NL;
const run = f => runRules(f, 'swat_plus', Object.keys(f)).filter(x => /different number of fields/.test(x.title));
const cases = [
  ['hru-data.hru rows lose the last field -> ERROR', () => { const r = run({ 'hru-data.hru': hru(6, false) }); return r.length === 1 && r[0].sev === 'error' && /6 of 6 rows/.test(r[0].where); }],
  ['complete rows -> no finding', () => run({ 'hru-data.hru': hru(6) }).length === 0],
  ['only one short row is reported with its line', () => { const t = hru(5).split(NL); t[4] = row(3, false); const r = run({ 'hru-data.hru': t.join(NL) }); return r.length === 1 && /1 of 5 rows \(line 5/.test(r[0].where); }],
  ['a file whose line 2 is not a header of names is skipped', () => run({ 'hru-data.hru': ['x', '1 2 3', '1 2', '1 2', '1'].join(NL) }).length === 0],
  ['other whitelisted file gives a warning, not an error', () => { const f = { 'topography.hyd': ['topography.hyd: t', 'name slp slp_len lat_len dist_cha depos', 'a 0.1 50 90 0 0', 'b 0.1 50 90 0'].join(NL) }; const r = run(f); return r.length === 1 && r[0].sev === 'warning'; }],
  ['a file that is not on the list is never checked', () => run({ 'soils.sol': ['soils.sol: t', 'name nly hyd_grp', 'a 1', 'b 1 2 3 4'].join(NL) }).length === 0],
];
let bad = 0;
cases.forEach(([n, f]) => { let ok = false; try { ok = f(); } catch (e) { n += ' (threw ' + e.message + ')'; } console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) bad++; });
console.log('\n' + (cases.length - bad) + '/' + cases.length + ' passed');
process.exit(bad ? 1 : 0);
