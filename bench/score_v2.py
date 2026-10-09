"""Score the tool on the round-2 faults with a FROZEN copy of the rules (blind test).   python bench/score_v2.py <frozen_dir>

<frozen_dir> is an export of the commit tagged blind-v2-rules-frozen (git archive blind-v2-rules-frozen | tar -x -C <frozen_dir>).
It must not be edited. For every case of faults_v2.py this script rebuilds the PRISTINE faulted copy (inputs only, nothing ran in it),
asks the frozen tool what it says about that folder, and combines it with the engine outcome that run_v2.py recorded earlier.
Nothing in here changes a rule. See docs/BLIND_TEST_PROTOCOL.md for the analysis plan this implements.

Writes <work_root>/results_v2_scored_frozen.json and prints the summary tables.
"""
import json, math, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines
import config
from run_v2 import make_copy
from faults_v2 import FAULTS_V2, FAMILY

NODE = config.get("node_path")
W = engines.WORK_ROOT
OUT = os.path.join(W, "results_v2_scored_frozen.json")


def tool_report(frozen, folder):
    r = subprocess.run([NODE, os.path.join(frozen, "bench", "tool_report.js"), folder], capture_output=True, text=True, encoding="utf-8", timeout=900)
    if r.returncode != 0:
        return {"error": engines.scrub((r.stderr or r.stdout)[-400:])}
    return json.loads(r.stdout)


def items(t):
    out = []
    for f in t.get("findings", []):
        out.append(("error" if f["sev"] == "error" else ("warn" if f["sev"] == "warning" else "info"), f["text"], f["title"]))
    for p in t.get("problems", []):
        out.append(("error", p["text"], p["title"]))
    for k in ("ambiguity", "missing", "notes"):
        for x in t.get(k, []):
            out.append(("warn" if k != "notes" else "note", x, x[:80]))
    return out


def verdict(t, locate):
    """Same logic as compare.py: ERROR / WARN name the cause (a finding whose text contains a 'locate' keyword); ELSEWHERE = flagged
    something else; ABSTAIN = no rules for the family; SILENT = nothing."""
    if not t or "error" in t:
        return "-"
    it = items(t)
    loc = [x.lower() for x in locate]
    rel = [(s, x) for s, x, _ in it if loc and any(l in x.lower() for l in loc) and s in ("error", "warn", "note")]
    if any(s == "error" for s, _ in rel):
        return "ERROR"
    if rel:
        return "WARN"
    if any(s in ("error", "warn") for s, _, _ in it):
        return "ELSEWHERE"
    cov = t.get("coverage", "")
    if t.get("ruleSet") is None or "identification only" in cov:
        return "ABSTAIN"
    return "SILENT"


def flags(t):
    """(severity, title) of every ERROR/WARN the tool raises; used to compare a case with its unmodified base."""
    return {(s, ti) for s, _, ti in items(t) if s in ("error", "warn")}


def wilson(k, n, z=1.96):
    if n == 0:
        return (None, None)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(max(0, c - h), 3), round(min(1, c + h), 3))


def frac(k, n):
    lo, hi = wilson(k, n)
    return "%d/%d" % (k, n) + ("  (95%% CI %.0f-%.0f%%)" % (lo * 100, hi * 100) if n else "")


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python bench/score_v2.py <frozen_dir>")
    frozen = sys.argv[1]
    if not os.path.isfile(os.path.join(frozen, "bench", "tool_report.js")):
        sys.exit("<frozen_dir> does not look like an export of the frozen commit (bench/tool_report.js missing)")
    R = json.load(open(os.path.join(W, "results_v2.json")))
    ref_flags = {}
    for base in sorted({f[1] for f in FAULTS_V2}):
        wd, _ = make_copy(base, "s_REF_" + base)
        t = tool_report(frozen, wd)
        ref_flags[base] = flags(t)
        print("reference", base, "->", len(ref_flags[base]), "ERROR/WARN already present on the unmodified base", flush=True)
    rows = {}
    for fid, base, title, prov, kind, locate, apply in FAULTS_V2:
        rec = R.get(fid)
        if not rec or "outcome" not in rec:
            print("no engine outcome for", fid, "(skipped)")
            continue
        wd, _ = make_copy(base, "s_" + fid)
        apply(wd)                                   # the pristine faulted inputs, before any run
        t = tool_report(frozen, wd)
        new = sorted(flags(t) - ref_flags[base])
        rows[fid] = dict(id=fid, base=base, family=FAMILY[base], title=title, provenance=prov, expected=kind, decoy=(kind == "ok"), locate=locate,
                         outcome=rec["outcome"], verdict=verdict(t, locate), new_flags=[list(x) for x in new],
                         said=[x for s, x, _ in items(t) if s in ("error", "warn")][:4])
        json.dump(rows, open(OUT, "w"), indent=1)
        print("scored %-28s %-9s %-9s new flags: %d" % (fid, rec["outcome"], rows[fid]["verdict"], len(new)), flush=True)
    summarize(list(rows.values()))


def summarize(rows):
    named = lambda r: r["verdict"] in ("ERROR", "WARN")
    groups = [("faults that STOP the engine", lambda r: not r["decoy"] and r["outcome"] in ("BROKE", "TIMEOUT")),
              ("faults the engine survives and that CHANGE results", lambda r: not r["decoy"] and r["outcome"] == "CHANGED"),
              ("faults the engine survives with NO effect on results (the tool may or may not flag them)", lambda r: not r["decoy"] and r["outcome"] in ("NO-EFFECT", "OK"))]
    fams = sorted({r["family"] for r in rows})
    for label, cond in groups:
        S = [r for r in rows if cond(r)]
        print("\n%s: %d" % (label, len(S)))
        print("   cause named (ERROR or WARN on the right file/keyword): %s" % frac(sum(named(r) for r in S), len(S)))
        print("   named as ERROR: %s" % frac(sum(r["verdict"] == "ERROR" for r in S), len(S)))
        print("   any new ERROR/WARN at all (looser: tool flagged something): %s" % frac(sum(bool(r["new_flags"]) for r in S), len(S)))
        print("   no rules for the family (ABSTAIN): %d    silent: %d    flagged elsewhere only: %d" % (
            sum(r["verdict"] == "ABSTAIN" for r in S), sum(r["verdict"] == "SILENT" for r in S), sum(r["verdict"] == "ELSEWHERE" for r in S)))
        for f in fams:
            F = [r for r in S if r["family"] == f]
            if F:
                print("      %-14s named %s" % (f, frac(sum(named(r) for r in F), len(F))))
    D = [r for r in rows if r["decoy"]]
    benign = [r for r in D if r["outcome"] in ("NO-EFFECT", "OK")]
    notbenign = [r for r in D if r not in benign]
    print("\nDECOYS (benign edits): %d, of which the engine confirmed benign (finished, identical results): %d" % (len(D), len(benign)))
    print("   false alarm = a NEW ERROR/WARN that the unmodified base does not raise, on a confirmed-benign decoy: %s" % frac(sum(bool(r["new_flags"]) for r in benign), len(benign)))
    print("   decoys that turned out NOT benign (engine stopped or results changed), reported apart; tool flagged = a new ERROR/WARN:")
    for r in notbenign:
        print("      %-28s engine %-9s tool flagged: %s   %s" % (r["id"], r["outcome"], "yes" if r["new_flags"] else "no", r["title"]))
    print("\ncases the tool missed on stopped runs (SILENT, ELSEWHERE or ABSTAIN):")
    for r in rows:
        if not r["decoy"] and r["outcome"] in ("BROKE", "TIMEOUT") and not named(r):
            print("   %-28s %-12s %-9s %s" % (r["id"], r["family"], r["verdict"], r["title"]))
    print("\ncases the tool missed on silent damage:")
    for r in rows:
        if not r["decoy"] and r["outcome"] == "CHANGED" and not named(r):
            print("   %-28s %-12s %-9s %s" % (r["id"], r["family"], r["verdict"], r["title"]))


if __name__ == "__main__":
    main()
