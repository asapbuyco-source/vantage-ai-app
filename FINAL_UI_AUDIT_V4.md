# Vantage AI — Final UI Audit V4 + Implementation Plan
> **Date**: April 26, 2026 | **Target**: Minimax 2.5

---

## ✅ PREVIOUS FIXES — ALL CONFIRMED

| Fix | File | Status |
|-----|------|--------|
| Strict `fixture_id` matching (score writer) | scheduler.js:458-460 | ✅ Only `String(m.id) === String(pred.fixture_id)` |
| Active state filter on score writes | scheduler.js:464-466 | ✅ `['1H','2H','HT','ET','PEN','FT','AET','LIVE','BREAK']` |
| `live_state` + `live_minute` fields written | scheduler.js:471-472 | ✅ Both fields saved to prediction |
| Strict `fixture_id` matching (auto-grading) | scheduler.js:492-493 | ✅ Same strict match |
| `live_state = 'FT'` on graded predictions | scheduler.js:539 | ✅ Set on auto-grade |
| Home.tsx score badge guard | Home.tsx:602 | ✅ `match.score && (match.status !== 'pending' \|\| match.live_state)` |
| LIVE badge shows minute | Home.tsx:613-616 | ✅ Shows `LIVE 45'` or `FT` |

All 6 premature grading fixes are correctly implemented. No regressions found.

---

## BUG-01: Live Scores — Events Show Raw Type Instead of Description

### What Happens
When a user expands a live match card and views events, they see entries like:
```
45'  ⚽  goal
67'  🟨  yellowcard
72'  🔄  substitution
```

The word "goal" / "yellowcard" / "substitution" is the raw machine `ev.type` string, not what actually happened.

### Root Cause
**File**: `LiveScores.tsx`, line 142

```tsx
<span className="text-gray-300 font-medium truncate">
  {ev.playerName || ev.name || ev.type}
</span>
```

The fallback chain is: `playerName → name → type`. The problem is:
1. `ev.playerName` — this is populated correctly for goals (e.g., "M. Salah")
2. `ev.name` — this is the raw Sportmonks `type.name` like "Goal" or "Yellowcard" (machine format)
3. `ev.type` — this is the normalized machine key like "goal", "yellowcard"

When `playerName` is empty (common for cards/substitutions where player data is in a nested field), it falls through to `ev.name` which shows "Yellowcard" — acceptable but not rich. When `ev.name` is also empty, it shows the machine type "yellowcard".

**Real problem**: Substitutions don't show who came on/off, and the display lacks context (which team scored, what the score was after the goal).

### Fix Required
Show richer event descriptions:
- **Goal**: `⚽ 45' M. Salah (1-0)` — player name + result after goal
- **Yellow Card**: `🟨 67' V. van Dijk` — player name
- **Substitution**: `🔄 72' Henderson ↔ Jones` — player in/out
- **Red Card**: `🟥 80' B. Silva` — player name

---

## BUG-02: Accumulator Section — French/English Language Not Applied

### What Happens
The accumulator section in both the VIP page and the AccumulatorModal always shows English labels like "The Baseline", "Highest probability treble", "The Alpha Edge" regardless of language setting.

### Root Cause
**File**: `AccumulatorModal.tsx`, lines 14-19

```tsx
const TIER_META = {
  baseline: { label: 'The Baseline', desc: 'Highest probability treble' },
  alpha_edge: { label: 'The Alpha Edge', desc: 'Highest expected value' },
  // ... all hardcoded English
};
```

**File**: `VIP.tsx`, lines 508-512 — same hardcoded English.

The `language` variable IS available in both components (line 24 in AccumulatorModal, line 43 in VIP), but it's never used for tier labels.

### Fix Required
Add FR translations for all tier meta:

| Key | English | French |
|-----|---------|--------|
| baseline.label | The Baseline | La Base |
| baseline.desc | Highest probability treble | Triplé haute probabilité |
| alpha_edge.label | The Alpha Edge | L'Avantage Alpha |
| alpha_edge.desc | Highest expected value | Meilleure valeur attendue |
| syndicate.label | The Syndicate | Le Syndicat |
| syndicate.desc | 4-leg balanced combo | Combiné 4 jambes équilibré |
| variance_play.label | Variance Play | Jeu de Variance |
| variance_play.desc | High-yield moonshot | Pari audacieux haut rendement |

---

## BUG-03: Results Page — Doesn't Show WON/LOST for Graded Matches Today

### What Happens
The Results page shows today's entry with a LIVE badge, but individual matches still show "PENDING" even after the scheduler has graded them as WON/LOST via the auto-grading system.

### Root Cause Analysis
The Results page HAS a real-time Firestore listener (line 51-73) that subscribes to `quant_predictions/{todayKey}`. When the scheduler auto-grades a match, the Firestore document IS updated, and the listener DOES fire.

**However**, there are two issues:

**Issue A**: The `getResultsHistory()` function (db.ts:533) loads results via `getPredictionsForDate()` which does a one-time read on mount. The live listener on line 51 updates the `history` state, but only for today's entry. If today's data was already loaded by `getResultsHistory()`, the merge logic on line 58-69 creates a duplicate or stale entry.

**Issue B**: The day header shows `dayRate` based on `wonCount + lostCount` from `effectiveMatches`. This works correctly. But the individual match items (line 367-403) show the status from the `effectiveMatches` array which IS correctly updated. 

**The actual bug**: Look at the individual match row (lines 390-399):
```tsx
<span className={`text-xs font-bold font-orbitron ${statusColor[status]}`}>
    {statusLabel[status]}  // Shows "WON" / "LOST" / "PENDING"
</span>
{match.score ? (
    <span className="text-[10px] text-gray-500">{match.score}</span>
) : match.odds ? (
    <span className="text-[10px] text-gray-500">@ {match.odds}</span>
) : null}
```

This DOES correctly show WON/LOST once the status is updated. **But** the `score` field might not be populated yet when the grading runs via the cron job (separate from live auto-grading). The cron grading engine (`grading_engine.py`) writes `score: "2-1"` but the live auto-grader writes `score` as well.

**The real gap**: When the day header % calculates, it only counts `won + lost` in `gradedCount`. Pending matches aren't counted. This is correct behavior. But the UI doesn't visually distinguish "pending because not started" from "pending because live but not FT yet". 

### Fix Required
- Show `live_state` for each match in the Results page (e.g., "LIVE 67'" or "FT" alongside the status)
- Show the live score alongside even if status is still pending (the scheduler writes `pred.score` for live matches)
- Add a "graded" count vs "total" display in the day header to make it clear how many are still pending

---

## BUG-04: Users Stay Logged In Forever — No Session Expiry

### What Happens
Users who logged in days ago still have active sessions without re-authenticating.

### Root Cause
**File**: `firebaseConfig.ts`

```tsx
export const auth = getAuth(app);
```

Firebase Auth by default uses **`browserLocalPersistence`** (IndexedDB), which persists the session **indefinitely** across browser restarts. There is no call to `setPersistence()` to change this.

Firebase Auth sessions use long-lived refresh tokens that automatically renew the ID token. The user will stay logged in for **weeks** unless they explicitly log out or clear their browser data.

### Fix Required
Two options:

**Option A (Recommended)**: Add a "last active" timestamp check in `AuthContext`. On each `onAuthStateChanged` fire, check if the user's `lastLogin` is more than 12 hours ago. If so, force sign-out.

**Option B**: Change Firebase persistence to `browserSessionPersistence` which clears on browser close. But this is too aggressive — users lose their session when they close the tab.

---

## BUG-05: Live Score Events — Missing Rich Event Data

### Current State (scheduler.js:388-413)
The scheduler correctly maps event types and includes:
- `playerName`: from `ev.player?.name`
- `playerNameOut`: from `ev.related_player?.name` (for substitutions)
- `result`: from `ev.result` (score at time of goal)

**The data IS there** — but `LiveScores.tsx` doesn't render it properly (see BUG-01).

---

## SMART TICKET & ACCUMULATOR LOGIC — AUDIT

### Accumulator Engine (backend) ✅ A-Grade
The `accumulator_engine.py` correctly implements:
- 4 named tiers with distinct strategies (Baseline=safety, Alpha Edge=EV, Syndicate=balanced, Variance=moonshot)
- League diversification (no two legs from the same league)
- Proper combined probability calculation (multiplicative)
- Combined EV computation
- Kelly stake for the accumulator as a whole
- OPP-04 fix: Variance Play reduced from 6→5 legs with 58% floor

### VIP Page Display (frontend) ✅ Well Implemented
- `VIP.tsx:504-570` renders all 4 tiers as cards with proper gradient styling
- Each card shows: tier icon, label, description, combined odds, leg count
- Individual legs show: teams, market, odds
- EV and Kelly badges shown at bottom
- Click opens `AccumulatorModal` for full view

### AccumulatorModal ✅ Well Implemented
- Tab navigation between 4 tiers
- Proper leg rendering with team logos
- Copy-to-clipboard for individual legs
- Footer shows total odds and leg count
- Proper bilingual support for Close/footer labels

### Minor Issues Found

| Issue | Location | Severity |
|-------|----------|----------|
| Tier labels not translated (FR) | AccumulatorModal:14-19, VIP:508-512 | 🟡 Medium (BUG-02) |
| No "Copy All" button for entire ticket | AccumulatorModal | 🟢 Nice-to-have |
| No league label on each leg | AccumulatorModal:141-174 | 🟢 Nice-to-have |
| Missing loading state for accumulator data | VIP:83-106 | 🟢 Minor |

---

## CAN THIS APP CALCULATE LIVE SCORES?

### Answer: **YES** ✅ — The infrastructure already exists.

Here's what's already working:

1. **Live Score Polling** (scheduler.js:356-431): The backend polls Sportmonks `/livescores/latest` every 2 minutes during match hours (13:00-23:59 Lagos time). It fetches:
   - Home/Away scores (current)
   - Match state (1H, 2H, HT, FT, etc.)
   - Match minute
   - Full event timeline (goals, cards, subs, VAR)

2. **Firestore Real-Time Sync** (scheduler.js:438-443): The polled data is written to `live_scores/current` in Firestore. The frontend subscribes via `onSnapshot()`.

3. **Frontend Display** (LiveScores.tsx:162-183): Real-time Firestore listener updates the UI automatically when the backend writes new data. No polling needed on the frontend.

4. **Auto-Score Updates** (scheduler.js:446-474): Live scores are cross-referenced with today's predictions and the `score` field is updated in real-time.

5. **Auto-Grading** (scheduler.js:482-543): When a match reaches FT/AET/PEN state, it's automatically graded (WON/LOST/VOID) and written back to Firestore.

### What "Calculate Live Score" Means
If you mean **predicting the live score** (in-play probability updates), that's a different feature — it would require:
- Re-running the Poisson model with updated xG based on in-match stats
- This is NOT currently implemented but is feasible to add

If you mean **displaying live scores** — that's already fully working.

---

## IMPLEMENTATION PLAN

### FIX-01: Rich Event Display in LiveScores (P1)

**File**: `LiveScores.tsx`, line 142

```diff
- <span className="text-gray-300 font-medium truncate">{ev.playerName || ev.name || ev.type}</span>
+ <span className="text-gray-300 font-medium truncate">
+   {ev.type === 'goal' || ev.type === 'penalty'
+     ? `${ev.playerName || 'Goal'}${ev.result ? ` (${ev.result})` : ''}`
+     : ev.type === 'substitution'
+     ? `${ev.playerName || '?'} ↔ ${ev.playerNameOut || '?'}`
+     : ev.type === 'yellowcard' || ev.type === 'redcard'
+     ? ev.playerName || ev.name || 'Card'
+     : ev.playerName || ev.name || ev.type}
+ </span>
```

Also add a home/away indicator:
```tsx
<span className={`text-[9px] ${ev.isHome ? 'text-vantage-cyan' : 'text-vantage-purple'}`}>
  {ev.isHome ? 'H' : 'A'}
</span>
```

---

### FIX-02: Bilingual Accumulator Labels (P1)

**File**: `AccumulatorModal.tsx`, lines 14-19

Replace the static `TIER_META` with a function that takes `language`:

```typescript
function getTierMeta(lang: string): Record<string, { label: string; icon: any; color: string; desc: string }> {
  const fr = lang === 'fr';
  return {
    baseline: { 
      label: fr ? 'La Base' : 'The Baseline', 
      icon: ShieldCheck, color: 'text-emerald-500', 
      desc: fr ? 'Triplé haute probabilité' : 'Highest probability treble' 
    },
    alpha_edge: { 
      label: fr ? "L'Avantage Alpha" : 'The Alpha Edge', 
      icon: Zap, color: 'text-vantage-cyan', 
      desc: fr ? 'Meilleure valeur attendue' : 'Highest expected value' 
    },
    syndicate: { 
      label: fr ? 'Le Syndicat' : 'The Syndicate', 
      icon: Target, color: 'text-vantage-purple', 
      desc: fr ? 'Combiné 4 pattes équilibré' : '4-leg balanced combo' 
    },
    variance_play: { 
      label: fr ? 'Jeu de Variance' : 'Variance Play', 
      icon: Rocket, color: 'text-orange-500', 
      desc: fr ? 'Pari audacieux haut rendement' : 'High-yield moonshot' 
    },
  };
}
```

Then inside the component: `const TIER_META = getTierMeta(language);`

Same change needed in `VIP.tsx` lines 508-512.

---

### FIX-03: Results Page — Show Score/Status for Live-Graded Matches (P1)

**File**: `Results.tsx`, lines 390-399

Add `live_state` display and score for today's matches:

```diff
 <div className="flex flex-col items-end shrink-0 ml-2">
     <span className={`text-xs font-bold font-orbitron ${statusColor[status]}`}>
         {statusLabel[status]}
     </span>
-    {match.score ? (
+    {/* Show live state badge for today's matches */}
+    {match.live_state && status === 'pending' && (
+        <span className="text-[8px] font-bold text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded-full">
+            {['FT','AET','PEN'].includes(match.live_state) ? 'FT' : `LIVE ${match.live_minute || ''}'`}
+        </span>
+    )}
+    {match.score ? (
         <span className="text-[10px] text-gray-500">{match.score}</span>
     ) : match.odds ? (
         <span className="text-[10px] text-gray-500">@ {match.odds}</span>
     ) : null}
 </div>
```

Also update the day header to show total matches:
```diff
- <span>{gradedCount} graded</span>
+ <span>{gradedCount}/{effectiveMatches.length} graded</span>
```

---

### FIX-04: Session Expiry — Force Re-login After 12 Hours (P0)

**File**: `AuthContext.tsx`, inside `fetchProfile()` function (around line 89)

Add a last-login timestamp check:

```typescript
// After line 96 (inside the docSnap.exists() block):
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours
const lastLogin = profileData.lastLoginAt ? new Date(profileData.lastLoginAt).getTime() : 0;
const sessionAge = Date.now() - lastLogin;

if (sessionAge > SESSION_MAX_AGE_MS && lastLogin > 0) {
    console.log('[Auth] Session expired, forcing re-login');
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
    return;
}

// Update lastLoginAt on every auth state change
await updateDoc(userRef, { lastLoginAt: new Date().toISOString() });
```

This ensures:
- First login: `lastLoginAt` is set
- On each page load: if `lastLoginAt` is > 12 hours ago, user is signed out
- The timestamp is updated on every successful auth, resetting the 12-hour window

---

### FIX-05: Copy Entire Ticket Button in AccumulatorModal (P2)

**File**: `AccumulatorModal.tsx`, footer section (line 193-199)

Add a "Copy All" button that copies the entire ticket as formatted text:

```tsx
<button 
    onClick={() => {
        const text = activeLegs.map((l, i) => 
            `${i+1}. ${l.home_team} vs ${l.away_team} — ${l.market} @ ${l.odds}x`
        ).join('\n') + `\n\nTotal Odds: ${activeTicketInfo?.combined_odds?.toFixed(2)}x`;
        handleCopy(text, 'full-ticket');
    }}
    className="px-4 py-2.5 rounded-xl font-bold text-sm bg-vantage-cyan text-white hover:bg-vantage-cyan/90"
>
    {copiedId === 'full-ticket' ? <Check size={16} /> : <Copy size={16} />}
    {language === 'fr' ? 'Copier Ticket' : 'Copy Ticket'}
</button>
```

---

### FIX-06: Add League Label to Each Accumulator Leg (P2)

**File**: `AccumulatorModal.tsx`, line 150 (inside the leg card)

```diff
 <div className="flex justify-between items-center mb-2 border-b ...">
     <div className="flex items-center gap-2 truncate">
         <TeamLogo ... />
         <span className="...">{leg.home_team} vs {leg.away_team}</span>
         <TeamLogo ... />
     </div>
+    <span className="text-[8px] text-gray-500 shrink-0 ml-1">{leg.league}</span>
```

---

## Implementation Priority

| # | Task | Severity | Effort | File(s) |
|---|------|----------|--------|---------|
| FIX-04 | Session expiry (12h) | 🔴 P0 | 10 lines | AuthContext.tsx |
| FIX-01 | Rich live events | 🟡 P1 | 15 lines | LiveScores.tsx |
| FIX-02 | Bilingual accumulators | 🟡 P1 | 25 lines | AccumulatorModal.tsx, VIP.tsx |
| FIX-03 | Results page live status | 🟡 P1 | 10 lines | Results.tsx |
| FIX-05 | Copy entire ticket | 🟢 P2 | 10 lines | AccumulatorModal.tsx |
| FIX-06 | League on accu legs | 🟢 P2 | 3 lines | AccumulatorModal.tsx |

---

*End of Audit*
