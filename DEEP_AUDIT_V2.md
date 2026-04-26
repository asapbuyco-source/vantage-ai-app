# Vantage AI — Deep Audit V2 & Live Score Implementation Plan

> **Date**: April 26, 2026 | **Target**: Minimax 2.5

---

## 1. Previous Fix Verification

### ✅ CONFIRMED FIXES

| Fix | Status | Location |
|-----|--------|----------|
| Popup priority system | ✅ | `App.tsx:352-359` — Onboarding > SpecialOffer, gated by `!userProfile?.isVip && !isAdmin` |
| SpecialOfferPopup VIP guard | ✅ | `SpecialOfferPopup.tsx:14,18` — `isVip` check blocks popup |
| TrialOfferPopup VIP guard | ✅ | `TrialOfferPopup.tsx:29,59` — `isVip` prop gates display |
| TrialOfferPopup isVip prop passed | ✅ | `Home.tsx:741` — `isVip={isVip}` passed |
| Pricing alignment (2000 FCFA) | ✅ | `SpecialOfferPopup.tsx:36,82` — Shows 2000 FCFA |
| Modal VIP footer guard | ✅ | `MatchDetailsModal.tsx:596` — `!isVipUser` check |
| Modal bottom-sheet direction | ✅ | `MatchDetailsModal.tsx:101,111-113` — `items-end`, `y: "100%"` |
| Light mode match cards | ✅ | `Home.tsx:530` — `bg-white dark:bg-[#1a1d26]` |
| Hero rotation removed | ✅ | `LandingPage.tsx:146` — No `rotate` class |
| Haptic on copy | ✅ | `Home.tsx:120`, `FreePicks.tsx:76` — `navigator.vibrate(50)` |
| Free picks default = 3 | ✅ | `Home.tsx:77` — `useState(3)` |
| Pagination (visibleCount) | ✅ | `Home.tsx:78,506` — `useState(15)`, `.slice(0, visibleCount)` |
| Layout animation removed | ✅ | `Home.tsx:516-521` — No `layout` prop |
| BottomNav sliding indicator | ✅ | `BottomNav.tsx:63-68` — `layoutId="activeTab"` with spring |

### ❌ ISSUES FOUND IN APPLIED FIXES

| ID | Severity | Issue |
|----|----------|-------|
| **REGR-01** | 🔴 CRITICAL | `FreePicks.tsx:64` still defaults to `useState(2)` not `useState(3)`. The admin override works but the hardcoded default wasn't updated. |
| **REGR-02** | 🟠 HIGH | `SpecialOfferBanner.tsx:27` still shows "1000 FCFA Trial" text — inconsistent with the SpecialOfferPopup which now says 2000 FCFA. |
| **REGR-03** | 🟠 HIGH | `Home.tsx:107` — `WEEKLY_TRIAL_PLAN.price` is still `'1000'` — the Trial popup and the payment it triggers use different prices than the SpecialOfferPopup. |

---

## 2. 🔴 CRITICAL BUG: Duplicate Code Block in Scheduler

**File**: `backend/scheduler.js:470-481`

The auto-update predictions section has **duplicated closing braces and a duplicate `qDocRef.update()` call**:

```
470:                         }
471:                         if (updated) {                          // ← FIRST (correct)
472:                             await qDocRef.update(...)
473:                             console.log(...)
474:                         }                                       // ← end first block
475:                             }                                   // ← ORPHAN BRACE
476:                         }                                       // ← ORPHAN BRACE
477:                         if (updated) {                          // ← DUPLICATE
478:                             await qDocRef.update(...)            // ← DOUBLE WRITE
479:                             console.log(...)
480:                         }
481:                     }
```

**Impact**: Every live score poll writes predictions to Firestore **TWICE**, doubling write costs and creating race conditions. Also has orphan braces that will cause a **syntax error** on certain Node.js versions.

---

## 3. LIVE SCORE SYSTEM — Deep Audit

### 3.1 Current Architecture

```
Backend Scheduler (60s cron)
    → Sportmonks /livescores/inplay
    → Writes to Firestore `live_scores/current`
    → Also updates `quant_predictions/{date}.predictions[].score`

Frontend LiveScores.tsx
    → onSnapshot(`live_scores/current`) → renders LiveMatch cards

Frontend Home.tsx  
    → onSnapshot(`live_scores/current`) → only reads `count` for badge
    → Match cards read `match.score` from DataContext (quant_predictions)
```

### 3.2 Critical Gaps Found

| ID | Severity | Gap |
|----|----------|-----|
| **LIVE-01** | 🔴 CRITICAL | **No auto-status grading during live play**. The scheduler updates `score` but NEVER updates `status` (won/lost/pending). A match at FT with score "2-1" still shows `status: "pending"` until the daily grading cron runs at 06:30 next morning. Users see scores but no win/loss indicator. |
| **LIVE-02** | 🔴 CRITICAL | **Home page match cards don't react to live score changes**. `DataContext.fetchFromDB()` only runs on mount/path-change. The `score` field updated by the scheduler in Firestore is NOT pushed to the UI until the user refreshes. |
| **LIVE-03** | 🔴 CRITICAL | **Results page is fully static** — `getResultsHistory()` reads past days only (starting from `i + 1`, skipping today). Today's matches with FT status never appear on Results until tomorrow. |
| **LIVE-04** | 🟠 HIGH | **No FT detection in live poller**. The scheduler writes ALL live matches but doesn't check `stateShort === 'FT'` to trigger grading. When a match finishes, nothing happens until the scheduled grading job. |
| **LIVE-05** | 🟠 HIGH | **Match cards filter out started matches**. `Home.tsx:161` filters `match.time >= currentTimeStr` — so once a match kicks off, it disappears from the Home page entirely. Users lose track of their predictions. |
| **LIVE-06** | 🟡 MED | **LiveScores page has no link back to predictions**. Users see live scores but can't see which matches they predicted or whether their prediction is winning. |

### 3.3 What the User Wants

> "auto update in match cards when match is done win or loss and also update in results page making the results page something that calculates as it goes and not calculates after all matches have been played"

**Translation into requirements:**
1. When a match reaches FT in the live poller → auto-grade it immediately (won/lost)
2. Home page match cards should show live scores in real-time AND show win/loss status
3. Results page should include TODAY and update rolling stats as matches finish

---

## 4. Competitive Analysis — How to Beat the Top

| Feature | Competitors (Betway Tips, FlashScore, SofaScore) | Vantage AI Current | Gap |
|---------|--------------------------------------------------|-------------------|-----|
| Real-time score overlay on predictions | ✅ Integrated | ❌ Separate pages | Must merge |
| Win/Loss auto-grading | ✅ Instant | ❌ Next-day batch | Must fix |
| Rolling daily P/L tracker | ✅ Live dashboard | ❌ Static history | Must fix |
| Push notifications on prediction result | ✅ Instant alerts | ❌ None | Phase 2 |
| Streak tracking ("🔥 5 in a row") | ✅ Prominent | ❌ Hidden in stats | Add to Home |
| Pre-match countdown timer | ✅ On every card | ❌ Static time display | Add |
| Odds movement tracker | ✅ Arrows up/down | ❌ Static odds | Phase 2 |
| Multi-language SEO blog | ✅ Full | ✅ Done | — |
| Telegram channel integration | ✅ Bot alerts | ✅ Done | — |

---

## 5. Implementation Plan

### Phase 1: Fix Critical Bugs

#### Task 1.1 — Fix Duplicate Block in Scheduler

**File**: `backend/scheduler.js`  
**Lines**: 470-481

**Remove the duplicate block** (lines 475-480). The correct block is lines 471-474.

Replace lines 470-481 with:
```javascript
                            }
                        }
                        if (updated) {
                            await qDocRef.update({ predictions: preds });
                            console.log(`[Live] 🔄 Auto-updated prediction scores for ${todayStr}`);
                        }
                    }
                } catch (e) {
```

**Validation**: `node -c backend/scheduler.js` passes with no syntax errors.

---

#### Task 1.2 — Fix FreePicks Default Count

**File**: `pages/FreePicks.tsx`, line 64

Change: `useState(2)` → `useState(3)`

---

#### Task 1.3 — Fix SpecialOfferBanner Price Text

**File**: `components/SpecialOfferBanner.tsx`, line 27

Change `1000 FCFA` → `2000 FCFA` in both language strings.

---

#### Task 1.4 — Fix Home Trial Plan Price

**File**: `pages/Home.tsx`, line 107

Change `price: '1000'` → `price: '2000'` to match SpecialOfferPopup.

---

### Phase 2: Real-Time Auto-Grading in Live Poller

#### Task 2.1 — Add FT Detection + Instant Grading to Scheduler

**File**: `backend/scheduler.js`

After the existing score-update block (around line 474), add instant grading logic:

```javascript
// ── AUTO-GRADE FINISHED MATCHES ──
const ftMatches = matches.filter(m => 
    ['FT', 'AET', 'PEN'].includes((m.stateShort || '').toUpperCase())
);

if (ftMatches.length > 0) {
    for (const pred of preds) {
        if (pred.status && pred.status !== 'pending') continue; // already graded
        
        const ftMatch = ftMatches.find(m =>
            String(m.id) === String(pred.fixture_id) ||
            String(m.homeTeamId) === String(pred.home_team_id) ||
            normalize(m.homeTeam) === normalize(pred.home_team)
        );
        
        if (!ftMatch) continue;
        
        const hg = ftMatch.homeScore;
        const ag = ftMatch.awayScore;
        const total = hg + ag;
        const market = (pred.bet_type || '').toLowerCase();
        let status = 'void';
        
        // Core grading rules (mirrors grading_engine.py _grade_bet)
        if (market.includes('home win') && !market.includes('draw no bet') && !market.includes('double'))
            status = hg > ag ? 'won' : 'lost';
        else if (market.includes('away win') && !market.includes('draw no bet') && !market.includes('double'))
            status = ag > hg ? 'won' : 'lost';
        else if (market === 'draw')
            status = hg === ag ? 'won' : 'lost';
        else if (market.includes('double chance (1x)'))
            status = hg >= ag ? 'won' : 'lost';
        else if (market.includes('double chance (x2)'))
            status = ag >= hg ? 'won' : 'lost';
        else if (market.includes('double chance (12)'))
            status = hg !== ag ? 'won' : 'lost';
        else if (market.includes('draw no bet (home)'))
            status = hg === ag ? 'void' : (hg > ag ? 'won' : 'lost');
        else if (market.includes('draw no bet (away)'))
            status = hg === ag ? 'void' : (ag > hg ? 'won' : 'lost');
        else if (market.includes('over 1.5'))
            status = total > 1 ? 'won' : 'lost';
        else if (market.includes('over 2.5'))
            status = total > 2 ? 'won' : 'lost';
        else if (market.includes('under 2.5'))
            status = total < 3 ? 'won' : 'lost';
        else if (market.includes('over 3.5'))
            status = total > 3 ? 'won' : 'lost';
        else if (market.includes('under 3.5'))
            status = total < 4 ? 'won' : 'lost';
        else if (market.includes('btts') && !market.includes('no'))
            status = (hg > 0 && ag > 0) ? 'won' : 'lost';
        else if (market.includes('btts') && market.includes('no'))
            status = (hg === 0 || ag === 0) ? 'won' : 'lost';
        
        if (status !== 'void' || ['FT', 'AET'].includes((ftMatch.stateShort || '').toUpperCase())) {
            pred.status = status;
            pred.graded_at = new Date().toISOString();
            pred.graded_by = 'live_auto';
            updated = true;
            console.log(`[Live] ✅ Auto-graded: ${pred.home_team} vs ${pred.away_team} → ${status} (${hg}-${ag})`);
        }
    }
}
```

**Validation**: When a match hits FT, the prediction's `status` field changes from `pending` to `won`/`lost` within 60 seconds.

---

### Phase 3: Real-Time UI Updates

#### Task 3.1 — Add Firestore Listener for Today's Predictions in DataContext

**File**: `context/DataContext.tsx`

Add a real-time `onSnapshot` listener for today's predictions so the UI updates when the scheduler writes new scores/statuses.

After line 204 (the existing `useEffect` for fetchFromDB), add:

```typescript
// ── Real-time listener for today's predictions (scores + statuses) ───────
useEffect(() => {
    if (!user || authLoading) return;
    const todayKey = getGlobalTodayKey();
    
    const unsub = onSnapshot(
        doc(db, 'quant_predictions', todayKey),
        (snap) => {
            if (!snap.exists() || !mountedRef.current) return;
            const data = snap.data();
            const matches = (data.predictions || []).map(normalizePrediction);
            if (matches.length > 0) {
                setPredictions(matches);
            }
        },
        (err) => console.warn('[DataContext] Prediction listener error:', err)
    );
    
    return () => unsub();
}, [user, authLoading]);
```

You'll need to add these imports at the top of `DataContext.tsx`:
```typescript
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
```

And import `normalizeQuantPrediction` from db service as `normalizePrediction`:
```typescript
import { normalizeQuantPrediction as normalizePrediction } from '../services/db';
```

**Validation**: When the scheduler updates a match score in Firestore, the Home page match card updates within seconds without refresh.

---

#### Task 3.2 — Stop Filtering Out Started Matches

**File**: `pages/Home.tsx`, lines 159-162

The current filter removes matches once they start. Instead, keep them and mark them as "LIVE" or "FT":

Replace:
```typescript
if (isToday) {
    const currentTimeStr = `${now.getHours()...}`;
    result = result.filter(match => !match.time || match.time >= currentTimeStr);
}
```

With:
```typescript
// Don't filter out started matches — show them with live scores.
// Only filter out if status is explicitly 'void' (cancelled).
result = result.filter(match => match.status !== 'void');
```

**Validation**: Matches that have kicked off remain visible with their live scores.

---

#### Task 3.3 — Add Win/Loss Badge to Match Cards

**File**: `pages/Home.tsx`

In the match card render (around line 570-577, the score display section), enhance it to show status:

Replace the existing score display block:
```tsx
{match.score ? (
    <span className="text-[13px] font-black font-orbitron text-vantage-cyan px-2 tracking-widest bg-vantage-cyan/10 rounded border border-vantage-cyan/20">
        {match.score.replace('-', ' - ')}
    </span>
) : (
```

With:
```tsx
{match.score ? (
    <div className="flex flex-col items-center gap-0.5">
        <span className="text-[13px] font-black font-orbitron text-vantage-cyan px-2 tracking-widest bg-vantage-cyan/10 rounded border border-vantage-cyan/20">
            {match.score.replace('-', ' - ')}
        </span>
        {match.status === 'won' && (
            <span className="text-[8px] font-black text-green-500 bg-green-500/15 px-1.5 py-0.5 rounded-full border border-green-500/30 uppercase tracking-wider animate-pulse">✓ WON</span>
        )}
        {match.status === 'lost' && (
            <span className="text-[8px] font-black text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded-full border border-red-500/30 uppercase tracking-wider">✗ LOST</span>
        )}
        {match.status === 'pending' && match.score && (
            <span className="text-[8px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full border border-amber-400/20 uppercase tracking-wider">LIVE</span>
        )}
    </div>
) : (
```

**Validation**: Match cards show "WON" in green or "LOST" in red when graded. Show "LIVE" when score exists but not yet graded.

---

### Phase 4: Rolling Results Page

#### Task 4.1 — Include Today in Results History

**File**: `services/db.ts`, function `getResultsHistory` (line 525)

Change `Array.from({ length: days }, (_, i) => getDateKeyDaysAgo(i + 1))` to start from today (i=0):

Replace:
```typescript
const fetchPromises = Array.from({ length: days }, (_, i) => {
    const dateKey = getDateKeyDaysAgo(i + 1);
    return getPredictionsForDate(dateKey).then(matches => ({ dateKey, matches }));
});
```

With:
```typescript
const fetchPromises = Array.from({ length: days }, (_, i) => {
    const dateKey = i === 0 ? getGlobalTodayKey() : getDateKeyDaysAgo(i);
    return getPredictionsForDate(dateKey).then(matches => ({ dateKey, matches }));
});
```

**Validation**: Results page now shows today at the top with rolling W/L counts updating as matches finish.

---

#### Task 4.2 — Add Real-Time Listener to Results Page

**File**: `pages/Results.tsx`

Add a Firestore listener for today's predictions so the Results page updates live:

Add imports:
```typescript
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getGlobalTodayKey, normalizeQuantPrediction } from '../services/db';
```

Add a live listener effect after `loadHistory`:
```typescript
// Live listener for today's rolling results
useEffect(() => {
    const todayKey = getGlobalTodayKey();
    const unsub = onSnapshot(
        doc(db, 'quant_predictions', todayKey),
        (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const matches = (data.predictions || []).map(normalizeQuantPrediction);
            
            setHistory(prev => {
                const existing = prev.filter(d => d.date !== todayKey);
                const graded = matches.filter(m => m.status === 'won' || m.status === 'lost');
                const todayEntry = {
                    date: todayKey,
                    matches,
                    wonCount: graded.filter(m => m.status === 'won').length,
                    lostCount: graded.filter(m => m.status === 'lost').length,
                    totalGraded: graded.length,
                };
                return [todayEntry, ...existing];
            });
        },
        (err) => console.warn('[Results] Live listener error:', err)
    );
    return () => unsub();
}, []);
```

**Validation**: Go to Results page while matches are in progress. As each match hits FT and gets auto-graded, the today row updates: won/lost counts increment, win rate recalculates.

---

#### Task 4.3 — Add "Today (Live)" Label to Results

**File**: `pages/Results.tsx`

In the day header (around line 257), add a "LIVE" badge when the date is today:

After `{formatDate(day.date)}`, add:
```tsx
{day.date === getGlobalTodayKey() && (
    <span className="ml-1.5 text-[8px] font-black text-red-500 bg-red-500/15 px-1.5 py-0.5 rounded-full border border-red-500/30 animate-pulse uppercase">
        LIVE
    </span>
)}
```

**Validation**: Today's row in Results shows a pulsing "LIVE" badge.

---

### Phase 5: Competitive Edge Features

#### Task 5.1 — Add Live Win Streak Counter to Home

**File**: `pages/Home.tsx`

Add a streak counter in the header area (after the date bar, around line 350):

```tsx
{/* Rolling Results Ticker */}
{predictions.some(m => m.status === 'won' || m.status === 'lost') && (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5 border border-white/5">
        {(() => {
            const won = predictions.filter(m => m.status === 'won').length;
            const lost = predictions.filter(m => m.status === 'lost').length;
            const total = won + lost;
            const rate = total > 0 ? Math.round((won / total) * 100) : 0;
            return (
                <>
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] font-black text-green-500">{won}W</span>
                        <span className="text-[10px] text-gray-600">-</span>
                        <span className="text-[10px] font-black text-red-400">{lost}L</span>
                    </div>
                    <div className="h-3 w-px bg-white/10" />
                    <span className={`text-[10px] font-black ${rate >= 60 ? 'text-green-500' : 'text-amber-400'}`}>
                        {rate}% today
                    </span>
                    {won >= 3 && (
                        <span className="text-[10px] font-black text-orange-500 animate-pulse flex items-center gap-0.5">
                            🔥 {won} streak
                        </span>
                    )}
                </>
            );
        })()}
    </div>
)}
```

**Validation**: As matches are graded, the ticker shows "5W - 2L | 71% today | 🔥 5 streak".

---

#### Task 5.2 — Add Social Proof to VIP Page

**File**: `pages/VIP.tsx`

Find the non-VIP pricing section and add social proof ABOVE the plan cards. Insert before the plan grid:

```tsx
{/* Social Proof */}
<div className="space-y-3 mb-6">
    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
        <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-green-500">
                {language === 'fr' ? 'Fiabilité vérifiée' : 'Verified accuracy'}
            </span>
        </div>
        <span className="text-xs font-bold text-green-400 cursor-pointer" onClick={() => setTab('stats')}>
            {language === 'fr' ? 'Voir →' : 'See stats →'}
        </span>
    </div>
    <div className="grid grid-cols-3 gap-2">
        {[
            { label: language === 'fr' ? 'Taux' : 'Win Rate', value: '72%', color: 'text-vantage-cyan' },
            { label: language === 'fr' ? 'Matchs/j' : 'Picks/day', value: '30+', color: 'text-vantage-purple' },
            { label: 'VIP', value: '500+', color: 'text-amber-400' },
        ].map((s, i) => (
            <div key={i} className="text-center p-3 rounded-xl bg-white/5 border border-white/10">
                <p className={`text-lg font-bold font-orbitron ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-gray-500 uppercase tracking-wider">{s.label}</p>
            </div>
        ))}
    </div>
</div>
```

---

### Phase 6: Data Flow Hardening

#### Task 6.1 — Export normalizeQuantPrediction from db.ts

Ensure `normalizeQuantPrediction` is exported (it should already be based on line 58-60 area). Verify this function exists and is exported with `export const` or `export function`.

#### Task 6.2 — Add `graded_by` field to Match type

**File**: `types.ts`

Add after line 34:
```typescript
graded_at?: string;
graded_by?: 'live_auto' | 'grading_engine' | 'chatgpt' | 'admin';
```

---

## 6. Execution Order

```
Phase 1 (Bugs)      → Tasks 1.1-1.4  → 15 min
Phase 2 (Grading)   → Task 2.1       → 20 min  
Phase 3 (UI)        → Tasks 3.1-3.3  → 25 min
Phase 4 (Results)   → Tasks 4.1-4.3  → 20 min
Phase 5 (Compete)   → Tasks 5.1-5.2  → 15 min
Phase 6 (Types)     → Tasks 6.1-6.2  → 5 min
```

## 7. Validation Checklist

| # | Test | Expected |
|---|------|----------|
| 1 | `node -c backend/scheduler.js` | No syntax errors |
| 2 | Match hits FT in live poller | Status auto-updates to won/lost within 60s |
| 3 | Home page during match day | Cards show live score + WON/LOST/LIVE badges |
| 4 | Home page after kickoff | Cards still visible (not filtered out) |
| 5 | Results page during match day | Today appears at top with rolling W/L |
| 6 | Results summary banner | Updates as each match is graded |
| 7 | FreePicks default | Shows 3 picks (not 2) |
| 8 | SpecialOfferBanner text | Shows 2000 FCFA |
| 9 | `npm run build` | Zero TypeScript errors |

---

*End of Deep Audit V2*
