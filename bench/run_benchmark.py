"""Seeded-fault pilot: for each fault, (1) copy a working model, (2) inject the fault, (3) ask the tool what it sees BEFORE any run,
(4) run the real engine to learn what the fault really does.

    python bench/run_benchmark.py [fault-id-prefix ...]       (default: every fault whose base model passed its baseline)
Writes <work_root>/results.json (one record per fault; work folders are stored relative to work_root) and prints a table.
"""
import json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines
from bases import BASES, add_extras, prepare
from faults import FAULTS
import config

NODE = config.get("node_path")
HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(engines.WORK_ROOT, "results.json")
BASE_RES = os.path.join(engines.WORK_ROOT, "baseline.json")


def tool_report(folder):
    r = subprocess.run([NODE, os.path.join(HERE, "tool_report.js"), folder], capture_output=True, text=True, encoding="utf-8", timeout=600)
    if r.returncode != 0:
        return {"error": engines.scrub((r.stderr or r.stdout)[-400:])}
    return json.loads(r.stdout)


def main():
    wanted = sys.argv[1:]
    baselines = json.load(open(BASE_RES)) if os.path.exists(BASE_RES) else {}
    results = json.load(open(RES)) if os.path.exists(RES) else {}
    for fid, base, title, prov, kind, locate, apply in FAULTS:
        if wanted and not any(fid.startswith(w) for w in wanted):
            continue
        if not baselines.get(base, {}).get("ok"):
            print("SKIP %-28s base '%s' has no passing baseline" % (fid, base)); continue
        b = BASES[base]
        wd, n = engines.make_workdir(b["src"], "f_" + fid)
        add_extras(b, wd)
        prepare(b, wd)
        rec = {"id": fid, "base": base, "title": title, "provenance": prov, "expected": kind, "locate": locate, "workdir": engines.rel_work(wd)}
        try:
            apply(wd)
        except Exception as e:
            rec["inject_error"] = engines.scrub(str(e))
            results[fid] = rec; print("INJECT FAILED %s: %s" % (fid, e)); continue
        t0 = time.time()
        rec["tool"] = tool_report(wd)
        rec["tool_seconds"] = round(time.time() - t0, 1)
        eng = engines.ENGINES[b["engine"]]
        run = engines.run_exe(wd, b["exe"], timeout=eng["timeout"])
        run["ok"] = bool(eng["ok"](wd, run))
        run["clue"] = engines.crash_clue(run) if not run["ok"] else ""
        run["probe"] = engines.silent_probe(b["engine"], wd)
        rec["run"] = run
        results[fid] = rec
        json.dump(results, open(RES, "w"), indent=1)
        print("%-28s run:%s %5.0fs %-34s tool: %s" % (fid, "OK   " if run["ok"] else "FAIL ", run["seconds"], (run["clue"] or "")[:34],
              "%d finding(s)" % len(rec["tool"].get("findings", [])) if "findings" in rec["tool"] else rec["tool"]), flush=True)


if __name__ == "__main__":
    main()
