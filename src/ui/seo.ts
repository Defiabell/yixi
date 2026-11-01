/**
 * Structured data and the plain-text index for crawlers.
 *
 * Only the three public pages (landing and the two articles) carry any of
 * this; signed-in pages stay noindex and never reach here. The author block is
 * the owner's site-wide Person node, copied whole rather than referenced by
 * @id so a crawler that never visits defiabell.com still gets a complete node.
 */
import { translator, type Locale, type T } from '../i18n'
import { escapeHtml } from './layout'

export const PERSON = {
  '@type': 'Person',
  '@id': 'https://defiabell.com/#person',
  name: 'Jinkun Sun',
  alternateName: 'Defiabell',
  url: 'https://defiabell.com/',
  sameAs: ['https://github.com/Defiabell', 'https://defiabell.github.io/', 'https://defiabell.pages.dev/'],
} as const

/**
 * The date both public articles were written and their sources checked — the
 * same one printed in their footers. It is the articles' content date, so it
 * is what the sitemap and the Article nodes report; bump it when the text is
 * revised. (There is no build step here to read git from.)
 */
export const GUIDES_REVIEWED = '2026-09-18'

export const GUIDE_PATHS = ['/guides/iphone-shortcuts', '/compare/one-sec'] as const
export type GuidePath = (typeof GUIDE_PATHS)[number]

export function guideTitle(t: T, path: GuidePath): string {
  return path === '/compare/one-sec'
    ? t('一息与 one sec：安装、功能和隐私比较')
    : t('iPhone 快捷指令教程：打开 App 前先呼吸十秒')
}

export function guideDescription(t: T, path: GuidePath): string {
  return path === '/compare/one-sec'
    ? t('一息作者整理的 one sec 比较：网页与原生应用、手动配置、拦截方式和数据保存。附官方来源与核对日期。')
    : t('用 iPhone 快捷指令和一息，在打开小红书等 App 前加一道呼吸暂停。了解安装步骤、试跳、自动化和常见问题。')
}

export function landingTitle(t: T): string {
  return t('一息 —— 打开 App 之前先呼吸十秒，「今日」收好最重要的三件事')
}

export function landingDescription(t: T): string {
  return t(
    '在 iPhone 上打开小红书这类 App 之前，先看着一团墨呼吸十秒，然后再决定进不进去；「今日」一页则收好未来一段时间最重要的三件事，一按就去做。自建的 One Sec 替代品：一个网页加 iOS 快捷指令，不用装 App，跑在 Cloudflare 免费额度里。',
  )
}

function inLanguage(loc: Locale): string {
  return loc === 'en' ? 'en' : 'zh-CN'
}

/** WebSite + Person, shared by every public page's @graph. */
function siteNodes(origin: string, loc: Locale, t: T): Record<string, unknown>[] {
  return [
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: t('一息'),
      alternateName: loc === 'en' ? '一息' : 'Yixi',
      url: `${origin}/`,
      description: landingDescription(t),
      inLanguage: inLanguage(loc),
      author: { '@id': PERSON['@id'] },
      publisher: { '@id': PERSON['@id'] },
    },
    PERSON,
  ]
}

/** The landing page: the site, its author, and the product as a WebApplication. */
export function landingJsonLd(origin: string, loc: Locale): unknown {
  const t = translator(loc)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...siteNodes(origin, loc, t),
      {
        '@type': 'WebApplication',
        '@id': `${origin}/#app`,
        name: t('一息'),
        alternateName: 'Yixi',
        url: `${origin}/`,
        description: landingDescription(t),
        applicationCategory: 'LifestyleApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Safari on iOS with the Shortcuts app',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'CNY' },
        inLanguage: inLanguage(loc),
        author: { '@id': PERSON['@id'] },
        image: `${origin}/og.png`,
      },
    ],
  }
}

/** A public article: the site, its author, and the Article itself. */
export function guideJsonLd(origin: string, loc: Locale, path: GuidePath): unknown {
  const t = translator(loc)
  const url = origin + path
  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...siteNodes(origin, loc, t),
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: guideTitle(t, path),
        description: guideDescription(t, path),
        inLanguage: inLanguage(loc),
        datePublished: GUIDES_REVIEWED,
        dateModified: GUIDES_REVIEWED,
        author: { '@id': PERSON['@id'] },
        publisher: { '@id': PERSON['@id'] },
        mainEntityOfPage: url,
        isPartOf: { '@id': `${origin}/#website` },
        image: `${origin}/og.png`,
      },
    ],
  }
}

/**
 * "Ask an AI" row for an article: each link opens an AI platform with a
 * prompt that tells it to read this page first. Static anchors, no script.
 */
const ASK_AI_PLATFORMS: { label: string; url: (q: string) => string }[] = [
  { label: 'ChatGPT', url: (q) => `https://chatgpt.com/?prompt=${q}` },
  { label: 'Google AI', url: (q) => `https://www.google.com/search?udm=50&aep=11&q=${q}` },
  { label: 'Perplexity', url: (q) => `https://www.perplexity.ai/search/new?q=${q}` },
  { label: 'Claude', url: (q) => `https://claude.ai/new?q=${q}` },
  { label: 'Grok', url: (q) => `https://x.com/i/grok?text=${q}` },
  // copilot.microsoft.com drops the query; the Bing entry point keeps it.
  { label: 'Copilot', url: (q) => `https://www.bing.com/copilotsearch?q=${q}` },
]

export function askAiRow(t: T, url: string, title: string): string {
  const prompt = t('请先阅读 {url}（「{title}」），然后用中文概括要点，并告诉我可以怎么用。', { url, title })
  const q = encodeURIComponent(prompt)
  const links = ASK_AI_PLATFORMS.map((p) => p.url(q))
    .filter((href) => href.length <= 2000)
    .map((href, i) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${ASK_AI_PLATFORMS[i]!.label}</a>`)
  return `<p class="ask-ai"><span>${t('问问 AI')}</span>${links.join('')}</p>`
}

/**
 * /llms.txt (llmstxt.org). Bilingual like the site: a Chinese section first,
 * then the same in English. Built from the same strings the pages use, so it
 * cannot drift from them.
 */
export function llmsTxt(origin: string): Response {
  const section = (loc: Locale, heading: (s: string) => string): string[] => {
    const t = translator(loc)
    return [
      `> ${t('打开 App 之前先呼吸十秒；「今日」收好最重要的几件事；「渡」陪你熬过十分钟的冲动。一个网页加 iOS 快捷指令，不用装 App，跑在 Cloudflare 免费额度里；源码 MIT 开源，可以自建。')}`,
      '',
      t('作者：Jinkun Sun（Defiabell）· https://defiabell.com/ · https://github.com/Defiabell'),
      t('站点：{origin}/', { origin }),
      t('语言：中文（界面也有英文版，任何页面加 ?lang=en）'),
      '',
      heading(t('怎么用')),
      '',
      `- ${t('拦（Breathe）：在 iPhone 快捷指令里给要拦的 App 加一条自动化。打开它时 Safari 先显示呼吸页，十秒后先给「算了」、再给「继续打开」，选择会被记下。')}`,
      `- ${t('引（Today）：每天早上打开的一页，放未来几周最重要的三件事（最多九件），每件带今天的子任务、最近七天的点，和一个直接跳进 App 去做的按钮。')}`,
      `- ${t('渡（Surf）：冲动来了点一下，它陪你把手机放下，十分钟后再决定。')}`,
      `- ${t('故障时放行：网络或服务出问题时不拦。这是提醒，不是锁。')}`,
      `- ${t('使用记录存在所用实例的数据库里，运营者可访问；不想放在别人的服务器上，照 README 自建一份。')}`,
      '',
      heading(t('链接')),
      '',
      `- [${t('首页')}](${origin}/): ${t('一息是什么，注册与登录入口')}`,
      ...GUIDE_PATHS.map((p) => `- [${guideTitle(t, p)}](${origin}${p}): ${guideDescription(t, p)}`),
      `- [${t('源码（GitHub）')}](https://github.com/Defiabell/yixi): ${t('MIT 协议，部署说明在 README')}`,
      '',
      heading(t('需要登录的页面')),
      '',
      `${t('/today、/review、/settings、/setup、/surf、/account 需要账号，不收录、不进 sitemap。')}`,
    ]
  }
  const body = [
    '# 一息 (Yixi)',
    '',
    ...section('zh', (s) => `## ${s}`),
    '',
    '## English',
    '',
    ...section('en', (s) => `### ${s}`),
    '',
  ].join('\n')
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
