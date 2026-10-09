"""Second-round benchmark runner: inject each fault of faults_v2.py into a COPY of its base model, run the real engine, record
what the engine did. The tool (Hydra Check) is NOT called and nothing is scored here; scoring reads the faulted copies later.

    python bench/run_v2.py [id-prefix ...]       run (or resume) the cases whose id starts with a prefix (default: all)
    python bench/run_v2.py --dry [prefix ...]    inject only, no engine: checks that every edit applies and lists the files it changed
    python bench/run_v2.py --redo [prefix ...]   run again even if a record exists
    python bench/run_v2.py --report              counts per family and the cases that did not behave as expected

Writes <work_root>/results_v2.json (one record per case plus "_ref": the unmodified bases run the same way), keeps progress in
<work_root>/run_v2_log.txt and the faulted copies in <work_root>/v2_<id>. The file is rewritten after every case, and a case that
already has a record is skipped, so a crashed or stopped run resumes where it left off. Existing result files are never touched.

Outcome of a case (tool-independent):
    BROKE      the engine stopped (error exit, crash, or no completion marker)
    TIMEOUT    the engine hit the time limit and its process tree was killed
    CHANGED    the run finished and its results differ from the unmodified base run (1e-6 relative)
    NO-EFFECT  the run finished and its results are identical to the unmodified base run
    OK         the run finished and no result file could be compared
Results are compared with the base run of the SAME script (v2_REF_<base>), for every family, not only SWAT+.
"""
import array, glob, json, os, re, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines
from bases import BASES, add_extras, prepare
from faults_v2 import FAULTS_V2, FAMILY

WORK = engines.WORK_ROOT
RES = os.path.join(WORK, "results_v2.json")
LOG = os.path.join(WORK, "run_v2_log.txt")
LOCK = os.path.join(WORK, "run_v2.lock")
NL = chr(10)
ORDER = ["mf6", "apex", "apexmf", "swatmf", "swat2012", "swatplus_p29"]      # fast engines first
THRESH = 1e-6

# result files compared with the base run, per base (glob patterns relative to the model folder)
COMPARE = {
    "swatplus_p29": ["basin_wb_yr.txt", "basin_aqu_yr.txt", "basin_nb_yr.txt"],
    "swat2012": ["output.rch", "output.sub"],
    "swatmf": ["output.rch", "output.sub", "swatmf_out_MF_recharge_yearly", "swatmf_out_SWAT_gwsw_yearly"],
    "mf6": ["gwf.hds", "gwt.ucn"],
    "apex": ["*.MWS", "*.AWS", "*.ACY"],
    "apexmf": ["*.MWS", "*.AWS", "MODFLOW/amf_apex_recharge_yearly.out", "MODFLOW/amf_MF_gwsw_yearly.out"],
}
BINARY = {"mf6"}


def log(msg):
    line = "%s  %s" % (time.strftime("%H:%M:%S"), msg)
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + NL)


def save(results):
    tmp = RES + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(results, fh, indent=1)
    os.replace(tmp, RES)


# ---------------------------------------------------------------- judging a run
def strict_ok(base_id, wd, run):
    """Like the pilot's judge, except APEX-MODFLOW also needs its completion sentence: the pilot judge only looks for amf_* files,
    which the engine creates before it reads its MODFLOW inputs (a run that stops with 'STOP EXECUTION' left them behind)."""
    eng = engines.ENGINES[BASES[base_id]["engine"]]
    ok = bool(eng["ok"](wd, run))
    pilot = ok
    if ok and base_id == "apexmf":
        ok = "normal termination" in run["stdout_tail"].lower()
    return ok, pilot


def diag_tail(wd):
    p = os.path.join(wd, "diagnostics.out")
    if not os.path.isfile(p):
        return ""
    with open(p, "r", encoding="utf-8", errors="replace") as fh:
        return engines.scrub("\n".join(fh.read().splitlines()[-6:])[-600:])


# ---------------------------------------------------------------- comparing results with the base run
_STAMP = re.compile(r"\d+:\s*\d+:\s*\d+|\d+/\d+/\d+|\b20\d\d/\d\d/\d\d\b")
_NUM = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[EeDd][-+]?\d+)?|nan|\*{2,}", re.I)


def _nums(path):
    rows = []
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if _STAMP.search(line):
                continue
            rows.append(_NUM.findall(line))
    return rows


def _tofloat(x):
    if x.lower() == "nan" or x.startswith("*"):
        return float("nan")
    return float(x.replace("d", "e").replace("D", "e"))


def compare_text(a, b):
    ra, rb = _nums(a), _nums(b)
    if len(ra) != len(rb):
        return {"status": "shape_differs", "rows_ref": len(ra), "rows_case": len(rb)}
    mx, nd, nn = 0.0, 0, 0
    for ta, tb in zip(ra, rb):
        if len(ta) != len(tb):
            return {"status": "shape_differs", "rows_ref": len(ra), "rows_case": len(rb)}
        for x, y in zip(ta, tb):
            if x == y:
                continue
            fx, fy = _tofloat(x), _tofloat(y)
            if fy != fy:
                if fx == fx:
                    nn += 1
                continue
            if fx != fx:
                nd += 1
                continue
            d = abs(fx - fy) / max(abs(fx), 1e-3)
            if d > THRESH:
                nd += 1
            mx = max(mx, d)
    return {"status": "differs" if (nd or nn) else "identical", "max_rel_diff": mx, "n_differing": nd, "n_nan": nn}


def compare_binary(a, b):
    da, db = open(a, "rb").read(), open(b, "rb").read()
    if da == db:
        return {"status": "identical", "max_rel_diff": 0.0, "n_differing": 0, "n_nan": 0}
    if len(da) != len(db):
        return {"status": "shape_differs", "bytes_ref": len(da), "bytes_case": len(db)}
    n = len(da) // 8 * 8
    xa, xb = array.array("d"), array.array("d")
    xa.frombytes(da[:n]); xb.frombytes(db[:n])
    mx, nd, nn = 0.0, 0, 0
    for x, y in zip(xa, xb):
        if x == y or (x != x and y != y):
            continue
        if y != y:
            nn += 1
            continue
        d = abs(x - y) / max(abs(x), 1e-3)
        if d > THRESH:
            nd += 1
        mx = max(mx, d)
    return {"status": "differs" if (nd or nn) else "identical", "max_rel_diff": mx, "n_differing": nd, "n_nan": nn}


def compare_runs(base_id, ref_wd, wd):
    """Compare result files of a finished case with the base run. Returns None when no file exists in either folder."""
    names = []
    for pat in COMPARE[base_id]:
        found = {os.path.relpath(p, d).replace(os.sep, "/") for d in (ref_wd, wd) for p in glob.glob(os.path.join(d, pat))}
        names += sorted(found)
    files, total_diff, total_nan, mx = {}, 0, 0, 0.0
    for n in names:
        pa, pb = os.path.join(ref_wd, n), os.path.join(wd, n)
        if not os.path.isfile(pa) and not os.path.isfile(pb):
            continue
        if not os.path.isfile(pb):
            files[n] = {"status": "missing_in_case"}
        elif not os.path.isfile(pa):
            files[n] = {"status": "missing_in_ref"}
        else:
            files[n] = (compare_binary if base_id in BINARY else compare_text)(pa, pb)
    if not files:
        return None
    changed = False
    for r in files.values():
        if r["status"] != "identical":
            changed = True
        total_diff += r.get("n_differing", 0)
        total_nan += r.get("n_nan", 0)
        mx = max(mx, r.get("max_rel_diff", 0.0))
    return {"changed": changed, "max_rel_diff": mx, "n_differing": total_diff, "n_nan": total_nan, "files": files}


# ---------------------------------------------------------------- preparing and running one copy
def nyskip0(wd):
    """SWAT+: print annual results from year 1 (print.prt nyskip = 0) so that survivors can be compared. Applied to base and cases alike."""
    import io
    p = os.path.join(wd, "print.prt")
    lines = io.open(p, "r", encoding="utf-8", newline="").read().split(NL)
    m = re.search(r"\S+", lines[2])
    lines[2] = lines[2][:m.start()] + "0" + lines[2][m.end():]
    io.open(p, "w", encoding="utf-8", newline="").write(NL.join(lines))


def make_copy(base_id, name):
    b = BASES[base_id]
    wd, n = engines.make_workdir(b["src"], name)
    add_extras(b, wd)
    prepare(b, wd)
    if base_id == "swatplus_p29":
        nyskip0(wd)
    return wd, n


def snapshot(wd):
    snap = {}
    for root, dirs, files in os.walk(wd):
        for f in files:
            p = os.path.join(root, f)
            st = os.stat(p)
            snap[os.path.relpath(p, wd).replace(os.sep, "/")] = (st.st_size, st.st_mtime_ns)
    return snap


def changed_files(before, after):
    out = []
    for k in sorted(set(before) | set(after)):
        if before.get(k) != after.get(k):
            out.append(k)
    return out


def run_engine(base_id, wd):
    b = BASES[base_id]
    eng = engines.ENGINES[b["engine"]]
    run = engines.run_exe(wd, b["exe"], timeout=eng["timeout"])
    run["timeout_s"] = eng["timeout"]
    run["ok"], run["ok_pilot_judge"] = strict_ok(base_id, wd, run)
    run["clue"] = engines.crash_clue(run) if not run["ok"] else ""
    run["probe"] = engines.silent_probe(b["engine"], wd)
    if b["engine"] == "swatplus":
        run["success_fin"] = os.path.isfile(os.path.join(wd, "success.fin"))
        if not run["ok"]:
            run["diag_tail"] = diag_tail(wd)
    return run


def ensure_ref(results, base_id):
    """Run the unmodified base the same way as the cases (once). Returns the work folder of the reference run, or None if it failed."""
    refs = results.setdefault("_ref", {})
    name = "v2_REF_" + base_id
    wd = os.path.join(WORK, name)
    rec = refs.get(base_id)
    if rec and rec.get("run", {}).get("ok") and os.path.isdir(wd):
        return wd
    log("reference run of the unmodified base '%s' ..." % base_id)
    wd, n = make_copy(base_id, name)
    run = run_engine(base_id, wd)
    refs[base_id] = {"id": "REF_" + base_id, "base": base_id, "family": FAMILY[base_id], "workdir": engines.rel_work(wd), "copied_files": n,
                     "run": run, "outcome": "OK" if run["ok"] else ("TIMEOUT" if run["timed_out"] else "BROKE"), "finished": time.strftime("%Y-%m-%d %H:%M:%S")}
    save(results)
    log("  reference %s: ok=%s exit=%s %ss" % (base_id, run["ok"], run["exit"], run["seconds"]))
    return wd if run["ok"] else None


def judge(expected, outcome):
    """(expectation_met, surprise text). expected: crash | silent | ok | unknown."""
    if expected == "crash":
        if outcome in ("BROKE", "TIMEOUT"):
            return True, ""
        return False, "expected the engine to stop, but it finished (%s)" % outcome
    if expected == "silent":
        if outcome == "CHANGED":
            return True, ""
        if outcome in ("BROKE", "TIMEOUT"):
            return False, "expected a silent wrong result, but the engine stopped (%s)" % outcome
        return False, "expected a silent wrong result, but the results are %s" % outcome
    if expected == "ok":
        if outcome in ("NO-EFFECT", "OK"):
            return True, ""
        return False, "decoy (benign edit) %s" % ("broke the run" if outcome == "BROKE" else "changed or hung: " + outcome)
    return None, ""


def outcome_of(run, effect):
    if run["timed_out"]:
        return "TIMEOUT"
    if not run["ok"]:
        return "BROKE"
    if effect is None:
        return "OK"
    return "CHANGED" if effect["changed"] else "NO-EFFECT"


def run_case(results, fault, dry=False):
    fid, base_id, title, prov, kind, locate, apply = fault
    rec = {"id": fid, "base": base_id, "family": FAMILY[base_id], "title": title, "provenance": prov, "expected": kind, "decoy": kind == "ok", "locate": locate}
    ref = None if dry else ensure_ref(results, base_id)
    if not dry and ref is None:
        rec["skipped"] = "the unmodified base did not run"
        results[fid] = rec
        save(results)
        log("SKIP %s: reference run of '%s' failed" % (fid, base_id))
        return rec
    name = ("v2dry_" if dry else "v2_") + fid
    wd, n = make_copy(base_id, name)
    rec["workdir"] = engines.rel_work(wd)
    before = snapshot(wd)
    t0 = time.time()
    try:
        apply(wd)
    except Exception as e:
        rec["inject_error"] = engines.scrub("%s: %s" % (type(e).__name__, e))
        log("INJECT FAILED %s: %s" % (fid, rec["inject_error"]))
        return rec
    rec["inject_seconds"] = round(time.time() - t0, 2)
    rec["files_changed"] = changed_files(before, snapshot(wd))
    if dry:
        return rec
    run = run_engine(base_id, wd)
    effect = compare_runs(base_id, ref, wd) if run["ok"] else None
    rec["run"] = run
    rec["effect"] = effect
    rec["outcome"] = outcome_of(run, effect)
    rec["expectation_met"], rec["surprise"] = judge(kind, rec["outcome"])
    rec["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
    return rec


# ---------------------------------------------------------------- report
def report(results):
    import collections
    rows = [r for k, r in results.items() if not k.startswith("_") and "outcome" in r]
    fams = [FAMILY[b] for b in ORDER]
    cols = ["BROKE", "OK", "CHANGED", "NO-EFFECT", "TIMEOUT"]
    print("%-14s %5s %6s %6s %6s %6s %6s %6s" % ("family", "cases", *cols[:5], "decoys"))
    tot = collections.Counter()
    for fam in fams:
        rs = [r for r in rows if r["family"] == fam]
        c = collections.Counter(r["outcome"] for r in rs)
        nd = sum(1 for r in rs if r["decoy"])
        print("%-14s %5d %6d %6d %6d %6d %6d %6d" % (fam, len(rs), *[c[x] for x in cols], nd))
        tot.update(c)
        tot["cases"] += len(rs)
        tot["decoys"] += nd
    print("%-14s %5d %6d %6d %6d %6d %6d %6d" % ("ALL", tot["cases"], *[tot[x] for x in cols], tot["decoys"]))
    print()
    print("cases that did not behave as expected:")
    for r in rows:
        if r.get("expectation_met") is False:
            print("  %-34s [%s] %s -> %s" % (r["id"], r["expected"], r["outcome"], r["surprise"]))
    bad = [r for k, r in results.items() if not k.startswith("_") and (r.get("inject_error") or r.get("skipped"))]
    for r in bad:
        print("  NOT RUN %-28s %s" % (r["id"], r.get("inject_error") or r.get("skipped")))


def evidence(rec):
    """One line saying why the run ended the way it did."""
    run = rec.get("run") or {}
    if run.get("timed_out"):
        return "timed out after %ss" % run.get("timeout_s")
    if run.get("ok"):
        eff = rec.get("effect")
        if not eff:
            return "finished; no result file compared"
        if eff["changed"]:
            bad = [n for n, r in eff["files"].items() if r["status"] != "identical"]
            return "finished; results differ in %s (max rel diff %.3g, %d values, %d NaN)" % (", ".join(bad), eff["max_rel_diff"], eff["n_differing"], eff["n_nan"])
        return "finished; results identical to the base run"
    lines = [l.strip() for l in (run.get("stdout_tail") or "").splitlines() if l.strip()]
    for l in lines:
        if re.search(r"error|missing|invalid|forrtl|STOP|cannot|not found|fail|must|unknown|NOT IN|<= 0|THICKNESS", l, re.I) and not l.startswith("Run start"):
            return "exit %s: %s" % (run.get("exit"), l[:150])
    if run.get("diag_tail"):
        return "exit %s: diagnostics.out: %s" % (run.get("exit"), run["diag_tail"].splitlines()[-1][:150])
    return "exit %s: %s" % (run.get("exit"), lines[-1][:150] if lines else "no output")


def review(results):
    """Write results_v2_review.json / .md: counts per family, every case in one line, the cases that surprised, with the verdicts of faults_v2.FINDINGS."""
    import collections
    from faults_v2 import FINDINGS
    rows = [r for k, r in results.items() if not k.startswith("_") and "outcome" in r]
    cols = ["BROKE", "OK", "CHANGED", "NO-EFFECT", "TIMEOUT"]
    fam_counts = {}
    for b in ORDER:
        rs = [r for r in rows if r["base"] == b]
        c = collections.Counter(r["outcome"] for r in rs)
        fam_counts[FAMILY[b]] = {"cases": len(rs), "faults": sum(1 for r in rs if not r["decoy"]), "decoys": sum(1 for r in rs if r["decoy"]), **{x: c[x] for x in cols}}
    cases = [{"id": r["id"], "family": r["family"], "decoy": r["decoy"], "expected": r["expected"], "outcome": r["outcome"], "expectation_met": r["expectation_met"],
              "seconds": r["run"]["seconds"], "evidence": evidence(r), "files_changed": r.get("files_changed"), "finding": FINDINGS.get(r["id"])} for r in rows]
    surprises = [c for c in cases if c["expectation_met"] is False or c["finding"]]
    not_run = [{"id": r["id"], "why": r.get("inject_error") or r.get("skipped")} for k, r in results.items() if not k.startswith("_") and (r.get("inject_error") or r.get("skipped"))]
    out = {"counts": fam_counts, "cases": cases, "surprises": surprises, "not_run": not_run, "references": {k: {"ok": v["run"]["ok"], "seconds": v["run"]["seconds"]} for k, v in results.get("_ref", {}).items()}}
    with open(os.path.join(WORK, "results_v2_review.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
    md = ["# Benchmark round 2: engine outcomes (tool not involved)", "", "| family | cases | faults | decoys | BROKE | OK | CHANGED | NO-EFFECT | TIMEOUT |", "|---|---|---|---|---|---|---|---|---|"]
    for f, c in fam_counts.items():
        md.append("| %s | %d | %d | %d | %d | %d | %d | %d | %d |" % (f, c["cases"], c["faults"], c["decoys"], *[c[x] for x in cols]))
    md += ["", "## Cases that did not behave as expected, or carry a finding", ""]
    for c in surprises:
        md.append("- **%s** (%s, expected %s, outcome %s): %s" % (c["id"], c["family"], c["expected"], c["outcome"], c["evidence"]))
        if c["finding"]:
            md.append("  - %s: %s" % c["finding"])
    md += ["", "## All cases", "", "| id | expected | outcome | evidence |", "|---|---|---|---|"]
    for c in cases:
        md.append("| %s | %s | %s | %s |" % (c["id"], c["expected"], c["outcome"], c["evidence"].replace("|", "/")))
    with open(os.path.join(WORK, "results_v2_review.md"), "w", encoding="utf-8") as fh:
        fh.write(NL.join(md) + NL)
    print("wrote results_v2_review.json and results_v2_review.md (%d cases, %d surprises/findings, %d not run)" % (len(cases), len(surprises), len(not_run)))


def main():
    args = sys.argv[1:]
    dry = "--dry" in args
    redo = "--redo" in args
    if "--report" in args:
        report(json.load(open(RES)))
        return
    if "--review" in args:
        review(json.load(open(RES)))
        return
    prefixes = [a for a in args if not a.startswith("--")]
    os.makedirs(WORK, exist_ok=True)
    if os.path.exists(LOCK):
        try:
            pid = int(open(LOCK).read().strip())
            alive = subprocess.run(["tasklist", "/FI", "PID eq %d" % pid], capture_output=True, text=True).stdout.count(str(pid)) > 0
        except Exception:
            alive = False
        if alive:
            print("another run_v2.py (pid %d) is running; stop it first" % pid)
            sys.exit(2)
    with open(LOCK, "w") as fh:
        fh.write(str(os.getpid()))
    try:
        results = json.load(open(RES)) if (os.path.exists(RES) and not dry) else {}
        todo = [f for f in FAULTS_V2 if not prefixes or any(f[0].startswith(p) for p in prefixes)]
        todo.sort(key=lambda f: ORDER.index(f[1]))
        t_start = time.time()
        done = skipped = 0
        log("%s: %d case(s) selected%s" % ("DRY RUN" if dry else "RUN", len(todo), ", redo" if redo else ""))
        for i, fault in enumerate(todo, 1):
            fid = fault[0]
            prev = results.get(fid)
            if not dry and not redo and prev and ("run" in prev or "skipped" in prev) and not prev.get("inject_error"):
                skipped += 1
                continue
            t0 = time.time()
            rec = run_case(results, fault, dry=dry)
            if dry:
                log("[%d/%d] %-34s changed: %s%s" % (i, len(todo), fid, ", ".join(rec.get("files_changed", [])[:4]) + (" ..." if len(rec.get("files_changed", [])) > 4 else ""),
                                                      "   INJECT ERROR" if rec.get("inject_error") else ""))
                import shutil
                shutil.rmtree(os.path.join(WORK, "v2dry_" + fid), ignore_errors=True)
                continue
            results[fid] = rec
            save(results)
            done += 1
            if "run" in rec:
                r = rec["run"]
                log("[%d/%d] %-34s %-9s exp=%-7s %6.1fs exit=%-4s %s%s" % (i, len(todo), fid, rec["outcome"], rec["expected"], r["seconds"], r["exit"], (r["clue"] or "")[:60],
                                                                         "   <-- " + rec["surprise"] if rec.get("surprise") else ""))
        log("finished: %d run, %d skipped (already done), %.1f min" % (done, skipped, (time.time() - t_start) / 60))
    finally:
        try:
            os.remove(LOCK)
        except OSError:
            pass


if __name__ == "__main__":
    main()
