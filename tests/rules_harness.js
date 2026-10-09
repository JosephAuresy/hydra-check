/* Run the page's own rule engine on a real model folder, headless.
 *
 *   node tests/rules_harness.js <folder> [swat_plus|swat2012|swat_mf|modflow]   (default: auto from characterization)
 *
 * The rules are taken verbatim from index.html (nothing is re-implemented), so what this prints is what the page would say.
 * Also exports runRules() for the benchmark scorer. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function sliceBetween(start, endMarker) {
  const a = html.indexOf(start);
  const b = html.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error('cannot find ' + start + ' .. ' + endMarker + ' in index.html');
  return html.slice(a, b);
}
function fnSource(name) {
  const a = html.indexOf('function ' + name + '(');
  const b = html.indexOf('\n}', a);
  if (a < 0 || b < 0) throw new Error('cannot find function ' + name);
  return html.slice(a, b + 2);
}

const textExtLine = html.split('\n').find(l => l.startsWith('const TEXT_EXT'));
const code = [
  textExtLine,
  'const looksTexty = name => TEXT_EXT.test(name) || !/\\./.test(name.split("/").pop());',
  html.split(String.fromCharCode(10)).find(l => l.startsWith('function esc(')),
  fnSource('finding'),
  sliceBetween('const ATTR = {', 'function runChecks()'),
  'globalThis.__RULES = RULES; globalThis.__looksTexty = looksTexty;'
].join('\n');

const ctx = vm.createContext({ console });
ctx.window = ctx;
ctx.FILES = {};
ctx.FILENAMES = [];
vm.runInContext(code, ctx, { filename: 'index.html(rules)' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'characterize.js'), 'utf8'), ctx, { filename: 'characterize.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'char_ui.js'), 'utf8'), ctx, { filename: 'char_ui.js' });
const HDA = ctx.HDA;
const RULES = ctx.__RULES;
const looksTexty = ctx.__looksTexty;

/* Everything the page would receive from dropping this folder: entries for characterization, FILES, FILENAMES. */
function loadFolderFull(dir, maxBytes, skip, recursive) {
  const cap = maxBytes || 40 * 1024 * 1024;
  const entries = [], files = {}, filenames = [];
  const walk = (cur, rel) => {
    for (const f of fs.readdirSync(cur)) {
      const p = path.join(cur, f);
      let st;
      try { st = fs.statSync(p); } catch (_) { continue; }
      const relPath = rel ? rel + '/' + f : f;
      if (st.isDirectory()) { if (recursive && !/^(\.git|__pycache__|\.ipynb_checkpoints)$/.test(f)) walk(p, relPath); continue; }
      if (!st.isFile()) continue;
      filenames.push(relPath);
      let text = null;
      if (st.size === 0) text = '';
      else if (looksTexty(f) && !(skip && skip(f, st.size))) {
        try {
          const fd = fs.openSync(p, 'r');
          const n = Math.min(st.size, cap);
          const buf = Buffer.alloc(n);
          fs.readSync(fd, buf, 0, n, 0);
          fs.closeSync(fd);
          text = buf.toString('utf8');
        } catch (_) { text = null; }
      }
      entries.push({ path: relPath, size: st.size, text });
      if (text !== null) files[f.toLowerCase()] = text;
    }
  };
  walk(dir, '');
  return { entries, files, filenames };
}

function loadFolder(dir) {
  const files = {};
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    let st;
    try { st = fs.statSync(p); } catch (_) { continue; }
    if (!st.isFile()) continue;
    if (st.size === 0) { files[f.toLowerCase()] = ''; continue; }
    if (st.size > 40 * 1024 * 1024 || !looksTexty(f)) continue;
    try { files[f.toLowerCase()] = fs.readFileSync(p, 'utf8'); } catch (_) { /* unreadable */ }
  }
  return files;
}

/* files: {lowercase basename -> text}. Returns the findings the page would produce. */
function runRules(files, fw, filenames) {
  ctx.FILES = files;
  ctx.FILENAMES = filenames || Object.keys(files);
  const out = [];
  (RULES[fw] || []).forEach(r => { try { r(out); } catch (e) { out.push({ sev: 'error', title: 'RULE CRASHED: ' + r.name + ': ' + e.message }); } });
  RULES.generic.forEach(r => { try { r(out); } catch (e) { out.push({ sev: 'error', title: 'RULE CRASHED: ' + r.name + ': ' + e.message }); } });
  return out;
}

module.exports = { runRules, loadFolder, loadFolderFull, RULES, HDA, ctx };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node tests/rules_harness.js <folder> [swat_plus|swat2012|swat_mf|modflow]'); process.exit(2); }
  const full = loadFolderFull(dir);
  const fw = process.argv[3] || HDA.ruleKeyFor(HDA.characterize(full.entries).systems[0]);
  const files = full.files;
  const res = runRules(files, fw, full.filenames);
  console.log(dir + '\n  ' + Object.keys(files).length + ' text files read, rule set: ' + fw + ' + generic, ' + res.length + ' finding(s)');
  res.forEach(f => console.log('  [' + String(f.sev).toUpperCase() + '] ' + f.title + (f.where ? '  @ ' + f.where : '') + (f.detail ? '\n        ' + String(f.detail).replace(/<[^>]+>/g, '').slice(0, 220) : '')));
}
