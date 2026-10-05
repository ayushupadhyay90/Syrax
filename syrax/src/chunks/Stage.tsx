import { useEffect, useRef, useState } from 'react'
import type { OrbState } from 'thinking-orbs'
import { OrbCanvas, useHeroSize } from './Chunk1'
import { SpeechRecognizer } from '../voice/stt'
import { micLevel } from '../voice/level'
import { speak, stopSpeaking } from '../voice/tts'
import { askSyrax, localIntent, cleanSongTitle, hasDSKey, setDSKey, type ChatMessage, type AgentCommand } from '../ai/syrax'
import { ABOUT_SPOKEN, ABOUT_TEXT, ABOUT_INTRO, ABOUT_PUNCHLINE, ABOUT_OPERATIONS } from '../ai/about'
import { BrowserPanel, type BrowserTarget } from '../browser/BrowserPanel'

/**
 * Stage — the main Syrax view:
 *   TOP    : SYRAX wordmark (bold, JARVIS-grade)
 *   LEFT   : operations Syrax can perform (light up when executed)
 *   CENTER : the dotted orb, morphing animation per phase + looping action line
 *   RIGHT  : live conversation (voice in → brain → Pocket TTS out)
 */

type Phase = 'idle' | 'listening' | 'thinking' | 'solving' | 'searching' | 'speaking'

/** Each phase gets its own distinct orb animation. */
const PHASE_ORB: Record<Phase, OrbState> = {
  idle: 'breathing', // slow calm ring
  listening: 'listening', // waveform rolls through latitude rings
  thinking: 'working', // orbits circling the core — brain computing
  solving: 'solving', // rubik bands scramble, click back — command executing
  searching: 'searching', // scan meridian sweeps the globe
  speaking: 'composing', // undulating sash — Syrax responding
}

const PHASE_META: Record<Phase, { label: string; dot: string; pulse: string }> = {
  idle: { label: 'Idle', dot: 'bg-[#3B82F6]/50', pulse: '' },
  listening: { label: 'Listening', dot: 'bg-emerald-400', pulse: 'animate-pulse' },
  thinking: { label: 'Thinking', dot: 'bg-[#3B82F6]', pulse: 'animate-pulse' },
  solving: { label: 'Solving', dot: 'bg-fuchsia-500', pulse: 'animate-pulse' },
  searching: { label: 'Searching', dot: 'bg-fuchsia-400', pulse: 'animate-pulse' },
  speaking: { label: 'Responding', dot: 'bg-[#93C5FD]', pulse: 'animate-pulse' },
}

type Op = {
  id: string
  icon: string
  label: string
  hint: string
  /** canned command fired when the card is clicked (works without a Groq key) */
  canned: AgentCommand
}

const OPERATIONS: Op[] = [
  {
    id: 'youtube',
    icon: '📺',
    label: 'Open YouTube',
    hint: 'Opens in a new Chrome tab',
    canned: { type: 'open', target: 'youtube', query: '' },
  },
  {
    id: 'song',
    icon: '🎵',
    label: 'Play a song',
    hint: 'Plays in a new Chrome tab',
    canned: { type: 'play', query: '' },
  },
  {
    id: 'tab',
    icon: '🌐',
    label: 'Open a tab',
    hint: 'Google in a new Chrome tab',
    canned: { type: 'open', target: 'google', query: 'weather today', explicit: true },
  },
  {
    id: 'about',
    icon: '🛡️',
    label: 'About Syrax',
    hint: 'Who I am & what I can do',
    canned: { type: 'about' },
  },
  {
    id: 'ask',
    icon: '💬',
    label: 'Ask anything',
    hint: 'Type or speak to Syrax',
    canned: { type: 'reply', text: 'Ask me anything — type below or tap the mic.' },
  },
]

/** Pick a random element so repeated commands never sound identical. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Distinct spoken line (varied per call) + on-screen status for every operation. */
function describe(cmd: AgentCommand): { say: string; status: string } {
  if (cmd.type === 'about') {
    return { say: ABOUT_SPOKEN, status: '🛡️ About Syrax — your voice AI' }
  }
  if (cmd.type === 'play') {
    const q = cmd.query || 'some music'
    return {
      say: pick([
        `Playing ${q} for you — enjoy the music!`,
        `Cueing up ${q} right now. Turn it up!`,
        `On it — pulling up ${q} at this very moment.`,
      ]),
      status: `▶ Playing — ${q}`,
    }
  }
  if (cmd.type === 'open' && cmd.target === 'youtube') {
    return cmd.query
      ? {
          say: pick([
            `Opening YouTube and searching for ${cmd.query}.`,
            `Sure — YouTube is up with results for ${cmd.query}.`,
            `Here's what I found on YouTube for ${cmd.query}.`,
          ]),
          status: `📺 Opening YouTube — “${cmd.query}”`,
        }
      : { say: pick(['Opening YouTube.', 'Sure, bringing up YouTube for you.']), status: '📺 Opening YouTube' }
  }
  if (cmd.type === 'close') {
    return {
      say: pick(['Closing the browser.', 'All right — shutting the browser down.', 'Browser closed. Clean and quick.']),
      status: '⤡ Closing the browser',
    }
  }
  if (cmd.type === 'open') {
    return cmd.query
      ? {
          say: pick([
            `Searching the web for ${cmd.query}.`,
            `Pulling up Google results for ${cmd.query}.`,
            `One sec — googling ${cmd.query} for you.`,
          ]),
          status: `🌐 Searching the web — “${cmd.query}”`,
        }
      : { say: pick(['Opening a new tab.', 'Fresh tab, coming up.']), status: '🌐 Opening a new tab' }
  }
  return { say: cmd.text, status: cmd.text }
}

type Msg = {
  who: 'you' | 'syrax'
  text: string
  /** optional action link — used when a popup blocker eats window.open() */
  href?: string
}

/** Phone browsers (Android/iOS Chrome) — mic guidance must point at the mobile
 *  permission UI (site-info ⓘ → Permissions), not the desktop address-bar one. */
const IS_PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

/** Chat persistence (user request): every conversation is saved to
 *  localStorage so refresh/close never loses it. Storage is per device + per
 *  origin — the PC link and the phone link keep separate (non-synced) chats. */
const CHAT_KEY = 'syrax-chat-v1'
const CHAT_MAX = 200

/**
 * Resolve a YouTube search query → a real video id, PURELY IN THE BROWSER
 * (static hosting has no backend anymore). All sources are RACED in parallel —
 * whichever answers first with a valid id wins; every source can fail (proxies
 * rate-limit, instances rotate) and the caller then opens the YouTube results
 * page, so the tab ALWAYS opens with the right query.
 */
async function firstHit(ps: Promise<string | undefined>[]): Promise<string | undefined> {
  return new Promise((done) => {
    let left = ps.length
    if (!left) return done(undefined)
    for (const p of ps) {
      p.then(
        (v) => {
          if (v) done(v)
          else if (--left === 0) done(undefined)
        },
        () => {
          if (--left === 0) done(undefined)
        },
      )
    }
  })
}

async function resolveVideo(query: string): Promise<string | undefined> {
  const BUDGET = 5000 // never hang the open — results page is the safety net
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`

  const text = async (url: string): Promise<string | undefined> => {
    const ctrl = new AbortController()
    const to = window.setTimeout(() => ctrl.abort(), BUDGET)
    try {
      const r = await fetch(url, { signal: ctrl.signal })
      return r.ok ? await r.text() : undefined
    } catch {
      return undefined
    } finally {
      window.clearTimeout(to)
    }
  }
  const json = async (url: string): Promise<unknown> => {
    const t = await text(url)
    if (!t) return undefined
    try {
      return JSON.parse(t)
    } catch {
      return undefined
    }
  }
  const htmlId = async (proxyPrefix: string): Promise<string | undefined> => {
    const t = await text(proxyPrefix + encodeURIComponent(ytUrl))
    if (!t) return undefined
    // "videoRenderer" = a real search-result item (skips ads/related)
    return (
      t.match(/"videoRenderer":\s*\{\s*"videoId":"([\w-]{11})"/)?.[1] ??
      t.match(/"videoId":"([\w-]{11})"/)?.[1]
    )
  }
  const apiId = async (): Promise<string | undefined> => {
    const d = (await json(`/api/youtube?q=${encodeURIComponent(query)}`)) as
      | { ids?: string[] }
      | undefined
    return d?.ids?.[0]
  }
  const pipedId = async (base: string): Promise<string | undefined> => {
    const d = (await json(`${base}/search?q=${encodeURIComponent(query)}&filter=videos`)) as
      | { items?: { type?: string; url?: string }[] }
      | undefined
    const it = d?.items?.find((i) => i.type === 'stream' && (i.url ?? '').includes('v='))
    return it?.url?.match(/v=([\w-]{11})/)?.[1]
  }
  const invId = async (base: string): Promise<string | undefined> => {
    const d = (await json(`${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`)) as
      | { videoId?: string; type?: string }[]
      | undefined
    return Array.isArray(d) ? d.find((x) => x.type === 'video')?.videoId : undefined
  }
  const jinaId = async (): Promise<string | undefined> => {
    const t = await text(`https://r.jina.ai/${ytUrl}`)
    return t?.match(/youtube\.com\/watch\?v=([\w-]{11})/)?.[1]
  }

  return (
    (await firstHit([
      apiId(), // local dev backend (fast 404 on static hosting)
      htmlId('https://api.codetabs.com/v1/proxy?quest='), // strong, rate-limited
      htmlId('https://api.allorigins.win/raw?url='),
      invId('https://invidious.f5.si'), // verified: direct JSON, CORS, ~2s
      invId('https://yewtu.be'),
      invId('https://invidious.nerdvpn.de'),
      jinaId(), // slow but reliable last resort
      pipedId('https://pipedapi.adminforge.de'),
      pipedId('https://api.piped.private.coffee'),
    ])) ?? undefined
  )
}

/** Shown inside the reserved tab while the real URL is still being decided. */
/* (splash removed on purpose — no tab ever opens before a command runs) */

export default function Stage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [interim, setInterim] = useState('')
  const [status, setStatus] = useState('Tap the mic — or click an operation')
  const [messages, setMessages] = useState<Msg[]>(() => {
    // restore the saved conversation (per device) — first visit gets the greeting
    try {
      const raw = localStorage.getItem(CHAT_KEY)
      const saved = raw ? (JSON.parse(raw) as Msg[]) : []
      if (Array.isArray(saved) && saved.length) return saved.slice(-CHAT_MAX)
    } catch {
      /* corrupted save → start fresh */
    }
    return [{ who: 'syrax', text: 'Hey, I’m Syrax. Tap the mic and talk to me — or click any operation on the left.' }]
  })
  const [micOn, setMicOn] = useState(false)
  const [activeOp, setActiveOp] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [browserOpen, setBrowserOpen] = useState(false)
  const [docked, setDocked] = useState(false)
  const [browser, setBrowser] = useState<BrowserTarget | null>(null)
  const [autoplay, setAutoplay] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [micBlocked, setMicBlocked] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  /** Now-Playing strip (user request): set when a resolved song opens in a
   *  real tab; cleared on "close tabs" / "stop" so nothing lingers. */
  const [nowPlaying, setNowPlaying] = useState<string | null>(null)

  /** Save every change → refresh/close never loses the conversation. */
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-CHAT_MAX)))
    } catch {
      /* storage quota exceeded — the in-memory chat still works */
    }
  }, [messages])

  /** One-time key handoff: open the app with ?key=sk-… → save it to this
   *  device's browser, then strip it from the URL (never left in history). */
  useEffect(() => {
    try {
      const k = new URLSearchParams(window.location.search).get('key')
      if (k && k.length > 8) {
        setDSKey(k)
        history.replaceState(null, '', window.location.pathname + window.location.hash)
      }
    } catch {
      /* ignore malformed params */
    }
  }, [])

  /** Connection awareness — the status line tells the truth when the net drops. */
  useEffect(() => {
    const off = () => setStatus('📡 Offline — reconnecting…')
    const on = () => setStatus('✅ Back online')
    window.addEventListener('offline', off)
    window.addEventListener('online', on)
    if (!navigator.onLine) off()
    return () => {
      window.removeEventListener('offline', off)
      window.removeEventListener('online', on)
    }
  }, [])

  const orbSize = useHeroSize(0.42, 150, 440)
  const historyRef = useRef<ChatMessage[]>([])
  const recognizerRef = useRef<SpeechRecognizer | null>(null)
  const micRef = useRef(false)
  const opTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Voice utterance buffer — we respond once, after the full phrase. */
  const finalBuf = useRef('')
  const finalTimer = useRef<number | null>(null)
  /** A "which song?" ask is pending — the next utterance IS the song title. */
  const pendingSong = useRef(false)
  /** Real Chrome tabs Syrax opened — "close the browser" shuts them.
   *  Each remembers its kind so a follow-up "search for X" continues in THE
   *  PARTICULAR TAB already open (google search in a google tab, YouTube
   *  search in a YouTube tab) instead of stacking a new one. */
  const openedTabs = useRef<{ w: Window; kind: 'youtube' | 'google' }[]>([])
  /** Consecutive STT network drops — auto-reconnect before giving up. */
  const netRetries = useRef(0)
  /** STT silence watchdog — last transcript activity + heal attempts. */
  const lastSttAt = useRef(Date.now())
  const sttHeals = useRef(0)
  /** Blocked-tab retry: next trusted tap/keydown anywhere re-opens it. */
  const openRetryFn = useRef<((e: Event) => void) | null>(null)
  /** The 🔑 setup card has been shown once — never nag again. */
  const keyNagged = useRef(false)
  /** Tab reserved WHILE the imperative phrase streams in — Chrome only honours
   *  window.open() for ~5s after a gesture (the mic click), so voice commands
   *  must grab the window early and just navigate it later. */
  const reservedTab = useRef<Window | null>(null)
  const reserveTimer = useRef<number | null>(null)
  /** Popup-blocker how-to is posted once per session, never spammed. */
  const popupGuideShown = useRef(false)

  const say = (who: Msg['who'], text: string, href?: string) =>
    // normalize on the way in: no message — from us, the user, or the LLM —
    // may ever display "cyrex" (STT mishears Syrax constantly)
    setMessages((m) => [...m, { who, text: normalizeName(text), ...(href ? { href } : {}) }])

  const settle = () => setPhase(micRef.current ? 'listening' : 'idle')

  /** Drop an unused reserved splash tab (question / stop / no-op paths). */
  function closeReserve() {
    if (reserveTimer.current) {
      window.clearTimeout(reserveTimer.current)
      reserveTimer.current = null
    }
    const w = reservedTab.current
    reservedTab.current = null
    if (w && !w.closed) {
      try {
        w.close()
      } catch {
        /* already gone */
      }
    }
  }

  /** The most recent tab Syrax opened that is still alive (windows the user
   *  closed by hand are forgotten). No kind → newest tab of ANY kind: plain
   *  "search for X" must continue in the tab the user already has open.
   *  Named target → that site's tab (a newer YouTube tab never hijacks an
   *  explicit "google X"). */
  function liveTab(kind?: 'youtube' | 'google') {
    openedTabs.current = openedTabs.current.filter((t) => {
      try {
        return !t.w.closed
      } catch {
        return false
      }
    })
    const tabs = openedTabs.current
    if (!kind) return tabs[tabs.length - 1] ?? null
    for (let i = tabs.length - 1; i >= 0; i--) if (tabs[i].kind === kind) return tabs[i]
    return null
  }

  /**
   * Open a URL in a REAL Chrome tab — user request: every operation (YouTube,
   * songs, Google) runs in the browser itself, never inside the site panel.
   * Tabs are tracked so "close the browser" can shut them.
   *
   * Popup-blocker reality: Chrome expires the mic-click user gesture after
   * ~5s — speech + silence-buffer + run() always lands AFTER that, so a bare
   * window.open() from voice gets blocked ("blocked by browser"). Fix order:
   *  1) consume the tab reserved mid-speech (navigating our own window needs
   *     NO gesture — always works);
   *  2) else window.open (typed commands still hold the Enter/click gesture);
   *  3) blocked → ONE-time how-to-allow message + always-working "Open ↗".
   */
  function openTab(url: string, label: string, kind: 'youtube' | 'google'): boolean {
    let w: Window | null = null
    const res = reservedTab.current
    if (res && !res.closed) {
      w = res
      reservedTab.current = null // consumed — it graduates into openedTabs
      if (reserveTimer.current) {
        window.clearTimeout(reserveTimer.current)
        reserveTimer.current = null
      }
      try {
        w.location.href = url
      } catch {
        w = null // defensive → fall through to a fresh window.open
      }
    }
    if (!w) {
      try {
        w = window.open(url, '_blank')
      } catch {
        w = null
      }
    }
    if (w) {
      openedTabs.current.push({ w, kind })
      setStatus(`↗ ${label} — opened in a new tab`)
      return true
    }
    // Popup blocker ate it → give the user the ONE-time permission fix + a
    // link that always works (a real click on the anchor = fresh gesture).
    const first = !popupGuideShown.current
    popupGuideShown.current = true
    say(
      'syrax',
      first
        ? `The browser blocked the new tab — that's its popup blocker. One-time fix: click the 🚫 “Popup blocked” badge next to the address bar → “Always allow pop-ups from this site” → Done. (Heads-up: this permission is saved PER SITE ADDRESS — allowing it on another site doesn't carry over. In the installed Syrax app, use ⋮ → Settings → Site settings → Pop-ups and redirects.) For now tap “Open ↗” below — or just tap anywhere on this page — to go to ${label} now.`
        : `Popup still blocked — tap “Open ↗” below or tap anywhere on this page to open ${label} now (the one-time fix above makes it permanent).`,
      url,
    )
    // Any REAL tap/keydown restores Chrome's popup allowance instantly →
    // re-open on the user's very next interaction (unless they're clicking a
    // real button/link, which handles itself).
    if (openRetryFn.current) {
      window.removeEventListener('pointerdown', openRetryFn.current)
      window.removeEventListener('keydown', openRetryFn.current)
    }
    const handler = (e: Event) => {
      const el = e.target as HTMLElement | null
      if (el && el.closest && el.closest('a,button')) return // UI handles it
      let w2: Window | null = null
      try {
        w2 = window.open(url, '_blank')
      } catch {
        w2 = null
      }
      if (!w2) return // still no activation — stay armed for the next tap
      openedTabs.current.push({ w: w2, kind })
      setStatus(`↗ ${label} — opened in a new tab`)
      if (openRetryFn.current) {
        window.removeEventListener('pointerdown', openRetryFn.current)
        window.removeEventListener('keydown', openRetryFn.current)
        openRetryFn.current = null
      }
    }
    openRetryFn.current = handler
    window.addEventListener('pointerdown', handler)
    window.addEventListener('keydown', handler)
    return false
  }


  /** STT constantly mishears "Syrax" as "Cyrex"/"Syrex" — fix before anything else. */
  const normalizeName = (text: string) =>
    text.replace(/\b(cyrex|cyrax|syrex|sirex|zyrax|syracs|sirax|zirex|syrx)\b/gi, 'Syrax')

  /** Retry after blocking: re-requests the mic — on success go STRAIGHT into
   *  listening (no extra tap), on failure say exactly why + how to fix it. */
  async function retryMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setMicBlocked(false)
      say('syrax', 'Microphone unlocked — go ahead and speak.')
      setStatus('Listening… go ahead')
      setInterim('')
      setPhase('listening')
      setMicOn(true)
      micRef.current = true
      try {
        void recognizerRef.current?.start()
      } catch {
        /* recognizer already running → we are listening anyway */
      }
    } catch (e) {
      const name = (e as DOMException)?.name ?? ''
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        say(
          'syrax',
          IS_PHONE
            ? 'No microphone was found — make sure no other app (call/recorder) is holding the mic, then tap Retry again.'
            : 'No microphone was found — check Windows Settings → Sound → Input, or plug in your mic, then tap Retry again.',
        )
      } else {
        say('syrax', await micBlockedAdvice())
      }
    }
  }

  /** Play/pause control for the video panel, right in the chat box. */
  function toggleVideo() {
    const frame = document.getElementById('syrax-browser') as HTMLIFrameElement | null
    if (!frame?.contentWindow) return
    frame.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: videoPlaying ? 'pauseVideo' : 'playVideo', args: [] }),
      '*',
    )
    setVideoPlaying((p) => !p)
    setStatus(videoPlaying ? 'Video paused' : 'Video playing')
  }

  // NOTE: the old "reserve a splash tab at the mic click" machinery was
  // REMOVED on purpose — the user never wants a tab opening before a command
  // actually runs. Tabs now open only when a command executes: reuse the
  // Syrax-opened tab → window.open inside the gesture window → the always-
  // working "Open ↗" chat link if a popup blocker ever says no.

  // ── voice in ────────────────────────────────────────────────────────────
  useEffect(() => {
    // "listen first, THEN respond": buffer final segments and fire only after
    // the speaker ACTUALLY pauses. A transcript ending on a dangling word
    // ("…and search for", "open the", "play a") is clearly MID-SENTENCE — it
    // waits much longer before firing, so the full command is always read
    // first (the old 0.9s fire-on-partial was the "searched too early" bug).
    const dangling = (s: string) =>
      /(?:\s|^)(and|or|then|plus|for|to|search|look|up|find|with|that|which|who|about|on|in|of|my|some|the|a|an|tab|tabs|browser|page)$/.test(
        s.trim().toLowerCase(),
      )
    const flushDelay = (s: string) => (dangling(s) ? 3500 : 1200)
    const armFinalFlush = () => {
      if (finalTimer.current) window.clearTimeout(finalTimer.current)
      finalTimer.current = window.setTimeout(
        () => {
          const full = finalBuf.current.trim()
          finalBuf.current = ''
          finalTimer.current = null
          if (full) void handleSaid(full)
        },
        flushDelay(finalBuf.current),
      )
    }

    recognizerRef.current = new SpeechRecognizer({
      onInterim: (t) => {
        const clean = normalizeName(t)
        setInterim(clean)
        setStatus(`“${clean}”`)
        lastSttAt.current = Date.now()
        sttHeals.current = 0
        if (document.hidden) window.focus() // STT must run on the foreground tab
        // still talking → push the pending flush back (Chrome can finalise a
        // clause while the sentence continues; this is the "incomplete
        // command" bug — we now wait for real silence)
        if (finalTimer.current) armFinalFlush()
      },
      onFinal: (text) => {
        netRetries.current = 0 // healthy again — reset the reconnect budget
        lastSttAt.current = Date.now()
        sttHeals.current = 0
        finalBuf.current = finalBuf.current ? `${finalBuf.current} ${text}` : text
        const full = finalBuf.current.trim()
        // "stop / shut up" fires INSTANTLY — a halt must cut through anything
        if (full && isHalt(full)) {
          if (finalTimer.current) {
            window.clearTimeout(finalTimer.current)
            finalTimer.current = null
          }
          finalBuf.current = ''
          void handleSaid(full)
          return
        }
        // EVERYTHING ELSE waits for REAL silence (1.2s; 3.5s after a
        // trailing connector) so the command is read COMPLETELY first —
        // "open youtube and play X", "a song by …", "open a tab and search
        // for …" must never fire halfway through the sentence. Any new
        // interim or final pushes the flush back again.
        armFinalFlush()
      },
      onError: (err) => {
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          // only warn once — don't spam the conversation on repeated retries
          setMicBlocked(true)
          setMessages((m) =>
            m.some((x) => x.text.startsWith('Mic access was blocked'))
              ? m
              : [
                  ...m,
                  {
                    who: 'syrax' as const,
                    text: IS_PHONE
                      ? 'Mic access was blocked — tap the ⓘ icon at the left of the address bar → Permissions → Microphone → Allow, then tap Retry below.'
                      : 'Mic access was blocked — click the 🎤 icon in the address bar, allow the microphone, then tap Retry below.',
                  },
                ],
          )
          micRef.current = false
          setMicOn(false)
          setPhase('idle')
          setStatus('Microphone blocked — allow mic access')
          recognizerRef.current?.stop() // release the mic + kill any restart loop
        } else if (err === 'network') {
          // Web Speech drops the connection on flaky networks often — recover
          // SILENTLY (up to 4×, escalating delays) instead of killing the mic
          netRetries.current += 1
          if (netRetries.current <= 4 && micRef.current) {
            setStatus('Voice link dropped — reconnecting…')
            recognizerRef.current?.stop() // end the dead session cleanly (no restart loop)
            window.setTimeout(() => {
              if (!micRef.current) return
              void recognizerRef.current?.start().then(() => {
                if (micRef.current) {
                  setPhase('listening')
                  setStatus('Listening')
                }
              })
            }, 1200 * netRetries.current) // escalating backoff: 1.2s → 4.8s
          } else {
            setMessages((m) =>
              m.some((x) => x.text.startsWith('Voice engine lost'))
                ? m
                : [...m, { who: 'syrax', text: 'Voice engine lost the network — check your connection and tap the mic again. (Typed messages always work.)' }],
            )
            micRef.current = false
            setMicOn(false)
            setPhase('idle')
            setStatus('Voice engine: network error — retry the mic')
          }
        } else if (err === 'audio-capture') {
          say('syrax', 'I can’t reach your microphone — close whatever else is using it (calls, recorders), then tap the mic again.')
        } else if (err !== 'no-speech' && err !== 'aborted') {
          // full sentences (e.g. the "open in Chrome" hint) go through as-is;
          // bare error codes get the generic prefix
          say('syrax', err.includes(' ') ? err : `Voice error: ${err}`)
        }
      },
    })
    return () => {
      recognizerRef.current?.stop()
      if (opTimer.current) window.clearTimeout(opTimer.current)
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      if (finalTimer.current) window.clearTimeout(finalTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // NOTE: no on-load mic warnings (user request — the Retry row must not
  // appear unprompted on Vercel). Blocked state surfaces ONLY when a mic
  // attempt actually fails: ensureMicPermission / recognizer onError.

  // Ask for mic permission on the FIRST interaction (only if still undecided)
  // so the prompt never ambushes the user in the middle of a task.
  useEffect(() => {
    let done = false
    const preflight = () => {
      if (done) return
      done = true
      window.removeEventListener('pointerdown', preflight)
      window.removeEventListener('keydown', preflight)
      try {
        navigator.permissions
          ?.query({ name: 'microphone' as PermissionName })
          .then((p) => {
            if (p.state !== 'prompt') return // denied → surfaces on mic tap only
            navigator.mediaDevices
              ?.getUserMedia({ audio: true })
              .then((s) => s.getTracks().forEach((t) => t.stop()))
              .catch(() => {})
          })
          .catch(() => {})
      } catch {
        /* permissions API unsupported */
      }
    }
    window.addEventListener('pointerdown', preflight)
    window.addEventListener('keydown', preflight)
    return () => {
      window.removeEventListener('pointerdown', preflight)
      window.removeEventListener('keydown', preflight)
    }
  }, [])

  // keep chat pinned to the newest message
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // the YouTube tab got closed (swipe-away / close button / tab switcher) →
  // the Now-Playing strip must stop claiming something is playing
  useEffect(() => {
    if (!nowPlaying) return
    const t = window.setInterval(() => {
      if (!liveTab('youtube')) setNowPlaying(null)
    }, 3000)
    return () => window.clearInterval(t)
  }, [nowPlaying])

  // STT SILENCE WATCHDOG — the mic can LOOK alive (rings on, splash open)
  // while Chrome's speech service delivers nothing (start raced, service
  // hung, tab lost focus). If the user IS speaking (level meter) but no
  // transcript lands for 6s → restart recognition; after two failed heals →
  // say it OUT LOUD instead of leaving an "OPENING…" tab with no result
  // ever coming (the "animation and nothing else" complaint).
  useEffect(() => {
    if (!micOn) return
    const t = window.setInterval(() => {
      if (!micRef.current) return
      if (Date.now() - lastSttAt.current < 6000) return
      if (micLevel.value < 0.15) {
        lastSttAt.current = Date.now() // nobody is talking — silence is normal
        return
      }
      if (sttHeals.current < 2) {
        sttHeals.current += 1
        lastSttAt.current = Date.now()
        setStatus('Reconnecting the listener…')
        try {
          recognizerRef.current?.stop()
        } catch {
          /* already gone */
        }
        window.setTimeout(() => {
          if (!micRef.current) return
          void recognizerRef.current?.start().then(() => {
            lastSttAt.current = Date.now()
          })
        }, 350)
        return
      }
      // two restarts + still nothing while they speak → be honest, never hang
      micRef.current = false
      setMicOn(false)
      setPhase('idle')
      try {
        recognizerRef.current?.stop()
      } catch {
        /* already gone */
      }
      closeReserve()
      setStatus('Can’t hear you — type the command')
      say(
        'syrax',
        'The mic is on but your words aren’t reaching me — Chrome’s speech service isn’t responding. Check the 🎤 permission for this site, tap the mic to retry, or type the command instead.',
      )
    }, 2000)
    return () => window.clearInterval(t)
  }, [micOn])

  /**
   * Speak a reply. ONE-SHOT model (user request): the mic ALWAYS ends off —
   * Syrax never keeps listening in the background. Tap the mic again for the
   * next command. This kills TTS-echo loops and ambient phantom commands.
   */
  async function sayOutLoud(text: string) {
    if (micRef.current) recognizerRef.current?.stop()
    micRef.current = false
    setMicOn(false)
    setPhase('speaking')
    await speak(text)
    setPhase('idle')
    setStatus('Tap the mic — or click an operation')
  }

  async function handleSaid(raw: string) {
    const text = normalizeName(raw)
      .trim()
      // listening skill: STT lets hesitations through and they anchor-break
      // the local command regexes — "uh, open youtube" must still match ^open
      .replace(/^(uh+|um+|hm+|hmm+|er+|er+|ah+|mhm+|like|well|so)\b[,\s]+/i, '')
      // Chrome stutters repeats ("the the", "play play") — collapse them
      .replace(/\b([a-z]{2,})\s+\1\b/gi, '$1')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) return
    say('you', text)
    historyRef.current.push({ role: 'user', content: text })

    // 🛑 "stop syrax" / "shut up" → halt everything without touching the LLM
    if (isHalt(text)) {
      haltAll()
      // JSON-shaped assistant turns: matches the model's own output format —
      // with plain-text turns DeepSeek returns whitespace-only 200s (reproduced
      // 4/4). JSON history = first-try replies at ~2s instead of ~4s nudged.
      historyRef.current.push({
        role: 'assistant',
        content: JSON.stringify({ reply: '[stopped]', action: { type: 'none' } }),
      })
      return
    }

    // 🎵 answering our own "which song?" prompt — the title arrives with NO
    // verb ("blinding lights"), so run it DIRECTLY: no LLM round-trip, works
    // with no brain key saved, and lands in a real YouTube tab
    if (pendingSong.current) {
      pendingSong.current = false
      const explicit = localIntent(text)
      const plausible =
        text.length <= 80 &&
        !text.includes('?') &&
        !/^(hi|hello|hey|yo|namaste|no|nope|stop|cancel|close|exit|never|thanks|thank you)\b/.test(text)
      if (explicit) {
        await run(explicit) // "play X" / "open youtube" said while waiting
        return
      }
      if (plausible) {
        await run({ type: 'play', query: cleanSongTitle(text) })
        return
      }
      // a genuine question → fall through to the brain (pending already reset)
    }

    // 🔑 first brain-ask with no key saved → open setup once (commands still run)
    if (!import.meta.env.DEV && !hasDSKey() && !keyNagged.current) {
      keyNagged.current = true
      setKeyOpen(true)
    }

    const id = runIdRef.current
    setPhase('thinking')
    setStatus('🤔 Thinking…')
    try {
      const cmd = await askSyrax(historyRef.current)
      if (id !== runIdRef.current) return // a "stop" landed mid-flight → drop it
      // only open/play consume the reserved splash tab — anything else
      // (questions, chit-chat) closes it so no stray tab lingers
      if (cmd.type !== 'open' && cmd.type !== 'play') closeReserve()
      await run(cmd)
    } catch {
      closeReserve()
      say('syrax', 'Brain hiccup — check your connection and try that again.')
      settle()
      setStatus('⚠ Brain unreachable')
    }
  }

  // ── execute an operation (from voice, text, or a clicked card) ─────────
  /** Resolve a YouTube query in the background; patch the open panel when ready. */
  function resolveInto(query: string, willPlay = true) {
    const sid = runIdRef.current // if a "stop" lands meanwhile → drop the result
    void resolveVideo(query).then((videoId) => {
      if (sid !== runIdRef.current) return
      if (videoId) {
        setVideoPlaying(willPlay) // keep the ⏯ button state honest
        if (willPlay) quietMic() // mic must never hear the video's audio
      }
      setBrowser((prev) =>
        prev && prev.target === 'youtube' && prev.query === query ? { ...prev, videoId, ytPending: false } : prev,
      )
    })
  }

  /** Media is about to make noise — turn the mic off so it can't transcribe it
   *  into phantom commands (the "random stuff opens YouTube" loop). */
  function quietMic() {
    if (!micRef.current) return
    if (finalTimer.current) window.clearTimeout(finalTimer.current)
    finalBuf.current = ''
    recognizerRef.current?.stop()
    micRef.current = false
    setMicOn(false)
  }

  /** Bumped by "stop" — invalidates in-flight replies and pending searches. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runIdRef = useRef(0)

  /** "stop syrax" / "shut up" / bare "stop" → halt everything, immediately. */
  const isHalt = (t: string) =>
    /^(stop|halt|cancel|pause)\s*(syrax|syrex|cyrex)?\s*[.!?]*$/.test(t) ||
    /^(shut up|be quiet|quiet|silence|enough|that'?s enough|stop talking|stop responding|stop speaking|stop listening|stop searching|stop thinking|stop everything)[.!?]*$/.test(
      t,
    )

  function haltAll() {
    runIdRef.current += 1 // drop any in-flight LLM reply or pending search
    pendingSong.current = false // "stop" also abandons a pending "which song?"
    stopSpeaking() // cut TTS mid-sentence — "shut" means shut
    closeReserve() // never leave a half-open splash tab behind
    if (finalTimer.current) window.clearTimeout(finalTimer.current)
    finalTimer.current = null
    finalBuf.current = ''
    if (micRef.current) recognizerRef.current?.stop()
    micRef.current = false
    setMicOn(false)
    if (opTimer.current) window.clearTimeout(opTimer.current)
    setActiveOp(null)
    setInterim('')
    // a search still resolving? close it instead of letting it finish later
    if (browser?.ytPending) {
      setBrowserOpen(false)
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      closeTimer.current = window.setTimeout(() => setBrowser(null), 700)
    }
    setPhase('idle')
    setNowPlaying(null) // "stop" means stop — never leave the strip dancing
    setStatus('⏹ Stopped — tap the mic when ready')
    say('syrax', 'Stopped.') // chat only — never SPEAK after "stop"
  }

  /** Honest "why is the mic blocked" copy. Per-site denial → exact steps to
   *  un-block it; a session that denies EVERY permission (embedded preview
   *  browsers) → say so plainly and point at the working typed fallback. */
  async function micBlockedAdvice(): Promise<string> {
    let state = 'unknown'
    try {
      state = (await navigator.permissions.query({ name: 'microphone' })).state
    } catch {
      /* Permissions API unsupported */
    }
    if (state !== 'denied') {
      return IS_PHONE
        ? 'Mic access was blocked — tap the ⓘ icon at the left of the address bar → Permissions → Microphone → Allow, then tap Retry below.'
        : 'Mic access was blocked — click the 🎤 icon in the address bar, allow the microphone, then tap Retry below.'
    }
    // denied: site-level block (user-fixable) vs a session that denies everything?
    let allDenied = true
    for (const n of ['notifications', 'geolocation', 'camera'] as const) {
      try {
        if ((await navigator.permissions.query({ name: n })).state !== 'denied') {
          allDenied = false
          break
        }
      } catch {
        allDenied = false
        break
      }
    }
    if (allDenied) {
      return "This browser session blocks ALL microphone access, so voice can't be enabled here. Type your commands instead — everything else works (voice works in normal Chrome and the installed Syrax app)."
    }
    return IS_PHONE
      ? 'The mic permission for this site is set to DENIED. Open Chrome ⋮ → Settings → Site settings → Microphone → find this site → switch to Allow → tap Retry below.'
      : `The mic permission for this site is set to DENIED. Paste chrome://settings/content/siteDetails?site=${location.host} into Chrome's address bar → Microphone → Allow → tap Retry below.`
  }

  /** Ask for the mic BEFORE recognition starts → the browser shows its normal
   *  prompt up front instead of a cryptic "blocked" error mid-task. */
  async function ensureMicPermission(): Promise<boolean> {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
      setMicBlocked(false)
      return true
    } catch {
      setMicBlocked(true)
      const advice = await micBlockedAdvice()
      setMessages((m) =>
        m.some(
          (x) =>
            x.text.startsWith('Mic access was blocked') ||
            x.text.startsWith('Your microphone is blocked') ||
            x.text.startsWith('The mic permission for this site') ||
            x.text.startsWith('This browser session blocks'),
        )
          ? m
          : [...m, { who: 'syrax' as const, text: advice }],
      )
      return false
    }
  }

  async function run(cmd: AgentCommand) {
    // JSON-shaped history (see handleSaid) — keeps DeepSeek answering first-try
    historyRef.current.push({
      role: 'assistant',
      content: JSON.stringify({
        reply: cmd.type === 'reply' ? cmd.text : `[${cmd.type}]`,
        action: { type: 'none' },
      }),
    })
    const { say: spoken, status: statusText } = describe(cmd)

    if (cmd.type === 'play') {
      // no song named (card click / "play a song") → ASK, never guess a track
      const query = cmd.query.trim()
      if (!query) {
        setStatus('🎧 Which song would you like?')
        const askSong = pick([
          'What type of song would you like — a title, an artist, or a genre?',
          'Which song should I play? Name a title, artist, or mood.',
          'Tell me what you want to hear — song, artist, or genre?',
        ])
        say('syrax', askSong)
        pendingSong.current = true // next utterance = the song title (handleSaid)
        inputRef.current?.focus()
        await sayOutLoud(askSong)
        return
      }
      // user request: music opens in a REAL Chrome tab (never the site panel).
      // Resolve the top hit first → direct watch URL; resolve failing (slow /
      // down) still opens the results page — nothing here can hang the open.
      const startRun = runIdRef.current
      setStatus(statusText)
      say('syrax', spoken)
      quietMic() // media audio must never reach the mic — anywhere
      void (async () => {
        const id = await resolveVideo(query)
        if (startRun !== runIdRef.current) return // "stop" landed meanwhile
        const url = id
          ? `https://www.youtube.com/watch?v=${id}&autoplay=1`
          : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
        const label = `YouTube — ${query}`
        // music continues in the YouTube tab Syrax already opened — never
        // stack duplicates ("play X" five times = five tabs, before)
        const ytTab = liveTab('youtube')
        let landed = false
        if (ytTab) {
          closeReserve() // reuse path never consumes the reserved splash
          try {
            ytTab.w.location.href = url
            landed = true
          } catch {
            openedTabs.current = openedTabs.current.filter((t) => t.w !== ytTab.w)
          }
          if (landed) {
            try {
              ytTab.w.focus() // cosmetic — never fails a reuse
            } catch {
              /* focus denied → tab still did navigate */
            }
            setStatus(`↗ ${label} — in your open tab`)
          } else {
            landed = openTab(url, label, 'youtube') // stale window → fresh
          }
        } else {
          landed = openTab(url, label, 'youtube')
        }
        // watch page auto-plays → show the Now-Playing strip; a bare results
        // page (resolve failed) isn't playing, so it never lights up
        if (landed && id) setNowPlaying(query)
      })()
      await sayOutLoud(spoken)
      return
    }

    if (cmd.type === 'open') {
      // user request: open a REAL Chrome tab — never the embedded panel
      // (no phase/animation churn — the tab opens straight away)
      setStatus(statusText)
      say('syrax', spoken)
      const q = cmd.query.trim()
      // Plain "search for X" (destination not named) continues IN THE
      // PARTICULAR TAB already open — "open a tab and search for someone …
      // and do this thing in the particular tab". Named targets ("google X",
      // "open youtube …") reuse that site's own tab; either way no duplicate
      // tabs stack up.
      const plain = cmd.target === 'google' && cmd.explicit !== true
      const chosen = plain ? liveTab() : liveTab(cmd.target)
      const kind = chosen ? chosen.kind : cmd.target
      const url =
        kind === 'youtube'
          ? q
            ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
            : 'https://www.youtube.com'
          : q
            ? `https://www.google.com/search?q=${encodeURIComponent(q)}`
            : 'https://www.google.com'
      const label =
        kind === 'youtube'
          ? q
            ? `YouTube search “${q}”`
            : 'YouTube'
          : q
            ? `Google search “${q}”`
            : 'Google'
      if (chosen) {
        closeReserve() // reuse path never consumes the reserved splash
        let reused = true
        try {
          // ALWAYS navigate — bare "open youtube" must land on the homepage,
          // never show whatever stale content that tab was left on
          chosen.w.location.href = url
        } catch {
          reused = false // window is gone → forget it, open a fresh one
          openedTabs.current = openedTabs.current.filter((t) => t.w !== chosen.w)
        }
        if (reused) {
          try {
            chosen.w.focus() // cosmetic — never fails a reuse
          } catch {
            /* focus denied → tab still did navigate */
          }
          setStatus(`↗ ${label} — ${q ? 'searched in' : 'opened in'} your open tab`)
        } else {
          openTab(url, label, kind)
        }
      } else {
        openTab(url, label, kind)
      }
      await sayOutLoud(spoken)
      return
    }

    if (cmd.type === 'about') {
      setAboutOpen(true)
      setStatus(statusText)
      say('syrax', ABOUT_TEXT) // display stays verbatim; `spoken` has TTS fixes
      await sayOutLoud(spoken)
      return
    }

    if (cmd.type === 'close') {
      // close the REAL Chrome tabs Syrax opened (+ clear dormant panel state)
      let closed = 0
      for (const tab of openedTabs.current) {
        try {
          tab.w.close()
          closed += 1
        } catch {
          /* tab opened via the fallback link — only the user can close it */
        }
      }
      openedTabs.current = []
      setNowPlaying(null) // tabs are gone → nothing is playing anymore
      setBrowserOpen(false)
      setVideoPlaying(false)
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      closeTimer.current = window.setTimeout(() => setBrowser(null), 700)
      const closeSpoken = closed > 0 || browser ? spoken : 'Nothing is open right now — no tabs to close.'
      setStatus(closed > 0 || browser ? statusText : 'Nothing to close')
      say('syrax', closeSpoken)
      await sayOutLoud(closeSpoken)
      return
    }

    // plain reply (trimmed — whitespace-only must never create a silent bubble)
    const reply = (cmd.text ?? '').trim() || 'Sorry, I did not catch that.'
    setStatus('💬 Answering…')
    say('syrax', reply)
    await sayOutLoud(reply)
  }

  function toggleMic() {
    // ⏹ while Syrax speaks: stop the voice, restore the mic to what it was
    if (phase === 'speaking') {
      stopSpeaking()
      if (micRef.current) {
        void recognizerRef.current?.start()
        setPhase('listening')
        setStatus('Stopped speaking — listening')
      } else {
        settle()
        setStatus('Stopped')
      }
      return
    }
    stopSpeaking()
    if (micOn) {
      // stopping the mic also cancels a half-heard phrase
      if (finalTimer.current) window.clearTimeout(finalTimer.current)
      finalTimer.current = null
      finalBuf.current = ''
      recognizerRef.current?.stop()
      micRef.current = false
      setMicOn(false)
      setPhase('idle')
      setStatus('Tap the mic — or click an operation')
    } else {
      // permission FIRST (real browser prompt), then listen — this replaces
      // the cryptic "blocked mid-task" failure the user kept hitting
      // (no tab is opened here — tabs open ONLY when a command executes)
      void (async () => {
        if (!(await ensureMicPermission())) {
          closeReserve() // no mic → no command coming → drop the splash
          setStatus('Microphone blocked — use the Retry button below')
          return
        }
        try {
          await recognizerRef.current?.start()
        } catch {
          /* start raced — the isActive check below reports it honestly */
        }
        // a DEAD start must never fake "Listening…" — that is exactly the
        // "animation and nothing else" bug (splash + rings, zero results)
        if (!recognizerRef.current?.isActive) {
          closeReserve()
          setPhase('idle')
          setStatus('Speech service did not start — tap the mic to retry')
          say(
            'syrax',
            'The speech service didn’t start — tap the mic once more, or type your command instead.',
          )
          return
        }
        lastSttAt.current = Date.now()
        sttHeals.current = 0
        micRef.current = true
        setMicOn(true)
        setPhase('listening')
        setInterim('')
        setStatus('Listening… go ahead')
      })()
    }
  }

  function submitDraft(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void handleSaid(text)
  }

  const meta = PHASE_META[phase]

  return (
    <div
      className="grid hud-root h-full w-full grid-rows-[auto_1fr] font-sans text-slate-200 select-none"
      style={{
        background:
          'radial-gradient(1100px 420px at 50% -8%, rgba(59,130,246,0.16), transparent 62%),' +
          'radial-gradient(750px 520px at 8% 108%, rgba(59,130,246,0.10), transparent 65%),' +
          'radial-gradient(750px 520px at 92% 108%, rgba(59,130,246,0.10), transparent 65%),' +
          '#040711',
      }}
    >
      {/* ── TOP: SYRAX wordmark — wraps to two tidy rows on phones ──────── */}
      <header className="hud datastream relative flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#3B82F6]/20 bg-[#3B82F6]/[0.03] px-4 py-2.5 sm:px-6">
        <div className="order-2 w-auto text-[10px] tracking-[0.25em] text-[#3B82F6]/50 uppercase sm:order-1 sm:w-44">SYRAX — Mark 1</div>

        {/* hero wordmark — bold, glowing, unmistakably Syrax */}
        <div className="pointer-events-none relative order-1 flex w-full flex-col items-center justify-center sm:order-2 sm:w-auto">
          <div className="relative">
            {/* blue bloom behind the letters */}
            <span
              aria-hidden
              className="absolute inset-0 animate-[micring_3.2s_ease-in-out_infinite] text-[44px] font-black tracking-[0.42em] text-[#3B82F6] blur-2xl opacity-45 select-none sm:text-[68px]"
              style={{ lineHeight: 1 }}
            >
              SYRAX
            </span>
            <h1
              className="relative text-[44px] leading-none font-black tracking-[0.42em] text-transparent select-none sm:text-[68px]"
              style={{
                background: 'linear-gradient(180deg, #ffffff 8%, #CFE3FF 38%, #3B82F6 72%, #1E40AF 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 3px 14px rgba(59,130,246,0.42))',
                marginRight: '-0.42em', // optical centering (trailing letter-space)
              }}
            >
              SYRAX
            </h1>
          </div>
          <span className="mt-1 text-[9.5px] tracking-[0.55em] text-[#3B82F6]/85 uppercase" style={{ paddingLeft: '0.55em' }}>
            voice agent
          </span>
        </div>

        <div className="order-3 flex w-auto justify-end sm:w-44">
          <span className={`flex items-center gap-2 rounded-full border border-[#3B82F6]/40 bg-[#3B82F6]/[0.07] px-3 py-1 text-[10px] tracking-widest uppercase text-slate-300`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${meta.pulse}`} />
            {meta.label}
          </span>
        </div>
      </header>

      {/* ── MAIN: operations | orb | chat — stacks & scrolls on phones ─── */}
      <div className="grid min-h-0 grid-cols-1 gap-3 overflow-x-hidden overflow-y-auto p-3 lg:grid-cols-[minmax(200px,250px)_1fr_minmax(260px,330px)] lg:overflow-visible">
        {/* LEFT: operations */}
        <aside className="flex min-h-0 flex-col gap-3">
          <div className="hud hud-panel panel-glow flex min-h-0 flex-1 flex-col rounded-2xl border border-[#3B82F6]/18 bg-[#3B82F6]/[0.045] backdrop-blur-sm">
            <header className="border-b border-[#3B82F6]/15 px-4 py-2.5">
              <h2 className="text-[10px] font-semibold tracking-[0.25em] text-[#3B82F6] uppercase">Operations</h2>
              <p className="mt-0.5 text-[11px] text-[#3B82F6]/50">Click one, or ask by voice</p>
            </header>
            <div className="flex max-h-[34vh] flex-1 flex-col gap-1.5 overflow-y-auto p-2.5 lg:max-h-none">
              {OPERATIONS.map((op) => {
                const active = activeOp === op.id
                return (
                  <button
                    key={op.id}
                    onClick={() => {
                      stopSpeaking()
                      if (op.id === 'ask') {
                        inputRef.current?.focus()
                        setStatus('Type your question below ↓')
                        return
                      }
                      void run(op.canned)
                    }}
                    className={`group hud-scan flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-300 ${
                      active
                        ? 'border-[#3B82F6]/65 bg-[#3B82F6]/15 shadow-[0_0_24px_rgba(59,130,246,0.3)]'
                        : 'border-[#3B82F6]/15 bg-[#3B82F6]/[0.04] hover:border-[#3B82F6]/45 hover:bg-[#3B82F6]/[0.09]'
                    }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/45 text-sm transition-transform duration-200 group-hover:scale-110">
                      {op.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-slate-100">{op.label}</span>
                      <span className="block truncate text-[10.5px] text-[#3B82F6]/55">{op.hint}</span>
                    </span>
                    {active && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#3B82F6]" />}
                  </button>
                )
              })}
            </div>
            <footer className="border-t border-[#3B82F6]/15 px-4 py-2 text-[10px] tracking-wider text-[#3B82F6]/45">
              Voice works in Chrome / Edge
            </footer>
          </div>
        </aside>

        {/* CENTER: orb + status + mic */}
        <section className="relative flex min-h-0 flex-col items-center justify-center gap-6">
          {/* halo */}
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[58%] rounded-full"
            style={{
              width: orbSize * 1.8,
              height: orbSize * 1.8,
              background: 'radial-gradient(circle, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0.05) 42%, transparent 68%)',
            }}
          />

          {/* the orb — animation swaps with phase */}
          <div className="relative z-10">
            <OrbCanvas size={orbSize} state={PHASE_ORB[phase]} tint="#3B82F6" />
          </div>

          {/* live action line — looping blue border, shimmering text */}
          <div className="syrax-loop relative z-10 w-full max-w-lg rounded-2xl p-[1.5px]">
            <div className="rounded-2xl bg-[#050D1D]/92 px-5 py-3 text-center backdrop-blur-sm">
              <span className="caret syrax-shimmer text-[13.5px] font-semibold tracking-wide">{status}</span>
            </div>
          </div>

          {/* Now-Playing strip (user request) — animated equalizer, same HUD style */}
          {nowPlaying && (
            <div className="nowplaying relative z-10 flex items-center gap-3 rounded-full border border-[#3B82F6]/45 bg-[#050D1D]/92 px-4 py-2 backdrop-blur-sm">
              <span className="eq" aria-hidden>
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="min-w-0 max-w-[240px] truncate text-[12px] font-medium text-slate-100">
                🎵 {nowPlaying}
              </span>
              <span className="np-label">playing in tab ↗</span>
            </div>
          )}

          {/* mic + live transcript */}
          <div className="relative z-10 flex flex-col items-center gap-3">
            <button
              onClick={toggleMic}
              aria-label={phase === 'speaking' ? 'Stop speaking' : 'Toggle microphone'}
              className={`relative grid h-16 w-16 place-items-center rounded-full border bg-black/70 text-xl backdrop-blur-md transition-all duration-200 hover:scale-105 ${
                micOn || phase === 'speaking'
                  ? 'border-[#3B82F6] shadow-[0_0_34px_rgba(59,130,246,0.55)] animate-[micring_1.4s_infinite]'
                  : 'border-[#3B82F6]/45 hover:border-[#3B82F6]/85 hover:shadow-[0_0_24px_rgba(59,130,246,0.35)]'
              }${micOn && phase !== 'speaking' ? ' mic-live' : ''}`}
            >
              {phase === 'speaking' ? '⏹' : micOn ? '◼' : '🎤'}
            </button>
            <p className="max-w-md min-h-[18px] text-center text-sm text-[#3B82F6]/75">
              {phase === 'speaking'
                ? 'Tap ⏹ to stop Syrax'
                : micOn
                  ? interim || 'Listening… go ahead'
                  : 'Tap the mic to talk to Syrax'}
            </p>
            {/* JARVIS-style telemetry strip */}
            <div className="telemetry relative z-10" aria-hidden>
              <span className="tick" />
              <span>neural link online</span>
              <span className="opacity-40">|</span>
              <span>stt en-in</span>
              <span className="opacity-40">|</span>
              <span>core: deepseek-flash</span>
              <span className="opacity-40">|</span>
              <span>syrax os v1.0</span>
            </div>
            {micBlocked && !micOn && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => void retryMic()}
                  className="rounded-full border border-[#3B82F6]/50 bg-[#3B82F6]/10 px-4 py-1.5 text-xs font-medium text-[#3B82F6] transition-all hover:bg-[#3B82F6]/20 hover:shadow-[0_0_16px_rgba(59,130,246,0.35)]"
                >
                  🔓 Retry microphone
                </button>
                <button
                  onClick={() => setMicBlocked(false)}
                  title="Dismiss"
                  className="grid h-6 w-6 place-items-center rounded-full border border-[#3B82F6]/30 text-[11px] text-[#3B82F6]/70 transition-colors hover:bg-[#3B82F6]/15 hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: conversation */}
        <aside className="hud hud-panel panel-glow flex min-h-0 flex-col rounded-2xl border border-[#3B82F6]/18 bg-[#3B82F6]/[0.045] backdrop-blur-sm">
          <header className="flex items-center justify-between border-b border-[#3B82F6]/15 px-4 py-2.5">
            <div>
              <h2 className="text-[10px] font-semibold tracking-[0.25em] text-[#3B82F6] uppercase">Conversation</h2>
              <p className="mt-0.5 text-[11px] text-[#3B82F6]/50">You ↔ Syrax</p>
            </div>
            <button
              onClick={() => setKeyOpen(true)}
              title={hasDSKey() ? 'Brain key installed — tap to change' : 'Add your DeepSeek API key'}
              className="relative grid h-7 w-7 place-items-center rounded-lg border border-[#3B82F6]/30 text-[13px] text-[#3B82F6]/80 transition-colors hover:border-[#3B82F6]/70 hover:bg-[#3B82F6]/15 hover:text-white"
            >
              🔑
              <span
                className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ${
                  hasDSKey() ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]' : 'bg-amber-400'
                }`}
              />
            </button>
          </header>

          <div ref={chatRef} className="flex max-h-[46vh] min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3 lg:max-h-none">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`group msg max-w-[90%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                  m.who === 'you'
                    ? 'self-end border border-[#3B82F6]/40 bg-[#3B82F6]/15 text-slate-100'
                    : 'msg-syrax self-start border border-[#3B82F6]/25 bg-[#3B82F6]/[0.07] text-slate-200'
                }`}
              >
                <div
                  className={`mb-0.5 text-[9.5px] font-semibold tracking-widest uppercase ${
                    m.who === 'you' ? 'text-[#3B82F6]/70' : 'text-[#3B82F6]'
                  }`}
                >
                  {m.who === 'you' ? 'You' : 'Syrax'}
                </div>
                <div className="flex items-end gap-2">
                  <span className="min-w-0 flex-1">
                    {m.text}
                    {m.href && (
                      <a
                        href={m.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1.5 font-semibold text-[#3B82F6] underline underline-offset-2 transition-colors hover:text-white"
                      >
                        Open ↗
                      </a>
                    )}
                  </span>
                  {m.who === 'you' && (
                    <button
                      onClick={() => {
                        setDraft(m.text)
                        inputRef.current?.focus()
                      }}
                      title="Edit & resend"
                      className="shrink-0 self-end rounded border border-[#3B82F6]/30 px-1.5 py-0.5 text-[10px] text-[#3B82F6]/70 opacity-40 transition group-hover:opacity-100 hover:bg-[#3B82F6]/20 hover:text-white"
                    >
                      ✎
                    </button>
                  )}
                </div>
              </div>
            ))}
            {phase === 'thinking' && (
              <div className="flex items-center gap-1.5 self-start rounded-2xl border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-4 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#3B82F6] [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#3B82F6] [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#3B82F6]" />
              </div>
            )}
          </div>

          {/* video transport — play/pause whatever the panel is showing */}
          {browser?.videoId && (
            <div className="flex items-center gap-2 border-t border-[#3B82F6]/15 px-2.5 py-1.5">
              <button
                onClick={toggleVideo}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#3B82F6]/40 bg-[#3B82F6]/10 px-3 py-1 text-[11px] font-medium text-[#3B82F6] transition-colors hover:bg-[#3B82F6]/20"
                title={videoPlaying ? 'Pause the video' : 'Play the video'}
              >
                {videoPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <span className="truncate text-[10.5px] text-[#3B82F6]/45">{browser.query || 'Video panel'}</span>
            </div>
          )}

          <form onSubmit={submitDraft} className="flex gap-1.5 border-t border-[#3B82F6]/15 p-2.5">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message to Syrax…"
              className="min-w-0 flex-1 rounded-xl border border-[#3B82F6]/25 bg-black/45 px-3 py-2 text-[13px] text-slate-100 placeholder:text-[#3B82F6]/35 focus:border-[#3B82F6]/70 focus:outline-none"
            />
            <button
              type="submit"
              className="grid w-10 shrink-0 place-items-center rounded-xl bg-[#3B82F6] font-bold text-white transition-all hover:brightness-110 active:scale-95"
              aria-label="Send"
            >
              ↑
            </button>
          </form>
        </aside>
      </div>

      {/* ── About Syrax overlay ───────────────────────────────────────── */}
      {/* 🧠 one-time brain key setup — per device, never leaves the browser */}
      {keyOpen && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-6 backdrop-blur-md"
          onClick={() => setKeyOpen(false)}
        >
          <div
            className="hud w-full max-w-md rounded-3xl border border-[#3B82F6]/40 bg-[#071022]/95 p-6 shadow-[0_0_80px_rgba(59,130,246,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-black tracking-[0.3em] text-[#3B82F6] uppercase">🧠 Brain key</h2>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
                  Paste your DeepSeek API key once — it is saved <span className="text-[#93C5FD]">only in this browser</span>
                  (never in the code or on GitHub) and powers my deepseek-flash replies.
                </p>
              </div>
              <button
                onClick={() => setKeyOpen(false)}
                aria-label="Close"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#3B82F6]/30 text-[#3B82F6]/80 transition-colors hover:bg-[#3B82F6]/20 hover:text-white"
              >
                ✕
              </button>
            </div>

            <input
              autoFocus
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const k = keyDraft.trim()
                  if (k) {
                    setDSKey(k)
                    say('syrax', 'Brain connected — deepseek-flash is live. Ask me anything.')
                  }
                  setKeyDraft('')
                  setKeyOpen(false)
                }
              }}
              placeholder="sk-…"
              className="mt-4 w-full rounded-xl border border-[#3B82F6]/30 bg-black/40 px-3 py-2.5 font-mono text-[13px] text-white outline-none transition-colors focus:border-[#3B82F6]"
            />

            <div className="mt-3 flex items-center justify-between gap-2">
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#3B82F6] underline underline-offset-2 transition-colors hover:text-white"
              >
                Get a key ↗
              </a>
              <div className="flex gap-2">
                {hasDSKey() && (
                  <button
                    onClick={() => {
                      setDSKey('')
                      setKeyDraft('')
                    }}
                    className="rounded-lg border border-red-400/40 px-3 py-1.5 text-[11px] text-red-300 transition-colors hover:bg-red-500/15"
                  >
                    Remove
                  </button>
                )}
                <button
                  onClick={() => {
                    const k = keyDraft.trim()
                    if (k) {
                      setDSKey(k)
                      say('syrax', 'Brain connected — deepseek-flash is live. Ask me anything.')
                    }
                    setKeyDraft('')
                    setKeyOpen(false)
                  }}
                  className="rounded-lg bg-[#3B82F6] px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#2563EB]"
                >
                  Save
                </button>
              </div>
            </div>

            <p className="mt-3 text-[10.5px] text-slate-500">
              No key? Every voice command still works and Syrax answers with offline replies.
            </p>
          </div>
        </div>
      )}

      {aboutOpen && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6 backdrop-blur-md"
          onClick={() => setAboutOpen(false)}
        >
          <div
            className="hud relative max-h-[86vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[#3B82F6]/40 bg-[#071022]/95 p-7 shadow-[0_0_80px_rgba(59,130,246,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAboutOpen(false)}
              aria-label="Close about"
              className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-lg border border-[#3B82F6]/30 text-[#3B82F6]/80 transition-colors hover:bg-[#3B82F6]/20 hover:text-white"
            >
              ✕
            </button>

            <div className="pr-9">
              <h2
                className="text-3xl font-black tracking-[0.3em] text-transparent"
                style={{
                  background: 'linear-gradient(180deg, #ffffff 10%, #CFE3FF 45%, #3B82F6 85%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                }}
              >
                SYRAX
              </h2>
              <p className="mt-1 text-[10px] tracking-[0.42em] text-[#3B82F6]/80 uppercase" style={{ paddingLeft: '0.42em' }}>
                your voice ai assistant
              </p>
            </div>

            <p className="mt-5 text-[13.5px] leading-relaxed text-slate-300">{ABOUT_INTRO}</p>
            <p className="mt-3 text-[14px] leading-relaxed font-semibold text-[#93C5FD]">{ABOUT_PUNCHLINE}</p>

            <h3 className="mt-6 text-[10px] font-semibold tracking-[0.3em] text-[#3B82F6] uppercase">What I can do</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ABOUT_OPERATIONS.map((op) => (
                <div
                  key={op.label}
                  className="flex items-center gap-2.5 rounded-xl border border-[#3B82F6]/18 bg-[#3B82F6]/[0.05] px-3 py-2.5"
                >
                  <span className="text-base">{op.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-slate-100">{op.label}</span>
                    <span className="block truncate text-[10.5px] text-[#3B82F6]/60">{op.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GSAP zoom browser overlay */}
      <BrowserPanel
        open={browserOpen}
        docked={docked}
        browser={browser}
        autoplay={autoplay}
        onClose={() => {
          setBrowserOpen(false)
          setVideoPlaying(false)
          if (closeTimer.current) window.clearTimeout(closeTimer.current)
          closeTimer.current = window.setTimeout(() => setBrowser(null), 700)
        }}
        onDock={() => setDocked((d) => !d)}
        onSearch={(q) => {
          // home search bar → resolve + autoplay the top hit
          setBrowser({ target: 'youtube', query: q, ytPending: !!q.trim() })
          setAutoplay(true)
          if (q.trim()) resolveInto(q.trim())
        }}
        onPick={(videoId, title) => {
          // clicked a thumbnail in the home grid → swap straight to the video
          setBrowser({ target: 'youtube', query: title, videoId })
          setAutoplay(true)
          setVideoPlaying(true)
          quietMic() // playing audio — mic must stay out of the loop
        }}
      />
    </div>
  )
}
