import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index'

const origin = 'https://self-host.example'
const paths = ['/guides/iphone-shortcuts', '/compare/one-sec']

describe('public guides', () => {
  for (const path of paths) {
    it(`serves ${path} without authentication in both languages`, async () => {
      for (const locale of ['zh', 'en']) {
        const response = await worker.fetch(new Request(origin + path + '?tracking=test', {
          headers: { cookie: `yixi_lang=${locale}` },
        }), env)
        const html = await response.text()
        expect(response.status).toBe(200)
        expect(response.headers.get('set-cookie')).toBeNull()
        expect(response.headers.get('vary')).toContain('Cookie')
        expect(html).toContain(`rel="canonical" href="${origin + path}"`)
        expect(html).toContain('name="description"')
        expect(html).not.toContain('noindex')
        expect(html).not.toMatch(/(?:src|href)="https?:[^"\s]+\.(?:js|css)/)
        expect(html).not.toContain('?k=')
        if (locale === 'en') expect(html.replaceAll('一息', '').replaceAll('中文', '')).not.toMatch(/[\u4e00-\u9fff]/)
        else expect(html).toContain('一息')
      }
    })
  }

  it('only lists public content in the sitemap, using the current instance', async () => {
    const response = await worker.fetch(new Request(origin + '/sitemap.xml'), env)
    const xml = await response.text()
    expect(response.status).toBe(200)
    expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]))
      .toEqual([origin + '/', ...paths.map(path => origin + path)])
  })

  /**
   * One Pages project, two hostnames: the custom domain and the pages.dev
   * name existing Shortcuts still call. CANONICAL_ORIGIN points every public
   * declaration on either host at one of them; without it the request's own
   * origin stays in charge (the self-host default the tests above cover).
   */
  it('declares CANONICAL_ORIGIN on every public surface when it is set', async () => {
    const canonical = 'https://breathe.example.com'
    const aliased = { ...env, CANONICAL_ORIGIN: canonical }
    const alias = 'https://breathe-app.pages.dev'
    const landing = await (await worker.fetch(new Request(alias + '/'), aliased)).text()
    expect(landing).toContain(`<link rel="canonical" href="${canonical}/">`)
    expect(landing).toContain(`<meta property="og:url" content="${canonical}/">`)
    expect(landing).toContain(`<meta property="og:image" content="${canonical}/og.png">`)
    expect(landing).toContain(`"url":"${canonical}/"`)
    expect(landing).not.toContain(alias)
    for (const path of paths) {
      const html = await (await worker.fetch(new Request(alias + path), aliased)).text()
      expect(html).toContain(`<link rel="canonical" href="${canonical + path}">`)
      expect(html).toContain(`"mainEntityOfPage":"${canonical + path}"`)
      expect(html).not.toContain(alias)
    }
    const xml = await (await worker.fetch(new Request(alias + '/sitemap.xml'), aliased)).text()
    expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]))
      .toEqual([canonical + '/', ...paths.map(path => canonical + path)])
    const robots = await (await worker.fetch(new Request(alias + '/robots.txt'), aliased)).text()
    expect(robots).toContain(`Sitemap: ${canonical}/sitemap.xml`)
    const llms = await (await worker.fetch(new Request(alias + '/llms.txt'), aliased)).text()
    expect(llms).toContain(`${canonical}/`)
    expect(llms).not.toContain(alias)
  })

  it('ignores a malformed CANONICAL_ORIGIN instead of failing the page', async () => {
    const broken = { ...env, CANONICAL_ORIGIN: 'not a url' }
    const response = await worker.fetch(new Request(origin + '/'), broken)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(`<link rel="canonical" href="${origin}/">`)
  })

  it('links the landing page to the author site with a plain visible link', async () => {
    for (const locale of ['zh', 'en']) {
      const html = await (await worker.fetch(new Request(origin + '/', {
        headers: { cookie: `yixi_lang=${locale}` },
      }), env)).text()
      const body = html.slice(html.indexOf('<body'))
      expect(body).toContain('<a href="https://defiabell.com/" rel="author">defiabell.com</a>')
    }
  })

  it('keeps setup and personal data behind sign-in', async () => {
    for (const path of ['/setup', '/today', '/review', '/settings', '/account']) {
      const response = await worker.fetch(new Request(origin + path), env)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toMatch(/^\/login/)
    }
  })
})
