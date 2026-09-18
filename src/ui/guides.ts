import { localeOf, translator } from '../i18n'
import { DEFAULT_THEME, escapeHtml, langSwitch, page } from './layout'

export const PUBLIC_PATHS = ['/', '/guides/iphone-shortcuts', '/compare/one-sec'] as const

export function renderGuide(request: Request): Response {
  const url = new URL(request.url)
  const loc = localeOf(request, null)
  const t = translator(loc)
  const comparison = url.pathname === '/compare/one-sec'
  const title = comparison ? t("一息与 one sec：安装、功能和隐私比较") : t("iPhone 快捷指令教程：打开 App 前先呼吸十秒")
  const description = comparison ? t("一息作者整理的 one sec 比较：网页与原生应用、手动配置、拦截方式和数据保存。附官方来源与核对日期。") : t("用 iPhone 快捷指令和一息，在打开小红书等 App 前加一道呼吸暂停。了解安装步骤、试跳、自动化和常见问题。")
  return page({
    title, description, canonical: url.origin + url.pathname,
    theme: DEFAULT_THEME, lang: loc, indexable: true,
    cacheControl: 'public, max-age=60', vary: 'Accept-Language, Cookie',
    css: GUIDE_CSS,
    body: `<main class="guide"><nav><a href="/">${t('一息')}</a></nav>
<h1>${escapeHtml(title)}</h1>
${comparison ? `<p>${t("两者都可以在刷手机之前加一道暂停。一息适合愿意手动配置快捷指令、希望阅读或自建源码的人；one sec 提供原生应用及浏览器扩展，更适合需要多平台和多种干预方式的人。")}</p>
<p>${t("本文由一息作者维护，不是独立测评，也未与 one sec 合作。one sec 的信息来自其官网，并非本次逐项真机测试。")}</p>
<div class="table-scroll"><table><caption>${t("配置与能力对照")}</caption><thead><tr><th>${t("比较项")}</th><th>${t("一息")}</th><th>one sec</th></tr></thead><tbody>
<tr><th>${t("使用入口")}</th><td>${t("iPhone 快捷指令 + Safari 网页；每个 App 单独配置。")}</td><td>${t("官网提供 iOS、Android 应用和电脑浏览器扩展入口。")}</td></tr>
<tr><th>${t("干预方式")}</th><td>${t("呼吸暂停，再选择继续或放弃；故障时放行。")}</td><td>${t("官网列出呼吸、反思等干预，以及定时屏蔽功能。")}</td></tr>
<tr><th>${t("数据与控制")}</th><td>${t("源码以 MIT 协议公开，可自建；使用记录存在实例数据库，运营者可访问。")}</td><td>${t("官网表示干预逻辑在设备本地运行，使用数据保存在本地或私有云。")}</td></tr>
<tr><th>${t("费用")}</th><td>${t("当前公开实例免费使用；自建成本取决于托管和用量。")}</td><td>${t("官网说明基础功能免费，另有付费选项；具体价格和功能范围请以当地商店及购买页为准。")}</td></tr>
</tbody></table></div>
<h2>${t("怎么选")}</h2><p>${t("如果你想从一个 App 开始、接受 Safari 跳转并希望能修改源码，可以先试一息。如果你需要 Android、浏览器网站干预或定时屏蔽，先查看 one sec 的对应平台说明。一息没有经过与 one sec 相同的效果研究，不能套用对方的研究数字。")}</p>
<h2>${t("来源与核对日期")}</h2><p><time datetime="2026-09-18">2026-09-18</time> · <a href="https://one-sec.app/">one sec</a> · <a href="https://github.com/Defiabell/yixi">${t("一息源码与功能说明")}</a></p>` : `<p>${t("一息是一个网页加 iOS 快捷指令：你打开选定的 App 时，Safari 先显示呼吸页，等待后由你决定继续还是放弃。它需要联网，不是强制锁机工具。")}</p>
<h2>${t("准备什么")}</h2>
<p>${t("准备一部 iPhone、自带的「快捷指令」App 和 Safari。先只配一个 App；用 Safari 打开本站，避免微信等内置浏览器影响跳转。")}</p>
<h2>${t("四步完成首次配置")}</h2>
<ol>
<li>${t("注册或登录，然后在「设置」添加要拦的 App。记住你填的 App 键，例如 xhs；快捷指令里的键必须与它完全一致。")} <a href="/register">${t("注册账号")}</a> · <a href="/settings">${t("打开设置")}</a></li>
<li>${t("在设置里的 URL scheme 字段查找候选，用 iPhone 点「试跳」。只有真的打开目标 App 的候选才可以保存；列表里的候选没有替你验证过。")}</li>
<li>${t("打开登录后的配置向导，显示并复制该 App 的完整地址。新建快捷指令：先「获取 URL 的内容」（GET），再加「如果 URL 的内容 包含 https」，在条件里面「打开 URL」，使用上一步返回的内容。")} <a href="/setup">${t("打开个人配置向导")}</a></li>
<li>${t("在「快捷指令 → 自动化」创建 App「已打开」触发器，选择目标 App 和刚才的快捷指令。关闭「运行前询问」（或选择「立即运行」，名称随 iOS 版本变化），再实际打开 App 测试。")}</li>
</ol>
<p>${t("条件必须是「包含 https」，不要写成「不包含 pass」。地址必须保留末尾的 fmt=text。配置向导会生成真实地址，本页不包含任何人的 token；不要分享个人配置页或含 token 的快捷指令。")}</p>
<h2>${t("怎样确认配置成功")}</h2>
<p>${t("先在个人向导点「试一下这条通不通」，看到 pass 或呼吸页地址说明地址能连通。打开目标 App 后应出现呼吸页；等待后点「继续」应回到该 App。每多加一个 App，都要配置它自己的快捷指令和自动化。")}</p>
<h2>${t("常见问题")}</h2>
<h3>${t("为什么没有拦截？")}</h3><p>${t("检查 App 键是否一致、设置里是否启用、自动化是否开启，以及是否还在免打扰窗口内。网络或服务故障时，一息会放行，不保证每一次都拦住。")}</p>
<h3>${t("为什么点继续回不去？")}</h3><p>${t("回到 Safari 里的设置重新试跳。URL scheme 可能随 App 更新失效，不能只凭候选名字判断；微信等内置浏览器也可能阻止跳转。")}</p>
<h3>${t("记录放在哪里？")}</h3><p>${t("拦截和选择记录保存在所用实例的数据库。实例运营者有数据库访问权；若希望自己掌握数据，可以按源码文档自行部署。个人回看、目标和配置页面仍需登录。")}</p>`}
<p><a href="https://github.com/Defiabell">Defiabell</a> · <time datetime="2026-09-18">2026-09-18</time></p>
<nav class="related"><a href="/guides/iphone-shortcuts">${t("iPhone 快捷指令教程：打开 App 前先呼吸十秒")}</a><br><a href="/compare/one-sec">${t("一息与 one sec：安装、功能和隐私比较")}</a><br><a href="https://github.com/Defiabell/yixi">GitHub</a></nav>
<p>${langSwitch(loc, url.search)}</p></main>`,
  })
}

export function sitemap(origin: string): Response {
  const urls = PUBLIC_PATHS.map(path => `<url><loc>${escapeHtml(origin + path)}</loc></url>`).join('')
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}

const GUIDE_CSS = `
.guide{max-width:46rem;margin:auto;padding:calc(env(safe-area-inset-top) + 3rem) 24px 5rem;line-height:1.85}
h1{font-size:1.8rem;line-height:1.5;font-weight:400;margin:2rem 0}
h2{font-size:1.25rem;font-weight:400;margin-top:2.5rem}h3{font-size:1.05rem;font-weight:400}
li{margin-bottom:1rem}a{color:inherit;text-underline-offset:4px}nav,.related{color:var(--dim)}
.related{border-top:1px solid var(--rule);padding-top:1.5rem;margin-top:3rem}
.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.92rem}caption{text-align:left;color:var(--dim);margin-bottom:.7rem}
th,td{text-align:left;vertical-align:top;padding:.8rem;border-bottom:1px solid var(--rule);min-width:8rem}th{font-weight:500}
`
