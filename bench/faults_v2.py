"""Fault catalogue, second round (v2): about 100 injected-fault and decoy cases on the same six base models.

Same format as faults.py: every entry is (id, base, title, provenance, expected, locate, apply) and `apply(workdir)` edits input
files of a COPY of the base model only. Added here:

expected  crash   : the engine should stop
          silent  : the engine should finish but the results are wrong (a probe tells whether they changed)
          unknown : no expectation, the run itself decides
          ok      : a DECOY. A benign edit (whitespace, case, comments, line endings, order). The engine must finish
                    with identical results, so any ERROR the tool raises on a decoy is a false alarm.
provenance  corpus : a failure class seen repeatedly in the community forum threads (swat-issue-atlas coded threads)
            source : a rule or crash read in the model source / documentation
            doc    : a documented input requirement (file format or cross-reference described in the user manual)
            probe  : a plausible user mistake with no documented outcome; included to see what really happens
            decoy  : benign edit, must not break anything
`family` (see FAMILY) is derived from the base. Ids start with SP (SWAT+), SW (SWAT2012), SM (SWAT-MODFLOW), MF (MODFLOW 6),
AP (APEX), AM (APEX-MODFLOW); decoys carry a D in the id (SPD01 ...).
"""
import io, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from faults import _read, _write, replace_token   # helpers of the first round (read only)


# ------------------------------------------------------------------ helpers
def _split(s):
    nl = "\r\n" if "\r\n" in s else "\n"
    return s.split(nl), nl


def ledit(wd, name, fn):
    """fn(lines) -> lines (without line terminators). The file keeps its own line-ending style. Raises if nothing changed."""
    p = os.path.join(wd, name)
    s = _read(p)
    lines, nl = _split(s)
    out = fn(list(lines))
    t = nl.join(out)
    if t == s:
        raise RuntimeError("edit of %s changed nothing" % name)
    _write(p, t)


def delete(wd, name):
    os.remove(os.path.join(wd, name))


def truncate(wd, name):
    _write(os.path.join(wd, name), "")


def keep_lines(wd, name, n):
    ledit(wd, name, lambda L: L[:n])


def drop_line(wd, name, pred):
    """Remove the first line for which pred(line) is true."""
    def f(L):
        for i, l in enumerate(L):
            if pred(l):
                del L[i]
                return L
        raise RuntimeError("no line to drop in %s" % name)
    ledit(wd, name, f)


def set_tok(wd, name, line_idx, tok_idx, new):
    def f(L):
        L[line_idx] = replace_token(L[line_idx], tok_idx, new)
        return L
    ledit(wd, name, f)


def sub1(wd, name, pattern, repl, flags=re.M):
    """Regex substitution, first match only; raises when nothing matches."""
    def f(L):
        s = "\n".join(L)
        t, n = re.subn(pattern, repl, s, count=1, flags=flags)
        if n == 0:
            raise RuntimeError("pattern %r not found in %s" % (pattern, name))
        return t.split("\n")
    ledit(wd, name, f)


def pipe_set(wd, name, tag, new):
    """SWAT2012 style 'value | TAG : text' line: replace the value of the line that carries `tag`."""
    def f(L):
        for i, l in enumerate(L):
            if re.search(r"\|\s*%s\b" % re.escape(tag), l):
                m = re.match(r"^(\s*)(\S+)", l)
                L[i] = l[:m.start(2)] + new.rjust(len(m.group(2))) + l[m.end(2):]
                return L
        raise RuntimeError("tag %s not found in %s" % (tag, name))
    ledit(wd, name, f)


def table_col(wd, name, header_line, col, fn, first_data=None, only=None):
    """SWAT+ tables: apply fn(old_token) -> new_token to column `col` (a header name) of data rows (all rows, or those where only(l))."""
    def f(L):
        hi = L[header_line].split().index(col)
        n = 0
        for i in range(first_data if first_data is not None else header_line + 1, len(L)):
            t = L[i].split()
            if len(t) <= hi or (only and not only(L[i])):
                continue
            L[i] = replace_token(L[i], hi, fn(t[hi]))
            n += 1
        if n == 0:
            raise RuntimeError("no row edited in %s" % name)
        return L
    ledit(wd, name, f)


def table_cell(wd, name, header_line, col, row, new):
    def f(L):
        hi = L[header_line].split().index(col)
        L[row] = replace_token(L[row], hi, new)
        return L
    ledit(wd, name, f)


def every_line(wd, name, fn):
    ledit(wd, name, lambda L: [fn(l) for l in L])


# ================================================================== SWAT+ (Pecos, classic aquifers, rev 61)
def sp_hru_soil_unknown(wd):          # one HRU names a soil that soils.sol does not define
    set_tok(wd, "hru-data.hru", 4, 4, "S9999")


def sp_hrucon_wst_unknown(wd):        # hru.con points an HRU to a weather station that does not exist
    set_tok(wd, "hru.con", 4, 8, "s00000n000000w")


def sp_sta_wgn_unknown(wd):           # weather-sta.cli names a weather generator that is not in weather-wgn.cli
    set_tok(wd, "weather-sta.cli", 2, 1, "999n9999w")


def sp_objcnt_hru_short(wd):          # object.cnt declares fewer HRUs than hru-data.hru / hru.con list
    table_cell(wd, "object.cnt", 1, "hru", 2, "29000")


def sp_hyd_esco_percent(wd):          # esco typed as a percentage instead of a 0-1 fraction in every row
    table_col(wd, "hydrology.hyd", 1, "esco", lambda v: "95.00000")


def sp_soil_depth_not_increasing(wd): # layer 2 of the first soil ends above layer 1
    set_tok(wd, "soils.sol", 4, 0, "20.00000")


def sp_time_day_start_400(wd):        # time.sim start day 400
    set_tok(wd, "time.sim", 2, 0, "400")


def sp_codes_pet_file_null(wd):       # codes.bsn asks for PET read from a file (3) but pet_file is null
    table_cell(wd, "codes.bsn", 1, "pet", 2, "3")


def sp_pcp_missing_2021(wd):          # the busiest precipitation station loses all of 2021 (coded -99 = missing)
    def f(L):
        n = 0
        for i, l in enumerate(L):
            t = l.split()
            if len(t) == 3 and t[0] == "2021" and t[2] != "-99.000":
                L[i] = replace_token(l, 2, "-99.000")
                n += 1
        if not n:
            raise RuntimeError("no 2021 rows")
        return L
    ledit(wd, "GHCND_US1NMCH0011.pcp", f)


def sp_pcp_nan(wd):                   # a literal NaN in a precipitation record
    def f(L):
        for i, l in enumerate(L):
            t = l.split()
            if len(t) == 3 and t[0] == "2020" and t[1] == "100":
                L[i] = replace_token(l, 2, "NaN")
                return L
        raise RuntimeError("row not found")
    ledit(wd, "GHCND_US1NMCH0011.pcp", f)


def sp_aqu_nan(wd):                   # NaN in a numeric column (revap) of every aquifer row
    table_col(wd, "aquifer.aqu", 1, "revap", lambda v: "NaN")


def sp_plants_row_deleted(wd):        # plants.plt loses the 'agrl' crop that plant.ini and the rotations use
    drop_line(wd, "plants.plt", lambda l: l.split()[:1] == ["agrl"])


def sp_rtu_def_bad_range(wd):         # rout_unit.def element range runs far past the last HRU
    def f(L):
        t = L[2].split()
        L[2] = replace_token(L[2], len(t) - 1, "-99999")
        return L
    ledit(wd, "rout_unit.def", f)


def sp_pcp_cli_entry_removed(wd):     # a station file used by weather-sta.cli is no longer listed in pcp.cli
    drop_line(wd, "pcp.cli", lambda l: l.strip() == "GHCND_US1NMCH0011.pcp")


def sp_wgn_slr_units(wd):             # slr_ave given in W/m2 instead of MJ/m2/day (x 11.574) in every weather-generator row
    def f(L):
        n = 0
        for i, l in enumerate(L):
            t = l.split()
            if len(t) == 14:
                try:
                    v = [float(x) for x in t]
                except ValueError:
                    continue
                L[i] = replace_token(l, 11, "%.5f" % (v[11] * 11.574))
                n += 1
        if not n:
            raise RuntimeError("no rows")
        return L
    ledit(wd, "weather-wgn.cli", f)


def sp_time_before_climate(wd):       # simulation period starts 40 years before the first climate record
    def f(L):
        L[2] = replace_token(replace_token(L[2], 1, "1980"), 3, "1981")
        return L
    ledit(wd, "time.sim", f)


# decoys ---------------------------------------------------------------------------------------------
def spd_header_text(wd):              # the free-text first line of four files rewritten
    for n in ("codes.bsn", "time.sim", "print.prt", "object.cnt"):
        ledit(wd, n, lambda L, n=n: ["%s: edited by hand, model unchanged" % n] + L[1:])


def spd_trailing_spaces(wd):
    for n in ("file.cio", "time.sim", "codes.bsn", "print.prt"):
        every_line(wd, n, lambda l: l + "   " if l else l)


def spd_case_station_files(wd):       # file names in weather-sta.cli typed in upper case (pcp.cli keeps the lower case)
    def f(L):
        return [re.sub(r"\.(pcp|tmp)\b", lambda m: "." + m.group(1).upper(), l) if i >= 2 else l for i, l in enumerate(L)]
    ledit(wd, "weather-sta.cli", f)


def spd_lf_line_endings(wd):          # CRLF -> LF in five files
    for n in ("file.cio", "time.sim", "codes.bsn", "print.prt", "object.cnt"):
        p = os.path.join(wd, n)
        s = _read(p)
        if "\r\n" not in s:
            raise RuntimeError("no CRLF in " + n)
        _write(p, s.replace("\r\n", "\n"))


# ================================================================== SWAT2012 (Middle Bosque)
def sw_iyr_before_climate(wd):        # IYR 1960 but the climate files start in 1980
    pipe_set(wd, "file.cio", "IYR", "1960")


def sw_idal_400(wd):                  # ending julian day 400
    pipe_set(wd, "file.cio", "IDAL", "400")


def sw_pcp_file_missing(wd):          # the precipitation file named in file.cio does not exist
    def f(L):
        i = L.index("Precipitation Files:")
        L[i + 1] = L[i + 1].replace("pcp1.pcp", "pcp9.pcp")
        return L
    ledit(wd, "file.cio", f)


def sw_bsn_file_missing(wd):          # BSNFILE names basin.bsn, the file is basins.bsn
    sub1(wd, "file.cio", r"^basins\.bsn", "basin.bsn ")


def sw_pcpsim_generated(wd):          # PCPSIM=2 (weather generator) although a measured pcp file is listed
    pipe_set(wd, "file.cio", "PCPSIM", "2")


def sw_nyskip_gt_nbyr(wd):            # NYSKIP larger than NBYR: nothing is ever printed
    pipe_set(wd, "file.cio", "NYSKIP", "8")


def sw_fig_sub_missing(wd):           # fig.fig names a subbasin file that does not exist
    sub1(wd, "fig.fig", r"000010000\.sub", "000010000.sbx")


def sw_sub_hrutot_mismatch(wd):       # HRUTOT 40 but 38 HRUs are listed
    sub1(wd, "000010000.sub", r"\b38(\s*\|\s*HRUTOT)", r"40\1")


def sw_sub_wgn_missing(wd):           # WGNFILE of subbasin 2 names a weather-generator file that does not exist
    sub1(wd, "000020000.sub", r"000020000\.wgn", "000020099.wgn")


def sw_gw_truncated(wd):              # a .gw file cut after 8 lines
    keep_lines(wd, "000010002.gw", 8)


def sw_wgn_row_deleted(wd):           # one monthly row of the weather generator file is gone
    def f(L):
        del L[8]
        return L
    ledit(wd, "000010000.wgn", f)


def sw_tmp_gap_99(wd):                # all of 1981 in the temperature file coded -99 (missing)
    def f(L):
        n = 0
        for i, l in enumerate(L):
            if l.startswith("1981") and len(l) >= 17:
                L[i] = l[:7] + "-99.0-99.0"
                n += 1
        if not n:
            raise RuntimeError("no 1981 rows")
        return L
    ledit(wd, "tmp1.tmp", f)


def sw_pcp_year_removed(wd):          # 365 daily rows of 1982 removed from the precipitation file (a gap in the series)
    def f(L):
        out = [l for l in L if not l.startswith("1982")]
        if len(out) == len(L):
            raise RuntimeError("no 1982 rows")
        return out
    ledit(wd, "pcp1.pcp", f)


def sw_bsn_ipet_7(wd):                # IPET 7 is not a PET method
    pipe_set(wd, "basins.bsn", "IPET", "7")


def sw_epco_percent(wd):              # EPCO typed as a percentage (100) in every .hru file
    n = 0
    for f in sorted(os.listdir(wd)):
        if f.endswith(".hru"):
            sub1(wd, f, r"^(\s*)[-\d.]+(\s*\|\s*EPCO\b)", r"\g<1>100.000\2")
            n += 1
    if not n:
        raise RuntimeError("no .hru files")


def sw_bsn_epco_percent(wd):          # EPCO = 100 in basins.bsn (the basin value overrides the per-HRU values)
    pipe_set(wd, "basins.bsn", "EPCO", "100.000")


def swd_trailing_spaces(wd):
    every_line(wd, "file.cio", lambda l: l + "   " if l else l)


def swd_case_fig(wd):                 # .sub names in fig.fig typed in upper case
    every_line(wd, "fig.fig", lambda l: re.sub(r"\.sub\b", ".SUB", l))


def swd_blank_lines_eof(wd):          # two blank lines appended to basins.bsn and one .sol
    for n in ("basins.bsn", "000010001.sol"):
        p = os.path.join(wd, n)
        s = _read(p)
        nl = "\r\n" if "\r\n" in s else "\n"
        _write(p, s + nl + nl)


def swd_hru_titles(wd):               # the free-text first line of every .hru file rewritten
    n = 0
    for f in sorted(os.listdir(wd)):
        if f.endswith(".hru"):
            ledit(wd, f, lambda L: [" .hru file, title line edited by hand"] + L[1:])
            n += 1
    if not n:
        raise RuntimeError("no .hru files")


# ================================================================== SWAT-MODFLOW (Middle Bosque)
def sm_mfn_riv_removed(wd):           # the RIV package line deleted from modflow.mfn (river package silently not used)
    drop_line(wd, "modflow.mfn", lambda l: l.startswith("RIV"))


def sm_dis_nrow_mismatch(wd):         # NROW 22 while the arrays hold 23 rows
    set_tok(wd, "mf_1000.dis", 7, 1, "22")


def sm_dis_nper_no_data(wd):          # NPER 2 but only one stress period is defined
    set_tok(wd, "mf_1000.dis", 7, 3, "2")


def sm_nwt_maxiter_one(wd):           # NWT may do one outer iteration and must close to 1e-9
    def f(L):
        i = next(i for i, l in enumerate(L) if "HEADTOL" in l)
        L[i] = replace_token(replace_token(L[i], 0, "1E-9"), 2, "1")
        return L
    ledit(wd, "mf_1000.nwt", f)


def sm_upw_npupw_mismatch(wd):        # NPUPW 3 while 4 parameters are defined
    def f(L):
        i = next(i for i, l in enumerate(L) if "IUPWCB" in l)
        L[i] = replace_token(L[i], 2, "3")
        return L
    ledit(wd, "mf_1000.upw", f)


def sm_upw_hk_negative(wd):           # a negative hydraulic conductivity
    sub1(wd, "mf_1000.upw", r"^(hk01 HK\s+)[-\dE.+]+", r"\g<1>-5.000000000000E+000")


def sm_riv_mxactc_small(wd):          # MXACTC 100 but 170 river cells are listed
    set_tok(wd, "mf_1000.riv", 1, 0, "100")


def sm_riv_cell_outside_grid(wd):     # a river cell in row 99 of a 23-row grid
    set_tok(wd, "mf_1000.riv", 3, 1, "99")


def sm_oc_unit_unknown(wd):           # output control saves heads to a unit that modflow.mfn does not define
    sub1(wd, "mf_1000.oc", r"(HEAD\s+SAVE\s+UNIT\s+)5037", r"\g<1>5099")


def sm_obs_file_missing(wd):          # swatmf_link.txt says read modflow.obs; the file is gone
    delete(wd, "modflow.obs")


def sm_link_days_count(wd):           # the link file announces 12 output days and lists 10
    def f(L):
        i = next(i for i, l in enumerate(L) if "specified days" in l)
        L[i + 1] = replace_token(L[i + 1], 0, "12")
        return L
    ledit(wd, "swatmf_link.txt", f)


def sm_dhru2hru_deleted(wd):          # grid2sa style mapping table removed
    delete(wd, "swatmf_dhru2hru.txt")


def sm_link_swatmf_off(wd):           # first switch of the link file set to 0 while modflow.mfn is present
    set_tok(wd, "swatmf_link.txt", 0, 0, "0")


def sm_mfn_nwt_removed(wd):           # no solver package in the name file
    drop_line(wd, "modflow.mfn", lambda l: l.startswith("NWT"))


def smd_blank_and_trailing(wd):
    every_line(wd, "modflow.mfn", lambda l: l + "  " if l else l)
    p = os.path.join(wd, "modflow.mfn")
    s = _read(p)
    nl = "\r\n" if "\r\n" in s else "\n"
    _write(p, s + nl + nl)


def smd_mfn_order_swapped(wd):        # OC and UPW lines exchanged in the name file
    def f(L):
        io_ = next(i for i, l in enumerate(L) if l.startswith("OC\t"))
        iu = next(i for i, l in enumerate(L) if l.startswith("UPW\t"))
        L[io_], L[iu] = L[iu], L[io_]
        return L
    ledit(wd, "modflow.mfn", f)


def sm_pval_hk_negative(wd):          # negative hk01 in the PVAL file (the file that overrides the UPW parameter values)
    sub1(wd, "mf_1000.pval", r"^(hk01\s+)[-\dE.+]+", r"\g<1>-5.0000000E+00")


def smd_comments_edited(wd):          # comment and label text edited in the dis file and the link file
    ledit(wd, "mf_1000.dis", lambda L: ["# MODFLOW grid, comment edited by hand"] + L[1:])
    ledit(wd, "swatmf_link.txt", lambda L: [L[0].replace("SWAT-MODFLOW is activated", "coupling on")] + L[1:])


# ================================================================== MODFLOW 6 (toy GWF+GWT with UZF/UZT)
def mf_tdis_zero_perlen(wd):          # first stress period has length 0
    set_tok(wd, "mf6swatp_spike.tdis", 10, 0, "0.00000000")


def mf_tdis_negative_nstp(wd):        # negative number of time steps
    set_tok(wd, "mf6swatp_spike.tdis", 11, 1, "-4")


def mf_nam_ims_file_unknown(wd):      # mfsim.nam names a solver file that does not exist
    sub1(wd, "mfsim.nam", r"ims6\s+gwf\.ims", "ims6  gwf_solver.ims")


def mf_nam_no_tdis(wd):               # the TDIS6 line is missing from mfsim.nam
    drop_line(wd, "mfsim.nam", lambda l: "TDIS6" in l)


def mf_gwfnam_no_dis(wd):             # gwf.nam without the DIS6 package
    drop_line(wd, "gwf.nam", lambda l: l.strip().startswith("DIS6"))


def mf_gwfnam_pkg_typo(wd):           # CHD6 misspelled as CHDD6
    sub1(wd, "gwf.nam", r"\bCHD6\b", "CHDD6")


def mf_dis_ncol_mismatch(wd):         # gwf grid has 6 columns, gwt grid 5
    sub1(wd, "gwf.dis", r"(NCOL\s+)5", r"\g<1>6")


def mf_dis_botm_above_top(wd):        # cell bottom at 15 above the top at 10
    sub1(wd, "gwf.dis", r"(botm\s*\n\s*CONSTANT\s+)[-\d.]+", r"\g<1>15.00000000", flags=re.M)


def mf_chd_cell_outside(wd):          # a constant-head cell in column 9 of a 5-column grid
    def f(L):
        i = next(i for i, l in enumerate(L) if re.match(r"^\s*1\s+1\s+5\s", l))
        L[i] = replace_token(L[i], 2, "9")
        return L
    ledit(wd, "gwf.chd", f)


def mf_wel_maxbound_zero(wd):         # MAXBOUND 0 but one well is listed
    sub1(wd, "gwf.wel", r"(MAXBOUND\s+)1\b", r"\g<1>0")


def mf_npf_k_negative(wd):            # negative hydraulic conductivity
    sub1(wd, "gwf.npf", r"(k\s*\n\s*CONSTANT\s+)[-\d.]+", r"\g<1>-5.00000000")


def mf_uzf_nuzfcells_short(wd):       # NUZFCELLS 24 but 25 cells are defined
    sub1(wd, "gwf.uzf", r"(NUZFCELLS\s+)25", r"\g<1>24")


def mf_uzt_flow_package_unknown(wd):  # UZT points to a flow package name that does not exist
    sub1(wd, "gwt.uzt", r"(FLOW_PACKAGE_NAME\s+)uzf-1", r"\g<1>uzf-2")


def mf_ims_linear_impossible(wd):     # one linear iteration allowed, closure 1e-30
    p = os.path.join(wd, "gwf.ims")
    s = _read(p)
    nl = "\r\n" if "\r\n" in s else "\n"
    _write(p, s.rstrip("\r\n") + nl + nl + nl.join(["BEGIN linear", "  INNER_MAXIMUM  1", "  INNER_DVCLOSE  1.0E-30", "  INNER_RCLOSE  1.0E-30", "END linear"]) + nl)


def mfd_npf_reordered(wd):            # k before icelltype, blank lines inside the block
    def f(L):
        s = "\n".join(L)
        m = re.search(r"(  icelltype\s*\n\s+CONSTANT\s+1\s*\n)(  k\s*\n\s+CONSTANT\s+[-\d.]+\s*\n)", s)
        if not m:
            raise RuntimeError("npf arrays not found")
        s = s[:m.start()] + "\n" + m.group(2) + "\n" + m.group(1) + s[m.end():]
        return s.split("\n")
    ledit(wd, "gwf.npf", f)


def mfd_keyword_case(wd):             # BEGIN/END and block names in other case
    for n in ("gwf.ic", "gwf.sto"):
        every_line(wd, n, lambda l: re.sub(r"^(\s*)(BEGIN|END)(\s+)(\w+)", lambda m: m.group(1) + m.group(2).lower() + m.group(3) + m.group(4).upper(), l))


def mfd_trailing_spaces(wd):
    for n in ("mfsim.nam", "mf6swatp_spike.tdis"):
        every_line(wd, n, lambda l: l + "   " if l else l)


def mfd_gwfnam_order(wd):             # OC listed before DIS6 in gwf.nam
    def f(L):
        io_ = next(i for i, l in enumerate(L) if l.strip().startswith("OC6"))
        iu = next(i for i, l in enumerate(L) if l.strip().startswith("NPF6"))
        L[io_], L[iu] = L[iu], L[io_]
        return L
    ledit(wd, "gwf.nam", f)


# ================================================================== APEX (DREAM example)
def ap_wpm_id_out_of_range(wd):       # APEXRUN.DAT weather station number 999
    set_tok(wd, "APEXRUN.DAT", 0, 2, "999")


def ap_wind_id_out_of_range(wd):      # APEXRUN.DAT wind station number 999
    set_tok(wd, "APEXRUN.DAT", 0, 3, "999")


def ap_site_index_out_of_range(wd):   # APEXRUN.DAT site number 7 while SITECOM.DAT lists one site
    set_tok(wd, "APEXRUN.DAT", 0, 1, "7")


def ap_wp1_file_unknown(wd):          # WPM1.DAT entry 109 names a file that does not exist
    sub1(wd, "WPM1.DAT", r"\b109\.WP1", "109x.WP1")


def ap_sit_file_unknown(wd):          # SITECOM.DAT names a missing site file
    sub1(wd, "SITECOM.DAT", r"SIT0002\.SIT", "SIT0099.SIT")


def ap_sub_file_unknown(wd):          # SUBACOM.DAT names a missing subarea file
    sub1(wd, "SUBACOM.DAT", r"SUB0002\.SUB", "SUB0099.SUB")


def ap_soil_name_misspelled(wd):      # SOILCOM.DAT lists Heidan.SOL, the file is Heiden.SOL
    sub1(wd, "SOILCOM.DAT", r"Heiden\.SOL", "Heidan.SOL")


def ap_opc_file_unknown(wd):          # OPSCCOM.DAT lists an operation schedule file that does not exist
    sub1(wd, "OPSCCOM.DAT", r"Y10\.OPC", "Y10X.OPC")


def ap_nbyr_exceeds_weather(wd):      # APEXCONT.DAT NBYR 99 against a daily weather record of far fewer years
    set_tok(wd, "APEXCONT.DAT", 0, 0, "99")


def ap_apexcont_short_line(wd):       # APEXCONT.DAT: the last value of line 3 missing (free format may shift every later value)
    def f(L):
        L[2] = re.sub(r"\s+\S+\s*$", "", L[2])
        return L
    ledit(wd, "APEXCONT.DAT", f)


def ap_parms_truncated(wd):           # PARMS.DAT cut after 20 lines
    keep_lines(wd, "PARMS.DAT", 20)


def ap_apexfile_soil_unknown(wd):     # APEXFILE.DAT names SOILCOM2.DAT
    sub1(wd, "APEXFILE.DAT", r"SOILCOM\.DAT", "SOILCOM2.DAT")


def ap_daily_year_removed(wd):        # all daily weather rows of 1999 removed (a gap inside the simulation period)
    def f(L):
        out = [l for l in L if not l.lstrip().startswith("1999")]
        if len(out) == len(L):
            raise RuntimeError("no 1999 rows")
        return out
    ledit(wd, "A48309.dly", f)


def ap_daily_rain_99(wd):             # daily rain of 1998 coded -99
    def f(L):
        n = 0
        for i, l in enumerate(L):
            t = l.split()
            if len(t) >= 6 and t[0] == "1998":
                L[i] = replace_token(l, 5, "-99.00")
                n += 1
        if not n:
            raise RuntimeError("no 1998 rows")
        return L
    ledit(wd, "A48309.dly", f)


def apd_trailing_spaces(wd):
    for n in ("APEXFILE.DAT", "APEXRUN.DAT"):
        every_line(wd, n, lambda l: l + "   " if l else l)


def apd_soil_name_case(wd):           # SOILCOM.DAT names in upper case
    every_line(wd, "SOILCOM.DAT", lambda l: l.upper().replace("\t", "\t") if l.strip() else l)


def apd_blank_lines_eof(wd):
    p = os.path.join(wd, "SOILCOM.DAT")
    s = _read(p)
    nl = "\r\n" if "\r\n" in s else "\n"
    _write(p, s + nl + nl)


def apd_lf_endings(wd):
    p = os.path.join(wd, "APEXCONT.DAT")
    s = _read(p)
    if "\r\n" not in s:
        raise RuntimeError("no CRLF")
    _write(p, s.replace("\r\n", "\n"))


# ================================================================== APEX-MODFLOW (Animas example)
def am_obs_file_missing(wd):
    delete(wd, os.path.join("MODFLOW", "modflow.obs"))


def am_grid2sa_deleted(wd):
    delete(wd, os.path.join("MODFLOW", "apexmf_grid2sa.txt"))


def am_sa2grid_count(wd):             # first record of apexmf_sa2grid.txt: 9956 cells -> 9000
    set_tok(wd, os.path.join("MODFLOW", "apexmf_sa2grid.txt"), 0, 0, "9000")


def am_river2grid_count(wd):          # river cell count 505 while 504 are listed
    set_tok(wd, os.path.join("MODFLOW", "apexmf_river2grid.txt"), 0, 0, "505")


def am_dis_perlen_short(wd):          # MODFLOW time (sum PERLEN) 100 days, shorter than the APEX period
    def f(L):
        i = next(i for i, l in enumerate(L) if "PERLEN" in l and "Stress period 1" in l)
        L[i] = replace_token(replace_token(L[i], 0, "1.000000000000E+002"), 1, "100")
        return L
    ledit(wd, os.path.join("MODFLOW", "mf_1000.dis"), f)


def am_nwt_maxiter_one(wd):
    def f(L):
        i = next(i for i, l in enumerate(L) if "HEADTOL" in l)
        L[i] = replace_token(replace_token(L[i], 0, "1E-9"), 2, "1")
        return L
    ledit(wd, os.path.join("MODFLOW", "mf_1000.nwt"), f)


def am_mfn_riv_removed(wd):
    drop_line(wd, os.path.join("MODFLOW", "modflow.mfn"), lambda l: l.startswith("RIV"))


def am_mfn_duplicate_unit(wd):        # RCH given the same unit number as RIV
    def f(L):
        i = next(i for i, l in enumerate(L) if l.startswith("RCH"))
        L[i] = replace_token(L[i], 1, "5021")
        return L
    ledit(wd, os.path.join("MODFLOW", "modflow.mfn"), f)


def am_upw_hk_negative(wd):
    def f(L):
        for i, l in enumerate(L):
            t = l.split()
            if len(t) >= 4 and t[1] == "HK" and not l.startswith("#"):
                L[i] = replace_token(l, 2, "-5.000000000000E+000")
                return L
        raise RuntimeError("no HK parameter")
    ledit(wd, os.path.join("MODFLOW", "mf_1000.upw"), f)


def am_pval_hk_negative(wd):          # negative hk01 in the PVAL file (the file that overrides the UPW parameter values)
    sub1(wd, os.path.join("MODFLOW", "mf_1000.pval"), r"^(\s*hk01\s+)[-\dE.+]+", r"\g<1>-5.0000000E+00")


def am_sub_truncated(wd):             # the subarea file cut after 6 lines
    keep_lines(wd, "SUB0075.SUB", 6)


def am_daily_weather_deleted(wd):     # a daily weather file named in WDLSTCOM.DAT is deleted
    delete(wd, "sub10.DLY")


def am_link_sa_grid_deleted(wd):      # link_sa_grid, the table the engine builds apexmf_sa2grid.txt from
    delete(wd, os.path.join("MODFLOW", "link_sa_grid"))


def am_link_river_grid_count(wd):     # link_river_grid announces 700 river cells, fewer are listed
    set_tok(wd, os.path.join("MODFLOW", "link_river_grid"), 0, 0, "700")


def am_link_sa_grid_count(wd):        # link_sa_grid announces 12000 overlap records, 9956 are listed
    set_tok(wd, os.path.join("MODFLOW", "link_sa_grid"), 1, 0, "12000")


def amd_mfn_blank_trailing(wd):
    p = os.path.join(wd, "MODFLOW", "modflow.mfn")
    every_line(wd, os.path.join("MODFLOW", "modflow.mfn"), lambda l: l + "  " if l else l)
    s = _read(p)
    nl = "\r\n" if "\r\n" in s else "\n"
    _write(p, s + nl + nl)


def amd_link_labels(wd):              # label text after the numbers edited in apexmf_link.txt
    ledit(wd, os.path.join("MODFLOW", "apexmf_link.txt"),
          lambda L: [l.replace("flag for running RT3D for groundwater reactive transport", "RT3D flag") for l in L])


# ------------------------------------------------------------------------------------------------ catalogue
FAULTS_V2 = [
    # ---- SWAT+ ----
    ("SP01_hru_soil_unknown", "swatplus_p29", "hru-data.hru names a soil (S9999) that soils.sol does not define", "corpus (cross-reference between SWAT+ tables)", "crash", ["hru-data.hru", "soils.sol", "S9999"], sp_hru_soil_unknown),
    ("SP02_hrucon_wst_unknown", "swatplus_p29", "hru.con points an HRU to a weather station that is not in weather-sta.cli", "corpus (cross-reference between SWAT+ tables)", "unknown", ["hru.con", "weather-sta.cli", "s00000n000000w"], sp_hrucon_wst_unknown),
    ("SP03_sta_wgn_unknown", "swatplus_p29", "weather-sta.cli names a weather generator (999n9999w) missing from weather-wgn.cli", "corpus (QSWAT+ weather import errors)", "unknown", ["weather-sta.cli", "weather-wgn.cli", "999n9999w"], sp_sta_wgn_unknown),
    ("SP04_objcnt_hru_short", "swatplus_p29", "object.cnt declares 29000 HRUs, hru-data.hru and hru.con hold 29644", "doc (object.cnt sizes the arrays)", "unknown", ["object.cnt", "hru"], sp_objcnt_hru_short),
    ("SP05_hyd_esco_percent", "swatplus_p29", "esco typed as 95 (percent) instead of 0.95 in every row of hydrology.hyd", "corpus (unit/percent confusion)", "silent", ["hydrology.hyd", "esco"], sp_hyd_esco_percent),
    ("SP06_soil_depth_not_increasing", "swatplus_p29", "soils.sol: layer 2 of the first soil ends above layer 1", "doc (layer depths are cumulative)", "unknown", ["soils.sol", "dp", "depth"], sp_soil_depth_not_increasing),
    ("SP07_time_day_start_400", "swatplus_p29", "time.sim day_start = 400", "corpus (bad dates)", "unknown", ["time.sim", "day_start"], sp_time_day_start_400),
    ("SP08_codes_pet_file_null", "swatplus_p29", "codes.bsn pet = 3 (read from file) while pet_file is null", "corpus (codes.bsn switch combinations)", "unknown", ["codes.bsn", "pet", "pet_file"], sp_codes_pet_file_null),
    ("SP09_pcp_missing_2021", "swatplus_p29", "busiest precipitation station (1125 HRUs) loses all of 2021 (-99 = missing)", "corpus (missing data coded -99)", "silent", ["GHCND_US1NMCH0011", "-99", "pcp"], sp_pcp_missing_2021),
    ("SP10_pcp_nan", "swatplus_p29", "a literal NaN in the precipitation record of the busiest station", "corpus (NaN / null values in numeric tables)", "unknown", ["GHCND_US1NMCH0011", "NaN"], sp_pcp_nan),
    ("SP11_aqu_nan", "swatplus_p29", "NaN in the revap column of every row of aquifer.aqu", "corpus (NaN / null values in numeric tables)", "unknown", ["aquifer.aqu", "NaN", "revap"], sp_aqu_nan),
    ("SP12_plants_row_deleted", "swatplus_p29", "plants.plt loses the 'agrl' crop used by plant.ini and landuse", "corpus (cross-reference: database row missing)", "unknown", ["plants.plt", "agrl", "plant.ini"], sp_plants_row_deleted),
    ("SP13_rtu_def_bad_range", "swatplus_p29", "rout_unit.def element range of the first unit ends at -99999", "probe", "unknown", ["rout_unit.def", "elements"], sp_rtu_def_bad_range),
    ("SP14_pcp_cli_entry_removed", "swatplus_p29", "the busiest station file is no longer listed in pcp.cli but weather-sta.cli uses it", "own-log analog (bug #4 family: station lists must match)", "unknown", ["pcp.cli", "weather-sta.cli", "GHCND_US1NMCH0011"], sp_pcp_cli_entry_removed),
    ("SP15_wgn_slr_units", "swatplus_p29", "slr_ave in W/m2 (x11.574) instead of MJ/m2/day in all weather-generator rows", "corpus (units)", "silent", ["weather-wgn.cli", "slr_ave"], sp_wgn_slr_units),
    ("SP16_time_before_climate", "swatplus_p29", "simulation 1980-1981, climate records start in 2000", "corpus (simulation period outside the climate record)", "unknown", ["time.sim", "climate", "pcp"], sp_time_before_climate),
    ("SPD01_header_text", "swatplus_p29", "free-text first line rewritten in codes.bsn, time.sim, print.prt, object.cnt", "decoy", "ok", [], spd_header_text),
    ("SPD02_trailing_spaces", "swatplus_p29", "trailing spaces on every line of file.cio, time.sim, codes.bsn, print.prt", "decoy", "ok", [], spd_trailing_spaces),
    ("SPD03_case_station_files", "swatplus_p29", "weather-sta.cli station file names in upper case (.PCP/.TMP), pcp.cli unchanged", "decoy", "ok", [], spd_case_station_files),
    ("SPD04_lf_line_endings", "swatplus_p29", "CRLF changed to LF in file.cio, time.sim, codes.bsn, print.prt, object.cnt", "decoy", "ok", [], spd_lf_line_endings),
    # ---- SWAT2012 ----
    ("SW01_iyr_before_climate", "swat2012", "IYR = 1960 while the climate files start in 1980", "corpus (simulation period outside the climate record)", "crash", ["file.cio", "IYR", "climate"], sw_iyr_before_climate),
    ("SW02_idal_400", "swat2012", "IDAL = 400 (ending julian day)", "corpus (bad dates)", "unknown", ["file.cio", "IDAL"], sw_idal_400),
    ("SW03_pcp_file_missing", "swat2012", "file.cio names pcp9.pcp, the file is pcp1.pcp", "corpus (pcp1.pcp errors in pmeas.f)", "crash", ["file.cio", "pcp9.pcp", "pcp"], sw_pcp_file_missing),
    ("SW04_bsn_file_missing", "swat2012", "file.cio BSNFILE names basin.bsn, the file is basins.bsn", "corpus (file not found)", "crash", ["file.cio", "basin.bsn", "BSNFILE"], sw_bsn_file_missing),
    ("SW05_pcpsim_generated", "swat2012", "PCPSIM = 2 (generated) while a measured pcp file is listed", "corpus (climate switches)", "silent", ["file.cio", "PCPSIM"], sw_pcpsim_generated),
    ("SW06_nyskip_gt_nbyr", "swat2012", "NYSKIP 8 larger than NBYR 6: nothing is printed", "corpus (empty output)", "silent", ["file.cio", "NYSKIP", "NBYR"], sw_nyskip_gt_nbyr),
    ("SW07_fig_sub_missing", "swat2012", "fig.fig names a subbasin file that does not exist", "corpus (fig.fig routing errors)", "crash", ["fig.fig", "000010000.sub"], sw_fig_sub_missing),
    ("SW08_sub_hrutot_mismatch", "swat2012", ".sub says 40 HRUs, 38 are listed", "corpus (HRU count mismatch)", "crash", ["000010000.sub", "HRUTOT"], sw_sub_hrutot_mismatch),
    ("SW09_sub_wgn_missing", "swat2012", ".sub names a .wgn file that does not exist", "corpus (file not found)", "crash", ["000020000.sub", "000020099.wgn", "wgn"], sw_sub_wgn_missing),
    ("SW10_gw_truncated", "swat2012", "a .gw file cut after 8 lines", "corpus (end of file during read)", "crash", ["000010002.gw", ".gw"], sw_gw_truncated),
    ("SW11_wgn_row_deleted", "swat2012", "one monthly row removed from a .wgn file", "corpus (misaligned weather-generator file)", "unknown", ["000010000.wgn", "wgn"], sw_wgn_row_deleted),
    ("SW12_tmp_gap_99", "swat2012", "all of 1981 in tmp1.tmp coded -99 (missing)", "corpus (-99 missing data is not ignored)", "silent", ["tmp1.tmp", "-99"], sw_tmp_gap_99),
    ("SW13_pcp_year_removed", "swat2012", "the 365 daily rows of 1982 removed from pcp1.pcp (a gap, later years shift)", "corpus (climate gaps, pmeas.f read errors)", "unknown", ["pcp1.pcp", "gap", "1982"], sw_pcp_year_removed),
    ("SW14_bsn_ipet_7", "swat2012", "IPET = 7 in basins.bsn (not a PET method)", "corpus (invalid switch)", "unknown", ["basins.bsn", "IPET"], sw_bsn_ipet_7),
    ("SW15_epco_percent", "swat2012", "EPCO = 100 (percent) in every .hru file", "corpus (units / percent confusion)", "silent", [".hru", "EPCO"], sw_epco_percent),
    ("SW16_bsn_epco_percent", "swat2012", "EPCO = 100 (percent) in basins.bsn", "corpus (units / percent confusion)", "silent", ["basins.bsn", "EPCO"], sw_bsn_epco_percent),
    ("SWD01_trailing_spaces", "swat2012", "trailing spaces on every line of file.cio", "decoy", "ok", [], swd_trailing_spaces),
    ("SWD02_case_fig", "swat2012", ".sub names in fig.fig in upper case", "decoy", "ok", [], swd_case_fig),
    ("SWD03_blank_lines_eof", "swat2012", "two blank lines appended to basins.bsn and one .sol", "decoy", "ok", [], swd_blank_lines_eof),
    ("SWD04_hru_titles", "swat2012", "free-text first line of every .hru file rewritten", "decoy", "ok", [], swd_hru_titles),
    # ---- SWAT-MODFLOW ----
    ("SM01_mfn_riv_removed", "swatmf", "the RIV line deleted from modflow.mfn (river package silently dropped)", "corpus (package list in the name file)", "unknown", ["modflow.mfn", "RIV", "river"], sm_mfn_riv_removed),
    ("SM02_dis_nrow_mismatch", "swatmf", "mf_1000.dis NROW 22 while the arrays hold 23 rows", "corpus (grid dimensions inconsistent)", "crash", ["mf_1000.dis", "NROW"], sm_dis_nrow_mismatch),
    ("SM03_dis_nper_no_data", "swatmf", "NPER 2 but one stress period is defined", "corpus (stress period errors)", "crash", ["mf_1000.dis", "NPER", "period"], sm_dis_nper_no_data),
    ("SM04_nwt_maxiter_one", "swatmf", "NWT MAXITEROUT 1 with HEADTOL 1e-9", "corpus (failed to meet solver convergence)", "unknown", ["mf_1000.nwt", "converge", "MAXITEROUT"], sm_nwt_maxiter_one),
    ("SM05_upw_npupw_mismatch", "swatmf", "UPW NPUPW 3 while 4 parameters are defined", "corpus (parameter count mismatch)", "crash", ["mf_1000.upw", "NPUPW"], sm_upw_npupw_mismatch),
    ("SM06_upw_hk_negative", "swatmf", "negative hydraulic conductivity in the UPW package (hk01 = -5)", "corpus (unphysical parameter)", "unknown", ["mf_1000.upw", "hk01", "negative"], sm_upw_hk_negative),
    ("SM07_riv_mxactc_small", "swatmf", "RIV MXACTC 100 while 170 river cells are listed", "corpus (end-of-file / list lengths in stress packages)", "crash", ["mf_1000.riv", "MXACTC"], sm_riv_mxactc_small),
    ("SM08_riv_cell_outside_grid", "swatmf", "a river cell in row 99 of a 23-row grid", "corpus (cell outside the grid)", "crash", ["mf_1000.riv", "row", "grid"], sm_riv_cell_outside_grid),
    ("SM09_oc_unit_unknown", "swatmf", "output control saves heads to unit 5099, undefined in modflow.mfn", "corpus (unit numbers)", "unknown", ["mf_1000.oc", "5099", "unit"], sm_oc_unit_unknown),
    ("SM10_obs_file_missing", "swatmf", "swatmf_link.txt says read modflow.obs, the file is deleted", "corpus (modflow linking file errors)", "crash", ["modflow.obs", "swatmf_link"], sm_obs_file_missing),
    ("SM11_link_days_count", "swatmf", "swatmf_link.txt announces 12 output days and lists 10", "corpus (modflow linking file errors)", "unknown", ["swatmf_link.txt", "days"], sm_link_days_count),
    ("SM12_dhru2hru_deleted", "swatmf", "swatmf_dhru2hru.txt (SWAT-MODFLOW mapping table) deleted", "corpus (missing mapping tables)", "crash", ["swatmf_dhru2hru"], sm_dhru2hru_deleted),
    ("SM13_link_swatmf_off", "swatmf", "swatmf_link.txt first switch 0 (coupling off) while modflow.mfn is present", "probe", "unknown", ["swatmf_link.txt", "activated"], sm_link_swatmf_off),
    ("SM14_mfn_nwt_removed", "swatmf", "no NWT solver line in modflow.mfn", "corpus (package list in the name file)", "crash", ["modflow.mfn", "NWT", "solver"], sm_mfn_nwt_removed),
    ("SM15_pval_hk_negative", "swatmf", "negative hk01 in mf_1000.pval (the file that overrides the UPW parameter values)", "corpus (unphysical parameter)", "unknown", ["mf_1000.pval", "hk01", "negative"], sm_pval_hk_negative),
    ("SMD01_blank_and_trailing", "swatmf", "trailing spaces and two blank lines at the end of modflow.mfn", "decoy", "ok", [], smd_blank_and_trailing),
    ("SMD02_mfn_order_swapped", "swatmf", "OC and UPW lines exchanged in modflow.mfn", "decoy", "ok", [], smd_mfn_order_swapped),
    ("SMD03_comments_edited", "swatmf", "comment line of mf_1000.dis and a label of swatmf_link.txt edited", "decoy", "ok", [], smd_comments_edited),
    # ---- MODFLOW 6 ----
    ("MF01_tdis_zero_perlen", "mf6", "first stress period has length 0", "doc (PERLEN must be > 0 in a transient simulation)", "unknown", ["tdis", "perlen"], mf_tdis_zero_perlen),
    ("MF02_tdis_negative_nstp", "mf6", "negative number of time steps in a stress period", "doc", "crash", ["tdis", "nstp"], mf_tdis_negative_nstp),
    ("MF03_nam_ims_file_unknown", "mf6", "mfsim.nam names gwf_solver.ims, the file is gwf.ims", "corpus (mfsim.nam file not found)", "crash", ["mfsim.nam", "gwf_solver.ims", "ims"], mf_nam_ims_file_unknown),
    ("MF04_nam_no_tdis", "mf6", "mfsim.nam has no TDIS6 line", "corpus (mfsim.nam errors)", "crash", ["mfsim.nam", "tdis"], mf_nam_no_tdis),
    ("MF05_gwfnam_no_dis", "mf6", "gwf.nam without the DIS6 package", "doc (a model needs a discretization)", "crash", ["gwf.nam", "dis"], mf_gwfnam_no_dis),
    ("MF06_gwfnam_pkg_typo", "mf6", "CHD6 misspelled CHDD6 in gwf.nam", "probe", "crash", ["gwf.nam", "CHDD6", "chd"], mf_gwfnam_pkg_typo),
    ("MF07_dis_ncol_mismatch", "mf6", "gwf.dis has 6 columns, gwt.dis (same grid via the exchange) 5", "doc (GWF-GWT exchange needs the same grid)", "crash", ["gwf.dis", "gwt.dis", "ncol"], mf_dis_ncol_mismatch),
    ("MF08_dis_botm_above_top", "mf6", "cell bottom elevation 15 above the top 10", "corpus (cell thickness errors)", "crash", ["gwf.dis", "botm", "top"], mf_dis_botm_above_top),
    ("MF09_chd_cell_outside", "mf6", "a constant-head cell in column 9 of a 5-column grid", "corpus (bad cell ids)", "crash", ["gwf.chd", "column", "cell"], mf_chd_cell_outside),
    ("MF10_wel_maxbound_zero", "mf6", "MAXBOUND 0 but one well is listed", "corpus (list length vs MAXBOUND)", "crash", ["gwf.wel", "MAXBOUND"], mf_wel_maxbound_zero),
    ("MF11_npf_k_negative", "mf6", "negative hydraulic conductivity (k = -5)", "corpus (unphysical parameter)", "unknown", ["gwf.npf", "k"], mf_npf_k_negative),
    ("MF12_uzf_nuzfcells_short", "mf6", "NUZFCELLS 24 but 25 cells are defined", "doc", "crash", ["gwf.uzf", "NUZFCELLS"], mf_uzf_nuzfcells_short),
    ("MF13_uzt_flow_package_unknown", "mf6", "UZT FLOW_PACKAGE_NAME uzf-2 does not exist", "doc (transport packages name their flow package)", "crash", ["gwt.uzt", "uzf-2", "FLOW_PACKAGE_NAME"], mf_uzt_flow_package_unknown),
    ("MF14_ims_linear_impossible", "mf6", "one linear iteration allowed with closure 1e-30", "corpus (solver convergence failures)", "unknown", ["gwf.ims", "converge", "INNER"], mf_ims_linear_impossible),
    ("MFD01_npf_reordered", "mf6", "k array before icelltype in gwf.npf, blank lines inside the block", "decoy", "ok", [], mfd_npf_reordered),
    ("MFD02_keyword_case", "mf6", "begin/end in lower case, block names in upper case in gwf.ic and gwf.sto", "decoy", "ok", [], mfd_keyword_case),
    ("MFD03_trailing_spaces", "mf6", "trailing spaces on every line of mfsim.nam and the tdis file", "decoy", "ok", [], mfd_trailing_spaces),
    ("MFD04_gwfnam_order", "mf6", "OC6 and NPF6 lines exchanged in gwf.nam", "decoy", "ok", [], mfd_gwfnam_order),
    # ---- APEX ----
    ("AP01_wpm_id_out_of_range", "apex", "APEXRUN.DAT weather station number 999 (WPM1.DAT has about 150)", "probe", "crash", ["APEXRUN.DAT", "WPM1.DAT", "999"], ap_wpm_id_out_of_range),
    ("AP02_wind_id_out_of_range", "apex", "APEXRUN.DAT wind station number 999", "probe", "crash", ["APEXRUN.DAT", "WIND.DAT", "999"], ap_wind_id_out_of_range),
    ("AP03_site_index_out_of_range", "apex", "APEXRUN.DAT site number 7 while SITECOM.DAT lists one site", "probe", "crash", ["APEXRUN.DAT", "SITECOM.DAT", "site"], ap_site_index_out_of_range),
    ("AP04_wp1_file_unknown", "apex", "WPM1.DAT entry 109 names 109x.WP1, which does not exist", "probe (file not found)", "crash", ["WPM1.DAT", "109x.WP1"], ap_wp1_file_unknown),
    ("AP05_sit_file_unknown", "apex", "SITECOM.DAT names SIT0099.SIT, which does not exist", "probe (file not found)", "crash", ["SITECOM.DAT", "SIT0099.SIT"], ap_sit_file_unknown),
    ("AP06_sub_file_unknown", "apex", "SUBACOM.DAT names SUB0099.SUB, which does not exist", "probe (file not found)", "crash", ["SUBACOM.DAT", "SUB0099.SUB"], ap_sub_file_unknown),
    ("AP07_soil_name_misspelled", "apex", "SOILCOM.DAT lists Heidan.SOL, the file is Heiden.SOL", "probe (file not found)", "crash", ["SOILCOM.DAT", "Heidan.SOL", "Heiden.SOL"], ap_soil_name_misspelled),
    ("AP08_opc_file_unknown", "apex", "OPSCCOM.DAT lists Y10X.OPC, which does not exist", "probe (file not found)", "crash", ["OPSCCOM.DAT", "Y10X.OPC"], ap_opc_file_unknown),
    ("AP09_nbyr_exceeds_weather", "apex", "APEXCONT.DAT NBYR 99 against the daily weather record", "corpus (simulation period longer than the climate record)", "crash", ["APEXCONT.DAT", "NBYR", "weather"], ap_nbyr_exceeds_weather),
    ("AP10_apexcont_short_line", "apex", "APEXCONT.DAT line 3 loses its last value (free format may shift every later value)", "probe", "unknown", ["APEXCONT.DAT"], ap_apexcont_short_line),
    ("AP11_parms_truncated", "apex", "PARMS.DAT cut after 20 lines", "probe (end of file during read)", "crash", ["PARMS.DAT"], ap_parms_truncated),
    ("AP12_apexfile_soil_unknown", "apex", "APEXFILE.DAT names SOILCOM2.DAT, which does not exist", "probe (file not found)", "crash", ["APEXFILE.DAT", "SOILCOM2.DAT"], ap_apexfile_soil_unknown),
    ("AP13_daily_year_removed", "apex", "the daily weather rows of 1999 removed (a gap inside the simulation period)", "corpus (climate gaps)", "unknown", ["A48309.dly", "gap", "1999"], ap_daily_year_removed),
    ("AP14_daily_rain_99", "apex", "daily rain of 1998 coded -99", "corpus (missing data coded -99)", "silent", ["A48309.dly", "-99"], ap_daily_rain_99),
    ("APD01_trailing_spaces", "apex", "trailing spaces on every line of APEXFILE.DAT and APEXRUN.DAT", "decoy", "ok", [], apd_trailing_spaces),
    ("APD02_soil_name_case", "apex", "SOILCOM.DAT in upper case", "decoy", "ok", [], apd_soil_name_case),
    ("APD03_blank_lines_eof", "apex", "two blank lines appended to SOILCOM.DAT", "decoy", "ok", [], apd_blank_lines_eof),
    ("APD04_lf_endings", "apex", "CRLF changed to LF in APEXCONT.DAT", "decoy", "ok", [], apd_lf_endings),
    # ---- APEX-MODFLOW ----
    ("AM01_obs_file_missing", "apexmf", "apexmf_link.txt says read modflow.obs, the file is deleted", "corpus (modflow linking file errors)", "crash", ["modflow.obs", "apexmf_link"], am_obs_file_missing),
    ("AM02_grid2sa_deleted", "apexmf", "apexmf_grid2sa.txt (grid to subarea table) deleted", "corpus (missing mapping tables)", "crash", ["apexmf_grid2sa"], am_grid2sa_deleted),
    ("AM03_sa2grid_count", "apexmf", "apexmf_sa2grid.txt first record 9000 instead of 9956", "corpus (mapping table size mismatch)", "unknown", ["apexmf_sa2grid"], am_sa2grid_count),
    ("AM04_river2grid_count", "apexmf", "apexmf_river2grid.txt announces 505 river cells and lists 504", "corpus (mapping table size mismatch)", "crash", ["apexmf_river2grid"], am_river2grid_count),
    ("AM05_dis_perlen_short", "apexmf", "MODFLOW time (sum PERLEN) 100 days, shorter than the APEX period", "source (PERLEN is consumed one day at a time), analog of SWAT-MODFLOW M02", "crash", ["mf_1000.dis", "PERLEN", "period"], am_dis_perlen_short),
    ("AM06_nwt_maxiter_one", "apexmf", "NWT MAXITEROUT 1 with HEADTOL 1e-9", "corpus (failed to meet solver convergence)", "unknown", ["mf_1000.nwt", "converge", "MAXITEROUT"], am_nwt_maxiter_one),
    ("AM07_mfn_riv_removed", "apexmf", "the RIV line deleted from MODFLOW/modflow.mfn", "corpus (package list in the name file)", "unknown", ["modflow.mfn", "RIV", "river"], am_mfn_riv_removed),
    ("AM08_mfn_duplicate_unit", "apexmf", "RCH given the unit number of RIV in modflow.mfn", "corpus (unit numbers)", "crash", ["modflow.mfn", "unit", "5021"], am_mfn_duplicate_unit),
    ("AM09_upw_hk_negative", "apexmf", "negative hydraulic conductivity in the UPW package", "corpus (unphysical parameter)", "unknown", ["mf_1000.upw", "HK", "negative"], am_upw_hk_negative),
    ("AM10_sub_truncated", "apexmf", "SUB0075.SUB cut after 6 lines", "probe (end of file during read)", "crash", ["SUB0075.SUB"], am_sub_truncated),
    ("AM11_daily_weather_deleted", "apexmf", "sub10.DLY (daily weather named in WDLSTCOM.DAT) deleted", "corpus (missing climate file)", "crash", ["sub10.DLY", "WDLSTCOM.DAT"], am_daily_weather_deleted),
    ("AM12_link_sa_grid_deleted", "apexmf", "MODFLOW/link_sa_grid (source of the subarea-grid mapping) deleted", "corpus (missing mapping tables)", "crash", ["link_sa_grid"], am_link_sa_grid_deleted),
    ("AM13_link_river_grid_count", "apexmf", "link_river_grid announces 700 river cells, fewer are listed", "corpus (mapping table size mismatch)", "crash", ["link_river_grid"], am_link_river_grid_count),
    ("AM14_link_sa_grid_count", "apexmf", "link_sa_grid announces 12000 overlap records, 9956 are listed", "corpus (mapping table size mismatch)", "crash", ["link_sa_grid"], am_link_sa_grid_count),
    ("AM15_pval_hk_negative", "apexmf", "negative hk01 in MODFLOW/mf_1000.pval (the file that overrides the UPW parameter values)", "corpus (unphysical parameter)", "unknown", ["mf_1000.pval", "hk01", "negative"], am_pval_hk_negative),
    ("AMD01_mfn_blank_trailing", "apexmf", "trailing spaces and two blank lines at the end of MODFLOW/modflow.mfn", "decoy", "ok", [], amd_mfn_blank_trailing),
    ("AMD02_link_labels", "apexmf", "label text edited in apexmf_link.txt", "decoy", "ok", [], amd_link_labels),
]

# Findings recorded after looking at what the engine did (id -> (verdict, explanation)). Written into results_v2_review.json by run_v2.py --review.
FINDINGS = {
    "AM02_grid2sa_deleted": ("expectation_wrong", "apexmf.exe regenerates MODFLOW/apexmf_grid2sa.txt at start from link_grid_sa ('Preparing APEX-MODFLOW linkage'); the deleted file is rewritten and the results are identical. Real inputs are the link_* tables (AM12-AM14)."),
    "AM03_sa2grid_count": ("expectation_wrong", "apexmf_sa2grid.txt is regenerated from link_sa_grid at start; the edited count is overwritten and the results are identical."),
    "AM04_river2grid_count": ("expectation_wrong", "apexmf_river2grid.txt is regenerated from link_river_grid at start; the edited count is overwritten and the results are identical."),
    "AM14_link_sa_grid_count": ("expectation_wrong", "link_sa_grid announcing 12000 records while 9956 are listed is accepted; results identical to the base run."),
    "AM09_upw_hk_negative": ("misspecified_fixed", "The UPW parameter value is overridden by mf_1000.pval, so the edit had no effect. Re-specified as AM15 (edit in the PVAL file), which does change the run."),
    "SM06_upw_hk_negative": ("misspecified_fixed", "The UPW parameter value is overridden by mf_1000.pval, so the edit had no effect. Re-specified as SM15 (edit in the PVAL file), which breaks the run."),
    "SM09_oc_unit_unknown": ("real_finding", "Saving heads to a unit missing from modflow.mfn is accepted without error and results are identical to the base run."),
    "AP09_nbyr_exceeds_weather": ("expectation_wrong", "APEX accepted NBYR=99 (log shows YEAR 99 OF 99) and finished; results differ. No error for a simulation far longer than the daily weather record."),
    "SW02_idal_400": ("real_finding", "IDAL=400 is accepted; the output has a different number of rows (shape differs), no error."),
    "SW06_nyskip_gt_nbyr": ("expectation_wrong", "NYSKIP larger than NBYR changes nothing in output.rch, output.sub or output.std."),
    "SW15_epco_percent": ("expectation_wrong", "EPCO=100 in every .hru file: results identical to the base run."),
    "SW16_bsn_epco_percent": ("expectation_wrong", "EPCO=100 in basins.bsn also gives identical results. A scratch run with EPCO=0.5 in basins.bsn was identical too, so EPCO has no effect in this model/engine; this fault cannot test a silent unit error. Mechanism (clamping or inactive parameter) not determined."),
    "SP01_hru_soil_unknown": ("real_finding", "An HRU naming a soil that soils.sol does not define does not stop SWAT+: the run finishes and a few water-balance values differ (3 values in basin_wb_yr, tiny relative change); diagnostics.out shows no extra 'file not found' line."),
    "SPD03_case_station_files": ("real_finding", "Decoy that was NOT benign: upper-case .PCP/.TMP names in weather-sta.cli (pcp.cli unchanged) raise the 'file not found' lines in diagnostics.out from 1 to 259 and change results (max relative change 13.2). The engine looks stations up by exact name."),
    "SP08_codes_pet_file_null": ("real_finding", "codes.bsn pet=3 with pet_file null is accepted and results are identical to the base run."),
}

FAMILY = {"swatplus_p29": "SWAT+", "swat2012": "SWAT2012", "swatmf": "SWAT-MODFLOW", "mf6": "MODFLOW 6", "apex": "APEX", "apexmf": "APEX-MODFLOW"}

if __name__ == "__main__":
    import collections
    ids = [f[0] for f in FAULTS_V2]
    assert len(ids) == len(set(ids)), "duplicate ids"
    c = collections.Counter((FAMILY[f[1]], "decoy" if f[4] == "ok" else "fault") for f in FAULTS_V2)
    for k in sorted(c):
        print("%-14s %-6s %d" % (k[0], k[1], c[k]))
    print("total", len(FAULTS_V2))
