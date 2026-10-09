/* Presentation of the characterization result: plain language first, evidence one click away.
 * Pure functions (no DOM access) so they can be tested in the same page as characterize.js. */
(function (root) {
  'use strict';
  var HDA = root.HDA = root.HDA || {};

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* which rule set (RULES key in index.html) applies to a characterized system */
  HDA.ruleKeyFor = function (sys) {
    switch (sys && sys.coupling) {
      case 'swatplus-gwflow': case 'swatplus-lumped': case 'swatplus-modflow-nwt':
      case 'swatplus-modflow-legacy': case 'swatplus-modflow6': case 'swatplus-mf6swatp': return 'swat_plus';
      case 'swat2012-lumped': return 'swat2012';
      case 'swat-modflow': return 'swat_mf';
      case 'modflow-legacy-alone': return 'modflow';
      case 'modflow6-alone': return 'modflow6';
      case 'apex-alone': case 'apex-modflow': return 'apex';
      default: return null;
    }
  };

  /* honest statement of what actually ran, so a short list of checks is never mistaken for a clean bill of health */
  HDA.ruleCoverageText = function (sys, ruleKey) {
    var c = sys && sys.coupling;
    var base = {
      swat_plus: 'SWAT+ rule set, written against rev. 61/62 file layouts. Older layouts get the same checks, so a finding may not apply to them.',
      swat2012: 'SWAT2012 rule set.',
      swat_mf: 'SWAT-MODFLOW rule set (linkage, unit numbers, period alignment).',
      modflow: 'MODFLOW-2005/NWT/USG rule set. There are no MODFLOW 6 rules yet.',
      modflow6: 'Two MODFLOW 6 checks: that every file named in the name files exists, and that NPER matches the stress periods defined. Nothing else is checked yet (not convergence, not packages, not units).',
      apex: 'Basic APEX checks only: empty control files (APEXCONT, APEXRUN, APEXFILE) and the APEX-MODFLOW link file. Nothing else in APEX is checked yet.'
    }[ruleKey] || 'No model-specific rules apply; only the generic file checks ran.';
    var extra = '';
    if (c === 'swatplus-gwflow') extra = ' There are no gwflow-specific rules beyond the basic file checks.';
    if (c === 'swatplus-mf6swatp') extra = ' The only MF6SWATP check is that gwflow is off when mf6swatp.cfg is present; the exchange itself is not checked yet.';
    if (c === 'swatplus-modflow-nwt' || c === 'swatplus-modflow6' || c === 'swatplus-modflow-legacy') extra = ' There are no checks for the coupling itself yet, so only the SWAT+ side was examined.';
    if (c === 'apex-modflow') extra = ' The exchange between APEX and MODFLOW is not checked beyond the link file.';
    return base + extra;
  };

  function revisionLine(sf) {
    if (!sf) return '';
    if (sf.family === 'swatplus') {
      if (sf.format === 'pre-editor') return 'SWAT+, pre-Editor file format (no revision number is recorded in these files)';
      if (sf.revision) {
        var s = 'SWAT+ rev. ' + esc(sf.revision) + (sf.stamps && sf.stamps.editorVersions.length ? ' (SWAT+ Editor ' + esc(sf.stamps.editorVersions.join(', ')) + ')' : '');
        if (sf.mixedRevisions) s += ' <b>mixed revisions</b>: ' + esc(Object.keys(sf.stamps.byRevision).map(function (k) { return 'rev ' + k + ' on ' + sf.stamps.byRevision[k] + ' files'; }).join(', '));
        return s;
      }
      return 'SWAT+, revision not stated in the files';
    }
    if (sf.family === 'swat2012') return 'SWAT2012' + (sf.revision ? ', ' + esc(sf.revision) : ', revision not stated in the files');
    if (sf.family === 'apex') return 'APEX, version not stated in the files';
    return esc(sf.family);
  }
  function gwflowLine(gw) {
    if (!gw || !gw.present) return '';
    var bits = ['gwflow'];
    if (gw.grid) bits.push(gw.grid + ' grid' + (gw.cells ? ' of ' + gw.cells.toLocaleString('en-US') + ' cells' : (gw.rowsCols ? ' (' + gw.rowsCols[0] + ' x ' + gw.rowsCols[1] + ')' : '')));
    if (gw.rechargeConnection) bits.push(gw.rechargeConnection + ' recharge');
    if (gw.generation) bits.push('file set: ' + gw.generation);
    if (gw.codesFlag === 1) bits.push('switched on in codes.bsn'); else if (gw.codesFlag === 0) bits.push('switched OFF in codes.bsn');
    else if (gw.activeInCio === false) bits.push('NOT connected in file.cio');
    return esc(bits.join(', '));
  }
  var GWNAME = { modflow6: 'MODFLOW 6', 'modflow-nwt': 'MODFLOW-NWT', 'modflow-usg': 'MODFLOW-USG', 'modflow-2005': 'MODFLOW-2005', 'modflow-legacy': 'MODFLOW (2005/NWT/USG not distinguishable from the files)' };
  function groundwaterLines(sys) {
    return sys.groundwater.map(function (g) {
      var s = esc((GWNAME[g.family] || g.family) + (g.revision ? ' ' + g.revision : '')) + (g.revision ? '' : ' (version not stated in the files)');
      if (g.mf6 && g.mf6.models.length) {
        s += ' &mdash; ' + esc(g.mf6.models.map(function (x) { return x.type; }).join(' + ')) +
             (g.mf6.grid ? ', ' + esc(g.mf6.grid) + ' grid' : '') +
             (g.mf6.transport ? ', with solute transport' : '') +
             (g.mf6.packages.length ? '; packages: ' + esc(g.mf6.packages.join(', ')) : '');
      }
      return s;
    });
  }
  var CONF = { high: 'confident', medium: 'fairly sure', low: 'not sure', none: 'could not identify' };

  function evidenceList(sys) {
    var ev = [];
    if (sys.surface) ev = ev.concat(sys.surface.evidence || []);
    sys.groundwater.forEach(function (g) { ev = ev.concat(g.evidence || []); });
    ['swatmf', 'smrt', 'mfn'].forEach(function (k) { if (sys.link && sys.link[k]) ev = ev.concat(sys.link[k].slice(0, 2)); });
    return ev.slice(0, 14);
  }

  /* char: result of HDA.characterize; sel: index of the system being shown */
  HDA.renderCharacterization = function (char, sel) {
    if (!char) return '';
    var h = '';
    if (char.systems.length > 1) {
      h += '<div class="muted" style="margin-bottom:6px;">' + char.systems.length + ' models were found in what you dropped. Choose which one to check:</div><div class="gallery" style="margin-bottom:10px;">';
      char.systems.forEach(function (s, i) {
        h += '<button class="chip sysbtn' + (i === sel ? ' active' : '') + '" data-i="' + i + '"><span class="fw">' + esc(s.label) + '</span><span class="et">' + esc(s.dir || '(top folder)') + '</span></button>';
      });
      h += '</div>';
    }
    var s = char.systems[Math.min(sel, char.systems.length - 1)];
    if (!s || s.coupling === 'unknown') {
      h += '<div class="finding warning"><span class="head">We could not tell which model this is</span>' +
           '<div style="margin-top:4px;">' + char.nFiles + ' files were received and none matched a model this tool knows. Nothing has been assumed.</div>' +
           '<div class="fix"><b>What you can do:</b> choose the model yourself in Step 1 (SWAT+, SWAT2012, SWAT-MODFLOW, MODFLOW, MODFLOW 6 or APEX), or drop the model folder itself instead of a parent folder. Generic file checks still run below.</div>' +
           (char.sawFiles.length ? '<div class="attr">Files seen: ' + esc(char.sawFiles.join(', ')) + (char.nFiles > char.sawFiles.length ? ' ...' : '') + '</div>' : '') + '</div>';
      return h;
    }
    var ruleKey = HDA.ruleKeyFor(s);
    h += '<div class="finding ok"><span class="head">' + esc(s.label) + '</span> <span class="badge ' + (s.couplingConfidence === 'high' ? 'ok' : 'warning') + '">' + esc(CONF[s.couplingConfidence] || '') + '</span>';
    h += '<div style="margin-top:6px;">' + esc(HDA.plainExplanation(s)) + '</div>';
    var rows = [];
    if (s.surface) rows.push('<b>Surface model:</b> ' + revisionLine(s.surface));
    var gl = s.surface ? gwflowLine(s.surface.gwflow) : '';
    if (gl) rows.push('<b>Groundwater module:</b> ' + gl);
    else if (s.surface && s.surface.family === 'swatplus' && s.coupling === 'swatplus-lumped') rows.push('<b>Groundwater:</b> lumped aquifers (no gwflow connected)');
    groundwaterLines(s).forEach(function (x) { rows.push('<b>Groundwater model:</b> ' + x); });
    rows.forEach(function (r) { h += '<div style="margin-top:4px;font-size:13.5px;">' + r + '</div>'; });
    h += '</div>';
    function list(title, arr, cls) {
      if (!arr.length) return '';
      return '<div class="finding ' + cls + '"><span class="head">' + title + '</span><ul style="margin:6px 0 0 18px;">' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    }
    (s.problems || []).forEach(function (p) {
      h += '<div class="finding error"><span class="head">' + esc(p.title) + '</span> <span class="badge error">WILL STOP THE RUN</span><div style="margin-top:4px;">' + esc(p.detail) + '</div><div class="fix"><b>Fix:</b> ' + esc(p.fix) + '</div><div class="attr">' + esc(p.basis) + '</div></div>';
    });
    h += list('Missing, and why it matters', s.missing, 'warning');
    h += list('Could be read two ways', s.ambiguity, 'warning');
    h += list('Worth knowing', s.notes, 'ok');
    h += '<div class="muted" style="margin:8px 0;"><b>What ran:</b> ' + esc(HDA.ruleCoverageText(s, ruleKey)) + '</div>';
    var ev = evidenceList(s);
    if (ev.length) {
      h += '<details style="margin-top:6px;"><summary>Why we think so (technical detail)</summary><ul style="margin:6px 0 0 18px;font-size:13px;">' +
           ev.map(function (e) { return '<li><code>' + esc(e.file) + '</code>: ' + esc(e.why) + '</li>'; }).join('') + '</ul></details>';
    }
    h += '<div class="muted" style="margin-top:8px;">Not right? Choose the model in Step 1 and the checks will follow your choice.</div>';
    return h;
  };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
