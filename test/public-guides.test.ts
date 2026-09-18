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

  it('keeps setup and personal data behind sign-in', async () => {
    for (const path of ['/setup', '/today', '/review', '/settings', '/account']) {
      const response = await worker.fetch(new Request(origin + path), env)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toMatch(/^\/login/)
    }
  })
})
