# Syrax — 3D Particle Voice Agent

Voice-driven assistant with a reactive 3D particle UI, GSAP-animated embedded browser, and a custom TTS voice.

## Stack
- **Vite + React 19 + TypeScript + Tailwind CSS 4** — UI
- **Three.js / React Three Fiber** — 12k GPU shader particles, react to voice level
- **GSAP** — browser panel zoom-in / zoom-to-corner animations
- **Web Speech API** (Google speech recognition in Chrome/Edge) — free, keyless, real-time speech-to-text in pure JavaScript
- **Pocket TTS** — local Syrax voice TTS (falls back to browser TTS if offline)
- **Groq** (`llama-3.3-70b-versatile`) — fast LLM brain
- **Python FastAPI** — backend (chat only), keeps the Groq key server-side
- **iframe + GSAP** — embedded YouTube/Google browser

## Run it

```bash
# 1. Frontend deps (already installed)
npm install

# 2. Backend deps
cd backend
pip install -r requirements.txt
# copy .env.example → .env and paste your GROQ_API_KEY
# free key: https://console.groq.com/keys

# 3. Terminal A — FastAPI backend (port 8000)
npm run server

# 4. Terminal B — UI (port 5173)
npm run dev
```

Open http://localhost:5173, tap the mic, and say:
- *"Open YouTube and search for lo-fi music"*
- *"Close the browser"*

Voice flow: mic → Web Speech API (in-browser, real-time) → `/api/chat` → Groq LLM → JSON command → UI action + TTS reply.

## Optional — Pocket TTS (Syrax voice)
If Pocket TTS runs on `http://localhost:8000`, Syrax uses it automatically.
Configure via env vars: `VITE_POCKET_TTS_URL`, `VITE_Syrax_VOICE`.
Without it, the browser's built-in voice is used as fallback.

## Project structure
```
src/
  App.tsx                 # main HUD + state machine (idle/listening/thinking/speaking)
  three/Background.tsx    # R3F canvas (reads live mic level for particle reactivity)
  three/particles.ts      # GPU shader particle field
  voice/stt.ts            # Web Speech API recognizer (real-time, keyless) + mic level meter
  voice/level.ts          # shared mic amplitude for the particle loop
  voice/tts.ts            # Pocket TTS client + browser fallback
  ai/Syrax.ts             # Groq chat client (JSON command protocol)
  browser/BrowserPanel.tsx# GSAP zoom/dock iframe browser
backend/
  main.py                 # FastAPI: /api/chat (Groq)
  requirements.txt
  .env.example            # → copy to .env, add GROQ_API_KEY
```
