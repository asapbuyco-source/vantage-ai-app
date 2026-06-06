# Vantage AI Deep Audit Implementation Plan

Date: 2026-06-05
Scope: full app remediation plan plus prediction-engine deep dive.

## Executive Summary

Vantage AI is a real, feature-rich product: React/Vite frontend, Express backend, Firebase/Firestore, payment flows, admin controls, PWA support, and a Python quant engine. The strongest technical area is the prediction engine architecture. The weakest production areas are payment hardening, secret hygiene, dependency security, and formal test coverage.

Overall target: move the app from a feature-complete beta into a safer production-grade system by tightening trust boundaries, removing legacy client-side payment fulfillment, validating quant performance continuously, and turning existing loose scripts into repeatable CI checks.

Current grade from audit:

- Product scope: A-
- Frontend UX: B+
- Frontend architecture: B
- Backend/API: B-
- Payments: C-
- Security: C
- Firestore/data model: B
- Prediction engine: B+
- Performance: B-
- PWA/offline: B
- SEO/deployment: B
- Observability: B-
- Testing: C
- Maintainability: C+

Target grade after this plan:

- Security: A-
- Payments: A-
- Prediction engine: A-
- Testing: B+
- Production readiness: A-

## Critical Findings To Address

### 1. Secret Hygiene

Finding:

- `.env.local` contains real-looking API credentials and service tokens.
- Several sensitive variables still use `VITE_` prefixes, which are frontend-exposable by design.
- Current build embedded expected Firebase public config and backend URL, but `VITE_` payment/sports/AI keys remain dangerous because one import can expose them.

Affected areas:

- `.env.local`
- `.env.example`
- `server.js`
- `backend/quant/data_pipeline.py`
- `backend/quant/grading_engine.py`
- `backend/quantService.js`

Implementation:

1. Rotate all credentials currently present in local `.env.local`.
2. Remove all sensitive `VITE_` variables from local and production environments:
   - `VITE_GOOGLE_GENAI_API_KEY`
   - `VITE_FAPSHI_USER_TOKEN`
   - `VITE_FAPSHI_API_KEY`
   - `VITE_SPORTMONKS_API_TOKEN`
   - `VITE_API_BASKETBALL_KEY`
3. Keep only truly public frontend values under `VITE_`:
   - Firebase web config
   - `VITE_BACKEND_URL`
   - public checkout/product links only if they are not secret
4. Update backend/Python code to read only backend names:
   - `GOOGLE_GENAI_API_KEY`
   - `FAPSHI_USER_TOKEN`
   - `FAPSHI_API_KEY`
   - `SPORTMONKS_API_TOKEN`
   - `API_BASKETBALL_KEY`
5. Add a prebuild secret scanner script that fails if sensitive key names appear under `VITE_`.

Acceptance criteria:

- No private token appears under a `VITE_` prefix.
- `npm run build` output does not contain private API values.
- `.env.example` clearly separates frontend-public and backend-private values.
- Rotated credentials are confirmed in the provider dashboards.

Priority: P0
Effort: 0.5-1 day

### 2. Selar Webhook Trust Boundary

Finding:

- `server.js` accepts `POST /api/payments/selar/webhook` without signature verification.
- It marks a pending reference as used and calls `fulfillVipPayment`.
- It does not strongly validate provider authenticity, amount, plan, currency, or idempotent provider event ID.

Affected file:

- `server.js`

Implementation:

1. Add Selar webhook signature verification using Selar's official webhook secret/header scheme.
2. Reject unsigned or invalid webhook requests with `401`.
3. Validate:
   - reference format: `VAN_[a-f0-9]{24}`
   - status is successful/paid according to Selar canonical event field
   - amount exactly matches `PLAN_CONFIG[pending.plan].amount`
   - currency matches expected currency
   - pending record exists and belongs to a known user
4. Use `fulfillVipPayment` as the only fulfillment path.
5. Store raw provider event plus a stable provider event ID in `payment_transactions`.
6. Make the webhook idempotent:
   - duplicate event returns `200 { ok: true, alreadyProcessed: true }`
   - no duplicate referral commission
7. Add tests for valid webhook, bad signature, wrong amount, duplicate event, missing reference.

Acceptance criteria:

- Invalid signature cannot grant VIP.
- Wrong amount cannot grant a higher plan.
- Duplicate webhook cannot extend VIP or double-credit referrals.
- All payment fulfillment occurs through backend Admin SDK transactions.

Priority: P0
Effort: 1-2 days

### 3. Fapshi Flow Split Between Legacy And Server Fulfillment

Finding:

- `components/PaymentModal.tsx` uses legacy `/api/fapshi/initiate`.
- `services/fapshi.ts` checks unauthenticated `/api/fapshi/status/:transId`.
- `context/AuthContext.tsx` still contains browser-side VIP upgrade logic.
- A safer server-side flow already exists at `/api/payments/fapshi/initiate` and `/api/payments/fapshi/verify`.

Affected files:

- `components/PaymentModal.tsx`
- `services/fapshi.ts`
- `context/AuthContext.tsx`
- `server.js`

Implementation:

1. Replace `initiatePayment(amount, email, userId)` with `initiateFapshiPayment(plan)`.
2. Call `POST /api/payments/fapshi/initiate` with Firebase Bearer token.
3. Store only `pendingFapshiTransId` for redirect continuity.
4. On return, call `verifyFapshiPayment(transId)`.
5. Delete or deprecate:
   - `POST /api/fapshi/initiate`
   - `GET /api/fapshi/status/:transId`
   - browser-side `upgradeToVip` path for Fapshi
6. Ensure backend verification checks:
   - payment intent exists
   - intent belongs to Firebase user
   - Fapshi status is successful
   - paid amount maps exactly to selected plan
   - transaction is idempotent
7. Move referral commission exclusively into `fulfillVipPayment`.

Acceptance criteria:

- A browser cannot grant itself VIP by knowing a successful transaction ID.
- Payment amount, selected plan, and user identity are all enforced server-side.
- Legacy endpoints are removed or return `410 Gone`.
- Payment UI behavior remains unchanged for users.

Priority: P0
Effort: 1-2 days

### 4. Dependency Vulnerabilities

Finding:

- `npm audit --audit-level=moderate` reported 31 vulnerabilities:
  - 1 critical
  - 13 high
  - 16 moderate
  - 1 low
- Notable packages include `protobufjs`, `express-rate-limit`, `react-router`, `vite`, `lodash`, `path-to-regexp`, and transitive Firebase/Admin dependencies.

Implementation:

1. Run `npm audit fix`.
2. Re-run:
   - `npm run typecheck`
   - `npm run build`
   - payment tests
   - admin route tests
3. Manually upgrade packages if audit remains red:
   - `vite`
   - `react-router`
   - `react-router-dom`
   - `express-rate-limit`
   - `firebase-admin`
4. Avoid `npm audit fix --force` until a branch/test pass exists because it may downgrade or break Firebase Admin.
5. Add `npm run security:audit` to CI.

Acceptance criteria:

- `npm audit --audit-level=high` passes.
- Any remaining moderate issues are documented with reachable/not-reachable analysis.
- Build and typecheck still pass.

Priority: P0/P1
Effort: 0.5-2 days depending on transitive breakage

### 5. Admin Auth Cleanup

Finding:

- Admin JWT exchange is good: Firebase ID token is verified and profile `isAdmin` is checked.
- Legacy `x-admin-token` auth remains.
- Frontend `pages/Admin.tsx` still contains stale `VITE_ADMIN_API_SECRET` variables even though requests use Bearer JWT.

Implementation:

1. Remove unused `adminToken` variables from `pages/Admin.tsx`.
2. Move all admin fetches to `services/adminApi.ts`.
3. Restrict legacy `x-admin-token` to server-to-server usage or remove it.
4. Add a server-side admin middleware test:
   - no token: 401
   - non-admin Firebase token: 403
   - admin Firebase token: 200
   - expired JWT: 401
5. Consider using Firebase custom claims for admin status while keeping Firestore profile as display state.

Acceptance criteria:

- No `VITE_ADMIN_API_SECRET` references remain.
- All admin API calls use one shared helper.
- Admin middleware behavior is covered by tests.

Priority: P1
Effort: 1 day

## Prediction Engine Deep Dive

## Current Engine Architecture

The football prediction engine lives primarily in `backend/quant`. It is materially stronger than a simple AI prompt system. It follows this rough pipeline:

1. Fetch fixtures, team stats, recent form, odds, injuries, H2H, and league metadata.
2. Build `MatchData` with home/away stats and odds.
3. Estimate expected goals.
4. Run Poisson score-grid model with Dixon-Coles correction.
5. Run Elo match-outcome model.
6. Run form model.
7. Optionally blend H2H when sample size is sufficient.
8. Combine probabilities with weighted consensus.
9. Apply empirical calibration factors.
10. Compare model probabilities against devigged market probabilities.
11. Select value bets by EV and inefficiency thresholds.
12. Apply risk filters.
13. Calculate fractional Kelly stake.
14. Save picks to Firestore.
15. Grade results later, update CLV, calibration data, and Elo ratings.
16. Backtest historical predictions.

This is the right shape for a betting prediction product. The gaps are not basic modeling gaps; they are validation, calibration lifecycle, data-quality enforcement, and testing gaps.

## Prediction Engine Strengths

### 1. Data Model Is Rich

`data_pipeline.py` defines:

- `TeamStats`
- `OddsData`
- `MatchData`

Useful inputs already exist:

- home/away goal averages
- home/away split averages
- form score
- win rate
- clean sheet rate
- xG created/conceded
- possession
- shots on target
- injury/sidelined counts
- recent opponent IDs
- H2H wins/draws/goals/BTTS
- current and opening odds
- line movement fields

This is a strong base for model transparency and later feature expansion.

### 2. Poisson Model Is Not Naive

`poisson_model.py`:

- uses a score grid up to 12 goals
- caps extreme xG at 4.5
- applies Dixon-Coles low-score correction
- computes dynamic rho by derby/high-xG/mismatch context
- normalizes probability mass
- exposes probabilities for result, totals, BTTS, double chance, DNB, and scorelines

The dynamic rho and mass-truncation warning are especially good signs.

### 3. Ensemble Model Is Sensible

`probability_engine.py` blends:

- Poisson: 60%
- Elo: 25%
- Form: 10%
- H2H: 5%

It normalizes weights and avoids using H2H when sample size is too low. It also correctly avoids double-counting form in adjusted xG, according to current comments.

### 4. Market Comparison Uses Devigging

`ev_engine.py` does not compare against raw implied probability only. It uses a power/logarithmic devig approach for 1X2 and two-way markets. That is important because raw implied probability includes bookmaker margin and can inflate or hide edge.

### 5. Risk Filters Exist

`risk_filters.py` filters by:

- minimum odds
- maximum odds
- tier-adjusted probability floors
- tier-adjusted EV floors
- minimum market inefficiency
- suspicious defensive-market probability caps
- odds staleness guard

This is exactly where a betting app should become conservative.

### 6. Kelly Sizing Is Conservative

`kelly_optimizer.py` uses quarter Kelly and caps stake at 5% of bankroll. It also avoids forcing a minimum stake, which prevents phantom bets on tiny/negative edges.

### 7. Grading/Backtesting Are Present

`grading_engine.py` grades predictions, tracks CLV, updates calibration, and updates Elo ratings. `backtester.py` computes hit rate, ROI, P/L, market stats, CLV, streaks, and bankroll simulation.

That feedback loop is essential. The next step is making it automatic and trusted.

## Prediction Engine Risks

### Risk 1. Calibration Is Hard-Coded

Current `MARKET_CALIBRATION` in `probability_engine.py` uses fixed factors derived from a 30-day backtest.

Problem:

- Market behavior changes.
- League mix changes.
- API odds availability changes.
- Model code changes can invalidate old calibration.
- A fixed discount can improve yesterday's backtest while degrading tomorrow's picks.

Implementation:

1. Store rolling calibration by market and probability bucket:
   - market
   - probability bucket: 50-55, 55-60, 60-65, etc.
   - predicted average
   - actual hit rate
   - sample size
   - confidence interval
   - last updated date
2. Use calibration only when sample size is high enough:
   - minimum 100 settled picks per market or 50 per bucket
3. Fallback to current static factors when sample size is insufficient.
4. Add a daily calibration report in Firestore.
5. Expose calibration drift in Admin.

Acceptance criteria:

- Calibration factors are generated from settled predictions, not only code constants.
- Small samples do not overfit the model.
- Admin can see which markets are overconfident or underconfident.

Priority: P1
Effort: 2-4 days

### Risk 2. Prediction Selection May Optimize For EV But Not Portfolio Correlation

The engine selects individual value bets and creates accumulators. If many picks are from the same league, same team, same market type, or same odds feed weakness, daily results can become correlated.

Implementation:

1. Add portfolio constraints:
   - max picks per league
   - max picks per market type
   - max picks per kickoff window
   - max exposure to one team
   - max correlated goals-market picks
2. Add daily risk budget:
   - total Kelly exposure cap
   - market-level exposure caps
3. Rank by risk-adjusted EV:
   - score = EV * confidence * freshness * league_quality * calibration_confidence
4. Save rejection reasons for picks that pass EV but fail portfolio constraints.

Acceptance criteria:

- Daily card is not dominated by one market or league.
- Backtest includes max drawdown and exposure concentration.
- Admin can see why high-EV picks were rejected.

Priority: P1
Effort: 2-3 days

### Risk 3. Data Quality Is Not First-Class Enough

The engine has guards, but data quality should become an explicit score that affects selection.

Implementation:

Add `data_quality_score` to each prediction based on:

- recent matches analyzed for both teams
- xG availability
- odds availability
- odds freshness
- league tier
- lineup/injury availability
- H2H sample size
- missing team IDs/logos/stat fields

Suggested scoring:

- 90-100: strong data, top leagues, fresh odds, 8+ recent matches each
- 70-89: usable data, minor gaps
- 50-69: weak but acceptable only for low-risk markets
- below 50: no public pick, dashboard-only lean

Acceptance criteria:

- Every saved prediction has `data_quality_score` and `data_quality_reasons`.
- Risk filters reject low-quality picks.
- Admin dashboard shows data quality distribution per run.

Priority: P1
Effort: 2 days

### Risk 4. Model Weights Are Static

The default 60/25/10/5 blend may be good overall but not necessarily best by league tier, market, or data quality.

Implementation:

1. Keep global defaults as fallback.
2. Add segmented model weights:
   - by league tier
   - by market type
   - by favorite/underdog profile
   - by data quality bucket
3. Use walk-forward validation:
   - train/tune on days N-60 to N-15
   - validate on N-14 to N-1
   - deploy only if validation improves ROI/CLV without increasing drawdown
4. Store active model config in Firestore:
   - version
   - weights
   - thresholds
   - calibration version
   - effective date

Acceptance criteria:

- Model version is stored with every prediction.
- Backtests can compare model versions.
- Weight changes require validation evidence.

Priority: P2
Effort: 4-7 days

### Risk 5. Grading Coverage Can Miss Fixtures

`grading_engine.py` skips predictions if Sportmonks does not return the fixture. That is safer than guessing, but it leaves unresolved picks.

Implementation:

1. Add retry grading windows:
   - T+1 day
   - T+2 days
   - T+5 days
2. Add fallback provider mapping for missing fixtures.
3. Add `grading_status`:
   - pending
   - graded
   - voided
   - missing_result
   - provider_mismatch
4. Alert admin if missing-result rate exceeds 5%.

Acceptance criteria:

- Missing result rate is visible.
- Delayed/postponed matches are handled consistently.
- No pick remains silently pending forever.

Priority: P1
Effort: 1-2 days

### Risk 6. Claims Need Responsible Presentation

The engine calculates probability and EV, but the frontend must avoid implying guaranteed outcomes.

Implementation:

1. Add disclaimers near high-confidence labels.
2. Rename overly certain UI labels:
   - avoid "safe"
   - prefer "lower volatility" or "model edge"
3. Show confidence as model estimate, not certainty.
4. Add historical hit rate by market so users understand variance.

Acceptance criteria:

- UI language does not promise outcomes.
- Prediction cards expose probability, odds, EV, and variance context for VIP users.

Priority: P2
Effort: 1 day

## Prediction Engine Implementation Roadmap

### Phase 1: Stabilize Existing Engine

Tasks:

1. Add unit tests for Poisson probability mass:
   - grid sums to 1
   - no negative cells
   - Over/Under complements are coherent
   - DNB probabilities normalize excluding draw
2. Add unit tests for EV/devig:
   - 1X2 devig sums to 1
   - two-way devig sums to 1
   - EV calculation matches formula
   - line movement demotion works
3. Add unit tests for risk filters:
   - odds below floor reject
   - odds above cap reject
   - tier thresholds apply
   - defensive suspicious probability rejects
4. Add unit tests for Kelly:
   - no edge returns 0
   - positive edge returns quarter Kelly
   - stake cap respected
5. Add grading tests:
   - each supported market grades correctly
   - void/postponed behavior is explicit

Acceptance criteria:

- Python quant unit suite runs locally and in CI.
- Existing `test-logic.mjs` is not the only safety net.

Priority: P0/P1
Effort: 2-3 days

### Phase 2: Add Model Versioning

Tasks:

1. Define `MODEL_VERSION`, `CALIBRATION_VERSION`, and `THRESHOLD_VERSION`.
2. Save these with every prediction.
3. Save full model contribution fields:
   - poisson probability
   - elo probability
   - form probability
   - h2h probability
   - calibrated probability
   - raw probability
4. Add an Admin model diagnostics panel.

Acceptance criteria:

- Every prediction can be traced back to the model config that produced it.
- Backtests can filter by model version.

Priority: P1
Effort: 2 days

### Phase 3: Rolling Calibration

Tasks:

1. Extend `calibration.py` to calculate per-market/per-bucket calibration.
2. Add minimum sample-size thresholds.
3. Store calibration docs in Firestore:
   - `quant_calibration/{market}_{bucket}`
   - or `quant_calibration/{date}/markets/{market}`
4. Update `probability_engine.py` to optionally load active calibration config.
5. Add safe fallback to static factors.

Acceptance criteria:

- Calibration data updates after grading.
- Engine uses current calibration only when statistically credible.

Priority: P1
Effort: 3-5 days

### Phase 4: Data Quality Scoring

Tasks:

1. Implement `compute_data_quality(match)`.
2. Save quality score and reasons.
3. Add risk filter rule:
   - reject score below 50
   - require higher EV for score 50-70
4. Show quality warnings in Admin.

Acceptance criteria:

- No prediction lacks quality score.
- Low-quality picks do not reach user-facing VIP picks.

Priority: P1
Effort: 2 days

### Phase 5: Portfolio-Aware Pick Selection

Tasks:

1. Add daily exposure manager.
2. Track selected picks by:
   - league
   - market
   - kickoff hour
   - team
   - odds band
3. Apply constraints after individual risk filters.
4. Save accepted/rejected candidate lists for audit.

Acceptance criteria:

- Daily slate has controlled concentration.
- Admin can inspect why candidates were rejected.

Priority: P2
Effort: 3-5 days

### Phase 6: Continuous Backtesting And Alerts

Tasks:

1. Schedule daily backtest after grading.
2. Save metrics:
   - ROI
   - hit rate
   - CLV
   - market-level ROI
   - drawdown
   - calibration error
   - Brier score
   - log loss
3. Alert when:
   - 7-day ROI below threshold
   - CLV turns negative
   - calibration error spikes
   - missing-result rate spikes

Acceptance criteria:

- Admin can see model health without running scripts manually.
- Bad model drift produces a visible alert before users lose trust.

Priority: P2
Effort: 3-5 days

## App-Wide Implementation Roadmap

### Phase 0: Branch And Safety Setup

Tasks:

1. Create branch: `codex/deep-audit-remediation`
2. Add CI workflow:
   - npm install
   - npm run typecheck
   - npm run build
   - npm audit high threshold
   - JS tests
   - Python quant tests
3. Add secret scanning:
   - reject private keys
   - reject `VITE_*SECRET`
   - reject `VITE_*TOKEN`
   - reject `VITE_*API_KEY` except Firebase allowlist

Acceptance criteria:

- No remediation merges without CI passing.

Priority: P0
Effort: 1 day

### Phase 1: Security And Payments

Tasks:

1. Rotate leaked/local secrets.
2. Remove sensitive `VITE_` env usage.
3. Secure Selar webhook.
4. Migrate Fapshi to server fulfillment.
5. Remove browser-side VIP grants.
6. Add payment tests.
7. Add Firestore rules tests for:
   - users cannot set `isVip`
   - users cannot set `isAdmin`
   - users can create payout requests only within rules
   - only admin can write predictions/settings

Acceptance criteria:

- Payment trust is backend-only.
- Firestore rules enforce paid/admin boundaries.

Priority: P0
Effort: 4-7 days

### Phase 2: Dependency And Build Hardening

Tasks:

1. Upgrade vulnerable packages.
2. Remove stale dependencies where possible.
3. Add bundle analysis.
4. Split heavy chunks:
   - Firebase usage
   - admin page
   - prediction/VIP modules
5. Review service worker API caching for paid/protected data.

Acceptance criteria:

- Audit high severity passes.
- Main bundle warning is reduced or justified.
- Paid/API data is not cached in a way that leaks between users.

Priority: P1
Effort: 2-4 days

### Phase 3: Maintainability Cleanup

Tasks:

1. Remove stale `VITE_ADMIN_API_SECRET` code.
2. Consolidate admin API calls into `services/adminApi.ts`.
3. Remove legacy payment endpoints after migration.
4. Update README with real local setup:
   - frontend
   - backend
   - Firebase
   - quant dependencies
   - test commands
5. Archive old audit docs or create one canonical status doc.

Acceptance criteria:

- New contributor can run the app using README only.
- Duplicate payment/admin paths are gone.

Priority: P1
Effort: 2-3 days

### Phase 4: Observability

Tasks:

1. Add structured request logging for payment endpoints.
2. Add correlation IDs for payment initiation -> verification -> fulfillment.
3. Add scheduler health status:
   - last football generation
   - last basketball generation
   - last quant generation
   - last grading
   - last blog generation
4. Add Admin health panel.
5. Capture quant process failures with stderr and exit code.

Acceptance criteria:

- Admin can tell whether the system ran today and where it failed.
- Payment support can trace a customer transaction.

Priority: P2
Effort: 2-3 days

## Test Plan

Required commands:

```bash
npm run typecheck
npm run build
npm audit --audit-level=high
node test-logic.mjs
```

Add these commands:

```bash
npm run test:server
npm run test:firestore-rules
npm run test:payments
npm run test:quant
```

Prediction engine test cases:

- Poisson grid sums to 1.
- Dixon-Coles tau never produces negative probabilities.
- Over 2.5 plus Under 2.5 equals approximately 1.
- BTTS plus BTTS No equals approximately 1.
- DNB home plus DNB away equals approximately 1.
- Devigged 1X2 probabilities sum to 1.
- EV is `(probability * odds) - 1`.
- No odds -> no value bet.
- Stale odds -> demotion or rejection.
- Kelly stake caps at 5%.
- Grading handles every supported market.
- Backtest does not force stakes when Kelly is 0.

Payment test cases:

- Fapshi initiate requires Firebase auth.
- Fapshi verify rejects another user's transId.
- Fapshi verify rejects wrong amount.
- Fapshi verify is idempotent.
- Selar webhook rejects missing/bad signature.
- Selar webhook rejects wrong amount.
- Selar webhook is idempotent.
- Referral commission is paid once.

Firestore rules test cases:

- user cannot set `isVip`
- user cannot set `isAdmin`
- user cannot update `totalPaid`
- user can update allowed profile fields
- admin can write predictions
- public can read allowed public prediction docs
- non-admin cannot write settings

## Release Plan

1. Create remediation branch.
2. Rotate secrets before any deployment.
3. Deploy backend payment changes to staging.
4. Test Fapshi and Selar with sandbox/small real transactions.
5. Deploy frontend payment wiring.
6. Monitor:
   - payment errors
   - VIP fulfillment count
   - duplicate transaction attempts
   - webhook rejects
7. Enable quant test CI.
8. Deploy rolling calibration behind a feature flag.
9. Enable Admin model diagnostics.

Rollback plan:

- Keep old frontend payment UI hidden behind a feature flag only during migration.
- Do not keep legacy fulfillment endpoints active after migration.
- If new payment verification fails, disable checkout temporarily rather than falling back to browser-side VIP grant.

## Definition Of Done

This remediation is complete when:

- No private credentials are exposed through `VITE_`.
- Payment fulfillment happens only through verified backend transactions.
- Selar webhooks are signature-verified and amount-verified.
- Fapshi legacy status/initiate flow is removed or disabled.
- `npm audit --audit-level=high` passes or remaining findings are documented as not reachable.
- Typecheck/build/tests pass in CI.
- Quant engine has unit tests for probability, EV, risk filters, Kelly, grading, and backtesting.
- Every prediction stores model version, calibration version, data quality score, model contribution fields, EV, odds, Kelly, and final grading status.
- Admin can inspect model health, scheduler health, payment health, and calibration drift.

