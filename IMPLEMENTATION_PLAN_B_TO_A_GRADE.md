# Vantage AI — Implementation Plan: B → A Grade

## Phase 0: Security Hotfixes (P0 — Do Immediately)

### 0.1 Fix Malformed OpenAI API Key
**File:** `.env.local:25`
**Issue:** Leading space in `OPENAI_API_KEY` causes 401 on all OpenAI calls.
**Action:** Remove the leading space.
```
- OPENAI_API_KEY= sk-proj-7p2DmJ29k...
+ OPENAI_API_KEY=sk-proj-7p2DmJ29k...
```
**Also fix `FOOTBALL_DATA_KEY`** (line 27) which has the same leading-space issue.

### 0.2 Fix `stopScheduler()` — Missing `arbScanner` Task
**File:** `backend/scheduler.js:276-284`
**Issue:** `stopScheduler()` uses a hardcoded array that omits `arbScanner`, so the every-15-min arb scanner never stops on shutdown, potentially leaving orphaned Python processes.
**Action:** Replace the hardcoded array with `tasks.entries()` iteration.
```js
// BEFORE (line 276-286):
export const stopScheduler = () => {
    const allTasks = [
        'football', 'basketball', 'cricket', 'quant', 'quantGrading',
        'blog', 'telegram', 'tomorrow', 'accumulator', 'lineupSync', 'repair'
    ];
    for (const name of allTasks) {
        const task = tasks.get(name);
        if (task) { task.stop(); tasks.delete(name); }
    }
    console.log('[Scheduler] All cron tasks stopped.');
};

// AFTER:
export const stopScheduler = () => {
    for (const [name, task] of tasks) {
        task.stop();
        console.log(`[Scheduler] Stopped task: ${name}`);
    }
    tasks.clear();
    console.log(`[Scheduler] All ${tasks.size} cron tasks stopped.`);
};
```
**Wait** — the `tasks.clear()` would run after the loop clears everything. Fix:
```js
export const stopScheduler = () => {
    const count = tasks.size;
    for (const [name, task] of tasks) {
        task.stop();
        console.log(`[Scheduler] Stopped task: ${name}`);
    }
    tasks.clear();
    console.log(`[Scheduler] All ${count} cron tasks stopped.`);
};
```

---

## Phase 1: Dead Code Removal (P1 — High Priority)

### 1.1 Remove Deprecated Sportmonks Proxy
**File:** `server.js:202-227`
**Lines to delete:** 202–227 (the entire `SPORTMONKS_API_TOKEN` check, `sportmonksLimiter`, and `app.use('/api/sportmonks'...)` block)
**Also remove:** `SPORTMONKS_API_TOKEN` and `SPORTMONKS_CRICKET_API_TOKEN` from the env forward in `backend/quantService.js:85-86` (or leave them as no-ops since the quant pipeline may still use them).

### 1.2 Remove Disabled AI Endpoints
**File:** `server.js`

| Lines | Endpoint | Action |
|---|---|---|
| 371–379 | `POST /api/admin/generate-football` | Delete |
| 406–413 | `POST /api/admin/grade-yesterday` | Delete |
| 560–566 | `POST /api/admin/seed-static` | Delete |
| 675–683 | Legacy `POST /api/fapshi/initiate` + `GET /api/fapshi/status/:transId` | Delete |

### 1.3 Remove Deprecated `verifySelarTransaction`
**File:** `services/selar.ts:97-100`
Delete the stub function.

### 1.4 Remove Live Momentum / Player Stats Exports (or keep as disabled)
**Files:** `backend/quantService.js:562-605`
These functions (`runLiveMomentumEngine`, `runPlayerStatsClient`) are exported but never called (the cron was disabled per comment in `scheduler.js:210-212`). Either delete them or keep with a clear deprecation comment. **Recommendation:** delete them since they're unused and the comment in scheduler.js says they consumed ~15,000 API credits/day.

---

## Phase 2: Structural Refactors (P1)

### 2.1 Split `server.js` into Route Modules
**File:** `server.js` (1142 lines → split into 4 files)

Create the following structure:
```
backend/
  routes/
    admin.js        ← POST /api/admin/* endpoints (lines 258–566)
    payments.js     ← /api/payments/* (lines 675–893)
    push.js         ← /api/push/* (lines 895–938)
    ai-proxy.js     ← /api/gemini/* + /api/openai/* (lines 202–611)
  middleware/
    ssr.js          ← SSR handler + sitemap (lines 940–1121)
```

Each module exports a function `(app) => { ... }` or an Express `Router`. Update `server.js` to import and mount them:
```js
import { mountAdminRoutes } from './backend/routes/admin.js';
import { mountPaymentRoutes } from './backend/routes/payments.js';
import { mountPushRoutes } from './backend/routes/push.js';
import { mountSSR } from './backend/middleware/ssr.js';

mountAdminRoutes(app);
mountPaymentRoutes(app);
mountPushRoutes(app);
mountSSR(app, distPath);
```

### 2.2 Fix Accumulator Trigger — Use Dedicated Pipeline
**File:** `backend/scheduler.js:85-95`
**Issue:** `triggerAccumulatorGeneration()` calls `runQuantPipeline()` — it regenerates all predictions when it should only generate accumulators.
**Action:** Either:
- **(A)** Have the quant pipeline always generate accumulators as part of its output (no separate trigger needed), then change this cron to a no-op or remove it
- **(B)** Create a dedicated `runAccumulatorPipeline` in `quantService.js` that reads existing predictions from Firestore and generates accumulator tickets

**Recommendation (A):** The quant pipeline already writes accumulators to Firestore. Check if `daily_predictions` documents already contain `accumulators` fields. If so, remove the separate accumulator cron job entirely.

### 2.3 Clean Up `payouts` vs `payout_requests` Collection Duplication
**Files:** `firestore.rules:104-130` (rules for both), `context/AuthContext.tsx:316` (writes to `payout_requests`)
**Issue:** Two collections serve the same purpose. `payouts` appears in rules but code only writes to `payout_requests`.
**Action:**
1. Verify no data exists in `payouts` collection in Firestore
2. Remove the `payouts` rule block (lines 104-116) from `firestore.rules`
3. Keep only `payout_requests` (lines 118-130)

---

## Phase 3: Reliability Hardening (P1)

### 3.1 Add Distributed Cron Lock via Firestore
**File:** `backend/scheduler.js`
**Issue:** If backend scales to 2+ instances, cron jobs fire simultaneously with no coordination.
**Action:** Before each scheduled task runs, attempt to acquire a lock in Firestore:

```js
// NEW: Add to scheduler.js
async function acquireLock(taskName, ttlMinutes = 30) {
    const db = admin.firestore();
    const lockRef = db.collection('generation_locks').doc(taskName);
    try {
        await db.runTransaction(async (tx) => {
            const doc = await tx.get(lockRef);
            const now = admin.firestore.Timestamp.now();
            if (doc.exists) {
                const expiresAt = doc.data().expiresAt?.toDate();
                if (expiresAt && expiresAt > new Date()) return false; // Lock held
            }
            tx.set(lockRef, {
                acquiredAt: now,
                expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
            }, { merge: true });
            return true;
        });
    } catch (_) {
        return false;
    }
}

async function releaseLock(taskName) {
    await admin.firestore().collection('generation_locks').doc(taskName)
        .update({ expiresAt: admin.firestore.FieldValue.delete() })
        .catch(() => {}); // best-effort
}
```

Then wrap each cron callback (e.g., the football cron at line 152):
```js
const footballTask = cron.schedule('0 7 * * *', async () => {
    const locked = await acquireLock('football_generation', 60);
    if (!locked) { console.log('[Scheduler] Football: lock held by another instance, skipping.'); return; }
    try {
        await triggerFootballGeneration();
    } finally {
        await releaseLock('football_generation');
    }
}, { timezone: 'Africa/Lagos' });
```
Apply this pattern to all cron jobs.

### 3.2 Consistent Structured Logging
Remove all `console.log/warn/error` from backend files and replace with Pino logger instances.
**Files to fix:**
- `server.js` — replace ~15 `console.*` calls with `logger.*`
- `backend/scheduler.js` — replace all `console.*` calls with a module-level Pino logger
- `backend/quantService.js` — already mostly uses Pino, but check for remaining `console.error` (line 327)

### 3.3 Fix `postinstall` Script
**File:** `package.json:18`
```json
// BEFORE:
"postinstall": "pip install --break-system-packages -r backend/quant/requirements.txt || pip3 install --break-system-packages -r backend/quant/requirements.txt || true"

// AFTER:
"postinstall": "node scripts/install-quant-deps.js || true"
```
Create `scripts/install-quant-deps.js` that:
1. Checks if Python is available
2. Checks if quant deps are already installed (`pip list | grep ...`)
3. Only runs `pip install` if needed, without `--break-system-packages` by preferring `--user` flag
4. Logs clear errors without crashing `npm install`

---

## Phase 4: TypeScript & Code Quality (P2)

### 4.1 Remove `@ts-ignore` Directives
**File:** `App.tsx` — 6 instances at lines 235, 243, 265, 303, 336, 376
**Issue:** Framer Motion's `motion.div` + React 19 types have compatibility issues.
**Action:** Create a typed wrapper component to avoid per-instance suppressions:

```tsx
// NEW FILE: components/MotionDiv.tsx
import { motion, HTMLMotionProps } from 'framer-motion';
import { ReactNode } from 'react';

type MotionDivProps = HTMLMotionProps<'div'> & { children?: ReactNode; key?: string };

export const MotionDiv = motion.div as React.FC<MotionDivProps>;
```

Then replace all `<motion.div ...>` instances in `App.tsx` with `<MotionDiv ...>`.

### 4.2 Fix `ErrorBoundary` Type Cast
**File:** `components/ErrorBoundary.tsx:69`
```tsx
// BEFORE:
return (this as any).props.children;

// AFTER:
return this.props.children;
```
No cast needed — `this.props.children` is properly typed from `ErrorBoundaryProps`.

### 4.3 Fix `eslint-disable` in App.tsx
**File:** `App.tsx:204`
```tsx
// BEFORE:
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [authLoading, user]);

// AFTER: Include verifyTransaction in deps, wrap it with useCallback in AuthContext
// OR: Use a ref pattern for the payment check flag
}, [authLoading, user, verifyTransaction]);
```

### 4.4 Fix Duplicate Blog Routes
**File:** `App.tsx:220-222` and `App.tsx:284-285`
Blog routes (`/blog`, `/blog/:date`) are defined in both the unauthenticated `<Routes>` block and the authenticated `<Routes>` block.
**Action:** Consolidate — move them to the top-level `<Routes>` before the conditional auth blocks, or use a single definition with `matchPath`.

---

## Phase 5: Testing Infrastructure (P2)

### 5.1 Install and Configure Vitest
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
  },
});
```

### 5.2 Critical Tests to Write (TDD Order)
1. **Payment plan validation** — `backend/paymentPlans.test.js`
   - `assertValidPlan('weekly')` returns `{ days: 7, amount: 2000 }`
   - `assertValidPlan('invalid')` throws
   - `inferPlanFromAmount(5000)` returns `'monthly'`
   - `inferPlanFromAmount(0)` returns `null`

2. **Prediction normalization** — `services/db.test.ts`
   - `normalizeQuantPrediction` handles snake_case input
   - `normalizeQuantPrediction` handles camelCase input (idempotent)
   - Missing `id` is generated from team names
   - `confidence` falls back from `probability * 100`

3. **Auth context** — `context/AuthContext.test.tsx`
   - `generateReferralCode('John Doe')` returns 8-char code starting with `JOH`
   - `generateReferralCode(null)` uses `VAN` prefix
   - `processReferral` writes `referredBy` and increments `referralCount`

4. **Scheduler task management** — `backend/scheduler.test.js`
   - `initScheduler()` registers all expected task keys
   - `stopScheduler()` stops all tasks and clears the map
   - Arbitrage scanner is included in both init and stop

5. **Firestore rules** — Deploy to Firebase emulator and test with the rules playground
   - Non-admin cannot write to `quant_predictions`
   - Non-VIP cannot read from `quant_vip`
   - User can only read their own `profiles` doc
   - Protected fields (`isVip`, `isAdmin`) cannot be set by users

### 5.3 CI Pipeline
Create `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: npm test
```

---

## Phase 6: Polish (P3)

### 6.1 Remove Hardcoded Mock Data or Add Watermark
**File:** `constants.ts:4-101`
The `FEATURED_MATCH`, `FREE_MATCHES`, `VIP_MATCHES_LOCKED`, `USER_STATS`, and `HISTORY` arrays are hardcoded demo data that could be confused with real predictions if the quant pipeline fails.
**Action:** Either:
- Add an `isMock: true` field to each and check it in the UI to render a "Demo" badge
- Or replace them with empty arrays and let the UI show "No predictions yet" when real data is unavailable

### 6.2 Backend TypeScript Migration (Optional, Long-Term)
Move `server.js` → `server.ts` and `backend/*.js` → `backend/*.ts`. Adjust `tsconfig.json` to include the backend. Benefits: catch type errors in payment plans, auth middleware, etc.

### 6.3 API Documentation
Add inline JSDoc to all public `server.js` endpoint handlers with `@route`, `@auth`, `@param`, and `@returns` tags. Generate static docs with a tool like `swagger-jsdoc` or keep as inline reference.

---

## Task Summary & Effort Estimate

| Phase | Tasks | Est. Hours | Impact |
|---|---|---|---|
| **P0** | Fix OpenAI key, fix stopScheduler | 0.5h | Critical |
| **P1** | Dead code removal (5 endpoints + selar stub) | 1h | High |
| **P1** | Split server.js → routes | 3h | High |
| **P1** | Accumulator trigger fix | 0.5h | High |
| **P1** | payouts/payout_requests cleanup | 0.5h | High |
| **P1** | Distributed cron lock | 2h | High |
| **P1** | Consistent logging | 2h | Medium |
| **P1** | postinstall fix | 1h | Medium |
| **P2** | @ts-ignore removal | 1h | Medium |
| **P2** | ErrorBoundary fix | 0.1h | Low |
| **P2** | eslint-deps fix | 0.3h | Low |
| **P2** | Duplicate blog routes | 0.5h | Low |
| **P2** | Vitest + tests | 4h | Medium |
| **P2** | CI pipeline | 1h | Medium |
| **P3** | Mock data cleanup | 0.5h | Low |
| **P3** | Backend TypeScript (optional) | 8h | Low |
| **P3** | API docs (optional) | 2h | Low |

| **Total (P0-P2)** | 14 tasks | **~17h** | — |
|---|---|---|---|
| **Total with P3** | 17 tasks | **~28h** | — |

---

## Execution Order
1. **Phase 0** → deploy immediately (1 hour)
2. **Phase 1** → remove dead code, merge to main (2 hours)
3. **Phase 3** → distributed lock + logging (5 hours)
4. **Phase 2** → refactor server.js, fix accumulator (4 hours)
5. **Phase 4** → TypeScript cleanups (2 hours)
6. **Phase 5** → tests + CI (5 hours)
7. **Phase 6** → polish (optional, 11 hours)

After Phase 5 is complete, the app should reach **A grade (90+)**.
