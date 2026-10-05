/**
 * Speech-to-Text via the Web Speech API (Google's speech recognition, built into
 * Chrome/Edge) — pure JavaScript, free, no API key, real-time interim results.
 *
 * A separate mic analyser runs alongside recognition purely to feed live voice
 * amplitude (micLevel) to the 3D particle field.
 */
import { micLevel } from './level'

export type SpeechHandlers = {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onError?: (err: string) => void
}

/* Minimal typing — SpeechRecognition is not in the standard TS DOM lib. */
type SpeechResult = { isFinal: boolean; 0: { transcript: string } }
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }

/**
 * Recognition language. 'en-IN' = Google's Indian-English model — noticeably
 * better accuracy for Indian accents while still understanding standard
 * English. Change to 'en-US' / 'en-GB' if you prefer.
 */
const STT_LANG = 'en-IN'
type RecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export class SpeechRecognizer {
  private rec: RecognitionLike | null = null
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private raf = 0
  private active = false
  private lastFinal = { text: '', at: 0 }
  private restartTimer = 0

  constructor(private handlers: SpeechHandlers) {}

  /**
   * Guard against phantom commands: drop filler-only noise ("uh", "hmm") and
   * Chrome's tendency to emit the same final transcript twice in a row.
   */
  private acceptFinal(text: string): boolean {
    const t = text.toLowerCase().replace(/[.!?]+$/, '').trim()
    if (/^(uh+|um+|er+|ah+|hmm+|mhm+|mm+|huh+|na|ah)$/.test(t)) return false
    const now = Date.now()
    if (t === this.lastFinal.text && now - this.lastFinal.at < 2500) return false
    this.lastFinal = { text: t, at: now }
    return true
  }

  get isActive() {
    return this.active
  }

  async start(): Promise<void> {
    if (this.active) return

    const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) {
      // Phone case: the link often gets opened inside WhatsApp/Facebook's
      // in-app browser, which has no Web Speech API at all.
      const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
      this.handlers.onError?.(
        phone
          ? 'Voice needs the Chrome app — open this page in Google Chrome (not WhatsApp/Facebook’s in-app browser), then tap the mic again.'
          : 'Speech recognition is not supported here — please use Chrome or Edge.',
      )
      return
    }

    this.active = true
    this.startLevelMeter() // particle reactivity (best-effort)

    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = STT_LANG

    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          const text = r[0].transcript.trim()
          if (text && this.acceptFinal(text)) this.handlers.onFinal(text)
        } else {
          interim += r[0].transcript
        }
      }
      if (interim.trim()) this.handlers.onInterim(interim.trim())
    }

    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return // harmless, keep listening
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false // dead session — never restart-loop a permission error
      }
      this.handlers.onError?.(e.error)
    }

    rec.onend = () => {
      // Chrome — Android ESPECIALLY — ends the session after a short silence.
      // Restarting synchronously inside onend throws InvalidStateError on many
      // builds and silently KILLS listening ("mic ring on, but it can't hear
      // me") — so retry on a short delay while the user still wants to listen.
      if (!this.active) return
      const attempt = (n: number) => {
        if (!this.active || this.rec !== rec) return // stopped or replaced
        try {
          rec.start()
        } catch {
          if (n < 6) this.restartTimer = window.setTimeout(() => attempt(n + 1), 350)
        }
      }
      this.restartTimer = window.setTimeout(() => attempt(0), 300)
    }

    this.rec = rec
    try {
      rec.start()
    } catch {
      this.active = false
    }
  }

  stop(): void {
    this.active = false
    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer)
      this.restartTimer = 0
    }
    micLevel.value = 0
    cancelAnimationFrame(this.raf)
    this.rec?.stop()
    this.rec = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.ctx?.close()
    this.ctx = null
    this.analyser = null
  }

  /** Live RMS amplitude 0..1 → shared with the particle render loop. */
  private startLevelMeter(): void {
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((stream) => {
        if (!this.active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        this.stream = stream
        this.ctx = new AudioContext()
        const src = this.ctx.createMediaStreamSource(stream)
        this.analyser = this.ctx.createAnalyser()
        this.analyser.fftSize = 512
        src.connect(this.analyser)

        const buf = new Uint8Array(this.analyser.fftSize)
        const tick = () => {
          if (!this.active || !this.analyser) return
          this.analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128
            sum += v * v
          }
          micLevel.value = Math.min(1, Math.sqrt(sum / buf.length) * 4)
          this.raf = requestAnimationFrame(tick)
        }
        this.raf = requestAnimationFrame(tick)
      })
      .catch(() => {
        /* level meter is optional — recognition has its own mic access */
      })
  }
}
