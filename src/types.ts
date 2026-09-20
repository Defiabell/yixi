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
   * Which 「渡」 scene this reader chose at /surf/setup: a bare `SceneKey`, or
   * `'custom:'` plus their own words. NULL/unset means they never chose, and
   * the flow still runs on the neutral default. Optional for the same reason
   * `today_goals` is above — every existing `User` literal in the test suite
   * keeps compiling unedited. Read it through `sceneOf`/`sceneTrigger` in
   * src/surfscenes.ts rather than directly.
   */
  surf_scene?: string | null
  /**
   * One line this reader wrote for their own worst moment, shown on /surf's
   * first screen under the scene's opening. NULL/unset/empty means nothing is
   * shown — it is the whole product's only piece of copy the reader writes.
   */
  surf_line?: string | null
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

/**
 * 身体状态。v1 的第 0 步问过这个，v2 不问了——冲动来时的页面上一个选择都不留，
 * 所以新行一律写 `''`。枚举和列都保留：历史行还在，`summarizeUrges` 也还按它分桶。
 */
export type UrgeState = 'hungry' | 'angry' | 'lonely' | 'tired' | 'none'
export const URGE_STATES: readonly UrgeState[] = ['hungry', 'angry', 'lonely', 'tired', 'none']

/** 'passed' 过去了；'opened' 我点开了——收尾文案对两者一样安静，不是失败态。 */
export type UrgeOutcome = 'passed' | 'opened'

/**
 * 一条冲动流程记录。`outcome`/`ended_at` 为 NULL 表示中途关掉页面，没走完；
 * `state` 在 v2 里永远是 `''`（那一步已经删掉），`trigger` 是服务端从
 * `users.surf_scene` 填的场景 key 或自定义文本，`''` = 那个账号还没配过场景。
 * `note` 同样只剩历史行会有值：v2 的收尾页不再让人打字。
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

/**
 * 步 1 的兜底上限，不是它的时长。五段小任务里有两段（手上的事、周围的事）只能
 * 靠人点按钮结束，人可能拿着手机走开、锁屏、睡着——十五分钟到就直接进步 2，
 * 不管走到第几段。正常走完五段大约八到十分钟。
 */
export const SURF_ROUND_MS = 15 * 60 * 1000
/**
 * `op=start` 复用一条尚未结束记录的窗口——见 src/ui/surf.ts 里 `findOpenUrge`
 * 的用法。`start` 现在一加载页面就发，刷新/误触/切回后台标签页都会再发一次，
 * 没有这个窗口每一次都会新开一行，把「三十天 N 次」的次数吹起来。
 *
 * 必须大于两轮兜底（2 × `SURF_ROUND_MS` = 30 分钟）：一个人走完一轮点「再来
 * 十分钟」、第二轮又靠兜底结束，整段就是 30 分钟；iOS 把后台标签页恢复回来
 * 时重发的 `start` 要还能认出这是同一次冲动，而不是新开一行。35 分钟是那条
 * 下界加一点余量。
 */
export const SURF_RESUME_MS = 35 * 60 * 1000
/** 自定义场景那几个字的上限——写在按钮旁边，长了那一屏就不成立了。 */
export const SURF_SCENE_LEN = 10
/** 「想对那一刻的自己说的一句话」的字数上限。 */
export const SURF_LINE_LEN = 40
