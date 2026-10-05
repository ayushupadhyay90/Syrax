/* Generates the Syrax PWA icons (no image libs — raw PNG via node:zlib).
   Design: MAJESTIC CHATBOT — glowing blue chat bubble with a friendly bot
   face, crowned (royal/majestic) on deep space navy. Run: node scripts/gen-icons.mjs */
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

/* ── draw the MAJESTIC CHATBOT icon ────────────────────────────────────────
   Design space is a 512 grid centered at 0,0 (scaled by `scale` so the
   maskable variant shrinks into the safe circle):
     · chat bubble = rounded box + rotated tail bar, electric-blue gradient
       with a bright rim and a soft halo,
     · friendly bot face = two glowing eyes + smile arc, clipped to the bubble,
     · crown = band + three pearls (majestic), icy blue-white with its glow. */
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)
function drawIcon(size, { scale = 1 }) {
  const px = Buffer.alloc(size * size * 4)
  const u = (size / 512) * scale // design unit → pixels
  const w = 1 / u // design units per pixel (anti-alias width)
  const cx = size / 2
  const cy = size / 2

  const sdRB = (x, y, bx, by, r) => {
    const qx = Math.abs(x) - bx + r
    const qy = Math.abs(y) - by + r
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  }
  const sdC = (x, y, r) => Math.hypot(x, y) - r
  const cov = (d) => Math.max(0, Math.min(1, (0.5 * w - d) / w)) // AA coverage
  const mix = (a, b, t) => a + (b - a) * t

  const cosA = Math.cos(0.62)
  const sinA = Math.sin(0.62)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x0 = (x + 0.5 - cx) / u
      const y0 = (y + 0.5 - cy) / u

      // deep-space base (#040711) with a faint radial lift
      const rad = Math.hypot(x0, y0)
      const lift = Math.exp(-rad / 320)
      let r = 4 + 16 * lift
      let g = 7 + 26 * lift
      let b = 17 + 58 * lift

      // ── chat bubble: rounded box + tail bar tilted down-left ──
      const dBub = sdRB(x0, y0 - 20, 165, 118, 50)
      const tx = x0 + 118
      const ty = y0 - 148
      const rx = tx * cosA + ty * sinA
      const ry = -tx * sinA + ty * cosA
      const dBody = Math.min(dBub, sdRB(rx, ry, 15, 58, 10))

      // halo glow around the bubble
      const halo = 0.7 * Math.exp(-(dBody * dBody) / (2 * 46 * 46))
      r += 59 * halo
      g += 130 * halo
      b += 246 * halo

      const bodyC = cov(dBody)
      if (bodyC > 0) {
        // gradient: electric blue (top) → deep royal blue (bottom)
        const t = Math.max(0, Math.min(1, (y0 + 100) / 240))
        let fr = mix(59, 26, t)
        let fg = mix(130, 60, t)
        let fb = mix(246, 170, t)
        // bright inner rim (light from above)
        const rim = Math.exp(-(dBody * dBody) / (2 * 14 * 14))
        fr += (207 - fr) * rim * 0.9
        fg += (227 - fg) * rim * 0.9
        fb += (255 - fb) * rim * 0.9
        r += (fr - r) * bodyC
        g += (fg - g) * bodyC
        b += (fb - b) * bodyC
      }

      // ── bot face: two eyes + smile, clipped inside the bubble ──
      if (dBub < 0) {
        const dEye = Math.min(sdC(x0 + 58, y0 - 5, 25), sdC(x0 - 58, y0 - 5, 25))
        const dSmArc = Math.abs(Math.hypot(x0, y0 + 6) - 62)
        const dSmile = y0 > -6 && Math.abs(x0) < 52 ? dSmArc : 999
        const dFace = Math.min(dEye, dSmile)
        const glow = Math.min(1, 0.5 * Math.exp(-(dFace * dFace) / (2 * 24 * 24)))
        r += (234 - r) * glow * 0.75
        g += (244 - g) * glow * 0.75
        b += (255 - b) * glow * 0.75
        const faceC = cov(dFace)
        if (faceC > 0) {
          r += (255 - r) * faceC
          g += (255 - g) * faceC
          b += (255 - b) * faceC
        }
      }

      // ── crown: band sitting on the bubble + three pearls ──
      const dCrown = Math.min(
        sdRB(x0, y0 + 112, 85, 18, 8),
        Math.min(sdC(x0 + 58, y0 + 140, 18), Math.min(sdC(x0, y0 + 152, 24), sdC(x0 - 58, y0 + 140, 18))),
      )
      const crownHalo = 0.5 * Math.exp(-(dCrown * dCrown) / (2 * 30 * 30))
      r += 150 * crownHalo
      g += 190 * crownHalo
      b += 255 * crownHalo
      const crownC = cov(dCrown)
      if (crownC > 0) {
        const shade = 0.82 + 0.18 * Math.max(0, Math.min(1, (y0 + 160) / 45)) // brighter top
        r += (226 * shade - r) * crownC
        g += (238 * shade - g) * crownC
        b += (255 * shade - b) * crownC
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
