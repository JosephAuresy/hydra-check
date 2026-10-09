"""Cross what each fault REALLY did (engine run) with what the tool SAID (before the run).

    python bench/report.py            -> prints the table and the summary; writes <work_root>/report.json

Tool verdict per case, from most to least useful:
    ERROR    the tool raised an error/problem that names the faulty file or term
    WARN     a warning, ambiguity, missing-item or note that names it
    ELSEWHERE the tool said something, but not about the fault
    ABSTAIN  the tool said it has no rules for this family and found nothing relevant
    SILENT   nothing at all
A control (unmodified base) that gets an ERROR is a false alarm.
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines

RES = os.path.join(engines.WORK_ROOT, "results.json")
results = json.load(open(RES))
BASE = json.load(open(os.path.join(engines.WORK_ROOT, "baseline.json")))


def tool_items(t):
    items = []
    for f in t.get("findings", []):
        items.append(("error" if f["sev"] == "error" else ("warn" if f["sev"] == "warning" else "info"), f["text"]))
    for p in t.get("problems", []):
        items.append(("error", p["text"]))
    for k in ("ambiguity", "missing", "notes"):
        for x in t.get(k, []):
            items.append(("warn" if k != "notes" else "note", x))
    return items


def verdict(rec):
    t = rec.get("tool", {})
    if "error" in t:
        return "TOOLFAIL", []
    items = tool_items(t)
    loc = [x.lower() for x in rec.get("locate", [])]
    rel = [(sev, txt) for sev, txt in items if loc and any(l in txt.lower() for l in loc)]
    if any(s == "error" for s, _ in rel):
        return "ERROR", rel
    if rel:
        return "WARN", rel
    errs = [i for i in items if i[0] in ("error", "warn")]
    if errs:
        return "ELSEWHERE", errs
    if t.get("ruleSet") is None or "identification only" in t.get("coverage", "") or "No MODFLOW 6 rules" in t.get("coverage", "") or "No APEX rules" in t.get("coverage", ""):
        return "ABSTAIN", []
    return "SILENT", []


rows = []
for fid, r in sorted(results.items()):
    if "run" not in r:
        continue
    v, rel = verdict(r)
    run = r["run"]
    nf0 = (BASE.get(r["base"], {}).get("probe") or {}).get("diag_notfound", 0)
    nf1 = (run.get("probe") or {}).get("diag_notfound", 0)
    damage = (nf1 - nf0) if run["ok"] else 0
    rows.append(dict(id=fid, base=r["base"], expected=r["expected"], prov=r["provenance"][:40], ran_ok=run["ok"], secs=run["seconds"],
                     clue=engines.scrub(run.get("clue", "")), damage=damage, verdict=v, said=[("%s: %s" % (s, t))[:170] for s, t in rel[:2]]))

print("%-27s %-13s %-8s %-9s %-9s %s" % ("case", "family", "expected", "engine", "tool", "what the engine said / what the tool said"))
for x in rows:
    ctrl = x["id"].startswith("C_")
    eng = ("DAMAGED" if x["damage"] > 0 else "OK") if x["ran_ok"] else "BROKE"
    print("%-27s %-13s %-8s %-9s %-9s %s" % (x["id"], x["base"], x["expected"], eng, x["verdict"], (x["clue"][:60] if not x["ran_ok"] else "") + ("  <= " + x["said"][0][:90] if x["said"] else "")))

faults = [x for x in rows if not x["id"].startswith("C_")]
ctrls = [x for x in rows if x["id"].startswith("C_")]
broke = [x for x in faults if not x["ran_ok"]]
ran = [x for x in faults if x["ran_ok"]]
damaged = [x for x in ran if x["damage"] > 0]
caught = lambda L: [x for x in L if x["verdict"] in ("ERROR", "WARN")]
err = lambda L: [x for x in L if x["verdict"] == "ERROR"]
print("\nSUMMARY")
print("  faults injected: %d   engine broke: %d   engine still finished: %d   controls: %d" % (len(faults), len(broke), len(ran), len(ctrls)))
if broke:
    print("  faults that BREAK the run: tool names the cause in %d/%d (as an error in %d)" % (len(caught(broke)), len(broke), len(err(broke))))
if ran:
    print("  faults the engine survives: %d, of which %d silently damage the run (extra file-not-found lines); tool flags %d/%d of the survivors, %d/%d of the damaging ones" % (len(ran), len(damaged), len(caught(ran)), len(ran), len(caught(damaged)), len(damaged)))
fa = [x for x in ctrls if x["verdict"] == "ELSEWHERE" or any("error" in s for s in x["said"])]
ctrl_err = 0
for x in ctrls:
    t = results[x["id"]].get("tool", {})
    if any(i[0] == "error" for i in tool_items(t)):
        ctrl_err += 1
print("  controls with a false ERROR: %d/%d" % (ctrl_err, len(ctrls)))
by = {}
for x in faults:
    by.setdefault(x["verdict"], 0); by[x["verdict"]] += 1
print("  tool verdicts on faults:", by)
json.dump(rows, open(os.path.join(engines.WORK_ROOT, "report.json"), "w"), indent=1)
