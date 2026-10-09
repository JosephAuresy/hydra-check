"""Before / after comparison of the tool on the executed faults.   python bench/compare.py

Verdicts: ERROR (names the cause as an error) > WARN (names it as warning/note/ambiguity) > ELSEWHERE > ABSTAIN (no rules for the family) > SILENT.
Engine outcome: BROKE (the run stopped) / OK (finished).  For SWAT+ survivors the effect probe adds what the fault did to the results.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines

W = engines.WORK_ROOT
R = json.load(open(os.path.join(W, "results_AFTER.json")))
EFF = json.load(open(os.path.join(W, "effect.json"))) if os.path.exists(os.path.join(W, "effect.json")) else {}


def items(t):
    out = []
    for f in t.get("findings", []):
        out.append(("error" if f["sev"] == "error" else ("warn" if f["sev"] == "warning" else "info"), f["text"]))
    for p in t.get("problems", []):
        out.append(("error", p["text"]))
    for k in ("ambiguity", "missing", "notes"):
        for x in t.get(k, []):
            out.append(("warn" if k != "notes" else "note", x))
    return out


def verdict(t, locate):
    if not t or "error" in t:
        return "-"
    it = items(t)
    loc = [x.lower() for x in locate]
    rel = [(s, x) for s, x in it if loc and any(l in x.lower() for l in loc)]
    if any(s == "error" for s, _ in rel):
        return "ERROR"
    if rel:
        return "WARN"
    if any(s in ("error", "warn") for s, _ in it):
        return "ELSEWHERE"
    cov = t.get("coverage", "")
    if t.get("ruleSet") is None or "No APEX rules" in cov or "identification only" in cov:
        return "ABSTAIN"
    return "SILENT"


rows = []
for fid, r in sorted(R.items()):
    run = r["run"]
    eff = EFF.get(fid, {}).get("effect")
    engine = "BROKE" if not run["ok"] else ("OK" if not eff else ("CHANGED" if eff["max_rel_diff"] > 1e-6 else "NO-EFFECT"))
    loc = r.get("locate", [])
    rows.append(dict(id=fid, expected=r["expected"], engine=engine, before=verdict(r.get("tool_before"), loc), pre=verdict(r.get("tool_pre"), loc), post=verdict(r.get("tool_post"), loc),
                     rel=eff["max_rel_diff"] if eff else None))
print("%-26s %-8s %-9s | %-9s -> %-9s | after the run: %-9s" % ("case", "expected", "engine", "BEFORE", "AFTER", ""))
for x in rows:
    print("%-26s %-8s %-9s | %-9s -> %-9s | %-9s %s" % (x["id"], x["expected"], x["engine"], x["before"], x["pre"], x["post"], ("(effect %.2g)" % x["rel"]) if x["rel"] is not None else ""))
hit = lambda v: v in ("ERROR", "WARN")
for label, cond in (("faults that STOP the run", lambda x: x["engine"] == "BROKE"), ("faults the run survives and that CHANGE results", lambda x: x["engine"] == "CHANGED"),
                    ("faults the run survives with NO effect on results", lambda x: x["engine"] == "NO-EFFECT")):
    S = [x for x in rows if cond(x)]
    if S:
        print("\n%s: %d" % (label, len(S)))
        print("   tool names the cause   before the improvements: %d/%d   after: %d/%d (inputs only)   after the run: %d/%d" % (
            sum(hit(x["before"]) for x in S), len(S), sum(hit(x["pre"]) for x in S), len(S), sum(hit(x["post"]) for x in S), len(S)))
        print("   ...as an ERROR         before: %d/%d   after: %d/%d   after the run: %d/%d" % (
            sum(x["before"] == "ERROR" for x in S), len(S), sum(x["pre"] == "ERROR" for x in S), len(S), sum(x["post"] == "ERROR" for x in S), len(S)))
