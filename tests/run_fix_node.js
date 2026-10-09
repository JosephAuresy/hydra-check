/* Tests for the "Download fixed file" corrections (cliSorted, periodAlign, low .mfn units):  node tests/run_fix_node.js
 * The page's own rules and fixers are taken verbatim from index.html through tests/rules_harness.js.
 * For each fix: the rule fires on the faulty file, the fixed file makes it silent, a second run changes nothing,
 * CRLF and LF line endings survive, and nothing outside the intended characters changes. */
'use strict';
const { runRules, ctx } = require('./rules_harness');

let bad = 0, n = 0;
const check = (name, ok, extra) => { n++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : '\n      ' + extra)); };
const rule = (files, fw, re) => runRules(files, fw, Object.keys(files)).filter(f => re.test(f.title));
const fix = (name, ...a) => ctx[name](...a);

/* ───────────── 1. station lists ───────────── */
const stations = ['pcp1.pcp', 'pcp10.pcp', 'pcp2.pcp', 'pcp3.pcp', 'pcp4.pcp', 'Z9.pcp', 'a1.pcp'];
for (const [label, nl] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  const faulty = ['pcp.cli: written by test', 'filename'].concat(stations.slice().reverse()).join(nl) + nl;
  const files = { 'pcp.cli': faulty };
  const f = rule(files, 'swat_plus', /Station lists are not sorted/)[0];
  check(`cliSorted ${label}: rule fires and carries a fix`, !!f && f.autofix && f.autofix.files.length === 1 && f.autofix.files[0].name === 'pcp.cli');
  const out = f.autofix.files[0].text;
  const lines = out.split(/\r?\n/);
  check(`cliSorted ${label}: header kept, stations ascending, line endings kept`,
    lines[0] === 'pcp.cli: written by test' && lines[1] === 'filename' && JSON.stringify(lines.slice(2, 9)) === JSON.stringify(stations.slice().sort()) &&
    out.split(nl).length === faulty.split(nl).length && (nl === '\r\n' ? !/[^\r]\n/.test(out) : !/\r/.test(out)) && out.endsWith(nl));
  check(`cliSorted ${label}: same multiset of lines (nothing else changed)`, JSON.stringify(out.split(/\r?\n/).sort()) === JSON.stringify(faulty.split(/\r?\n/).sort()));
  check(`cliSorted ${label}: rule is silent on the fixed file`, rule({ 'pcp.cli': out }, 'swat_plus', /Station lists are not sorted/).length === 0);
  check(`cliSorted ${label}: second run changes nothing`, fix('fixCliSorted', out) === null);
  check(`cliSorted ${label}: summary counts what moved`, /^\d+ station lines reordered \(of 7\)/.test(f.autofix.files[0].summary), f.autofix.files[0].summary);
}
{
  const nl = '\n', sorted = ['t', 'h'].concat(stations.slice().sort()).join(nl);
  check('cliSorted: already sorted -> no finding, no fix', rule({ 'pcp.cli': sorted }, 'swat_plus', /Station lists/).length === 0 && fix('fixCliSorted', sorted) === null);
  const noFinalNl = ['t', 'h', 'b.pcp', 'a.pcp'].join(nl);
  const r = fix('fixCliSorted', noFinalNl);
  check('cliSorted: a missing final newline stays missing', r.text === ['t', 'h', 'a.pcp', 'b.pcp'].join(nl));
  const two = { 'pcp.cli': ['t', 'h', 'b', 'a'].join(nl), 'tmp.cli': ['t', 'h', 'y', 'x'].join(nl), 'slr.cli': ['t', 'h', 'a', 'b'].join(nl) };
  const f2 = rule(two, 'swat_plus', /Station lists/)[0];
  check('cliSorted: two unsorted lists -> two fixes, the sorted one left alone', f2.autofix.files.map(x => x.name).join() === 'pcp.cli,tmp.cli');
  const both = Object.assign({}, two); f2.autofix.files.forEach(x => { both[x.name.toLowerCase()] = x.text; });
  check('cliSorted: rule silent after both are fixed', rule(both, 'swat_plus', /Station lists/).length === 0);
}

/* ───────────── 2. DIS PERLEN ───────────── */
const cio = (nbyr, idaf, idal) => [' General input/output', ' ' + nbyr + ' | NBYR : Number of years simulated', ' 1985 | IYR : Beginning year', ' ' + idaf + ' | IDAF : Beginning julian day', ' ' + idal + ' | IDAL : Ending julian day'].join('\n');
const disText = (nl, nper, itmuni, periods) => ['# MODFLOW DIS', '     1    23    40     ' + nper + '     ' + itmuni + '     2 # NLAY, NROW, NCOL, NPER, ITMUNI, LENUNI', '     0 # LAYCB', 'CONSTANT     1.000000000000E+003  # DELR']
  .concat(periods.map((p, i) => '  ' + p[0] + '  ' + p[1] + '  1.000000000000E+000  ' + (p[2] || 'TR') + ' # PERLEN NSTP TSMULT Ss/tr (Stress period ' + (i + 1) + ')')).join(nl) + nl;
const perlenSum = t => { const d = ctx.disParse(t); return d.total * d.toDays; };
const periodRule = (dis, c) => rule({ 'file.cio': c, 'mf_1000.dis': dis }, 'swat_mf', /MODFLOW time is shorter/);

for (const [label, nl] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  const c = cio(2, 1, 365);                                              /* SWAT period 730 days */
  const faulty = disText(nl, 1, 4, [['1.000000000000E+002', 100]]);
  const f = periodRule(faulty, c)[0];
  check(`periodAlign ${label}: rule fires and carries a fix`, !!f && f.autofix && f.autofix.files.length === 1 && f.autofix.files[0].name === 'mf_1000.dis');
  const out = f.autofix.files[0].text;
  check(`periodAlign ${label}: only the PERLEN token changed (E-format kept)`, out === faulty.replace('1.000000000000E+002  100', '8.300000000000E+002  100') && out !== faulty);
  check(`periodAlign ${label}: total = SWAT period + 100 days`, perlenSum(out) === 830);
  check(`periodAlign ${label}: line endings kept`, nl === '\r\n' ? !/[^\r]\n/.test(out) : !/\r/.test(out));
  check(`periodAlign ${label}: rule silent on the fixed file`, periodRule(out, c).length === 0);
  check(`periodAlign ${label}: second run changes nothing`, fix('fixDisPerlen', out, c) === null);
  check(`periodAlign ${label}: summary`, /^PERLEN 100 -> 830 days; MODFLOW time 100 -> 830 days/.test(f.autofix.files[0].summary), f.autofix.files[0].summary);
}
{
  const c = cio(2, 1, 365), nl = '\n';
  /* multi-period: extend the LAST period only */
  const multi = disText(nl, 3, 4, [[' 10', 10], [' 20', 20], ['100', 100]]);
  const r = fix('fixDisPerlen', multi, c);
  check('periodAlign: multi-period extends the last period only', !!r && ctx.disParse(r.text).periods.map(p => p.perlen).join() === '10,20,800' && perlenSum(r.text) === 830, r && r.summary);
  check('periodAlign: multi-period summary names the period count', /in the last of 3 stress periods/.test(r.summary), r.summary);
  check('periodAlign: multi-period rule silent after', periodRule(r.text, c).length === 0 && fix('fixDisPerlen', r.text, c) === null);
  /* plain decimal / integer tokens keep their style */
  const dec = fix('fixDisPerlen', disText(nl, 1, 4, [['100.0', 100]]), c);
  check('periodAlign: "100.0" -> "830.0"', !!dec && /^ {2}830\.0 {2}100/m.test(dec.text), dec && dec.text.split(nl)[4]);
  const int = fix('fixDisPerlen', disText(nl, 1, 4, [['100', 100]]), c);
  check('periodAlign: "100" -> "830"', !!int && /^ {2}830 {2}100/m.test(int.text));
  const dd = fix('fixDisPerlen', disText(nl, 1, 4, [['1.0D+02', 100]]), c);
  check('periodAlign: Fortran D exponent kept ("1.0D+02" -> "8.3D+02")', !!dd && /^ {2}8\.3D\+02 /m.test(dd.text), dd && dd.text.split(nl)[4]);
  const odd = fix('fixDisPerlen', disText(nl, 1, 4, [['1.0E+002', 100]]), cio(5, 1, 365));
  check('periodAlign: a mantissa too short for the value gets more digits, never rounded down (1.9E+003 would be 1900 < 1925; 1.93E+003 is the shortest that is not below)', !!odd && perlenSum(odd.text) >= 1925 && /^ {2}1\.93E\+003 /m.test(odd.text), odd && odd.text.split(nl)[4]);
  /* years: ITMUNI 5 */
  const yrs = fix('fixDisPerlen', disText(nl, 1, 5, [['1.0', 1]]), c);
  check('periodAlign: ITMUNI=5 (years) reaches the target', !!yrs && perlenSum(yrs.text) >= 830 && /years/.test(yrs.summary), yrs && yrs.summary);
  /* partial SWAT year uses IDAF / IDAL like the rule */
  const part = fix('fixDisPerlen', disText(nl, 1, 4, [['100', 100]]), cio(2, 100, 200));
  check('periodAlign: IDAF/IDAL respected (SWAT 2*365-99-165 = 466 -> 566)', !!part && perlenSum(part.text) === 566, part && part.summary);
  /* abstain cases */
  check('periodAlign: last period steady-state -> abstain', fix('fixDisPerlen', disText(nl, 1, 4, [['100', 100, 'SS']]), c) === null);
  check('periodAlign: NPER says 2 but 1 line readable -> abstain, and the rule says nothing', fix('fixDisPerlen', disText(nl, 2, 4, [['100', 100]]), c) === null && periodRule(disText(nl, 2, 4, [['100', 100]]), c).length === 0);
  check('periodAlign: undefined time unit -> abstain', fix('fixDisPerlen', disText(nl, 1, 0, [['100', 100]]), c) === null);
  check('periodAlign: long enough already -> no fix', fix('fixDisPerlen', disText(nl, 1, 4, [['10000', 10000]]), c) === null);
  check('periodAlign: unreadable character -> abstain', fix('fixDisPerlen', '�' + disText(nl, 1, 4, [['100', 100]]), c) === null);
}

/* ───────────── 3. .mfn low units ───────────── */
const mfnText = (nl, rows) => ['# modflow.mfn test', '# Name File'].concat(rows.map(r => r.join('\t'))).join(nl) + nl;
for (const [label, nl] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  const rows = [['LIST', 5011, 'mf.lst'], ['DATA(BINARY)', 5009, 'mf.cbc'], ['DIS', 12, 'mf.dis'], ['BAS6', 13, 'mf.bas'], ['UPW', 10, 'mf.upw'], ['RIV', 5010, 'mf.riv'], ['# EVT', 5025, 'mf.evt']];
  const faulty = mfnText(nl, rows);
  const files = { 'modflow.mfn': faulty, 'mf.dis': 'x', 'mf.bas': 'x', 'mf.upw': 'FREE\n0 0 0', 'mf.riv': '10 0\n', 'mf.lst': '', 'mf.cbc': '' };
  files['mf.riv'] = '   5   0 # MXACTR IRIVCB\n';
  const f = rule(files, 'swat_mf', /Low file-unit numbers/)[0];
  check(`mfn ${label}: rule fires and carries a fix`, !!f && f.autofix && f.autofix.files.length === 1 && f.autofix.files[0].name === 'modflow.mfn', JSON.stringify(f && f.autofix));
  const out = f.autofix.files[0].text;
  const got = out.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => l.split('\t')[1]);
  check(`mfn ${label}: mapping avoids collisions (12, 13, 10 -> not 5011/5009/5010)`, new Set(got).size === got.length && got.every(u => +u >= 5000));
  check(`mfn ${label}: names, files, tabs and comment lines intact`, out.split(/\r?\n/).map(l => l.replace(/^(\S+\t)\d+/, '$1#')).join('\n') === faulty.split(/\r?\n/).map(l => l.replace(/^(\S+\t)\d+/, '$1#')).join('\n'));
  check(`mfn ${label}: line endings kept`, nl === '\r\n' ? !/[^\r]\n/.test(out) : !/\r/.test(out));
  check(`mfn ${label}: rule silent on the fixed file`, rule(Object.assign({}, files, { 'modflow.mfn': out }), 'swat_mf', /Low file-unit numbers/).length === 0);
  check(`mfn ${label}: second run changes nothing`, fix('fixMfnUnits', out, n => files[n] === undefined ? null : files[n]) === null);
  check(`mfn ${label}: comment line "# EVT 5025" ignored`, out.includes('# EVT\t5025\tmf.evt'));
  check(`mfn ${label}: summary lists the pairs`, /^3 units renumbered: 10->\d+, 12->\d+, 13->\d+/.test(f.autofix.files[0].summary), f.autofix.files[0].summary);
}
{
  const nl = '\n';
  /* the benchmark's fault: DIS 5012 -> 12, BAS6 5013 -> 13 */
  const rows = [['LIST', 5011, 'a.lst'], ['DATA(BINARY)', 5009, 'a.cbc'], ['DIS', 12, 'a.dis'], ['BAS6', 13, 'a.bas'], ['OC', 5039, 'a.oc'], ['UPW', 5134, 'a.upw']];
  const t = mfnText(nl, rows), r = fix('fixMfnUnits', t, () => 'HEAD SAVE UNIT 5037\n');
  check('mfn: benchmark fault (DIS 12, BAS6 13) -> 5012 / 5013, as in the unfaulted model', !!r && /DIS\t5012\ta\.dis/.test(r.text) && /BAS6\t5013\ta\.bas/.test(r.text), r && r.summary);
  /* a unit repeated in another file: refuse */
  const get = name => ({ 'a.oc': 'HEAD SAVE FORMAT (10(1X1PE13.5)) LABEL\nHEAD SAVE UNIT 30\n', 'a.upw': '30 1E30 0 0\n' }[name] ?? null);
  const withOc = mfnText(nl, [['LIST', 5011, 'a.lst'], ['DATA', 30, 'a.hds'], ['OC', 5039, 'a.oc'], ['UPW', 5134, 'a.upw']]);
  const refuse = fix('fixMfnUnits', withOc, get);
  check('mfn: unit 30 repeated in OC and UPW -> no corrected file, a note instead', !!refuse && refuse.text === undefined && /a\.oc \(unit 30\)/.test(refuse.note) && /a\.upw \(unit 30\)/.test(refuse.note), JSON.stringify(refuse));
  const f = runRules({ 'modflow.mfn': withOc, 'a.oc': get('a.oc'), 'a.upw': get('a.upw'), 'a.lst': '' }, 'swat_mf', Object.keys({ 'modflow.mfn': 1, 'a.oc': 1, 'a.upw': 1, 'a.lst': 1, 'a.hds': 1 })).filter(x => /Low file-unit/.test(x.title))[0];
  check('mfn: the finding still appears (advice) but offers no download', !!f && f.autofix && f.autofix.files.length === 0 && /No automatic fix/.test(f.autofix.note));
  const unread = fix('fixMfnUnits', mfnText(nl, [['DATA', 30, 'a.hds'], ['RIV', 31, 'a.riv']]), () => null);
  check('mfn: a package file that cannot be read -> no fix, a note', !!unread && unread.text === undefined && /could not be read/.test(unread.note));
  check('mfn: no low units -> nothing', fix('fixMfnUnits', mfnText(nl, [['DIS', 5012, 'a.dis']]), () => null) === null);
}

/* ───────────── ambiguous faults get no fix ───────────── */
{
  const r1 = runRules({ 'time.sim': ['time.sim', 'day_start yrc_start day_end yrc_end step', '  0 2020 1 2010 0'].join(String.fromCharCode(10)) }, 'swat_plus', ['time.sim']);
  const f = r1.filter(x => /end date is before/.test(x.title));
  check('time.sim end before start: finding present, no auto-fix', f.length === 1 && r1.every(x => !x.autofix));
  const g = runRules({ 'codes.bsn': 'x' }, 'swat_plus', ['codes.bsn']);
  check('other findings carry no auto-fix field', g.every(x => !x.autofix));
}

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
