import { useEffect, useRef, useState } from 'react'
import type { OrbState } from 'thinking-orbs'
import { MODE_FRAMES, resolvePreset, scaleCounts } from 'thinking-orbs'
import { paintFrame } from 'thinking-orbs/engine'

/**
 * A large, crisp dotted JARVIS-style orb.
 *
 * The ready-made <ThinkingOrb> component only draws at 20/32/64 CSS px, so
 * this uses the same public engine underneath at hero size: preset geometry
 * resolved once, frame math scaled to any size, painted on a DPR-aware canvas.
 */
function hexToTint(hex: string) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function OrbCanvas({
  size,
  state = 'searching',
  tint = '#3B82F6',
  speed = 1,
  density = 3,
}: {
  size: number
  state?: OrbState
  tint?: string
  speed?: number
  density?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { mode, speed: baseSpeed, opts: presetOpts } = resolvePreset(state, 64)
    const opts = density !== 1 ? scaleCounts(presetOpts, density) : presetOpts
    const frameFn = MODE_FRAMES[mode]
    const rgb = hexToTint(tint)
    const effSpeed = baseSpeed * speed

    let raf = 0
    let running = true

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      paintFrame(ctx, frameFn(size, t, opts), true, rgb)
    }

    const loop = () => {
      if (!running) return
      draw((performance.now() / 1000) * effSpeed)
      raf = requestAnimationFrame(loop)
    }

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        loop()
      }
    }

    draw((performance.now() / 1000) * effSpeed)
    loop()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [size, state, tint, speed, density])

  return <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} />
}

/** Responsive hero size: `factor` of the shorter viewport edge, clamped. */
export function useHeroSize(factor = 0.62, min = 260, max = 640) {
  const calc = () => Math.round(Math.min(window.innerWidth, window.innerHeight) * factor)
  const [size, setSize] = useState(calc)
  useEffect(() => {
    const onResize = () => setSize(calc())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return Math.max(min, Math.min(size, max))
}

/** Chunk 1 — pure UI: black stage, one dotted orb block. */
export default function Chunk1() {
  const size = useHeroSize()
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* soft cyan halo behind the orb */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: size * 1.7,
          height: size * 1.7,
          background:
            'radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.04) 42%, transparent 68%)',
        }}
      />
      {/* the block */}
      <div className="absolute inset-0 grid place-items-center">
        <OrbCanvas size={size} state="searching" tint="#3B82F6" />
      </div>
    </div>
  )
}
