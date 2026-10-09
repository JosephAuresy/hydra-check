/* Small model folders that make each rule, and each characterization message, fire. Shared by tests/advice_fields.test.js and
 * tests/make_advice_inventory.js. TRIGGER: advice id -> [rule set, files, optional file names]; CHAR_UPLOADS: advice id -> upload entries. */
'use strict';
const NL = '\n';
/* ─────────────── fixtures for the rules (same shapes as run_rules_node.js / rule_tablerows.test.js) ─────────────── */
const SOIL_HDR = 'name nly hyd_grp dp_tot anion_excl perc_crk texture dp bd awc soil_k carbon clay silt sand rock alb usle_k ec caco3 ph';
const soil1 = (name, tex, bd) => [name, 2, 'C', '1060.0', '0.5', '0.5', tex, '100.0', bd, '0.1', '10.0', '1.0', '20.0', '40.0', '40.0', '0.0', '0.01', '0.3', '0.0', '0.0', '7.5'].join(' ');
const soil2 = '1060.0 1.5 0.1 5.0 0.5 25.0 35.0 40.0 0.0 0.01 0.3 0.0 0.0 7.5';
const soils = (...rows) => ['soils.sol: test', SOIL_HDR].concat(rows).join(NL);
const cio = (nbyr, idaf, idal) => [' General input/output', ' ' + nbyr + ' | NBYR : Number of years simulated', ' 1985 | IYR : Beginning year', ' ' + idaf + ' | IDAF : Beginning julian day', ' ' + idal + ' | IDAL : Ending julian day'].join(NL);
const dis = (nper, itmuni, periods) => ['# MODFLOW DIS', '     1    23    40  ' + nper + '    ' + itmuni + '     2 # NLAY, NROW, NCOL, NPER, ITMUNI, LENUNI', '     0 # LAYCB', 'CONSTANT 1.000E+003 # DELR']
  .concat(periods.map(p => '   ' + p[0] + '  ' + p[1] + '  1.000000000000E+000  TR # PERLEN NSTP TSMULT Ss/tr')).join(NL);
const HRU_HDR = '      id  name                          topo             hydro              soil            lu_mgt   soil_plant_init         surf_stor              snow             field';
const hruRow = i => '       ' + i + '  hru0000' + i + '              topohru0000' + i + '          hyd0000' + i + '             S2430          agrl_lum        soilplant1              null           snow001';
const hru = ['hru-data.hru: written by test', HRU_HDR, hruRow(1), hruRow(2)].join(NL) + NL;
const MF6_NAM = 'BEGIN models' + NL + '  gwf6  gwf.nam  gwf' + NL + 'END models' + NL + 'BEGIN solutiongroup  1' + NL + '  ims6  gwf.ims  gwf' + NL + 'END solutiongroup  1';
const ims = (blockName, body) => 'BEGIN options' + NL + '  COMPLEXITY  moderate' + NL + 'END options' + NL + 'BEGIN ' + blockName + NL + '  ' + body + NL + 'END ' + blockName + NL;
const mf6 = (blk, body) => ({ 'mfsim.nam': MF6_NAM, 'gwf.ims': ims(blk, body) });
const LST_FAIL = ' Solution 1 did not converge for stress period 1 and time step 1' + NL + ' Simulation convergence failure. Simulation will terminate after output and deallocation.' + NL + 'ERROR REPORT:' + NL + '  1.  Simulation convergence failure occurred 1 time(s).' + NL + ' Premature termination of simulation.';

/* advice id -> [framework rule set, files, optional file names]. Every id of HDA.ADVICE must appear here. */
const TRIGGER = {
  'swatplus.time_missing':   ['swat_plus', { 'x.txt': 'x' }],
  'swatplus.time_order':     ['swat_plus', { 'time.sim': 'time.sim: t' + NL + 'day_start yrc_start day_end yrc_end' + NL + '1 2020 1 1999' }],
  'swatplus.time_years':     ['swat_plus', { 'time.sim': 'time.sim: t' + NL + 'day_start yrc_start day_end yrc_end' + NL + '1 1800 365 1805' }],
  'swatplus.print_prt':      ['swat_plus', { 'x.txt': 'x' }],
  'swatplus.soil_nulls':     ['swat_plus', { 'soils.sol': soils(soil1('S1', 'Loam', 'null'), soil2) }],
  'swatplus.soil_zero':      ['swat_plus', { 'soils.sol': soils(soil1('S1', 'Loam', '0.0'), soil2) }],
  'swatplus.gwflow_thickness': ['swat_plus', { 'gwflow.input': 'thickness' + NL + new Array(30).join('0.0  ') }],
  'swatplus.gwflow_info':    ['swat_plus', { 'gwflow.input': 'x' }],
  'swatplus.weather_refs':   ['swat_plus', { 'weather-sta.cli': 'weather-sta.cli: x' + NL + 'name wgn pcp tmp' + NL + 's1 w1 A1.pcp A1.tmp' }],
  'swatplus.cli_sorted':     ['swat_plus', { 'pcp.cli': 'pcp.cli: list' + NL + 'filename' + NL + 'C3.pcp' + NL + 'A1.pcp' + NL + 'B2.pcp' }],
  'swatplus.table_rows':     ['swat_plus', { 'hru-data.hru': hru.replace(/ +null\r?\n/g, NL) }],
  'swatplus.diag_log':       ['swat_plus', { 'diagnostics.out': ' DIAGNOSTICS.OUT FILE' + NL + ' A1.pcp                  file not found (pgage)' }],
  'swat2012.cio_missing':    ['swat2012', { 'x.txt': 'x' }],
  'swat2012.nbyr':           ['swat2012', { 'file.cio': cio(0, 1, 365) }],
  'swat2012.climate_cover':  ['swat2012', { 'file.cio': cio(3, 1, 365), 'pcp1.pcp': ['h1', 'h2', 'h3', 'h4', '1985001 1.0', '1986001 1.0'].join(NL) }],
  'swat2012.sol_nulls':      ['swat2012', { 'file.cio': cio(1, 1, 365), '000010001.sol': 'Soil  1.4 null 0.1' }],
  'swat2012.referenced_files': ['swat2012', { 'file.cio': cio(1, 1, 365), '000010000.sub': '000010001.hru000010001.mgt000010001.sol' }],
  'swatmf.mfn_missing':      ['swat_mf', { 'x.txt': 'x' }],
  'swatmf.low_units':        ['swat_mf', { 'modflow.mfn': 'LIST 5011 m.lst' + NL + 'BAS6 13 bas.bas' + NL + 'DIS 5012 m.dis', 'bas.bas': 'x', 'm.dis': 'x' }],
  'swatmf.period_align':     ['swat_mf', { 'file.cio': cio(1, 1, 365), 'm.dis': dis(1, 4, [['1.000000000000E+002', 100]]) }],
  'modflow.name_file_refs':  ['swat_mf', { 'modflow.mfn': 'LIST 5011 m.lst' + NL + 'DIS 5012 m.dis' + NL + 'UPW 5134 m.upw', 'm.dis': 'x' }],
  'swatmf.link_missing':     ['swat_mf', { 'modflow.mfn': 'LIST 5011 out.lst' + NL, 'file.cio': 'x' }],
  'modflow.solver_failed':   ['modflow', { 'model.lst': 'MODFLOW-2005' + NL + 'FAILED TO MEET SOLVER CONVERGENCE CRITERIA' }],
  'modflow.discrepancy':     ['modflow', { 'model.lst': 'PERCENT DISCREPANCY = 3.42' }],
  'modflow.dry_cells':       ['modflow', { 'model.lst': 'CELL GOES DRY' }],
  'modflow.chd_fraction':    ['modflow', { 'm.chd': '1 1 1 10.0' + NL + '1 1 1 10.0', 'm.dis': '1 1 1 1 4 2' }],
  'generic.empty_files':     ['swat_plus', { 'file.cio': 'simulation  time.sim  print.prt', 'time.sim': '' }],
  'generic.path_names':      ['swat_plus', { 'x.txt': 'x' }, ['café.txt']],
  'mf6.name_file_refs':      ['modflow6', { 'mfsim.nam': 'BEGIN models' + NL + '  gwf6  gwf.nam  gwf' + NL + 'END models', 'gwf.nam': 'BEGIN packages' + NL + '  NPF6  gwf.npf  npf' + NL + 'END packages' }],
  'mf6.nper':                ['modflow6', { 's.tdis': 'BEGIN dimensions' + NL + '  NPER  6' + NL + 'END dimensions' + NL + 'BEGIN perioddata' + NL + ' 1.0 1 1.0' + NL + ' 1.0 1 1.0' + NL + 'END perioddata' }],
  'mf6.listing_convergence': ['modflow6', { 'mfsim.lst': LST_FAIL }],
  'mf6.outer_maximum':       ['modflow6', mf6('nonlinear', 'OUTER_MAXIMUM  1')],
  'mf6.outer_dvclose':       ['modflow6', mf6('nonlinear', 'OUTER_DVCLOSE  1.0E-20')],
  'mf6.inner_rclose':        ['modflow6', mf6('linear', 'INNER_RCLOSE  1.0E-18')],
  'apex.empty_control':      ['apex', { 'APEXCONT.DAT': '', 'APEXRUN.DAT': 'run' + NL, 'APEXFILE.DAT': 'files' + NL }],
  'apex.link_missing':       ['apex', { 'apexmf.con': 'x' + NL }]
};


/* characterization uploads */
const st = rev => 'x: written by SWAT+ editor v4.0.2 on 2026-09-09 16:56 for SWAT+ rev. ' + rev;
const st61 = 'x: written by SWAT+ editor v3.1.4 on 2025-03-01 10:00 for SWAT+ rev.61.0.2';
const E = (p, t) => ({ path: p, size: (t || '').length, text: t === undefined ? null : t });
const base = (rev, d) => [E(d + 'time.sim', st(rev || 62)), E(d + 'print.prt', st(rev || 62))];
const MF6N = 'BEGIN timing' + NL + ' TDIS6 s.tdis' + NL + 'END timing' + NL + 'BEGIN models' + NL + '  gwf6 gwf.nam gwf' + NL + 'END models';
const LEGNAM = 'LIST 2 m.lst' + NL + 'BAS6 13 bas.bas' + NL + 'DIS 29 m.dis' + NL + 'UPW 11 m.upw' + NL + 'NWT 12 m.nwt';
const codes = (stamp, hdr, val) => E('c/codes.bsn', stamp + NL + hdr + NL + val);
const CHAR_UPLOADS = {
  'char.mf6swatp_gwflow': [].concat(base(62, 'r/'), [E('r/mf6swatp.cfg', 'x'), E('r/codes.bsn', st(62) + NL + ' pet_file wq_file pet gwflow idc_till' + NL + ' null null 2 1 3')]),
  'char.mf6swatp_no_mf6': [].concat(base(62, 'r/'), [E('r/mf6swatp.cfg', 'x')]),
  'char.mf6swatp_cfg_missing': [].concat(base(62, 'r/'), [E('r/exchange/out/mf6swatp_day_000001.txt', 'day_index 1')]),
  'char.swatplus_mf6_unknown_coupling': [].concat(base(62, 'r/'), [E('r/mf6/mfsim.nam', MF6N)]),
  'char.mf6_api_script': [].concat(base(62, 'r/'), [E('r/mf6/mfsim.nam', MF6N), E('r/couple.py', 'import flopy' + NL + 'from modflowapi import ModflowApi')]),
  'char.gwflow_and_mf6': [].concat(base(62, 'r/'), [E('r/gwflow.input', 'x'), E('r/mf6/mfsim.nam', MF6N)]),
  'char.smrt_missing': [].concat(base(62, 'r/'), [E('r/modflow/m.nam', LEGNAM)]),
  'char.gwflow_and_legacy_mf': [].concat(base(62, 'r/'), [E('r/gwflow.input', 'x'), E('r/modflow/m.nam', LEGNAM)]),
  'char.gwflow_off': [].concat(base(62, 'c/'), [E('c/gwflow.input', 'x'), codes(st(62), ' pet_file wq_file pet gwflow idc_till', ' null null 2 0 3')]),
  'char.gwflow_disagree': [].concat(base(62, 'c/'), [E('c/gwflow.input', 'x'), E('c/file.cio', 'file.cio: x' + NL + 'connect hru.con aquifer.con'), codes(st(62), ' pet_file wq_file pet gwflow idc_till', ' null null 2 1 3')]),
  'char.gwflow_input_missing': [].concat(base(62, 'c/'), [codes(st(62), ' pet_file wq_file pet gwflow idc_till', ' null null 2 1 3')]),
  'char.codes_layout': [E('c/time.sim', st61), E('c/print.prt', st61), E('c/hru-data.hru', st61), codes(st(62), ' pet_file wq_file qual2e gwflow idc_till', ' null null 2 0 3')],
  'char.mixed_revisions': [E('c/time.sim', st61), E('c/print.prt', st61), codes(st(62), ' pet_file wq_file pet gwflow idc_till', ' null null 2 0 3')],
  'char.swatmf_no_mf_files': [E('p/file.cio', ' 10  | NBYR'), E('p/000010000.sub', 's'), E('p/000010001.hru', 'h'), E('p/swatmf_link.txt', 'link')],
  'char.swat_mf_no_link': [E('p/TxtInOut/file.cio', ' 10  | NBYR'), E('p/TxtInOut/000010000.sub', 's'), E('p/TxtInOut/000010001.hru', 'h'), E('p/MODFLOW/m.nam', LEGNAM)],
  'char.apexmf_leftovers': [E('p/file.cio', ' 10  | NBYR'), E('p/000010000.sub', 's'), E('p/000010001.hru', 'h'), E('p/apexmf_link.txt', 'x')],
  'char.swat2012_mf6': [E('p/TxtInOut/file.cio', ' 10  | NBYR'), E('p/TxtInOut/000010000.sub', 's'), E('p/TxtInOut/000010001.hru', 'h'), E('p/mf6/mfsim.nam', MF6N)],
  'char.swatmf_leftovers': [E('a/APEXCONT.DAT', 'c'), E('a/swatmf_link.txt', 'x')],
  'char.apexmf_no_mf': [E('a/APEXCONT.DAT', 'c'), E('a/apexmf_link.txt', 'x')],
  'char.gw_link_no_surface': [E('m/m.nam', LEGNAM), E('m/swatmf_link.txt', 'x')],
  'char.gw_ambiguous': [].concat(base(62, 'D/swat/'), [E('D/apex/APEXCONT.DAT', 'c'), E('D/mf6/mfsim.nam', MF6N)]),
  'char.gw_alone': [E('m/mfsim.nam', MF6N), E('m/gwf.nam', 'BEGIN packages' + NL + ' DIS6 g.dis dis' + NL + 'END packages')]
};

module.exports = { TRIGGER, CHAR_UPLOADS };
