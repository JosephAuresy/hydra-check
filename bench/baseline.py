"""Run every base model once, unmodified, on a copy. A fault experiment is only meaningful if its base works.

    python bench/baseline.py [family ...]        (default: all)
Results are appended to <work_root>/baseline.json (work_root: see bench/config.py)
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines
from bases import BASES, add_extras, prepare

wanted = sys.argv[1:] or list(BASES)
os.makedirs(engines.WORK_ROOT, exist_ok=True)
path = os.path.join(engines.WORK_ROOT, "baseline.json")
results = json.load(open(path)) if os.path.exists(path) else {}

for key in wanted:
    b = BASES[key]
    t0 = time.time()
    wd, n = engines.make_workdir(b["src"], "base_" + key)
    add_extras(b, wd)
    prepare(b, wd)
    copy_s = round(time.time() - t0, 1)
    eng = engines.ENGINES[b["engine"]]
    print("[%s] copied %d input files in %ss; running %s ..." % (key, n, copy_s, b["exe"]), flush=True)
    r = engines.run_exe(wd, b["exe"], timeout=eng["timeout"])
    r["ok"] = bool(eng["ok"](wd, r))
    r["clue"] = engines.crash_clue(r) if not r["ok"] else ""
    r["copied_files"] = n
    r["probe"] = engines.silent_probe(b["engine"], wd)
    r["workdir"] = engines.rel_work(wd)
    results[key] = r
    json.dump(results, open(path, "w"), indent=1)
    print("[%s] ok=%s exit=%s %ss timed_out=%s  %s" % (key, r["ok"], r["exit"], r["seconds"], r["timed_out"], r["clue"]), flush=True)
    if not r["ok"]:
        print("    tail: " + r["stdout_tail"].replace("\n", " | ")[-400:], flush=True)
print("done")
