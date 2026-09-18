import type { OnboardingCounts } from '../onboarding'
import type { T } from '../i18n'

function rate(n: number, d: number): string {
  return d ? `${n} / ${d} (${Math.round(n / d * 100)}%)` : '—'
}

export function onboardingPanel(c: OnboardingCounts, t: T): string {
  return `<section class="card">
<h2>${t('配置转化')}</h2>
<p>${t('最近 30 天新版自助注册：{n} 个账号；其中 {pending} 个尚未满 7 天。', { n: c.registered, pending: c.pending })}</p>
<p>${t('满 7 天的注册账号：{n}', { n: c.mature })}</p>
<p>${t('7 天内打开配置页：{value}', { value: rate(c.opened, c.mature) })}</p>
<p>${t('7 天内首次拦截：{value}', { value: rate(c.activated, c.mature) })}</p>
<p>${t('首次拦截前未打开配置页：{n}', { n: c.without_setup })}</p>
<p>${t('首拦后第 7 天仍有拦截：{value}；待观察：{pending}', { value: rate(c.retained, c.retention_mature), pending: c.retention_pending })}</p>
<p class="note">${t('仅统计本版上线后的自助注册，排除 owner、历史账号与发号账号；其他测试账号无法自动识别。')}</p>
<p class="note">${t('打开配置页不代表完成配置。首次拦截只证明请求到达，不能证明 iOS 自动化已安装；页面诊断检查不计入。前两项均以满 7 天注册账号为分母，不要求先打开配置页。')}</p>
<p class="note">${t('留存以首拦后 168 至 192 小时内再次拦截为准，仅纳入已满 192 小时的首拦账号；不要求连续使用。未成熟的窗口不按零计算，分母为零显示 —。')}</p>
</section>`
}
