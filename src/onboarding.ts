/** Only aggregate counts leave this module; no account or event rows. */
export interface OnboardingCounts {
  registered: number
  pending: number
  mature: number
  opened: number
  activated: number
  without_setup: number
  retention_pending: number
  retention_mature: number
  retained: number
}

export async function recordSetupOpened(db: D1Database, userId: number, now = Date.now()): Promise<void> {
  await db.prepare(`UPDATE users SET setup_opened_at = ?2
    WHERE id = ?1 AND onboarding_version = 1 AND is_owner = 0 AND setup_opened_at IS NULL`)
    .bind(userId, now).run()
}

/** Rolling 30-day registration cohort; 7-day activation and exact D7 retention.
 * Only complete observation windows enter a rate. Intervals are half-open.
 * Activation is an observed gate request, not proof of an iOS automation.
 */
export async function onboardingCounts(db: D1Database, now = Date.now()): Promise<OnboardingCounts> {
  const row = await db.prepare(`WITH cohort AS (
    SELECT u.id, u.created_at, u.setup_opened_at,
      (SELECT MIN(e.ts) FROM events e WHERE e.user_id = u.id AND e.kind = 'attempt'
        AND e.ts >= u.created_at AND e.ts < u.created_at + 604800000 AND e.ts <= ?1) AS first_at
    FROM users u WHERE u.onboarding_version = 1 AND u.is_owner = 0
      AND u.created_at >= ?1 - 2592000000 AND u.created_at <= ?1
  ) SELECT COUNT(*) AS registered,
    COUNT(CASE WHEN created_at + 604800000 > ?1 THEN 1 END) AS pending,
    COUNT(CASE WHEN created_at + 604800000 <= ?1 THEN 1 END) AS mature,
    COUNT(CASE WHEN created_at + 604800000 <= ?1 AND setup_opened_at >= created_at
      AND setup_opened_at < created_at + 604800000 THEN 1 END) AS opened,
    COUNT(CASE WHEN created_at + 604800000 <= ?1 AND first_at IS NOT NULL THEN 1 END) AS activated,
    COUNT(CASE WHEN created_at + 604800000 <= ?1 AND first_at IS NOT NULL
      AND (setup_opened_at IS NULL OR setup_opened_at > first_at) THEN 1 END) AS without_setup,
    COUNT(CASE WHEN first_at + 691200000 > ?1 THEN 1 END) AS retention_pending,
    COUNT(CASE WHEN first_at + 691200000 <= ?1 THEN 1 END) AS retention_mature,
    COUNT(CASE WHEN first_at + 691200000 <= ?1 AND EXISTS (
      SELECT 1 FROM events e WHERE e.user_id = cohort.id AND e.kind = 'attempt'
        AND e.ts >= first_at + 604800000 AND e.ts < first_at + 691200000
    ) THEN 1 END) AS retained
    FROM cohort`).bind(now).first<OnboardingCounts>()
  if (!row) throw new Error('Onboarding aggregate missing')
  return row
}
