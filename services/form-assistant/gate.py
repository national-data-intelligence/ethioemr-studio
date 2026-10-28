"""Quality gate: fail (exit 1) when a measured score falls below its floor in gate.json.

Usage:
  python gate.py search  <pack> <qa-golden.jsonl>   # search only: about 2 minutes, no language model; every change
  python gate.py answers <report.jsonl>             # a saved eval_answers.py report: run before a release
Floors sit a few points under the last accepted run. With 84 questions one question is 1.2 points, so smaller
moves are noise; raise a floor only after a real improvement, in the same commit.
"""
import json
import os
import sys

FLOORS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gate.json"), encoding="utf-8"))


def search_scores(pack_dir, golden):
    from eval_retrieval import hit
    from retrieval import Pack
    pack = Pack.from_env(pack_dir)
    cases = [json.loads(l) for l in open(golden, encoding="utf-8") if l.strip()]
    cases = [c for c in cases if c["expected"].get("answerable") and c["expected"].get("anyOfRecordIds")]
    top3 = all8 = 0
    for c in cases:
        ids = [r["id"] for _, r in pack.search(c["request"]["question"], c["request"].get("audience"))]
        want = set(c["expected"]["anyOfRecordIds"])
        top3 += any(hit(want, i) for i in ids[:3])
        all8 += any(hit(want, i) for i in ids)
    return {"search_top3": 100 * top3 / len(cases), "search_all8": 100 * all8 / len(cases)}


def answer_scores(report):
    rows = [json.loads(l) for l in open(report, encoding="utf-8") if l.strip()]
    ans = [r for r in rows if r["expected_answerable"]]
    unans = [r for r in rows if not r["expected_answerable"]]
    times = sorted(r["seconds"] for r in rows)
    return {"answered_when_should": 100 * sum(r["answerable"] is True for r in ans) / len(ans),
            "refused_when_should": 100 * sum(r["answerable"] is False for r in unans) / max(len(unans), 1),
            "right_source_cited": 100 * sum(bool(r.get("cited_ok")) for r in ans) / len(ans),
            "p90_seconds": times[int(0.9 * (len(times) - 1))]}


if __name__ == "__main__":
    kind = sys.argv[1]
    scores = search_scores(sys.argv[2], sys.argv[3]) if kind == "search" else answer_scores(sys.argv[2])
    failed = False
    for name, value in scores.items():
        floor = FLOORS[kind][name]
        bad = value > floor if name.endswith("seconds") else value < floor  # time has a ceiling, the rest a floor
        failed |= bad
        print("%-5s %-22s %6.1f  (%s %s)" % ("FAIL" if bad else "ok", name, value,
                                             "max" if name.endswith("seconds") else "min", floor))
    sys.exit(1 if failed else 0)
