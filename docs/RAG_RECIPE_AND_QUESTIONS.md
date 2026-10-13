# Ask-the-docs (RAG): which documents to load, how to prepare them, and which questions to test

Written 2026-10-13. Draft for discussion. **Citation check (2026-10-13):** the journal papers below were checked against Crossref (title, authors, year, volume, pages, DOI) and the USGS reports 6-A45, 6-A55, 6-A57 and 6-A61 against the USGS publications warehouse. Not verified, and therefore left out of the page: Niswonger et al. (2011), MODFLOW-NWT, USGS Techniques and Methods 6-A37. Park et al. (2019) is pages 493 to 497. The official manuals must still be checked for the exact version before use. Official manuals are listed by title; get them from the model's own site (SWAT, SWAT+, USGS MODFLOW and Related Programs, the APEX/EPIC site at Texas A&M AgriLife Research).

## What the RAG can and cannot do (so the recipe matches it)

Today the "Ask the docs" part searches the PDFs you drop in plus a community knowledge base built from the coded forum threads (SWAT2012, SWAT+, SWAT-MODFLOW and MODFLOW; no APEX). It answers from the passages it retrieves; with a local model it writes the answer, without one it shows the passages. About half of the forum threads are conceptual or judgement questions (47% "theoretical" in our coding): the RAG can point to what the literature says, it cannot decide for the user. It has not been measured yet (see the last section).

## Recipe: how to prepare the documents

1. **Match the version.** SWAT2012 (rev. 664), SWAT+ (rev. 61 and 62), MODFLOW-2005, MODFLOW-NWT and MODFLOW 6 differ in file layouts and options (for example the `codes.bsn` columns changed between SWAT+ rev. 61 and 62). Never mix manuals of different versions in one index without tagging them.
2. **Tag every file with model, version and type** (input/output reference, theory, tutorial, paper) in its file name, for example `SWATplus_rev61_IO.pdf`, `MF6_mf6io_6.4.pdf`. Answers can then show which version they came from.
3. **Prefer the input/output reference for file questions and the theoretical documentation for concepts.** They answer different questions; one does not replace the other.
4. **Use text PDFs, not scans.** The page reads the PDF text in the browser; scanned images give nothing.
5. **Keep the corpus small and relevant.** A few documents per topic retrieve better than an unfiltered folder. Add the community knowledge base only for the model you are asking about.
6. **Do not load forum posts verbatim.** The project's rule is to attribute community solutions without copying posts.
7. **After loading, test with questions of each type below** and check that the cited passage really supports the answer.

## Documents by topic

### SWAT2012
| Topic | Documents |
|---|---|
| Concepts and equations | *SWAT Theoretical Documentation, Version 2009* (Neitsch, Arnold, Kiniry, Williams) |
| Input files and parameters | *SWAT Input/Output File Documentation, Version 2012* (Arnold et al.) |
| Calibration and use | Arnold et al. (2012), "SWAT: Model use, calibration, and validation", Transactions of the ASABE 55(4) |
| Evaluation criteria | Moriasi et al. (2007), Transactions of the ASABE 50(3); Moriasi et al. (2015), Transactions of the ASABE 58(6) |
| Calibration software | The SWAT-CUP manual (Abbaspour) |

### SWAT+
| Topic | Documents |
|---|---|
| Design and differences from SWAT | Bieger et al. (2017), "Introduction to SWAT+, a completely restructured version of the Soil and Water Assessment Tool", JAWRA 53(1) |
| Input files and parameters | The SWAT+ input/output documentation (swatplus.gitbook.io) for the revision you run |
| Groundwater (gwflow) | The gwflow section of the SWAT+ documentation; the papers it cites by Bailey and co-authors |
| Version changes | The SWAT+ release notes of revisions 61 and 62 |

### SWAT-MODFLOW and SWAT+MODFLOW
| Topic | Documents |
|---|---|
| Original coupling | Kim et al. (2008), "Development and application of the integrated SWAT-MODFLOW model", Journal of Hydrology 356 |
| Coupling framework | Guzman et al. (2015), "A model integration framework for linking SWAT and MODFLOW", Environmental Modelling & Software 73 |
| SWAT+MODFLOW | Bailey et al. (2020), "Enhancing SWAT+ simulation of groundwater flow and groundwater-surface water interactions using MODFLOW routines", Environmental Modelling & Software 126 |
| Interface and tutorial | Park et al. (2019), the QSWATMOD paper, Environmental Modelling & Software 111; the SWAT-MODFLOW tutorial and the link-file documentation distributed with the model |

### MODFLOW (2005, NWT, USG) and MODFLOW 6
| Topic | Documents |
|---|---|
| MODFLOW-2005 | Harbaugh (2005), USGS Techniques and Methods 6-A16 |
| MODFLOW-NWT (the solver used inside SWAT-MODFLOW) | Niswonger, Panday, Ibaraki (2011), USGS Techniques and Methods 6-A37 |
| MODFLOW-USG | Panday et al. (2013), USGS Techniques and Methods 6-A45 |
| MODFLOW 6 | The MODFLOW 6 input and output description (`mf6io`) of the version you run; Langevin et al. (2017), *Documentation for the MODFLOW 6 Groundwater Flow Model*, USGS Techniques and Methods 6-A55; the matching Groundwater Transport Model documentation |
| Scripting | Bakker et al. (2016), FloPy, Groundwater 54(5) |
| General practice | Anderson, Woessner, Hunt, *Applied Groundwater Modeling* (2nd ed., 2015); Hill and Tiedeman (2007), *Effective Groundwater Model Calibration* |

### APEX and APEX-MODFLOW
| Topic | Documents |
|---|---|
| Concepts and equations | *Agricultural Policy/Environmental eXtender Model: Theoretical Documentation* (Williams, Izaurralde, Steglich) |
| Input files and use | The APEX user's guide for the version you run (here APEX1501) |
| Overview and applications | Gassman et al. (2010), "The Agricultural Policy/Environmental EXtender (APEX) model: an emerging tool for landscape and watershed environmental analyses", Transactions of the ASABE 53(3) |
| APEX-MODFLOW | The project's own documentation and example (Park and co-authors; GitHub) |

### Calibration, uncertainty and model evaluation (all models)
Moriasi et al. (2007, 2015) for performance criteria; the SWAT-CUP and PEST manuals for the calibration software; Hill and Tiedeman (2007) for groundwater calibration.

## Question types to test (and what the right behaviour is)

Each type maps to a kind of document and to a way of scoring. Questions should be taken from real forum threads that have an accepted answer, kept apart from the material used to build the knowledge base. Starting size to discuss: 10 to 15 questions per type.

| # | Type | Example | Best source | A good answer |
|---|---|---|---|---|
| A | Parameter or option lookup | "What are the units and range of ESCO?" | Input/output reference | Exact value and a citation |
| B | File format | "What goes in each line of `file.cio`?" | Input/output reference | The right fields, version stated |
| C | Error diagnosis | "forrtl: severe (24) end-of-file during read, unit 30020" | Error signatures plus the community knowledge base | Names the likely file or step and says how to verify |
| D | Workflow | "How do I couple a SWAT+ model with MODFLOW?" | Tutorials and guides | Ordered steps from the cited document |
| E | Concept or choice | "Which PET method suits an arid basin?" | Theoretical documentation and papers | What the literature says, with citations, and a note that the choice is the user's |
| F | Evaluation criteria | "What NSE value is acceptable for a monthly flow calibration?" | Moriasi et al. | The thresholds quoted from the paper, with the paper's own conditions |
| G | Version-specific | "What changed in `codes.bsn` in rev. 62?" | Release notes | The change, with the version; says if the loaded documents do not cover it |
| H | Out of scope or false premise | "Which of these two basins should I model?"; a question that assumes a feature that does not exist | None | Declines or flags the limit; does not invent |

## How to score a RAG answer

1. **Retrieval:** did the cited passages include the one that answers the question (hit in the top 3 and top 5)?
2. **Faithfulness:** is every claim in the answer supported by a cited passage? (Check by reading; a model can write fluent text that its sources do not support.)
3. **Correct abstention:** for type H, and for questions the loaded documents do not cover, did it say so?
4. **Version awareness:** did it say which version the answer applies to?

Report counts per type with the same kind of intervals as the file-check tests, and keep the question bank separate from the material that built the knowledge base, so the numbers are not inflated.

## Gaps to fill first

* **APEX is not in the community knowledge base.** The EPIC/APEX forum (630 threads) could be coded like the other four groups.
* **Version coverage of the manuals** (SWAT+ rev. 62, MODFLOW 6 current) must be checked before the tests.
* **The knowledge base page text says about 9,100 threads; the embedded data sums 5,086.** Find out why before quoting either number.
