"""Where things are on THIS machine: model folders, engine executables, work folder, Node.

Every script in bench/ (and the audit scripts in tests/, through config.js) reads its locations from here and nowhere else.
A value comes from, in this order:
  1. the environment variable HYDRA_BENCH_<KEY>   (KEY upper-case, dots become underscores: models.swat2012 -> HYDRA_BENCH_MODELS_SWAT2012;
     list-valued keys are given as JSON text)
  2. the JSON file named by HYDRA_BENCH_CONFIG, or else bench/hydra_bench.config.json (git-ignored; copy hydra_bench.config.example.json)
If a key is missing the script stops and says which key and what it should point to. There are no default paths.

    python bench/config.py            checks the whole configuration and lists what is missing
"""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = "HYDRA_BENCH_CONFIG"
DEFAULT_FILE = os.path.join(HERE, "hydra_bench.config.json")

BASE_IDS = ("swat2012", "swatplus_p29", "swatmf", "apex", "apexmf", "mf6")

# key -> (kind, what it should point to). kind: dir | file | command | list
KEYS = {
    "work_root": ("workdir", "a folder OUTSIDE every model folder (created if missing), where copies of the models are made and results are written"),
    "node_path": ("command", "the Node.js executable (full path, or just 'node' if it is on PATH)"),
    "models.swat2012": ("dir", "the folder of a working SWAT2012 model (the one that holds file.cio)"),
    "models.swatplus_p29": ("dir", "the TxtInOut folder of a working SWAT+ model (classic aquifers, gwflow files may be present but switched off)"),
    "models.swatmf": ("dir", "the folder of a working SWAT-MODFLOW model (SWAT2012 inputs + modflow.mfn)"),
    "models.apex": ("dir", "the folder of a working APEX model (the one that holds APEXCONT.DAT)"),
    "models.apexmf": ("dir", "the folder of a working APEX-MODFLOW model (APEX inputs + apexmf_link.txt + a MODFLOW subfolder)"),
    "models.mf6": ("dir", "the folder of a working MODFLOW 6 model (the one that holds mfsim.nam)"),
    "executables.swat2012": ("file", "the SWAT2012 executable that runs models.swat2012 (SWAT2012 rev. 664 or compatible)"),
    "executables.swatplus_p29": ("file", "the SWAT+ executable that runs models.swatplus_p29 (the benchmark used SWAT+ rev. 61, a static build)"),
    "executables.swatmf": ("file", "the SWAT-MODFLOW executable that runs models.swatmf"),
    "executables.apex": ("file", "the APEX executable that runs models.apex"),
    "executables.apexmf": ("file", "the APEX-MODFLOW executable that runs models.apexmf"),
    "executables.mf6": ("file", "mf6.exe from MODFLOW 6 (libmf6.dll next to it is copied too when present)"),
    "audit_targets": ("list", "list of {dir, set, status?, expand_prefix?} model folders for tests/audit_fp.js and tests/scan_rows.js"),
    "rules_real_folders": ("list", "list of {name, dir} model folders that ran, for the 'no ERROR on a working model' cases of tests/run_rules_node.js"),
    "rules_true_positive_folders": ("list", "list of {name, dir, pattern} folders where an ERROR whose title matches pattern is expected (tests/run_rules_node.js)"),
    "fixture_sources": ("list", "list of {name, dir, depth} folders whose headers tests/make_fixtures.py stores in tests/fixtures.js"),
}

_cache = {}


def config_file():
    return os.environ.get(ENV_FILE) or DEFAULT_FILE


def env_name(key):
    return "HYDRA_BENCH_" + key.upper().replace(".", "_")


def _load():
    if "data" not in _cache:
        p = config_file()
        data = {}
        if os.path.isfile(p):
            with open(p, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        _cache["data"] = data
        _cache["found"] = os.path.isfile(p)
    return _cache["data"]


def file_found():
    _load()
    return _cache["found"]


def _lookup(key):
    """The raw value for `key` or None."""
    ev = os.environ.get(env_name(key))
    if ev not in (None, ""):
        if KEYS[key][0] == "list":
            try:
                return json.loads(ev)
            except ValueError:
                fail(key, "the environment variable %s must hold JSON text" % env_name(key))
        return ev
    node = _load()
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node if node not in ("", None) else None


def fail(key, why=None):
    kind, what = KEYS[key]
    lines = ["hydra-bench: " + (why or "the setting '%s' is missing." % key),
             "  '%s' should point to: %s." % (key, what),
             "  Give it in %s (copy hydra_bench.config.example.json to that name) or in the environment variable %s." % (config_file(), env_name(key))]
    if not file_found():
        lines.append("  (the file %s does not exist)" % config_file())
    sys.stderr.write("\n".join(lines) + "\n")
    raise SystemExit(2)


def get(key):
    """Value of a required key; stops the script with a clear message if it is missing or points to nothing."""
    if key not in KEYS:
        raise KeyError(key)
    v = _lookup(key)
    if v is None:
        fail(key)
    kind = KEYS[key][0]
    if kind == "dir" and not os.path.isdir(v):
        fail(key, "'%s' = %s is not an existing folder." % (key, v))
    if kind == "file" and not os.path.isfile(v):
        fail(key, "'%s' = %s is not an existing file." % (key, v))
    if kind == "command" and not (os.path.isfile(v) or shutil.which(v)):
        fail(key, "'%s' = %s is neither an existing file nor a command on PATH." % (key, v))
    if kind == "list" and not isinstance(v, list):
        fail(key, "'%s' must be a list." % key)
    return v


def work_root():
    return get("work_root")


def model_dir(base_id):
    return get("models." + base_id)


def executable(base_id):
    return get("executables." + base_id)


def check():
    """Print every key with its status; return the number of problems."""
    bad = 0
    print("configuration file: %s (%s)" % (config_file(), "found" if file_found() else "NOT FOUND"))
    for key in KEYS:
        v = _lookup(key)
        status = "ok"
        if v is None:
            status = "MISSING"
        else:
            kind = KEYS[key][0]
            if kind == "dir" and not os.path.isdir(v):
                status = "folder not found"
            elif kind == "file" and not os.path.isfile(v):
                status = "file not found"
            elif kind == "command" and not (os.path.isfile(v) or shutil.which(v)):
                status = "command not found"
            elif kind == "list" and not isinstance(v, list):
                status = "not a list"
        if status != "ok":
            bad += 1
        print("  %-30s %-18s %s" % (key, status, KEYS[key][1]))
    return bad


if __name__ == "__main__":
    n = check()
    print("%d problem(s)" % n)
    sys.exit(1 if n else 0)
