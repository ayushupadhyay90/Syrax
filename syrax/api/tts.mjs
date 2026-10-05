/**
 * Syrax /api/tts — Fish Audio text-to-speech proxy (Vercel serverless).
 * Returns mp3 bytes; the Fish key stays server-side.
 * 503 when no key → the client's voice chain falls back (Fish → Pocket → browser).
 */
export const config = { maxDuration: 30 };

const FISH_TTS_URL = 'https://api.fish.audio/v1/tts';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'POST only' });
  const text = req.body?.text;
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ detail: 'text is required' });
  }

  const key = (process.env.FISH_AUDIO_KEY || '').trim();
  if (!key) {
    return res.status(503).json({ detail: 'FISH_AUDIO_KEY not set — client should use fallback voice' });
  }

  const payload = {
    text,
    format: 'mp3',
    latency: 'low', // prioritize start speed
    normalize: true,
    prosody: { speed: 1.05, normalize_loudness: true },
  };
  const voice = (process.env.FISH_VOICE_ID || '').trim();
  if (voice) payload.reference_id = voice; // your cloned/custom voice model

  try {
    const r = await fetch(FISH_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        model: process.env.FISH_TTS_MODEL || 's2.1-pro-free', // free developer tier
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ detail: `Fish Audio error: ${t.slice(0, 300)}` });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ detail: `Fish Audio unreachable: ${e.message}` });
  }
}
