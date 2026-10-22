"""asr-service: the local speech-to-text service the EthioEMR AI assistant's "Speak" button calls.

Contract (read from the assistant's frontend code):
  GET  /health      -> {"status": "ok", "model": "..."}
  POST /transcribe  multipart form: audio=<speech.wav>, lang="en"|"am", prompt=<optional hint>
                    -> {"text": "...", "model": "...", "processing_time": 1.23}
                    errors -> HTTP 4xx/5xx with {"detail": "..."}
Audio never leaves this machine: both models run locally.

Engines:
  English  Whisper (faster-whisper), GPU when available.
  Amharic  agkphysics/wav2vec2-large-xlsr-53-amharic: an Amharic-trained model (~9% character errors on our
           test; Whisper's own Amharic was gibberish and its Amharic to English translation was invented).

Settings (environment variables):
  ASR_MODEL     Whisper model for English (lead)                (default faster-whisper-large-v3-turbo)
  ASR_CONFIRM_MODEL  second Whisper model; in mixed mode an everyday English word is only used if both
                models heard it (stops invented words). Default small; empty = off.
  ASR_AM_MODE   what Amharic speech ("lang=am") returns:
                  mixed      : Amharic text, with English words (often medical terms) written in English, by
                                merging both engines word by word; see mix.py (default)
                  transcribe : Amharic engine only
  ASR_SAVE_DIR  if set, save every recording and what each engine heard to this folder (for building a test set;
                synthetic test data only, never real patients)
  ASR_DEVICE    auto | cuda | cpu (Whisper)                     (default auto)
  ASR_PORT      port to listen on                               (default 8767, the platform's ASR_SERVICE_URL)
"""
import glob
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

# Log Amharic text safely: the Windows console defaults to a Western-only code page.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Windows: let CTranslate2 find the cuBLAS/cuDNN DLLs installed by the nvidia-* pip packages.
for d in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
    os.add_dll_directory(d)
    os.environ["PATH"] = d + os.pathsep + os.environ["PATH"]

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

from mix import Word, load_bigrams, load_vocab, merge

MODEL_NAME = os.environ.get("ASR_MODEL", "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
CONFIRM_NAME = os.environ.get("ASR_CONFIRM_MODEL", "small")  # second English model that confirms common words ("" = off)
AM_MODE = os.environ.get("ASR_AM_MODE", "mixed")
AM_W2V = "agkphysics/wav2vec2-large-xlsr-53-amharic"
SAVE_DIR = os.environ.get("ASR_SAVE_DIR")
WANT_DEVICE = os.environ.get("ASR_DEVICE", "auto")

app = FastAPI(title="EthioEMR asr-service")
# The EMR page (http://localhost:18200) calls this from the browser, so allow local origins.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def short(name: str) -> str:
    return name.split("/")[-1].replace("faster-whisper-", "")


def load_whisper():
    """GPU first (float16), CPU fallback (int8)."""
    tries = [("cuda", "float16"), ("cpu", "int8")] if WANT_DEVICE == "auto" else \
        [(WANT_DEVICE, "float16" if WANT_DEVICE == "cuda" else "int8")]
    for device, compute in tries:
        try:
            model = WhisperModel(MODEL_NAME, device=device, compute_type=compute)
            segs, _ = model.transcribe(np.zeros(16000, dtype=np.float32), language="en")
            list(segs)  # warm-up; faster-whisper is lazy, so consume the result to prove the device really works
            print(f"asr-service: English = whisper-{MODEL_NAME} on {device} ({compute})", flush=True)
            return model, device
        except Exception as e:  # noqa: BLE001
            print(f"asr-service: {device} not usable: {e}", flush=True)
    raise RuntimeError("No usable device for the speech model")


WHISPER, DEVICE = load_whisper()
CONFIRM = WhisperModel(CONFIRM_NAME, device=DEVICE, compute_type="float16" if DEVICE == "cuda" else "int8") if CONFIRM_NAME else None
if CONFIRM:
    print(f"asr-service: confirming English model = whisper-{CONFIRM_NAME}", flush=True)
W2V_PROC, W2V = Wav2Vec2Processor.from_pretrained(AM_W2V), Wav2Vec2ForCTC.from_pretrained(AM_W2V).eval()
W2V_FRAME = W2V.config.inputs_to_logits_ratio / 16000  # seconds per output frame (20 ms)
print(f"asr-service: Amharic = {AM_W2V} on CPU; Amharic mode: {AM_MODE}", flush=True)
if SAVE_DIR:
    os.makedirs(SAVE_DIR, exist_ok=True)
    print(f"asr-service: saving recordings to {os.path.abspath(SAVE_DIR)}", flush=True)
POOL = ThreadPoolExecutor(max_workers=3)  # run the engines side by side
LEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lexicon")
VOCAB = load_vocab(os.path.join(LEX, "emr-vocab.txt"))
BIGRAMS = load_bigrams(os.path.join(LEX, "emr-bigrams.txt"))  # two-word phrases from EMR concept names
print(f"asr-service: English words allowed into Amharic text: {len(VOCAB)} (EMR clinical vocabulary)", flush=True)


def commonness(word: str) -> int:
    """How common a word is in everyday English: its position in Whisper's vocabulary (built most-common-first)."""
    ids = WHISPER.hf_tokenizer.encode(" " + word, add_special_tokens=False).ids
    return ids[0] if len(ids) == 1 else 99999  # split into pieces = rare word


def load_audio(raw: bytes) -> np.ndarray:
    data, rate = sf.read(io.BytesIO(raw), dtype="float32", always_2d=True)
    mono = data.mean(axis=1)
    if rate != 16000:  # simple linear resample; the browser already sends 16 kHz WAV in practice
        n = int(len(mono) * 16000 / rate)
        mono = np.interp(np.linspace(0, len(mono) - 1, n), np.arange(len(mono)), mono).astype(np.float32)
    return mono


def amharic_words(audio: np.ndarray) -> list[Word]:
    """Amharic engine: words with timings and confidence (mean of the frames' top probability)."""
    with torch.no_grad():
        logits = W2V(W2V_PROC(audio, sampling_rate=16000, return_tensors="pt").input_values).logits[0]
    probs = logits.softmax(-1).max(-1).values
    out = W2V_PROC.tokenizer.decode(logits.argmax(-1), output_word_offsets=True)
    return [Word(w["start_offset"] * W2V_FRAME, (w["end_offset"] + 1) * W2V_FRAME, w["word"],
                 probs[w["start_offset"]:w["end_offset"] + 1].mean().item()) for w in out.word_offsets]


def english_words(audio: np.ndarray, prompt: str | None = None, model=None) -> list[Word]:
    """English engine: Whisper words with timings and probability."""
    segments, _ = (model or WHISPER).transcribe(audio, language="en", initial_prompt=prompt, beam_size=5, vad_filter=True,
                                     word_timestamps=True, condition_on_previous_text=False)
    words, seen = [], set()
    for s in segments:
        key = s.text.strip().lower()
        if key in seen:  # Whisper's looping hallucination repeats whole sentences; keep only the first
            continue
        seen.add(key)
        words += [Word(w.start, w.end, w.word.strip(), w.probability) for w in s.words]
    return words


def save(raw: bytes, lang: str, result: dict):
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    with open(os.path.join(SAVE_DIR, f"{stamp}-{lang}.wav"), "wb") as f:
        f.write(raw)
    with open(os.path.join(SAVE_DIR, f"{stamp}-{lang}.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)


@app.get("/health")
def health():
    return {"status": "ok", "model": f"whisper-{short(MODEL_NAME)} ({'GPU' if DEVICE == 'cuda' else 'CPU'}) + wav2vec2-amharic",
            "languages": ["en", "am"], "amharic_mode": AM_MODE, "saving_recordings": bool(SAVE_DIR)}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), lang: str = Form("en"), prompt: str | None = Form(None)):
    if lang not in ("en", "am"):
        raise HTTPException(400, f'Unsupported language "{lang}". Use "en" or "am".')
    raw = await audio.read()
    try:
        samples = load_audio(raw)
    except Exception as e:  # noqa: BLE001 - report any decode problem to the UI
        raise HTTPException(400, f"Could not read the audio: {e}")
    start = time.perf_counter()
    detail = {}
    if lang == "en":
        en = english_words(samples, prompt)
        text, model = " ".join(w.text for w in en), f"whisper-{short(MODEL_NAME)}"
    elif AM_MODE == "transcribe":
        am = amharic_words(samples)
        text, model = " ".join(w.text for w in am), "wav2vec2-amharic"
    else:  # mixed: both engines at once, then the word-by-word merge
        am_job = POOL.submit(amharic_words, samples)
        en_job = POOL.submit(english_words, samples, None)
        cf_job = POOL.submit(english_words, samples, None, CONFIRM) if CONFIRM else None
        am, en = am_job.result(), en_job.result()
        confirm = cf_job.result() if cf_job else None
        text, changes = merge(am, en, VOCAB, commonness, BIGRAMS, confirm=confirm)
        model = f"wav2vec2-amharic + whisper-{short(MODEL_NAME)}" + (f" (+{short(CONFIRM_NAME)} vote)" if CONFIRM else "")
        detail = {"amharic_engine": " ".join(w.text for w in am), "english_engine": " ".join(w.text for w in en),
                  "english_words_used": changes}
    took = round(time.perf_counter() - start, 2)
    print(f"asr-service: {lang} {len(samples) / 16000:.1f}s audio -> {took}s: {text[:120]!r}", flush=True)
    result = {"text": text, "model": model, "processing_time": took, "language": lang, **detail}
    if SAVE_DIR:
        save(raw, lang, result)
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("ASR_PORT", "8767")))
