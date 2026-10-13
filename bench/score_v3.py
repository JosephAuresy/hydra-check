"""Score the tool on the round-3 (forum-derived) faults with the FROZEN rules of the round-2 blind test.

    python bench/score_v3.py --check <frozen_dir>     checks the prerequisites and scores NOTHING
    python bench/score_v3.py <frozen_dir>             scores once (see docs/BLIND_TEST_ROUND3_PROTOCOL.md: do this only after the protocol is committed)

<frozen_dir> is the export of the commit tagged blind-v2-rules-frozen (wherever you exported it). It must not be edited.
Same logic as score_v2.py (its verdict, flags and summary functions are reused as they are). Writes <work_root>/results_v3_scored_frozen.json.
"""
import hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines
import score_v2 as S2
from run_v2 import make_copy
from faults_v3 import FAULTS_V3, FAMILY_V3

W = engines.WORK_ROOT
OUT = os.path.join(W, "results_v3_scored_frozen.json")
FROZEN_INDEX_SHA256 = "ea0264b8aa3362bf44a17ce167c008a36949e62443cf362bf70a2b736397bdb8"   # from docs/BLIND_TEST_PROTOCOL.md


def sha256(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def check(frozen):
    ok = True
    idx = os.path.join(frozen, "index.html")
    h = sha256(idx) if os.path.isfile(idx) else None
    print("frozen index.html sha256 matches the protocol: %s" % (h == FROZEN_INDEX_SHA256))
    ok &= h == FROZEN_INDEX_SHA256
    print("frozen bench/tool_report.js present: %s" % os.path.isfile(os.path.join(frozen, "bench", "tool_report.js")))
    ok &= os.path.isfile(os.path.join(frozen, "bench", "tool_report.js"))
    R = json.load(open(os.path.join(W, "results_v3.json")))
    missing = [f[0] for f in FAULTS_V3 if "outcome" not in R.get(f[0], {})]
    print("engine outcome recorded for %d of %d cases%s" % (len(FAULTS_V3) - len(missing), len(FAULTS_V3), ("; missing: " + ", ".join(missing)) if missing else ""))
    ok &= not missing
    print("scored file already exists: %s" % os.path.exists(OUT))
    ok &= not os.path.exists(OUT)
    print("READY to score once" if ok else "NOT ready (see above)")
    return ok


def main():
    args = sys.argv[1:]
    if "--check" in args:
        frozen = [a for a in args if not a.startswith("--")][0]
        sys.exit(0 if check(frozen) else 1)
    if not args:
        sys.exit("usage: python bench/score_v3.py [--check] <frozen_dir>")
    frozen = args[0]
    if os.path.exists(OUT):
        sys.exit("%s already exists: round 3 is scored once. Do not overwrite it." % OUT)
    if not check(frozen):
        sys.exit("prerequisites not met, nothing scored")
    R = json.load(open(os.path.join(W, "results_v3.json")))
    ref_flags = {}
    for base in sorted({f[1] for f in FAULTS_V3}):
        wd, _ = make_copy(base, "s3_REF_" + base)
        ref_flags[base] = S2.flags(S2.tool_report(frozen, wd))
        print("reference", base, "->", len(ref_flags[base]), "ERROR/WARN already present on the unmodified base", flush=True)
    rows = {}
    for fid, base, title, prov, kind, locate, apply in FAULTS_V3:
        rec = R[fid]
        wd, _ = make_copy(base, "s3_" + fid)
        apply(wd)                                   # the pristine faulted inputs, before any run
        t = S2.tool_report(frozen, wd)
        new = sorted(S2.flags(t) - ref_flags[base])
        rows[fid] = dict(id=fid, base=base, family=FAMILY_V3[base], title=title, provenance=prov, expected=kind, decoy=False, locate=locate,
                         outcome=rec["outcome"], verdict=S2.verdict(t, locate), new_flags=[list(x) for x in new],
                         said=[x for s, x, _ in S2.items(t) if s in ("error", "warn")][:4])
        json.dump(rows, open(OUT, "w"), indent=1)
        print("scored %-30s %-9s %-9s new flags: %d" % (fid, rec["outcome"], rows[fid]["verdict"], len(new)), flush=True)
    S2.summarize(list(rows.values()))


if __name__ == "__main__":
    main()
