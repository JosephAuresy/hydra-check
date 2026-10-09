# Hydra Check

**Hydra Check** — understand and validate existing hydrologic models. It is the first of a planned family: *Hydra Build* (construct models automatically from specifications) and *Hydra Hybrid* (combine physics-based and data-driven components).

A free, private, in-browser pre-run checker. It first works out **what you gave it** (SWAT2012, SWAT+ rev 61/62 and older formats, SWAT-MODFLOW, SWAT+MODFLOW, MODFLOW 2005/NWT/USG/6, APEX, APEX-MODFLOW, and the groundwater module or coupling in use), then checks it. Full rule sets exist for SWAT2012, SWAT+, SWAT-MODFLOW and MODFLOW; MODFLOW 6 has six checks (name-file references, NPER, convergence failures recorded in a run's listing, and three IMS settings that made test models fail to converge); APEX has basic checks (empty control files, the APEX-MODFLOW link file).
Paste an error message or drop your model folder, and get an instant diagnosis — no upload,
no account, no server.

**Live tool:** https://JosephAuresy.github.io/hydra-check/

**How it got here (tests, results, corrections, milestones):** https://JosephAuresy.github.io/hydra-check/evolution/ ; benchmark method and limits in [`bench/README.md`](bench/README.md); blind-test protocol in [`docs/BLIND_TEST_PROTOCOL.md`](docs/BLIND_TEST_PROTOCOL.md).

## What this is

Two tiers, built from a taxonomy of thousands of user-reported implementation issues mined
from the official SWAT, SWAT+, SWAT-MODFLOW, and MODFLOW communities (2009–2026):

- **Check my model files / Paste an error** — a deterministic, rule-based checker. Instant,
  offline, zero hallucination risk: every finding names the exact file/line or error pattern
  that triggered it. Answers the **documentable majority** of setup, crash, and configuration
  questions, and tells you when a question is *not* documentable so you don't get a
  false-confidence answer.
- **Ask the docs** — a retrieval-grounded prototype. Drop your own PDF manuals; the tool
  searches them **and** a community-knowledge index built from the coded corpus, where every
  suggested solution carries its real support count (how many independent forum threads
  proposed it, and how often it was followed by a resolution) — not a paraphrase. A written
  answer is generated only if you have a local model running (via [Ollama](https://ollama.com)),
  entirely on your machine.

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
git clone https://github.com/JosephAuresy/hydra-check.git
cd hydra-check
# then just open index.html in your browser — no server required
```

## Scope

The rule engine currently covers the highest-frequency **procedural and configuration**
issue categories identified in the underlying taxonomy — the ones with a documented, definite
fix (null soil fields, inverted simulation dates, low MODFLOW file-unit numbers, missing
name-file references, solver non-convergence signatures, and others). **Theoretical / frontier**
categories (e.g. boundary-condition conceptualization, joint-calibration strategy) are
deliberately excluded from automation by design — see the paper for the rationale
(the "complexity frontier" concept).

## Citation

If you use this tool in research, please cite:

> Serrano, D., & Park, S. (2026). *A Cross-Model Taxonomy of Implementation
> Failures in Hydrological Modeling Frameworks: Empirical Foundations for a Knowledge-Grounded
> Diagnostic Assistant.* [Manuscript in preparation].

A `CITATION.cff` file is included for GitHub's built-in citation widget.

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
