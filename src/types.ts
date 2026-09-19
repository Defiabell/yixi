// msg() is dependency-free (see src/i18n/index.ts's own header), so importing
// it here does not risk a cycle: DEFAULT_SURF_TRIGGERS below is the one place
// this file needs to mark a Chinese string as UI copy destined for t() later.
import { msg } from './i18n'

export interface Env {
  DB: D1Database
  /**
   * Legacy. Browser sessions are rows in `sessions_web` now and the cookie
   * carries only an opaque id, so nothing is signed with this any more. Kept
   * so existing deployments do not have to drop a secret to upgrade.
   */
  COOKIE_SECRET: string
  /**
   * AES-GCM key the gate tokens are sealed under, so a logged-in holder can
   * read their own key back. `wrangler secret put TOKEN_KEY`.
   *
   * Never reaches D1. Rotating it does not lock anybody out — /gate verifies
   * against `token_hash` and never touches the ciphertext — it only makes the
   * old sealed copies unreadable, so people would have to be re-issued a token
   * to see one again.
   */
  TOKEN_KEY: string
  /**
   * Turnstile, guarding /register only. Both optional and both required
   * together: with either one missing the challenge is disabled and sign-up
   * works exactly as it did before it existed, which is what lets `npm run dev`
   * and a fresh self-host deploy work without a Cloudflare widget. See the
   * header of src/turnstile.ts for the fail-open reasoning and its price.
   *
   * TURNSTILE_SITE_KEY is public — it is rendered into the page — so it can be
   * a plain `[vars]` entry. TURNSTILE_SECRET must be a secret.
   */
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET?: string
}

export interface User {
  id: number
  name: string
  is_owner: number
  created_at: number
  /**
   * The language this user has chosen ('zh' | 'en'), or NULL/unset if they
   * never have. Optional — not just nullable — so every existing `User`
   * literal in the test suite keeps compiling unedited; see
   * src/i18n/index.ts's `localeOf`, which treats a missing property exactly
   * like a NULL one.
   */
  locale?: string | null
  /**
   * How many goal cards this user wants on /today, or NULL/unset for the
   * default. Optional for the same reason `locale` is — every existing `User`
   * literal in the test suite keeps compiling unedited. Read it through
   * `todayGoalLimit` below rather than directly: a stored value is only a
   * number somebody once posted, and this column is the one place a bad one
   * could reach a page.
   */
  today_goals?: number | null
  /**
   * The user's own 「渡」 trigger chips, newline-separated, or NULL/unset for
   * the built-in four. Optional for the same reason `today_goals` is above —
   * every existing `User` literal in the test suite keeps compiling
   * unedited. Read it through `surfTriggers` below rather than directly.
   */
  surf_triggers?: string | null
}

export interface UserApp {
  user_id: number
  app: string
  label: string
  scheme: string
  wait_seconds: number
  grace_seconds: number
  enabled: number
}

export interface Session {
  sid: string
  user_id: number
  app: string
  created_at: number
  resolved_at: number | null
}

/**
 * A logged-in browser. Distinct from `Session` above, which is one
 * interception; these two never mix and are deliberately named apart.
 *
 * The id is the entire cookie value, so a row here is the only thing that makes
 * a cookie work: deleting it signs that browser out, and deleting a user's rows
 * signs them out everywhere. That is the whole reason this table exists.
 */
export interface WebSession {
  id: string
  user_id: number
  created_at: number
  expires_at: number
}

/**
 * attempt     — a genuine impulse: the automation fired outside any grace window
 * grace_pass  — the automation re-firing while we hand control back; machine noise
 * proceeded   — user pushed through the wait and opened the app
 * abandoned   — user backed out
 *
 * Statistics use `attempt` as the sole denominator. Counting grace_pass would
 * make every ratio meaningless.
 */
export type EventKind = 'attempt' | 'grace_pass' | 'proceeded' | 'abandoned'

export type GateDecision =
  | { action: 'pass' }
  | { action: 'block'; url: string }

/** Sessions older than this are dead links; /b refuses to render them. */
export const SESSION_TTL_MS = 10 * 60 * 1000

export const DEFAULT_WAIT_SECONDS = 10
export const DEFAULT_GRACE_SECONDS = 90

// --- goals（/today、/goals）--------------------------------------------------

export interface Goal {
  id: number
  user_id: number
  title: string
  /** 触发时机，「早饭后」「地铁上」，纯展示。 */
  cue: string
  /** 跳转目标：自定义 scheme 或 https 网址；'' 表示没绑。 */
  target: string
  /** 「B 站」；按钮显示「去 B 站」，空则「去做」。 */
  target_label: string
  position: number
  /** YYYY-MM-DD；NULL = 长期。 */
  until: string | null
  created_at: number
  archived_at: number | null
}

/**
 * 挂在目标下的子任务：每天都要做的那几件小事，不是一次性待办。
 * 完成状态不在这里，在 goal_task_checkins（每天一行）。
 */
export interface GoalTask {
  id: number
  goal_id: number
  user_id: number
  title: string
  /** 这条子任务自己的跳转目标；'' 表示跟着所属目标的跳转走。 */
  target: string
  /** 「B 站」；行内按钮显示「去 B 站」，空则「去做」。 */
  target_label: string
  position: number
  created_at: number
}

/**
 * 一天的快照，由 00:00（Asia/Shanghai）的 cron 写入一次后不再改：那天
 * /today 展示了几个目标（shown）、打了几个卡（done）、勾了几次子任务
 * （tasks_done）。没跑到的日子在 goal_days 里就是空位，不是这个类型的值。
 *
 * tasks_done 在 2026-09-14 之前的历史行里是「当天划掉的一次性子任务条数」，
 * 之后是「当天的子任务勾选次数」。两者都是「那天做了多少」，不回填不换算。
 */
export interface GoalDay {
  user_id: number
  date: string
  shown: number
  done: number
  tasks_done: number
  ts: number
}

/**
 * /today 只展示排前面的这几个；其余折叠。产品立场，不是技术限制——但「几个」
 * 由用户自己定，这里是没选过时的那个数。
 */
export const TODAY_GOAL_LIMIT = 3
/** 用户能选的范围。下界是 1（总得有一件事），上界 9 是一屏还看得完的量。 */
export const TODAY_GOALS_MIN = 1
export const TODAY_GOALS_MAX = 9

/**
 * 这个用户的 /today 放几张卡片。
 *
 * 存的是整数或 NULL，但读的时候一律当「可能是任何东西」：没选过、被别的写入
 * 路径塞进来一个 0、一个 3.5、一个 99——都回落到默认值，而不是把一个荒唐的
 * 数字交给 slice()。这是 /today、/today/review 和午夜快照三处共用的口径，三处
 * 各算各的正是 shownGoals 当初合并出来要避免的那种 bug。
 */
export function todayGoalLimit(user: Pick<User, 'today_goals'>): number {
  const n = user.today_goals
  if (typeof n !== 'number' || !Number.isInteger(n)) return TODAY_GOAL_LIMIT
  if (n < TODAY_GOALS_MIN || n > TODAY_GOALS_MAX) return TODAY_GOAL_LIMIT
  return n
}
/** 到期目标「续一期」的长度。 */
export const GOAL_EXTEND_DAYS = 28

// --- urges（/surf）----------------------------------------------------------

/** 身体状态 chip。'none' 是「都不是」，不是「没选」——第 0 步两组各选一个才进下一步。 */
export type UrgeState = 'hungry' | 'angry' | 'lonely' | 'tired' | 'none'
export const URGE_STATES: readonly UrgeState[] = ['hungry', 'angry', 'lonely', 'tired', 'none']

/** 'passed' 过去了；'opened' 我点开了——收尾文案对两者一样安静，不是失败态。 */
export type UrgeOutcome = 'passed' | 'opened'

/**
 * 一条冲动流程记录。`outcome`/`ended_at` 为 NULL 表示中途关掉页面，没走完；
 * `state`/`trigger` 为 `''` 是「没选」而非枚举值（`state` 的枚举里 `'none'`
 * 才是「都不是」）。
 */
export interface Urge {
  id: number
  user_id: number
  started_at: number
  ended_at: number | null
  outcome: UrgeOutcome | null
  state: UrgeState | ''
  trigger: string
  rounds: number
  note: string
}

/** 第 2 步一轮的时长：十分钟。 */
export const SURF_ROUND_MS = 10 * 60 * 1000
/** `surf_triggers` 最多保留的行数。 */
export const SURF_TRIGGER_MAX = 8
/** 每行触发场景最多保留的字数。 */
export const SURF_TRIGGER_LEN = 20
/** 「下次哪一步换成什么」输入框的字数上限。 */
export const SURF_NOTE_LEN = 80

/** 默认四条走 msg()，展示时再 t()。 */
export const DEFAULT_SURF_TRIGGERS: readonly string[] = [
  msg('躺床上刷手机'),
  msg('独自在家无事'),
  msg('屏幕上看到了什么'),
  msg('情绪低落'),
]

/**
 * `surf_triggers` 是用户自己敲的自由文本，永远当「可能是任何东西」处理，跟
 * `todayGoalLimit` 对 `today_goals` 的态度一样：NULL/空/全是空行都回落默认，
 * 而不是把一个空数组交给 `/surf` 第 0 步的 chip 列表。返回值是已经按用户
 * 配置切好的数组——去空行、按去空格后的原文去重、截 `SURF_TRIGGER_MAX` 条、
 * 每条再截 `SURF_TRIGGER_LEN` 字（去重在截字之前，两条只在长度上不同的输入
 * 不会被误判成同一条）。返回的是 zh 源文（走 `msg()`）或用户自己的原文，
 * 都不是已翻译的展示文本——展示时调用方再自己 `t()`。
 */
export function surfTriggers(user: Pick<User, 'surf_triggers'>): string[] {
  const raw = user.surf_triggers
  if (typeof raw !== 'string') return [...DEFAULT_SURF_TRIGGERS]

  const seen = new Set<string>()
  const lines: string[] = []
  for (const rawLine of raw.split('\n')) {
    const trimmed = rawLine.trim()
    if (trimmed.length === 0 || seen.has(trimmed)) continue
    seen.add(trimmed)
    lines.push(trimmed)
  }
  if (lines.length === 0) return [...DEFAULT_SURF_TRIGGERS]
  return lines.slice(0, SURF_TRIGGER_MAX).map((line) => line.slice(0, SURF_TRIGGER_LEN))
}
