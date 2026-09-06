/**
 * Generates PWA icons (PNG) without external dependencies.
 * Draws a rounded green tile with a white storefront glyph.
 * Usage: node scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib"
import { writeFileSync, mkdirSync } from "node:fs"

const GREEN = [31, 138, 91]
const WHITE = [255, 255, 255]

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}

/** Storefront glyph in a 0..1 coordinate space: awning (3 scallops), body, door. */
function glyph(u, v) {
  // awning band
  if (v >= 0.28 && v < 0.42 && u >= 0.18 && u <= 0.82) {
    // scalloped bottom edge
    const seg = ((u - 0.18) / 0.64) * 3
    const frac = seg - Math.floor(seg)
    const dip = 0.42 - 0.05 * Math.sqrt(Math.max(0, 1 - Math.pow((frac - 0.5) * 2, 2)))
    return v < dip
  }
  // body
  if (v >= 0.42 && v <= 0.74 && u >= 0.22 && u <= 0.78) {
    // door cut-out
    if (u >= 0.44 && u <= 0.56 && v >= 0.52) return false
    // window cut-out
    if (u >= 0.27 && u <= 0.39 && v >= 0.5 && v <= 0.6) return false
    return true
  }
  return false
}

function make(size, maskable) {
  const pad = maskable ? 0 : size * 0.08
  const radius = maskable ? 0 : size * 0.22
  return png(size, (x, y) => {
    // rounded tile
    const inX = x >= pad && x < size - pad, inY = y >= pad && y < size - pad
    if (!inX || !inY) return [0, 0, 0, 0]
    const cx = Math.max(pad + radius, Math.min(size - pad - radius, x)), cy = Math.max(pad + radius, Math.min(size - pad - radius, y))
    if (Math.hypot(x - cx, y - cy) > radius) return [0, 0, 0, 0]
    const scale = maskable ? 0.8 : 1
    const u = ((x - size / 2) / (size - 2 * pad)) / scale + 0.5
    const v = ((y - size / 2) / (size - 2 * pad)) / scale + 0.5
    return glyph(u, v) ? [...WHITE, 255] : [...GREEN, 255]
  })
}

mkdirSync("public/icons", { recursive: true })
writeFileSync("public/icons/icon-192.png", make(192, false))
writeFileSync("public/icons/icon-512.png", make(512, false))
writeFileSync("public/icons/icon-512-maskable.png", make(512, true))
writeFileSync("public/icons/apple-touch-icon.png", make(180, true))
console.log("icons written to public/icons")
