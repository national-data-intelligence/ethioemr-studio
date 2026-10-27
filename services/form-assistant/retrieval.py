"""Keyword search (BM25) over the Form Studio knowledge pack.

The pack is a folder with records/*.jsonl (see docs: knowledge-pack.schema.json). Each collection gets its own
index, so the 12,000 form question records never crowd out the 1,400 how-to sections when both are searched.
"""
import glob
import json
import math
import os
import re
from collections import Counter

WORD = re.compile(r"[a-z0-9]+")
STOP = set("a an and are as at be by can do does for from how i in is it its of on or the this to what when where "
           "which who why will with my me you your we our not no".split())


def words(text):
    return [w for w in WORD.findall(text.lower()) if w not in STOP and len(w) > 1]


class Index:
    """BM25 over title + section + text. Titles and sections count twice: they name what a record is about."""

    def __init__(self, records, k1=1.4, b=0.6):
        self.records, self.k1, self.b = records, k1, b
        self.docs = [Counter(words(r.get("title", "") + " " + r.get("section", "")) * 2 + words(r.get("text", "")))
                     for r in records]
        self.lens = [sum(d.values()) for d in self.docs]
        self.avg = sum(self.lens) / max(len(self.lens), 1)
        df = Counter(w for d in self.docs for w in d)
        n = len(self.docs)
        self.idf = {w: math.log(1 + (n - c + 0.5) / (c + 0.5)) for w, c in df.items()}

    def search(self, query, k=5, audience=None, per_doc=2):
        q = set(words(query))
        scored = []
        for i, d in enumerate(self.docs):
            if audience and audience not in self.records[i].get("audience", [audience]):
                continue
            s = 0.0
            for w in q:
                f = d.get(w)
                if f:
                    s += self.idf[w] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * self.lens[i] / self.avg))
            if s > 0:
                scored.append((s, i))
        scored.sort(reverse=True)
        out, seen = [], Counter()
        for s, i in scored:  # at most per_doc pieces of one document, so one long page cannot fill every slot
            doc = self.records[i]["id"].split("#")[0]
            if seen[doc] < per_doc:
                seen[doc] += 1
                out.append((s, self.records[i]))
                if len(out) == k:
                    break
        return out


class Pack:
    def __init__(self, folder):
        self.folder = folder
        self.manifest = json.load(open(os.path.join(folder, "manifest.json"), encoding="utf-8"))
        by = {}
        for path in glob.glob(os.path.join(folder, "records", "*.jsonl")):
            for line in open(path, encoding="utf-8"):
                if line.strip():
                    r = json.loads(line)
                    c = r.get("collection", os.path.basename(path)[:-6])
                    if c == "forms":  # whole forms and their questions answer different questions: index apart
                        c = "forms" if r.get("kind") == "form" else "questions"
                    by.setdefault(c, []).append(r)
        self.rules = by.pop("rules", [])
        self.indexes = {c: Index(rs) for c, rs in by.items()}
        self.count = sum(len(rs) for rs in by.values()) + len(self.rules)

    def search(self, query, audience=None, k_knowledge=4, k_forms=2, k_questions=2):
        """How-to sections first, then a few whole forms and form questions; each list ranked by its own index."""
        hits = []
        for name, k in (("form-knowledge", k_knowledge), ("forms", k_forms), ("questions", k_questions)):
            if name in self.indexes and k:
                hits += self.indexes[name].search(query, k, audience)
        return hits
