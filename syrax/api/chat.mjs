/**
 * Syrax /api/chat — Vercel serverless mirror of backend/main.py.
 * DeepSeek (preferred) → Groq fallback; both OpenAI-compatible.
 * Keys come from Vercel env vars — never exposed to the browser.
 */
export const config = { maxDuration: 15 };

const DEEPSEEK_URL = 'https://api.deepseek.com';
const GROQ_URL = 'https://api.groq.com/openai/v1';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages[] required' });
  }

  const ds = (process.env.DEEPSEEK_API_KEY || '').trim();
  const gq = (process.env.GROQ_API_KEY || '').trim();
  const useDeepSeek = Boolean(ds);
  if (!useDeepSeek && !gq) {
    return res.status(500).json({ error: 'No LLM key set (DEEPSEEK_API_KEY)' });
  }

  const base = useDeepSeek ? DEEPSEEK_URL : GROQ_URL;
  const key = useDeepSeek ? ds : gq;
  const model = useDeepSeek
    ? process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-flash'
    : process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';

  const payload = { model, messages, temperature: 0.5, max_tokens: 384 };
  if (model.startsWith('deepseek')) {
    // deepseek-flash is a REASONING model (thinking on by default, effort:
    // high) — that adds seconds of latency and can swallow the token budget,
    // leaving an empty reply. Voice needs speed → disable, force strict JSON.
    payload.thinking = { type: 'disabled' };
    // response_format=json_object requires the word "json" somewhere in the
    // prompt (the system prompt has it) — skip otherwise instead of 400ing.
    if (JSON.stringify(messages).toLowerCase().includes('json')) {
      payload.response_format = { type: 'json_object' };
    }
  }

  const post = async (msgs) => {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ ...payload, messages: msgs }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data?.error?.message || 'LLM error');
      err.status = r.status;
      throw err;
    }
    return data.choices?.[0]?.message?.content ?? '';
  };

  try {
    let content = await post(messages);
    if (!content.trim()) {
      // DeepSeek sometimes answers 200 with WHITESPACE-ONLY content when the
      // history carries plain-text assistant turns (reproduced 4/4). A
      // trailing JSON nudge fixed it 4/4 in testing — and if that ever fails
      // too, fall back to a guaranteed-parseable reply so the client NEVER
      // sees an empty body (no silent bubbles, no false offline chatter).
      try {
        content = await post([...messages, { role: 'user', content: 'Respond with valid JSON now.' }]);
      } catch {
        content = '';
      }
    }
    if (!content.trim()) content = JSON.stringify({ reply: 'Hmm — say that again for me?' });
    return res.status(200).json({ content });
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.message });
  }
}
