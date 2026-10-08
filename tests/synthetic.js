/* SYNTHETIC fixtures. Written from knowledge of each format, NOT from real model folders.
 * They test that the code does what the author intended; they do NOT validate the signatures.
 * Each family below is marked needs-sample until a real folder replaces it. */
(function () {
  var NL = '\n';
  function f(path, text) { return { path: path, size: (text || '').length, text: text === undefined ? null : text }; }
  var S = window.HDA_SYNTHETIC = {};

  /* SWAT2012 alone */
  S.swat2012_alone = [
    f('TxtInOut/file.cio', 'General input/output section (file.cio):' + NL + ' 10  | NBYR : Number of years simulated' + NL + ' 2010 | IYR : Beginning year'),
    f('TxtInOut/000010000.sub', 'Subbasin: 1'), f('TxtInOut/000010001.hru', 'HRU: 1'), f('TxtInOut/fig.fig', 'fig'),
    f('TxtInOut/output.std', ' SWAT Oct 31 2017    VER 2012/Rev 664' + NL + ' General Input/Output section')
  ];
  /* SWAT-MODFLOW: SWAT2012 folder + MODFLOW folder */
  S.swat_modflow = [
    f('proj/TxtInOut/file.cio', ' 10  | NBYR'), f('proj/TxtInOut/000010000.sub', 's'), f('proj/TxtInOut/000010001.hru', 'h'),
    f('proj/TxtInOut/swatmf_link.txt', 'link'),
    f('proj/MODFLOW/modflow.mfn', 'LIST 2 m.lst' + NL + 'BAS6 13 bas.bas' + NL + 'DIS 29 m.dis' + NL + 'LPF 11 m.lpf' + NL + 'PCG 12 m.pcg' + NL + 'RIV 18 m.riv')
  ];
  /* SWAT+MODFLOW (NWT) with smrt linkage */
  S.swatplus_modflow_nwt = [
    f('sm/time.sim', 'time.sim: written by SWAT+ editor v3.1.4 on 2025-03-01 10:00 for SWAT+ rev.61.0.2' + NL + 'day_start yrc_start'),
    f('sm/print.prt', 'print.prt: written by SWAT+ editor v3.1.4 on 2025-03-01 10:00 for SWAT+ rev.61.0.2'),
    f('sm/smrt.hrucells', 'link'), f('sm/modflow/m.nam', 'LIST 2 m.lst' + NL + 'BAS6 13 bas.bas' + NL + 'DIS 29 m.dis' + NL + 'UPW 11 m.upw' + NL + 'NWT 12 m.nwt')
  ];
  /* SWAT+ with MODFLOW 6 side by side, FloPy + API script */
  S.swatplus_mf6_api = [
    f('r/swat/time.sim', 'time.sim: written by SWAT+ editor v4.0.2 on 2026-09-09 16:56 for SWAT+ rev. 62'),
    f('r/swat/print.prt', 'print.prt: written by SWAT+ editor v4.0.2 on 2026-09-09 16:56 for SWAT+ rev. 62'),
    f('r/mf6/mfsim.nam', 'BEGIN options' + NL + 'END options' + NL + 'BEGIN timing' + NL + '  TDIS6 sim.tdis' + NL + 'END timing' + NL + 'BEGIN models' + NL + '  gwf6 gwf.nam gwf' + NL + 'END models'),
    f('r/mf6/sim.tdis', 'BEGIN options' + NL + 'END options'), f('r/mf6/mfsim.lst', ' MODFLOW 6' + NL + '   VERSION 6.4.2 01/29/2023'),
    f('r/couple.py', 'import flopy' + NL + 'from modflowapi import ModflowApi' + NL + '# reads SWAT+ TxtInOut')
  ];
  /* SWAT+ (lumped) + MODFLOW 6 dropped as ONE parent folder, only MF6 side */
  S.mf6_alone = [
    f('m/mfsim.nam', 'BEGIN options' + NL + 'END options' + NL + 'BEGIN timing' + NL + '  TDIS6 s.tdis' + NL + 'END timing'),
    f('m/gwf.nam', 'BEGIN packages' + NL + ' DIS6 g.dis dis' + NL + 'END packages')
  ];
  S.modflow_alone_usg = [
    f('u/m.nam', 'LIST 2 m.lst' + NL + 'BAS6 13 bas.bas' + NL + 'DISU 29 m.disu' + NL + 'SMS 11 m.sms' + NL + 'LPF 12 m.lpf')
  ];
  /* APEX */
  S.apex_alone = [ f('a/APEXCONT.DAT', 'control'), f('a/APEXRUN.DAT', 'run'), f('a/APEXFILE.DAT', 'files') ];
  S.apex_modflow = [ f('a/APEXCONT.DAT', 'control'), f('a/APEXRUN.DAT', 'run'),
                      f('a/mf/m.nam', 'LIST 2 m.lst' + NL + 'BAS6 13 bas.bas' + NL + 'DIS 29 m.dis' + NL + 'UPW 11 m.upw') ];
  /* things we must NOT silently classify */
  S.empty_upload = [];
  S.random_files = [ f('x/readme.txt', 'hello'), f('x/data.csv', 'a,b\n1,2'), f('x/photo.jpg', null) ];
  /* an APEX-looking folder must never be called SWAT+ */
  S.apex_must_not_be_swatplus = S.apex_alone;
})();
