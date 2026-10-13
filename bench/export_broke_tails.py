"""Export what the engines printed in the cases that stopped them (rounds 2 and 3), for bench/signature_eval.js.

    python bench/export_broke_tails.py <out.json>
    node bench/signature_eval.js index.html <out.json> [list]      (how many of the stopped runs match a known error signature)
Reads <work_root>/results_v2.json and results_v3.json; writes only the given file.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engines

out = []
for fn in ("results_v2.json", "results_v3.json"):
    p = os.path.join(engines.WORK_ROOT, fn)
    if not os.path.exists(p):
        continue
    for k, v in json.load(open(p)).items():
        if k.startswith("_") or v.get("outcome") != "BROKE":
            continue
        out.append({"id": k, "family": v["family"], "round": fn[8:10], "tail": v["run"]["stdout_tail"], "diag": v["run"].get("diag_tail", "")})
json.dump(out, open(sys.argv[1], "w"))
print(len(out), "stopped cases written to", sys.argv[1])
