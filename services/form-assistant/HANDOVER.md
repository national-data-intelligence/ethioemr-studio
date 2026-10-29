# form-assistant: handover to the AI service team

This is the starting point for taking form-assistant forward. Read this page first, then `README.md` in the same
folder for the run and measure commands and the full results.

## In short

- form-assistant is the AI helper for Form Studio. The aim is a co-builder: the form builder says what they want,
  the helper writes the form code (questions, show and hide rules, calculations, warnings), runs the Form Studio
  Check, fixes what fails, and shows the change before anything is saved. Builders should not have to learn the
  form syntax.
- It follows the two contracts we agreed with you: `/v1/forms/ask` (the note of 2026-10-22, section 2) and
  `/v1/forms/draft` (section 3). It was built as its own small service so it would not touch the AI service. The
  plan is still that the AI service takes these endpoints over, unchanged, when you are ready.
- Status: `/v1/forms/ask` and the first drafting task, `draft-rule`, are built and measured. The other drafting
  tasks answer `501 not_implemented`. Nothing is in production; a test copy runs on the dev server.

## What works today

| Endpoint | What it does | How good it is (latest run) |
|---|---|---|
| `GET /health` | Model name, pack size | |
| `POST /v1/forms/ask` | Answers a form-building question from the knowledge pack, every sentence with a source | Right record in the top 3: 90.9 %. Answers or refuses correctly: 97.4 % and 100 %. Right source cited: 84.4 %. Slowest 10 %: 11.1 s |
| `POST /v1/forms/draft`, task `draft-rule` | Writes one show or hide rule, calculation, warning or hard limit for one question | 16 of 16 tuning cases and 8 of 8 held-out cases work on every sample answer. Median about 3.5 s |

The one rule that must not change: **the model drafts, the Check decides.** A draft with Check errors is never
returned. After one retry with the findings, the caller gets `422 draft_failed_check` with the findings. If the
Check cannot run, the caller gets `503 check_unavailable`, never an unchecked draft.

## The files

| File | What it does |
|---|---|
| `server.py` | The FastAPI app: both endpoints, the request guard (API key, size limit, patient data refusal), the shared model call `llm_json()`, the answer cache. Settings are environment variables listed at the top |
| `retrieval.py` | Search over the pack: keyword search (BM25) and meaning search (`bge-small-en-v1.5`) merged by rank, then a re-ranker (`ms-marco-MiniLM-L-6-v2`). All on the CPU, so the GPU stays free for the language model |
| `drafting.py` | `draft-rule`: the prompt, the call to the Check, the one retry |
| `eval_retrieval.py`, `eval_answers.py`, `eval_drafts.py` | Score search, answers and drafts against test sets |
| `probe_rule.mjs` | Runs a drafted rule on sample answers, so "works" means it behaves as asked, not only that it compiles |
| `gate.py`, `gate.json` | The quality gate: fails if any score falls below its floor in `gate.json` |
| `Dockerfile` | Python 3.12 plus the `node` binary, which the Check needs |

## What is not in this repository, and how to get it

The service needs three things that live outside git. The test sets are shared on the dev server; ask Abenezer
for the other two.

| Thing | Why it is not in git | Where it is now |
|---|---|---|
| The Form Studio knowledge pack (13,470 records: 1,435 how-to sections, 368 forms, 11,656 questions) | Large generated data | Dev server `~/work/knowledge/fs-knowledge-pack-2026-10-22/` (Abenezer's user). Mount it at `/srv/pack` |
| The command-line Check, `check-form.js` (0.1.1) | Built from Form Studio's own Check; kept with the Form Studio tools for now | Dev server `~/work/tools/check-form/`. Mount it at `/srv/check-form` |
| The test sets: `qa-golden.jsonl` (84 questions), `drafts-golden.json` (16), `drafts-holdout.json` (8) | Held out, so the prompts are not tuned to the answers | Dev server `/opt/form-assistant-tests/`, readable by the `docker` group. Keep them out of git and out of prompts |

## Run it

```
docker build -t ethioemr-form-assistant:dev services/form-assistant
docker run -d --name form-assistant-dev -p 127.0.0.1:8768:8768 --cpus 8 \
  -v fa-cache:/srv/cache \
  -v <pack folder>:/srv/pack:ro \
  -v <folder with check-form.js>:/srv/check-form:ro \
  ethioemr-form-assistant:dev
curl localhost:8768/health
```

The language model is the shared Ollama at `http://172.16.0.4:11434`, model `qwen2.5:14b` (`OLLAMA_URL`,
`LLM_MODEL`). The first start builds the pack's vectors, about 6 minutes on 8 cores; keep `/srv/cache` on a volume
so later starts are fast.

Two quick checks, with what to expect:

```
curl -s -X POST localhost:8768/v1/forms/ask -H "Content-Type: application/json" \
  -d '{"question":"Which forms record BMI?"}'
# expect "answerable": true, the Central Triage Form and Anthropometric Measurements, each with a K source

curl -s -X POST localhost:8768/v1/forms/draft -H "Content-Type: application/json" -d @request.json
# request.json: {"task":"draft-rule","instruction":"Show this only for women aged 15 to 49",
#                "form":{...the form from drafts-golden.json...},"targetQuestionId":"ancVisit"}
# expect "behaviour": "hide" and an expression like sex !== 'F' || age < 15 || age > 49
```

## Check a change before it goes in

Run the search gate on every change (about 2 minutes, no model). Run the answer gate and the drafts gate before a
release (about 15 minutes; restart the service first so the answer cache is empty). The commands are in
`README.md` under "Measure it". With 84 questions one question is 1.2 points, and the model words its answers a
little differently on each run, so a move of two questions or less is noise. "Right source cited" is the closest to
its floor (84.4 against 83), so watch it.

## What to build next, in order

1. **Try `draft-rule` on real shipped forms.** So far it has only been tested on a synthetic 19-question form. Real
   forms have long question lists, so watch the prompt size and the speed.
2. **Grow the drafting tests** toward about 60 cases, with instructions written by real form builders.
3. **`add-question`**: find a matching existing question and concept among the pack's 11,656 questions (reuse
   first), write the question, place it in the form, run the whole-form Check (`check-form --stdin`) and repair.
   No invented concepts, and no drug or ICD-11 diagnosis concepts.
4. **`fix-form`** ("why won't this save?"): run the whole-form Check on the builder's form, explain each finding,
   propose a fix, check again.
5. **The Form Studio button**: "Ask AI to write this rule" in the Rules window, showing the plain sentence and the
   Check result, and applying the rule only when the builder accepts.

Each new task gets its own test cases and a gate, the same way `draft-rule` did.

## Known limits

- Form Studio's Rules window cannot edit every rule the helper writes: hard limits, a sex condition combined with
  an answer, or two ticked answers in one rule. Those rules still work; Form Studio shows them as written by hand.
- One test case is too strict: "Which forms record BMI?" expects a single form question, but the helper correctly
  cites two whole forms. The case should be widened.
- `/v1/forms/ask` does not have its own Amharic test set yet; `language: "am"` only asks the model to answer in
  Amharic.

## Decisions still open

- Whether the AI service takes these endpoints over, or calls form-assistant as its own service.
- Whether `check-form.js` is added to this repository or stays mounted from outside.
- Where the knowledge pack and the test sets live long term, and who refreshes the pack when forms change.

Contact: Abenezer Tesfaye Alaro.
