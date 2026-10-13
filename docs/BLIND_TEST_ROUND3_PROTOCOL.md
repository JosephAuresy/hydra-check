# Round 3 (forum-derived faults): scoring protocol, written before scoring

Status: **written 2026-10-12, before any round-3 case was shown to the tool.** If this file changes after scoring starts, the change is dated in the "Amendments" section at the end and nothing is deleted.

## What is being tested

Whether the rules that were frozen for the round-2 blind test also name the cause of faults taken from **real forum threads** (MODFLOW group and EPIC/APEX forum, see `FORUM_EVIDENCE_MF_APEX.md`). Round 2 showed 5 of 60 causes named for faults that stop the engine and 0 of 19 for silent faults. Round 3 asks whether that was specific to how round 2 was designed. The rules are **not** changed for this test, so any difference comes from the cases.

## Decision taken (and why)

Score **once, with the frozen rules of round 2** (tag `blind-v2-rules-frozen`), not with the working-tree rules. Reasons: it is the only way to compare round 3 with round 2 (same rules, new cases); and since the freeze the repository gained only advice text, protocol and record files (`git log blind-v2-rules-frozen..HEAD`), so the detection logic is expected to be the same either way. Scoring with newer rules would be development evidence and is a separate, later step.

## Freeze and fingerprints

| What | Value |
|---|---|
| Rules and page (frozen export) | git commit `fde6f73`, tag `blind-v2-rules-frozen`, exported to a folder of your choice (`<frozen_dir>`) |
| SHA-256 of the frozen `index.html` | `ea0264b8aa3362bf44a17ce167c008a36949e62443cf362bf70a2b736397bdb8` (same as the round-2 protocol; verified 2026-10-12) |
| `bench/faults_v3.py` (the cases) | `c2f332cd68a65ad8389b704295291edd925b12286afb44fc9b5865594ed51532` |
| `bench/run_v3.py` (engine runner) | `a7e5a20b65e997654408966d3a70a8366ef5d134894f88d47633f96feda7bea4` |
| `bench/score_v3.py` (scorer) | `895d7e3cb1ea1819857da8ca7c55f11889c1e56c4d130fdf16ec9df26c4685e8` |
| `results_v3.json` (engine outcomes, recorded without the tool) | `b486c8b191401daa6ca0b9538915264ffd41d09cc55b6f50c232a3cab67ad596` |
| Check before scoring | `python bench/score_v3.py --check <frozen_dir>` (reports ready or not; scores nothing) |
| Score (once) | `python bench/score_v3.py <frozen_dir>` (refuses to overwrite `results_v3_scored_frozen.json`) |

## Cases

21 cases in `bench/faults_v3.py`: 6 MODFLOW 6, 8 APEX, 4 SWAT-MODFLOW and 3 APEX-MODFLOW faults, each tied to forum thread ids. There are **no decoys** in round 3, so false alarms are not measured.

Engine outcome recorded before scoring (`results_v3.json`): **15 stop the engine, 4 finish with different results, 2 finish with identical results** (SMF03, AMF03). The engine outcome decides how a case is counted, not the designer's expectation. The two no-effect cases are reported apart and not counted for or against the tool. The `locate` keywords of each case were written in `faults_v3.py` before any scoring.

## What counts as a hit (same as round 2)

* **ERROR**: a finding of error severity whose text contains one of the case's `locate` keywords.
* **WARN**: the same with a warning or note.
* **ELSEWHERE / ABSTAIN / SILENT**: as in `BLIND_TEST_PROTOCOL.md`.
* "Cause named" = ERROR or WARN.

## Headline numbers (fixed in advance)

1. Faults that **stop the engine** (15): cause named, and cause named as ERROR, with Wilson 95% intervals, overall and per family.
2. Faults the engine **survives but whose results change** (4): the same two numbers.
3. Looser companion: any new ERROR or WARN at all on the faulted copy that the unmodified base does not raise.
4. Every miss listed by name.

## Expectation written before scoring (not a pass/fail criterion)

Round 2 missed all six classes of "named file does not exist", "required line removed", "value out of range", "missing or truncated data", "count does not match" and "index outside what exists". Round 3 is mostly of those classes, so the expectation is a low rate again, in the range of round 2 (under about 20% of the stopping faults named). A clearly higher rate would suggest that round 2 was harder than real forum cases; a similar rate would support the plan of writing rules per class of error.

## Rules of conduct

* No rule is edited between this protocol and scoring. Scoring is run once; the scored file is kept as produced.
* After scoring, rules may be improved. Every such change is labelled **post-hoc**, and the round-3 cases then become development material: a later score on them is **not** a validation. A new validation round (round 4) with new cases is needed for that.
* A case is never removed because the tool did badly on it. A case may be corrected only for a demonstrated mistake in the injection or in the engine-outcome judgement, and the correction is listed under Amendments.
* A snapshot is added to the evolution ledger with the label "round 3 blind" after scoring.

## Limits that must accompany any number from it

1. **Designed by the same project, after the round-2 score was known.** Round 3 is independent of the round-2 cases but not blind in the strict sense: the designer knew which classes had been missed.
2. **Forum evidence was read from search snippets** (APEX) and error-text counts (MODFLOW), not full threads. Some cases reproduce the exact message of a thread; others only the class (see `FORUM_EVIDENCE_MF_APEX.md`).
3. **Very small counts** (3 to 8 cases per family). The intervals are wide.
4. **One base model per family**, small or shortened (MODFLOW 6 is a 25-cell toy). The MODFLOW-NWT cases run only inside SWAT-MODFLOW and APEX-MODFLOW.
5. **No SWAT, SWAT+ or decoy cases**, so round 3 says nothing about those families or about false alarms.

## Amendments

* **2026-10-13, before any score was seen:** the local export path in `bench/score_v3.py` (docstring) and in this file was replaced by the placeholder `<frozen_dir>` so that the repository carries no machine path. The fingerprint of `bench/score_v3.py` above was recomputed after this edit. No rule, case, runner or engine outcome changed.
