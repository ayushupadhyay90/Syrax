"""
One-time setup: turn assets/jarvis-voice.mp3 into a Fish Audio voice model.

Fish Audio's TTS uses a `reference_id` (a voice model trained instantly from
your reference audio) — this script uploads the file ONCE and prints the id.

Usage:
  pip install -r requirements.txt
  put FISH_AUDIO_KEY=...   in backend\.env   (free key: fish.audio → Developers → API keys)
  python setup_voice.py

Then add the printed line to:
  - backend\.env          (local FastAPI)
  - Vercel → Settings → Environment Variables   (deployed site)
"""
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

FISH_URL = "https://api.fish.audio/model"


def main() -> None:
    key = os.getenv("FISH_AUDIO_KEY", "").strip()
    if not key:
        sys.exit("FISH_AUDIO_KEY not set — get a free key at fish.audio → Developers → API keys")

    audio = Path(__file__).parent.parent / "assets" / "jarvis-voice.mp3"
    if not audio.exists():
        sys.exit(f"reference audio missing: {audio}")

    print(f"Uploading {audio.name} ({audio.stat().st_size} bytes) to Fish Audio…")
    with httpx.Client(timeout=90.0, headers={"Authorization": f"Bearer {key}"}) as client:
        r = client.post(
            FISH_URL,
            data={
                "type": "tts",
                "train_mode": "fast",  # model is instantly usable
                "title": "Syrax JARVIS Voice",
                "visibility": "private",
                "description": "Syrax assistant base voice",
            },
            files=[("voices", (audio.name, audio.read_bytes(), "audio/mpeg"))],
        )

    if r.status_code not in (200, 201):
        sys.exit(f"Fish Audio error {r.status_code}: {r.text[:500]}")

    data = r.json()
    model_id = data.get("_id") or data.get("id") or data.get("model_id") or ""
    print(f"Response: {data}")
    if not model_id:
        sys.exit("Could not find the model id in the response — paste the output above.")
    print()
    print("Voice model created:", model_id)
    print("Add this to backend\\.env AND Vercel env vars:")
    print(f"  FISH_VOICE_ID={model_id}")


if __name__ == "__main__":
    main()
