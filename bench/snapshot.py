"""Write one dated, never-overwritten snapshot of where Hydra Check stands, for the evolution dashboard.

    python bench/snapshot.py --label "after mf6 rules" --note "what changed"     write a new snapshot
    python bench/snapshot.py --list                                              list the snapshots

A snapshot is one small JSON file in evolution/ledger/, named <date>T<hhmm>_<label>.json. It records:
  - the git commit the main checkout is on (hash, message, branch, whether the tree has uncommitted changes)
  - the number of rules per family (counted in index.html) and how many `finding("error"|"warning")` calls they contain
  - the test suites (the cheap Node suites are RUN now and their "N/N passed" line is read)
  - the precision audit (the LAST saved tests/audit_result.json is read, not re-run; its file time is recorded)
  - the benchmark verdict matrix (same verdict logic as bench/compare.py) from the saved result files in the work folder
  - the model inventory (families and counts of the audited folders, by generic name)
  - the free-text note you give

Everything not available at that moment is written as "not recorded"; nothing is estimated.
The file evolution/data.js is regenerated from the ledger folder and evolution/milestones.json after every run, so evolution/index.html
works when opened straight from disk.

Past states can be added with the options below (used once for the first snapshots): --when, --from-commit, --bench-file, --bench-field,
--no-tests, --no-audit, --backfill-note. Ledger files are never overwritten: the script stops if the label and minute already exist.
Output contains no absolute paths; the script scans its own output before writing and stops if it finds a drive letter or the user name.
"""
import argparse, datetime, getpass, glob, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
EVO = os.path.join(REPO, "evolution")
LEDGER = os.path.join(EVO, "ledger")
MILESTONES = os.path.join(EVO, "milestones.json")
DATA_JS = os.path.join(EVO, "data.js")
SCHEMA = 1
NODE_FALLBACK = "node"
# text that must never appear in the output: assistant tool names, cloud-sync folder names (built from pieces so this file does not contain them)
BANNED = ("cl" + "aude", "anthr" + "opic", "One" + "Drive")

# the cheap suites; absent ones are recorded as absent
SUITES = [
    ("characterization", "tests/run_node.js"),
    ("rules", "tests/run_rules_node.js"),
    ("table-rows rule", "tests/rule_tablerows.test.js"),
    ("automatic fixes", "tests/run_fix_node.js"),
]

FAMILY_NAMES = {
    "swat_plus": "SWAT+", "swat2012": "SWAT2012", "swat_mf": "SWAT-MODFLOW", "modflow": "MODFLOW (NWT/2005)",
    "modflow6": "MODFLOW 6", "apex": "APEX / APEX-MODFLOW", "generic": "Generic (any model)",
}
FW_NAMES = {"swat_plus": "SWAT+", "swat2012": "SWAT2012", "swat_mf": "SWAT-MODFLOW", "modflow": "MODFLOW", "modflow6": "MODFLOW 6", "apex": "APEX"}


def git(*args, cwd=REPO):
    try:
        r = subprocess.run(["git"] + list(args), cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def fix_mojibake(s):
    try:
        return s.encode("cp1252").decode("utf-8")
    except Exception:
        return s


# ---------------------------------------------------------------- rules
def count_rules(text):
    """Rules per family in index.html. A rule is a `function name(out){...}` declared inside a RULES array.
    Returns {family: {rules, error_calls, warning_calls}}; None when the page has no RULES object."""
    lines = text.splitlines()
    start = next((i for i, l in enumerate(lines) if re.match(r"^const RULES\s*=\s*\{", l)), None)
    if start is None:
        return None
    blocks = []                                   # (family, lines of the array)

    def array_end(i, closer):
        j = i + 1
        while j < len(lines) and not re.match(closer, lines[j]):
            j += 1
        return j

    i = start + 1
    while i < len(lines) and not re.match(r"^\};?\s*$", lines[i]):          # arrays inside the RULES object
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\[\s*$", lines[i])
        if m:
            j = array_end(i, r"^\],?\s*$")
            blocks.append((m.group(1), lines[i + 1:j]))
            i = j
        i += 1
    alias = {}                                    # const RULES_X = [...]; RULES.key = RULES_X;
    for l in lines:
        m = re.match(r"^RULES\.([A-Za-z0-9_]+)\s*=\s*(RULES_[A-Za-z0-9_]+)\s*;", l)
        if m:
            alias[m.group(2)] = m.group(1)
    for i, l in enumerate(lines):
        m = re.match(r"^const (RULES_[A-Za-z0-9_]+)\s*=\s*\[\s*$", l)
        m2 = re.match(r"^RULES\.([A-Za-z0-9_]+)\s*=\s*\[\s*$", l)
        if m or m2:
            j = array_end(i, r"^\];?\s*$")
            blocks.append((m2.group(1) if m2 else alias.get(m.group(1), m.group(1).lower()), lines[i + 1:j]))
    fam = {}
    for key, body in blocks:
        joined = "\n".join(body)
        fam[key] = {"rules": sum(1 for l in body if re.match(r"^  function [A-Za-z0-9_]+\(", l)),
                    "error_calls": len(re.findall(r"finding\(\s*[\"']error[\"']", joined)),
                    "warning_calls": len(re.findall(r"finding\(\s*[\"']warning[\"']", joined))}
    return fam


# ---------------------------------------------------------------- tests
def run_suite(node, rel):
    p = os.path.join(REPO, rel.replace("/", os.sep))
    if not os.path.isfile(p):
        return {"status": "absent", "detail": "suite file not present in this checkout"}
    try:
        r = subprocess.run([node, p], cwd=REPO, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    except Exception as e:
        return {"status": "could not run", "detail": type(e).__name__}
    out = (r.stdout or "") + "\n" + (r.stderr or "")
    m = None
    for m in re.finditer(r"(\d+)\s*/\s*(\d+)\s+passed", out):
        pass
    if not m:
        return {"status": "no result line", "detail": "the suite printed no 'N/N passed' line (exit code %s)" % r.returncode}
    passed, total = int(m.group(1)), int(m.group(2))
    fails = len(re.findall(r"^FAIL", out, re.M))
    return {"status": "run", "passed": passed, "total": total, "failed": total - passed, "fail_lines": fails}


def run_tests(node):
    suites = {}
    for name, rel in SUITES:
        suites[name] = run_suite(node, rel)
    ran = [s for s in suites.values() if s["status"] == "run"]
    return {"suites": suites, "passed": sum(s["passed"] for s in ran), "total": sum(s["total"] for s in ran), "suites_run": len(ran)}


# ---------------------------------------------------------------- audit
def summarize_audit(path):
    if not os.path.isfile(path):
        return {"status": "not recorded", "reason": "tests/audit_result.json not present"}
    rows = json.load(open(path, encoding="utf-8"))
    working = [r for r in rows if r.get("status") != "no-success-marker"]
    nomark = [r for r in rows if r.get("status") == "no-success-marker"]
    titles = {}
    for r in working:
        seen = set()
        for f in r.get("findings", []):
            if f.get("sev") not in ("error", "warning"):
                continue
            k = (f["sev"], fix_mojibake(f["title"]))
            if k in seen:
                continue
            seen.add(k)
            titles[k] = titles.get(k, 0) + 1
    per_rule = [{"severity": s, "title": t, "working_models": n} for (s, t), n in sorted(titles.items(), key=lambda x: (-x[1], x[0][1]))]
    return {
        "status": "read",
        "result_file_time": datetime.datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%dT%H:%M"),
        "how": "last saved result of tests/audit_fp.js, read not re-run",
        "models_audited": len(rows),
        "working": len(working),
        "no_success_marker": len(nomark),
        "working_with_error": sum(1 for r in working if any(f.get("sev") == "error" for f in r.get("findings", []))),
        "working_with_warning_or_error": sum(1 for r in working if any(f.get("sev") in ("error", "warning") for f in r.get("findings", []))),
        "error_findings_on_working": sum(1 for r in working for f in r.get("findings", []) if f.get("sev") == "error"),
        "findings_on_working_by_rule": per_rule,
        "note": "raw count of error findings on models that ran; they are false-alarm candidates and were not re-adjudicated by this script",
    }


def inventory(path):
    if not os.path.isfile(path):
        return {"status": "not recorded"}
    rows = json.load(open(path, encoding="utf-8"))
    by_set, by_fw, by_coup = {}, {}, {}
    for r in rows:
        by_set[r["set"]] = by_set.get(r["set"], 0) + 1
        by_fw[FW_NAMES.get(r["fw"], r["fw"])] = by_fw.get(FW_NAMES.get(r["fw"], r["fw"]), 0) + 1
        by_coup[r["coupling"]] = by_coup.get(r["coupling"], 0) + 1
    return {"status": "read", "folders_audited": len(rows), "by_collection": by_set, "by_family": by_fw, "by_coupling": by_coup,
            "note": "folders are named by collection and family only; no folder names or paths are stored"}


# ---------------------------------------------------------------- benchmark (same verdict logic as bench/compare.py)
def items(t):
    out = []
    for f in t.get("findings", []):
        out.append(("error" if f["sev"] == "error" else ("warn" if f["sev"] == "warning" else "info"), f["text"] if "text" in f else f.get("title", "")))
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


PATHLIKE = re.compile(r"[A-Za-z]:[\\/][^\s\"']*|(?:/[A-Za-z0-9_.-]+){3,}|\\\\[^\s]+")


def clean(s, limit=240):
    s = PATHLIKE.sub("<path>", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= limit else s[:limit - 1] + "…"


def evidence(t, locate):
    """What the tool said that bears on the fault (or the first thing it said), without paths."""
    if not t or "error" in t:
        return ""
    it = items(t)
    loc = [x.lower() for x in locate]
    rel = [(s, x) for s, x in it if loc and any(l in x.lower() for l in loc)]
    pick = rel or [(s, x) for s, x in it if s in ("error", "warn")]
    if pick:
        pick.sort(key=lambda sx: {"error": 0, "warn": 1}.get(sx[0], 2))
        s, x = pick[0]
        label = {"error": "error", "warn": "warning", "note": "note", "info": "info"}.get(s, s)
        extra = "" if len(pick) == 1 else " (+%d more)" % (len(pick) - 1)
        return "%s: %s%s" % (label, clean(x), extra)
    return clean(t.get("coverage", ""), 200)


def engine_outcome(r, eff):
    run = r["run"]
    e = (eff or {}).get(r["id"], {}).get("effect")
    if not run["ok"]:
        return "BROKE"
    if not e:
        return "OK"
    return "CHANGED" if e["max_rel_diff"] > 1e-6 else "NO-EFFECT"


def ask_tool(node, folder):
    """What the CURRENT rules say about a folder (bench/tool_report.js, read-only). None when the folder is missing or the call fails."""
    if not os.path.isdir(folder):
        return None
    try:
        r = subprocess.run([node, os.path.join(HERE, "tool_report.js"), folder], cwd=REPO, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
        return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else None
    except Exception:
        return None


def benchmark(work, fname, field, post_field, effect_name="effect.json", rescore_node=None):
    p = os.path.join(work, fname)
    if not os.path.isfile(p):
        return {"status": "not recorded", "reason": "result file %s not found" % fname}
    R = json.load(open(p, encoding="utf-8"))
    ep = os.path.join(work, effect_name)
    EFF = json.load(open(ep, encoding="utf-8")) if os.path.isfile(ep) else {}
    cases, live, saved = [], 0, 0
    for fid, r in sorted(R.items()):
        t = r.get(field)
        loc = r.get("locate", [])
        post_t = r.get(post_field) if post_field else None
        src = "saved file"
        if rescore_node:                  # ask the current rules again on the saved faulted copies; nothing is written in the work folder
            t_live = ask_tool(rescore_node, os.path.join(work, "g_" + fid))
            if t_live is not None:
                t, src = t_live, "current rules, re-asked now"
                if post_field:
                    wd = os.path.basename(str(r.get("workdir", "")).replace("\\", "/"))
                    post_live = ask_tool(rescore_node, os.path.join(work, wd)) if wd else None
                    post_t = post_live if post_live is not None else post_t
        live += src != "saved file"
        saved += src == "saved file"
        c = {"id": fid, "family": r.get("base", ""), "fault": r.get("title", ""), "is_control": fid.startswith("C_"),
             "expected": r.get("expected", ""), "engine": engine_outcome(r, EFF), "verdict": verdict(t, loc), "evidence": evidence(t, loc), "answer_from": src}
        if post_t:
            c["verdict_after_run"] = verdict(post_t, loc)
        cases.append(c)
    hit = lambda v: v in ("ERROR", "WARN")
    groups = {}
    for key, label, cond in (("stop", "faults that stop the engine", lambda x: x["engine"] == "BROKE"),
                             ("silent_damage", "faults the run survives that change results", lambda x: x["engine"] == "CHANGED"),
                             ("no_effect", "faults the run survives with no effect on results", lambda x: x["engine"] == "NO-EFFECT")):
        S = [x for x in cases if not x["is_control"] and cond(x)]
        groups[key] = {"label": label, "cases": len(S), "cause_named": sum(hit(x["verdict"]) for x in S), "as_error": sum(x["verdict"] == "ERROR" for x in S)}
    controls = [x for x in cases if x["is_control"]]
    return {"status": "read", "source_file": fname, "tool_field": field, "source_file_time": datetime.datetime.fromtimestamp(os.path.getmtime(p)).strftime("%Y-%m-%dT%H:%M"),
            "rescored_now": bool(rescore_node), "answers_re_asked": live, "answers_from_saved_file": saved,
            "effect_file": "effect.json" if EFF else "not available",
            "fault_cases": len([x for x in cases if not x["is_control"]]), "controls": len(controls),
            "control_false_alarms": sum(x["verdict"] == "ERROR" for x in controls),
            "groups": groups, "cases": cases}


def stale_check(bench, g):
    """A saved benchmark answer older than the last change to index.html says nothing about the current rules."""
    if bench.get("status") != "read" or bench.get("rescored_now"):
        return
    ip = os.path.join(REPO, "index.html")
    if os.path.isfile(ip) and bench["source_file_time"] < datetime.datetime.fromtimestamp(os.path.getmtime(ip)).strftime("%Y-%m-%dT%H:%M"):
        bench["possibly_stale"] = True
        bench["stale_note"] = "the saved benchmark answers are older than the current index.html; run bench/rescore.py or use --rescore to refresh them"


# ---------------------------------------------------------------- git / index.html at a commit
def git_info(rev):
    if rev:
        full = git("rev-parse", rev)
        if not full:
            sys.exit("snapshot: unknown commit %r" % rev)
        short = git("rev-parse", "--short", full)
        return {"commit": short, "message": git("log", "-1", "--format=%s", full), "commit_date": (git("log", "-1", "--format=%cd", "--date=format:%Y-%m-%dT%H:%M", full) or ""),
                "branch": "not recorded", "dirty": None, "in_main": None, "source": "commit %s, read from git history" % short}
    full = git("rev-parse", "HEAD") or ""
    short = git("rev-parse", "--short", "HEAD") or "unknown"
    branch = git("rev-parse", "--abbrev-ref", "HEAD") or "unknown"
    dirty = bool(git("status", "--porcelain", "--untracked-files=no"))
    in_main = None
    if git("rev-parse", "--verify", "-q", "main"):
        in_main = subprocess.run(["git", "merge-base", "--is-ancestor", "HEAD", "main"], cwd=REPO, capture_output=True).returncode == 0
    if BANNED[0].lower() in branch.lower():
        branch = "worktree branch"
    return {"commit": short, "message": git("log", "-1", "--format=%s", "HEAD") or "", "commit_date": git("log", "-1", "--format=%cd", "--date=format:%Y-%m-%dT%H:%M", "HEAD") or "",
            "branch": branch, "dirty": dirty, "in_main": in_main, "source": "HEAD of the main checkout when the snapshot was taken"}


def index_text(rev):
    if rev:
        out = subprocess.run(["git", "show", "%s:index.html" % rev], cwd=REPO, capture_output=True)
        if out.returncode != 0:
            return None
        return out.stdout.decode("utf-8", "replace")
    p = os.path.join(REPO, "index.html")
    return open(p, encoding="utf-8", errors="replace").read() if os.path.isfile(p) else None


# ---------------------------------------------------------------- ledger / data.js
def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:48] or "snapshot"


def list_snapshots():
    out = []
    for f in sorted(glob.glob(os.path.join(LEDGER, "*.json"))):
        try:
            out.append((os.path.basename(f), json.load(open(f, encoding="utf-8"))))
        except Exception as e:
            out.append((os.path.basename(f), {"label": "(unreadable: %s)" % type(e).__name__}))
    return out


def is_ancestor(commit, branch):
    """True / False, or None when git cannot tell (unknown commit or branch)."""
    if not commit or not branch or not git("rev-parse", "--verify", "-q", commit + "^{commit}") or not git("rev-parse", "--verify", "-q", branch):
        return None
    return subprocess.run(["git", "merge-base", "--is-ancestor", commit, branch], cwd=REPO, capture_output=True).returncode == 0


def milestone_git_state(ms):
    """For milestones that list commits: is the last one in the working branch, and in the published branch? Computed on every regeneration."""
    integ, pub = ms.get("integration_branch"), ms.get("published_branch")
    for m in ms.get("milestones", []):
        cs = m.get("commits") or []
        if cs:
            m["git_state"] = {"in_working_branch": all(is_ancestor(c, integ) is True for c in cs) if all(is_ancestor(c, integ) is not None for c in cs) else None,
                              "in_published_branch": all(is_ancestor(c, pub) is True for c in cs) if all(is_ancestor(c, pub) is not None for c in cs) else None,
                              "checked": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M")}
    return ms


def regenerate_data_js():
    snaps = [s for _, s in list_snapshots() if "id" in s]
    ms = json.load(open(MILESTONES, encoding="utf-8")) if os.path.isfile(MILESTONES) else {"milestones": []}
    ms = milestone_git_state(ms)
    payload = {"generated_from": "evolution/ledger/*.json and evolution/milestones.json", "snapshots": snaps, "milestones": ms.get("milestones", []),
               "milestones_meta": {k: v for k, v in ms.items() if k != "milestones"}}
    text = "// Generated by bench/snapshot.py from evolution/ledger/ and evolution/milestones.json. Do not edit by hand.\nwindow.EVOLUTION_DATA = " + json.dumps(payload, indent=1, ensure_ascii=False) + ";\n"
    check_paths(text, "data.js")
    with open(DATA_JS, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def check_paths(text, what):
    """Refuse to write absolute paths, the user name, or the names of the tools that assisted."""
    bad = []
    if re.search(r"(?<![A-Za-z0-9])[A-Za-z]:(?:\\|/)", text):
        bad.append("an absolute path (drive letter)")
    low = text.lower()
    for tok in {getpass.getuser(), os.environ.get("USERNAME", ""), os.environ.get("USER", "")} | set(BANNED):
        if tok and len(tok) > 2 and tok.lower() in low:
            bad.append("the text %r" % ("<user name>" if tok not in BANNED else tok))
    if bad:
        sys.exit("snapshot: refusing to write %s: it would contain %s. Nothing was written." % (what, ", ".join(sorted(set(bad)))))


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Write a snapshot of Hydra Check's state to evolution/ledger/.")
    ap.add_argument("--label", help="short name of this state, e.g. 'after mf6 rules'")
    ap.add_argument("--note", default="", help="what changed since the previous snapshot")
    ap.add_argument("--list", action="store_true", help="list the snapshots and exit")
    ap.add_argument("--regen", action="store_true", help="only regenerate evolution/data.js and exit")
    ap.add_argument("--version", default="", help="optional version label, e.g. a release tag")
    ap.add_argument("--no-tests", action="store_true", help="do not run the test suites (recorded as not recorded)")
    ap.add_argument("--no-audit", action="store_true", help="do not read the audit result (recorded as not recorded)")
    ap.add_argument("--no-bench", action="store_true", help="do not read benchmark results (recorded as not recorded)")
    ap.add_argument("--bench-file", default="results_AFTER.json", help="benchmark result file in the work folder (default results_AFTER.json)")
    ap.add_argument("--bench-field", default="tool_pre", help="field holding the tool's answer on the faulted copy (default tool_pre; 'tool' for results.json-style files)")
    ap.add_argument("--bench-post-field", default="tool_post", help="field holding the answer after the run ('' for none)")
    ap.add_argument("--when", help="YYYY-MM-DDTHH:MM, for a snapshot of a past state (default now)")
    ap.add_argument("--from-commit", help="count the rules in index.html at this commit (past state); tests and audit are then not recorded")
    ap.add_argument("--backfill-note", default="", help="what in this snapshot was measured then and what was reconstructed from saved files")
    ap.add_argument("--reconstructed", action="append", default=[], help="a field reconstructed from a saved file (repeatable)")
    ap.add_argument("--stamp-from", help="take the time stamp of this saved work-folder file as the snapshot time")
    ap.add_argument("--rescore", action="store_true", help="ask the CURRENT rules again on the saved faulted copies (g_<case> folders in the work folder) instead of trusting the saved answers; read-only")
    ap.add_argument("--git-unknown", action="store_true", help="the commit of this past state is not known: record it as not recorded")
    a = ap.parse_args()

    if a.list:
        snaps = list_snapshots()
        if not snaps:
            print("no snapshots yet in evolution/ledger/")
        for fn, s in snaps:
            b = s.get("benchmark", {})
            bs = "benchmark %d/%d named" % (b["groups"]["stop"]["cause_named"], b["groups"]["stop"]["cases"]) if b.get("status") == "read" else "benchmark not recorded"
            t = s.get("tests", {})
            ts = "tests %s/%s" % (t.get("passed"), t.get("total")) if t.get("suites") else "tests not recorded"
            print("%-52s %-9s %s | %s | %s" % (fn, s.get("kind", "?"), s.get("git", {}).get("commit", "?"), ts, bs))
        return
    if a.regen:
        regenerate_data_js()
        print("evolution/data.js regenerated")
        return
    if not a.label:
        ap.error("--label is required")

    sys.path.insert(0, HERE)
    work = None
    if not (a.no_bench and a.stamp_from is None):
        try:
            import config
            work = config.work_root()
        except SystemExit:
            if not a.no_bench:
                raise
    try:
        import config as _c
        node = _c.get("node_path")
    except SystemExit:
        node = NODE_FALLBACK

    past = bool(a.from_commit or a.when or a.stamp_from or a.git_unknown)
    if a.stamp_from and work:
        sp = os.path.join(work, a.stamp_from)
        when = datetime.datetime.fromtimestamp(os.path.getmtime(sp)).strftime("%Y-%m-%dT%H:%M")
    else:
        when = a.when or datetime.datetime.now().strftime("%Y-%m-%dT%H:%M")
    if not re.match(r"^\d{4}-\d\d-\d\dT\d\d:\d\d$", when):
        sys.exit("snapshot: --when must look like 2026-10-09T15:30")
    sid = when.replace(":", "") + "_" + slug(a.label)
    target = os.path.join(LEDGER, sid + ".json")
    if os.path.exists(target):
        sys.exit("snapshot: %s already exists (same label and minute). Ledger files are never overwritten; use another label." % (sid + ".json"))
    clash = [os.path.basename(f) for f in glob.glob(os.path.join(LEDGER, when.replace(":", "") + "_" + slug(a.label) + ".json"))]
    if clash:
        sys.exit("snapshot: already exists: %s" % clash[0])

    measured, reconstructed, not_recorded = [], list(a.reconstructed), []
    g = {"commit": "not recorded", "message": "", "commit_date": "", "branch": "not recorded", "dirty": None, "in_main": None,
         "source": "the committed state this snapshot describes was not recorded"} if a.git_unknown else git_info(a.from_commit)
    if g["commit"] != "not recorded":
        (reconstructed if a.from_commit else measured).append("git commit")
    else:
        not_recorded.append("git commit")

    txt = index_text(a.from_commit) if not a.git_unknown else None
    fam = count_rules(txt) if txt else None
    if fam:
        rules = {"status": "counted", "source": "index.html at commit %s" % g["commit"] if a.from_commit else "index.html in the working tree",
                 "families": {k: dict(v, name=FAMILY_NAMES.get(k, k)) for k, v in fam.items()},
                 "total": sum(v["rules"] for v in fam.values()), "error_calls": sum(v["error_calls"] for v in fam.values()), "warning_calls": sum(v["warning_calls"] for v in fam.values()),
                 "note": "a rule is a function in a RULES array; error/warning calls are finding('error'|'warning', ...) calls with a literal severity, so a rule can hold several"}
        (reconstructed if a.from_commit else measured).append("rule counts")
    else:
        rules = {"status": "not recorded"}
        not_recorded.append("rule counts")

    if a.no_tests or past:
        tests = {"status": "not recorded", "reason": "test suites were not run for this state" if not past or a.no_tests else "past state: tests were not run at that time"}
        not_recorded.append("test results")
    else:
        tests = run_tests(node)
        tests["status"] = "run"
        measured.append("test results")

    if a.no_audit or past:
        audit = {"status": "not recorded", "reason": "no audit result exists for this point in time"}
        not_recorded.append("precision audit")
    else:
        audit = summarize_audit(os.path.join(REPO, "tests", "audit_result.json"))
        (measured if audit["status"] == "read" else not_recorded).append("precision audit (last saved result)")
    inv_path = os.path.join(REPO, "tests", "audit_result.json")
    if a.no_audit or past:
        inv = {"status": "not recorded"}
        not_recorded.append("model inventory")
    else:
        inv = inventory(inv_path)
        (measured if inv["status"] == "read" else not_recorded).append("model inventory")

    if a.no_bench or not work:
        bench = {"status": "not recorded", "reason": "no benchmark result for this point in time"}
        not_recorded.append("benchmark matrix")
    else:
        bench = benchmark(work, a.bench_file, a.bench_field, a.bench_post_field or None, rescore_node=node if a.rescore else None)
        if not past:
            stale_check(bench, g)
        if bench["status"] == "read":
            (reconstructed if past else measured).append("benchmark matrix (from the saved result file)")
        else:
            not_recorded.append("benchmark matrix")

    snap = {"schema": SCHEMA, "id": sid, "label": a.label, "version": a.version, "taken_at": when, "kind": "backfill" if past else "live",
            "note": a.note, "backfill_note": a.backfill_note, "git": g, "rules": rules, "tests": tests, "audit": audit, "benchmark": bench, "inventory": inv,
            "provenance": {"measured_when_taken": sorted(set(measured)), "reconstructed_from_saved_files": sorted(set(reconstructed)), "not_recorded": sorted(set(not_recorded))}}
    text = json.dumps(snap, indent=1, ensure_ascii=False) + "\n"
    check_paths(text, "the snapshot")
    os.makedirs(LEDGER, exist_ok=True)
    with open(target, "x", encoding="utf-8", newline="\n") as fh:      # "x": never overwrite
        fh.write(text)
    regenerate_data_js()

    print("wrote evolution/ledger/%s" % (sid + ".json"))
    print("  commit    : %s %s" % (g["commit"], ("(" + g["message"][:70] + ")") if g["message"] else ""))
    if rules["status"] == "counted":
        print("  rules     : %d total  (%s)" % (rules["total"], ", ".join("%s %d" % (v["name"], v["rules"]) for v in rules["families"].values())))
    else:
        print("  rules     : not recorded")
    if tests.get("suites"):
        print("  tests     : %d/%d passed in %d suites (%s)" % (tests["passed"], tests["total"], tests["suites_run"],
              "; ".join("%s %s" % (k, ("%d/%d" % (v["passed"], v["total"])) if v["status"] == "run" else v["status"]) for k, v in tests["suites"].items())))
    else:
        print("  tests     : not recorded")
    if audit.get("status") == "read":
        print("  audit     : %d folders, %d working, %d working with an error finding (file saved %s)" % (audit["models_audited"], audit["working"], audit["working_with_error"], audit["result_file_time"]))
    else:
        print("  audit     : not recorded")
    if bench.get("status") == "read":
        gs = bench["groups"]
        print("  benchmark : stop-faults cause named %d/%d (as error %d/%d); silent damage %d/%d; control false alarms %d/%d  (from %s, saved %s)" % (
            gs["stop"]["cause_named"], gs["stop"]["cases"], gs["stop"]["as_error"], gs["stop"]["cases"], gs["silent_damage"]["cause_named"], gs["silent_damage"]["cases"],
            bench["control_false_alarms"], bench["controls"], bench["source_file"], bench["source_file_time"]))
    else:
        print("  benchmark : not recorded")
    if bench.get("possibly_stale"):
        print("  WARNING   : " + bench["stale_note"])
    print("  not recorded: %s" % (", ".join(snap["provenance"]["not_recorded"]) or "nothing"))
    print("evolution/data.js regenerated")


if __name__ == "__main__":
    main()
