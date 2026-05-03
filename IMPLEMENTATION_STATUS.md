# Vantage AI — Implementation Status

**Generated**: 2026-05-03
**Scope**: 60-step FINAL IMPLEMENTATION PLAN (from `MINIMAX_IMPLEMENTATION_PLAN.md`)
**Method**: Cross-referenced against `AUDIT_REPORT.md`, `GAP_ANALYSIS.md`, and codebase

---

## Summary

| Category | Count |
|----------|-------|
| Total steps | 60 |
| ✅ Completed | ~27 |
| ❌ Not started | ~33 |

---

## ✅ Completed Steps

### Step 1 — Hardcoded secrets externalized
- `fetch_leagues.mjs`, `test-pagination.mjs`, `test-livescore.js` — API tokens moved to `process.env`

### Step 3 — Firestore `settings` collection split
- `settings/internal` (admin-only) added for secrets: `telegramBotToken`, `telegramChannelId`, `whatsappGroupUrl`
- `settings/app` now public-read for non-sensitive config
- `firestore.rules` updated: `allow read: if isAdmin()` for `settings/internal`
- `services/db.ts`: `getInternalSettings()` / `saveInternalSettings()` added
- `telegramService.js`: reads from both `settings/internal` and `settings/app`
- `Admin.tsx`: loads public settings + internal settings separately; saves to correct paths

### Step 4 — XSS sanitization
- `sanitize-html` added to `package.json`
- `server.js` blog SSR endpoint replaces XSS regex block with full `sanitize-html` config
- `allowedTags`, `allowedAttributes`, https-only href transform

### Step 5 — Admin auth hardened
- `server.js` `adminAuth` middleware: returns 503 if `ADMIN_API_SECRET` unset (was: fail-open in dev)
- Only returns 401 for invalid/missing tokens

### Step 6 — Admin JWT flow
- `GET /api/admin/token` endpoint added to `server.js`
- Issues 15-minute JWT signed with `ADMIN_JWT_SECRET` (or `ADMIN_API_SECRET` as fallback)
- `adminAuth` middleware updated: accepts either legacy `x-admin-token` header OR `Authorization: Bearer <JWT>`
- `Admin.tsx`: fetches JWT on mount via `x-admin-token` exchange; stores in sessionStorage; uses `Authorization: Bearer` on all admin API calls
- `jsonwebtoken` added to `package.json`

### Step 7 — Python env scoped whitelist
- `quantService.js` `buildPythonEnv()`: replaced `...process.env` spread with explicit whitelist of 9 vars: `SPORTMONKS_API_TOKEN`, `API_FOOTBALL_KEY`, `VITE_API_BASKETBALL_KEY`, `GOOGLE_GENAI_API_KEY`, `OPENAI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `LD_LIBRARY_PATH`, `PYTHONUNBUFFERED`, `PYTHONPATH`

### Step 8 — Gmail/Selar idempotency
- `processed_emails/{msgId}` Firestore collection added
- `gmailListener.js`: checks `processedSnap.exists()` at start of each message loop; marks processed after successful upgrade or skip
- `firestore.rules`: `allow read: if isAdmin()` / `allow write: if false` (Admin SDK only)

### Step 9 — Concurrency guard for liveScoreTask
- `scheduler.js` liveScoreTask: acquires `generation_locks/live_grading_<date>` doc with 3-min TTL before running; skips if fresh lock exists

### Step 10 — MarketType enum
- `grading_engine.py`: `MarketType` enum class defined with 15 market types
- `resolveMarket(market)` function: normalizes free-text market strings to enum values using structured if/else (not fragile `includes()` chains)
- `_grade_bet()` refactored to use `resolveMarket()` — single dispatch instead of repeated string matching

### Step 12 — DataContext race condition
- `fetchFromDB` in `DataContext.tsx`: promise deduplication check moved to AFTER date parsing, so concurrent calls with the same date get the same promise
- Promise ref stored after date normalization

### Step 13 — Midnight rollover
- `DataContext.tsx` `fetchFromDB`: added midnight rollover check — compares `getGlobalTodayKey()` against targetDate; updates to new today key if they've diverged

### Step 14 — Pricing constants
- `src/constants/pricing.ts` created:
  - `WEEKLY_TRIAL_PRICE = 1000` (first-time users only)
  - `WEEKLY_REGULAR_PRICE = 2000`
  - `MONTHLY_PRICE = 5000`
  - `QUARTERLY_PRICE = 12000`
  - `ANNUAL_PRICE = 35000`
  - `MIN_PAYOUT_FCFA = 1000`
  - `REFERRAL_COMMISSION_PERCENT = 40`
- Updated: `App.tsx`, `TrialOfferPopup.tsx`, `SpecialOfferBanner.tsx`, `AuthContext.tsx`
- `AuthContext.tsx`: `isFirstTime` discount logic restored for weekly plan (1000 first-time / 2000 returning)

### Step 15 — Missing nav translations
- `i18n.ts` `fr.nav` and `en.nav`: added `admin`, `stats`, `results`, `live` keys

### Step 18 — Telegram timeout
- `telegramService.js` `sendMessage()`: added `AbortController` with 30s timeout, `clearTimeout` cleanup, `AbortError` detection
- Errors propagated to caller

### Step 19 — Graceful shutdown
- `scheduler.js`: all cron tasks tracked in `tasks` Map; `stopScheduler()` export stops all tasks by name
- `server.js`: `SIGTERM` and `SIGINT` handlers call `stopScheduler()`, close HTTP server, exit with code 0/1 appropriately

### Step 20 — Gmail redirect URI configurable
- `gmailListener.js`: `GMAIL_REDIRECT_URI` env var (with `http://localhost:3000/oauth2callback` fallback)

### Step 21 — setMonth fix
- `gmailListener.js` expiry calculation: day-1 anchor + clamping pattern for monthly/quarterly/annual plans (replaces direct `setMonth()` which overflows end-of-month dates)

### Step 22 — Promise.allSettled
- `blogGenerator.js` `triggerBlogGeneration`: `Promise.allSettled` replaces `Promise.all`; logs warnings for failed leagues, aggregates succeeded/failed

### Step 25 — Security headers
- `netlify.toml`: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, CSP, HSTS (includeSubDomains)
- SSR proxy redirects for `/predictions/*` and `/sitemap.xml`
- Catch-all `/* → /index.html` last in redirect chain

### Step 26 — Railway health check
- `railway.toml`: `[deploy.healthcheck] path = "/health" timeout = 30`

### Step 27 — VAPID key removed
- `server.js`: hardcoded VAPID fallback removed; `GET /api/push/vapid-key` returns 503 if `VAPID_PUBLIC_KEY` unset

### Step 28 — Async Python binary resolution
- `quantService.js`: `resolvePythonBin()` is now async (cached in `_pythonBin` module-level var); called at spawn time in all 4 Python invocations (pipeline, grading, performance, basketball)
- All spawn calls await `resolvePythonBin()` before `spawn()`

### Step 29 — Rate limiting + caching in sportmonksClient
- `sportmonksClient.js`: per-endpoint rate limit (10 req/min), 60s TTL in-memory cache, cacheGet/cacheSet helpers

---

## ❌ Not Started / Partially Done

### Step 11 — Premature grading fix
**Status: ALREADY IMPLEMENTED**
- `grading_engine.py` line 21: `FINISHED_STATES = {"FT", "AET", "PEN", "FINS"}` — only grades finished matches
- Lines 53-57: secondary check for "FINISH"/"FULL" in state name
- `liveScoreTask` in `scheduler.js`: strict `fixture_id` matching + `['FT', 'AET', 'PEN'].includes(stateShort)` filter already present
- **Verdict**: No action needed

### Steps 16-17 — Match type / fixture_id type consistency
- `fixtureId?: number` (camelCase) vs `fixture_id?: number | string` (snake_case) in `types.ts`
- `normalizeQuantPrediction()` in `db.ts` handles camelCase→snake_case but not the inverse
- Low priority — would require type refactor across multiple files

### Steps 23-24 — Netlify redirects
**Status: ALREADY IMPLEMENTED**
- `netlify.toml` already has `/predictions/*` and `/sitemap.xml` redirects to Railway backend
- Blog pagination: not yet reviewed (Steps 31-59 not yet examined)

### Steps 30-59 — Remaining implementation items
Not yet reviewed. These are from the bulk of the 60-step plan and likely include incremental fixes, edge cases, and minor improvements.

---

## Known Gaps (from GAP_ANALYSIS.md — not in 60-step plan)

These issues exist in the codebase but were not part of the formal implementation plan:

### High Priority
| Issue | Location | Risk |
|-------|---------|------|
| G-05: Frontend `verifyTransaction()` has no deduplication guard | `App.tsx:130` | User refresh could double-grant VIP |
| I-08: `fbq()` call with no optional-chaining guard | `App.tsx:67` | Facebook Pixel failure crashes payment flow |
| S-05: Scheduler cron task re-creation every 5 min (string comparison bug) | `scheduler.js:350` | Tasks destroyed/recreated even when unchanged |

### Medium Priority
| Issue | Location | Risk |
|-------|---------|------|
| G-01: Two competing data sources for `predictions` state | `DataContext.tsx` | Race condition on login |
| G-03: `isAdmin` destructured at line 57, used at 372 — verification needed | `App.tsx` | Runtime crash for non-VIP users (per prior audit) |
| S-02: DataContext re-renders all consumers on every state change | `DataContext.tsx` | Performance on low-end devices |
| I-06: Telegram fixture_id deduplication fails if number vs string | `telegramService.js:155` | Duplicate broadcast messages |

### Low Priority
| Issue | Location |
|-------|---------|
| G-07: Dead `useLocation` import in DataContext |
| E-07: JSONBin bootstrap dead path |
| S-04: Firestore cache has no proactive eviction |
| S-07: `getResultsHistory()` fires 30 parallel reads |

---

## Environment Variables to Set

Before deploying, ensure these are set in production:

### Backend (Railway / server.js)
```
ADMIN_API_SECRET=<secret>           # Required for admin endpoints
ADMIN_JWT_SECRET=<jwt-secret>     # Optional, falls back to ADMIN_API_SECRET
VITE_ADMIN_API_SECRET=<same>      # Must match ADMIN_API_SECRET for JWT exchange
VITE_BACKEND_URL=https://your-backend.railway.app
VITE_SPORTMONKS_API_TOKEN=<token>
VITE_API_BASKETBALL_KEY=<key>
GOOGLE_GENAI_API_KEY=<key>
OPENAI_API_KEY=<key>
FIREBASE_SERVICE_ACCOUNT=<json>
SPORTMONKS_API_TOKEN=<token>
GMAIL_REDIRECT_URI=https://your-domain.com/oauth2callback
GMAIL_REFRESH_TOKEN=<token>
VAPID_PUBLIC_KEY=<key>
SENTRY_DSN=<dsn>
```

### Firestore Rules to Deploy
```bash
firebase deploy --only firestore:rules
```
The `firestore.rules` file has been updated:
- `settings/{docId}`: `allow read: if docId in ['app', 'app_stats']`
- `settings/internal/{docId}`: `allow read, write: if isAdmin()`
- `processed_emails/{msgId}`: `allow read: if isAdmin(); allow write: if false`

### One-time Firestore Migration
To move existing secrets to the new `settings/internal` document:
```js
// Run in Firebase Console → Firestore → Shell or a temporary admin script
const admin = require('firebase-admin');
admin.initializeApp({ credential: ... });
const db = admin.firestore();

const appDoc = await db.collection('settings').doc('app').get();
const data = appDoc.data();
await db.collection('settings').doc('internal').set({
  telegramBotToken: data.telegramBotToken,
  telegramChannelId: data.telegramChannelId,
  whatsappGroupUrl: data.whatsappGroupUrl,
});
// Then remove those fields from settings/app (via Admin.tsx save — do NOT delete the doc)
```

### Deprecated Files (Safety Check)
- `backend/logoEnricher.js` — imports `sportmonksClient` but file doesn't exist at expected path
- `services/football.ts` — deprecated stub; `lastApiError` mutable global should be reviewed
- `services/jsonbin.ts` — unreachable bootstrap path (E-07)
- `supabaseClient.ts` — configured but never imported