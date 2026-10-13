"""Round-3 runner: the forum-derived faults of faults_v3.py, run exactly like round 2 (same copies, engines, timeouts, judging, comparison).

    python bench/run_v3.py [id-prefix ...]       run (or resume) the cases   (--dry: inject only, --redo: run again, --report: counts)

Writes <work_root>/results_v3.json and run_v3_log.txt; the reference runs of the unmodified bases are taken over from results_v2.json (their
work folders v2_REF_<base> are reused, not run again). Existing result files are not modified. The tool is not called and nothing is scored.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines, run_v2, faults_v3

W = engines.WORK_ROOT
V2 = os.path.join(W, "results_v2.json")
run_v2.FAULTS_V2 = faults_v3.FAULTS_V3
run_v2.RES = os.path.join(W, "results_v3.json")
run_v2.LOG = os.path.join(W, "run_v3_log.txt")
run_v2.LOCK = os.path.join(W, "run_v3.lock")

if not os.path.exists(run_v2.RES) and os.path.exists(V2) and "--dry" not in sys.argv:
    with open(run_v2.RES, "w", encoding="utf-8") as fh:
        json.dump({"_ref": json.load(open(V2))["_ref"]}, fh, indent=1)

run_v2.main()

if os.path.exists(run_v2.RES) and "--dry" not in sys.argv and "--report" not in sys.argv:
    res = json.load(open(run_v2.RES))
    for f in faults_v3.FAULTS_V3:
        if f[0] in res:
            res[f[0]]["forum_urls"] = faults_v3.forum_urls(f[3])
    run_v2.save(res)
