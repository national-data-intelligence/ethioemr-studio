"""Retrieval score on the held-out Q&A set: is an expected record among the top k results?

Usage: python eval_retrieval.py <pack folder> <qa-golden.jsonl>
Only answerable cases count (the others have no right record to find).
"""
import json
import re
import sys
import time

from retrieval import Pack

norm = lambda x: re.sub(r"-\d+$", "", x)


def hit(expected, rid):
    """Same rule as the earlier stand-in (simulate_bini_chunks.py): "...#anchor-2" equals "...#anchor", a document id
    matches its sections, and an id ending in ":" matches any record of that kind."""
    return any(norm(rid) == norm(e) or rid.startswith(e + "#") or (e.endswith(":") and rid.startswith(e))
               or (e.startswith("fs:worddoc:") and rid.startswith(e)) for e in expected)


if __name__ == "__main__":
    pack = Pack(sys.argv[1])
    cases = [json.loads(l) for l in open(sys.argv[2], encoding="utf-8") if l.strip()]
    cases = [c for c in cases if c["expected"].get("answerable") and c["expected"].get("anyOfRecordIds")]
    t0 = time.time()
    hits = {1: 0, 3: 0, 6: 0}
    misses = []
    for c in cases:
        req = c["request"]
        ids = [r["id"] for _, r in pack.search(req["question"], req.get("audience"))]
        want = set(c["expected"]["anyOfRecordIds"])
        for k in hits:
            hits[k] += any(hit(want, i) for i in ids[:k])
        if not any(hit(want, i) for i in ids):
            misses.append((c["case_id"], req["question"], ids[:3]))
    took = (time.time() - t0) / len(cases) * 1000
    print("records %d | cases %d | " % (pack.count, len(cases))
          + " | ".join("top-%d %.1f %%" % (k, 100 * v / len(cases)) for k, v in hits.items())
          + " | %.0f ms per search" % took)
    for m in misses:
        print("MISS", m[0], m[1], "->", m[2])
