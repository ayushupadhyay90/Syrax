import { useEffect, useRef, useState } from 'react'
import { Background } from './three/Background'
import { SpeechRecognizer } from './voice/stt'
import { speak, stopSpeaking } from './voice/tts'
import { askSyrax, type ChatMessage, type AgentCommand } from './ai/syrax'
import { ABOUT_SPOKEN, ABOUT_TEXT } from './ai/about'
import { BrowserPanel, type BrowserTarget } from './browser/BrowserPanel'
import Chunk1 from './chunks/Chunk1'
import Stage from './chunks/Stage'

type State = 'idle' | 'listening' | 'thinking' | 'speaking'

const STATE_COLORS: Record<State, string> = {
  idle: '#3b82f6', // blue
  listening: '#22c55e', // green
  thinking: '#a855f7', // purple
  speaking: '#06b6d4', // cyan
}

const STATE_DOT: Record<State, string> = {
  idle: 'bg-blue-500',
  listening: 'bg-emerald-500 animate-pulse',
  thinking: 'bg-purple-500 animate-pulse',
  speaking: 'bg-cyan-500 animate-pulse',
}

export default function App() {
  // Chunk-based development:
  //   /                 → Stage (operations · orb · chat)
  //   /?view=chunk1     → Chunk 1 (orb block only)
  //   /?view=full       → full voice-agent HUD
  const [view] = useState(() => new URLSearchParams(window.location.search).get('view'))
  if (view === 'chunk1') return <Chunk1 />
  if (view === 'full') return <FullApp />
  return <Stage />
}

function FullApp() {
  const [state, setState] = useState<State>('idle')
  const [interim, setInterim] = useState('')
  const [transcript, setTranscript] = useState('')
  const [log, setLog] = useState<{ who: 'you' | 'Syrax'; text: string }[]>([])
  const [browserOpen, setBrowserOpen] = useState(false)
  const [docked, setDocked] = useState(false)
  const [browser, setBrowser] = useState<BrowserTarget | null>(null)
  const [micOn, setMicOn] = useState(false)

  const historyRef = useRef<ChatMessage[]>([])
  const recognizerRef = useRef<SpeechRecognizer | null>(null)

  // particle intensity per state (mic level is added inside the particle loop)
  const intensity = state === 'listening' ? 0.5 : state === 'thinking' ? 0.8 : state === 'speaking' ? 1 : 0.15

  useEffect(() => {
    recognizerRef.current = new SpeechRecognizer({
      onInterim: (text) => setInterim(text),
      onFinal: (text) => {
        setInterim('')
        setTranscript(text)
        void handleUserSaid(text)
      },
      onError: (err) => {
        console.warn('STT:', err)
        setLog((l) => [...l, { who: 'Syrax', text: `Voice error: ${err}` }])
        setMicOn(false)
        setState('idle')
      },
    })
    return () => recognizerRef.current?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleUserSaid(text: string) {
    if (!text) return
    setLog((l) => [...l, { who: 'you', text }])
    historyRef.current.push({ role: 'user', content: text })
    setState('thinking')

    try {
      const cmd = await askSyrax(historyRef.current)
      await executeCommand(cmd)
    } catch {
      const msg = 'I could not reach my brain (is the FastAPI server running?)'
      setLog((l) => [...l, { who: 'Syrax', text: msg }])
      setState('idle')
      void speak(msg)
    }
  }

  async function executeCommand(cmd: AgentCommand) {
    // JSON-shaped assistant turns — plain-text turns make DeepSeek return
    // whitespace-only 200s (reproduced); JSON history answers first-try
    historyRef.current.push({
      role: 'assistant',
      content: JSON.stringify({
        reply: cmd.type === 'reply' ? cmd.text : `[${cmd.type}]`,
        action: { type: 'none' },
      }),
    })

    if (cmd.type === 'open') {
      setBrowser({ target: cmd.target, query: cmd.query })
      setBrowserOpen(true)
      setDocked(false)
      const text = cmd.query ? `Opening ${cmd.target} for "${cmd.query}".` : `Opening ${cmd.target}.`
      setLog((l) => [...l, { who: 'Syrax', text }])
      setState('speaking')
      await speak(text)
      setState('idle')
      return
    }

    if (cmd.type === 'close') {
      setBrowserOpen(false)
      setLog((l) => [...l, { who: 'Syrax', text: 'Closing the browser.' }])
      setState('speaking')
      await speak('Closing the browser.')
      setState('idle')
      return
    }

    if (cmd.type === 'about') {
      setLog((l) => [...l, { who: 'Syrax', text: ABOUT_TEXT }])
      setState('speaking')
      await speak(ABOUT_SPOKEN)
      setState('idle')
      return
    }

    if (cmd.type === 'play') {
      const text = `Playing ${cmd.query || 'some music'} for you.`
      setLog((l) => [...l, { who: 'Syrax', text }])
      setState('speaking')
      await speak(text)
      setState('idle')
      return
    }

    const reply = cmd.text || 'Sorry, I did not catch that.'
    setLog((l) => [...l, { who: 'Syrax', text: reply }])
    setState('speaking')
    await speak(reply)
    setState('idle')
  }

  function toggleMic() {
    stopSpeaking()
    if (micOn) {
      recognizerRef.current?.stop()
      setMicOn(false)
      setState('idle')
    } else {
      void recognizerRef.current?.start()
      setMicOn(true)
      setState('listening')
      setInterim('')
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05060a] font-sans text-slate-200 select-none">
      <Background intensity={intensity} color={STATE_COLORS[state]} />

      {/* top-right: status pill */}
      <header className="absolute top-5 right-6 z-10">
        <div className="flex items-center gap-2 rounded-full border border-slate-400/25 bg-slate-900/70 px-4 py-2 text-sm tracking-widest capitalize backdrop-blur-md">
          <span className={`h-2.5 w-2.5 rounded-full ${STATE_DOT[state]}`} />
          {state}
        </div>
      </header>

      {/* center: mic + transcript */}
      <main className="pointer-events-none absolute inset-0 z-5 flex flex-col items-center justify-center gap-5">
        <button
          onClick={toggleMic}
          aria-label="Toggle microphone"
          className={`pointer-events-auto grid h-20 w-20 place-items-center rounded-full border bg-slate-900/75 text-2xl backdrop-blur-md transition-all duration-200 hover:scale-105 ${
            micOn
              ? 'border-emerald-500 shadow-[0_0_34px_rgba(34,197,94,0.55)] animate-[micring_1.4s_infinite]'
              : 'border-slate-400/40 hover:border-slate-300'
          }`}
        >
          {micOn ? '◼' : '🎤'}
        </button>
        <p className="max-w-xl text-center text-base text-slate-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          {micOn ? interim || 'Listening…' : transcript || 'Tap the mic and speak to Syrax'}
        </p>
      </main>

      {/* bottom: conversation log */}
      <footer className="absolute bottom-5 left-1/2 z-10 flex w-[min(680px,92vw)] -translate-x-1/2 flex-col gap-1.5 text-[13.5px]">
        {log.slice(-5).map((m, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-400/15 bg-slate-900/65 px-3 py-1.5 backdrop-blur-sm"
          >
            <b className={m.who === 'you' ? 'text-emerald-400' : 'text-cyan-400'}>
              {m.who === 'you' ? 'You' : 'Syrax'}:
            </b>{' '}
            {m.text}
          </div>
        ))}
      </footer>

      <BrowserPanel
        open={browserOpen}
        docked={docked}
        browser={browser}
        onClose={() => {
          setBrowserOpen(false)
          setTimeout(() => setBrowser(null), 700)
        }}
        onDock={() => setDocked((d) => !d)}
      />
    </div>
  )
}
