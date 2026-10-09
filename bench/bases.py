"""The working models the benchmark starts from. Each has an engine key (see engines.ENGINES), a model folder and an executable.

Folders and executables are not written here: they come from bench/hydra_bench.config.json (keys models.<id> and executables.<id>,
see config.py). A base reads its location only when it is used, so scripts that never run a model need no model paths.
"""
import os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config

# files that must sit next to the executable to run it (copied from the executable's own folder when present)
COMPANIONS = {"mf6": ["libmf6.dll"]}


class Base(dict):
    """Static facts about a base model; `src`, `exe` and `extra_files` are resolved from the configuration on first use."""

    def __init__(self, base_id, **kw):
        dict.__init__(self, id=base_id, **kw)

    def __missing__(self, key):
        if key == "src":
            return config.model_dir(self["id"])
        if key == "exe":                      # name of the executable inside the work folder
            return os.path.basename(config.executable(self["id"]))
        if key == "extra_files":              # files copied into every work folder: the executable and its companions
            exe = config.executable(self["id"])
            out = [exe]
            for name in COMPANIONS.get(self["id"], []):
                p = os.path.join(os.path.dirname(exe), name)
                if os.path.isfile(p):
                    out.append(p)
            return out
        raise KeyError(key)


BASES = {
    "swatplus_p29": Base("swatplus_p29", engine="swatplus", prepare="short_run_2y+sort_cli",
                         note="Pekin-area SWAT+ rev 61.0.2, classic aquifers (gwflow files present but switched off); shortened to 2 years"),
    "swat2012": Base("swat2012", engine="swat2012", note="Park: Middle Bosque, SWAT2012 only"),
    "swatmf": Base("swatmf", engine="swatmf", note="Park: Middle Bosque, SWAT2012 + MODFLOW-NWT"),
    "mf6": Base("mf6", engine="mf6", note="FloPy-built MODFLOW 6 6.7.0 GWF+GWT with UZF/UZT"),
    "apex": Base("apex", engine="apex", note="Park: APEX example"),
    "apexmf": Base("apexmf", engine="apexmf", note="Park: APEX-MODFLOW example"),
}


def add_extras(base, workdir):
    for p in base["extra_files"]:
        shutil.copy2(p, os.path.join(workdir, os.path.basename(p)))


def prepare(base, workdir):
    """Optional base-specific preparation (applied to the copy, then the baseline must still pass)."""
    import re, io
    nl = chr(10)
    for name in (base.get("prepare") or "").split("+"):
        if name == "short_run_2y":                  # time.sim: end year = start year + 1
            p = os.path.join(workdir, "time.sim")
            lines = io.open(p, "r", encoding="utf-8", newline="").read().split(nl)
            toks = list(re.finditer(r"\S+", lines[2]))
            start = int(toks[1].group())
            t = toks[3]
            lines[2] = lines[2][:t.start()] + str(start + 1) + lines[2][t.end():]
            io.open(p, "w", encoding="utf-8", newline="").write(nl.join(lines))
        elif name == "sort_cli":                    # repair the documented defect: unsorted station lists (own-log bug #4)
            for f in ("pcp.cli", "tmp.cli"):
                p = os.path.join(workdir, f)
                if not os.path.isfile(p):
                    continue
                lines = io.open(p, "r", encoding="utf-8", newline="").read().split(nl)
                body = sorted([l for l in lines[2:] if l.strip()])
                io.open(p, "w", encoding="utf-8", newline="").write(nl.join(lines[:2] + body) + nl)
