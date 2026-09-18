# Onboarding measurement

The owner-only `/admin` page shows aggregate counts for self-registrations made by this release in the preceding 30 × 24 hours. No account-level milestone timestamps, apps, tokens, emails or URLs leave the aggregate query. No third-party analytics are involved.

- `users.onboarding_version = 1` is written in the same insert as self-registration. Migration time does not imply collection started. Existing and manually issued accounts remain NULL and are excluded, even if later claimed. Owner accounts are excluded. Other test accounts cannot automatically be identified.
- `setup_opened_at` records the first authenticated setup-page render. This is a visit, not installation success. Repeated visits do not overwrite it.
- The activation window is `[registration, registration + 7 days)`. Only accounts observed for all 7 days enter the setup-visit and first-interception rates. Activation does not require a setup visit; the page separately counts first interceptions without a preceding visit.
- Activation reuses existing `attempt` events; grace passes and choices are excluded. The built-in setup connectivity check now uses `diagnostic=1`, which authenticates and checks app configuration but creates no session or event. A gate request still cannot prove an iOS automation is installed. Old versions of the setup page can generate diagnostic attempts; historical accounts are deliberately excluded.
- D7 retention means an interception in `[first interception + 168h, first interception + 192h)`. Only accounts observed for 192 hours after activation enter its denominator. Pending windows are displayed separately; no denominator displays `—`, not 0%.

## Rollout

Apply the additive `0009_onboarding.sql` migration before deploying the new Worker. It adds two nullable columns and a partial index, without backfilling historical users or changing existing events. Registration during a migration/deployment gap remains outside the cohort until the new Worker writes the version. Old code remains compatible with the added columns. After a rollback and later redeployment, report interpretation must account for any collection gap.

The migration has not been run against production as part of this change. `npm run deploy` applies remote migrations before deploying, so it must only be invoked with deployment authorization. Verify `/admin` as the owner, `/admin` denial for a normal account, and the first setup visit plus diagnostic check after deployment. Registration cohorts need seven days to mature; activation cohorts need eight days for complete D7 observation.
