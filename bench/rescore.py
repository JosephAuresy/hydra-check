"""Score the CURRENT tool on the faults that were already executed (the engine outcomes do not change).

For every fault:  tool_pre  = what the tool says about the pristine faulted inputs (before any run)
                  tool_post = what it says about the same folder AFTER the engine ran (inputs + logs such as diagnostics.out)
Writes <work_root>/results_AFTER.json, then prints the before/after comparison.

    python bench/rescore.py
"""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines
from bases import BASES, add_extras, prepare
from faults import FAULTS
from run_benchmark import tool_report

W = engines.WORK_ROOT
before = json.load(open(os.path.join(W, "results_BEFORE_improvements.json")))
after = {}
by_id = {f[0]: f for f in FAULTS}
for fid, rec in sorted(before.items()):
    f = by_id[fid]
    base = BASES[f[1]]
    wd, n = engines.make_workdir(base["src"], "g_" + fid)
    add_extras(base, wd)
    prepare(base, wd)
    f[6](wd)
    new = dict(rec)
    new["workdir"] = engines.rel_work(rec["workdir"])
    new["tool_before"] = rec.get("tool")
    new["tool_pre"] = tool_report(wd)
    post_dir = engines.abs_work(rec["workdir"])
    new["tool_post"] = tool_report(post_dir) if os.path.isdir(post_dir) else None
    after[fid] = engines.scrub_obj(new)
    json.dump(after, open(os.path.join(W, "results_AFTER.json"), "w"), indent=1)
    print("rescored", fid, flush=True)
print("done")
