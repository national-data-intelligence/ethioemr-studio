"""Draft score: runs draft-rule cases against a running form-assistant and grades each rule.

Usage: python eval_drafts.py <drafts-golden.json> [service url] [report.jsonl]
Per case:
  drafted        a draft came back (the Check passed, possibly after one retry)
  behaviour      it is the expected kind: hide, calculate, warn or fail
  works          the rule gives the expected result on every sample answer (probe_rule.mjs runs it)
  editable       Form Studio's Rules window can show and edit it as a sentence
One case at a time: the model's graphics card is shared with the diagnosis assistant.
"""
import json
import os
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


def probe(expression, ids, probes):
    r = subprocess.run(["node", os.path.join(HERE, "probe_rule.mjs")], capture_output=True, text=True, timeout=30,
                       input=json.dumps({"expression": expression, "ids": ids, "probes": probes}))
    return json.loads(r.stdout)


def matches(got, expect):
    if "error" in got:
        return False
    v = got["value"]
    if isinstance(expect, bool):
        return bool(v) == expect
    try:
        return abs(float(v) - float(expect)) <= 0.1
    except (TypeError, ValueError):
        return False


def main():
    golden = json.load(open(sys.argv[1], encoding="utf-8"))
    url = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8768").rstrip("/") + "/v1/forms/draft"
    report = open(sys.argv[3], "w", encoding="utf-8") if len(sys.argv) > 3 else None
    ids = [q["id"] for p in golden["form"]["pages"] for s in p["sections"] for q in s["questions"]]
    rows = []
    for c in golden["cases"]:
        body = {"task": "draft-rule", "instruction": c["instruction"], "form": golden["form"],
                "targetQuestionId": c["targetQuestionId"]}
        t0 = time.time()
        req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
        try:
            d = json.load(urllib.request.urlopen(req, timeout=300))
        except urllib.error.HTTPError as e:
            d = json.loads(e.read() or b"{}")
        except Exception as e:  # a failed call counts as a failed draft, and says why
            d = {"error": {"code": type(e).__name__}}
        row = {"case": c["case_id"], "instruction": c["instruction"], "seconds": round(time.time() - t0, 1),
               "drafted": "draft" in d, "error": (d.get("error") or {}).get("code")}
        if row["drafted"]:
            dr = d["draft"]
            got = probe(dr["expression"], ids, c["probes"])
            ok = [matches(g, p["expect"]) for g, p in zip(got, c["probes"])]
            row.update(behaviour=dr["behaviour"], expression=dr["expression"], attempts=d.get("attempts"),
                       behaviour_ok=dr["behaviour"] == c["behaviour"], works=all(ok) and dr["behaviour"] == c["behaviour"],
                       probes="%d/%d" % (sum(ok), len(ok)), editable=dr.get("editableInRulesWindow"),
                       plain=dr.get("plainLanguage"), check=d["check"]["status"])
        rows.append(row)
        print("%s %-6s %5.1fs %-9s %s" % (row["case"], "ok" if row.get("works") else "FAIL", row["seconds"],
                                          row.get("behaviour") or row["error"], row.get("expression", "")[:70]),
              flush=True)
        if report:
            report.write(json.dumps(row, ensure_ascii=False) + "\n")
    n = len(rows)
    pct = lambda k: 100 * sum(bool(r.get(k)) for r in rows) / n
    times = sorted(r["seconds"] for r in rows)
    print("\ncases %d | drafted %.1f %% | right kind %.1f %% | works %.1f %% | editable %.1f %% | retried %d | "
          "median %.1fs, slowest %.1fs" % (n, pct("drafted"), pct("behaviour_ok"), pct("works"), pct("editable"),
                                          sum((r.get("attempts") or 1) > 1 for r in rows),
                                          statistics.median(times), times[-1]))


if __name__ == "__main__":
    main()
