// Generates the 512x512 home-screen icon: one ink dot on paper, the same mark
// the breathing page's 「息」 skin uses. Prints base64 to stdout; paste it into
// src/ui/pwa.ts as ICON_PNG_BASE64. Run: node scripts/icon.mjs
//
// --surf inverts the two colours (ink ground, paper dot) for 「渡」's own
// home-screen icon, so it reads as a distinct app next to 一息's rather than
// a re-skin of it. Paste that run's output into SURF_ICON_PNG_BASE64.
//
// Requires Node >= 22.2 — `crc32` was added to node:zlib in that release. On an
// older Node this import silently succeeds but `crc32` is `undefined`, and the
// script fails at the call site with "crc32 is not a function".
import { deflateSync, crc32 } from 'node:zlib'

const SURF = process.argv.includes('--surf')

const SIZE = 512
const PAPER = SURF ? [0x1f, 0x1c, 0x18] : [0xf3, 0xf0, 0xe8]
const INK = SURF ? [0xf3, 0xf0, 0xe8] : [0x1f, 0x1c, 0x18]
// Dot diameter ≈ 46% of the canvas: inside the 80% maskable safe zone, and
// large enough to read as a mark rather than a speck at 60px.
const R = SIZE * 0.23
const CX = SIZE / 2
const CY = SIZE / 2

const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 3 + 1)] = 0 // filter: none
  for (let x = 0; x < SIZE; x++) {
    // 4x4 supersampling for a soft edge.
    let cover = 0
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const dx = x + (sx + 0.5) / 4 - CX
      const dy = y + (sy + 0.5) / 4 - CY
      if (dx * dx + dy * dy <= R * R) cover++
    }
    const a = cover / 16
    const o = y * (SIZE * 3 + 1) + 1 + x * 3
    for (let c = 0; c < 3; c++) raw[o + c] = Math.round(PAPER[c] * (1 - a) + INK[c] * a)
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 // 8-bit RGB
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
process.stdout.write(png.toString('base64'))
