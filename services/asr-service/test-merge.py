"""Run the mixed (Amharic and English) pipeline on WAV files and show what each engine heard and what was merged.
Usage: .venv\\Scripts\\python test-merge.py [file.wav ...]   (default: the two test clips; works on saved recordings)
"""
import sys
import time

import soundfile as sf

import server  # loads both engines once
from mix import merge

files = sys.argv[1:] or ["test-audio/mixed-am-en.wav", "test-audio/consult-am.wav"]
for f in files:
    audio, rate = sf.read(f, dtype="float32")
    assert rate == 16000, f"{f}: expects 16 kHz audio"
    try:
        ref = open(f.replace(".wav", ".txt"), encoding="utf-8").read().strip()
    except OSError:
        ref = "(no reference script)"
    t = time.perf_counter()
    am_job = server.POOL.submit(server.amharic_words, audio)
    en_job = server.POOL.submit(server.english_words, audio, None)
    am, en = am_job.result(), en_job.result()
    text, changes = merge(am, en, server.VOCAB, server.commonness, server.BIGRAMS)
    took = time.perf_counter() - t
    print(f"\n######## {f} ({len(audio) / 16000:.1f}s audio, {took:.1f}s both engines + merge)")
    print("said:            ", ref.replace("D|", "").replace("P|", "").replace("\n", " "))
    print("Amharic engine:  ", " ".join(w.text for w in am))
    print("English engine:  ", " ".join(f"{w.text}({w.prob:.2f})" for w in en))
    print("MERGED:          ", text)
    for c in changes:
        print(f"   swapped  {c['amharic_engine']}  ->  {c['english']}   (sound match {c['sound_match']})")
    if not changes:
        print("   (no swaps)")
