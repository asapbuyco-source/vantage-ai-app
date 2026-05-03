# Vantage AI — Comprehensive System Audit Report

**Date**: 2026-05-02  
**Auditor**: Automated Architecture Audit  
**Version**: v4.1.0  

---

## 1. SYSTEM OVERVIEW

### Purpose
Vantage AI is a sports prediction platform targeting the African (primarily Cameroon) market. It combines statistical quant models (Poisson, Elo, Kelly Criterion) with AI-powered analysis (Gemini, OpenAI) to generate football and basketball betting predictions. The platform includes VIP subscription monetization via Fapshi (MoMo) and Selar (card), Telegram broadcasting, and an admin panel.

### Key Components

| Layer | Component | Technology |
|-------|-----------|------------|
| **Frontend** | React 19 SPA with PWA, SSR proxy, i18n (FR/EN) | TypeScript, Vite, TailwindCSS, Framer Motion |
| **Backend Proxy** | Express 5 server — API proxy, SSR, cron scheduler, push notifications | Node.js, Firebase Admin SDK, Pino logger |
| **Quant Engine** | Statistical models: Poisson, Elo, Form, Kelly, Risk Filters, Accumulator | Python 3.11, Firestore Admin SDK |
| **AI Layer** | Gemini (football disabled), OpenAI (blog, accumulators, fallback grading) | Google GenAI SDK, OpenAI Responses API |
| **Data Sources** | Sportmonks Football, API-Football, Basketball API | REST APIs with server-side proxy |
| **Auth & DB** | Firebase Auth + Firestore (profiles, predictions, blogs, settings) | Firebase Client SDK + Admin SDK |
| **Payments** | Fapshi (MoMo/CM), Selar (card/global) | Webhook + email listener |
| **Notifications** | Telegram Bot, Web Push (VAPID), Gmail listener | node-cron, googleapis |
| **Deployment** | Frontend: Netlify / GitHub Pages; Backend: Railway (Nixpacks) | Docker-like, dual runtime (Node + Python) |

### Architecture Diagram (Simplified)

```
[Netlify/CDN] ──SPA──> [Express Backend :8080]
                              │
                    ┌─────────┼──────────┐
                    │         │          │
              [Sportmonks  [Firebase   [Python Quant
               Proxy]      Admin SDK]   Pipeline]
                    │         │          │
                    └──── Firestore DB ───┘
                              │
                    ┌─────────┼──────────┐
                    │         │          │
               [Auth]   [Predictions] [Admin
                                 & Blogs]  Cron Jobs]
```

---

## 2. ISSUES

### ID: 1 | CRITICAL — Plaintext Secrets in Git-Tracked Files

**Description**: Three tracked source files contain live API tokens hardcoded as string literals. These tokens are committed to the git repository and visible to anyone with repo access.

**Root Cause**: Test/utility scripts were written with inline credentials for quick testing and never removed.

| File | Exposed Secret | Line |
|------|---------------|------|
| `fetch_leagues.mjs` | Sportmonks API token `m55Ud6u...` | L1 |
| `test-pagination.mjs` | Sportmonks API token `jFxFL5O...` | L1 |
| `test-livescore.js` | RapidAPI key `9a760334c6msh67e...` | L13 |

**Severity**: **Critical**

---

### ID: 2 | CRITICAL — Firebase Service Account Private Key in .env.local

**Description**: The `.env.local` file contains the full Firebase Service Account JSON including the private key, Gmail OAuth credentials (client secret + refresh token), OpenAI API key, Fapshi payment gateway credentials, Gemini API key, and Sportmonks token — all in plaintext.

**Root Cause**: `.env.local` is git-ignored, but the file exists on disk with production credentials. While it hasn't been committed, this is a single point of catastrophic failure if the file is leaked via backup tools, shared development machines, or IDE extensions.

**Severity**: **Critical**

---

### ID: 3 | CRITICAL — Telegram Bot Token Stored in Publicly-Readable Firestore Document

**Description**: `telegramService.js` reads the Telegram bot token from `settings/app` in Firestore. The Firestore rules (line 68-70) allow `read: if true` on the `settings` collection, meaning **any unauthenticated user** can read the bot token by querying `firestore.collection('settings').doc('app')`.

**Root Cause**: `settings/{docId}` allows public reads (`allow read: if true`), which was intended for app configuration (theme, language), but the same document also stores `telegramBotToken` and `telegramChannelId`.

**Severity**: **Critical**

---

### ID: 4 | HIGH — env Process Forwarding to Python Subprocess

**Description**: In `backend/quantService.js` line 72-74, `buildPythonEnv()` spreads the **entire** `process.env` into the child process environment: `env: { ...process.env, ...custom }`. This forwards every secret (Firebase service account, OpenAI key, Gmail credentials, etc.) to every Python subprocess invocation.

**Root Cause**: The env forwarding was designed to conveniently pass API tokens to Python, but it has no scoping or filtering — every environment variable, including sensitive ones the Python process doesn't need, is exposed.

**Severity**: **High**

---

### ID: 5 | HIGH — XSS via Sanitization Bypass in SSR Blog Injection

**Description**: In `server.js` lines 689-694, blog content sanitization strips `<script>`, `<iframe>`, `<object>`, `<embed>`, and `on*=""` event handlers. However, the allowlist approach is incomplete:
- It does NOT strip `<svg onload=alert(1)>`, `<details ontoggle=...>`, `<img src=x onerror=...>`, or `<a href="javascript:...">` tags.
- The regex `on\w+="[^"]*"` does not catch single-quoted handlers (`onload='alert(1)'`) or handlers without quotes (`onload=alert(1)`).

**Root Cause**: Manual regex-based sanitization is fragile. The allowlist only strips known-dangerous tags but leaves `<svg>`, `<img>`, `<a>`, `<details>`, `<style>`, etc. The `on\w+` regex only matches double-quoted attributes.

**Severity**: **High**

---

### ID: 6 | HIGH — Admin Auth Middleware Failure-Open in Development

**Description**: `server.js` lines 287-301 define `adminAuth` middleware. If `ADMIN_API_SECRET` is not set and `NODE_ENV !== 'development'`, it returns 401. However, in development mode, the middleware calls `next()` unconditionally — any request without a token is treated as admin.

**Root Cause**: The fail-open behavior for missing `ADMIN_API_SECRET` is intentional for developer convenience, but if `NODE_ENV` is misconfigured or absent (defaults to `'development'` in many setups), production endpoints would be unprotected.

**Severity**: **High**

---

### ID: 7 | HIGH — Gmail Listener OAuth Redirect URI Hardcoded to localhost

**Description**: `backend/gmailListener.js` line 11 hardcodes the OAuth redirect URI as `http://localhost:3000/oauth2callback`. This is the OAuth callback URL used for the Gmail API token exchange, but it should be the production URL in deployment.

**Root Cause**: Copy-paste from local development; the redirect URI should be configurable via `GMAIL_REDIRECT_URI` environment variable.

**Severity**: **High**

---

### ID: 8 | HIGH — No Idempotency in Gmail/Selar VIP Provisioning

**Description**: `gmailListener.js` processes Selar receipt emails and grants VIP access. If `markAsRead` fails (lines 276-288), the same receipt email will be reprocessed on every 2-minute cron cycle, extending the user's VIP period multiple times. Similarly, if the Firestore write for VIP extension succeeds but the email is not marked as read, the next cycle will duplicate the extension.

**Root Cause**: No idempotency key or transaction check. The code does not verify whether the specific receipt/transaction has already been processed before granting VIP access.

**Severity**: **High**

---

### ID: 9 | HIGH — Race Condition in Live Score Auto-Grading

**Description**: `scheduler.js` lines 463-575 contain auto-grading logic inside the `liveScoreTask` cron handler that runs every 2 minutes. If two runs overlap (e.g., due to slow Firestore writes), they could simultaneously read the same prediction document, both determine it needs grading, and both write conflicting results.

**Root Cause**: No Firestore transaction or distributed lock around the auto-grading write operation. The cron task has no concurrency guard.

**Severity**: **High**

---

### ID: 10 | HIGH — Fragile Bet Market Detection in Auto-Grading

**Description**: `scheduler.js` lines 524-554 use `market.includes('home win')`, `market.includes('draw')`, etc. to match bet outcomes. This is fragile because:
- `"home win draw no bet"` would match both `home win` and `draw` checks.
- `"under 2.5"` would also match `"under 3.5"` if not precisely checked.
- The comment on line 525 acknowledges this issue (`// partial match bc some markets have suffix like "draw no bet"`).

**Root Cause**: String `includes()` is the wrong matching strategy for a market engine. Market matching should use exact match or a structured enum.

**Severity**: **High**

---

### ID: 11 | MEDIUM — Sportmonks Client No Rate Limiting or Caching

**Description**: `sportmonksClient.js` fetches up to 50 pages of Sportmonks API data with no rate limiting between requests and no caching layer. Each API call hits the external service directly.

**Root Cause**: The pagination loop (line 15-24) fires sequential HTTP requests with no delay, and the module has no cache mechanism for frequently accessed data like today's fixtures.

**Severity**: **Medium**

---

### ID: 12 | MEDIUM — Python Binary Resolution Blocks Event Loop

**Description**: `quantService.js` lines 46-63 use `spawnSync` to detect the Python binary, trying up to 7 candidates with a 3-second timeout each. `spawnSync` is synchronous and blocks the Node.js event loop for up to 21 seconds on startup.

**Root Cause**: `spawnSync` was chosen for simplicity in resolving the Python binary at module-load time. An async approach with `execFile` would not block the event loop.

**Severity**: **Medium**

---

### ID: 13 | MEDIUM — Scheduler Cron Tasks Not Cleaned Up on Redeploy

**Description**: `scheduler.js` lines 350-363 destroy and recreate cron tasks on each sync. If the process shuts down or redeploys, the `node-cron` tasks are not explicitly stopped, potentially causing duplicate tasks on Railway's restart policy.

**Root Cause**: No `process.on('SIGTERM', ...)` or `process.on('SIGINT', ...)` handler to gracefully stop cron tasks before shutdown.

**Severity**: **Medium**

---

### ID: 14 | MEDIUM — Hardcoded VAPID Public Key Fallback

**Description**: `server.js` line 513 contains a hardcoded VAPID public key as a fallback: `'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuB220o_Ew8S_Z2hN2-7xMhOOs'`. While VAPID public keys are not secret, if this key doesn't match the server's private key, push notifications will fail silently.

**Root Cause**: Fallback key was added to prevent frontend crashes, but it will produce non-functional notifications if used in production where the server's actual key differs.

**Severity**: **Medium**

---

### ID: 15 | MEDIUM — `getLagosDateKey()` Duplicated Across 3 Files

**Description**: The Lagos timezone date key function is duplicated in `quantService.js`, `scheduler.js`, and `data_pipeline.py`. The implementations differ slightly (some use UTC+1 offset, some use `Intl.DateTimeFormat`).

**Root Cause**: No shared timezone utility module. Each file independently implements the same logic.

**Severity**: **Medium**

---

### ID: 16 | MEDIUM — VIP Expiry `setMonth()` Bug

**Description**: `gmailListener.js` lines 222-227 compute VIP expiry dates using `date.setMonth(date.getMonth() + N)`. The `setMonth()` method has a known JavaScript bug: adding months from Jan 31 can skip to March (since Feb has ≤29 days), resulting in an extra month of VIP access.

**Root Cause**: Using `setMonth` for month arithmetic instead of a proper date library or manual day-of-month clamping.

**Severity**: **Medium**

---

### ID: 17 | MEDIUM — Blog Content Stored as Unsanitized HTML

**Description**: `blogGenerator.js` generates blog posts from templates with team/league names from Firestore and stores them as HTML. While the SSR path (`server.js`) attempts sanitization, the Firestore-stored HTML could be rendered directly in the React frontend if any component uses `dangerouslySetInnerHTML` without proper sanitization.

**Root Cause**: No server-side HTML sanitization library (e.g., DOMPurify) is used. Manual regex sanitization in `server.js` is incomplete (see Issue #5).

**Severity**: **Medium**

---

### ID: 18 | MEDIUM — Frontend Admin Check via Firestore Profile (Client-Side Trust)

**Description**: `AuthContext.tsx` derives `isAdmin` from `userProfile?.isAdmin === true`. The Firestore rules allow any authenticated user to read all profiles (`allow read: if request.auth != null` on `profiles/{userId}`). An attacker could create a Firebase Auth account, read another user's profile, and extract admin status, referral codes, and email addresses.

**Root Cause**: Admin status is stored in the same `profiles` collection that is readable by all authenticated users. The admin-only fields are not stripped from client reads.

**Severity**: **Medium**

---

### ID: 19 | MEDIUM — No Content-Security-Policy Headers

**Description**: `netlify.toml` defines build configuration and SPA redirects but does not set any security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).

**Root Cause**: Security headers were never added to the Netlify configuration.

**Severity**: **Medium**

---

### ID: 20 | MEDIUM — No Health Check in Railway Deployment Config

**Description**: `railway.toml` defines `startCommand` and `restartPolicyType` but has no `[deploy.healthcheck]` configuration. Railway will consider the deploy successful as soon as the process starts, not when it's actually ready to serve traffic.

**Root Cause**: Health check path was defined in `server.js` (`/health`) but never referenced in the Railway configuration.

**Severity**: **Medium**

---

### ID: 21 | MEDIUM — Quant Engine `form_model.py` Dead Code in `__main__`

**Description**: `probability_engine.py` lines 215-221 and `form_model.py` contain `__main__` blocks that pass string forms like `"W W W D W"` to `compute_combined`, but the function expects `TeamStats` objects. Running these modules directly would crash.

**Root Cause**: Test/debug blocks were left in production code and not updated when the function signatures changed.

**Severity**: **Medium**

---

### ID: 22 | MEDIUM — H2H Weight Permanently Zeroed Out in Probability Engine

**Description**: `probability_engine.py` sets `W_H2H = 0.00`, meaning head-to-head data, even when available, contributes zero weight to the combined probability calculation. The H2H parameter path is effectively dead code.

**Root Cause**: H2H was intentionally disabled due to sparse/ unreliable data, but the dead parameter path and data fetching remain in the pipeline, wasting API calls and computation.

**Severity**: **Medium**

---

### ID: 23 | MEDIUM — `MIN_INEFFICIENCY` Constant Divergence Between Files

**Description**: `risk_filters.py` defines `MIN_INEFFICIENCY = 0.04` while `ev_engine.py` defines `MIN_INEFFICIENCY = 0.06`. They serve different purposes (global vs per-market) but the identical naming is confusing and could lead to future developers using the wrong value.

**Root Cause**: Two modules independently defined the same constant name with different values without coordination.

**Severity**: **Medium**

---

### ID: 24 | MEDIUM — `blogGenerator.js` Uses `Promise.all` Instead of `Promise.allSettled`

**Description**: `blogGenerator.js` lines 274-296 use `Promise.all` to generate blog posts for all leagues. If any single league generation fails, all results are lost and an error is thrown.

**Root Cause**: `Promise.all` was used for simplicity; `Promise.allSettled` would allow partial success.

**Severity**: **Medium**

---

### ID: 25 | LOW — `showToast` Timer Not Cleared on Unmount

**Description**: `AppContext.tsx` line 50 sets a `setTimeout` to auto-remove toasts after 3500ms. If the `AppProvider` unmounts during this window, the `setToasts` call will fire on an unmounted component.

**Root Cause**: No `clearTimeout` in the `useEffect` cleanup for toast timers.

**Severity**: **Low**

---

### ID: 26 | LOW — `setLanguage` and `toggleTheme` Not Wrapped in `useCallback`

**Description**: `AppContext.tsx` lines 86-97 define `setLanguage` and `toggleTheme` as regular functions inside the provider. They create new function references on every render, causing unnecessary re-renders in consumers that use these functions as dependencies.

**Root Cause**: Functions were not memoized with `useCallback`.

**Severity**: **Low**

---

### ID: 27 | LOW — `process.env` Polyfill in Vite Config

**Description**: `vite.config.ts` line 17 defines `'process.env': {}` as a polyfill for libraries that expect `process.env`. This creates an empty object, meaning any code that checks `process.env.NODE_ENV` for feature toggling will get `undefined` instead of the expected value.

**Root Cause**: The polyfill was added to prevent runtime errors from libraries referencing `process.env`, but it does not forward actual environment variables.

**Severity**: **Low**

---

### ID: 28 | LOW — GitHub Actions Deploy Workflow Lacks Environment Variables

**Description**: `.github/workflows/deploy.yml` runs `npm run build` without any `VITE_*` environment variables. Since Vite embeds these at build time, the deployed site will have `undefined` for all Firebase config, API keys, and feature flags unless they are set as GitHub Secrets and mapped in the workflow.

**Root Cause**: Environment variables were never added to the deployment workflow.

**Severity**: **Low**

---

### ID: 29 | LOW — Supabase Client Configured but Appears Unused

**Description**: `supabaseClient.ts` creates a fully configured Supabase client with retry logic, but no other source files import or use it. The `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are defined in `.env.example` but appear to be legacy infrastructure.

**Root Cause**: Migration to Firebase left the Supabase client as dead code.

**Severity**: **Low**

---

### ID: 30 | LOW — PWA Service Worker Uses `skipWaiting()` Immediately

**Description**: `public/sw.js` calls `skipWaiting()` on install, meaning new versions activate immediately without waiting for existing tabs to close. This can cause version mismatches between the service worker and the running application.

**Root Cause**: Aggressive cache bypass strategy chosen for simplicity over reliability.

**Severity**: **Low**

---

## 3. IMPROVEMENT STRATEGY

### Critical Fixes (Immediate — Within 24 Hours)

1. **Rotate all leaked credentials** (Issue #1, #2): Revoke and regenerate all API tokens found in `fetch_leagues.mjs`, `test-pagination.mjs`, `test-livescore.js`, and `.env.local`. Use secret management (Railway env vars, not files) for all deployment credentials.

2. **Isolate Telegram bot token** (Issue #3): Split `settings/app` into two documents: `settings/public` (allow `read: if true`) for non-sensitive config, and `settings/internal` (allow `read: if isAdmin()`) for bot tokens and credentials. Update `telegramService.js` to read from `settings/internal`.

3. **Fix XSS sanitization** (Issue #5): Replace manual regex sanitization in `server.js` with a proper library:
   ```
   npm install sanitize-html
   ```
   Configure `sanitize-html` with an explicit allowlist: `p, h2, h3, ul, ol, li, strong, em, b, i, br, span, a`.

### High Priority Fixes (Within 1 Week)

4. **Scope Python env forwarding** (Issue #4): In `quantService.js`, replace `{ ...process.env, ...custom }` with an explicit whitelist of needed variables:
   ```javascript
   const BUILD_PYTHON_ENV = () => ({
     SPORTMONKS_API_TOKEN: process.env.SPORTMONKS_API_TOKEN,
     API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
     VITE_API_BASKETBALL_KEY: process.env.VITE_API_BASKETBALL_KEY,
     GOOGLE_GENAI_API_KEY: process.env.GOOGLE_GENAI_API_KEY,
     OPENAI_API_KEY: process.env.OPENAI_API_KEY,
     FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT,
     PYTHONPATH: process.env.PYTHONPATH || '',
   });
   ```

5. **Harden admin auth middleware** (Issue #6): Remove the development-mode fail-open. Instead, always require `x-admin-token` and log a warning on startup if `ADMIN_API_SECRET` is not set.

6. **Fix Gmail redirect URI** (Issue #7): Make the redirect URI configurable:
   ```javascript
   const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth2callback';
   ```

7. **Add idempotency to Gmail/Selar processing** (Issue #8): Before granting VIP, check if a document with the transaction ID already exists in a `processed_transactions` Firestore collection. Use a Firestore transaction to ensure atomicity.

8. **Add concurrency guard to auto-grading** (Issue #9): Use a Firestore document-level lock (e.g., `generation_locks/{date}`) or a simple in-memory flag to prevent overlapping cron runs.

9. **Fix market detection logic** (Issue #10): Replace `market.includes('home win')` with exact enum-based matching. Define a `MarketType` enum and use it for both prediction generation and grading.

### Medium Priority Fixes (Within 2 Weeks)

10. **Add rate limiting and caching to Sportmonks client** (Issue #11): Implement `1 request per second` throttling and an in-memory LRU cache with 5-minute TTL for fixture data.

11. **Async Python binary detection** (Issue #12): Replace `spawnSync` with `execFile` (async) at startup, caching the result.

12. **Graceful shutdown for scheduler** (Issue #13): Add `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)` handlers to stop all cron tasks before exit.

13. **Remove hardcoded VAPID key fallback** (Issue #14): Remove the hardcoded key. Render `VAPID_PUBLIC_KEY` from the backend API or fail explicitly if not configured.

14. **Extract `getLagosDateKey()` into shared module** (Issue #15): Create `backend/shared/timezone.js` and `backend/quant/shared_tz.py`, import from both.

15. **Fix VIP `setMonth()` bug** (Issue #16): Use `date.setUTCDate(1)` before `setMonth()`, then restore the original day, or use a date library.

16. **Add DOMPurify for blog content** (Issue #17): Install `dompurify` on the server and use it before storing blog content in Firestore.

17. **Restrict profile field visibility** (Issue #18): Create a Firestore Cloud Function that strips admin-only fields (`isAdmin`, `isVip`, `vipExpiry`, `referralCode`) from profile reads by non-admin users, or use separate subcollections.

18. **Add security headers to Netlify config** (Issue #19): Add CSP, HSTS, X-Frame-Options, and X-Content-Type-Options headers to `netlify.toml`.

19. **Add health check to Railway config** (Issue #20): Add `[deploy.healthcheck]` pointing to `/health`.

20. **Clean up dead code** (Issue #21-22): Remove `__main__` blocks in quant modules and remove H2H dead parameter paths.

21. **Rename conflicting constants** (Issue #23): Rename `risk_filters.MIN_INEFFICIENCY` to `MIN_INEFFICIENCY_GLOBAL` and `ev_engine.MIN_INEFFICIENCY` to `MIN_INEFFICIENCY_PER_MARKET`.

22. **Use `Promise.allSettled` in blog generation** (Issue #24): Replace `Promise.all` with `Promise.allSettled` and aggregate partial successes.

### Low Priority Fixes (Within 1 Month)

23. **Wrap toast timers in refs** (Issue #25): Use `useRef` to store timer IDs and clear them on unmount.

24. **Memoize context callbacks** (Issue #26): Wrap `setLanguage` and `toggleTheme` in `useCallback`.

25. **Fix Vite `process.env` polyfill** (Issue #27): Replace `'process.env': {}` with `'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')`.

26. **Add VITE_ env vars to GitHub Actions workflow** (Issue #28): Add `env` section to the build step with all required `VITE_*` variables from GitHub Secrets.

27. **Remove unused Supabase client** (Issue #29): Delete `supabaseClient.ts` and remove `@supabase/supabase-js` from `package.json`.

28. **Fix PWA skipWaiting strategy** (Issue #30): Use `registration.waiting.postMessage({ type: 'SKIP_WAITING' })` from the main thread instead of unconditional `skipWaiting()` on install.

---

## 4. IMPLEMENTATION PLAN

### Phase 1: Critical Security Hardening (Day 1)

| Step | Action | File(s) | Verification |
|------|--------|---------|--------------|
| 1.1 | Rotate all API keys found in tracked files: Sportmonks (×2), RapidAPI | `fetch_leagues.mjs`, `test-pagination.mjs`, `test-livescore.js` | Confirm old keys are revoked in each API dashboard |
| 1.2 | Remove hardcoded tokens from the 3 files and replace with `process.env` | `fetch_leagues.mjs:1`, `test-pagination.mjs:1`, `test-livescore.js:13` | `rg 'm55Ud6u\|9a760334\|jFxFL5O'` returns no results |
| 1.3 | Rotate Firebase Service Account private key | Firebase Console → Service Accounts → Generate New Key | Old key should be invalid |
| 1.4 | Rotate OpenAI, Gemini, Fapshi, and Gmail credentials | Respective API dashboards | Confirm old credentials fail |
| 1.5 | Split `settings/app` Firestore document into `settings/public` + `settings/internal` | `firestore.rules`, `telegramService.js`, `server.js` (SSR config read) | Unauthenticated read of `settings/internal` should fail; `settings/public` should succeed |
| 1.6 | Update Firestore rules to restrict `settings` reads on sensitive docs | `firestore.rules:68-70` | `firebase emulators:exec -- rules.spec.ts` passes |

### Phase 2: XSS and Auth Hardening (Day 2-3)

| Step | Action | File(s) | Verification |
|------|--------|---------|--------------|
| 2.1 | Install `sanitize-html` package | `package.json` | `npm ls sanitize-html` shows version |
| 2.2 | Replace manual regex sanitization with `sanitize-html` | `server.js:689-694` | XSS string `<svg onload=alert(1)>` is stripped |
| 2.3 | Remove fail-open behavior from admin auth middleware | `server.js:290-296` | Request without `x-admin-token` returns 401 in all environments |
| 2.4 | Make Gmail redirect URI configurable | `gmailListener.js:11` | `GMAIL_REDIRECT_URI` env var controls the URI |
| 2.5 | Add idempotency check to Gmail listener | `gmailListener.js:128-220` | Duplicate receipt email does not extend VIP twice |
| 2.6 | Add concurrency guard to auto-grading cron | `scheduler.js:463-575` | Overlapping cron runs do not produce duplicate grade writes |

### Phase 3: Env Scoping and Code Quality (Day 4-7)

| Step | Action | File(s) | Verification |
|------|--------|---------|--------------|
| 3.1 | Whitelist Python env forwarding | `quantService.js:72-74` | `process.env.GMAIL_CLIENT_SECRET` not present in child process |
| 3.2 | Replace `market.includes()` with enum-based matching | `scheduler.js:524-554` | All existing market strings match correctly; `"home win draw no bet"` matches `DRAW_NO_BET`, not `HOME_WIN` |
| 3.3 | Replace `Promise.all` with `Promise.allSettled` in blog generation | `blogGenerator.js:274-296` | One league failure does not prevent other leagues from generating |
| 3.4 | Extract `getLagosDateKey()` into shared modules | New: `backend/shared/timezone.js`, `backend/quant/shared_tz.py` | All 3 call sites import from shared module |
| 3.5 | Fix `setMonth()` VIP expiry bug | `gmailListener.js:222-227` | Jan 31 + 1 month = Feb 28 (not Mar 3) |
| 3.6 | Add graceful shutdown handler | `server.js` (new process handlers) | `kill -SIGTERM <pid>` logs "shutting down" and stops cron |
| 3.7 | Remove hardcoded VAPID key fallback | `server.js:513` | Missing `VAPID_PUBLIC_KEY` env var causes explicit error, not silent fallback |
| 3.8 | Add security headers to `netlify.toml` | `netlify.toml` | `curl -I https://vantageai.online` shows CSP, HSTS, X-Frame-Options headers |
| 3.9 | Add health check to `railway.toml` | `railway.toml` | Railway shows health check passing in deploy logs |
| 3.10 | Rename conflicting `MIN_INEFFICIENCY` constants | `risk_filters.py`, `ev_engine.py` | `grep MIN_INEFFICIENCY` shows distinct names |

### Phase 4: Dead Code and Low-Priority Fixes (Week 2-4)

| Step | Action | File(s) | Verification |
|------|--------|---------|--------------|
| 4.1 | Remove Supabase client and dependency | `supabaseClient.ts`, `package.json` | `npm ls @supabase/supabase-js` returns not found |
| 4.2 | Remove dead `__main__` blocks from quant modules | `probability_engine.py`, `form_model.py` | `python probability_engine.py` no longer crashes |
| 4.3 | Remove H2H dead code path or re-enable with data | `probability_engine.py:99,107` | Either H2H contributes >0 weight or code is removed |
| 4.4 | Memoize `setLanguage` and `toggleTheme` with `useCallback` | `context/AppContext.tsx:86-97` | React DevTools Profiler shows no unnecessary re-renders |
| 4.5 | Wrap toast timers in `useRef` and clear on unmount | `context/AppContext.tsx:50` | No React warnings about state updates on unmounted components |
| 4.6 | Fix Vite `process.env` polyfill | `vite.config.ts:17` | `process.env.NODE_ENV` resolves to `'production'` in build |
| 4.7 | Add VITE_ env vars to GitHub Actions workflow | `.github/workflows/deploy.yml` | Build succeeds with all `VITE_*` variables from GitHub Secrets |
| 4.8 | Improve PWA `skipWaiting` strategy | `public/sw.js` | New SW waits for user signal before activating |

---

## 5. ASSUMPTIONS STATED EXPLICITLY

1. **Firebase Firestore rules are the sole backend security boundary.** Cloud Functions are not used for data validation — the Admin SDK bypasses all rules. Any data written by the backend is trusted.

2. **The `.env.local` file on disk has not been committed to git** (confirmed by `.gitignore` and `git log`). The risk is on-disk exposure, not repository exposure.

3. **The Telegram bot token in `settings/app` was verified as publicly readable** by examining `firestore.rules` line 68 (`allow read: if true` on `settings/{docId}`).

4. **The Python quant pipeline is invoked as a subprocess** by Node.js. It does not run as a long-lived process.

5. **All Sportmonks API calls use query-string authentication** (`?api_token=...`) because that is Sportmonks' API design, not a developer choice.

6. **The `VITE_ADMIN_API_SECRET` is exposed in the client bundle** because it's a `VITE_` prefixed variable. This is intentional (it's checked against `x-admin-token` header), so it's a shared secret, not a server-only secret.

7. **The Supabase client appears to be legacy/unused code** based on lack of imports elsewhere. If it is used somewhere not found in the audit, removing it would break that functionality.

---

*End of Audit Report*