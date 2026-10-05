import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

export type BrowserTarget = {
  target: 'youtube' | 'google'
  query: string
  /** Resolved YouTube video id (via /api/youtube). */
  videoId?: string
  /** true while the query is still resolving → show the search splash. */
  ytPending?: boolean
}

/**
 * Embedded browser (iframe) with GSAP zoom choreography:
 *  1. Zooms IN full-screen from the top-right corner
 *  2. Renders YouTube (real video embed — resolved via /api/youtube because
 *     YouTube killed `listType=search` embeds) or Google results
 *  3. Zooms OUT and docks into the top-right corner widget
 */
export function BrowserPanel({
  open,
  docked,
  browser,
  autoplay = false,
  onClose,
  onDock,
  onSearch,
  onPick,
}: {
  open: boolean
  docked: boolean
  browser: BrowserTarget | null
  autoplay?: boolean
  onClose: () => void
  onDock: () => void
  /** Search from the home screen's bar → Stage resolves + opens the results. */
  onSearch?: (query: string) => void
  /** Clicked a video in the home grid → Stage swaps the panel to that embed. */
  onPick?: (videoId: string, title: string) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const el = panelRef.current
    if (!el || !browser || !open) return

    if (!docked) {
      // zoom in from the corner → full screen
      gsap.fromTo(
        el,
        {
          opacity: 0,
          scale: 0.25,
          xPercent: 45,
          yPercent: -45,
          transformOrigin: '100% 0%',
          borderRadius: 24,
        },
        { opacity: 1, scale: 1, xPercent: 0, yPercent: 0, borderRadius: 14, duration: 0.7, ease: 'power4.inOut' },
      )
    } else {
      // zoom out → dock into top-right corner
      gsap.to(el, {
        opacity: 0.95,
        scale: 0.28,
        xPercent: 45,
        yPercent: -45,
        transformOrigin: '100% 0%',
        borderRadius: 24,
        duration: 0.65,
        ease: 'power4.inOut',
      })
    }
    // ⚠ ONLY open/docked — `browser` updates when a video id resolves in the
    // background; re-running the zoom then re-animates the whole panel over
    // the freshly-started video (stutter that looks like a pause/buffer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docked])

  /**
   * Autoplay nudge — `autoplay=1` alone is sometimes ignored when the command
   * came from voice (no fresh user gesture). The embed exposes the YouTube
   * IFrame API (enablejsapi), so we ask it to play on load + once more shortly
   * after, which succeeds whenever the frame has the autoplay allow-policy.
   */
  useEffect(() => {
    if (!autoplay || !browser?.videoId || !open) return
    const post = (fn: string) =>
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: fn, args: [] }), '*')
    const t1 = window.setTimeout(() => post('playVideo'), 900)
    const t2 = window.setTimeout(() => post('playVideo'), 1800) // before a human can press pause
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [autoplay, browser?.videoId, open])

  if (!browser) return null

  /** YouTube panel shows a splash until a real video id is resolved. */
  const ytSplash = browser.target === 'youtube' && !browser.videoId

  const ytEmbed = `https://www.youtube.com/embed/${browser.videoId ?? ''}?enablejsapi=1&rel=0&playsinline=1${
    autoplay ? '&autoplay=1' : ''
  }&origin=${encodeURIComponent(window.location.origin)}`

  const src =
    browser.target === 'youtube' ? ytEmbed : `https://www.google.com/search?igu=1&q=${encodeURIComponent(browser.query)}`

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden rounded-[14px] bg-[#12020a] shadow-[0_30px_90px_rgba(243,13,118,0.28)] ring-1 ring-[#F30D76]/35"
      style={{ visibility: open ? 'visible' : 'hidden', willChange: 'transform, opacity' }}
    >
      {/* chrome — magenta theme */}
      <div className="flex items-center gap-2 border-b border-[#F30D76]/25 bg-[#1c0412] px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#F30D76]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#F30D76]/55" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#F30D76]/30" />
        <div className="mx-2.5 flex-1 truncate rounded-full border border-[#F30D76]/25 bg-black/60 px-3.5 py-1.5 text-xs text-[#F30D76]/85">
          {browser.target === 'youtube' ? 'youtube.com' : 'google.com'} / {browser.query || 'new tab'}
        </div>
        <button
          onClick={onDock}
          title={docked ? 'Expand' : 'Minimize to corner'}
          className="rounded-md px-2 py-1 text-[#F30D76]/70 transition-colors hover:bg-[#F30D76]/20 hover:text-white"
        >
          ⤢
        </button>
        <button
          onClick={onClose}
          title="Close"
          className="rounded-md px-2 py-1 text-[#F30D76]/70 transition-colors hover:bg-[#F30D76]/20 hover:text-white"
        >
          ✕
        </button>
      </div>
      {ytSplash ? (
        browser.ytPending ? (
          /* searching — shown instantly while /api/youtube resolves */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#0a0106]">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-[#F30D76]/25 border-t-[#F30D76]" />
            <p className="text-sm tracking-wide text-[#F30D76]/85">Searching YouTube…</p>
          </div>
        ) : browser.query ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#0a0106]">
            <span className="text-3xl">📺</span>
            <p className="text-sm tracking-wide text-[#F30D76]/85">No videos found for “{browser.query}”</p>
            <button
              onClick={() => onSearch?.('')}
              className="rounded-full border border-[#F30D76]/40 px-4 py-1.5 text-xs text-[#F30D76] transition-colors hover:bg-[#F30D76]/15"
            >
              ← Back to YouTube home
            </button>
          </div>
        ) : (
          /* YouTube homepage (real youtube.com blocks iframes → our own home) */
          <YouTubeHome onSearch={onSearch} onPick={onPick} />
        )
      ) : (
        <iframe
          ref={iframeRef}
          id="syrax-browser"
          src={src}
          title="Syrax Browser"
          onLoad={() => {
            if (!autoplay || !browser.videoId) return
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
              '*',
            )
          }}
          className="w-full flex-1 border-0 bg-[#0a0106]"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
        />
      )}
    </div>
  )
}

/* ── Mini YouTube home (youtube.com itself refuses to be iframed) ─────── */

type YTItem = { id: string; title: string }

const YT_CHIPS = [
  { label: '🔥 Trending', q: 'trending' },
  { label: '🎵 Music', q: 'popular music videos' },
  { label: '🎧 Lofi', q: 'lofi hip hop' },
  { label: '🎮 Gaming', q: 'gaming videos' },
  { label: '😂 Comedy', q: 'comedy videos' },
  { label: '📰 News', q: 'today news' },
]

function YouTubeHome({ onSearch, onPick }: { onSearch?: (q: string) => void; onPick?: (id: string, title: string) => void }) {
  const [draft, setDraft] = useState('')
  const [chip, setChip] = useState(YT_CHIPS[0].q)
  const [items, setItems] = useState<YTItem[] | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    let attempt = 0
    setState('loading')
    setItems(null)
    const load = () => {
      fetch(`/api/youtube?q=${encodeURIComponent(chip)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d: { results?: YTItem[] }) => {
          if (!live) return
          setItems(d.results ?? [])
          setState('ok')
        })
        .catch(() => {
          if (!live) return
          // weak network / cold function start → one automatic retry
          if (attempt === 0) {
            attempt = 1
            window.setTimeout(load, 1200)
          } else {
            setState('error')
          }
        })
    }
    load()
    return () => {
      live = false
    }
  }, [chip, tick])

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#0a0106] p-4">
      {/* search bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const q = draft.trim()
          if (q) onSearch?.(q)
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search YouTube…"
          className="min-w-0 flex-1 rounded-full border border-[#F30D76]/30 bg-black/60 px-4 py-2 text-sm text-slate-100 placeholder:text-[#F30D76]/40 focus:border-[#F30D76]/70 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full bg-[#F30D76] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-95"
        >
          Search
        </button>
      </form>

      {/* category chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {YT_CHIPS.map((c) => (
          <button
            key={c.q}
            onClick={() => setChip(c.q)}
            className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
              chip === c.q
                ? 'border-[#F30D76] bg-[#F30D76]/20 text-white'
                : 'border-[#F30D76]/25 text-[#F30D76]/75 hover:border-[#F30D76]/60 hover:bg-[#F30D76]/10'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* results grid */}
      {state === 'loading' && (
        <div className="flex flex-1 items-center justify-center py-10">
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-[#F30D76]/25 border-t-[#F30D76]" />
        </div>
      )}
      {state === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
          <p className="text-sm text-[#F30D76]/70">Couldn’t reach YouTube — network hiccup.</p>
          <button
            onClick={() => setTick((t) => t + 1)}
            className="rounded-full border border-[#F30D76]/40 px-4 py-1.5 text-xs text-[#F30D76] transition-colors hover:bg-[#F30D76]/15"
          >
            ↻ Retry
          </button>
        </div>
      )}
      {state === 'ok' && (
        <div className="mt-3 grid grid-cols-2 gap-2.5 pb-2 lg:grid-cols-3">
          {(items ?? []).map((v) => (
            <button
              key={v.id}
              onClick={() => onPick?.(v.id, v.title)}
              className="group overflow-hidden rounded-xl border border-[#F30D76]/20 bg-[#F30D76]/[0.05] text-left transition-all hover:border-[#F30D76]/60 hover:bg-[#F30D76]/[0.1] hover:shadow-[0_0_18px_rgba(243,13,118,0.25)]"
            >
              <img
                src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`}
                alt=""
                loading="lazy"
                className="aspect-video w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden'
                }}
              />
              <span className="block truncate px-2.5 py-1.5 text-[11px] text-slate-200 group-hover:text-white">{v.title}</span>
            </button>
          ))}
          {(items ?? []).length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-[#F30D76]/70">No results — try another chip or search.</p>
          )}
        </div>
      )}
    </div>
  )
}
