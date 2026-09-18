import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { onboardingCounts, recordSetupOpened } from '../src/onboarding'
import { onboardingPanel } from '../src/ui/onboarding'
import { translator } from '../src/i18n'
import { insertEvent } from '../src/db'
import { register } from '../src/account'
import { handleGate } from '../src/gate'
import { sha256Hex } from '../src/auth'

const DAY = 86400000
const NOW = 1800000000000
beforeEach(async () => {
  await env.DB.batch(['events', 'users', 'user_apps', 'sessions'].map(t => env.DB.prepare(`DELETE FROM ${t}`)))
})
async function user(age: number, version: number | null = 1, owner = 0) {
  const result = await env.DB.prepare(`INSERT INTO users
    (name, token_hash, created_at, onboarding_version, is_owner) VALUES ('private', ?1, ?2, ?3, ?4)`)
    .bind(crypto.randomUUID(), NOW - age * DAY, version, owner).run()
  return Number(result.meta.last_row_id)
}
async function attempt(id: number, ts: number, kind: 'attempt' | 'grace_pass' = 'attempt') {
  await insertEvent(env.DB, { userId: id, ts, kind, sid: 'private-sid', app: 'private-app' })
}
it('excludes legacy, issued, owner, future and out-of-cohort accounts', async () => {
  await user(10, null); await user(10, 1, 1); await user(31); await user(-1)
  const current = await user(10)
  await attempt(current, NOW - 9 * DAY)
  const c = await onboardingCounts(env.DB, NOW)
  expect(c.registered).toBe(1)
  expect(c.activated).toBe(1)
  expect(c.without_setup).toBe(1)
})
it('keeps immature windows out of denominators and bounds activation at exactly 7 days', async () => {
  const pending = await user(6)
  await attempt(pending, NOW - DAY)
  const mature = await user(7)
  await attempt(mature, NOW) // exactly day 7: excluded
  const c = await onboardingCounts(env.DB, NOW)
  expect(c).toMatchObject({ registered: 2, pending: 1, mature: 1, activated: 0, retention_pending: 1, retention_mature: 0 })
})
it('retention uses a complete [168h,192h) window and ignores grace, future and late events', async () => {
  const retained = await user(12)
  await attempt(retained, NOW - 10 * DAY)
  await attempt(retained, NOW - 3 * DAY)
  const late = await user(12)
  await attempt(late, NOW - 10 * DAY)
  await attempt(late, NOW - 2 * DAY)
  await attempt(late, NOW - 3 * DAY, 'grace_pass')
  const immature = await user(10)
  await attempt(immature, NOW - 7.5 * DAY)
  await attempt(immature, NOW - 0.5 * DAY)
  const future = await user(1)
  await attempt(future, NOW + DAY)
  expect(await onboardingCounts(env.DB, NOW)).toMatchObject({ retention_mature: 2, retained: 1, retention_pending: 1 })
})
it('records only the first setup visit for new non-owner registrations', async () => {
  const id = await user(10)
  await recordSetupOpened(env.DB, id, NOW - 9 * DAY)
  await recordSetupOpened(env.DB, id, NOW)
  await attempt(id, NOW - 8 * DAY)
  const legacy = await user(10, null)
  await recordSetupOpened(env.DB, legacy, NOW)
  expect(await env.DB.prepare('SELECT setup_opened_at FROM users WHERE id = ?1').bind(legacy).first('setup_opened_at')).toBeNull()
  expect(await onboardingCounts(env.DB, NOW)).toMatchObject({ opened: 1, activated: 1, without_setup: 0 })
})
it('registration opts into measurement atomically; empty denominators remain unavailable', async () => {
  const c = await onboardingCounts(env.DB, NOW)
  expect(onboardingPanel(c, translator('en'))).toContain('within 7 days: —')
  const result = await register(env, { email: 'funnel@example.com', password: 'correct-horse-battery' })
  expect(result.ok).toBe(true)
  expect(await env.DB.prepare('SELECT onboarding_version FROM users').first('onboarding_version')).toBe(1)
})
it('setup diagnostics authenticate but never create an interception or session', async () => {
  const id = await user(10)
  await env.DB.prepare('UPDATE users SET token_hash = ?1 WHERE id = ?2').bind(await sha256Hex('valid'), id).run()
  await env.DB.prepare("INSERT INTO user_apps (user_id, app, label, scheme) VALUES (?1, 'x', 'X', 'x://')").bind(id).run()
  const request = (token: string) => new Request(`https://yixi.test/gate?app=x&k=${token}&fmt=text&diagnostic=1`)
  expect((await handleGate(request('wrong'), env)).status).toBe(401)
  expect(await (await handleGate(request('valid'), env)).text()).toBe('ok')
  expect(await env.DB.prepare('SELECT COUNT(*) FROM events').first('COUNT(*)')).toBe(0)
  expect(await env.DB.prepare('SELECT COUNT(*) FROM sessions').first('COUNT(*)')).toBe(0)
  await handleGate(new Request('https://yixi.test/gate?app=x&k=valid&fmt=text'), env)
  expect(await env.DB.prepare('SELECT COUNT(*) FROM events').first('COUNT(*)')).toBe(1)
})
