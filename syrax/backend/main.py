"""
Syrax FastAPI backend — Groq chat (LLM brain).
Speech-to-text runs client-side via the Web Speech API, so no transcribe endpoint.

Run:
  pip install -r requirements.txt
  copy .env.example → .env  (paste your GROQ_API_KEY)
  python -m uvicorn main:app --port 8000
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import quote_plus

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

# load backend/.env next to this file (re-read per request so a newly added
# key is picked up WITHOUT restarting the server)
ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(ENV_PATH)

CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile")

GROQ_URL = "https://api.groq.com/openai/v1"  # OpenAI-compatible
DEEPSEEK_URL = "https://api.deepseek.com"  # OpenAI-compatible too
TIMEOUT = httpx.Timeout(30.0, connect=5.0)

app = FastAPI(title="Syrax API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class TTSRequest(BaseModel):
    text: str


# YouTube's `listType=search` embed is dead ("video unavailable"), so we
# resolve a search query to real video IDs server-side and embed those.
YT_RESULTS_RE = re.compile(r'"videoRenderer":\{"videoId":"([\w-]{11})"')
# id + title (for the mini YouTube home grid in the panel)
YT_ITEM_RE = re.compile(
    r'"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"',
    re.S,
)
YT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def _provider() -> tuple[str, str, str]:
    """Pick the LLM provider from backend/.env → (base_url, key, model).

    DeepSeek is preferred when both keys exist; either works because both
    APIs are OpenAI-compatible (POST {base}/chat/completions + Bearer auth).
    Fresh load_dotenv each call → paste a key, no restart needed.
    """
    load_dotenv(ENV_PATH, override=True)
    ds = os.getenv("DEEPSEEK_API_KEY", "").strip()
    gq = os.getenv("GROQ_API_KEY", "").strip()
    if ds:
        return DEEPSEEK_URL, ds, os.getenv("DEEPSEEK_CHAT_MODEL", "deepseek-flash")
    if gq:
        return GROQ_URL, gq, os.getenv("GROQ_CHAT_MODEL", CHAT_MODEL)
    raise HTTPException(500, "No LLM key set. Add DEEPSEEK_API_KEY (or GROQ_API_KEY) to backend/.env")


@app.get("/api/health")
async def health() -> dict:
    load_dotenv(ENV_PATH, override=True)
    has_ds = bool(os.getenv("DEEPSEEK_API_KEY", "").strip())
    has_gq = bool(os.getenv("GROQ_API_KEY", "").strip())
    return {
        "ok": True,
        "hasKey": has_ds or has_gq,
        "provider": "deepseek" if has_ds else ("groq" if has_gq else None),
        "chatModel": os.getenv("DEEPSEEK_CHAT_MODEL", "deepseek-flash") if has_ds else CHAT_MODEL,
        "stt": "web-speech-api",
    }


@app.get("/api/youtube")
async def youtube_search(q: str) -> dict:
    """Resolve a YouTube search query → top video IDs (no API key needed).

    The frontend embeds `youtube.com/embed/<id>` because YouTube removed
    support for `listType=search` embeds.
    """
    query = q.strip()
    if not query:
        raise HTTPException(400, "q is required")
    url = f"https://www.youtube.com/results?search_query={quote_plus(query)}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=YT_HEADERS, follow_redirects=True) as client:
            r = await client.get(url)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"YouTube unreachable: {e}")
    items: list[dict] = []
    seen: set[str] = set()
    for vid, raw_title in YT_ITEM_RE.findall(r.text):
        if vid in seen:
            continue
        seen.add(vid)
        try:
            title = json.loads(f'"{raw_title}"')  # unescape \u / \" sequences
        except Exception:
            title = raw_title
        items.append({"id": vid, "title": title})
        if len(items) >= 12:
            break
    if not items:  # title regex missed → fall back to bare ids
        for vid in YT_RESULTS_RE.findall(r.text):
            if vid not in seen:
                seen.add(vid)
                items.append({"id": vid, "title": "Video"})
            if len(items) >= 12:
                break
    if not items:
        raise HTTPException(502, "No YouTube results found")
    return {"query": query, "ids": [i["id"] for i in items], "results": items}


FISH_TTS_URL = "https://api.fish.audio/v1/tts"


@app.post("/api/tts")
async def tts(req: TTSRequest) -> Response:
    """Fish Audio text-to-speech proxy — returns mp3 bytes.

    The Fish Audio key stays server-side (never in the browser). Falls back
    to the client's Pocket TTS / browser voice when no key is configured
    (the frontend treats a non-200 as "use next voice in the chain").
    """
    load_dotenv(ENV_PATH, override=True)
    key = os.getenv("FISH_AUDIO_KEY", "").strip()
    if not key:
        raise HTTPException(503, "FISH_AUDIO_KEY not set — client should use fallback voice")

    payload: dict = {
        "text": req.text,
        "format": "mp3",
        "latency": "low",  # prioritize start speed
        "normalize": True,
        "prosody": {"speed": 1.05, "normalize_loudness": True},
    }
    voice = os.getenv("FISH_VOICE_ID", "").strip()
    if voice:
        payload["reference_id"] = voice  # your cloned/custom voice model

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "model": os.getenv("FISH_TTS_MODEL", "s2.1-pro-free"),  # free developer tier
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=5.0)) as client:
        try:
            r = await client.post(FISH_TTS_URL, json=payload, headers=headers)
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Fish Audio unreachable: {e}")
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"Fish Audio error: {r.text[:300]}")
    return Response(content=r.content, media_type="audio/mpeg")


@app.post("/api/chat")
async def chat(req: ChatRequest) -> dict:
    base, key, model = _provider()
    payload: dict = {
        "model": model,
        "messages": [m.model_dump() for m in req.messages],
        "temperature": 0.5,
        "max_tokens": 384,
    }
    if model.startswith("deepseek"):
        # deepseek-flash is a REASONING model — thinking is on by default
        # (effort: high), which adds seconds of latency and can swallow the
        # whole token budget (leaving an empty reply). Voice needs speed:
        # disable thinking and force strict JSON output.
        payload["thinking"] = {"type": "disabled"}
        # response_format=json_object requires the word "json" somewhere in
        # the prompt — skip otherwise instead of erroring.
        # (model_dump first — raw Pydantic models aren't stdlib-serializable)
        if "json" in json.dumps(req.model_dump()).lower():
            payload["response_format"] = {"type": "json_object"}
    async def _ask(msgs: list) -> str:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            try:
                r = await client.post(
                    f"{base}/chat/completions",
                    json={**payload, "messages": msgs},
                    headers={"Authorization": f"Bearer {key}"},
                )
            except httpx.HTTPError as e:
                raise HTTPException(502, f"LLM unreachable: {e}")
        data = r.json()
        if r.status_code != 200:
            raise HTTPException(
                r.status_code, data.get("error", {}).get("message", "LLM error")
            )
        return data["choices"][0]["message"]["content"] or ""

    msgs: list = [m.model_dump() for m in req.messages]
    content = await _ask(msgs)
    if not content.strip():
        # DeepSeek sometimes answers 200 with WHITESPACE-ONLY content when the
        # history carries plain-text assistant turns (reproduced 4/4). A
        # trailing JSON nudge fixed it 4/4 in testing — and if that ever fails
        # too, fall back to a guaranteed-parseable reply so the client NEVER
        # sees an empty body (no silent bubbles, no false offline chatter).
        try:
            content = await _ask(
                msgs + [{"role": "user", "content": "Respond with valid JSON now."}]
            )
        except HTTPException:
            content = ""
    if not content.strip():
        content = json.dumps({"reply": "Hmm — say that again for me?"})
    return {"content": content}
