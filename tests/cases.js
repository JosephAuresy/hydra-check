/* Assertions. `real: true` cases were checked by hand against the actual model files before being written down.
 * `real: false` cases test intent on synthetic input and do NOT validate the format signature itself. */
(function () {
  function one(r, fails) { if (r.systems.length !== 1) fails.push('expected 1 system, got ' + r.systems.length); return r.systems[0]; }
  function eq(fails, what, got, want) { if (got !== want) fails.push(what + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }
  function gwf(s) { return (s.surface && s.surface.gwflow) || {}; }

  window.HDA_CASES = [
    /* ---------------- real samples ---------------- */
    { real: true, name: 'Pecos rev62 model with gwflow: gwflow, structured, LSU-cell, mixed 62/61.0.2', fixture: 'pecos_gwflow_mixed_rev',
      check: function (r, f) { var s = one(r, f);
        eq(f, 'coupling', s.coupling, 'swatplus-gwflow'); eq(f, 'grid', gwf(s).grid, 'structured');
        eq(f, 'recharge', gwf(s).rechargeConnection, 'LSU-cell'); eq(f, 'mixed', s.surface.mixedRevisions, true);
        eq(f, 'dominant revision', s.surface.revision, '62'); } },
    { real: true, name: 'Pecos lumped model: lumped aquifers, dominant rev 61.0.2, mixed with 62', fixture: 'pecos_lumped_mixed_rev',
      check: function (r, f) { var s = one(r, f);
        eq(f, 'coupling', s.coupling, 'swatplus-lumped'); eq(f, 'mixed', s.surface.mixedRevisions, true);
        eq(f, 'dominant revision', s.surface.revision, '61.0.2'); } },
    { real: true, name: 'Pecos classic-aquifer variant: leftover gwflow files are flagged, not treated as active', fixture: 'pecos_classic_aquifers',
      check: function (r, f) { var s = one(r, f);
        eq(f, 'coupling', s.coupling, 'swatplus-lumped');
        if (!s.ambiguity.some(function (a) { return /gwflow/.test(a); })) f.push('no gwflow ambiguity reported'); } },
    { real: true, name: 'ARB 2024 example: pre-editor format is classified, not rejected; structured; HRU-cell', fixture: 'arb_gwflow_structured',
      check: function (r, f) { var s = one(r, f);
        eq(f, 'coupling', s.coupling, 'swatplus-gwflow'); eq(f, 'format', s.surface.format, 'pre-editor');
        eq(f, 'revision', s.surface.revision, null); eq(f, 'grid', gwf(s).grid, 'structured');
        eq(f, 'recharge', gwf(s).rechargeConnection, 'HRU-cell'); } },
    { real: true, name: 'Fountain Creek example: gwflow with an UNSTRUCTURED grid of 59,211 cells', fixture: 'usg_gwflow_unstructured',
      check: function (r, f) { var s = one(r, f);
        eq(f, 'coupling', s.coupling, 'swatplus-gwflow'); eq(f, 'grid', gwf(s).grid, 'unstructured'); eq(f, 'cells', gwf(s).cells, 59211); } },
    { real: true, name: 'Tordera QSWAT+ project: gwflow active, older file set', fixture: 'tordera_qswat_project',
      check: function (r, f) { var s = one(r, f);
        eq(f, 'coupling', s.coupling, 'swatplus-gwflow'); eq(f, 'generation', /pre-rev61/.test(gwf(s).generation), true); } },
    { real: true, name: 'Pekin gwflow: rev 61.0.2, single revision, not flagged as mixed', fixture: 'pekin_gwflow',
      check: function (r, f) { var s = one(r, f);
        eq(f, 'coupling', s.coupling, 'swatplus-gwflow'); eq(f, 'revision', s.surface.revision, '61.0.2'); eq(f, 'mixed', s.surface.mixedRevisions, false); } },

    { real: true, name: 'MODFLOW 6 (FloPy, v6.7.0) GWF+GWT with UZF/UZT: version, models, grid and packages read from the files', fixture: 'mf6_toy_spike',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'modflow6-alone');
        var g = s.groundwater[0]; eq(f, 'version', g.revision, '6.7.0'); eq(f, 'grid', g.mf6.grid, 'DIS'); eq(f, 'transport', g.mf6.transport, true);
        eq(f, 'models', g.mf6.models.map(function (m) { return m.type; }).join('+'), 'GWF+GWT');
        ['UZF', 'UZT', 'WEL'].forEach(function (p) { if (g.mf6.packages.indexOf(p) < 0) f.push('package ' + p + ' not found'); }); } },
    { real: true, name: 'MODFLOW 6 with RCH + SSM (no UZF): same simulation structure recognised', fixture: 'mf6_rch_ssm_repro',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'modflow6-alone');
        var g = s.groundwater[0]; eq(f, 'version', g.revision, '6.7.0');
        ['RCH', 'SSM'].forEach(function (p) { if (g.mf6.packages.indexOf(p) < 0) f.push('package ' + p + ' not found'); });
        if (g.mf6.packages.indexOf('UZF') >= 0) f.push('UZF reported but this model has none'); } },

    { real: true, name: 'SWAT-MODFLOW3 Middle Bosque: SWAT2012 + MODFLOW-NWT in one folder, "Rev 636_smrt" build, swatmf_* and .mfn linkage', fixture: 'swatmf_middle_bosque',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swat-modflow'); eq(f, 'confidence', s.couplingConfidence, 'high');
        eq(f, 'revision', s.surface.revision, 'Rev 636_smrt'); eq(f, 'smrt build', s.surface.smrtBuild, true);
        eq(f, 'gw family', s.groundwater[0].family, 'modflow-nwt'); if (!s.link.swatmf || !s.link.mfn) f.push('linkage evidence missing'); } },
    { real: true, name: 'swatmf_wf coupled model (same family, different folder): identical conclusion', fixture: 'swatmf_wf_coupled',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swat-modflow'); eq(f, 'gw family', s.groundwater[0].family, 'modflow-nwt'); } },
    { real: true, name: 'SWAT2012 on its own (no MODFLOW): not called SWAT-MODFLOW; revision only from the executable name, flagged low confidence', fixture: 'swat2012_only_middle_bosque',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swat2012-lumped'); eq(f, 'gw', s.groundwater.length, 0);
        eq(f, 'revision', s.surface.revision, 'Rev 664 (from the executable name)'); eq(f, 'revision confidence', s.surface.revisionConfidence, 'low'); } },
    { real: true, name: 'APEX example (apex-ua): APEX alone, version only from APEX1501.exe, found one folder down', fixture: 'apex_ua_example',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'apex-alone'); eq(f, 'revision', s.surface.revision, 'APEX1501'); eq(f, 'dir', s.dir, 'UA_Analysis/DREAM'); } },
    { real: true, name: 'APEX-MODFLOW example (apexmf_opt_pp): recognised, and stray swatmf_* files are called out as leftovers', fixture: 'apexmf_opt_pp_example',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'apex-modflow'); eq(f, 'gw family', s.groundwater[0].family, 'modflow-nwt');
        if (!s.notes.some(function (n) { return /leftovers/.test(n); })) f.push('swatmf_* leftovers not reported'); } },
    { real: true, name: 'AMRS Animas (control and link files only): APEX-MODFLOW with MODFLOW-NWT, high confidence', fixture: 'amrs_animas_small_files',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'apex-modflow'); eq(f, 'confidence', s.couplingConfidence, 'high');
        if (!s.link.apexmf) f.push('apexmf_* linkage not found'); } },
    { real: true, name: 'Pecos with gwflow: codes.bsn flag (gwflow = 1) and file.cio agree, so no disagreement is reported', fixture: 'pecos_gwflow_mixed_rev',
      check: function (r, f) { var s = one(r, f); eq(f, 'codes flag', gwf(s).codesFlag, 1); eq(f, 'active', gwf(s).active, true); eq(f, 'disagreement', !!gwf(s).flagDisagreement, false); } },
    { real: true, name: 'Pecos classic aquifers: codes.bsn gwflow = 0 is what switches gwflow off', fixture: 'pecos_classic_aquifers',
      check: function (r, f) { var s = one(r, f); eq(f, 'codes flag', gwf(s).codesFlag, 0); eq(f, 'active', gwf(s).active, false); } },

    { real: true, name: 'Pecos lumped_v62: codes.bsn is rev-62 layout while most files are rev 61.0.2 and a rev61.exe is present -> flagged', fixture: 'pecos_lumped_mixed_rev',
      check: function (r, f) { var s = one(r, f); eq(f, 'codes layout', s.surface.codesLayout, 62);
        if (!s.notes.some(function (n) { return /codes\.bsn has the rev-62 column layout/.test(n) && /rev61\.exe/.test(n); })) f.push('codes.bsn / executable mismatch not reported'); } },
    { real: true, name: 'Pecos v15_full: codes.bsn rev-62 layout agrees with the dominant rev 62, so no layout warning', fixture: 'pecos_gwflow_mixed_rev',
      check: function (r, f) { var s = one(r, f); eq(f, 'codes layout', s.surface.codesLayout, 62);
        if (s.notes.some(function (n) { return /column layout/.test(n); })) f.push('false layout warning'); } },
    { real: true, name: 'Pekin (rev 61.0.2): codes.bsn has the rev-61 layout and agrees', fixture: 'pekin_gwflow',
      check: function (r, f) { var s = one(r, f); eq(f, 'codes layout', s.surface.codesLayout, 61);
        if (s.notes.some(function (n) { return /column layout/.test(n); })) f.push('false layout warning'); } },

    { real: true, name: 'Bailey 2025 SWAT+MODFLOW (JMR Colorado): smrt.* linkage + MODFLOW-NWT, old SWAT+ file format -> SWAT+MODFLOW coupling, high confidence', fixture: 'swatplus_modflow_jmr_regular',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swatplus-modflow-nwt'); eq(f, 'confidence', s.couplingConfidence, 'high');
        eq(f, 'surface format', s.surface.format, 'pre-editor'); eq(f, 'gw family', s.groundwater[0].family, 'modflow-nwt'); if (!s.link.smrt) f.push('smrt linkage not found'); } },
    { real: true, name: 'Bailey 2025 SWAT+MODFLOW (MSJ California, 1 layer): same conclusion on a second independent model', fixture: 'swatplus_modflow_msj_1layer',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swatplus-modflow-nwt'); eq(f, 'gw family', s.groundwater[0].family, 'modflow-nwt'); } },

    /* ---------------- synthetic (spec) ---------------- */
    { real: false, name: 'MF6SWATP (source-defined signature): mf6swatp.cfg + exports + MODFLOW 6, gwflow off -> coupled, no problems',
      entries: function () {
        var NL = '\n', st = 'time.sim: written by SWAT+ editor v4.0.2 on 2026-09-09 16:56 for SWAT+ rev. 62';
        function f(p, t) { return { path: p, size: (t || '').length, text: t === undefined ? null : t }; }
        return [ f('run/time.sim', st), f('run/print.prt', st), f('run/mf6swatp.cfg', 'x'),
                 f('run/codes.bsn', 'codes.bsn: written by SWAT+ editor v4.0.2 on 2026-09-09 16:56 for SWAT+ rev. 62' + NL + ' pet_file wq_file pet gwflow idc_till' + NL + ' null null 2 0 3'),
                 f('run/exchange/out/mf6swatp_day_000001.txt', 'day_index 1'), f('run/exchange/out/mf6swatp_day_000002.txt', 'day_index 2'),
                 f('run/mf6/mfsim.nam', 'BEGIN timing' + NL + ' TDIS6 s.tdis' + NL + 'END timing') ];
      },
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swatplus-mf6swatp'); eq(f, 'confidence', s.couplingConfidence, 'high');
        eq(f, 'problems', s.problems.length, 0); eq(f, 'groundwater attached', s.groundwater.length, 1); if (!s.link.mf6swatp) f.push('exports not noticed'); } },
    { real: false, name: 'MF6SWATP with gwflow = 1 in codes.bsn is reported as a run-stopping problem (rule taken from mf6swatp_module.f90)',
      entries: function () {
        var NL = '\n', st = 'time.sim: written by SWAT+ editor v4.0.2 on 2026-09-09 16:56 for SWAT+ rev. 62';
        function f(p, t) { return { path: p, size: (t || '').length, text: t === undefined ? null : t }; }
        return [ f('run/time.sim', st), f('run/print.prt', st), f('run/mf6swatp.cfg', 'x'),
                 f('run/codes.bsn', 'codes.bsn: written by SWAT+ editor v4.0.2 on 2026-09-09 16:56 for SWAT+ rev. 62' + NL + ' pet_file wq_file pet gwflow idc_till' + NL + ' null null 2 1 3') ];
      },
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swatplus-mf6swatp'); eq(f, 'problems', s.problems.length, 1);
        if (s.problems[0]) eq(f, 'severity', s.problems[0].sev, 'error'); if (!s.missing.some(function (m) { return /MODFLOW 6 model/.test(m); })) f.push('missing MODFLOW 6 model not reported'); } },
    { real: false, name: 'MF6SWATP export files without mf6swatp.cfg: noticed, but the hook is said not to run',
      entries: function () {
        var st = 'time.sim: written by SWAT+ editor v4.0.2 on 2026-09-09 16:56 for SWAT+ rev. 62';
        function f(p, t) { return { path: p, size: (t || '').length, text: t === undefined ? null : t }; }
        return [ f('run/time.sim', st), f('run/print.prt', st), f('run/exchange/out/mf6swatp_day_000001.txt', 'day_index 1') ];
      },
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swatplus-mf6swatp'); eq(f, 'confidence', s.couplingConfidence, 'medium');
        if (!s.notes.some(function (n) { return /mf6swatp\.cfg was not/.test(n); })) f.push('missing-cfg note absent'); } },
    { real: false, name: 'SWAT2012 alone is not mistaken for SWAT+ and gets its revision from output.std', fixture: 'swat2012_alone',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swat2012-lumped'); eq(f, 'revision', s.surface.revision, 'Rev 664'); } },
    { real: false, name: 'SWAT-MODFLOW in sibling folders becomes ONE system with high confidence', fixture: 'swat_modflow',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swat-modflow'); eq(f, 'confidence', s.couplingConfidence, 'high');
        eq(f, 'gw family', s.groundwater[0] && s.groundwater[0].family, 'modflow-2005'); } },
    { real: false, name: 'SWAT+MODFLOW with smrt linkage is recognized as the NWT coupling', fixture: 'swatplus_modflow_nwt',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swatplus-modflow-nwt'); eq(f, 'gw family', s.groundwater[0].family, 'modflow-nwt'); } },
    { real: false, name: 'SWAT+ beside MODFLOW 6 is one system, coupling pattern left open, API script noticed', fixture: 'swatplus_mf6_api',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'swatplus-modflow6'); eq(f, 'mf6 version', s.groundwater[0].revision, '6.4.2');
        if (!s.notes.some(function (n) { return /API/.test(n); })) f.push('API hint not reported'); } },
    { real: false, name: 'MODFLOW 6 alone tells the user what to add', fixture: 'mf6_alone',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'modflow6-alone'); if (!s.notes.length) f.push('no guidance given'); } },
    { real: false, name: 'MODFLOW-USG is separated from MODFLOW-2005', fixture: 'modflow_alone_usg',
      check: function (r, f) { var s = one(r, f); eq(f, 'gw family', s.groundwater[0].family, 'modflow-usg'); } },
    { real: false, name: 'APEX is never reported as SWAT+', fixture: 'apex_alone',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'apex-alone'); eq(f, 'family', s.surface.family, 'apex'); } },
    { real: false, name: 'APEX + MODFLOW is recognized as APEX-MODFLOW', fixture: 'apex_modflow',
      check: function (r, f) { var s = one(r, f); eq(f, 'coupling', s.coupling, 'apex-modflow'); } },
    { real: false, name: 'An empty upload does not default to any model', fixture: 'empty_upload',
      check: function (r, f) { eq(f, 'identified', r.identified, false); eq(f, 'coupling', r.systems[0].coupling, 'unknown'); } },
    { real: false, name: 'Unrelated files do not default to any model', fixture: 'random_files',
      check: function (r, f) { eq(f, 'identified', r.identified, false); eq(f, 'coupling', r.systems[0].coupling, 'unknown'); } },
    { real: false, name: 'Two SWAT+ scenarios plus one MODFLOW 6 model: the groundwater attaches to the nearer scenario and the tie is reported',
      entries: function () {
        var NL = '\n', st = 'time.sim: written by SWAT+ editor v4.0.2 on 2026-09-09 16:56 for SWAT+ rev. 62';
        function f(p, t) { return { path: p, size: (t || '').length, text: t === undefined ? null : t }; }
        return [ f('p/A/time.sim', st), f('p/A/print.prt', st), f('p/B/time.sim', st), f('p/B/print.prt', st),
                 f('p/B/mf6/mfsim.nam', 'BEGIN timing' + NL + ' TDIS6 s.tdis' + NL + 'END timing') ];
      },
      check: function (r, f) {
        eq(f, 'systems', r.systems.length, 2);
        var withGw = r.systems.filter(function (s) { return s.groundwater.length; });
        eq(f, 'systems with groundwater', withGw.length, 1);
        if (withGw[0] && withGw[0].dir !== 'p/B') f.push('attached to ' + withGw[0].dir + ', want p/B');
      } },
    { real: false, name: 'A SWAT+ model, an APEX model and a MODFLOW 6 model side by side: nothing is coupled by guesswork',
      entries: function () {
        var NL = '\n', st = 'time.sim: written by SWAT+ editor v4.0.2 on 2026-09-09 16:56 for SWAT+ rev. 62';
        function f(p, t) { return { path: p, size: (t || '').length, text: t === undefined ? null : t }; }
        return [ f('Drop/swat/time.sim', st), f('Drop/swat/print.prt', st), f('Drop/apex/APEXCONT.DAT', 'c'),
                 f('Drop/mf6/mfsim.nam', 'BEGIN timing' + NL + ' TDIS6 s.tdis' + NL + 'END timing') ];
      },
      check: function (r, f) {
        eq(f, 'systems', r.systems.length, 3);
        r.systems.forEach(function (s) { if (s.surface && s.groundwater.length) f.push(s.label + ' was coupled to a groundwater model'); });
        var gw = r.systems.filter(function (s) { return !s.surface; })[0];
        if (!gw || !gw.notes.some(function (n) { return /equally close/.test(n); })) f.push('no explanation given for leaving the groundwater model unattached');
      } }
  ];
})();
