"""Rebuild the speech service's English medical vocabulary from the EMR's own dictionary.

Writes lexicon/emr-vocab.txt (single words) and lexicon/emr-bigrams.txt (two-word phrases) from the English
concept names (fully specified and short) and drug names. mix.py only lets an English word into an Amharic
transcript if it is in this vocabulary (see README "Mixed Amharic and English speech").

Usage (platform stack running):  python build-lexicon.py [--container ethioemr-platform-db-1]
"""
import argparse
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
SQL = ("SELECT DISTINCT LOWER(name) FROM concept_name WHERE locale='en' AND voided=0 "
       "AND concept_name_type IN ('FULLY_SPECIFIED','SHORT') "
       "UNION SELECT DISTINCT LOWER(name) FROM drug WHERE retired=0;")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--container", default="ethioemr-platform-db-1")
    ap.add_argument("--user", default="openmrs")
    ap.add_argument("--password", default="openmrs")
    a = ap.parse_args()
    raw = subprocess.run(["docker", "exec", a.container, "mysql", f"-u{a.user}", f"-p{a.password}", "openmrs", "-N", "-e", SQL],
                         capture_output=True, check=True).stdout.decode("utf-8", errors="ignore")
    terms = [t for t in raw.splitlines() if t.strip()]
    words, pairs = set(), set()
    for t in terms:
        ws = [w for w in re.split(r"[^a-z0-9\-]+", t.lower()) if w]
        words.update(w for w in ws if len(w) >= 2 and not w.isdigit())
        pairs.update(f"{x} {y}" for x, y in zip(ws, ws[1:]))
    (HERE / "lexicon").mkdir(exist_ok=True)
    (HERE / "lexicon" / "emr-vocab.txt").write_text("\n".join(sorted(words)) + "\n", encoding="utf-8")
    (HERE / "lexicon" / "emr-bigrams.txt").write_text("\n".join(sorted(pairs)) + "\n", encoding="utf-8")
    print(f"{len(terms)} EMR terms -> {len(words)} words, {len(pairs)} two-word phrases (lexicon/)")


if __name__ == "__main__":
    main()
