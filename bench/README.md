# Hydra Check benchmark: injected faults, real engines

Hydra Check reads the input files of a SWAT, SWAT+, MODFLOW, APEX or coupled model **before** you run it and tells you what it thinks is wrong. This folder is the evidence for how well it does that.

The idea is simple:

1. Start from a model that is known to run (a *base model*).
2. Copy it and inject one small, realistic fault (a deleted file, a truncated file, a null in a number column, a mismatched count ...).
3. Ask the tool what it sees in the faulted copy, from the input files alone. This is the answer a user would get before spending a run on it.
4. Run the real engine on the same copy and record what actually happened.
5. Score the tool's answer against what the engine did.

The original models are never touched: everything happens in copies under a work folder you choose.

## What the verdicts mean

**What the tool said** (one verdict per case, from most to least useful):

| Verdict | Meaning |
|---|---|
| `ERROR` | The tool raised an error or problem that names the faulty file or term. |
| `WARN` | A warning, ambiguity, missing-item or note that names it. |
| `ELSEWHERE` | The tool said something, but not about the fault (a finding elsewhere in the model). |
| `ABSTAIN` | The tool said it has no rules for this model family and found nothing relevant. |
| `SILENT` | The tool has rules for the family and said nothing at all. |

An unmodified base model (a *control*) that gets an `ERROR` is a false alarm.

**What the engine did:**

| Outcome | Meaning |
|---|---|
| `BROKE` | The run stopped (crash, error exit, or no completion marker). |
| `OK` | The run finished (used for controls and for survivors that were not probed further). |
| `CHANGED` | The run finished and the results differ from the working model (SWAT+ survivors, measured with `effect_probe.py`: basin water balance differs by more than 1e-6 relative). |
| `NO-EFFECT` | The run finished and the results are identical to the working model. |

The headline figures are of the form "of the faults that stop the run, the tool names the cause before the run in N of M, as an `ERROR` in K of M". `compare.py` prints them for the tool as it was before its rules were improved, after, and after the run (when the engine's own log, such as SWAT+ `diagnostics.out`, is also available to the tool).

## What you must supply

Nothing is distributed here: no engine executable and no model. You need, for each engine you want to include, a **working model** and the **executable** that runs it. Where to get them:

| Engine | Project / source |
|---|---|
| SWAT2012 | SWAT model site (Texas A&M, swat.tamu.edu): executable and example datasets |
| SWAT+ | SWAT+ site (swatplus.gitbook.io, swat.tamu.edu): executable and QSWAT+ tutorial datasets |
| SWAT-MODFLOW | SWAT-MODFLOW project (Bailey, Park and co-authors; GitHub and the SWAT site): executable and the Middle Bosque example |
| APEX | APEX model site (Texas A&M, epicapex.tamu.edu): executable and example datasets |
| APEX-MODFLOW | APEX-MODFLOW project (Park and co-authors; GitHub): executable and example |
| MODFLOW 6 | USGS MODFLOW and Related Programs page: `mf6` and `libmf6`; build a small model with FloPy or take one from the MODFLOW 6 examples |

The base models and engine versions used for the published numbers are listed in the limitations section. Other versions work, but the numbers will then be your own.

Requirements: Python 3.10 or newer (standard library only), Node.js (for `tool_report.js`, which loads the same rules as the web page), Windows (the engines were Windows executables; the timeout kill uses `taskkill`).

## Configuration

All locations are read from one place, `bench/config.py` (and `bench/config.js` for the Node scripts), and nowhere else:

1. Copy `bench/hydra_bench.config.example.json` to `bench/hydra_bench.config.json` (this file is git-ignored) and replace every placeholder.
2. Or set environment variables: `HYDRA_BENCH_<KEY>`, key upper-cased and dots replaced by underscores (`models.mf6` becomes `HYDRA_BENCH_MODELS_MF6`; list keys are JSON text). `HYDRA_BENCH_CONFIG` names another config file.

A key that is missing stops the script with a message naming the key and what it should point to. There are no default paths. Check your setup with:

```
python bench/config.py
```

| Key | What it points to |
|---|---|
| `work_root` | A folder outside every model folder where copies are made and results are written |
| `node_path` | Node.js executable (`node` if it is on PATH) |
| `models.<id>` | The folder of one working model per base: `swat2012`, `swatplus_p29`, `swatmf`, `apex`, `apexmf`, `mf6` |
| `executables.<id>` | The engine executable for each of those models (for `mf6`, `libmf6.dll` beside it is copied too) |
| `audit_targets` | Model folders for `tests/audit_fp.js` and `tests/scan_rows.js` (the false-positive audit on models that ran) |
| `rules_real_folders`, `rules_true_positive_folders` | Real folders for the extra cases of `tests/run_rules_node.js` (skipped when there is no configuration at all) |
| `fixture_sources` | Folders whose headers `tests/make_fixtures.py` stores in `tests/fixtures.js` |

Written result files contain no absolute paths: work folders are stored relative to `work_root`, and absolute paths in engine output are replaced by `<work>` or `<path>`.

## Running it end to end

From the repository root:

```
python bench/config.py                 # 0. check the configuration
python bench/baseline.py               # 1. prepare bases: run every base model once, unmodified, on a copy
python bench/run_benchmark.py          # 2. inject, ask the tool, run the engine (one record per fault)
python bench/effect_probe.py           # 3. for SWAT+ faults the engine survives: did the results change?
python bench/report.py                 #    quick table straight from results.json
python bench/rescore.py                # 4. score: re-ask the CURRENT tool on the same faulted copies
python bench/compare.py                # 5. compare: before / after / after-the-run
python bench/make_table.py             # 6. write results/pilot_table.md and results/pilot_table.html
```

Notes on the steps:

- A fault is only run if its base passed step 1 (`baseline.json`). Pass fault-id prefixes to step 2 to run a subset, for example `python bench/run_benchmark.py F0 M0`.
- Step 2 is the slow one (each case runs a real engine, minutes for SWAT+). Engines get no stdin, a hard time limit and their process tree is killed on timeout.
- `rescore.py` reads `results_BEFORE_improvements.json` in the work folder: a copy of `results.json` that you keep from the first run, before changing the tool's rules. That copy is what makes the before/after comparison possible. `compare.py` reads `results_AFTER.json` (written by `rescore.py`) and `effect.json`; `make_table.py` reads the same two files.
- `sweep_units.py` is a side experiment (where a low Fortran unit number in `modflow.mfn` starts to break SWAT-MODFLOW).
- Fault definitions, with the reason each exists and where it comes from (`own-log`, `corpus`, `source`, `probe`), are in `faults.py`. Base models are declared in `bases.py`.
- `tests/run_rules_node.js` (the rule unit tests), `tests/audit_fp.js` (what the rules say about models that ran) and `tests/scan_rows.js` use the same configuration.

## Limitations (please read before quoting numbers)

- **It is a pilot.** 22 injected-fault cases plus 6 unmodified controls. Counts like "14 of 15" are small numbers, not rates with confidence intervals.
- **Six base models**, one per engine (SWAT2012, SWAT+, SWAT-MODFLOW, APEX, APEX-MODFLOW, MODFLOW 6). Coverage is uneven: 9 of the 22 faults are on the SWAT+ base, 3 on APEX, 2 on APEX-MODFLOW. One model per family says little about how the rules behave on other models.
- **The SWAT+ base runs on one executable:** a SWAT+ rev. 61 static build. Behaviour on other SWAT+ revisions (rev. 62 and later changed some file layouts) was not measured.
- **Faults are chosen, not sampled.** Eleven come from failure classes reported in the community forums, three from the author's own bug log, one from reading the engine source, and seven are plausible mistakes included to see what really happens. They do not represent the real distribution of user errors.
- **The tool's rules were improved after the first results were seen.** The "before" column is the first version of the rules, the "after" column the improved one. The improvements targeted the failures the first run exposed, so the before/after change is development evidence that the fixes work, not a blind test. A fair test needs new faults and new base models that the rules were never tuned on.
- **Engine behaviour is what one run showed.** Some outcomes depend on the machine and compiler; "BROKE" means the run did not complete, and the cause is the engine's own message, which is sometimes missing.
- **Survivor effects are measured only for SWAT+**, on the basin annual water balance; a fault that changes only another output is reported as `NO-EFFECT`.
- **Windows only as written** (Windows executables, `taskkill` for timeouts).
