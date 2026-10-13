# Forum evidence for the MODFLOW and APEX faults

Written 2026-10-12. Question: which of the MODFLOW 6 / MODFLOW (other versions) and APEX faults of the benchmark are failures that real users report, and which are only our own guesses? This file checks that, one fault at a time, and adds a third round of faults taken from real threads.

## Sources and how they were read

| Source | What was read | How | Limits |
|---|---|---|---|
| MODFLOW group, `groups.google.com/g/modflow` | 2,604 threads (375 mention MODFLOW 6) | The local copy in `swat-issue-atlas/data/modflow_content.jsonl` was searched for the **error text users paste** (for example `ERROR REPORT`, `error opening file`, `forrtl`) and counted by distinct thread. | Text search, not reading every thread. A fault class can be real and still not be found if users describe it in prose. The copy dates from June 2026. |
| EPIC / APEX forum, `groups.google.com/g/agriliferesearchmodeling` | 630 threads in the group; the group's own search was used for `forrtl` (16 threads), `"IS MISSING"` (22), `"NOT IN" LIST` (5), `"end-of-file"` (4), `"syntax error"` (1) | Read in the browser on 2026-10-12: titles and the text snippets that the search shows, plus thread links. | **This forum was not in our local corpus before**, so none of the APEX faults of round 2 had been checked against it. Only the search snippets were read, not the full threads. |

The SWAT-MODFLOW, SWAT and SWAT+ groups were not rechecked in this pass.

## What real users report (error signatures)

MODFLOW 6 (messages after `ERROR REPORT:`, distinct threads): required block not found (4), unknown option (3), could not open a file listed in `mfsim.nam` (4), model package type not supported (1), could not find flow package (1), `MODEL_SHAPE` memory-manager error when DIS is missing or wrong (2), could not read a double in `perioddata` (1), model has no active nodes (1), cell is already a constant head (1), END detected before the block was closed (1), simulation convergence failure (2 with the exact text; the 8 to 12 threads counting looser wording).

Other MODFLOW versions (2005, NWT, USG, OWHM), by message: `error opening file` (9 threads), `access violation` (11), `FAILED TO MEET SOLVER CONVERGENCE` (12), `error reading array control record` (5), list-directed I/O syntax error (3), input conversion error (3), formatted/unformatted mismatch (2), end-of-file during read (1).

APEX / EPIC: `forrtl severe (408)` subscript out of bounds on arrays such as NC, NISA, RFDT, KRO, HED, LID, LT (8 of the 16 `forrtl` threads); end-of-file during read, including `PARMS.DAT` unit 12; `File ... IS MISSING` (weather files, `.DLY`, `.SOT`, sub-area file, `EPICERR.DAT`); `NOT IN CROP LIST FILE` and `0 not in Fert List file`; list-directed I/O syntax error in the daily weather read; floating overflow and NA values from extreme soil inputs (low sand); output conversion error; operations not ordered by date or a planting operation without PHU.

## Check of the round-2 faults (MODFLOW 6, APEX, APEX-MODFLOW)

`Forum` = the same error class appears in real threads. `Own guess` = no thread found in this pass. The round-2 `provenance` text in `bench/faults_v2.py` was written before this check and is **not** changed (the blind-test record stays as it was); this table is the correction.

| Fault | Verdict | Evidence |
|---|---|---|
| MF03 solver file named in `mfsim.nam` does not exist | Forum | modflow `pbOnmnesTTY`, `3bGd9hIilDY`, `DNs6BbDyPuY` |
| MF04 no TDIS6 line | Forum | modflow `DNs6BbDyPuY` |
| MF05 gwf.nam without DIS6 | Forum (same engine message) | modflow `Rm_dGOMEaVA`, `MVxuE6Sx2ew` (`MODEL_SHAPE`) |
| MF06 package type misspelled | Forum (class: package type not supported) | modflow `GC6YwZVaprs` |
| MF13 UZT flow package name does not exist | Forum | modflow `hNiRhsj7ofI` |
| MF14 solver cannot converge | Forum | modflow `stM0LYs9YG4`, `Z-eT5Me6TVg`, `CU_YXF0kynA` |
| MF01 zero-length first period, MF02 negative NSTP, MF07 GWF/GWT grids differ, MF08 bottom above top, MF09 cell outside the grid, MF10 MAXBOUND 0, MF11 negative K, MF12 NUZFCELLS short | **Own guess** | no thread with the matching message (the threads on zero thickness describe legitimate models) |
| AP01 to AP03 weather, wind or site number not in its list | Forum (class: `NOT IN ... LIST FILE`) | apex `uRsllcxAU-4` (crop), `UHq7cqCdUu8` (fertilizer) |
| AP04 to AP08, AP12 a file named in a list is missing | Forum (class: `IS MISSING`) | apex `MRl547rwZec`, `Q0qX4S0ph3c`, `niW9-BIQ1E0`, `rrsyBYp1wak` |
| AP11 `PARMS.DAT` cut short | Forum (same file) | apex `w2uMVaAa51U` |
| AP13 weather rows removed, AP14 rain coded -99 | Partly (weather format threads) | apex `VswTr5vVoDE`, `xyc3r9m9Q_U` |
| AP09 NBYR larger than the weather record, AP10 control line one value short | **Own guess** | not found in this pass |
| AM06 solver convergence | Forum (class, MODFLOW group) | 12 threads, for example `CU_YXF0kynA` |
| AM10 sub-area file cut short | Forum (class: end-of-file during read) | apex `w2uMVaAa51U`, modflow `EZV8xTm_nNY` |
| AM07 RIV package removed, AM08 duplicate unit number | Partly: the crash type (access violation, error opening file) is common, the cause is not documented | modflow `rPt6XMnMPXU`, `Opg_1smGYDk` |
| AM01 to AM05, AM09 to AM15 (coupling link files and tables) | Not checked here: they belong to the SWAT-MODFLOW / APEX-MODFLOW world, which these two groups do not cover | |

Round 2 labelled several of the "own guess" cases `corpus`. For the MODFLOW 6 and APEX cases that label was not backed by a thread; use the table above.

## Round 3: 21 faults taken from real threads

`bench/faults_v3.py` (catalogue), `bench/run_v3.py` (runner), results in `results_v3.json` of the work folder. Same copies, engines, timeouts and result comparison as round 2. These cases were designed after the round-2 score was known and the tool was not called: they are a new test set, **not** part of the blind round.

| Case | Real thread (class) | What the engine did |
|---|---|---|
| MF6F01 DIMENSIONS block removed | modflow `DNs6BbDyPuY`, `whie8epkb28` | stopped |
| MF6F02 `SAVE_FLOW` typo in an options block | modflow `e-yk8R0CRRA`, `3HZTIZSPLuk`, `9ep0zKorzL8` | stopped: "Input file tag not found" |
| MF6F03 letter O in `perioddata` | modflow `afCjktqWlmQ` | stopped |
| MF6F04 IDOMAIN 0 everywhere | modflow `Ug4Eejt__q4` | stopped: "Model does not have any active nodes" (the forum text) |
| MF6F05 duplicate constant-head cell | modflow `Oc_EEfoCyvs` | stopped: "Cell is already a constant head" (the forum text) |
| MF6F06 block closed with the wrong END | modflow `DNs6BbDyPuY` | stopped |
| SMF01 / AMF01 bad control record of the TOP array | modflow `r4fwcasvhlI`, `6hD67Hpe1Ks`, `UKx3Qw_ygH8`, `1rqBx_s-1vM` | stopped, no message naming the cause |
| SMF02 / AMF02 letter O inside the TOP array | modflow `9BjiVDWTq4E`, `EU6JLDRKB1o` | stopped (forrtl 59) |
| SMF03 / AMF03 binary budget file declared as text | modflow `jdoZMK0pA68`, `Ji4Yg1J5Wt8` | **finished, results identical** (expectation wrong for this setup) |
| SMF04 river package file truncated | modflow `EZV8xTm_nNY` (end-of-file) | stopped (forrtl 24) |
| APF01 crop number 999 in the planting row | apex `uRsllcxAU-4` | stopped, access violation (not the "NOT IN CROP LIST" message of the forum) |
| APF02 planting and harvest rows exchanged | apex `VhQzOS_xx1Q` | finished, results **changed** (up to 51x) |
| APF03 PHU 0 in the planting row | apex `pDc8CHEtyAE` | stopped, access violation |
| APF04 fertilizer number 999 | apex `UHq7cqCdUu8` | stopped: "NOT IN FERT LIST FILE" (the forum text) |
| APF05 sand 0 % in the soil files | apex `XG_QTgPy7Sc` | finished, results **changed** |
| APF06 letter O in a number of the daily weather file | apex `ne0wwZ_0bpg`, `8Rl7OmLgPkA` | finished, results **changed**: no syntax error here |
| APF07 blank rain field in 1998 | apex `xyc3r9m9Q_U` | finished, results **changed** |
| APF08 daily weather file missing | apex `MRl547rwZec`, `Q0qX4S0ph3c` | stopped: "File ... IS MISSING" |

Totals: 21 cases: 15 stopped the engine, 4 finished with different results (APF02, APF05, APF06, APF07), 2 finished with identical results (SMF03, AMF03).

Notable: three engine behaviours differ from what the threads suggest (APF01 and APF03 crash without the documented message; APF06 accepts a letter inside a number and silently changes results; the binary-budget declaration is accepted). These are findings about the engines, not about the tool.

## What is still open

1. **Scoring.** The round-3 cases have not been shown to the tool. The rules frozen for the round-2 blind test are at tag `blind-v2-rules-frozen`; the current rules may be newer. Decide whether round 3 is scored on the frozen copy (comparable with round 2) or on the current rules (development evidence), and write that down before scoring.
2. **The "own guess" faults** of the table above can stay (they are legitimate probes) but should be reported as such, not as forum-derived.
3. **APEX evidence was read from search snippets.** Before quoting a thread in a paper, open it and read the whole discussion.
4. **Not covered:** MODFLOW-2005 / NWT / USG as standalone executables (no executable is configured here); the faults above run NWT only inside SWAT-MODFLOW and APEX-MODFLOW.

## The seven pilot faults that were labelled "probe" (plausible, no documented outcome)

Pilot faults P02, F01, F02, F03, A01, A02 and AM01 had no source other than "a user could make this mistake". Checked against the same forums:

| Fault | New label | Evidence |
|---|---|---|
| F02 `gwf.npf` deleted | Forum, same class (a file named in the name file cannot be opened) | modflow `3bGd9hIilDY`, `DNs6BbDyPuY`, `Tutjde7xU4w` |
| F03 `OUTER_MAXIMUM 1`, cannot converge | Forum, same class (convergence failure); the setting itself is not documented | modflow `stM0LYs9YG4`, `Z-eT5Me6TVg`, `CU_YXF0kynA` |
| A01 `HOUSTON.SOL` deleted | Forum, same class (`File ... IS MISSING`); in the benchmark this file is unused, so the run was unaffected | apex `rrsyBYp1wak`, `niW9-BIQ1E0` |
| A02 `APEXCONT.DAT` emptied | Forum, same class (end-of-file during read of an input file) | apex `w2uMVaAa51U`, `ik5MiFLm3k8` |
| AM01 `apexmf_link.txt` deleted | Own guess. The SWAT-MODFLOW group has end-of-file threads (`Sofx5B15z_0`, unit 30020, no file named) but none about this file, and there is no APEX-MODFLOW forum in these two groups | |
| P02 `codes.bsn` gwflow=1 with gwflow files | Own guess. SWAT+ threads on gwflow errors exist (`da4XF48qqa4`, `r6XuDjpUpQg`) but they concern other failures inside gwflow, not this flag | |
| F01 NPER says 6, 5 periods defined | Own guess. No thread with this message | |

Suggested labels for any table: **Forum, exact** (same error and file), **Forum, same class** (same kind of error, different edit), **Own bug log**, **Engine source**, **Own guess**. The word "plausible" is not needed any more. The 11 pilot faults labelled `corpus` come from the SWAT, SWAT+ and SWAT-MODFLOW groups and were not rechecked in this pass.

A side finding: SWAT-MODFLOW thread `CeXe5Gu39NI` (end-of-file at period 2) is answered by the model's maintainer with "add 100 days to the MODFLOW simulation period in the .dis file ... the SWAT model accounts for leap years". That supports pilot fault M02 (MODFLOW time shorter than the SWAT period), which was labelled "engine source".

## Paste-an-error mode: signatures added and a first measurement (2026-10-13)

The "Paste an error message" mode matches the pasted text against known error signatures (and "Ask the docs" now also searches them). 13 signatures were added from the real messages above: MODFLOW 6 (file cannot be opened, required block missing, option not recognized, no active cell, duplicate constant-head cell, transport package names a missing flow package, package type not supported), MODFLOW in general (array header or number cannot be read, text read as binary), and APEX (ID not in its list file, file is missing, subscript out of range, control or parameter file ends too early). Each shows links to the forum threads where the message was reported, and 6 new one-click examples were added to the gallery.

A first measurement used what the engines printed in the 75 cases of rounds 2 and 3 that stopped the engine (`bench/export_broke_tails.py`, `bench/signature_eval.js`; only the last 12 lines of each run were stored):

| | Signatures | Stopped cases with at least one match |
|---|---|---|
| Before (clean: the 12 original signatures) | 12 | 25 of 75, but 15 of those were a wrong match: the decision-table signature fired on every APEX failure because the file name `RFDTLST.DAT` contains "dtl" |
| After the new signatures and two corrections | 25 | 34 of 75, no wrong match found |

Reading it correctly:
* The "after" number is **development evidence, not validation**: the new signatures were written from these same messages. A fair test needs new error messages.
* "Match" means that a signature was triggered. Whether its stated cause is the right one for that case was judged by reading, not scored automatically.
* Two original signatures were tightened because they matched by accident: `dtl` (now `.dtl` or the whole word) and `nan` (now the whole word NaN). A test file, `tests/signatures.test.js`, keeps 22 real messages and these two false matches from coming back.
* Many MODFLOW-NWT stops print no message at all (the run just ends after "Using NAME file"), so no signature can match them; the same holds for most SWAT2012 stops (8 of 8 unmatched).

