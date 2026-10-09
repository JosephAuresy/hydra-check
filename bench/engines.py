"""Run a hydrologic model engine on a COPY of a model folder and say what happened.

Safety rules baked in: the original folder is never touched (inputs are copied to a work folder), the program gets no
stdin, has a hard time limit, and its whole process tree is killed on timeout.
"""
import os, re, shutil, subprocess, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config

WORK_ROOT = config.work_root()   # key work_root (bench/hydra_bench.config.json or HYDRA_BENCH_WORK_ROOT)

# Files that a run WRITES. They are not copied, so a stale success marker or old output can never be mistaken for a result.
OUTPUT_PATTERNS = [
    r"^success\.fin$", r"^diagnostics\.out$", r"^simulation\.out$", r"^files_out\.out$", r"^area_calc\.out$", r"\.out$",
    r"_(day|mon|yr|aa)\.(txt|csv)$", r"^gwflow_(?!.*\.(input|con)$).*\.txt$", r"^salt_.*_(day|mon|yr|aa)\.txt$",
    r"^output\.(std|rch|sub|hru|rsv|pst|swr|wtr)$", r"^swatmf_out_", r"^swatmf_log$", r"^smrt_out_", r"^smrt_log$",
    r"^apexmf_out_", r"^amf_", r"\.(hds|hed|cbc|ccf|lst|list)$", r"^mfsim\.lst$", r"\.ucn$", r"^error\.log$",
]
_OUT = [re.compile(p, re.I) for p in OUTPUT_PATTERNS]


def is_output(name):
    return any(r.search(name) for r in _OUT)


def rel_work(path):
    """A work folder as it is written into result files: relative to WORK_ROOT (never an absolute path)."""
    if not path:
        return path
    p = os.path.normpath(path)
    root = os.path.normpath(WORK_ROOT)
    if os.path.isabs(p):
        try:
            if os.path.normcase(os.path.commonpath([p, root])) == os.path.normcase(root):
                return os.path.relpath(p, root).replace(os.sep, "/")
        except ValueError:
            pass
        return os.path.basename(p)
    return p.replace(os.sep, "/")


def abs_work(path):
    """Inverse of rel_work (an absolute path read from an old result file is kept as it is)."""
    return os.path.join(WORK_ROOT, path)


_ABS_PATH = re.compile(r"[A-Za-z]:[\\/][^\s\"'|<>]*|(?<![\w.])/(?:home|Users|mnt|opt|tmp|var)/[^\s\"'|<>]*")


def scrub(text):
    """Remove absolute machine paths from text that is going to be written into a result file."""
    if not text:
        return text
    for variant in (WORK_ROOT, WORK_ROOT.replace("/", chr(92)), WORK_ROOT.replace(chr(92), "/")):
        text = text.replace(variant, "<work>")
    return _ABS_PATH.sub("<path>", text)


def scrub_obj(o):
    """scrub() applied to every string inside a JSON-like structure."""
    if isinstance(o, str):
        return scrub(o)
    if isinstance(o, list):
        return [scrub_obj(x) for x in o]
    if isinstance(o, dict):
        return {k: scrub_obj(v) for k, v in o.items()}
    return o


def make_workdir(src, case_id, keep_exe=True):
    """Copy the inputs of `src` into WORK_ROOT/case_id and return the new path (existing work folder is replaced)."""
    dst = os.path.join(WORK_ROOT, case_id)
    if os.path.exists(dst):
        shutil.rmtree(dst)
    os.makedirs(dst)
    n = 0
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in ("__pycache__", ".ipynb_checkpoints", ".git")]
        rel = os.path.relpath(root, src)
        target = dst if rel == "." else os.path.join(dst, rel)
        os.makedirs(target, exist_ok=True)
        for f in files:
            if is_output(f):
                continue
            shutil.copy2(os.path.join(root, f), os.path.join(target, f))
            n += 1
    return dst, n


def _kill_tree(proc):
    try:
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True, timeout=30)
    except Exception:
        pass


def run_exe(workdir, exe, args=None, timeout=600):
    """Run `exe` inside `workdir`. Returns dict(exit, seconds, timed_out, stdout_tail)."""
    cmd = [os.path.join(workdir, exe)] + list(args or [])
    t0 = time.time()
    proc = subprocess.Popen(cmd, cwd=workdir, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    timed_out = False
    try:
        out, _ = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        _kill_tree(proc)
        try:
            out, _ = proc.communicate(timeout=30)
        except Exception:
            out = b""
    text = (out or b"").decode("utf-8", "replace")
    return {"exit": proc.returncode, "seconds": round(time.time() - t0, 1), "timed_out": timed_out,
            "stdout_tail": scrub("\n".join(text.splitlines()[-12:])[-1500:]), "stdout_len": len(text)}


# How to judge a run, per family. `ok(workdir, result)` returns True/False; `crash_clue` pulls a short reason out of the tail.
def swatplus_ok(wd, r):
    return os.path.isfile(os.path.join(wd, "success.fin"))


def text_ok(marker):
    return lambda wd, r: marker.lower() in r["stdout_tail"].lower() and not r["timed_out"]


def apex_ok(wd, r):
    """APEX prints no completion sentence; it prints 'YEAR n OF N'. A finished run reached n == N and exited 0."""
    if r["timed_out"] or r["exit"] != 0:
        return False
    m = re.findall(r"YEAR\s+(\d+)\s+OF\s+(\d+)", r["stdout_tail"])
    return bool(m) and m[-1][0] == m[-1][1]


def apexmf_ok(wd, r):
    """APEX-MODFLOW ends with a MODFLOW day counter, not a sentence. A finished run exits 0 and has written its amf_* outputs."""
    if r["timed_out"] or r["exit"] != 0:
        return False
    md = os.path.join(wd, "MODFLOW")
    return os.path.isdir(md) and any(f.lower().startswith("amf_") for f in os.listdir(md))


ENGINES = {
    "swatplus": {"ok": swatplus_ok, "timeout": 900},
    "swat2012": {"ok": text_ok("Execution successfully completed"), "timeout": 900},
    "swatmf": {"ok": text_ok("Execution successfully completed"), "timeout": 900},
    "mf6": {"ok": text_ok("Normal termination of simulation"), "timeout": 300},
    "apex": {"ok": apex_ok, "timeout": 600},
    "apexmf": {"ok": apexmf_ok, "timeout": 900},
}


def crash_clue(r):
    t = r.get("stdout_tail", "")
    for pat in (r"(Assignment of scalar to unallocated array[^\n]*)", r"(forrtl[^\n]*)", r"(Program received signal[^\n]*)",
                r"(Fortran runtime error[^\n]*)", r"(error[^\n]{0,100})", r"(STOP[^\n]{0,100})"):
        m = re.search(pat, t, re.I)
        if m:
            return m.group(1).strip()[:160]
    return ""


def silent_probe(engine, wd):
    """Things a run can reveal even when it finishes. SWAT+ logs 'file not found' in diagnostics.out and carries on."""
    if engine != "swatplus":
        return {}
    p = os.path.join(wd, "diagnostics.out")
    if not os.path.isfile(p):
        return {}
    with open(p, "r", encoding="utf-8", errors="replace") as fh:
        return {"diag_notfound": sum(1 for l in fh if "file not found" in l)}
