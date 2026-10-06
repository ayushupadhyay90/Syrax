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
- NEVER narrate an action as if it already happened — no "Opening…", "Playing…", "Pulling up…", "I've opened…". You cannot perform actions. NEVER instruct the user how to phrase a command (no "say it as one clear command", no "try saying…", no corrections of their wording) — if something reads like a command you cannot act on, keep the reply to one short honest line.
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
    // split answer: "play a song" fired, then "by Arijit Singh" arrived as
    // the answer → the leading "by" is filler, the ARTIST is the query
    .replace(/^(by|from)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalise any play-phrase into a YouTube query — "" means ASK. Shared by
 *  "play X" and "open youtube and play X" so BOTH read the full phrase the
 *  same way (categories, artists, random, generic placeholders, mishearings). */
function playQuery(raw: string): string {
  const full = raw.trim().replace(/\s+/g, ' ')
  if (!full) return ''
  // "play this video/that song" with no real title → Stage asks
  if (/^(?:this|that|the)\s+(?:video|song|one)$/.test(full)) return ''
  // "play any random …" = "play me ANYTHING" → a trending hit, never a
  // search for the literal words and never the which-song? prompt
  if (/^(?:(?:any|some|a|the)\s+)*random\b/.test(full)) return 'trending music video'
  let core = full
  // "any popular song by ARTIST" → the ARTIST after "by" wins (guard: the
  // words before "by" must be song-qualifiers → the real title "stand by me"
  // survives untouched)
  const byM = core.match(/^(.+?)\s+by\s+(.+)$/)
  if (byM && /\b(?:song|songs|music|track|tracks|album|any|some|popular|best|hit|hits|favorite|latest|new)\b/.test(byM[1])) {
    core = byM[2]
  }
  // "any comedy type of video" / "any romantic song" → keep the CATEGORY
  const cat = core.match(
    /^(?:any|some)\s+(.+?)\s*(?:type\s+of\s+|kind\s+of\s+|sort\s+of\s+)?(video|videos|song|songs|track|tracks|music)$/,
  )
  if (cat?.[1]) return `${cat[1].trim()} ${cat[2]}`
  const q = core
    // strip filler words, then leading articles: "play a song" → "" (Stage
    // then ASKS), "play the weeknd" → "weeknd"
    .replace(/\b(song|songs|music|track|tracks|album|video|videos|for me|please|now|on youtube|it|something|whatever|random)\b/g, '')
    .replace(/^(?:a|an|the|some|any|that|this)\s+/, '')
    .replace(/^(?:by|from)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!q || /^(?:this|that)\s+(?:person|guy|artist|singer)$/.test(q)) return ''
  return q === 'weekend' ? 'the weeknd' : q // STT hears "weekend" for The Weeknd
}

export function localIntent(raw: string): AgentCommand | null {
  // Strip, IN ANY ORDER/INTERLEAVING: conversational openers ("okay", "hey",
  // "so"…), wake words incl. EVERY STT mishearing ("cyrex", "psycx", "sirex"…),
  // and polite prefixes — so no prefixed utterance can slip past the
  // start-anchored rules below and fall through to the chat AI.
  let t = raw.toLowerCase().trim()
  for (let i = 0; i < 3 && t; i++) {
    const before = t
    t = t
      .replace(
        /^(?:(?:hey|hi|hello|yo|ok|okay|alright|all right|yeah|yep|yup|sure|so|well|um|uh|please|just|kindly)[,\s]+)+/,
        '',
      )
      .replace(
        /^(?:syrax|cyrex|cyrax|syrex|sirex|zyrax|sirax|psycx|psyx|syracs|zirex|syrx)\b[,\s]*/,
        '',
      )
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
  if (playMatch) return { type: 'play', query: playQuery(playMatch[1]) }
  // bare "play" / "put on" alone → straight to the which-song? question
  if (/^(?:play|put on|stream|listen to)$/.test(t)) return { type: 'play', query: '' }

  // "open youtube and play X" → DIRECT playback in a real tab (the play
  // branch), never a YouTube results page; "…and play this video" with no
  // specific title → empty query → Stage asks which song
  const ytPlay = t.match(
    /^(?:open|show|launch|go to)\s+(?:up\s+)?(?:the\s+)?(?:youtube|you tube)\s+and\s+(?:play|put on|stream)\s+(.+)/,
  )
  if (ytPlay) {
    return { type: 'play', query: playQuery(ytPlay[1]) }
  }

  // open youtube (with or without query) — anchored; "…and search for X" /
  // "…and look up X" clean their query the same way the tab branch does
  const yt = t.match(
    /^(?:open|show|launch|go to)\s+(?:up\s+)?(?:the\s+)?(?:youtube|you tube)\s*(?:and\s*(?:search\s*(?:for)?|play|look\s+up|find)?\s*(.*))?/,
  )
  if (yt) return { type: 'open', target: 'youtube', query: cleanQuery(yt[1] ?? '') }

  // bare "open" with no object → same as opening a tab (a Google page)
  if (/^open$/.test(t)) return { type: 'open', target: 'google', query: '' }

  // open a google tab / search / google … — anchored + word-boundary on "tab"
  // ("table", "cabinet" must never open a browser tab)
  const g =
    t.match(/^(?:open\s+)?(?:a\s+|an\s+|the\s+|our\s+|my\s+|your\s+|another\s+|new\s+|up\s+)*tabs?\b\s*(?:and\s*(.*))?/) ??
    // "open google" / "open a google tab" — bare OR chained:
    // "open google and search for cats" → cats, in that tab
    t.match(/^(?:open\s+)?(?:a\s+|an\s+|the\s+|our\s+|my\s+|your\s+|another\s+|new\s+)*google\s*(?:tab)?(?:\s+and\s+(.*))?$/) ??
    // "search for X" / "search X" / bare "search" / "look up X" / "find X"
    // — ALL of these are the open-a-tab operation (bare forms fall through
    // with an empty query → the default page, never an advice message)
    t.match(/^(?:open\s+)?(?:google|search|look\s+up|find)\b\s*(?:for\s+)?(.*)$/)
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
    .replace(/^(?:(?:hey|hi|ok|okay|yo|please)[,\s]+)*(?:syrax|cyrex|cyrax|syrex|sirex|zyrax|sirax|psycx|psyx|syracs|zirex|syrx)\b[,\s]*/, '')
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

/* ── Real clock — the LLM has NO idea what time it is, so time / date /
 *  world-clock questions are ALWAYS answered locally before the brain is
 *  called (works with no key too). ─────────────────────────────────────── */

const CITY_TZ: Record<string, string> = {
  india: 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', delhi: 'Asia/Kolkata', mumbai: 'Asia/Kolkata',
  kolkata: 'Asia/Kolkata', bangalore: 'Asia/Kolkata', chennai: 'Asia/Kolkata', hyderabad: 'Asia/Kolkata',
  london: 'Europe/London', uk: 'Europe/London', england: 'Europe/London', paris: 'Europe/Paris',
  germany: 'Europe/Berlin', berlin: 'Europe/Berlin', moscow: 'Europe/Moscow', istanbul: 'Europe/Istanbul',
  'new york': 'America/New_York', nyc: 'America/New_York', usa: 'America/New_York',
  'los angeles': 'America/Los_Angeles', chicago: 'America/Chicago', toronto: 'America/Toronto',
  tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', china: 'Asia/Shanghai', beijing: 'Asia/Shanghai',
  'hong kong': 'Asia/Hong_Kong', singapore: 'Asia/Singapore', dubai: 'Asia/Dubai', uae: 'Asia/Dubai',
  riyadh: 'Asia/Riyadh', doha: 'Asia/Qatar', sydney: 'Australia/Sydney', australia: 'Australia/Sydney',
}

const clockTime = (tz?: string) =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) })

function worldReply(raw: string): string | null {
  const t = raw
    .toLowerCase()
    .replace(/^(?:(?:hey|hi|ok|okay|yo|please|so|well)[,\s]+)*(?:syrax|cyrex|cyrax|syrex|sirex|zyrax|sirax|psycx|psyx|syracs|zirex|syrx)\b[,\s]*/, '')
    .replace(/[?!.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  // "time in Tokyo" / "what's the time in new york"
  const inM = t.match(/\b(?:what(?:'s| is)?\s+)?(?:the\s+)?(?:current\s+)?time\s+(?:in|at|for)\s+(.+)$/)
  if (inM) {
    const place = inM[1].replace(/^(the |now |today )+/, '').trim()
    const key = Object.keys(CITY_TZ).find((k) => place === k || place.includes(k))
    if (key) return `It’s ${clockTime(CITY_TZ[key])} in ${place}.`
    return `I can check the clock for India, London, New York, Los Angeles, Chicago, Toronto, Dubai, Paris, Berlin, Moscow, Istanbul, Tokyo, Beijing, Hong Kong, Singapore, Sydney or Riyadh — which one?`
  }

  // "world clock" — a handful of majors in one line
  if (/\b(?:world clock|time around the world|global time|international time|times around|major cities time)\b/.test(t)) {
    return `World clock — India ${clockTime('Asia/Kolkata')}, London ${clockTime('Europe/London')}, New York ${clockTime('America/New_York')}, Tokyo ${clockTime('Asia/Tokyo')}, Dubai ${clockTime('Asia/Dubai')}.`
  }

  // local time
  if (/\b(?:what(?:'s| is)?\s+(?:the\s+)?(?:current\s+)?time|current time|time now|the clock|local time)\b/.test(t)) {
    return `It’s ${clockTime()}.`
  }

  // local date / day
  if (/\b(?:what(?:'s| is)?\s+(?:the\s+)?date|what day|which day|day is it|today's date|todays date)\b/.test(t)) {
    const d = new Date()
    return `Today is ${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`
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

  // real clock — the LLM cannot know the time, so we answer locally
  const clock = worldReply(lastUser)
  if (clock) return { type: 'reply', text: clock }

  const msgs: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    // drop empty entries + cap the window: long sessions stay fast and
    // stale context can't make the model repeat old statements
    ...history.filter((m) => m.content.trim()).slice(-18),
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
