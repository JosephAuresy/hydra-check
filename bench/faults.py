"""Fault catalogue. Every fault is a small, reversible edit of a COPY of a working model, with the reason it exists.

provenance: where the fault comes from
    own-log   : documented in the Pecos bug tracker / change log (root cause known)
    corpus    : a failure class reported repeatedly in the SWAT / MODFLOW community forums
    source    : a rule or crash read directly in the model's source code
    probe     : a plausible user mistake with no documented outcome; included to see what really happens
kind: what we EXPECT from the run (the run itself decides the real outcome)
    crash   : the engine should stop      silent : the engine finishes but the result is wrong      unknown : no expectation
locate: strings that a correct diagnosis should mention (file names / terms), used to score localization
"""
import io, os, re


def _read(p):
    with io.open(p, "r", encoding="utf-8", errors="replace", newline="") as fh:
        return fh.read()


def _write(p, s):
    with io.open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(s)


def edit(wd, name, fn):
    p = os.path.join(wd, name)
    s = _read(p)
    t = fn(s)
    if t == s:
        raise RuntimeError("edit of %s changed nothing" % name)
    _write(p, t)


def delete(wd, name):
    os.remove(os.path.join(wd, name))


def truncate(wd, name):
    _write(os.path.join(wd, name), "")


def replace_token(line, idx, new):
    toks = list(re.finditer(r"\S+", line))
    m = toks[idx]
    return line[:m.start()] + new + line[m.end():]


def map_lines(s, fn):
    return "\n".join(fn(i, l) for i, l in enumerate(s.split("\n")))


# ---------------------------------------------------------------- SWAT+ (Pecos rev 62)
def p_gwflow_flag_on(wd):              # codes.bsn gwflow 0 -> 1 while file.cio still connects aquifer.con (gwflow files exist)
    def f(s):
        lines = s.split("\n")
        gi = lines[1].split().index("gwflow")
        lines[2] = replace_token(lines[2], gi, "1")
        return "\n".join(lines)
    edit(wd, "codes.bsn", f)


def p_codes_rev62_layout(wd):          # a rev-62 codes.bsn (qual2e + idc_till) given to a rev-61 engine
    def f(s):
        lines = s.split("\n")
        lines[1] = lines[1].replace("i_fpwet", "qual2e").rstrip("\r") + " idc_till" + ("\r" if lines[1].endswith("\r") else "")
        lines[2] = lines[2].rstrip("\r") + " 3" + ("\r" if lines[2].endswith("\r") else "")
        return "\n".join(lines)
    edit(wd, "codes.bsn", f)


def p_end_before_start(wd):
    edit(wd, "time.sim", lambda s: map_lines(s, lambda i, l: replace_token(l, 3, "1999") if i == 2 else l))


def p_missing_climate(wd):
    delete(wd, "GHCND_US1TXVV0014.pcp")


def p_soil_null(wd):
    def f(s):
        done = [False]

        def one(i, l):
            t = l.split()
            if not done[0] and len(t) == 14 and all(re.match(r"^[-+]?\d", x) for x in t):
                done[0] = True
                return replace_token(l, 1, "null")
            return l
        return map_lines(s, one)
    edit(wd, "soils.sol", f)


def p_empty_time_sim(wd):
    truncate(wd, "time.sim")


def p_unsorted_pcp_cli(wd):
    def f(s):
        lines = s.split("\n")
        head, body = lines[:2], [l for l in lines[2:] if l.strip()]
        return "\n".join(head + list(reversed(body))) + "\n"
    edit(wd, "pcp.cli", f)


def p_hru_rows_short(wd):              # every data row of hru-data.hru loses its last field (analog of own-log bug #25)
    def f(s):
        lines = s.split("\n")
        width = len(lines[1].split())
        out = []
        for i, l in enumerate(lines):
            t = l.split()
            if i >= 2 and len(t) == width:
                l = "  ".join(t[:-1]) + ("\r" if l.endswith("\r") else "")
            out.append(l)
        return "\n".join(out)
    edit(wd, "hru-data.hru", f)


# ---------------------------------------------------------------- SWAT2012 (Middle Bosque)
def w_nbyr_exceeds_climate(wd):
    edit(wd, "file.cio", lambda s: re.sub(r"^(\s*)\d+(\s*\|\s*NBYR)", r"\g<1>60\2", s, count=1, flags=re.M))


def w_sol_null(wd):
    edit(wd, "000010001.sol", lambda s: re.sub(r"(Bulk Density Moist \[g/cc\]:\s+)[-\d.]+", r"\1null", s, count=1))


def w_missing_sol(wd):
    delete(wd, "000010001.sol")


def w_empty_sol(wd):
    truncate(wd, "000010001.sol")


# ---------------------------------------------------------------- SWAT-MODFLOW (Middle Bosque)
def m_low_units(wd):
    def f(s):
        s = re.sub(r"^(DIS\t)\d+", r"\g<1>12", s, flags=re.M)
        return re.sub(r"^(BAS6\t)\d+", r"\g<1>13", s, flags=re.M)
    edit(wd, "modflow.mfn", f)


def m_short_perlen(wd):
    edit(wd, "mf_1000.dis", lambda s: s.replace("1.000000000000E+004  10000", "1.000000000000E+002  100", 1))


def m_link_missing(wd):
    delete(wd, "swatmf_link.txt")


def m_package_missing(wd):
    delete(wd, "mf_1000.upw")


# ---------------------------------------------------------------- MODFLOW 6 (toy)
def f_nper_mismatch(wd):
    edit(wd, "mf6swatp_spike.tdis", lambda s: re.sub(r"NPER\s+5", "NPER  6", s))


def f_missing_npf(wd):
    delete(wd, "gwf.npf")


def f_outer_one(wd):
    p = os.path.join(wd, "gwf.ims")
    _write(p, _read(p).rstrip("\n") + "\n\nBEGIN nonlinear\n  OUTER_MAXIMUM  1\n  OUTER_DVCLOSE  1.0E-20\nEND nonlinear\n")


# ---------------------------------------------------------------- APEX (DREAM) and APEX-MODFLOW
def a_missing_soil(wd):
    delete(wd, "HOUSTON.SOL")


def a_empty_apexcont(wd):
    truncate(wd, "APEXCONT.DAT")


def am_link_missing(wd):
    delete(wd, os.path.join("MODFLOW", "apexmf_link.txt"))


FAULTS = [
    # id, base, title, provenance, expected kind, locate terms, apply
    ("P02_gwflow_flag_on", "swatplus_p29", "codes.bsn gwflow=1 while file.cio connects aquifer.con (gwflow files present)", "probe (mirror of the documented crash)", "unknown", ["codes.bsn", "file.cio", "gwflow"], p_gwflow_flag_on),
    ("P03_end_before_start", "swatplus_p29", "time.sim end year before start year", "corpus", "crash", ["time.sim"], p_end_before_start),
    ("P04_missing_climate", "swatplus_p29", "a precipitation file named in weather-sta.cli is deleted", "corpus", "crash", ["weather-sta.cli", "GHCND_US1TXVV0014"], p_missing_climate),
    ("P05_soil_numeric_null", "swatplus_p29", "null in a numeric soil column (bd)", "corpus (error 65 signature)", "crash", ["soils.sol"], p_soil_null),
    ("P06_empty_time_sim", "swatplus_p29", "time.sim truncated to 0 bytes", "corpus", "crash", ["time.sim"], p_empty_time_sim),
    ("P07_unsorted_pcp_cli", "swatplus_p29", "stations in pcp.cli no longer sorted", "own-log (bug #4: 125 of 129 stations ignored)", "silent", ["pcp.cli"], p_unsorted_pcp_cli),
    ("P08_hru_rows_short", "swatplus_p29", "hru-data.hru rows lose their last field", "own-log analog (bug #25: short rows, nothing loaded)", "unknown", ["hru-data.hru"], p_hru_rows_short),
    ("P09_codes_rev62_layout", "swatplus_p29", "rev-62 column layout in codes.bsn read by a rev-61 engine", "own-log (rev 62 migration) + source (read(107,*) bsn_cc is positional)", "unknown", ["codes.bsn", "layout", "column"], p_codes_rev62_layout),
    ("W01_nbyr_exceeds_climate", "swat2012", "NBYR=60 but the climate record is ~33 years", "corpus (exit code 24 / end of file)", "crash", ["file.cio", "NBYR", "climate"], w_nbyr_exceeds_climate),
    ("W02_sol_null", "swat2012", "null bulk density in a .sol file", "corpus", "crash", [".sol"], w_sol_null),
    ("W03_missing_sol", "swat2012", "a .sol file named by .sub/.hru is deleted", "corpus", "crash", ["000010001.sol"], w_missing_sol),
    ("W04_empty_sol", "swat2012", "a .sol file truncated to 0 bytes", "corpus", "crash", ["000010001.sol"], w_empty_sol),
    ("M01_mfn_low_units", "swatmf", "low Fortran unit numbers in modflow.mfn", "corpus (forrtl 157 signature)", "crash", ["modflow.mfn", "unit"], m_low_units),
    ("M02_dis_short_perlen", "swatmf", "MODFLOW time (sum PERLEN) shorter than the SWAT period", "source (mf_run.f consumes PERLEN one day at a time)", "crash", ["dis", "PERLEN", "period"], m_short_perlen),
    ("M03_link_missing", "swatmf", "swatmf_link.txt deleted", "corpus", "crash", ["swatmf_link"], m_link_missing),
    ("M04_package_missing", "swatmf", "mf_1000.upw named in modflow.mfn is deleted", "corpus", "crash", ["mf_1000.upw", "modflow.mfn"], m_package_missing),
    ("F01_tdis_nper_mismatch", "mf6", "NPER says 6 periods but 5 are defined", "probe", "crash", ["tdis", "NPER"], f_nper_mismatch),
    ("F02_missing_npf", "mf6", "gwf.npf deleted", "probe", "crash", ["npf"], f_missing_npf),
    ("F03_outer_maximum_one", "mf6", "OUTER_MAXIMUM 1 and a tiny closure: cannot converge", "probe", "unknown", ["ims", "converge"], f_outer_one),
    ("A01_missing_soil", "apex", "HOUSTON.SOL deleted", "probe", "crash", ["HOUSTON.SOL", "sol"], a_missing_soil),
    ("A02_empty_apexcont", "apex", "APEXCONT.DAT truncated to 0 bytes", "probe", "crash", ["APEXCONT"], a_empty_apexcont),
    ("AM01_link_missing", "apexmf", "apexmf_link.txt deleted", "probe", "crash", ["apexmf_link"], am_link_missing),
    # controls: the untouched base. Any ERROR the tool raises here is a false alarm.
    ("C_swatplus_p29", "swatplus_p29", "unmodified base (control)", "control", "ok", [], lambda wd: None),
    ("C_swat2012", "swat2012", "unmodified base (control)", "control", "ok", [], lambda wd: None),
    ("C_swatmf", "swatmf", "unmodified base (control)", "control", "ok", [], lambda wd: None),
    ("C_mf6", "mf6", "unmodified base (control)", "control", "ok", [], lambda wd: None),
    ("C_apex", "apex", "unmodified base (control)", "control", "ok", [], lambda wd: None),
    ("C_apexmf", "apexmf", "unmodified base (control)", "control", "ok", [], lambda wd: None),
]
