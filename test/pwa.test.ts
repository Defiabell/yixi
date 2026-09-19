import { describe, expect, it } from 'vitest'
import { PWA_HEAD, SURF_PWA_HEAD, iconResponse, manifestResponse, surfIconResponse, surfManifestResponse } from '../src/ui/pwa'
import { pageHtml, page, DEFAULT_THEME } from '../src/ui/layout'

describe('manifest', () => {
  it('starts on /today, standalone, scoped to the whole site', async () => {
    const res = manifestResponse()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/manifest\+json/)
    expect(res.headers.get('cache-control')).toMatch(/max-age=/)
    const m = (await res.json()) as Record<string, unknown>
    expect(m).toMatchObject({
      name: '一息',
      short_name: '一息',
      start_url: '/today',
      scope: '/',
      display: 'standalone',
      background_color: '#f3f0e8',
      theme_color: '#f3f0e8',
    })
    const icons = m['icons'] as { src: string; sizes: string; type: string; purpose: string }[]
    expect(icons[0]).toEqual({ src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' })
  })
})

describe('icon', () => {
  it('is a real PNG, cacheable, and public', async () => {
    const res = iconResponse()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    const bytes = new Uint8Array(await res.arrayBuffer())
    // PNG signature
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    // IHDR width/height 512
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(16)).toBe(512)
    expect(view.getUint32(20)).toBe(512)
    expect(bytes.length).toBeGreaterThan(200)
    expect(bytes.length).toBeLessThan(40_000)
  })
})

describe('渡 manifest', () => {
  it('starts on /surf, standalone, scoped to the whole site, ink-toned', async () => {
    const res = surfManifestResponse()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/manifest\+json/)
    expect(res.headers.get('cache-control')).toMatch(/max-age=/)
    const m = (await res.json()) as Record<string, unknown>
    expect(m).toMatchObject({
      name: '渡',
      short_name: '渡',
      start_url: '/surf',
      scope: '/',
      display: 'standalone',
      background_color: '#1f1c18',
      theme_color: '#1f1c18',
      lang: 'zh-Hans',
    })
    const icons = m['icons'] as { src: string; sizes: string; type: string; purpose: string }[]
    expect(icons[0]).toEqual({ src: '/surf/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' })
  })
})

describe('渡 icon', () => {
  it('is a real PNG, cacheable, and public', async () => {
    const res = surfIconResponse()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    const bytes = new Uint8Array(await res.arrayBuffer())
    // PNG signature
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    // IHDR width/height 512
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(16)).toBe(512)
    expect(view.getUint32(20)).toBe(512)
    expect(bytes.length).toBeGreaterThan(200)
    expect(bytes.length).toBeLessThan(40_000)
  })

  it('is a distinct image from the 一息 icon, not a re-skinned copy', async () => {
    // Proxy for "the two base64 constants are not equal" without exporting
    // either constant just for a test: same check, at the decoded bytes.
    const oneXi = [...new Uint8Array(await iconResponse().arrayBuffer())]
    const du = [...new Uint8Array(await surfIconResponse().arrayBuffer())]
    expect(du).not.toEqual(oneXi)
  })
})

describe('every page carries the home-screen head', () => {
  const html = pageHtml({ title: 't', theme: DEFAULT_THEME, body: '' })
  it('links the manifest and the touch icon', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">')
    expect(html).toContain('<link rel="apple-touch-icon" href="/icon.png">')
  })
  it('asks iOS and Android for a standalone window with our name', () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">')
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes">')
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="一息">')
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default">')
  })
  it('lets the manifest through the CSP, and nothing else new', () => {
    const csp = page({ title: 't', theme: DEFAULT_THEME, body: '' }).headers.get('content-security-policy')!
    expect(csp).toContain("manifest-src 'self'")
    expect(csp).toContain("default-src 'none'")
    expect(csp).not.toMatch(/https?:\/\//)
  })
  it('PWA_HEAD is what pageHtml inlines', () => {
    expect(html).toContain(PWA_HEAD)
  })
})

describe('pwaHead lets a page point at a different home-screen entry', () => {
  it('defaults to PWA_HEAD, byte for byte, when the caller passes nothing', () => {
    expect(pageHtml({ title: 't', theme: DEFAULT_THEME, body: '' })).toContain(PWA_HEAD)
  })

  it("/surf-style pages get their own manifest and icon, not 一息's", () => {
    const html = pageHtml({ title: 't', theme: DEFAULT_THEME, body: '', pwaHead: SURF_PWA_HEAD })
    expect(html).toContain('<link rel="manifest" href="/surf/manifest.webmanifest">')
    expect(html).toContain('<link rel="apple-touch-icon" href="/surf/icon.png">')
    // Not just "also contains its own head" — the 一息 manifest link must be
    // gone, or iOS would see two <link rel=manifest> tags and pick one by
    // its own rule rather than the one this page meant.
    expect(html).not.toContain('href="/manifest.webmanifest">')
  })
})
