/* Hydro-Model Diagnostic Assistant: model characterization.
 *
 * Input : a list of entries {path, size, text}  (text is null for files that were not read as text)
 * Output: what the uploaded files are -- surface model, version, groundwater component, coupling --
 *         with the evidence behind every claim, what is missing, and what is ambiguous.
 *
 * Design rules (they exist so that no user is left out):
 *  1. Never require the user to know the model, version, or coupling. Detect, show the reasoning, allow override.
 *  2. Never fall back silently. Unknown stays "unknown" and says what was seen.
 *  3. Accept partial uploads and parent-folder drops (several components, several scenarios).
 *  4. Old file formats are classified, not rejected.
 *
 * Every signature below carries a `basis` tag saying how it was established:
 *   'sample'    seen in real model files on the author's machine
 *   'source'    read in the model source code
 *   'documented' stated in official documentation or in the author's corpus analysis
 *   'needs-sample' written from knowledge of the format; NOT yet checked against a real folder
 */
(function (root) {
  'use strict';
  var HDA = root.HDA = root.HDA || {};

  /* ------------------------------------------------------------------ utilities */
  function norm(p) { return String(p).replace(/\\/g, '/').replace(/^\.\//, ''); }
  function baseOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? p : p.slice(i + 1); }
  function dirOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
  function extOf(b) { var i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1); }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function firstLine(t) { return t ? t.split(/\r?\n/, 1)[0] : ''; }
  function ev(file, why) { return { file: file, why: why }; }

  function normalizeEntries(entries) {
    return entries.map(function (e) {
      var path = norm(e.path || e.name || '');
      var base = baseOf(path).toLowerCase();
      return { path: path, base: base, ext: extOf(base), dir: dirOf(path), size: e.size || 0,
               text: (typeof e.text === 'string') ? e.text : null };
    });
  }

  /* Components dropped together share the upload root, so siblings (TxtInOut next to MODFLOW) count as related.
     Which surface model a groundwater component belongs to is decided by path closeness (commonDepth), not here. */
  function related() { return true; }
  function commonDepth(a, b) {
    var x = a === '' ? [] : a.split('/'), y = b === '' ? [] : b.split('/'), i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    return i;
  }

  /* ------------------------------------------------------------------ version stamps (SWAT+) */
  /* basis: sample. Editor-written files carry the revision in line 1; pre-Editor files carry only a database path. */
  var RE_EDITOR = /written by SWAT\+\s*editor\s+v?([\d.]+)\s+on\s+(\d{4}-\d{2}-\d{2})[^\n]*?for SWAT\+\s*rev\.?\s*([\d.]+)/i;
  var RE_LEGACY = /Generated from\s+.*?\.accdb\s+Time:\s*(.*)$/i;

  function parseStamp(text) {
    var line = firstLine(text);
    if (!line) return null;
    var m = RE_EDITOR.exec(line);
    if (m) return { format: 'editor', editor: m[1], date: m[2], rev: m[3], revMajor: parseInt(m[3], 10) };
    m = RE_LEGACY.exec(line);
    if (m) return { format: 'legacy', date: m[1].trim() };
    return null;
  }

  /* ------------------------------------------------------------------ MODFLOW family */
  var RE_MF6_BLOCK = /^\s*BEGIN\s+(OPTIONS|PACKAGES|TIMING|MODELS|SOLUTIONGROUP|DIMENSIONS)\b/im;
  var RE_LEGACY_PKG = /^\s*(LIST|DATA|DATA\(BINARY\)|BAS6?|DISU?|BCF6|LPF|UPW|HUF2|NWT|PCGN?|SIP|SOR|DE4|GMG|SMS|OC|RIV|WEL|RCH|EVT|DRN|GHB|CHD|HFB6|STR|SFR|UZF|LAK|MNW2|BTN|ADV|DSP|GCG|FTL|VDF|VSC|SWI2)\s+\d+\s+\S+/gim;

  function classifyModflowNameFile(entry) {
    var t = entry.text;
    if (!t) return null;
    if (entry.base === 'mfsim.nam' || RE_MF6_BLOCK.test(t)) {
      return { kind: 'modflow6', file: entry.path,
               why: entry.base === 'mfsim.nam' ? 'mfsim.nam is the MODFLOW 6 simulation name file'
                                               : 'BEGIN/END block syntax is MODFLOW 6' };
    }
    var m = t.match(RE_LEGACY_PKG);
    if (m && m.length >= 2) {
      var sub = 'modflow-legacy';
      if (/^\s*(NWT|UPW)\s/im.test(t)) sub = 'modflow-nwt';
      else if (/^\s*(DISU|SMS)\s/im.test(t)) sub = 'modflow-usg';
      else if (/^\s*(LPF|BCF6|HUF2)\s/im.test(t) && /^\s*(PCGN?|SIP|SOR|DE4|GMG)\s/im.test(t)) sub = 'modflow-2005';
      return { kind: sub, file: entry.path,
               why: m.length + ' unit-numbered package lines (LIST/BAS/DIS/...) are the MODFLOW-2005 family name-file format' };
    }
    return null;
  }

  var RE_MF6_VERSION = /VERSION\s+(\d+\.\d+\.\d+)/i;
  var RE_MFLEG_VERSION = /(MODFLOW-[A-Z0-9-]+)[\s\S]{0,300}?VERSION\s+([\d.]+)/i;

  /* What a MODFLOW 6 simulation contains: model types (GWF/GWT/...), grid type, packages. basis: sample (FloPy-written MF6 6.7.0 models) */
  var MF6_MODEL_TYPES = /^(gwf|gwt|gwe|prt|olf|chf|swf)6$/i;
  function describeMf6(by) {
    var info = { models: [], grid: null, transport: false };
    var sim = by['mfsim.nam'] && by['mfsim.nam'][0];
    var simText = (sim && sim.text) || '';
    var re = /^\s*([a-z]{3}6)\s+(\S+)\s+(\S+)\s*$/gim, m;
    while ((m = re.exec(simText))) {
      if (!MF6_MODEL_TYPES.test(m[1])) continue;
      var nameFile = by[m[2].toLowerCase()] && by[m[2].toLowerCase()][0];
      var pk = [];
      if (nameFile && nameFile.text) {
        var block = /BEGIN\s+PACKAGES([\s\S]*?)END\s+PACKAGES/i.exec(nameFile.text);
        if (block) block[1].split(/\r?\n/).forEach(function (ln) {
          var p = /^\s*([A-Za-z0-9]+)6\s+\S+/.exec(ln);
          if (p) pk.push(p[1].toUpperCase());
        });
      }
      var type = m[1].slice(0, 3).toUpperCase();
      info.models.push({ type: type, name: m[3], file: m[2], packages: uniq(pk) });
      if (type === 'GWT') info.transport = true;
    }
    var all = [];
    info.models.forEach(function (x) { all = all.concat(x.packages); });
    info.grid = ['DISV', 'DISU', 'DIS'].filter(function (g) { return all.indexOf(g) >= 0; })[0] || null;
    info.packages = uniq(all);
    return info;
  }

  /* ------------------------------------------------------------------ per-directory analysis */
  function analyzeDirectory(dir, files) {
    var by = {};
    files.forEach(function (f) { (by[f.base] = by[f.base] || []).push(f); });
    function has(name) { return !!by[name]; }
    function get(name) { return by[name] ? by[name][0] : null; }
    function anyBase(re) { return files.filter(function (f) { return re.test(f.base); }); }
    var res = { dir: dir, nFiles: files.length, kinds: [], evidence: [] };

    /* --- SWAT+ --- basis: sample */
    if (has('time.sim') && (has('print.prt') || has('file.cio') || has('object.cnt') || has('hru-data.hru') || has('codes.bsn'))) {
      var sp = { family: 'swatplus', evidence: [ev(get('time.sim').path, 'time.sim exists (SWAT+ simulation period file)')] };
      var stamps = [], unstamped = 0, legacy = 0;
      files.forEach(function (f) {
        if (!f.text) return;
        var s = parseStamp(f.text);
        if (s) { s.file = f.path; stamps.push(s); }
      });
      var edit = stamps.filter(function (s) { return s.format === 'editor'; });
      legacy = stamps.filter(function (s) { return s.format === 'legacy'; }).length;
      var revCount = {};
      edit.forEach(function (s) { revCount[s.rev] = (revCount[s.rev] || 0) + 1; });
      var majors = uniq(edit.map(function (s) { return s.revMajor; }));
      sp.stamps = { editorStamped: edit.length, legacyStamped: legacy, byRevision: revCount, editorVersions: uniq(edit.map(function (s) { return s.editor; })) };
      sp.mixedRevisions = majors.length > 1;
      if (sp.mixedRevisions) {
        var dom = Object.keys(revCount).sort(function (a, b) { return revCount[b] - revCount[a]; })[0];
        sp.stamps.minorityFiles = edit.filter(function (s) { return s.rev !== dom; }).map(function (s) { return baseOf(s.file) + ' (rev ' + s.rev + ')'; }).slice(0, 10);
      }
      if (edit.length) {
        /* dominant revision = the one on most files */
        var best = Object.keys(revCount).sort(function (a, b) { return revCount[b] - revCount[a]; })[0];
        sp.revision = best;
        sp.revisionConfidence = sp.mixedRevisions ? 'medium' : 'high';
        sp.evidence.push(ev(edit[0].file, 'first line states "for SWAT+ rev. ' + edit[0].rev + '" (SWAT+ Editor ' + edit[0].editor + ')'));
      } else if (legacy) {
        sp.revision = null;
        sp.format = 'pre-editor';
        sp.revisionConfidence = 'medium';
        sp.evidence.push(ev(stamps[0].file, 'first line is "Generated from ...accdb": a pre-Editor SWAT+ file format with no revision number'));
      } else {
        sp.revision = null;
        sp.revisionConfidence = 'low';
        sp.evidence.push(ev(get('time.sim').path, 'no version stamp found in any readable file (hand-edited or stripped)'));
      }
      /* groundwater inside SWAT+: parse file.cio connect row. basis: sample */
      var cio = get('file.cio');
      var connect = null;
      if (cio && cio.text) {
        var line = cio.text.split(/\r?\n/).filter(function (l) { return /^\s*connect\b/i.test(l); })[0];
        if (line) connect = line.trim().split(/\s+/).slice(1).map(function (x) { return x.toLowerCase(); });
      }
      var gwInput = get('gwflow.input');
      var gw = { present: !!gwInput || has('gwflow.con') };
      gw.activeInCio = connect ? (connect.indexOf('gwflow.con') >= 0) : null;
      gw.lumpedAquiferInCio = connect ? (connect.indexOf('aquifer.con') >= 0) : null;
      /* the switch SWAT+ itself reads: codes.bsn column "gwflow" (bsn_cc%gwflow). basis: sample + source */
      var cb = get('codes.bsn');
      gw.codesFlag = null;
      if (cb && cb.text) {
        var cl = cb.text.split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (cl.length >= 3) {
          var hdr = cl[1].trim().split(/\s+/), val = cl[2].trim().split(/\s+/), gi = hdr.indexOf('gwflow');
          if (hdr.indexOf('qual2e') >= 0 && hdr.indexOf('idc_till') >= 0) sp.codesLayout = 62;
          else if (hdr.indexOf('i_fpwet') >= 0) sp.codesLayout = 61;
          sp.codesColumns = hdr.length;
          if (gi >= 0 && /^[01]$/.test(val[gi] || '')) gw.codesFlag = parseInt(val[gi], 10);
        }
      }
      gw.active = gw.codesFlag !== null ? gw.codesFlag === 1 : (gw.activeInCio === true);
      if (gw.codesFlag !== null && gw.activeInCio !== null && (gw.codesFlag === 1) !== gw.activeInCio) gw.flagDisagreement = true;
      /* MF6SWATP hook: activates when mf6swatp.cfg exists in the working directory. basis: source (mf6swatp_module.f90) */
      var cfgFile = get('mf6swatp.cfg');
      if (cfgFile) sp.mf6swatp = { cfg: cfgFile.path };
      if (gwInput && gwInput.text) {
        var T = gwInput.text;
        var gt = /^\s*(structured|unstructured)\b/im.exec(T);
        gw.grid = gt ? gt[1].toLowerCase() : null;
        var cells = /^\s*(\d+)\s+number of cells/im.exec(T);
        if (cells) gw.cells = parseInt(cells[1], 10);
        var rows = /^\s*(\d+)\s+(\d+)\s+number of rows, number of columns/im.exec(T);
        if (rows) gw.rowsCols = [parseInt(rows[1], 10), parseInt(rows[2], 10)];
        var rc = /^\s*(\d)\s+recharge connection type/im.exec(T);
        if (rc) gw.rechargeConnection = (rc[1] === '2') ? 'LSU-cell' : 'HRU-cell';
        var gs = /^\s*(\d)\s+groundwater-->soil transfer/im.exec(T);
        if (gs) gw.gwToSoilTransfer = (gs[1] === '1');
        var st = parseStamp(T);
        if (st && st.format === 'editor') gw.writtenForRev = st.rev;
      }
      /* gwflow generation by file names. basis: sample (2024 ARB/usg examples vs rev 61/62 Pecos) */
      var oldGen = ['gwflow.hrucell', 'gwflow.huc12cell', 'gwflow.canals', 'gwflow.solutes', 'gwflow.tiles'].filter(has);
      var newGen = ['gwflow.lsucell', 'gwflow.pumpex', 'gwflow.floodplain', 'gwflow.obs'].filter(has);
      if (gw.present) {
        gw.generation = newGen.length ? 'rev61+ (LSU-capable file set)' : (oldGen.length ? 'pre-rev61 (HRU-cell file set)' : 'unknown');
        gw.generationFiles = newGen.concat(oldGen);
      }
      sp.exes = files.filter(function (f) { return f.ext === 'exe'; }).map(function (f) { return f.base; });
      sp.gwflow = gw;
      sp.hasLumpedAquifer = has('aquifer.aqu') || has('aquifer.con');
      res.kinds.push(sp);
    }

    /* --- SWAT2012 --- basis: documented (file.cio with NBYR labels); needs a real folder to verify */
    var cio2 = get('file.cio');
    if (cio2 && !has('time.sim')) {
      var isSwat = (cio2.text && /\bNBYR\b/.test(cio2.text)) || (anyBase(/\.sub$/).length && anyBase(/\.hru$/).length);
      if (isSwat) {
        var s12 = { family: 'swat2012', basis: 'needs-sample', evidence: [ev(cio2.path, 'file.cio with NBYR/IYR labels (SWAT2012/2009/2005 control file)')] };
        var std = get('output.std');
        if (std && std.text) {
          /* basis: sample (SWAT-MODFLOW3 Middle Bosque: "VER 2012/Rev 636_smrt"; the _smrt suffix marks the SWAT-MODFLOW build) */
          var vm = /VER\s*(\d{4})\s*\/\s*Rev\s*(\d+[A-Za-z0-9_]*)/i.exec(std.text);
          if (vm) {
            s12.revision = 'Rev ' + vm[2]; s12.revisionConfidence = 'high';
            s12.evidence.push(ev(std.path, 'output.std banner: VER ' + vm[1] + '/Rev ' + vm[2]));
            if (/_smrt$/i.test(vm[2])) { s12.smrtBuild = true; s12.evidence.push(ev(std.path, 'the "_smrt" suffix marks the SWAT-MODFLOW executable build')); }
          }
        }
        if (!s12.revision) {
          files.forEach(function (f) {
            var m = /^rev(\d{3,4})\w*\.exe$/i.exec(f.base);
            if (m && !s12.revision) { s12.revision = 'Rev ' + m[1] + ' (from the executable name)'; s12.revisionConfidence = 'low';
              s12.evidence.push(ev(f.path, 'version guessed from the executable name ' + f.base)); }
          });
        }
        if (!s12.revision) { s12.revision = null; s12.revisionConfidence = 'low'; }
        res.kinds.push(s12);
      }
    }

    /* --- APEX --- basis: needs-sample */
    var apexMark = ['apexcont.dat', 'apexrun.dat', 'apexfile.dat'].filter(has);
    if (apexMark.length) {
      var ax = { family: 'apex', basis: 'sample', revision: null, revisionConfidence: 'low',
        evidence: apexMark.map(function (n) { return ev(get(n).path, n.toUpperCase() + ' is an APEX control/run file'); }) };
      files.forEach(function (f) {
        var m = /^apex(\d{4})\.exe$/i.exec(f.base);
        if (m && !ax.revision) { ax.revision = 'APEX' + m[1]; ax.revisionConfidence = 'medium';
          ax.evidence.push(ev(f.path, 'version taken from the executable name (' + f.base + '); APEX input files do not state a version')); }
      });
      res.kinds.push(ax);
    }

    /* --- MODFLOW --- name files found in this directory */
    var mfFiles = [];
    files.forEach(function (f) {
      if (f.ext === 'nam' || f.ext === 'mfn' || f.base === 'mfsim.nam') {
        var c = classifyModflowNameFile(f);
        if (c) mfFiles.push(c);
      }
    });
    if (mfFiles.length) {
      var kind = mfFiles.some(function (c) { return c.kind === 'modflow6'; }) ? 'modflow6' : mfFiles[0].kind;
      var mf = { family: kind, basis: kind === 'modflow6' ? 'documented' : 'documented',
                 evidence: mfFiles.map(function (c) { return ev(c.file, c.why); }) };
      /* version from a listing file if one was provided */
      files.forEach(function (f) {
        if (mf.revision || !f.text || !/\.(lst|list)$|^mfsim\.lst$/.test(f.base)) return;
        var v = (kind === 'modflow6') ? RE_MF6_VERSION.exec(f.text) : RE_MFLEG_VERSION.exec(f.text);
        if (v) { mf.revision = (kind === 'modflow6') ? v[1] : (v[1] + ' ' + v[2]); mf.revisionConfidence = 'high';
                 mf.evidence.push(ev(f.path, 'listing file states version ' + mf.revision)); }
      });
      if (!mf.revision) { mf.revision = null; mf.revisionConfidence = 'low'; }
      mf.tdis = anyBase(/\.tdis$/).length > 0;
      if (kind === 'modflow6') mf.mf6 = describeMf6(by);
      res.kinds.push(mf);
    }

    /* --- SWAT-MODFLOW / SWAT+MODFLOW linkage markers --- basis: documented / source */
    var link = {};
    var swatmf = anyBase(/^swatmf/);          /* swatmf_link.txt, swatmf.* : SWAT(2012)-MODFLOW runtime linkage (corpus) */
    if (swatmf.length) link.swatmf = swatmf.map(function (f) { return ev(f.path, 'SWAT-MODFLOW linkage file name'); });
    var smrt = anyBase(/^smrt\./);            /* smrt.hrucells etc.: SWAT+MODFLOW (Bailey 2025) a-priori linkage; basis: source */
    if (smrt.length) link.smrt = smrt.map(function (f) { return ev(f.path, 'smrt.* linkage file used by SWAT+MODFLOW'); });
    var mfn = anyBase(/\.mfn$/);
    if (mfn.length) link.mfn = mfn.map(function (f) { return ev(f.path, '.mfn file maps MODFLOW packages in SWAT-MODFLOW'); });
    var apexmf = anyBase(/^apexmf[._]/);          /* apexmf_link.txt, apexmf_grid2sa.txt ... basis: sample (AMRS data/animas) */
    if (apexmf.length) link.apexmf = apexmf.slice(0, 3).map(function (f) { return ev(f.path, 'APEX-MODFLOW linkage file name'); });
    var exports = anyBase(/^mf6swatp_day_\d+\.txt$/);   /* daily exports written by the MF6SWATP hook. basis: source */
    if (exports.length) link.mf6swatp = [ev(exports[0].path, exports.length + ' daily export file(s) written by the MF6SWATP hook (mf6swatp_day_NNNNNN.txt)')];
    if (Object.keys(link).length) res.link = link;

    /* --- scripts that hint at an API / offline coupling with MODFLOW 6 --- basis: needs-sample */
    var scripts = files.filter(function (f) { return (f.ext === 'py' || f.ext === 'ipynb') && f.text; });
    var hints = {};
    scripts.forEach(function (f) {
      if (/\b(modflowapi|xmipy|ModflowApi)\b/.test(f.text)) (hints.api = hints.api || []).push(ev(f.path, 'imports the MODFLOW 6 API (modflowapi/xmipy)'));
      if (/\bflopy\b/i.test(f.text)) (hints.flopy = hints.flopy || []).push(ev(f.path, 'uses FloPy to build or read a MODFLOW model'));
      if (/\bswatplus|SWAT\+|TxtInOut\b/i.test(f.text)) (hints.swat = hints.swat || []).push(ev(f.path, 'mentions SWAT+ / TxtInOut'));
    });
    if (Object.keys(hints).length) res.scriptHints = hints;
    return res;
  }

  /* ------------------------------------------------------------------ system assembly */
  var LABEL = {
    'swatplus-gwflow': 'SWAT+ with the built-in gwflow groundwater module',
    'swatplus-lumped': 'SWAT+ with lumped (conceptual) aquifers',
    'swatplus-modflow-nwt': 'SWAT+MODFLOW (SWAT+ coupled to MODFLOW-NWT)',
    'swatplus-modflow-legacy': 'SWAT+ with a legacy MODFLOW model (linkage files not found)',
    'swatplus-modflow6': 'SWAT+ with MODFLOW 6',
    'swatplus-mf6swatp': 'SWAT+ coupled to MODFLOW 6 through MF6SWATP',
    'swat-modflow': 'SWAT-MODFLOW (SWAT2012 coupled to MODFLOW)',
    'swat2012-lumped': 'SWAT2012 with its built-in aquifers',
    'apex-alone': 'APEX',
    'apex-modflow': 'APEX-MODFLOW',
    'modflow6-alone': 'MODFLOW 6 groundwater model',
    'modflow-legacy-alone': 'MODFLOW (2005/NWT/USG) groundwater model',
    'unknown': 'Not identified'
  };

  function assemble(dirResults, allEntries) {
    var surfaces = [], gws = [];
    dirResults.forEach(function (d) {
      d.kinds.forEach(function (k) {
        var item = { dir: d.dir, k: k, d: d };
        if (k.family === 'swatplus' || k.family === 'swat2012' || k.family === 'apex') surfaces.push(item);
        else gws.push(item);
      });
    });
    var systems = [], used = [];

    function attach(surf) {
      /* groundwater components in the same tree, nearest first */
      var cand = gws.filter(function (g) { return related(g.dir, surf.dir); });
      cand.sort(function (a, b) { return commonDepth(b.dir, surf.dir) - commonDepth(a.dir, surf.dir); });
      return cand;
    }

    surfaces.forEach(function (s) {
      var sys = { surface: s.k, dir: s.dir, groundwater: [], missing: [], ambiguity: [], notes: [], problems: [] };
      var cands = attach(s);
      /* more than one surface component in the upload: attach a groundwater model only when it is STRICTLY closer to
         this one. A tie means the files do not say which pair is meant, so nothing is coupled by guesswork. */
      if (surfaces.length > 1) {
        cands = cands.filter(function (g) {
          var mine = commonDepth(g.dir, s.dir);
          return surfaces.every(function (o) { return o === s || commonDepth(g.dir, o.dir) < mine; });
        });
      }
      sys.groundwater = cands.map(function (g) { return g.k; });
      sys.dirs = uniq([s.dir].concat(cands.map(function (g) { return g.dir; })));
      cands.forEach(function (g) { used.push(g); });
      var link = {};
      var roots = [s.dir].concat(cands.map(function (g) { return g.dir; }));
      dirResults.forEach(function (d) {
        var inTree = roots.some(function (r) { return r === '' || d.dir === r || d.dir.indexOf(r + '/') === 0; });
        if (inTree && d.link) Object.keys(d.link).forEach(function (k) { link[k] = (link[k] || []).concat(d.link[k]); });
      });
      var hints = s.d.scriptHints || {};
      cands.forEach(function (g) { if (g.d.scriptHints) Object.keys(g.d.scriptHints).forEach(function (k) { hints[k] = (hints[k] || []).concat(g.d.scriptHints[k]); }); });
      /* also scripts anywhere in the upload */
      dirResults.forEach(function (d) { if (d.scriptHints && related(d.dir, s.dir)) Object.keys(d.scriptHints).forEach(function (k) { if (!hints[k]) hints[k] = d.scriptHints[k]; }); });
      sys.link = link; sys.scriptHints = hints;

      var mf6 = cands.filter(function (g) { return g.k.family === 'modflow6'; });
      var mfl = cands.filter(function (g) { return /^modflow-(legacy|2005|nwt|usg)$/.test(g.k.family); });

      if (s.k.family === 'swatplus') {
        var gw = s.k.gwflow || {};
        var gwActive = gw.present && gw.active;
        var mf6sp = s.k.mf6swatp || link.mf6swatp;
        if (mf6sp) {
          sys.coupling = 'swatplus-mf6swatp';
          sys.couplingConfidence = s.k.mf6swatp ? 'high' : 'medium';
          if (!mf6.length) sys.missing.push('MF6SWATP needs a MODFLOW 6 model next to the SWAT+ run. None was found in this upload.');
          if (!s.k.mf6swatp) sys.notes.push('MF6SWATP export files were found, but mf6swatp.cfg was not. The hook only runs when that file is in the SWAT+ working folder.');
          if (s.k.mf6swatp && gw.codesFlag === 1) {
            sys.problems.push({ sev: 'error', file: 'codes.bsn',
              title: 'MF6SWATP is switched on but gwflow is also on: SWAT+ will stop',
              detail: 'mf6swatp.cfg exists, and codes.bsn has gwflow = 1. The MF6SWATP hook refuses to run with gwflow active (MODFLOW 6 replaces the aquifers) and ends the run with a fatal message.',
              fix: 'Set gwflow = 0 in codes.bsn, or remove mf6swatp.cfg, then run again.',
              basis: 'source: mf6swatp_module.f90 (mf6swatp_check_enabled)' });
          }
        } else if (mf6.length) {
          sys.coupling = 'swatplus-modflow6';
          sys.couplingConfidence = 'medium';
          sys.notes.push('The files show SWAT+ and MODFLOW 6 side by side. They do not show HOW they are coupled (offline, one-way recharge hand-off, or API-driven). Say which, or add the scripts that connect them.');
          if (hints.api) sys.notes.push('An MODFLOW 6 API script was found, which suggests an API-driven coupling.');
          if (gw.present) sys.ambiguity.push('gwflow input files are present AND a MODFLOW 6 model is present. Only one of them is normally the active groundwater model.');
        } else if (mfl.length) {
          if (link.smrt) { sys.coupling = 'swatplus-modflow-nwt'; sys.couplingConfidence = 'high'; }
          else { sys.coupling = 'swatplus-modflow-legacy'; sys.couplingConfidence = 'low';
                 sys.missing.push('SWAT+MODFLOW normally needs its smrt.* linkage files next to the model. None were found.'); }
          if (gw.present) sys.ambiguity.push('gwflow input files are present alongside a legacy MODFLOW model.');
        } else if (gwActive) {
          sys.coupling = 'swatplus-gwflow';
          sys.couplingConfidence = (gw.codesFlag === 1 || gw.activeInCio === true) ? 'high' : 'medium';
          if (gw.codesFlag === null && gw.activeInCio === null) sys.notes.push('Neither codes.bsn nor file.cio could be read, so it could not be confirmed that gwflow is switched on.');
        } else {
          sys.coupling = 'swatplus-lumped';
          sys.couplingConfidence = s.k.hasLumpedAquifer ? 'high' : 'medium';
        }
        if (gw.present && !gw.active) sys.ambiguity.push('gwflow input files exist but the module is switched off (' + (gw.codesFlag === 0 ? 'codes.bsn has gwflow = 0' : 'file.cio does not connect gwflow.con') + ').');
        if (gw.flagDisagreement) sys.ambiguity.push('codes.bsn says gwflow = ' + gw.codesFlag + ' but file.cio ' + (gw.activeInCio ? 'connects' : 'does not connect') + ' gwflow.con. The two disagree.');
        if (!gw.present && gw.codesFlag === 1 && !s.k.mf6swatp) sys.missing.push('codes.bsn switches gwflow on, but gwflow.input was not found.');
        if (s.k.codesLayout && s.k.revision) {
          var domMajor = parseInt(s.k.revision, 10);
          var layoutMismatch = (s.k.codesLayout === 62 && domMajor < 62) || (s.k.codesLayout === 61 && domMajor >= 62);
          if (layoutMismatch) {
            sys.notes.push('codes.bsn has the rev-' + s.k.codesLayout + ' column layout (' + s.k.codesColumns + ' columns), but most files here are rev ' + s.k.revision +
              '. In rev 62 the column i_fpwet became qual2e and idc_till was added, so an executable of the other revision reads this file shifted by one column' +
              (s.k.exes && s.k.exes.length ? ' (executables in the folder: ' + s.k.exes.slice(0, 4).join(', ') + ')' : '') + '. Make sure the executable matches the codes.bsn revision.');
          }
        }
        if (s.k.mixedRevisions) sys.notes.push('Files in this folder were written for different SWAT+ revisions (' + Object.keys(s.k.stamps.byRevision).join(', ') + '). Minority files: ' + (s.k.stamps.minorityFiles || []).join(', ') + '. This is flagged for you to check, not as an error: the revision stamp records what wrote the file, not whether it still fits.');
      } else if (s.k.family === 'swat2012') {
        if (mfl.length || link.swatmf || link.mfn) {
          sys.coupling = 'swat-modflow';
          sys.couplingConfidence = (mfl.length && (link.swatmf || link.mfn)) ? 'high' : 'medium';
          if (!mfl.length) sys.missing.push('SWAT-MODFLOW linkage was detected, but no MODFLOW model files. Add the MODFLOW folder to check the two together.');
          if (!link.swatmf && !link.mfn) sys.notes.push('A MODFLOW model sits next to SWAT2012 but no swatmf linkage file was found.');
        } else { sys.coupling = 'swat2012-lumped'; sys.couplingConfidence = 'medium'; }
        if (link.apexmf) sys.notes.push('Files named apexmf_* sit next to this SWAT model. They look like leftovers from an APEX-MODFLOW model.');
        if (mf6.length) { sys.coupling = 'swat-modflow'; sys.couplingConfidence = 'low'; sys.notes.push('SWAT2012 with MODFLOW 6 is not a standard coupling; check that these belong together.'); }
      } else if (s.k.family === 'apex') {
        var apexCoupled = mf6.length || mfl.length || link.apexmf;
        sys.coupling = apexCoupled ? 'apex-modflow' : 'apex-alone';
        sys.couplingConfidence = (link.apexmf && (mf6.length || mfl.length)) ? 'high' : 'medium';
        if (link.swatmf) sys.notes.push('Files named swatmf_* sit next to this APEX model. APEX-MODFLOW uses apexmf_* names, so these look like leftovers from a SWAT-MODFLOW model copied into the folder. They are ignored for the classification.');
        if (link.apexmf && !(mf6.length || mfl.length)) sys.missing.push('APEX-MODFLOW linkage files were found but no MODFLOW model. Add the MODFLOW folder to check the pair.');
      }
      sys.label = LABEL[sys.coupling] || LABEL.unknown;
      systems.push(sys);
    });

    /* groundwater components with no surface model in the upload */
    gws.forEach(function (g) {
      if (used.indexOf(g) >= 0) return;
      var sys = { surface: null, dir: g.dir, dirs: [g.dir], groundwater: [g.k], missing: [], ambiguity: [], notes: [], problems: [], link: g.d.link || {}, scriptHints: g.d.scriptHints || {} };
      sys.coupling = (g.k.family === 'modflow6') ? 'modflow6-alone' : 'modflow-legacy-alone';
      sys.couplingConfidence = 'high';
      sys.label = LABEL[sys.coupling];
      if (sys.link.swatmf || sys.link.mfn || sys.link.smrt) sys.missing.push('Linkage files point to a SWAT model, but no SWAT or SWAT+ folder was provided. Drop the parent folder to check the pair.');
      else if (surfaces.length > 1) sys.notes.push('This upload has ' + surfaces.length + ' surface models and this groundwater model is equally close to several of them, so it was not attached to any. Drop it together with its own SWAT / SWAT+ / APEX folder to check the pair.');
      else sys.notes.push('Only a groundwater model was provided. If it is part of a SWAT / SWAT+ / APEX coupling, drop that folder too and the pair will be checked together.');
      systems.push(sys);
    });

    if (!systems.length) {
      systems.push({ surface: null, dir: '', dirs: null, groundwater: [], coupling: 'unknown', couplingConfidence: 'none', label: LABEL.unknown,
        missing: [], ambiguity: [], notes: [], problems: [], link: {}, scriptHints: {} });
    }
    return systems;
  }

  /* ------------------------------------------------------------------ main entry */
  function characterize(entries) {
    var E = normalizeEntries(entries);
    var byDir = {};
    E.forEach(function (e) { (byDir[e.dir] = byDir[e.dir] || []).push(e); });
    var dirResults = Object.keys(byDir).map(function (d) { return analyzeDirectory(d, byDir[d]); })
                                       .filter(function (r) { return r.kinds.length || r.link || r.scriptHints; });
    var systems = assemble(dirResults, E);
    var unread = E.filter(function (e) { return e.text === null; }).length;
    return {
      nFiles: E.length, nUnread: unread, systems: systems,
      identified: systems.some(function (s) { return s.coupling !== 'unknown'; }),
      sawFiles: E.slice(0, 12).map(function (e) { return e.path; })
    };
  }

  /* ------------------------------------------------------------------ plain-language explanation */
  var PLAIN = {
    'swatplus-gwflow': 'SWAT+ simulates the land surface, crops, rivers and reservoirs. In this model the groundwater is calculated by gwflow, a groundwater module built into SWAT+, so there is no separate groundwater program to run. It is simpler to run and to calibrate than a full MODFLOW model.',
    'swatplus-lumped': 'SWAT+ simulates the land surface and rivers, and groundwater is represented by simple "aquifer" storage tanks. There is no map-like groundwater model, so water-table depth and flow between neighbouring areas are not simulated.',
    'swatplus-modflow-nwt': 'SWAT+ simulates the surface and a separate MODFLOW-NWT model simulates groundwater. They exchange water every day through linkage files, so both folders must stay consistent.',
    'swatplus-modflow-legacy': 'A SWAT+ model and a MODFLOW model were found, but the files that tie them together were not. They might be coupled in another way, or not at all.',
    'swatplus-modflow6': 'SWAT+ simulates the surface and MODFLOW 6 simulates groundwater. There are several ways to connect them; the files alone do not say which one is used here.',
    'swatplus-mf6swatp': 'SWAT+ simulates the surface and, once a day, hands recharge to MODFLOW 6, which simulates groundwater. MF6SWATP is the framework under development that makes this exchange; it replaces the SWAT+ aquifers, so gwflow must be off.',
    'swat-modflow': 'SWAT (2012) simulates the surface and MODFLOW simulates groundwater; a linkage layer exchanges water between them. Both folders and the linkage files have to agree on grid, period and units.',
    'swat2012-lumped': 'SWAT2012 simulates the watershed with its own simple shallow and deep aquifers. There is no separate groundwater model.',
    'apex-alone': 'APEX simulates fields and small watersheds (crops, management, soil). It does not simulate a groundwater model by itself.',
    'apex-modflow': 'APEX simulates fields and MODFLOW simulates the aquifer; they exchange water through a linkage layer.',
    'modflow6-alone': 'A MODFLOW 6 groundwater model on its own, with no surface model attached in what was provided.',
    'modflow-legacy-alone': 'A MODFLOW (2005, NWT or USG) groundwater model on its own, with no surface model attached in what was provided.',
    'unknown': 'The files provided did not match any model this tool knows how to recognise.'
  };
  function plainExplanation(system) { return PLAIN[system.coupling] || PLAIN.unknown; }

  HDA.characterize = characterize;
  HDA.plainExplanation = plainExplanation;
  HDA._parseStamp = parseStamp;
  HDA.COUPLING_LABELS = LABEL;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
