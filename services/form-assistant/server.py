"""form-assistant: answers Form Studio questions from the Form Studio knowledge pack, with citations.

Contract: POST /v1/forms/ask as agreed with the AI service team (docs: forms-ask.schema.json, schemaVersion 1.0), so
the AI service can take this endpoint over unchanged later.
  GET  /health         -> {"status": "ok", "model": "...", "pack": {...}}
  POST /v1/forms/ask   {"question": "...", "audience": "form-builder", "language": "en", "context": {...}}
                       -> {"answer": "... [K1]", "answerable": true, "citations": [...], "relatedForms": [...], ...}
                       errors -> {"error": {"code": "...", "message": "..."}}

How an answer is made:
  1. Search (retrieval.py) picks up to 8 records: how-to sections, whole forms, form questions. Keyword and meaning
     search are merged, then a re-ranker orders the candidates; all of it runs on the CPU.
  2. The model gets only those records, numbered K1..K8, plus the pack's "must" rules, and answers in JSON.
  3. Code keeps only [K#] markers that point at a record it sent, and lists exactly those as citations. An answer
     the model marks unanswerable, or one left with no valid marker, comes back with answerable=false.
Form knowledge only: no clinical guidelines, and no patient data (requests with patient-shaped fields are refused).

Settings (environment variables):
  FA_PACK          knowledge pack folder (manifest.json + records/*.jsonl)   (default /srv/pack)
  FA_EMBED_MODEL   meaning-search model, CPU; empty = keyword search only    (default BAAI/bge-small-en-v1.5)
  FA_RERANK_MODEL  re-ranker, CPU; empty = no re-ranking                     (default Xenova/ms-marco-MiniLM-L-6-v2)
  FA_CACHE         folder for downloaded models and pack vectors (keep it on a volume)  (default /srv/cache)
  OLLAMA_URL       the shared Ollama server                                  (default http://172.16.0.4:11434)
  LLM_MODEL        model name                                                (default qwen2.5:14b)
  FA_MIN_SCORE     refuse before calling the model when the best re-ranker score is below this; empty = off.
                   -6 sits under every answerable test question (lowest -4.0) and above the clearly off-topic
                   ones (-6.9 to -8.4)                                     (default -6)
  FA_MAX_TOKENS    longest answer the model may write; on the T4 time grows with every word  (default 350)
  FA_API_KEY       if set, callers must send "Authorization: Bearer <key>"   (default empty: no key)
  FA_PORT          port to listen on                                         (default 8768)
"""
import asyncio
import json
import os
import re
import time
import uuid
from collections import OrderedDict

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from retrieval import Pack, words

PACK = Pack.from_env(os.environ.get("FA_PACK", "/srv/pack"))
LLM_URL = os.environ.get("OLLAMA_URL", "http://172.16.0.4:11434").rstrip("/")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen2.5:14b")
MAX_TOKENS = int(os.environ.get("FA_MAX_TOKENS", "350"))
# Below this re-ranker score the closest record is too far from the question: refuse without calling the model.
MIN_SCORE = float(os.environ.get("FA_MIN_SCORE", "-6")) if os.environ.get("FA_MIN_SCORE", "-6") != "" else None
# Ollama holds the model to this shape while it writes, so the reply always parses. Each sentence carries its own
# source numbers: the model cannot leave citations out, and code can drop any sentence without a real source.
# The model writes in this order: the sentences first, then its judgement on whether they answer the question.
ANSWER_SCHEMA = {"type": "object", "required": ["sentences", "answerable"], "properties": {
    "sentences": {"type": "array", "items": {"type": "object", "required": ["text", "sources"], "properties": {
        "text": {"type": "string"}, "sources": {"type": "array", "items": {"type": "integer"}}}}},
    "answerable": {"type": "boolean"}}}
API_KEY = os.environ.get("FA_API_KEY", "")
DISCLAIMER = ("AI-generated help from the Form Studio knowledge base. It may be wrong or out of date: check the cited "
              "sources, and run the Check before shipping a form.")
MUST_RULES = [r for r in PACK.rules if r.get("severity") == "must"]
print("form-assistant: pack %s, %d records; model %s at %s" % (PACK.manifest.get("pack_id", PACK.folder), PACK.count,
                                                                 LLM_MODEL, LLM_URL), flush=True)

# Keys that only belong in patient data. The contract forbids unknown keys anyway; this names the reason.
PATIENT_KEYS = {"patient", "patientuuid", "patientid", "mrn", "obs", "encounter", "encounters", "records", "chart",
                "vitals", "identifier", "identifiers", "dob", "birthdate", "phone", "address"}

# Questions about a particular patient's care. Form Studio help never answers them, whatever the sources say.
PATIENT_QUESTION = re.compile(r"\b(my|this|our) (patient|client|child|baby|mother)\b(?!'s)"
                              r"|\bshould i (refer|treat|admit|prescribe|give)\b", re.I)
PATIENT_REFUSAL = ("Form Studio help answers questions about building forms only. For questions about a patient, use "
                   "the patient chart and the clinical guidelines.")

app = FastAPI(title="form-assistant", version="0.1.0")


class Context(BaseModel):
    model_config = ConfigDict(extra="forbid")
    formUuid: str | None = None
    questionId: str | None = None
    screen: str | None = Field(None, max_length=100)
    checkFindings: list[str] | None = Field(None, max_length=20)


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(..., min_length=3, max_length=2000)
    audience: str = Field("form-builder", pattern="^(clinician|form-builder|maintainer)$")
    language: str = Field("en", pattern="^(en|am)$")
    context: Context | None = None
    maxCitations: int = Field(5, ge=1, le=8)


def error(status, code, message):
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def has_patient_keys(value):
    if isinstance(value, dict):
        return any(k.lower().replace("_", "") in PATIENT_KEYS or has_patient_keys(v) for k, v in value.items())
    if isinstance(value, list):
        return any(has_patient_keys(v) for v in value)
    return False


@app.middleware("http")
async def guard(request: Request, call_next):
    if request.url.path.startswith("/v1/"):
        if API_KEY and request.headers.get("authorization", "") != "Bearer " + API_KEY:
            return error(401, "unauthorized", "Missing or wrong API key.")
        if request.method == "POST":
            body = await request.body()
            if len(body) > 64_000:
                return error(413, "input_too_large", "Request body is over 64 KB.")
            try:
                if has_patient_keys(json.loads(body or b"{}")):
                    return error(422, "patient_data_rejected", "Form questions only: patient data is not accepted.")
            except ValueError:
                return error(400, "bad_request", "Body is not valid JSON.")
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def bad_request(_, exc):
    return error(400, "bad_request", "; ".join("%s: %s" % (".".join(str(p) for p in e["loc"][1:]), e["msg"])
                                               for e in exc.errors()))


@app.get("/health")
def health():
    return {"status": "ok", "model": LLM_MODEL, "version": app.version,
            "pack": {"id": PACK.manifest.get("pack_id"), "records": PACK.count,
                     "collections": {c: len(i.records) for c, i in PACK.indexes.items()}}}


SUPPORT_MIN = 0.5  # share of a sentence's key words that its source must contain


def support(sentence, record):
    """How much of the sentence's wording appears in the record: a cheap check that the cited source is the right one."""
    s = set(words(sentence))
    if not s:
        return 0.0
    r = set(words(record.get("title", "") + " " + record.get("section", "") + " " + record.get("text", "")))
    return len(s & r) / len(s)


def record_card(n, r):
    head = "[K%d] %s (%s%s)" % (n, r.get("title", ""), r.get("kind", ""), ", updated " + r["updated"] if r.get("updated") else "")
    if r.get("section") and r.get("section") != r.get("title"):
        head += "\nSection: " + r["section"]
    return head + "\n" + r.get("text", "")[:1200]


SYSTEM = """You help people build EthioEMR clinical forms in Form Studio (OpenMRS O3 forms).
Answer ONLY from the numbered sources the user gives you. Never use outside knowledge, never guess.
Write the answer as a list of sentences. Each sentence lists in "sources" the numbers of the sources that support
it (2 for [K2]). Never mention sources or their numbers inside the sentence text. A sentence no source supports
must not be written.
Then set "answerable": true when your sentences answer the question (fully or in part), false when the sources do not
cover it. When false, write one sentence saying what the knowledge base does cover nearby.
Questions about a particular patient's care or diagnosis are never answerable here.
Write plain, short sentences for a non-technical form designer. At most 6 sentences unless steps are needed.
Project rules that always apply:
%s"""


async def ask_llm(question, cards, findings, language):
    rules = "\n".join("- " + r["text"] for r in MUST_RULES) or "- (none)"
    user = "Sources:\n\n" + "\n\n".join(cards) + "\n\nQuestion: " + question
    if findings:
        user += "\nCheck messages the user is asking about:\n" + "\n".join("- " + f for f in findings)
    if language == "am":
        user += "\nWrite the answer in Amharic; keep form, field and button names in English."
    # The system prompt comes first and never changes, so Ollama can reuse its already-read copy between questions.
    body = {"model": LLM_MODEL, "stream": False, "format": ANSWER_SCHEMA, "keep_alive": "30m",
            "options": {"temperature": 0.1, "num_predict": MAX_TOKENS, "num_ctx": 8192},
            "messages": [{"role": "system", "content": SYSTEM % rules}, {"role": "user", "content": user}]}
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post(LLM_URL + "/api/chat", json=body)
        r.raise_for_status()
    d = r.json()
    print("form-assistant: llm prompt %s tokens, answer %s tokens, %.1fs" % (
        d.get("prompt_eval_count"), d.get("eval_count"), d.get("total_duration", 0) / 1e9), flush=True)
    return json.loads(d["message"]["content"])


# The same question under the same pack gets the same answer, so a repeat is answered from memory, with no model call.
CACHE, CACHE_MAX = OrderedDict(), 500


@app.post("/v1/forms/ask")
async def forms_ask(req: AskRequest, request: Request):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    key = (" ".join(words(req.question)), req.audience, req.language, req.maxCitations,
           tuple(req.context.checkFindings or []) if req.context else ())
    if key in CACHE:
        CACHE.move_to_end(key)
        cached = CACHE[key]
        return {**cached, "requestId": request_id, "warnings": cached["warnings"] + ["cached"]}
    result = await make_answer(req, request_id)
    if isinstance(result, dict):  # an error response is never kept
        CACHE[key] = result
        if len(CACHE) > CACHE_MAX:
            CACHE.popitem(last=False)
    return result


async def make_answer(req, request_id):
    t0 = time.time()
    base = {"schemaVersion": "1.0", "model": LLM_MODEL, "requestId": request_id, "disclaimer": DISCLAIMER}
    if PATIENT_QUESTION.search(req.question):
        return {**base, "answer": PATIENT_REFUSAL, "answerable": False, "citations": [], "relatedForms": [],
                "warnings": ["patient_question_refused"]}
    query = req.question + " " + " ".join((req.context.checkFindings or []) if req.context else [])
    # Search takes about a second of CPU: run it on a worker thread so other requests are not held up meanwhile.
    scored = await asyncio.to_thread(PACK.search, query, req.audience)
    hits = [r for _, r in scored]
    top = max((sc for sc, _ in scored), default=None)  # the re-ranker's best score: how close the closest record is
    if not hits or (MIN_SCORE is not None and top is not None and top < MIN_SCORE):
        print("form-assistant: ask %.1fs early refusal top=%s q=%r" % (time.time() - t0, top, req.question[:80]), flush=True)
        return {**base, "answer": "The Form Studio knowledge base has nothing on this question.", "answerable": False,
                "citations": [], "relatedForms": [], "warnings": ["no_sources_found"]}
    try:
        out = await ask_llm(req.question, [record_card(n, r) for n, r in enumerate(hits, 1)],
                            req.context.checkFindings if req.context else None, req.language)
    except (httpx.HTTPError, KeyError, ValueError) as e:
        return error(503, "llm_unavailable", "The language model did not answer: %s" % type(e).__name__)

    warnings, used, parts = [], [], []
    for sent in out.get("sentences", []):
        text = re.sub(r"\s*\[K?\d+\]", "", str(sent.get("text", ""))).strip()  # markers come from "sources" only
        real = []
        for n in sent.get("sources", []):
            if isinstance(n, int) and 1 <= n <= len(hits):
                real.append(n) if n not in real else None
            else:
                warnings.append("dropped_unknown_citation_K%s" % n)
        if not text:
            continue
        if real and out.get("answerable"):  # keep cited sources that really carry the sentence; else the best one
            ok = [n for n in real if support(text, hits[n - 1]) >= SUPPORT_MIN]
            if not ok:
                best = max(range(1, len(hits) + 1), key=lambda n: support(text, hits[n - 1]))
                if support(text, hits[best - 1]) >= SUPPORT_MIN:
                    ok = [best]
                    warnings.append("citation_moved_to_K%d" % best)
            if len(ok) < len(real):
                warnings.append("dropped_weak_citation")
            real = ok
        if not real and out.get("answerable"):  # an answer sentence nothing supports is left out
            warnings.append("dropped_unsupported_sentence")
            continue
        used += [n for n in real if n not in used]
        parts.append(text + "".join(" [K%d]" % n for n in real))
    answer = " ".join(parts)
    answerable = bool(out.get("answerable")) and bool(used)
    if out.get("answerable") and not used:
        warnings.append("answer_had_no_valid_citation")
    if not answer:
        answer = "The Form Studio knowledge base does not answer this question."
    citations = [{"id": "K%d" % n, "recordId": hits[n - 1]["id"], "title": hits[n - 1].get("title", ""),
                  "kind": hits[n - 1].get("kind", ""), "section": hits[n - 1].get("section"),
                  "sourcePath": hits[n - 1].get("source_path"), "url": hits[n - 1].get("url"),
                  "updated": hits[n - 1].get("updated", "")} for n in used]
    forms, seen = [], set()
    for r in hits:
        if r.get("form_uuid") and r["form_uuid"] not in seen:
            seen.add(r["form_uuid"])
            forms.append({"formUuid": r["form_uuid"], "formName": r.get("form_name") or r.get("title", "")})
    print("form-assistant: ask %.1fs answerable=%s cites=%s top=%.2f q=%r" % (time.time() - t0, answerable, used,
                                                                             top or 0, req.question[:80]), flush=True)
    return {**base, "answer": answer, "answerable": answerable, "citations": citations, "relatedForms": forms[:10],
            "rulesApplied": [r["rule_id"] for r in MUST_RULES], "warnings": warnings}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("FA_PORT", "8768")))
