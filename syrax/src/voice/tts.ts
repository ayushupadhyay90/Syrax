/**
 * Text-to-Speech — voice chain (first that works wins):
 *   1. Fish Audio  → POST /api/tts (FastAPI proxy; key stays server-side)
 *   2. Pocket TTS  → POST {VITE_POCKET_TTS_URL}/speak (local Syrax voice)
 *   3. Browser     → speechSynthesis (always available)
 */
const POCKET_TTS_URL = import.meta.env.VITE_POCKET_TTS_URL ?? 'http://localhost:8100'
const VOICE = import.meta.env.VITE_SYRAX_VOICE ?? 'male_1'

/** Cache so we don't re-hit /api/tts on every line when no Fish key exists. */
let fishEnabled: boolean | null = null
/** When Pocket TTS last failed — skip it for 60s instead of re-waiting on
 *  every single line (localhost isn't there on the live site). */
let pocketDown = 0

let audio: HTMLAudioElement | null = null
let speaking = false

export function isSpeaking() {
  return speaking
}

export function stopSpeaking() {
  speaking = false
  if (audio) {
    audio.pause()
    audio.src = ''
    audio = null
  }
  window.speechSynthesis.cancel()
}

export async function speak(text: string): Promise<void> {
  if (!text.trim()) return
  speaking = true
  try {
    if (await fishSpeak(text)) return
    if (await pocketSpeak(text)) return
    await browserSpeak(text)
  } finally {
    speaking = false
  }
}

/** 1) Fish Audio via the backend proxy — premium neural voice. */
async function fishSpeak(text: string): Promise<boolean> {
  if (fishEnabled === false) return false
  const ctrl = new AbortController()
  const to = window.setTimeout(() => ctrl.abort(), 8000) // never stall the voice
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      fishEnabled = false // no backend (404) / no Fish key (503) → stop asking
      return false
    }
    const blob = await res.blob()
    if (!blob.size) return false
    fishEnabled = true
    await play(URL.createObjectURL(blob))
    return true
  } catch {
    fishEnabled = false
    return false
  } finally {
    window.clearTimeout(to)
  }
}

/** 2) Pocket TTS local server (the original Syrax voice). */
async function pocketSpeak(text: string): Promise<boolean> {
  if (Date.now() - pocketDown < 60_000) return false // known-down → don't re-wait
  const ctrl = new AbortController()
  const to = window.setTimeout(() => ctrl.abort(), 1000) // local server → fast fail
  try {
    const res = await fetch(`${POCKET_TTS_URL}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ text, voice: VOICE }),
    })
    if (!res.ok) {
      pocketDown = Date.now()
      return false
    }
    const blob = await res.blob()
    if (!blob.size) return false
    await play(URL.createObjectURL(blob))
    return true
  } catch {
    pocketDown = Date.now() // not running / blocked → straight to browser voice
    return false
  } finally {
    window.clearTimeout(to)
  }
}

function play(url: string): Promise<void> {
  return new Promise((resolve) => {
    audio = new Audio(url)
    audio.onended = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    audio.onerror = () => resolve()
    audio.play().catch(() => resolve())
  })
}

function browserSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    // JARVIS-ish: prefer a deeper male voice, slightly slower, lower pitch
    const voices = window.speechSynthesis.getVoices()
    const voice =
      voices.find((v) => /(daniel|david|ryan|alex|george|fred|male)/i.test(v.name) && v.lang.startsWith('en')) ??
      voices.find((v) => v.lang.startsWith('en')) ??
      null
    if (voice) u.voice = voice
    u.rate = 1.1 // snappier — replies feel instant instead of dragging
    u.pitch = 0.8
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}
