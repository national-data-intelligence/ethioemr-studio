# asr-service: speech-to-text for the EMR's "Speak" button

The AI assistant's **Speak** button needs a speech-to-text service, and the EMR images don't include one. The assistant calls `ASR_SERVICE_URL` (default `http://localhost:8767`, set in the platform's `.env`), and the gateway allows that address in its security policy (`AI_CONNECT_SRC`). This folder is that service, run locally.

- `GET /health` returns `{"status": "ok", "model": "..."}`. The assistant then shows "Speech service ok" with the model name.
- `POST /transcribe` takes a form with `audio` (WAV) and `lang` (`en` or `am`) and returns `{"text", "model", "processing_time"}`.
- Audio never leaves the machine. Both engines run locally.

## Start it

```powershell
.\start-asr.ps1
```

The first run creates `.venv` and installs the Python packages (about 3 GB, mostly the speech libraries). The models (about 3.5 GB) download into the shared Hugging Face cache on first use. To reuse an existing environment instead, point `.venv` at it (for example `cmd /c mklink /J .venv <old>\asr-service\.venv`).

Leave the window open. In the EMR, open a patient chart, open the assistant (Alt+A), choose **Diagnosis Assistant** or **Form Filler**, then **Speak**. Allow the microphone, speak, and press **Stop**.

To speak Amharic, the assistant's `asrLanguage` setting must be `am`; the default is `en`. In the EMR, open **Implementer Tools** (the wrench icon, top right), then Configuration, `@palladium-ethiopia/esm-ai-assistant-app`, and set `asrLanguage` to `am`. This setting is stored in your browser only.

The English words allowed into Amharic transcripts come from the EMR's own dictionary (`lexicon/`). After the platform's first start, rebuild them with `python build-lexicon.py`, which reads the `ethioemr-platform-db-1` container.

## Mixed Amharic and English speech (default)

Doctors often mix English terms into Amharic ("ታካሚዋ high fever አለባት"). In `mixed` mode both engines run side by side on the same recording, and `mix.py` merges them word by word, without an LLM:

- The Amharic engine hears everything, but writes English words phonetically in Amharic letters (malaria becomes ማላሪያ).
- The English engine (Whisper) writes English words properly, and skips or garbles the Amharic.
- An English word replaces what the Amharic engine heard at the same moment only if all three hold:
  1. Whisper is reasonably sure;
  2. it sounds like what the Amharic engine heard;
  3. it is a real word in the EMR's clinical vocabulary (`lexicon\emr-vocab.txt`, about 29,000 words from concept and drug names).

Every output word comes from one of the two engines, so nothing is made up. The reply also lists each swap (`english_words_used`).

Try it on files with `.venv\Scripts\python test-merge.py [file.wav ...]`.

## Building a real test set

Run `.\start-asr.ps1 -SaveRecordings`, then dictate into **Speak** in the EMR. Each recording is saved to `recordings\` as a `.wav` (the audio) and a `.json` (what each engine heard and the merged text). Run `test-merge.py recordings\*.wav` to re-score them after any change. Use test dictations only, never real patient information.

## Which models, and why

| Language | Model | Result on our 15 s Amharic test consultation |
|---|---|---|
| Amharic | `agkphysics/wav2vec2-large-xlsr-53-amharic` (trained on Amharic speech) | 9% character errors, 3 s on CPU. Used. |
| Amharic | Whisper large-v3 | 90% character errors; its English "translation" was invented. Rejected. |
| English | Whisper `base` | Word-perfect on the synthetic test sentence, but dropped English medical words in real dictations. Replaced. |
| English | Whisper large-v3-turbo, confirmed by Whisper `small` | An everyday English word is kept only when both models hear it; EMR medical terms need only the lead model. Used (default). |

The test audio in `test-audio\` was made with Microsoft's Amharic neural voices. Real recorded speech will score differently.

## Settings

Environment variables read by `server.py`:

- `ASR_MODEL`: English Whisper model, default `mobiuslabsgmbh/faster-whisper-large-v3-turbo` (`start-asr.ps1 -EnglishModel`).
- `ASR_CONFIRM_MODEL`: second model that must agree, default `small`; empty to switch off (`-ConfirmModel`).
- `ASR_AM_MODE`: `mixed` or `transcribe` (`-AmharicMode`).
- `ASR_SAVE_DIR`: folder to save recordings in (`-SaveRecordings` sets it to `recordings\`).
- `ASR_DEVICE`: `auto`, `cuda` or `cpu`.
- `ASR_PORT`: default 8767.
