"""Engine-vs-tool table from the executed faults.   python bench/make_table.py

Reads results_AFTER.json + effect.json (written by run_benchmark / rescore / effect_probe) and writes
results/pilot_table.md and results/pilot_table.html: for every fault, what the real engine did and what the
tool said BEFORE the run. No local paths are written.
"""
import html, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines
from compare import verdict, items

W = engines.WORK_ROOT
R = json.load(open(os.path.join(W, "results_AFTER.json")))
EFF = json.load(open(os.path.join(W, "effect.json")))
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "results")
os.makedirs(OUT, exist_ok=True)

FAMILY = {"swat2012": "SWAT2012", "swatplus_p29": "SWAT+", "swatmf": "SWAT-MODFLOW", "mf6": "MODFLOW 6", "apex": "APEX", "apexmf": "APEX-MODFLOW"}

# plain-language account of what the engine did when the stderr text is cryptic or empty (written after reading each run)
ENGINE_TEXT = {
    "A01_missing_soil": "Finished normally (exit 0).",
    "A02_empty_apexcont": "Crashed: end-of-file while reading APEXCONT.DAT.",
    "AM01_link_missing": "Crashed: end-of-file while reading apexmf_link.txt.",
    "F01_tdis_nper_mismatch": "Stopped: size mismatch for PERLEN.",
    "F02_missing_npf": "Stopped: could not open gwf.npf.",
    "F03_outer_maximum_one": "Stopped: simulation convergence failure.",
    "M01_mfn_low_units": "Stopped before finishing (the run did not complete; exit 0).",
    "M02_dis_short_perlen": "Crashed with an end-of-file error (exit 24), no message naming the cause.",
    "M03_link_missing": "Crashed with an end-of-file error (exit 24), no message naming the cause.",
    "M04_package_missing": "Stopped: ERROR OPENING FILE mf_1000.upw.",
    "P02_gwflow_flag_on": "Finished normally; results identical to the working model.",
    "P03_end_before_start": "Crashed: floating invalid (error 65), no message naming the cause.",
    "P06_empty_time_sim": "Crashed: floating divide by zero (error 73), no message naming the cause.",
    "P09_codes_rev62_layout": "Finished normally; results identical to the working model.",
    "W01_nbyr_exceeds_climate": "Crashed with an end-of-file error (exit 24), no message naming the cause.",
    "W02_sol_null": "Crashed (exit 64), no message naming the cause.",
    "W03_missing_sol": "Crashed with an end-of-file error (exit 24), no message naming the cause.",
    "W04_empty_sol": "Crashed with an end-of-file error (exit 24), no message naming the cause.",
}


def engine_text(fid, run, eff):
    if fid in ENGINE_TEXT:
        return ENGINE_TEXT[fid]
    if eff and run["ok"]:
        pct = eff["max_rel_diff"] * 100
        return "Finished with success.fin, but %d results changed (largest change %.3g%%)." % (eff["n_differing"], pct)
    return "Exit %s." % run["exit"]


def tool_text(t, locate):
    loc = [x.lower() for x in locate]
    it = items(t)
    rel = [(s, x) for s, x in it if s in ("error", "warn", "note") and loc and any(l in x.lower() for l in loc)]
    score = lambda sx: (sx[0] == "error", sum(l in sx[1].lower() for l in loc))
    pick = sorted(rel, key=score, reverse=True)
    if not pick:
        return ""
    s, x = pick[0]
    parts = [p.strip() for p in x.split(" | ")]
    # "title | where | advice" -> title: advice, trimmed
    title = parts[0]
    advice = parts[2] if len(parts) > 2 else (parts[1] if len(parts) > 1 else "")
    advice = re.sub(r"\(checked by [^)]*\)\.?", "", advice).strip()
    return "%s. %s" % (title.rstrip("."), advice)


rows = []
for fid, r in sorted(R.items()):
    if fid.startswith("C_"):
        continue
    run, eff = r["run"], EFF.get(fid, {}).get("effect")
    engine = "BROKE" if not run["ok"] else ("CHANGED" if eff and eff["max_rel_diff"] > 1e-6 else "OK")
    v = verdict(r["tool_pre"], r.get("locate", []))
    rows.append(dict(id=fid, family=FAMILY.get(r["base"], r["base"]), fault=r["title"], engine=engine,
                     engine_text=engine_text(fid, run, eff), verdict=v, tool=tool_text(r["tool_pre"], r.get("locate", []))))

# ---- markdown
md = ["| # | Model | Fault injected | What the engine did | What the tool said before the run | Tool |", "|---|---|---|---|---|---|"]
for i, x in enumerate(rows, 1):
    md.append("| %d | %s | %s | %s | %s | %s |" % (i, x["family"], x["fault"], x["engine_text"], x["tool"] or "_(nothing about this fault)_", x["verdict"]))
open(os.path.join(OUT, "pilot_table.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")

# ---- html
CLS = {"ERROR": "ok", "WARN": "ok", "ELSEWHERE": "no", "ABSTAIN": "id", "SILENT": "no"}
LAB = {"ERROR": "named as error", "WARN": "named as warning", "ELSEWHERE": "flagged other things", "ABSTAIN": "no rules for this family", "SILENT": "silent"}
tr = []
for i, x in enumerate(rows, 1):
    tr.append("<tr><td>%d</td><td>%s</td><td>%s</td><td class='eng %s'>%s</td><td>%s</td><td><span class='v %s'>%s</span></td></tr>" % (
        i, html.escape(x["family"]), html.escape(x["fault"]), x["engine"].lower(), html.escape(x["engine_text"]),
        html.escape(x["tool"]) if x["tool"] else "<i>nothing about this fault</i>", CLS[x["verdict"]], LAB[x["verdict"]]))
n = len(rows)
broke = [x for x in rows if x["engine"] == "BROKE"]
chg = [x for x in rows if x["engine"] == "CHANGED"]
hit = lambda L: sum(x["verdict"] in ("ERROR", "WARN") for x in L)
doc = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Engine vs tool - injected-fault pilot</title>
<style>
:root{--bg:#fff;--text:#1d1d1f;--muted:#6b6b70;--border:#d9d9de;--ok:#1a7f4b;--no:#b3261e;--id:#8a8a90;--surf:#f6f6f8}
@media (prefers-color-scheme:dark){:root{--bg:#18181b;--text:#ececef;--muted:#a1a1a8;--border:#3a3a40;--ok:#4cc38a;--no:#f2766d;--id:#8a8a90;--surf:#222226}}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 6px} p{color:var(--muted);margin:0 0 14px}
.sum{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 16px}.sum div{background:var(--surf);border:1px solid var(--border);border-radius:10px;padding:10px 14px}
.sum b{display:block;font-size:20px}
table{border-collapse:collapse;width:100%%;font-size:13px}th,td{border-bottom:1px solid var(--border);padding:8px;text-align:left;vertical-align:top}
th{position:sticky;top:0;background:var(--bg)}
.eng.broke{border-left:3px solid var(--no)}.eng.changed{border-left:3px solid #c77c0a}.eng.ok{border-left:3px solid var(--ok)}
.v{font-size:12px;font-weight:600;white-space:nowrap}.v.ok{color:var(--ok)}.v.no{color:var(--no)}.v.id{color:var(--id)}
.wrap{overflow-x:auto}
</style></head><body><main>
<h1>What the engine says vs what the tool says</h1>
<p>%d faults injected into working models, then run with the real executables (SWAT2012, SWAT+, SWAT-MODFLOW, MODFLOW 6, APEX, APEX-MODFLOW). The tool's answer is what it said <b>before</b> the run, from the input files only.</p>
<div class="sum">
<div><b>%d / %d</b>faults that stop the run: cause named by the tool</div>
<div><b>%d / %d</b>faults the run survives and that change results: cause named</div>
</div>
<div class="wrap"><table><thead><tr><th>#</th><th>Model</th><th>Fault injected</th><th>What the engine did</th><th>What the tool said before the run</th><th>Tool</th></tr></thead><tbody>
%s
</tbody></table></div>
<p style="margin-top:14px">Fault cases are described in the benchmark; the working base models are published SWAT / SWAT+ / MODFLOW / APEX examples.</p>
</main></body></html>""" % (n, hit(broke), len(broke), hit(chg), len(chg), "\n".join(tr))
open(os.path.join(OUT, "pilot_table.html"), "w", encoding="utf-8").write(doc)
print("rows:", n, "| stop the run: %d/%d named | change results: %d/%d named" % (hit(broke), len(broke), hit(chg), len(chg)))
print("wrote results/pilot_table.md and results/pilot_table.html")
