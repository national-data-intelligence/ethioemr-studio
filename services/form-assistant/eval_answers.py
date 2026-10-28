"""Answer score on the held-out Q&A set, against a running form-assistant.

Usage: python eval_answers.py <qa-golden.jsonl> [service url] [report.jsonl]
Per question it checks: answered or refused as expected, a cited record is one of the expected ones (same matching
rule as eval_retrieval.py), and how many must-mention phrases the answer contains. Runs one question at a time:
the model's graphics card is shared with the diagnosis assistant.
"""
import json
import statistics
import sys
import time
import urllib.request

from eval_retrieval import hit

cases = [json.loads(l) for l in open(sys.argv[1], encoding="utf-8") if l.strip()]
url = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8768").rstrip("/") + "/v1/forms/ask"
report = open(sys.argv[3], "w", encoding="utf-8") if len(sys.argv) > 3 else None

n_ok_abstain = n_cite = n_ans = 0
mention, times, fails = [], [], []
for c in cases:
    exp, req = c["expected"], c["request"]
    t0 = time.time()
    r = urllib.request.Request(url, json.dumps(req).encode(), {"Content-Type": "application/json"})
    try:
        d = json.load(urllib.request.urlopen(r, timeout=300))
    except Exception as e:  # count a failed call as a wrong answer, and say so
        d = {"answer": "", "answerable": None, "citations": [], "error": str(e)}
    times.append(time.time() - t0)
    want_ans = bool(exp.get("answerable"))
    ok_abstain = d.get("answerable") == want_ans
    n_ok_abstain += ok_abstain
    row = {"case": c["case_id"], "question": req["question"], "expected_answerable": want_ans,
           "answerable": d.get("answerable"), "answer": d.get("answer"), "cited": [x["recordId"] for x in d.get("citations", [])],
           "warnings": d.get("warnings"), "seconds": round(times[-1], 1)}
    if want_ans:
        n_ans += 1
        cited_ok = any(hit(set(exp.get("anyOfRecordIds", [])), x) for x in row["cited"])
        n_cite += cited_ok
        must = exp.get("mustMention", [])
        got = [m for m in must if m.lower() in (d.get("answer") or "").lower()]
        mention.append(len(got) / len(must) if must else 1.0)
        row.update(cited_ok=cited_ok, mentioned="%d/%d" % (len(got), len(must)))
        if not (ok_abstain and cited_ok):
            fails.append(row)
    elif not ok_abstain:
        fails.append(row)
    if report:
        report.write(json.dumps(row, ensure_ascii=False) + "\n")
    print("%s %-5s %4.1fs %s" % (c["case_id"], "FAIL" if fails and fails[-1] is row else "ok",
                                  times[-1], req["question"][:70]), flush=True)

times.sort()
print("\ncases %d (%d answerable) | answered-or-refused right %.1f %% | right source cited %.1f %% | "
      "must-mention %.1f %% | median %.1fs, p90 %.1fs"
      % (len(cases), n_ans, 100 * n_ok_abstain / len(cases), 100 * n_cite / max(n_ans, 1),
         100 * statistics.mean(mention or [0]), statistics.median(times), times[int(0.9 * (len(times) - 1))]))
