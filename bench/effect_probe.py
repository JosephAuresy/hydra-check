"""Does a fault that the engine SURVIVES change the results?  (separate from the tool; results go to effect.json)

Runs the SWAT+ base and each surviving fault with annual printing switched on (print.prt nyskip = 0), then compares the basin
water balance (basin_wb_yr.txt) of every fault with the base.

    python bench/effect_probe.py [fault-id ...]
"""
import io, json, math, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines
from bases import BASES, add_extras, prepare
from faults import FAULTS

OUT = os.path.join(engines.WORK_ROOT, "effect.json")
ids = sys.argv[1:] or ["P02_gwflow_flag_on", "P04_missing_climate", "P05_soil_numeric_null", "P07_unsorted_pcp_cli", "P08_hru_rows_short", "P09_codes_rev62_layout"]
base = BASES["swatplus_p29"]
fault_by_id = {f[0]: f for f in FAULTS}
NL = chr(10)


def nyskip0(wd):
    p = os.path.join(wd, "print.prt")
    lines = io.open(p, "r", encoding="utf-8", newline="").read().split(NL)
    m = re.search(r"\S+", lines[2])
    lines[2] = lines[2][:m.start()] + "0" + lines[2][m.end():]
    io.open(p, "w", encoding="utf-8", newline="").write(NL.join(lines))


def read_wb(wd):
    p = os.path.join(wd, "basin_wb_yr.txt")
    rows = []
    if not os.path.isfile(p):
        return rows
    with open(p, errors="replace") as fh:
        for i, l in enumerate(fh):
            if i < 3:
                continue
            t = l.split()
            vals = []
            for x in t[7:]:
                try:
                    vals.append(float(x))
                except ValueError:
                    vals.append(float("nan") if x.lower() == "nan" or x.startswith("*") else None)
            rows.append(vals)
    return rows


def run_case(label, apply):
    wd, n = engines.make_workdir(base["src"], "eff_" + label)
    add_extras(base, wd)
    prepare(base, wd)
    nyskip0(wd)
    if apply:
        apply(wd)
    r = engines.run_exe(wd, base["exe"], timeout=900)
    ok = bool(engines.ENGINES["swatplus"]["ok"](wd, r))
    return {"ok": ok, "seconds": r["seconds"], "wb": read_wb(wd), "probe": engines.silent_probe("swatplus", wd), "clue": engines.crash_clue(r) if not ok else ""}


res = json.load(open(OUT)) if os.path.exists(OUT) else {}
if "BASE" not in res:
    print("running the base (annual printing on) ...", flush=True)
    res["BASE"] = run_case("BASE", None)
    json.dump(res, open(OUT, "w"))
    print("  base ok=%s %ss rows=%d" % (res["BASE"]["ok"], res["BASE"]["seconds"], len(res["BASE"]["wb"])), flush=True)
for fid in ids:
    print("running %s ..." % fid, flush=True)
    res[fid] = run_case(fid, fault_by_id[fid][6])
    json.dump(res, open(OUT, "w"))
    b, c = res["BASE"]["wb"], res[fid]["wb"]
    mx, nd, nn = 0.0, 0, 0
    for ra, rb in zip(b, c):
        for x, y in zip(ra, rb):
            if x is None or y is None:
                continue
            if isinstance(y, float) and math.isnan(y):
                nn += 1
                continue
            d = abs(x - y) / max(abs(x), 1e-3)
            nd += d > 1e-6
            mx = max(mx, d)
    res[fid]["effect"] = {"max_rel_diff": mx, "n_differing": nd, "n_nan": nn}
    json.dump(res, open(OUT, "w"))
    print("  %s: ok=%s %ss  max relative change in basin water balance = %.3g (%d values differ, %d NaN); file-not-found lines = %s" %
          (fid, res[fid]["ok"], res[fid]["seconds"], mx, nd, nn, res[fid]["probe"]), flush=True)
