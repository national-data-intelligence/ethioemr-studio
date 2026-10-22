# Demo videos

Two narrated, subtitled videos, recorded automatically from the running platform (http://localhost:18200/openmrs/spa).

| Video | Length | What it shows |
|---|---|---|
| `out/ethioemr-platform-demo.mp4` | 2:28 | Form Studio (open a form, edit it, add a rule, run the Check), then the AI assistant: Help & Search with sources, Speak in Amharic, and the Diagnosis Assistant's differential. |
| `out/form-studio-guide.mp4` | 3:31 | A guide for form builders: the Form Studio start page, editing sections, questions and rules, the Check, a new form from an Excel template, and the concept dictionary. |

Both are 1920x1080 with an English voice and burned-in subtitles. The same subtitles are in the matching `.srt` file next to each video.

## Rebuild

One time, in this folder:

```powershell
npm install
npx playwright install chromium
pip install edge-tts
```

Before recording, the platform must be running with Form Studio and the AI assistant in the overlay (see the root README). Then, from this folder:

| Step | Platform demo | Form Studio guide |
|---|---|---|
| Demo data | `node setup-demo-data.mjs --with-vitals` | not needed |
| Speech service | `..\..\services\asr-service\start-asr.ps1` in its own window | not needed |
| 1. Voice | `python tts.py platform` | `python tts.py fs` |
| 2. Record | `node record-platform.mjs` | `node record-fs.mjs` |
| 3. Assemble | `node build.mjs platform` | `node build.mjs fs` |

`setup-demo-data.mjs` creates the synthetic patient Almaz Bekele with an open outpatient visit and a provider record `DEMO-001` for the admin user. With `--with-vitals` it also saves a triage encounter for the Diagnosis scene. It is safe to run again, and it writes the patient's id to `build/demo.json`, which `record-platform.mjs` reads. Set `EMR_URL` to record from another EMR.

## How it works

- `storyboard-platform.json` and `storyboard-fs.json` hold every narration line, in order. The narration is baked into the published videos, so change it only when you mean to rebuild them.
- `tts.py <cut>` turns each line into a clip with a Microsoft neural voice (`edge-tts`) and writes them to `build/audio-<cut>/`.
- `record-platform.mjs` and `record-fs.mjs` use Playwright to click through the real EMR, one scene per narration line, with the shared helpers in `rec-lib.mjs`. Page loads become jump cuts and long AI waits are marked for fast-forward. The platform demo plays `services/asr-service/test-audio/consult-am.wav` through a virtual microphone and shows `rag.html` as a short diagram. Nothing is saved to the chart or exported to `content/`.
- `build.mjs <cut>` uses ffmpeg to speed up the waits (with an on-screen real-time counter), place each voice clip and burn in the subtitles. It writes the `.mp4` and `.srt` to `out/`.

AI answers vary between runs. If a take looks wrong, record and assemble that cut again.

The dictionary scene in the Form Studio guide is quick when Form Studio's browser tests have saved a copy of the dictionary in `work/e2e/`. Without it, the scene reads the dictionary from the database, which is much slower.
