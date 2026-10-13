"""Fault catalogue, round 3: faults taken from REAL threads of two community forums, checked one by one.

Sources (read on 2026-10-12):
  modflow group              https://groups.google.com/g/modflow                      (local copy of 2,604 threads in swat-issue-atlas, searched for the error text users paste)
  EPIC / APEX forum          https://groups.google.com/g/agriliferesearchmodeling      (630 threads, read through the group's own search: forrtl, "IS MISSING", "NOT IN" LIST, end-of-file, syntax error)

Same tuple format as faults_v2.py. `provenance` starts with "forum:" and names the thread ids; FORUM_URLS gives the full links.
Every case is injected into a copy of a base model and run on the real engine (bench/run_v3.py). The tool is not called here and nothing is scored.
These cases were designed after the round-2 blind test had been scored, with its rules frozen at that time: they are a NEW test set, not
part of the blind round, and the tool's rules may have changed since (see docs/FORUM_EVIDENCE_MF_APEX.md).
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from faults import replace_token
from faults_v2 import ledit, sub1, delete, set_tok, drop_line, keep_lines

MF = "https://groups.google.com/g/modflow/c/"
AX = "https://groups.google.com/g/agriliferesearchmodeling/c/"


# ================================================================== MODFLOW 6 (toy GWF+GWT)
def f_required_block_removed(wd):     # the whole DIMENSIONS block of gwf.dis is gone
    def f(L):
        a = next(i for i, l in enumerate(L) if l.strip().upper().startswith("BEGIN DIMENSIONS"))
        b = next(i for i, l in enumerate(L) if l.strip().upper().startswith("END DIMENSIONS"))
        return L[:a] + L[b + 1:]
    ledit(wd, "gwf.dis", f)


def f_option_keyword_typo(wd):        # SAVE_FLOWS misspelled SAVE_FLOW in gwf.nam (an option the engine does not know)
    sub1(wd, "gwf.nam", r"\bSAVE_FLOWS\b", "SAVE_FLOW")


def f_perioddata_letter(wd):          # a letter O instead of a zero in a number of the perioddata block
    set_tok(wd, "mf6swatp_spike.tdis", 11, 0, "1.0O000000")


def f_no_active_nodes(wd):            # IDOMAIN = 0 everywhere: the model has no active cell
    def f(L):
        i = next(i for i, l in enumerate(L) if l.strip().upper().startswith("END GRIDDATA"))
        return L[:i] + ["  idomain", "    CONSTANT  0"] + L[i:]
    ledit(wd, "gwf.dis", f)


def f_duplicate_chd_cell(wd):         # the same constant-head cell listed twice (MAXBOUND raised to match)
    def f(L):
        i = next(i for i, l in enumerate(L) if re.match(r"^\s*1\s+1\s+5\s", l))
        L.insert(i + 1, L[i])
        return [re.sub(r"(MAXBOUND\s+)5", r"\g<1>6", l) for l in L]
    ledit(wd, "gwf.chd", f)


def f_block_end_mismatch(wd):         # the dimensions block of the tdis file is closed with END options
    sub1(wd, "mf6swatp_spike.tdis", r"END dimensions", "END options")


# ================================================================== SWAT-MODFLOW / APEX-MODFLOW (MODFLOW-NWT inside the coupled engine)
def _dis(prefix):
    return os.path.join(prefix, "mf_1000.dis") if prefix else "mf_1000.dis"


def _mfn(prefix):
    return os.path.join(prefix, "modflow.mfn") if prefix else "modflow.mfn"


def _array_control_bad(prefix):
    def apply(wd):                    # 'x.x' instead of the multiplier in the control record of the TOP array
        def f(L):
            i = next(i for i, l in enumerate(L) if "# TOP" in l and l.upper().startswith("INTERNAL"))
            L[i] = re.sub(r"^(INTERNAL\s+)\S+", r"\g<1>x.x", L[i], flags=re.I)
            return L
        ledit(wd, _dis(prefix), f)
    return apply


def _array_value_letter(prefix):
    def apply(wd):                    # a letter O inside the first number of the TOP array
        def f(L):
            i = next(i for i, l in enumerate(L) if "# TOP" in l and l.upper().startswith("INTERNAL"))
            L[i + 1] = replace_token(L[i + 1], 0, re.sub(r"0", "O", L[i + 1].split()[0], count=1))
            return L
        ledit(wd, _dis(prefix), f)
    return apply


def _cbc_text_unit(prefix):
    def apply(wd):                    # the binary budget file declared as a text file
        sub1(wd, _mfn(prefix), r"^DATA\(BINARY\)(\s+\d+\s+\S*mf_1000\.cbc)", r"DATA\1")
    return apply


def _riv_truncated(prefix):
    def apply(wd):                    # the river package file cut after a few lines
        keep_lines(wd, os.path.join(prefix, "mf_1000.riv") if prefix else "mf_1000.riv", 12)
    return apply


# ================================================================== APEX (DREAM example)
def _opc_files(wd):
    return sorted(f for f in os.listdir(wd) if f.upper().endswith(".OPC"))


def _each_opc(wd, fn):
    n = 0
    for name in _opc_files(wd):
        try:
            ledit(wd, name, fn)
            n += 1
        except RuntimeError:
            pass
    if not n:
        raise RuntimeError("no operation file had the row")


def a_crop_id_unknown(wd):            # the crop of the planting row is crop 999, which is not in the crop list
    def f(L):
        for i, l in enumerate(L):
            if re.search(r"\bplant\b", l, re.I) and len(l.split()) > 6:
                L[i] = replace_token(l, 5, "999")
                return L
        raise RuntimeError("no plant row")
    _each_opc(wd, f)


def a_operations_unordered(wd):       # the planting row and the harvest row exchanged: operations no longer in date order
    def f(L):
        ip = next((i for i, l in enumerate(L) if re.search(r"\bplant\b", l, re.I)), None)
        ih = next((i for i, l in enumerate(L) if re.search(r"\bharvest\b", l, re.I)), None)
        if ip is None or ih is None:
            raise RuntimeError("no plant/harvest rows")
        L[ip], L[ih] = L[ih], L[ip]
        return L
    _each_opc(wd, f)


def a_plant_phu_zero(wd):             # heat units to maturity (PHU) 0 in the planting operation
    def f(L):
        for i, l in enumerate(L):
            if re.search(r"\bplant\b", l, re.I) and len(l.split()) > 7:
                L[i] = replace_token(l, 7, "0.")
                return L
        raise RuntimeError("no plant row")
    _each_opc(wd, f)


def a_fert_id_unknown(wd):            # the fertilizer of a fertilizer operation is number 999, which is not in the fertilizer list
    def f(L):
        for i, l in enumerate(L):
            if re.search(r"fertilizer", l, re.I) and len(l.split()) > 7:
                L[i] = replace_token(l, 6, "999")
                return L
        raise RuntimeError("no fertilizer row")
    _each_opc(wd, f)


def a_sand_zero(wd):                  # sand 0 % in every layer of the soil files (very low sand makes APEX produce NA values)
    n = 0
    for name in ("Heiden.SOL", "HoustonB.SOL"):
        def f(L):
            L[7] = re.sub(r"[-\d.]+", "0.00", L[7])
            return L
        ledit(wd, name, f)
        n += 1


def a_daily_syntax(wd):               # a letter O in a number of the daily weather file (list-directed read error)
    def f(L):
        for i, l in enumerate(L):
            t = l.split()
            if len(t) >= 6 and t[0] == "1998":
                L[i] = replace_token(l, 3, "1O.00")
                return L
        raise RuntimeError("no 1998 row")
    ledit(wd, "A48309.dly", f)


def a_daily_blank_rain(wd):           # the rain field of every 1998 row left blank instead of a number
    def f(L):
        n = 0
        for i, l in enumerate(L):
            t = l.split()
            if len(t) >= 6 and t[0] == "1998":
                L[i] = replace_token(l, 5, " " * len(t[5]))
                n += 1
        if not n:
            raise RuntimeError("no 1998 rows")
        return L
    ledit(wd, "A48309.dly", f)


def a_daily_deleted(wd):              # the daily weather file is not in the folder
    delete(wd, "A48309.dly")


# ------------------------------------------------------------------------------------------------ catalogue
FAULTS_V3 = [
    ("MF6F01_required_block_removed", "mf6", "gwf.dis without its DIMENSIONS block", "forum: modflow DNs6BbDyPuY, whie8epkb28 (required block not found)", "crash", ["gwf.dis", "dimensions", "block"], f_required_block_removed),
    ("MF6F02_option_keyword_typo", "mf6", "SAVE_FLOWS misspelled SAVE_FLOW in the options block of gwf.nam", "forum: modflow e-yk8R0CRRA, 3HZTIZSPLuk, 9ep0zKorzL8 (unknown option)", "crash", ["gwf.nam", "SAVE_FLOW", "option"], f_option_keyword_typo),
    ("MF6F03_perioddata_letter", "mf6", "a letter O in a number of the tdis perioddata block", "forum: modflow afCjktqWlmQ (could not read variable of type double)", "crash", ["tdis", "perioddata"], f_perioddata_letter),
    ("MF6F04_no_active_nodes", "mf6", "IDOMAIN 0 everywhere in gwf.dis", "forum: modflow Ug4Eejt__q4 (model does not have any active nodes)", "crash", ["gwf.dis", "idomain", "active"], f_no_active_nodes),
    ("MF6F05_duplicate_chd_cell", "mf6", "the same constant-head cell listed twice in gwf.chd", "forum: modflow Oc_EEfoCyvs (cell is already a constant head)", "crash", ["gwf.chd", "constant head", "duplicate"], f_duplicate_chd_cell),
    ("MF6F06_block_end_mismatch", "mf6", "tdis dimensions block closed with END options", "forum: modflow DNs6BbDyPuY (END detected before ...)", "crash", ["tdis", "END", "block"], f_block_end_mismatch),
    ("SMF01_array_control_record", "swatmf", "x.x in the control record of the TOP array of mf_1000.dis", "forum: modflow r4fwcasvhlI, 6hD67Hpe1Ks, UKx3Qw_ygH8, 1rqBx_s-1vM (error reading array control record)", "crash", ["mf_1000.dis", "TOP", "array"], _array_control_bad("")),
    ("SMF02_array_value_letter", "swatmf", "a letter O inside the first number of the TOP array", "forum: modflow 9BjiVDWTq4E, EU6JLDRKB1o (list-directed syntax / input conversion error)", "crash", ["mf_1000.dis", "TOP", "number"], _array_value_letter("")),
    ("SMF03_cbc_text_unit", "swatmf", "the binary budget file declared as a text file in modflow.mfn", "forum: modflow jdoZMK0pA68, Ji4Yg1J5Wt8 (formatted I/O to unit open for unformatted)", "crash", ["modflow.mfn", "cbc", "BINARY"], _cbc_text_unit("")),
    ("SMF04_riv_truncated", "swatmf", "mf_1000.riv cut after 12 lines", "forum: modflow EZV8xTm_nNY (end-of-file during read)", "crash", ["mf_1000.riv", "end of file"], _riv_truncated("")),
    ("AMF01_array_control_record", "apexmf", "x.x in the control record of the TOP array of MODFLOW/mf_1000.dis", "forum: modflow r4fwcasvhlI, 6hD67Hpe1Ks, UKx3Qw_ygH8, 1rqBx_s-1vM (error reading array control record)", "crash", ["mf_1000.dis", "TOP", "array"], _array_control_bad("MODFLOW")),
    ("AMF02_array_value_letter", "apexmf", "a letter O inside the first number of the TOP array", "forum: modflow 9BjiVDWTq4E, EU6JLDRKB1o (list-directed syntax / input conversion error)", "crash", ["mf_1000.dis", "TOP", "number"], _array_value_letter("MODFLOW")),
    ("AMF03_cbc_text_unit", "apexmf", "the binary budget file declared as a text file in MODFLOW/modflow.mfn", "forum: modflow jdoZMK0pA68, Ji4Yg1J5Wt8 (formatted I/O to unit open for unformatted)", "crash", ["modflow.mfn", "cbc", "BINARY"], _cbc_text_unit("MODFLOW")),
    ("APF01_crop_id_unknown", "apex", "planting operation with crop 999, not in the crop list", "forum: apex uRsllcxAU-4 (115 NOT IN CROP LIST FILE)", "crash", [".OPC", "crop", "999"], a_crop_id_unknown),
    ("APF02_operations_unordered", "apex", "planting and harvest rows exchanged: operations not in date order", "forum: apex VhQzOS_xx1Q (One operation is not ordered by date)", "unknown", [".OPC", "order", "date"], a_operations_unordered),
    ("APF03_plant_phu_zero", "apex", "heat units to maturity 0 in the planting operation", "forum: apex pDc8CHEtyAE (the value for the PHU is missing)", "unknown", [".OPC", "PHU", "plant"], a_plant_phu_zero),
    ("APF04_fert_id_unknown", "apex", "fertilizer operation with fertilizer 999, not in the fertilizer list", "forum: apex UHq7cqCdUu8 (0 not in Fert List file)", "crash", [".OPC", "fertilizer", "999"], a_fert_id_unknown),
    ("APF05_sand_zero", "apex", "sand 0 % in every soil layer of the used soil files", "forum: apex XG_QTgPy7Sc (Low sand values cause NA values)", "silent", [".SOL", "sand"], a_sand_zero),
    ("APF06_daily_syntax", "apex", "a letter O in a number of the daily weather file", "forum: apex ne0wwZ_0bpg, 8Rl7OmLgPkA (list-directed I/O syntax error)", "crash", ["A48309.dly", "syntax", "number"], a_daily_syntax),
    ("APF07_daily_blank_rain", "apex", "rain field of the 1998 rows left blank in the daily weather file", "forum: apex xyc3r9m9Q_U (Daily weather ignored?)", "unknown", ["A48309.dly", "blank", "rain"], a_daily_blank_rain),
    ("APF08_daily_deleted", "apex", "the daily weather file is not in the folder", "forum: apex MRl547rwZec, Q0qX4S0ph3c (weather / DLY file is missing)", "crash", ["A48309.dly", "missing"], a_daily_deleted),
]

FAMILY_V3 = {"mf6": "MODFLOW 6", "swatmf": "SWAT-MODFLOW", "apexmf": "APEX-MODFLOW", "apex": "APEX"}


def forum_urls(provenance):
    """Full links of the thread ids named in a provenance string ('forum: modflow id, id' or 'forum: apex id, ...')."""
    m = re.match(r"forum: (modflow|apex) (.*?)(?: \(|$)", provenance)
    if not m:
        return []
    base = MF if m.group(1) == "modflow" else AX
    return [base + i.strip() for i in m.group(2).split(",") if i.strip()]


if __name__ == "__main__":
    ids = [f[0] for f in FAULTS_V3]
    assert len(ids) == len(set(ids))
    print(len(ids), "cases")
    for f in FAULTS_V3[:2]:
        print(f[0], forum_urls(f[3]))
