# form-assistant

Answers Form Studio questions ("why won't this form save?", "which forms record BMI?") from the Form Studio
knowledge pack, with a source for every sentence. It follows the `/v1/forms/ask` contract agreed with the AI service
team (schemaVersion 1.0), so that service can take the endpoint over unchanged.

## How an answer is made

1. Keyword search picks up to 8 records from the pack: 4 how-to sections, 2 whole forms, 2 form questions.
2. The language model (the shared Ollama, `qwen2.5:14b`) sees only those records, numbered K1 to K8. It must
   reply in a fixed JSON shape: a list of sentences, each with the numbers of the sources behind it.
3. Code then checks every sentence. A source number that was never sent is removed. A cited source that does not
   contain the sentence's key words is replaced by the record that does, or the sentence is dropped.
4. Questions about a particular patient are refused before the model is called.

No patient data is accepted, and nothing is written anywhere: the service only reads the pack.

## Run it

```
docker build -t ethioemr-form-assistant:dev services/form-assistant
docker run -d --name form-assistant-dev -p 127.0.0.1:8768:8768 \
  -v <pack folder>:/srv/pack:ro ethioemr-form-assistant:dev
curl localhost:8768/health
curl -X POST localhost:8768/v1/forms/ask -H "Content-Type: application/json" \
  -d '{"question": "How do I start a new form from a paper form?"}'
```

Settings are environment variables, listed at the top of `server.py` (`OLLAMA_URL`, `LLM_MODEL`, `FA_PACK`,
`FA_API_KEY`, `FA_MAX_TOKENS`, `FA_PORT`).

## Measure it

The held-out question set (`qa-golden.jsonl`) and the pack are not in this repository.

```
python eval_retrieval.py <pack folder> qa-golden.jsonl               # search only, seconds, no model
python eval_answers.py qa-golden.jsonl http://localhost:8768 out.jsonl  # full answers, about 11 minutes
```

First full run, 2026-10-27, 84 questions (77 answerable, 7 not):

| Measure | Result |
|---|---|
| Answered when it should | 94.8 % |
| Refused when it should | 85.7 % (the miss was a patient question, now refused by code) |
| A right source cited | 76.6 % |
| Must-mention phrases present | 48.7 % |
| Time per answer | median 7.8 s, slowest 15.9 s |
| Search alone | right record in the top 3 for 77.9 %, top 6 for 85.7 %, 23 ms |
