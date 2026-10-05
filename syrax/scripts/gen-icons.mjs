/* Generates the Syrax PWA icons (no image libs — raw PNG via node:zlib).
   Design: deep blue-black canvas + glowing electric-blue ring + hot core —
   the same reactor-orb identity the app uses. Run: node scripts/gen-icons.mjs */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'icons')

/* ── minimal PNG encoder (8-bit RGBA, filter 0) ─────────────────────────── */
const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = w * 4 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0 // filter: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

/* ── draw the glowing reactor orb ───────────────────────────────────────── */
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)
function drawIcon(size, { scale = 1 }) {
  const px = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const u = size / 512
  const ringR = 190 * u * scale
  const ringW = 27 * u * scale
  const coreR = 64 * u * scale
  const glowSig = ringW * 1.5

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.sqrt(dx * dx + dy * dy)

      // base: #040711 with a faint radial blue lift toward the center
      const lift = Math.exp(-d / (size * 0.55))
      let r = 4 + 14 * lift
      let g = 7 + 22 * lift
      let b = 17 + 46 * lift

      // outer glow halo around the ring
      const glow = 0.62 * Math.exp(-((d - ringR) ** 2) / (2 * glowSig * glowSig))
      r += 59 * glow
      g += 130 * glow
      b += 246 * glow

      // crisp ring (top slightly brighter — light from above)
      const edge = (ringW / 2 - Math.abs(d - ringR)) / 1.6
      if (edge > 0) {
        const k = Math.min(1, edge)
        const top = 1 + 0.35 * (-dy / (d || 1))
        const mr = 59 * top
        const mg = 130 * top
        const mb = 246 * top
        r += (mr - r) * k
        g += (mg - g) * k
        b += (mb - b) * k
        // bright inner edge line
        const line = Math.max(0, 1 - Math.abs(d - ringR + ringW * 0.18) / (ringW * 0.22))
        r += (255 - r) * line * 0.55
        g += (245 - g) * line * 0.55
        b += (255 - b) * line * 0.55
      }

      // hot core: blue → white center
      if (d < coreR) {
        const t = d / coreR
        const coreGlow = Math.exp(-((d / coreR) ** 2) * 3)
        const kr = 147 + (240 - 147) * (1 - t)
        const kg = 197 + (247 - 197) * (1 - t) // toward near-white at center
        const kb = 253 + (255 - 253) * (1 - t)
        const k = Math.min(1, (1 - t) * 2.2 + coreGlow)
        r += (kr - r) * k
        g += (kg - g) * k
        b += (kb - b) * k
      }

      const i = (y * size + x) * 4
      px[i] = clamp(Math.round(r))
      px[i + 1] = clamp(Math.round(g))
      px[i + 2] = clamp(Math.round(b))
      px[i + 3] = 255
    }
  }
  return encodePNG(size, size, px)
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'icon-192.png'), drawIcon(192, { scale: 1 }))
writeFileSync(join(OUT, 'icon-512.png'), drawIcon(512, { scale: 1 }))
// maskable: art shrunk into the 80% safe circle so launchers can round it
writeFileSync(join(OUT, 'icon-512-maskable.png'), drawIcon(512, { scale: 0.74 }))
console.log('icons written →', OUT)
