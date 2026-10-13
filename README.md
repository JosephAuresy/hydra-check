<p align="center"><img src="assets/ihydro-check-logo.png" alt="iHydroLab Check" width="320"></p>

# iHydroLab Check

**iHydroLab Check** (formerly *Hydra Check*) — understand and validate existing hydrologic models. It is the first of a planned family from the iHydroLab research group: *iHydroLab Build* (construct models automatically from specifications) and *iHydroLab Hybrid* (combine physics-based and data-driven components).

A free, private, in-browser pre-run checker. It first works out **what you gave it** (SWAT2012, SWAT+ rev 61/62 and older formats, SWAT-MODFLOW, SWAT+MODFLOW, MODFLOW 2005/NWT/USG/6, APEX, APEX-MODFLOW, and the groundwater module or coupling in use), then checks it. Full rule sets exist for SWAT2012, SWAT+, SWAT-MODFLOW and MODFLOW; MODFLOW 6 has six checks (name-file references, NPER, convergence failures recorded in a run's listing, and three IMS settings that made test models fail to converge); APEX has basic checks (empty control files, the APEX-MODFLOW link file).
Ask a question or paste an error message, or drop your model folder, and get a diagnosis — no upload,
no account, no server.

**Live tool:** https://dauresy.github.io/check/

**How it got here (tests, results, corrections, milestones):** https://dauresy.github.io/check/evolution/ ; benchmark method and limits in [`bench/README.md`](bench/README.md); blind-test protocol in [`docs/BLIND_TEST_PROTOCOL.md`](docs/BLIND_TEST_PROTOCOL.md).

## What this is

Two tiers, built from a taxonomy of thousands of user-reported implementation issues mined
from the official SWAT, SWAT+, SWAT-MODFLOW, and MODFLOW communities (2009–2026):

Two doors, one rule: if you type, everything goes in the same box; if you bring files, they go to the file check.

- **Ask or paste an error** — one box. A pasted error is first matched, instantly and
  without a model, against known error messages with a documented cause and fix (each links to the
  forum threads where it was reported). Then the same question searches your own PDF manuals, a
  community-knowledge index built from the coded corpus (every suggested solution carries its real
  support count) and those known errors, and says how much evidence stands behind the result.
  A written answer is generated only if you have a local model running (via
  [Ollama](https://ollama.com)), entirely on your machine. This door is a beta and has not been
  benchmarked yet.
- **Check my files** — a deterministic, rule-based checker. Instant, offline, zero hallucination
  risk: every finding names the exact file/line or pattern that triggered it. Answers the
  **documentable majority** of setup, crash, and configuration questions, and tells you when a
  question is *not* documentable so you don't get a false-confidence answer.

It does not replace the official Google Groups. It is a triage layer in front of them: it
resolves the same procedural questions that get asked hundreds of times, and it drafts a
well-formed report (framework, version, error, files, what you already tried) for the
genuinely hard questions, so human experts can answer in one round instead of three.

See the in-app **"How this works & trust"** page for the full methodology, or the paper
below for the underlying research.

## Why you can trust it

- **100% client-side.** All analysis, retrieval, and PDF indexing run in your browser. Written
  answers (Tier 2) are generated only by a model running on *your* machine — nothing is ever
  sent to a third-party API. Safe for proprietary or client basin models.
- **Traceable.** Every finding names the file/line and the specific pattern that triggered it.
  Nothing is a black-box guess.
- **Attributed, not copied.** Recurring community solutions are re-expressed and attributed at
  the community level (e.g. "as commonly advised in the SWAT-MODFLOW group") — no verbatim
  forum posts are reproduced.
- **Admits its limits.** Questions that fall at a framework's *complexity frontier*
  (boundary-condition conceptualization, SW–GW exchange behavior, joint-calibration judgment)
  are explicitly flagged for expert review rather than answered with false confidence.

## Using it

No build step. Open [`index.html`](index.html) directly in any browser, or visit the
GitHub Pages link above. To run it locally instead of via the web:

```bash
git clone https://github.com/dauresy/check.git
cd check
# then just open index.html in your browser — no server required
```

## Feedback mode (demonstrations and workshops)

Open the page with `?study=1` at the end of the address (optionally `&cohort=agu-poster` to label a session, `&task=T07` to tag the task). Ordinary visitors see nothing of this.
A thin bar offers **Download results** (JSON, or CSV) and **Send results**, and each answer is followed by *Was this useful? Yes / Somewhat / No* and an optional comment.

Each answer adds one record: a random participant ID, the tool version, a timestamp, the task or a label of the question, the kind of answer, the evidence level shown, the rating and the comment.
The text of a question is included only if the participant ticks a separate box, and files, logs and paths are never recorded. Records stay in the tab and disappear when it is closed.
**Send results** is disabled until the participant ticks the consent box and an endpoint has been configured (`HDAStudy.configure({endpoint: ...})` in `src/study.js`); until then the results are shared by downloading the file.
Tests: `node tests/study.test.js`.

## Scope

The rule engine currently covers the highest-frequency **procedural and configuration**
issue categories identified in the underlying taxonomy — the ones with a documented, definite
fix (null soil fields, inverted simulation dates, low MODFLOW file-unit numbers, missing
name-file references, solver non-convergence signatures, and others). **Theoretical / frontier**
categories (e.g. boundary-condition conceptualization, joint-calibration strategy) are
deliberately excluded from automation by design — see the paper for the rationale
(the "complexity frontier" concept).

## Citation

If you use the tool, please cite the software:

> Serrano, D., & Park, S. (2026). *iHydroLab Check* (version 0.1.0) [Computer software]. https://github.com/dauresy/check

A DOI will be added here when the first release is archived. `CITATION.cff` is included for GitHub's "Cite this repository" button.

For the study behind the rules (the taxonomy of failures built from community threads), please also cite:

> Serrano, D., & Park, S. (2026). *A Cross-Model Taxonomy of Implementation
> Failures in Hydrological Modeling Frameworks: Empirical Foundations for a Knowledge-Grounded
> Diagnostic Assistant.* [Manuscript in preparation].

## Reproducing this for another modeling community

The rule-extraction methodology is model-agnostic. In short: mine a technical forum corpus,
apply grounded-theory coding to build a taxonomy, classify each issue's *nature* (procedural
vs. theoretical vs. configuration vs. bug), extract deterministic signatures for the
high-frequency procedural/configuration categories, and deliberately exclude the theoretical
frontier from automation. Full methodology is described in the paper above.

## License

The code in this repository (the diagnostic tool itself) is released under the [MIT
License](LICENSE). The underlying research corpus, full taxonomy, and classification pipeline
are maintained in a separate repository under a pre-publication license and will be released
upon peer-reviewed publication.

## Authors

David Serrano¹, Seonggyu Park¹
¹ Dept. of Civil, Environmental, and Construction Engineering, Texas Tech University
