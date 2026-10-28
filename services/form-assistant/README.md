# form-assistant

Answers Form Studio questions ("why won't this form save?", "which forms record BMI?") from the Form Studio
knowledge pack, with a source for every sentence. It follows the `/v1/forms/ask` contract agreed with the AI service
team (schemaVersion 1.0), so that service can take the endpoint over unchanged.

## How an answer is made

1. Search picks up to 8 records from the pack: 4 how-to sections, 2 whole forms, 2 form questions. Keyword search
   and meaning search (`bge-small-en-v1.5`) are merged by rank, then a re-ranker (`ms-marco-MiniLM-L-6-v2`) orders
   the candidates. Both models are small and run on the CPU, so the shared graphics card is left to the language
   model. If even the closest record is far from the question, the service refuses without calling the model.
2. The language model (the shared Ollama, `qwen2.5:14b`) sees only those records, numbered K1 to K8. It must
   reply in a fixed JSON shape: a list of sentences, each with the numbers of the sources behind it.
3. Code then checks every sentence. A source number that was never sent is removed. A cited source that does not
   contain the sentence's key words is replaced by the record that does, or the sentence is dropped.
4. Questions about a particular patient are refused before the model is called.
5. A repeated question under the same pack is answered from memory, without the model.

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

Keep `/srv/cache` on a volume (`-v fa-cache:/srv/cache`): it holds the two search models (about 150 MB) and the
pack's vectors, which take about 6 minutes on 8 cores to build on the first start.

Settings are environment variables, listed at the top of `server.py` (`OLLAMA_URL`, `LLM_MODEL`, `FA_PACK`,
`FA_EMBED_MODEL`, `FA_RERANK_MODEL`, `FA_CACHE`, `FA_MIN_SCORE`, `FA_API_KEY`, `FA_MAX_TOKENS`, `FA_PORT`).

## Measure it

The held-out question set (`qa-golden.jsonl`) and the pack are not in this repository.

```
python eval_retrieval.py <pack folder> qa-golden.jsonl                 # search only, about 2 minutes, no model
python eval_answers.py qa-golden.jsonl http://localhost:8768 out.jsonl  # full answers, about 12 minutes
python gate.py search <pack folder> qa-golden.jsonl                    # fails if search falls below gate.json
python gate.py answers out.jsonl                                       # fails if answers fall below gate.json
```

Run the search gate on every change and the answer gate before a release. The floors in `gate.json` sit a few
points under the last accepted run; with 84 questions one question is 1.2 points, so smaller moves are noise.

Results on the 84 questions (77 answerable, 7 not):

| Measure | Keyword search (2026-10-27) | Keyword + meaning + re-ranker (2026-10-28) |
|---|---|---|
| Right record in the top 3 | 77.9 % | 90.9 % |
| Right record among the 8 sent | 87.0 % | 97.4 % |
| Answered or refused correctly | 94.0 % | 97.6 % |
| A right source cited | 76.6 % | 87.0 % |
| Must-mention phrases present | 48.7 % | 52.6 % |
| Time per answer, median and slowest 10 % | 7.8 s, 10.1 s | 8.9 s, 11.9 s |

Off-topic questions refused early take about 1 second, and a repeated question about 0.02 seconds.
