# Blind test of the pre-run checks: protocol (written before scoring)

Status: **written 2026-10-09, before any round-2 case was scored.** If this file changes after scoring starts, the change is dated in the "Amendments" section at the end and nothing is deleted.

## What is being tested

Whether the pre-run checks of Hydra Check name the cause of faults that were **not used to tune the rules**. In the first round (pilot, 22 faults) the rules were improved while looking at the results of the same faults, so those numbers are development evidence. Round 2 (about 100 more cases, `bench/faults_v2.py`) was designed and run on the real engines **without calling the tool**; its scoring below is done once with rules that are frozen first.

## Freeze

| What | Value |
|---|---|
| Rules, scorer and page | git commit `fde6f73`, tag `blind-v2-rules-frozen` |
| SHA-256 of `index.html` at the freeze | `ea0264b8aa3362bf44a17ce167c008a36949e62443cf362bf70a2b736397bdb8` |
| SHA-256 of `tests/rules_harness.js` | `83234a80589316f090e750c562df3a2f9b1a6872d20bd43f7df2f4b77add9c48` |
| SHA-256 of `bench/tool_report.js` | `666ecdfc88bb0b5e2c34197f0b4f18d782899116e07699867530998bc5460936` |
| How to rebuild the frozen copy | `git archive blind-v2-rules-frozen \| tar -x -C <dir>` and run `python bench/score_v2.py <dir>` |

The scorer runs the frozen copy, not the working tree. Rules work that continues in the working tree (for example the new advice text) does not affect the score.

## Cases

* `bench/faults_v2.py`: injected faults on six base models (SWAT2012, SWAT+ with gwflow, SWAT-MODFLOW, MODFLOW 6, APEX, APEX-MODFLOW) plus **decoys**: benign edits (blank lines, trailing spaces, case of names, line endings, reordered keywords) that must not break a run.
* Every case was run on the real engine on a copy; the outcome is recorded by `bench/run_v2.py` in `results_v2.json` independently of the tool: BROKE, TIMEOUT, CHANGED (finished, results differ from the unmodified base run), NO-EFFECT (finished, identical), OK.
* The **engine outcome decides how a case is counted**, not the designer's expectation. A fault the designer thought would crash but that the engine accepted is counted as NO-EFFECT or CHANGED, and listed as a surprise.

## What counts as a hit

For each case the tool is shown the pristine faulted inputs only (before any run). The verdict logic is the one used in the pilot (`bench/compare.py`):

* **ERROR**: a finding of error severity whose text contains one of the case's `locate` keywords (file or setting where the fault was put).
* **WARN**: the same with a warning or note.
* **ELSEWHERE**: the tool flagged other things but not this one.
* **ABSTAIN**: the family has no rules (the tool says so).
* **SILENT**: the tool said nothing.

"Cause named" = ERROR or WARN.

## Headline numbers (fixed in advance)

1. Faults that **stop the engine**: cause named, and cause named as ERROR, overall and per family, with Wilson 95% intervals.
2. Faults the engine **survives but whose results change**: the same two numbers.
3. **Decoys**: false alarm rate, defined as a new ERROR or WARN that the unmodified base model does not already raise. Also report decoys on which the engine itself stopped (the edit was not benign).
4. Looser companion number: any new ERROR or WARN at all, whether or not it matches the keywords (this removes the dependence on the designer's `locate` keywords).
5. Every miss listed by name: SILENT, ELSEWHERE and ABSTAIN cases are all reported, not summarised away.

Cases whose engine outcome is NO-EFFECT are reported separately and are not counted for or against the tool.

## Rules of conduct

* No rule is edited between freeze and scoring. Scoring is run once, on all cases that have an engine outcome.
* The scored file is kept as it was produced (`results_v2_scored_frozen.json`) and a snapshot is added to the evolution ledger with the label "blind test".
* After scoring, rules may be improved to address the misses. Every such change is labelled **post-hoc** and any new score is reported as development evidence (as in the pilot), never as a blind number.
* A case is never removed because the tool did badly on it. A case may be corrected only for a demonstrated mistake in the injection or in the engine-outcome judgement, and the correction is listed under Amendments.

## What this test does and does not show

Limits that must accompany any number from it:

1. **The faults were designed by the same project.** The designer was instructed not to run the tool and not to score, and read the pilot results and the scripts. We did not audit whether it also read the rule code. So this is blind with respect to scoring, not with respect to the designer's knowledge.
2. **Fault themes overlap with the rules' sources.** The rules came from community-reported problem classes and the fault list also samples those classes. The test shows whether the rules catch new *instances* and new *files* of those classes, not whether they handle fault classes nobody reported.
3. **The base models are published examples with injected faults**, not models broken by users. Detection on real broken models is a separate test (community cases with their model files), not covered by this protocol.
4. **One engine version per family** and a single static SWAT+ rev 61 executable for SWAT+ cases.
5. **Counts per family are small** (about 15 faults each). The intervals are wide.

## Amendments

(none yet)
