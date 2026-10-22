# Demo runbook

How to prepare and run a live demo of the platform: Form Studio, then the AI assistant. All timings below were measured on this machine on 2026-10-22.

## 1. The day before

1. Start everything:
   - `.\platform.ps1 up`, about 3.5 min;
   - `services\asr-service\start-asr.ps1` in its own window; the models take about 1 min to load.
2. Run `.\platform.ps1 demo-check full`, about 45 min. Expect "All demo checks passed".
   - The service checks: containers, login, both modules in the app list, AI config, the AI service, the speech service, the demo patient.
   - The browser walk-through: 8 steps; screenshots go to `work\demo-check\<time>\`.
   - Form Studio: 100 unit tests and 43 browser tests.
3. If the demo patient is missing, run `node tools\demo-video\setup-demo-data.mjs --with-vitals`. This creates the synthetic patient Almaz Bekele with an open visit and triage vitals.

## 2. Thirty minutes before

1. Run `.\platform.ps1 demo-check`, about 4 min. All 8 browser steps must pass.
2. Open Chrome at http://localhost:18200/openmrs/spa, log in as `admin` with password `Admin123`, and choose **Main Pharmacy**.
3. **Close the red "Some modules have unresolved backend dependencies" pop-up** on every page where it appears (the X at its top right).
   - It comes from the team build, not from our modules.
   - It covers the chart's right-hand buttons.
   - It takes keyboard focus: typing while it is open presses its **View modules** button.
4. Open Form Studio's **Concept dictionary** once and leave that tab open. The first read of about 85,000 concepts takes 12 to 25 minutes.
5. Close other programs that use the GPU. The speech models run on it.

## 3. The demo script

### Part A: Form Studio (about 6 min)

| Step | Click | What the audience sees |
|---|---|---|
| A1 | App menu (grid icon, top right), then **Form Studio** | Start page: three ways to make a form, and the table of 300 forms |
| A2 | Type "gynecology" in the table search | The list narrows to matching forms |
| A3 | **Edit schema** on "Emergency Triage Form - Gynecology" | Editor: **Preview & edit**, **Rules**, **Schema editor** on the left, the live form preview on the right |
| A4 | Pencil on a section, rename it | The new name shows in the preview and in the JSON |
| A5 | Open the rules for the question **PV** and set "Only when Vaginal Bleeding is Yes" | The rule is written as a plain sentence under PV, and the preview shows PV only after Vaginal Bleeding = Yes |
| A6 | **Check concepts on the server** | A counter, then **Concepts checked**, 0 errors; **Download content files** becomes available |
| A7 | Back on the start page: **Use the Excel template**, **Download a filled example**, then upload it | 9 pages, 23 sections, 160 questions, with the show-if rules from the sheet; its Check shows 1 error under **Must fix before export** (a Na+ question uses a Drug form) |
| A8 | The dictionary tab, search "weight (kg)" | Weight (kg) first, with its synonyms and the forms that use it |

### Part B: AI assistant (about 6 min)

Open the patient chart: search "Almaz Bekele", then open her chart. Then click the round blue button at the bottom right (or press Alt+A).

| Step | Click | Wait | What the audience sees |
|---|---|---|---|
| B1 | **Help & Search**, type "danger signs of severe malaria", **Ask: answer from these results** | 15 to 30 s | An answer with **Sources:** naming the guideline and page |
| B2 | Close the panel. Click the clinical forms icon on the right edge, then **Central Triage Form**. Open the assistant, choose **Form Filler**, then **Whole form**, type "BP 130/85, temp 38.2, pulse 96, weight 62 kg, height 160 cm", then **Find values** | about 50 s | "Found 6 values"; **Insert accepted** puts them in the form. Do not save. |
| B3 | Assistant, **Diagnosis Assistant**, complaint "fever and headache for 3 days", **Speak**, talk in Amharic (with English medical words), stop | 7 to 30 s | The transcript appears in Amharic script, with English terms kept in English. It is transcription only, not translation. |
| B4 | **Suggest differential** | about 30 s | A differential with the chart records it used and guideline references. Nothing is written to the chart. |

## 4. If something fails

| What you see | What to do |
|---|---|
| "AI service not reachable at https://emr-ai..." | Press **Retry** once. The remote service runs one model on one GPU, and it timed out once on 2026-10-22 while other test traffic was running. If Retry fails, run `curl.exe -k https://emr-ai.20.84.70.78.nip.io/health` and tell Bini. |
| Speak says the speech service is not available | Start `services\asr-service\start-asr.ps1` and wait about 1 min for "Uvicorn running". |
| Implementer Tools opened by itself | The red pop-up had focus. Close Implementer Tools and close the pop-up. |
| A page stays blank | Reload. If it persists, run `.\platform.ps1 status` (all four containers should be running). |
| Browser warning about the AI service certificate | Open https://emr-ai.20.84.70.78.nip.io/health once in the same browser and accept it. This goes away once the AI service has a trusted certificate (with Bini). |

## 5. What is tested, and what is not

| Feature | Automated check | Last result (2026-10-22) |
|---|---|---|
| Form Studio (Part A) | 43 browser tests and 100 unit tests | all passed |
| Form Builder 3.5.1 list | demo-check | passed |
| Help & Search, Form Filler, Speak, Diagnosis | demo-check browser steps | passed 8 of 8; Diagnosis failed once with "not reachable" while the service was under load, and passed on the next run |
| Form Studio export to `content/` | unit tests only | passed; no browser test yet |
| Saving a filled form | not checked on purpose | the demo does not save |

The AI assistant bundle was built for app shell 9.x and runs on 10.0.1 here. The single-spa "mount timeout" warning in the console is expected until Bini rebuilds it for 10.x.
