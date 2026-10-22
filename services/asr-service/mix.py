"""Merge an Amharic transcript and an English transcript of the same code-switched recording (no LLM).

Inputs are word lists with timings, one per engine:
  Amharic engine (wav2vec2): hears everything; writes English words phonetically in Ge'ez (malaria becomes ማላሪያ).
  English engine (Whisper, language=en): writes English words properly; skips or garbles the Amharic parts.

Rule: an English word replaces the Amharic-engine words spoken at the same moment only when
  1. Whisper is reasonably confident,
  2. it sounds like what the Amharic engine heard there (Ge'ez transliterated to Latin, compared by sound), and
  3. it is a real word of the EMR's own clinical vocabulary (concept and drug names, lexicon/emr-vocab.txt).
Rule 2 is the cross-check that stops Whisper's invented words: a made-up "free" or "to" does not sound like
the Amharic the other engine heard at that moment, so it is dropped. Rule 3 stops Whisper's other habit on
Amharic speech: spelling the Amharic in Latin letters ("Hulet" for ሁለት, "Zareem" for ዛሬ), which does sound
alike but is not an English word. Every output word comes from one of the two engines; nothing is generated.
"""
import os
import re
from dataclasses import dataclass

from rapidfuzz import fuzz

# Common English words Whisper produces when it hallucinates; never swapped in, even if in the vocabulary.
STOPWORDS = set("""a an and are as at be but by can do for from have he her him his i if in into is it its me my
no not of on or our she so than that the their them then there they this to too up us was we were what when
which who will with would you your like invite still just also very""".split())


def load_bigrams(path: str) -> frozenset[str]:
    """Two-word phrases from the EMR's concept names ("blood pressure"), one per line."""
    with open(path, encoding="utf-8") as f:
        return frozenset(line.strip() for line in f if line.strip())


def load_vocab(path: str) -> set[str]:
    """English words the merge may use: every word of the EMR's concept and drug names (lower-case)."""
    with open(path, encoding="utf-8", errors="ignore") as f:
        return {w for line in f for w in re.split(r"[^a-z0-9\-]+", line.lower()) if len(w) >= 2} - STOPWORDS


@dataclass
class Word:
    start: float
    end: float
    text: str
    prob: float = 1.0


# --- Ge'ez to Latin sounds (each syllable = consonant row + vowel order) ---------------------------------
_ROWS = {0x1200: "h", 0x1208: "l", 0x1210: "h", 0x1218: "m", 0x1220: "s", 0x1228: "r", 0x1230: "s", 0x1238: "sh",
         0x1240: "k", 0x1260: "b", 0x1268: "v", 0x1270: "t", 0x1278: "ch", 0x1280: "h", 0x1290: "n", 0x1298: "ny",
         0x12A0: "", 0x12A8: "k", 0x12B8: "h", 0x12C8: "w", 0x12D0: "", 0x12D8: "z", 0x12E0: "zh", 0x12E8: "y",
         0x12F0: "d", 0x1300: "j", 0x1308: "g", 0x1320: "t", 0x1328: "ch", 0x1330: "p", 0x1338: "ts", 0x1340: "ts",
         0x1348: "f", 0x1350: "p"}
_VOWELS = ["e", "u", "i", "a", "e", "", "o", "wa"]


def translit(s: str) -> str:
    out = []
    for ch in s:
        cp = ord(ch)
        if 0x1200 <= cp <= 0x137F:
            base = cp - (cp - 0x1200) % 8
            if base in _ROWS:
                out.append(_ROWS[base] + _VOWELS[(cp - 0x1200) % 8])
        elif ch.isascii() and ch.isalpha():
            out.append(ch.lower())
    return "".join(out)


def _sound(s: str) -> str:
    """Rough sound spelling, so English spelling and Ge'ez transliteration become comparable."""
    s = re.sub(r"[^a-z]", "", s.lower())
    for a, b in (("ph", "f"), ("ck", "k"), ("qu", "kw"), ("c", "k"), ("q", "k"), ("x", "ks"), ("v", "b"),
                 ("th", "t"), ("sh", "s"), ("ch", "s"), ("ts", "s"), ("z", "s"), ("j", "g"), ("y", "i"), ("w", "u")):
        s = s.replace(a, b)
    return re.sub(r"(.)\1+", r"\1", s)  # collapse doubled letters


def sounds_alike(english: str, geez: str) -> float:
    """0..1 similarity between an English word or phrase and Ge'ez text, by sound (vowels matter less)."""
    e, g = _sound(english), _sound(translit(geez))
    if not e or not g:
        return 0.0
    full = fuzz.ratio(e, g) / 100
    skeleton = fuzz.ratio(re.sub("[aeiou]", "", e), re.sub("[aeiou]", "", g)) / 100  # consonants only
    return max(full, 0.6 * full + 0.4 * skeleton)


def _overlap(a: Word, b: Word, slack: float = 0.12) -> float:
    return max(0.0, min(a.end, b.end + slack) - max(a.start, b.start - slack))


COMMON, MID = 3000, 7000  # word-frequency rank bands (see commonness)


def _confirmed(word: str, w: Word, others: list[Word], slack=0.4) -> bool:
    """Did a second English model hear (nearly) the same word at about the same time?"""
    for o in others:
        o_letters = re.sub(r"[^A-Za-z0-9\-]", "", o.text).strip("-").lower()
        if o_letters and fuzz.ratio(word.lower(), o_letters) >= 85 and _overlap(w, o, slack) > 0:
            return True
    return False


def merge(am: list[Word], en: list[Word], vocab: set[str], commonness=lambda w: 99999, bigrams=frozenset(),
          min_prob=0.35, min_sound=0.5, sure_prob=0.85, sure_sound=0.4, phrase_gap=0.4, confirm=None):
    """confirm: optional words from a second English model. When given, a common or mid-common word is only
    accepted if the second model heard the same word at the same moment (two models rarely invent the same
    word); rare clinical words still only need the lead model."""
    """Return (merged text, list of replacements made). See the module docstring for the rules.

    commonness(word) -> rank of the word in everyday English (lower = more common; Whisper's own vocabulary
    order is used). Real-voice tests showed wrong swaps are almost all everyday words ("general", "next"),
    so the more common a word, the more evidence it needs:
      rare (clinical)  rank >= 7000 : the basic rule (sounds alike, or Whisper very sure + fairly alike)
      mid              3000 to 7000 : sounds alike and Whisper reasonably sure
      very common      < 3000       : near-perfect sound match and Whisper sure
    A mid or common word that fails is still accepted when it sits right next to an accepted word and the two form
    a phrase found in the EMR's own concept names (bigrams: "blood pressure", "night sweats", "HIV test"; not
    "screening another").
    """
    cands = []  # one per English word that is in the vocabulary and overlaps Amharic words
    for w in en:
        letters = re.sub(r"[^A-Za-z0-9\-]", "", w.text).strip("-")
        short_ok = len(letters) == 2 and letters.isupper()  # TB, BP, ... but not "Na" heard for እና ("and")
        if (len(letters) < 3 and not short_ok) or w.prob < min_prob or letters.lower() not in vocab:
            continue
        idx = [i for i, a in enumerate(am) if _overlap(w, a) > 0]
        if not idx:
            continue
        # Compare with the best-matching run of the overlapping Amharic words, and replace only that run.
        score, best = 0.0, idx
        for i in range(len(idx)):
            for j in range(i, len(idx)):
                s = sounds_alike(letters, "".join(am[k].text for k in idx[i:j + 1]))
                if s > score:
                    score, best = s, idx[i:j + 1]
        rank = min(commonness(v) for v in {letters, letters.lower(), letters.capitalize()})  # "TV" vs "tv"
        basic = score >= min_sound or (w.prob >= sure_prob and score >= sure_sound)
        if rank >= MID:
            ok = basic
        elif rank >= COMMON:
            ok = score >= min_sound and w.prob >= 0.5
        else:
            ok = score >= 0.75 and w.prob >= 0.6
        voted = confirm is None or rank >= MID or _confirmed(letters, w, confirm)
        cands.append({"word": letters, "idx": best, "score": score, "ok": ok and voted, "w": w,
                      "phrase": score >= 0.3 and voted})

    # Phrase support: a word right next to an accepted word is accepted too, if together they are a phrase in the
    # EMR's concept names. Repeat so chains work ("fasting", then "blood", then "sugar").
    changed = True
    while changed:
        changed = False
        for k, c in enumerate(cands):
            if c["ok"] or not c["phrase"]:
                continue
            for n in (k - 1, k + 1):
                if not (0 <= n < len(cands) and cands[n]["ok"]):
                    continue
                first, second = (cands[n], c) if n < k else (c, cands[n])
                if second["w"].start - first["w"].end <= phrase_gap and \
                        f'{first["word"].lower()} {second["word"].lower()}' in bigrams:
                    c["ok"] = changed = True
                    break
    accepted = [(c["word"], c["idx"], c["score"]) for c in cands if c["ok"]]

    # Consecutive accepted English words that share or touch Amharic words become one phrase ("high fever").
    groups = []
    for word, idx, score in accepted:
        if groups and idx[0] <= groups[-1]["idx"][-1] + 1:
            g = groups[-1]
            g["words"].append(word)
            g["idx"] = sorted(set(g["idx"]) | set(idx))
            g["scores"].append(score)
        else:
            groups.append({"words": [word], "idx": list(idx), "scores": [score]})

    out, changes, i = [], [], 0
    for g in groups:
        out.extend(a.text for a in am[i:g["idx"][0]])
        replaced = " ".join(am[j].text for j in g["idx"])
        out.append(" ".join(g["words"]))
        changes.append({"amharic_engine": replaced, "english": " ".join(g["words"]),
                        "sound_match": round(min(g["scores"]), 2)})
        i = g["idx"][-1] + 1
    out.extend(a.text for a in am[i:])
    return " ".join(out), changes
