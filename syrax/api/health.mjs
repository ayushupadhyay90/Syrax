/** Syrax /api/health — deployment smoke test. */
export default async function handler(req, res) {
  const hasDs = Boolean((process.env.DEEPSEEK_API_KEY || '').trim());
  const hasGq = Boolean((process.env.GROQ_API_KEY || '').trim());
  const hasFish = Boolean((process.env.FISH_AUDIO_KEY || '').trim());
  return res.status(200).json({
    ok: true,
    hasKey: hasDs || hasGq,
    provider: hasDs ? 'deepseek' : hasGq ? 'groq' : null,
    chatModel: hasDs ? process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-flash' : process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile',
    fishTts: hasFish,
    stt: 'web-speech-api',
  });
}
