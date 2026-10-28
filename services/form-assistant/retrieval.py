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


def card(r):
    """The text a meaning model reads for a record: where it sits (title > section), then what it says."""
    return " > ".join(x for x in (r.get("title"), r.get("section")) if x) + "\n" + r.get("text", "")[:1500]


class Meaning:
    """Meaning search (embeddings) plus a re-ranker, both small ONNX models on the CPU (fastembed).

    On the 84 held-out questions (2026-10-27) keyword search alone found a right record in the top 3 for 80.5 %;
    keywords + bge-small merged by rank, then re-ranked by MiniLM-L-6, for 92.2 %. Vectors are built once per pack
    and kept in cache_dir, so only the first start pays for them (about 6 minutes on 8 cores).
    """

    def __init__(self, indexes, embed_model, rerank_model, cache_dir, threads=8):
        import hashlib
        import numpy as np
        from fastembed import TextEmbedding
        from fastembed.rerank.cross_encoder import TextCrossEncoder
        self.np = np
        self.embed = TextEmbedding(embed_model, threads=threads, cache_dir=cache_dir)
        self.rerank = TextCrossEncoder(rerank_model, threads=threads, cache_dir=cache_dir) if rerank_model else None
        self.vectors = {}
        for name, idx in indexes.items():
            digest = hashlib.sha256("\n".join(r["id"] + r.get("content_hash", r.get("text", ""))
                                              for r in idx.records).encode()).hexdigest()[:16]
            path = os.path.join(cache_dir, "vectors-%s-%s-%s.npy" % (embed_model.replace("/", "_"), name, digest))
            if os.path.exists(path):
                v = np.load(path)
            else:
                v = np.array(list(self.embed.embed([card(r) for r in idx.records], batch_size=64)), dtype=np.float32)
                v /= np.linalg.norm(v, axis=1, keepdims=True)
                np.save(path, v)
            self.vectors[name] = v

    def query_vector(self, query):
        v = self.np.array(list(self.embed.query_embed([query]))[0], dtype=self.np.float32)
        return v / self.np.linalg.norm(v)

    def rank(self, name, idx, query, qv, keyword, k, pool, audience=None):
        """Merge keyword and meaning rankings by rank position (RRF, k = 60), re-rank the best `pool`, keep k."""
        dense = self.np.argsort(-(self.vectors[name] @ qv))[:30]
        pos = {id(r): i for i, r in enumerate(idx.records)}
        score = {}
        for lst in ([pos[id(r)] for _, r in keyword], list(dense)):
            for rank, i in enumerate(lst):
                score[i] = score.get(i, 0) + 1 / (60 + rank)
        cands = [idx.records[i] for i in sorted(score, key=score.get, reverse=True)
                 if not audience or audience in idx.records[i].get("audience", [audience])][:pool]
        if not self.rerank or not cands:
            return [(score[pos[id(r)]], r) for r in cands[:k]]
        s = list(self.rerank.rerank(query, [card(r) for r in cands]))
        return sorted(zip(s, cands), key=lambda x: -x[0])[:k]


class Pack:
    def __init__(self, folder, embed_model=None, rerank_model=None, cache_dir="/srv/cache"):
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
        self.meaning = Meaning(self.indexes, embed_model, rerank_model, cache_dir) if embed_model else None

    @classmethod
    def from_env(cls, folder):
        """The pack as the service builds it, so the service, the scorers and the gate all measure the same search."""
        return cls(folder, os.environ.get("FA_EMBED_MODEL", "BAAI/bge-small-en-v1.5") or None,
                   os.environ.get("FA_RERANK_MODEL", "Xenova/ms-marco-MiniLM-L-6-v2") or None,
                   os.environ.get("FA_CACHE", "/srv/cache"))

    # How many records each list sends to the model, and how many candidates the re-ranker reads for it.
    SPLIT = (("form-knowledge", 4, 20), ("forms", 2, 10), ("questions", 2, 10))

    def search(self, query, audience=None):
        """How-to sections first, then a few whole forms and form questions; each list ranked by its own index.
        Returns (score, record) pairs; with a re-ranker the score is its relevance score (higher is closer)."""
        hits = []
        qv = self.meaning.query_vector(query) if self.meaning else None
        for name, k, pool in self.SPLIT:
            idx = self.indexes.get(name)
            if not idx:
                continue
            if self.meaning:
                keyword = idx.search(query, 30, audience)
                hits += self.meaning.rank(name, idx, query, qv, keyword, k, pool, audience)
            else:
                hits += idx.search(query, k, audience)
        return hits
