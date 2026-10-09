/* Reader for the benchmark configuration used by the node scripts (same keys, same rules as bench/config.py).
 *
 * A value comes from the environment variable HYDRA_BENCH_<KEY> (upper-case, dots become underscores; lists as JSON text),
 * else from the JSON file named by HYDRA_BENCH_CONFIG, else from bench/hydra_bench.config.json (git-ignored; copy
 * hydra_bench.config.example.json). A missing key stops the script with a message naming the key. No default paths. */
'use strict';
const fs = require('fs');
const path = require('path');

const ENV_FILE = 'HYDRA_BENCH_CONFIG';
const configFile = () => process.env[ENV_FILE] || path.join(__dirname, 'hydra_bench.config.json');
const envName = key => 'HYDRA_BENCH_' + key.toUpperCase().replace(/\./g, '_');

const WHAT = {
  node_path: 'the Node.js executable (full path, or just "node" if it is on PATH)',
  audit_targets: 'list of {dir, set, status?, expand_prefix?} model folders for tests/audit_fp.js and tests/scan_rows.js',
  rules_real_folders: 'list of {name, dir} model folders that ran, for the "no ERROR on a working model" cases of tests/run_rules_node.js',
  rules_true_positive_folders: 'list of {name, dir, pattern} folders where an ERROR whose title matches pattern is expected (tests/run_rules_node.js)',
  fixture_sources: 'list of {name, dir, depth} folders whose headers tests/make_fixtures.py stores in tests/fixtures.js',
};

let cache = null;
function load() {
  if (!cache) {
    const p = configFile();
    cache = { found: fs.existsSync(p), data: {} };
    if (cache.found) cache.data = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return cache;
}

function fail(key, why) {
  process.stderr.write([
    'hydra-bench: ' + (why || "the setting '" + key + "' is missing."),
    "  '" + key + "' should point to: " + (WHAT[key] || 'a path (see bench/hydra_bench.config.example.json)') + '.',
    '  Give it in ' + configFile() + ' (copy hydra_bench.config.example.json to that name) or in the environment variable ' + envName(key) + '.',
    load().found ? '' : '  (the file ' + configFile() + ' does not exist)',
  ].filter(Boolean).join('\n') + '\n');
  process.exit(2);
}

/* raw value or undefined */
function lookup(key, isList) {
  const ev = process.env[envName(key)];
  if (ev) {
    if (!isList) return ev;
    try { return JSON.parse(ev); } catch (e) { fail(key, 'the environment variable ' + envName(key) + ' must hold JSON text'); }
  }
  let node = load().data;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node === '' || node === null ? undefined : node;
}

/* a required list (audit_targets, ...) */
function getList(key) {
  const v = lookup(key, true);
  if (v === undefined) fail(key);
  if (!Array.isArray(v)) fail(key, "'" + key + "' must be a list.");
  return v;
}

/* audit_targets -> [{dir, set, status}] of the folders that exist (a folder that is absent is skipped, a missing key stops).
 * An entry with expand_prefix stands for every sub-folder of dir whose name starts with that prefix. */
function auditTargets() {
  const out = [];
  for (const c of getList('audit_targets')) {
    let dir = String(c.dir).split(path.sep).join('/');
    while (dir.endsWith('/')) dir = dir.slice(0, -1);
    if (!fs.existsSync(dir)) continue;
    if (c.expand_prefix) fs.readdirSync(dir).filter(d => d.startsWith(c.expand_prefix)).forEach(d => out.push({ dir: dir + '/' + d, set: c.set, status: c.status || null }));
    else out.push({ dir, set: c.set, status: c.status || null });
  }
  return out;
}

/* true when neither a configuration file nor any HYDRA_BENCH_* variable exists */
function isUnconfigured() {
  return !load().found && !Object.keys(process.env).some(k => k.startsWith("HYDRA_BENCH_") && k !== "HYDRA_BENCH_CONFIG");
}

module.exports = { getList, auditTargets, isUnconfigured, configFile, envName };
