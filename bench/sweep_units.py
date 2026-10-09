"""Where does a low Fortran unit number in modflow.mfn start to break SWAT-MODFLOW?  (turns a heuristic rule into a measured one)

Sets the unit of DIS and BAS6 to V for several V and runs the real engine on a copy. Results: <work_root>/sweep_units.json
"""
import json, os, re, sys, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines
from bases import BASES

b = BASES["swatmf"]
out = {}
values = [int(x) for x in sys.argv[1:]] or [10, 11, 20, 50, 99, 100, 200, 999, 4999, 5000]
for v in values:
    wd, n = engines.make_workdir(b["src"], "sweep_units_%d" % v)
    p = os.path.join(wd, "modflow.mfn")
    s = io.open(p, "r", encoding="utf-8", newline="").read()
    s = re.sub(r"^(DIS\t)\d+", r"\g<1>%d" % v, s, flags=re.M)
    s = re.sub(r"^(BAS6\t)\d+", r"\g<1>%d" % (v + 1), s, flags=re.M)
    io.open(p, "w", encoding="utf-8", newline="").write(s)
    r = engines.run_exe(wd, b["exe"], timeout=300)
    r["ok"] = bool(engines.ENGINES["swatmf"]["ok"](wd, r))
    r["clue"] = engines.crash_clue(r) if not r["ok"] else ""
    out[v] = {"ok": r["ok"], "seconds": r["seconds"], "clue": r["clue"], "tail": r["stdout_tail"][-260:]}
    print("DIS=%-5d BAS6=%-5d -> %s %5.0fs  %s" % (v, v + 1, "ran OK " if r["ok"] else "BROKE  ", r["seconds"], r["clue"][:70]), flush=True)
    json.dump(out, open(os.path.join(engines.WORK_ROOT, "sweep_units.json"), "w"), indent=1)
