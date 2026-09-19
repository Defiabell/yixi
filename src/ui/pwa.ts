// The three things that turn "a website" into "an icon on the phone": a
// manifest, a touch icon, and the meta that asks for a standalone window.
//
// Served by the Worker rather than as static assets because the Worker has no
// asset binding and the Pages deployment's `public/` is empty on purpose (one
// catch-all Function). Two routes, both public, both cacheable — nothing here
// is per-user.
//
// The icon is a base64 constant, generated once by scripts/icon.mjs. It is the
// only binary in the codebase; keeping it inline is what keeps "zero external
// requests, zero runtime dependencies" true for the home-screen path too.
//
// 「渡」 (the urge-surfing flow at /surf) gets its own manifest and icon below
// rather than reusing these: a second `<link rel=manifest>` is what makes iOS
// "add to home screen" create a second, independent app instead of a
// shortcut into the one already installed for /today.

const PAPER = '#f3f0e8'
const INK = '#1f1c18'

/** Six lines every page carries. layout.ts inlines this into <head>. */
export const PWA_HEAD = `<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="一息">
<meta name="apple-mobile-web-app-status-bar-style" content="default">`

/** The same six lines, pointed at 「渡」's own manifest and icon. */
export const SURF_PWA_HEAD = `<link rel="manifest" href="/surf/manifest.webmanifest">
<link rel="apple-touch-icon" href="/surf/icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="渡">
<meta name="apple-mobile-web-app-status-bar-style" content="default">`

const MANIFEST = JSON.stringify({
  name: '一息',
  short_name: '一息',
  // `scope` is not optional on iOS: without it every in-app link opens Safari.
  start_url: '/today',
  scope: '/',
  display: 'standalone',
  background_color: PAPER,
  theme_color: PAPER,
  lang: 'zh-Hans',
  icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
})

/** 「渡」's manifest: its own app, independent of 一息's. */
const SURF_MANIFEST = JSON.stringify({
  name: '渡',
  short_name: '渡',
  // Straight into the flow — a list page here would cost the one thing this
  // face is built to save: the seconds between the urge and the tap.
  start_url: '/surf',
  scope: '/',
  display: 'standalone',
  background_color: INK,
  theme_color: INK,
  lang: 'zh-Hans',
  icons: [{ src: '/surf/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
})

const DAY = 'public, max-age=86400'

export function manifestResponse(): Response {
  return new Response(MANIFEST, {
    headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': DAY },
  })
}

export function surfManifestResponse(): Response {
  return new Response(SURF_MANIFEST, {
    headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': DAY },
  })
}

/** Output of `node scripts/icon.mjs`. Regenerate there; never hand-edit. */
const ICON_PNG_BASE64 = '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'

let iconBytes: Uint8Array | null = null
function icon(): Uint8Array {
  if (iconBytes) return iconBytes
  const bin = atob(ICON_PNG_BASE64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  iconBytes = out
  return out
}

export function iconResponse(): Response {
  return new Response(icon(), { headers: { 'content-type': 'image/png', 'cache-control': DAY } })
}

/** Output of `node scripts/icon.mjs --surf`. Regenerate there; never hand-edit. */
const SURF_ICON_PNG_BASE64 = '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'

let surfIconBytes: Uint8Array | null = null
function surfIcon(): Uint8Array {
  if (surfIconBytes) return surfIconBytes
  const bin = atob(SURF_ICON_PNG_BASE64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  surfIconBytes = out
  return out
}

export function surfIconResponse(): Response {
  return new Response(surfIcon(), { headers: { 'content-type': 'image/png', 'cache-control': DAY } })
}
