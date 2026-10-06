/**
 * Brain client. Talks to the local FastAPI server → Groq API.
 * The Groq key never touches the browser.
 *
 * If the backend/key is unavailable we fall back to a local intent matcher so
 * voice commands (play / open / close / search) still work offline.
 */
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type AgentCommand =
  | { type: 'reply'; text: string }
  /** Browse YouTube / Google (open a page, not necessarily playback).
   *  `explicit` = the user NAMED the destination ("google X", "open youtube").
   *  Plain "search for X" omits it → Stage continues the search in the tab
   *  already open — "do this thing in the particular tab". */
  | { type: 'open'; target: 'youtube' | 'google'; query: string; explicit?: boolean }
  /** Play a song — starts music in the bottom-left player. */
  | { type: 'play'; query: string }
  | { type: 'close' }
  /** About Syrax — identity, creators, capabilities. */
  | { type: 'about' }

const SYSTEM_PROMPT = `You are Syrax, a fast voice assistant with a 3D particle UI.
Always respond with a single JSON object, no markdown, in this exact shape:
{"reply": "<short spoken answer>", "action": {"type": "play"|"open"|"close"|"none", "target": "youtube"|"google", "query": "<search terms>"}}
Rules:
- You NEVER execute actions — a local command parser runs unmistakable commands (play/open/close) before your message even reaches you. Keep the action field in the JSON shape, but set action.type to "none" unless the user is plainly answering a song request you just made (then "play" with their answer as query).
- NEVER emit play/open/close for questions, hypotheticals ("what if", "can you", "would you"), casual conversation, or mere mentions of these words — any action you invent is dropped by the system anyway.
- NEVER narrate an action as if it already happened — no "Opening…", "Playing…", "Pulling up…", "I've opened…". You cannot perform actions. If the user is clearly commanding an open/play/search action, reply with ONE short line giving the exact clear phrase to use (for example: "Say it as one clear command — open YouTube.") and nothing more.
- The product name is always "Syrax" — never "Cyrex" or any other spelling.
- Identity questions get a DIRECT, clear answer — these facts are safe to state briefly: created by Ayush, Navam, and Sandeep; built with React + Vite, Tailwind CSS, Three.js (3D particle field), Web Speech API (speech recognition + text-to-speech), DeepSeek deepseek-flash (the language model), hosted as an installable PWA on GitHub Pages; theme electric blue #3B82F6 on near-black; voice commands open REAL browser tabs; the mic is one-shot and only clear commands execute (you never execute actions yourself).
- Style: refined and clear — lead with the direct answer, then at most one short supporting sentence. Plain text only (no markdown, no emojis), no filler ("certainly", "great question"), never repeat yourself or restate the question. Numbered lines only when the user asks for a list.
- The long personal About intro stays card-only: never recite it as a whole — one short line max — EXCEPT the identity facts above, which you SHOULD state briefly when asked directly.
- ALWAYS fill the "reply" field with a real answer — for ANY question or request: general knowledge, opinions, recommendations ("best movies of all time"), short notes, explanations, or casual/personal-style chat → answer conversationally with actual substance (up to ~120 words; plain numbered lines are fine for lists). Keep it to 1-2 sentences only for simple small talk. Never return an empty reply or a non-answer.`

/* ── Local fallback (offline / no key) ─────────────────────────────────── */

const OFFLINE_CHATTER = [
  'My cloud brain is unreachable right now — check your connection and ask me again in a second. Local commands like “play a song” or “open YouTube” still work.',
  'Brain hiccup on the network side — try that once more. Meanwhile I can still play, search and open things for you.',
  'Almost had it — the connection dropped mid-thought. Ask me again, or use a media command like “play a song”.',
  'The brain link is lagging for a moment — reask me. Direct commands (play / open / close) always work locally.',
  'Connection slipped for a second — please ask me once more. Music and browsing commands don’t need the cloud, so those still work.',
]

const GREETINGS = [
  'Hey! I’m Syrax. Tap the mic and give me a command — or click any operation on the left.',
  'Hello there. I’m ready — ask me anything or say “play a song”.',
  'Hi! Mic’s yours whenever you want to talk.',
]

let lastChatter = -1
/** Rotate replies so the same situation never answers identically twice in a row. */
function rotate(pool: string[]): string {
  let i = Math.floor(Math.random() * pool.length)
  if (pool.length > 1 && i === lastChatter) i = (i + 1) % pool.length
  lastChatter = i
  return pool[i]
}

/** Strip the command-verb the user chained on: "open a tab and search for
 *  cats" must search for CATS — never for the literal phrase "search for
 *  cats" (the exact bug users report: search results full of instructions
 *  instead of the thing they asked for). */
function cleanQuery(q: string): string {
  return q
    .replace(/^(?:search(?:\s+for)?|look\s+up|find|google|check|visit|go\s+to)\s+/i, '')
    .replace(/^me\s+/, '')
    .replace(/^(?:a|an|the|some|any|that|this)\s+/, '')
    // "cars on google/the web" → "cars" (youtube suffix handled by caller —
    // it changes the TARGET, not just the query)
    .replace(/\s+(?:on|in)\s+(?:google|the\s+(?:web|internet|site|browser))$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Instant local command parser — also used by Stage to recognise a complete
 *  imperative IMMEDIATELY (flush right away instead of waiting out the
 *  silence buffer) so voice commands still hold the browser's user-gesture
 *  window when it's time to open a tab. */
/** Strip filler from a song answer → a clean title for the YouTube tab.
 *  "blinding lights please" → "blinding lights"; exported because Stage
 *  feeds it the title when the user answers our "which song?" prompt. */
export function cleanSongTitle(raw: string): string {
  return raw
    .replace(/\b(song|songs|music|track|tracks|album|for me|please|now|on youtube|it)\b/gi, '')
    .replace(/^(a|an|the|some|any|that|this)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function localIntent(raw: string): AgentCommand | null {
  // Strip, IN ANY ORDER/INTERLEAVING: conversational openers ("okay", "hey",
  // "so"…), wake words incl. STT mishearings ("cyrex", "syrex"…), and polite
  // prefixes. REAL BUG: bare "Okay open YouTube" used to survive stripping
  // (the old opener group REQUIRED a wake word after it), no start-anchored
  // rule matched, and the reply fell through to the chat AI — which TALKED
  // about opening instead of doing it.
  let t = raw.toLowerCase().trim()
  for (let i = 0; i < 3 && t; i++) {
    const before = t
    t = t
      .replace(
        /^(?:(?:hey|hi|hello|yo|ok|okay|alright|all right|yeah|yep|yup|sure|so|well|um|uh|please|just|kindly)[,\s]+)+/,
        '',
      )
      .replace(/^(?:syrax|cyrex|cyrax|syrex|sirex|zyrax|sirax)\b[,\s]*/, '')
      .replace(/^(?:(?:can|could|would|will)\s+you\s+(?:to\s+)?)+/, '')
      .trim()
    if (t === before) break
  }
  if (!t) return null

  // ── safety rails: NEVER act on questions, negations, or hypotheticals ──
  if (/\b(don'?t|do not|never)\b[^.]*\b(play|open|close)\b/.test(t)) return null
  if (t.includes('?')) return null
  if (/^(can|could|would|should|will|do|does|did|what if|how about|imagine|suppose|maybe)\b/.test(t)) return null

  // close / exit / shut … (anchored — casual mentions can't trigger it)
  if (/^(close|exit|quit|minimize|shut)\b/.test(t)) return { type: 'close' }
  if (/^(stop|end)\s+(the\s+)?(music|song|video|player|browser|it|that)\b/.test(t)) return { type: 'close' }
  if (/\b(close|exit|shut)\s+(the\s+)?(browser|tab|window|player|it)\b/.test(t)) return { type: 'close' }

  // play … (anchored: "how was the play" / "start dancing" can't trigger)
  const playMatch =
    t.match(/^(?:play|put on|stream|listen to)\s+(?:me\s+)?(.+)/) ??
    t.match(/^start\s+(?:the\s+)?(?:some\s+)?(?:music|song|songs|playlist|video|track)s?\s*(?:of\s+|for\s+)?(.*)/)
  if (playMatch) {
    const full = playMatch[1]
    // "play any random video/song" = "play me ANYTHING" → a trending hit,
    // never the which-song? prompt and never the literal words
    if (/^(?:(?:any|some|a|the)\s+)*random\b/.test(full.trim())) {
      return { type: 'play', query: 'trending music video' }
    }
    let core = full
    // "any popular song by ARTIST" → the ARTIST after "by" becomes the query
    // (guard: the words before "by" must be song-qualifiers, so the real
    // title "stand by me" survives untouched)
    const byM = core.match(/^(.+?)\s+by\s+(.+)$/)
    if (byM && /\b(?:song|songs|music|track|tracks|album|any|some|popular|best|hit|hits|favorite|latest|new)\b/.test(byM[1])) {
      core = byM[2]
    }
    const q = core
      // strip filler words, then leading articles: "play a song" → "" (Stage
      // then ASKS which song), "play the weeknd" → "weeknd", and generic
      // placeholders too — "play this video" must ASK, never search the
      // literal words "this video"
      .replace(/\b(song|songs|music|track|tracks|album|video|videos|for me|please|now|on youtube|it|something|whatever|random)\b/g, '')
      .replace(/^(?:a|an|the|some|any|that|this)\s+/, '')
      // "play a song by Arijit Singh" → "arijit singh" — the ARTIST matters,
      // the words "song by" don't (plays on YouTube, never asks here)
      .replace(/^(?:by|from)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    // STT hears "weekend" for The Weeknd constantly → fix the mishearing
    const fixed = q === 'weekend' ? 'the weeknd' : q
    // "play a song by this person" (no real name in the phrase) → still a question
    if (/^(?:this|that)\s+(?:person|guy|artist|singer)$/.test(fixed)) return { type: 'play', query: '' }
    return { type: 'play', query: fixed } // empty → Stage asks "which song?"
  }

  // "open youtube and play X" → DIRECT playback in a real tab (the play
  // branch), never a YouTube results page; "…and play this video" with no
  // specific title → empty query → Stage asks which song
  const ytPlay = t.match(
    /^(?:open|show|launch|go to)\s+(?:up\s+)?(?:the\s+)?(?:youtube|you tube)\s+and\s+(?:play|put on|stream)\s+(.+)/,
  )
  if (ytPlay) {
    let raw = ytPlay[1].trim()
    if (/^(?:this|that|the)\s+(?:video|song|one)$/i.test(raw)) raw = ''
    return { type: 'play', query: cleanQuery(raw) }
  }

  // open youtube (with or without query) — anchored; "…and search for X" /
  // "…and look up X" clean their query the same way the tab branch does
  const yt = t.match(
    /^(?:open|show|launch|go to)\s+(?:up\s+)?(?:the\s+)?(?:youtube|you tube)\s*(?:and\s*(?:search\s*(?:for)?|play|look\s+up|find)?\s*(.*))?/,
  )
  if (yt) return { type: 'open', target: 'youtube', query: cleanQuery(yt[1] ?? '') }

  // open a google tab / search / google … — anchored + word-boundary on "tab"
  // ("table", "cabinet" must never open a browser tab)
  const g =
    t.match(/^(?:open\s+)?(?:a\s+|an\s+|the\s+|our\s+|my\s+|your\s+|another\s+|new\s+|up\s+)*tabs?\b\s*(?:and\s*(.*))?/) ??
    // "open google" / "open a google tab" — bare OR chained:
    // "open google and search for cats" → cats, in that tab
    t.match(/^(?:open\s+)?(?:a\s+|an\s+|the\s+|our\s+|my\s+|your\s+|another\s+|new\s+)*google\s*(?:tab)?(?:\s+and\s+(.*))?$/) ??
    t.match(/^(?:open\s+)?(?:google|search|look up|find)\s+(?:for\s+)?(.+)/)
  if (g) {
    const q = cleanQuery(g[1] ?? '') || 'news today'
    // "search for cars on youtube" → YouTube search, not Google
    const onYt = q.match(/^(.+?)\s+on\s+(?:you\s?tube|yt)$/)
    if (onYt) return { type: 'open', target: 'youtube', query: onYt[1] }
    // destination NAMED ("google X") → always a Google tab; plain
    // "search/look up/find X" stays non-explicit so Stage runs it inside the
    // tab already open instead of stacking another one
    const explicit = /^(?:open\s+)?(?:a\s+)?(?:new\s+)?google\b/.test(t)
    return { type: 'open', target: 'google', query: q, ...(explicit ? { explicit: true } : {}) }
  }

  // command-shaped, but the parser couldn't make sense of it ("open the
  // fridge") → honest LOCAL guidance instead of letting the chat AI dream up
  // a fake "Opening…" reply it has no way to perform
  if (/^(?:open|play|search|find|look up|put on|stream|listen to)\b/.test(t)) {
    return {
      type: 'reply',
      text: 'I didn’t catch that as one clear command — say it as a single line, like “open YouTube”, “search for cats” or “play a song”.',
    }
  }

  return null
}

/** Local Q&A — real answers for common questions while the Groq key is absent. */
function localAsk(raw: string): AgentCommand {
  const t = raw.toLowerCase()
  const now = new Date()

  if (/\bwhat('s| is)? the time\b|\bcurrent time\b|\bclock\b/.test(t)) {
    return { type: 'reply', text: `It’s ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` }
  }
  if (/\bwhat('s| is)? (the )?date\b|\bwhat day\b|\btoday's date\b/.test(t)) {
    return { type: 'reply', text: `Today is ${now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.` }
  }
  // identity / capabilities get a short conversational answer (the long
  // About intro is card-only — voice/text must never fire it)
  if (/\bwho are you\b|\byour name\b|\bwhat are you\b/.test(t)) {
    return { type: 'reply', text: 'I’m Syrax — your voice assistant. Click the About Syrax card to hear my full intro.' }
  }
  if (/\bwhat can you do\b|\bcapabilities\b|\bcommands\b|\bhelp me\b/.test(t)) {
    return { type: 'reply', text: 'I can play songs, open YouTube, search the web, close the browser and answer questions — by voice or by clicking the cards on the left.' }
  }
  if (/^(hi|hello|hey|yo|namaste|hola)\b/.test(t)) {
    return { type: 'reply', text: rotate(GREETINGS) }
  }
  if (/\bhow are you\b|\bhow's it going\b|\bhow do you feel\b/.test(t)) {
    return { type: 'reply', text: 'Running smooth — orb’s calm, mic’s hot, ready for your next command.' }
  }
  if (/\b(thank you|thanks|thx)\b/.test(t)) {
    return { type: 'reply', text: 'Anytime. Just say the word.' }
  }
  return { type: 'reply', text: rotate(OFFLINE_CHATTER) }
}

export function offlineReply(): AgentCommand {
  return { type: 'reply', text: rotate(OFFLINE_CHATTER) }
}

/** Identity / project facts — answered LOCALLY (instant, works with NO key,
 *  never dodged) BEFORE the LLM: "who made you", "what tech stack", model,
 *  hosting, privacy. STT garbles ("tax tax" = "tech stack") are covered. */
function identityReply(raw: string): string | null {
  const t = raw
    .toLowerCase()
    .replace(/^(hey |ok |okay |yo |please )?(syrax|cyrex|cyrax|syrex|sirex|zyrax|sirax)\b[,\s]*/, '')
    .replace(/[?.!,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  // who made/created/built you (or Syrax)
  if (
    /\b(?:who|whom)\b.*\b(?:made|created|built|developed|designed|coded)\b/.test(t) ||
    /\b(?:your|the)\s+(?:creator|maker|developer|author|founder|owner)\b/.test(t)
  ) {
    return 'Ayush, Navam, and Sandeep created me — I’m Syrax, Mark 1, a voice-driven 3D web assistant.'
  }

  // tech stack / how you were built
  const asksSelf = /\b(?:you|your|you're|syrax|this (?:app|site|project|thing))\b/.test(t)
  if (
    /\b(?:tax\s*tax|tech\s*stack|techstack)\b/.test(t) ||
    (asksSelf && /\b(?:stack|tools|languages|frameworks?|technologies)\b/.test(t)) ||
    /\b(?:built|made|created|developed|designed)\s+(?:with|using|on|in|from)\b/.test(t) ||
    /\bwhat\s+(?:tech|technology)\b/.test(t)
  ) {
    return 'Built with React and Vite, Tailwind CSS for styling, Three.js for the 3D particle field, the Web Speech API for voice, DeepSeek’s deepseek-flash as the brain, and hosted free as an installable PWA on GitHub Pages — all by Ayush, Navam, and Sandeep.'
  }

  // which AI model runs you
  if (/\b(?:which|what)\s+(?:model|llm|ai model)\b/.test(t) || /\bdeepseek\b/.test(t) || /\bchatgpt\b|\bgpt\b|\bopenai\b/.test(t)) {
    return 'My brain runs on DeepSeek — the deepseek-flash model — called straight from your browser with your own key.'
  }

  // where you live / how to install
  if (/\bwhere\b.*\b(?:hosted|host|live|running|deployed|saved)\b/.test(t) || /\bgithub pages\b/.test(t)) {
    return 'I live on GitHub Pages at ayushupadhyay90.github.io/Syrax — open it in Chrome and use Add to Home screen to install me on desktop or Android.'
  }

  // privacy — honest, no claims we can't keep
  if (/\b(?:privacy|private|do you (?:store|save|keep|record)|is this (?:secure|safe)|tracking)\b/.test(t)) {
    return 'Straight answer: your messages go to DeepSeek’s API to get replies, so no — I won’t pretend otherwise. Your API key stays only on this device, the repo has no secrets, and the mic is one-shot: it never keeps listening after a command.'
  }

  return null
}

/* ── Brain call ────────────────────────────────────────────────────────── */

/* ── One-time DeepSeek key (stored per device — GitHub Pages is static) ─ */

const KEY_LS = 'syrax-ds-key'

export function getDSKey(): string {
  try {
    return localStorage.getItem(KEY_LS) ?? ''
  } catch {
    return ''
  }
}

export function setDSKey(k: string): void {
  try {
    if (k.trim()) localStorage.setItem(KEY_LS, k.trim())
    else localStorage.removeItem(KEY_LS)
  } catch {
    /* private mode — the brain just stays offline */
  }
}

export function hasDSKey(): boolean {
  return getDSKey().length > 8
}

/** Direct browser → DeepSeek call (GitHub Pages has no server proxy).
 *  Mirrors api/chat.mjs exactly: deepseek-flash, thinking disabled, JSON mode,
 *  temp 0.5, max_tokens 384 — 2 attempts with the empty-body JSON nudge, 7s cap. */
async function callDeepSeek(key: string, msgs: ChatMessage[]): Promise<string> {
  const payload: Record<string, unknown> = {
    model: 'deepseek-flash',
    temperature: 0.5,
    max_tokens: 384,
    thinking: { type: 'disabled' },
  }
  if (JSON.stringify(msgs).toLowerCase().includes('json')) payload.response_format = { type: 'json_object' }
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController()
    const to = window.setTimeout(() => ctrl.abort(), 7000)
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        signal: ctrl.signal,
        body: JSON.stringify({
          ...payload,
          messages: attempt === 0 ? msgs : [...msgs, { role: 'user', content: 'Respond with valid JSON now.' }],
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        choices?: { message?: { content?: string } }[]
      }
      if (!res.ok) {
        if (res.status === 401 || res.status === 402) return 'KEY_BAD' // bad/empty key → guide the user
        continue // rate limit / server hiccup → one retry
      }
      const content = data.choices?.[0]?.message?.content ?? ''
      if (content.trim()) return content
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') break // dead network → fall back now
    } finally {
      window.clearTimeout(to)
    }
  }
  return ''
}

/** Dev-only: local FastAPI proxy on :8000 (key stays server-side locally). */
async function callProxy(msgs: ChatMessage[]): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController()
    const to = window.setTimeout(() => ctrl.abort(), 7000)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({ messages: msgs }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const content = ((await res.json()) as { content: string }).content ?? ''
      if (content.trim()) return content
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') break
    } finally {
      window.clearTimeout(to)
    }
  }
  return ''
}

export async function askSyrax(history: ChatMessage[]): Promise<AgentCommand> {
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''

  // ⚡ Instant path — clear commands (play/open/close) execute locally with
  // ZERO network latency. Only questions wait for the LLM.
  const local = localIntent(lastUser)
  if (local) return local

  // identity / project facts first — instant, keyless, never garbled by the LLM
  const ident = identityReply(lastUser)
  if (ident) return { type: 'reply', text: ident }

  const msgs: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    // drop empty entries + cap the window: long sessions stay fast and
    // stale context can't make the model repeat old statements
    ...history.filter((m) => m.content.trim()).slice(-14),
  ]

  const key = getDSKey()
  let content = ''
  if (key) content = await callDeepSeek(key, msgs) // browser-direct (GitHub Pages)
  else if (import.meta.env.DEV) content = await callProxy(msgs) // local FastAPI :8000
  if (content === 'KEY_BAD') {
    return {
      type: 'reply',
      text: 'That brain key was rejected — tap the 🔑 button in the Conversation panel and paste a valid DeepSeek API key.',
    }
  }
  if (!content.trim()) return localAsk(lastUser) // ALWAYS answer something

  try {
    const parsed = JSON.parse(content) as { reply?: string; action?: { type?: string; query?: string } }
    const a = parsed.action ?? { type: 'none' }
    const fallback = 'Hmm — say that again for me?'

    // 🛡️ CLEAR-COMMANDS-ONLY (user's choice): the local parser already found
    // no unmistakable command above — so any play/open/close the model invents
    // is DROPPED and it replies as plain chat (misfires impossible). The ONE
    // exception: answering our own "which song?" prompt with a clean title.
    const prevAssistant = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? ''
    const answeringSongPrompt = /title|artist|genre|want to hear|which song|what type of song/i.test(prevAssistant)
    const looksLikeTitle = lastUser.length <= 60 && !/[.?!,]/.test(lastUser) && lastUser.split(/\s+/).length <= 8
    if (a.type === 'play' && answeringSongPrompt && looksLikeTitle && !lastUser.includes('?')) {
      return { type: 'play', query: (a.query ?? lastUser).trim() }
    }

    return { type: 'reply', text: (parsed.reply ?? '').trim() || fallback }
  } catch {
    // model didn't give JSON — treat whole thing as plain reply (trimmed)
    return { type: 'reply', text: content.trim() || 'Hmm — try that again?' }
  }
}
