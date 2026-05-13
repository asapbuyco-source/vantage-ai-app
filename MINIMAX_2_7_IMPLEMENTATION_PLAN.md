# Vantage AI — MiniMax 2.7 Implementation Plan

> **Target Executor**: MiniMax M2.7 AI Model
> **Codebase**: `c:\Users\pc\Downloads\vantage-ai`
> **Supersedes**: `MINIMAX_IMPLEMENTATION_PLAN.md` (MiniMax 2.5 tasks)
> **Date**: May 2026

---

## ⚠️ Instructions for MiniMax

Execute all phases **sequentially**. Each task has an explicit **Action** block with exact code. Do not paraphrase or infer — apply the code exactly as written. Run the **Validation** command after each task before proceeding. If a validation fails, fix it before continuing.

Python files live in `backend/quant/`. JavaScript files live at the project root or `backend/`. TypeScript/React files live in `pages/`, `components/`, `context/`, or `services/`.

---

## Phase 1 — Critical Math Fix: xG Input Correction

### Task 1.1 — Fix Shot-Count/xG Confusion in Data Pipeline

**File:** `backend/quant/data_pipeline.py`

**Problem:** `type_id == 34` maps to **corners** in Sportmonks, NOT expected goals. `type_id == 41` maps to **total shots**, NOT shots on target. The pipeline is using corner counts as xG, producing values like `9.00 xG` which are impossible. The correct stat IDs are:
- `45` = Ball Possession (%)
- `41` = Total Shots
- `42` = Shots on Target
- `34` = Corners ← **currently mislabeled as xG**

**Action:** In `_parse_form()`, locate the stat-parsing block (lines ~238–253). Replace the entire inner `for stat in stats_list:` loop with:

```python
        for stat in stats_list:
            tid = stat.get("type_id")
            s_loc = stat.get("location", "")
            val = stat.get("data", {}).get("value") if isinstance(stat.get("data"), dict) else stat.get("value")
            try:
                val = float(val)
                has_stats = True
                # type_id 42 = Shots on Target (used as xG proxy)
                if tid == 42:
                    if s_loc == loc_str: my_xg = val
                    elif s_loc == opp_loc: opp_xg = val
                # type_id 45 = Ball Possession %
                elif tid == 45 and s_loc == loc_str:
                    my_poss = val
                # type_id 41 = Total Shots
                elif tid == 41 and s_loc == loc_str:
                    my_sot = val
            except (TypeError, ValueError):
                pass
```

Then normalise the shots-on-target values into an xG proxy. After the stats loop, add a conversion step. Locate where `total_xg_created` is accumulated (lines ~255–260) and add before that block:

```python
        if has_stats:
            # Normalize shots-on-target to xG-equivalent (industry average: 0.35 xG per shot on target)
            my_xg_norm = round(my_xg * 0.35, 3)
            opp_xg_norm = round(opp_xg * 0.35, 3)
            total_xg_created += my_xg_norm
            total_xg_conceded += opp_xg_norm
            total_possession += my_poss
            total_sot += my_xg   # keep raw shots on target for form model
            stats_matches += 1
```

Remove the original `total_xg_created += my_xg` and `total_xg_conceded += opp_xg` lines that follow (they will be duplicated now).

**Validation:** Run `python data_pipeline.py` on any recent date. Confirm printed xG values are between `0.3` and `2.5`, never above `5.0`.

---

### Task 1.2 — Add Sportmonks Predictions API as 4th Model Signal

**File:** `backend/quant/data_pipeline.py`

**Problem:** The Sportmonks Odds & Predictions addon includes a `/predictions/probabilities/fixture/{id}` endpoint that returns pre-computed win/draw/loss probabilities. This is a free second opinion that can dramatically improve accuracy.

**Action 1:** Add a new function at the bottom of the API Helpers section (after `_get_paginated`, before `LEAGUE_AVG_GOALS`):

```python
def fetch_sportmonks_prediction(fixture_id: int) -> dict | None:
    """Fetch Sportmonks' own pre-built probability model for a fixture.
    Returns dict with keys: home_win, draw, away_win (0-1 floats) or None."""
    try:
        result = _get(f"/predictions/probabilities/fixture/{fixture_id}")
        if not result or not result.get("data"):
            return None
        data = result["data"]
        # Handle both list and dict response shapes
        if isinstance(data, list):
            data = data[0] if data else {}
        predictions = data.get("predictions", {})
        hw = float(predictions.get("home_win_percentage", 0)) / 100.0
        d  = float(predictions.get("draw_percentage", 0)) / 100.0
        aw = float(predictions.get("away_win_percentage", 0)) / 100.0
        if hw + d + aw < 0.5:  # Empty / unsupported fixture
            return None
        return {"home_win": hw, "draw": d, "away_win": aw}
    except Exception as e:
        print(f"[DataPipeline] Sportmonks prediction fetch failed for {fixture_id}: {e}", file=sys.stderr)
        return None
```

**Action 2:** In the `MatchData` dataclass (after `expected_goals_away`), add:

```python
    sm_pred_home_win: float = 0.0   # Sportmonks model: home win probability
    sm_pred_draw: float = 0.0       # Sportmonks model: draw probability
    sm_pred_away_win: float = 0.0   # Sportmonks model: away win probability
    sm_pred_available: bool = False  # True if Sportmonks gave us predictions
```

**Action 3:** In `fetch_matches()`, after building each `MatchData` object and before appending to `matches`, add:

```python
        # Try fetching Sportmonks' own probability model
        sm_pred = fetch_sportmonks_prediction(int(fixture_id))
        if sm_pred:
            match.sm_pred_home_win = sm_pred["home_win"]
            match.sm_pred_draw = sm_pred["draw"]
            match.sm_pred_away_win = sm_pred["away_win"]
            match.sm_pred_available = True
```

**Validation:** Run pipeline in dry-run mode. If Sportmonks plan includes predictions, at least one match should have `sm_pred_available=True` printed in debug output.

---

### Task 1.3 — Wire SM Predictions into Probability Engine

**File:** `backend/quant/probability_engine.py`

**Problem:** The 4th model signal from Task 1.2 is stored in `MatchData` but never used in the blending calculation.

**Action 1:** In `compute_combined()`, locate the weights section at the top. The current signature is:
```python
def compute_combined(poisson_probs, elo_probs, form_probs, match=None, weights_override=None):
```

Add after the `weights_override` block that reads `W_POISSON`, `W_ELO`, `W_FORM`:

```python
    # Weight for Sportmonks pre-built model (only applied if available)
    W_SM = 0.10  # 10% weight when available; redistributed from other models

    has_sm = match is not None and getattr(match, 'sm_pred_available', False)
    if has_sm:
        # Reduce other weights proportionally to make room for SM signal
        scale = 1.0 - W_SM
        W_POISSON = W_POISSON * scale
        W_ELO = W_ELO * scale
        W_FORM = W_FORM * scale
```

**Action 2:** In the 1X2 blending calculation (where `home_win`, `draw`, `away_win` are computed), find lines like:

```python
    home_win = W_POISSON * p_home + W_ELO * e_home + W_FORM * f_home
    draw     = W_POISSON * p_draw + W_ELO * e_draw  + W_FORM * f_draw
    away_win = W_POISSON * p_away + W_ELO * e_away  + W_FORM * f_away
```

Replace with:

```python
    sm_home = getattr(match, 'sm_pred_home_win', 0.0) if has_sm else 0.0
    sm_draw = getattr(match, 'sm_pred_draw', 0.0) if has_sm else 0.0
    sm_away = getattr(match, 'sm_pred_away_win', 0.0) if has_sm else 0.0

    home_win = W_POISSON * p_home + W_ELO * e_home + W_FORM * f_home + (W_SM * sm_home if has_sm else 0.0)
    draw     = W_POISSON * p_draw + W_ELO * e_draw  + W_FORM * f_draw  + (W_SM * sm_draw if has_sm else 0.0)
    away_win = W_POISSON * p_away + W_ELO * e_away  + W_FORM * f_away + (W_SM * sm_away if has_sm else 0.0)
```

**Validation:** Run `python probability_engine.py`. Confirm model blend sums to 1.0. When `sm_pred_available=True` is mocked, the output 1X2 probabilities should shift by ~10% toward the Sportmonks signal.

---

## Phase 2 — Scheduler & Cron Fixes

### Task 2.1 — Move Match Stats Fetcher to 23:30

**File:** `backend/scheduler.js`

**Problem:** Match statistics are fetched at 07:45 Lagos time, before any matches have kicked off. Sportmonks only populates `possession`, `shots`, etc. after matches are played.

**Action:** Find the `statsTask` cron schedule (around line 647):

```javascript
    const statsTask = cron.schedule('45 7 * * *', async () => {
```

Replace with:

```javascript
    const statsTask = cron.schedule('30 23 * * *', async () => {
```

**Validation:** Confirm the scheduler log reads `📊 Match statistics fetcher scheduled at 23:30 Lagos` on next restart.

---

### Task 2.2 — Fix Scheduled Time Display Mismatch in UI

**File:** `backend/scheduler.js`

**Problem:** The UI reads `footballGenTime` from Firestore settings for the "Next predictions" display, but actual predictions now come from the `quantGenTime` schedule. These can drift, showing the wrong time to users.

**Action:** In `syncSchedules()`, locate the two lines that read settings:

```javascript
            const footballTime = safeTime(config.footballGenTime, '08:00');
```

Replace with:

```javascript
            const footballTime = safeTime(config.quantGenTime || config.footballGenTime, '07:00');
```

This ensures the display time shown in `getAppSettings().footballGenTime` always matches the actual quant pipeline run time.

**Validation:** Set `quantGenTime: "07:30"` in Firestore `settings/app`. The Home page "Next: 07:30 AM" should update within 5 minutes.

---

### Task 2.3 — Schedule `repairCorruptedPredictions` Daily

**File:** `backend/scheduler.js`

**Problem:** `repairCorruptedPredictions` is exported but never called, allowing prematurely-graded predictions to remain corrupted indefinitely.

**Action:** At the bottom of `initScheduler()`, before the closing `};`, add:

```javascript
    // ── Daily Prediction Repair (03:00 Lagos) ─────────────────────────────────
    const repairTask = cron.schedule('0 3 * * *', async () => {
        try {
            const db = admin.firestore();
            const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
            const { repairCorruptedPredictions } = await import('./scheduler.js');
            const fixed = await repairCorruptedPredictions(db, dateKey);
            if (fixed > 0) console.log(`[Repair] 🔧 Fixed ${fixed} corrupted predictions for ${dateKey}`);
        } catch (e) {
            console.warn('[Scheduler] Repair task error:', e.message);
        }
    }, { timezone: 'Africa/Lagos' });
    tasks.set('repair', repairTask);
    console.log('🔧 Prediction repair task scheduled at 03:00 Lagos');
```

Also add `'repair'` to the `stopScheduler` array (line ~762):

```javascript
    const allTasks = [
        'sync', 'selar', 'liveScore', 'news', 'stats', 'tomorrow',
        'basketball', 'blog', 'telegram', 'quant', 'quantGrading', 'repair'
    ];
```

**Validation:** Confirm `stopScheduler()` logs include `repair` task being stopped on shutdown.

---

### Task 2.4 — Fix Tomorrow Fixtures Fake Category Labels

**File:** `backend/scheduler.js`

**Problem:** Tomorrow's pre-fetched fixtures are hardcoded with `category: 'value'` and `confidence: 0`, making the VIP Tomorrow tab look broken.

**Action:** Find the `tomorrowTask` cron (around line 706). In the `fixtures` map, replace:

```javascript
                    category: 'value',
                    confidence: 0,
                    odds: 0,
                    prediction: '',
```

With:

```javascript
                    category: 'no_edge',
                    confidence: 0,
                    odds: 0,
                    prediction: 'Preview — Analysis runs at 07:00',
                    prediction_en: 'Preview — Vantage AI analysis runs at 07:00 Lagos',
                    prediction_fr: 'Aperçu — L\'analyse IA est disponible à 07h00',
```

**Validation:** Check the VIP Tomorrow tab — fixtures should now show "Preview" instead of a fake "VALUE" badge.

---

## Phase 3 — Frontend Bug Fixes

### Task 3.1 — Fix Streak Counter Logic

**File:** `pages/Home.tsx`

**Problem:** The streak counter shows total wins, not consecutive wins. `won >= 3` is checked but `won` = total wins for the day, not streak.

**Action:** Find the Rolling Results Ticker block (around line 248–275). Replace the inner IIFE that computes `won`, `lost`, `rate`:

```tsx
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
```

With:

```tsx
          {(() => {
            const graded = predictions.filter(m => m.status === 'won' || m.status === 'lost');
            const won = graded.filter(m => m.status === 'won').length;
            const lost = graded.filter(m => m.status === 'lost').length;
            const total = won + lost;
            const rate = total > 0 ? Math.round((won / total) * 100) : 0;
            // Compute true consecutive streak from most recent graded match
            const sorted = [...graded].sort((a, b) => (b.time || '').localeCompare(a.time || ''));
            let streak = 0;
            for (const m of sorted) {
              if (m.status === 'won') streak++;
              else break;
            }
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
                {streak >= 3 && (
                  <span className="text-[10px] font-black text-orange-500 animate-pulse flex items-center gap-0.5">
                    🔥 {streak} streak
                  </span>
                )}
              </>
            );
          })()}
```

**Validation:** With test data of `[won, won, lost, won, won]` (sorted newest first), streak should be `2`, not `4`.

---

### Task 3.2 — Fix Windows `/dev/null` Crash in Grid Search

**File:** `backend/quant/grid_search.py`

**Problem:** `open(os.devnull, 'w')` crashes on Windows because `/dev/null` doesn't exist.

**Action:** Find the line (approximately line 88):

```python
sys.stdout = open(os.devnull, 'w')
```

Replace with:

```python
_null_device = 'nul' if os.name == 'nt' else os.devnull
sys.stdout = open(_null_device, 'w')
```

Apply the same fix to any other `open(os.devnull, 'w')` occurrence in the file.

**Validation:** Run `python backend/quant/grid_search.py 3` on Windows. It must complete without `FileNotFoundError`.

---

### Task 3.3 — Add Kelly Stake Input Validation

**File:** `pages/Kelly.tsx`

**Problem:** Zero odds or 100% probability causes division-by-zero or negative Kelly stakes.

**Action:** Find the Kelly calculation function (wherever `kelly` is computed from `prob` and `odds`). Add input guards before the formula:

```typescript
  const clampedOdds = Math.max(1.01, odds);
  const clampedProb = Math.min(0.99, Math.max(0.01, prob / 100));
  const b = clampedOdds - 1;
  const kelly = ((b * clampedProb) - (1 - clampedProb)) / b;
  const kellyStake = Math.max(0, kelly);
```

Also add `min="1.01"` and `max="99"` to the respective HTML inputs for odds and probability.

**Validation:** Enter `odds=1.0` and `prob=100`. Confirm no `Infinity` or negative value is shown.

---

## Phase 4 — New Page: Pre-Match News Display

**Problem:** Pre-match news is already fetched daily at 07:30 and stored in Firestore `match_news/{dateKey}`. No page shows it. This is wasted data.

### Task 4.1 — Create `MatchNews` Service Function

**File:** `services/sportsData.ts`

**Action:** Add a new exported function at the bottom:

```typescript
import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

export const getMatchNewsForDate = async (dateKey: string): Promise<MatchNews[]> => {
  try {
    const snap = await getDoc(doc(db, 'match_news', dateKey));
    if (!snap.exists()) return [];
    return (snap.data()?.items || []) as MatchNews[];
  } catch {
    return [];
  }
};
```

---

### Task 4.2 — Add News Panel to MatchDetailsModal

**File:** `components/MatchDetailsModal.tsx`

**Problem:** The match detail modal is the perfect place to show relevant pre-match news for that fixture.

**Action 1:** Import the service:
```typescript
import { getMatchNewsForDate } from '../services/sportsData';
import { MatchNews } from '../types';
```

**Action 2:** Add state inside the modal component:
```typescript
const [news, setNews] = useState<MatchNews[]>([]);
```

**Action 3:** In the modal's `useEffect` (or create one), fetch news filtered by `fixtureId`:
```typescript
useEffect(() => {
  if (!match) return;
  const dateKey = match.kickoff_local?.split('T')[0] || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  getMatchNewsForDate(dateKey).then(items => {
    setNews(items.filter(n => n.fixtureId === match.fixtureId || n.fixtureId === match.fixture_id));
  });
}, [match]);
```

**Action 4:** In the modal JSX, below the stats section, add:
```tsx
{news.length > 0 && (
  <div className="mt-4 space-y-2">
    <h4 className="text-xs font-bold uppercase tracking-widest text-vantage-purple flex items-center gap-2">
      📰 {language === 'fr' ? 'Actualités du match' : 'Match News'}
    </h4>
    {news.map(n => (
      <div key={n.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
        <p className="text-xs font-bold text-slate-200 mb-1">{n.title}</p>
        {n.body && <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-4">{n.body}</p>}
      </div>
    ))}
  </div>
)}
```

**Validation:** Open a match detail modal. If news exists for that fixture in Firestore, the "Match News" panel appears at the bottom.

---

## Phase 5 — Final Validation Checklist

Execute every item. Do not skip.

| # | Command | Expected Result |
|---|---------|-----------------|
| 1 | `python backend/quant/data_pipeline.py` | xG values between 0.3–2.5, no value above 5.0 |
| 2 | `python backend/quant/grid_search.py 3` | Completes without error on Windows |
| 3 | `python backend/quant/quant_pipeline.py --dry-run` | Kelly stakes between 1–5% range |
| 4 | `npm run build` | Zero TypeScript compilation errors |
| 5 | `node server.js` | Startup logs include `🔧 Prediction repair task scheduled at 03:00 Lagos` |
| 6 | `node server.js` | Startup logs include `📊 Match statistics fetcher scheduled at 23:30 Lagos` |
| 7 | UI: Kelly Calculator | Entering `odds=1.0` does not show Infinity or negative |
| 8 | UI: Home page streak | Shows consecutive wins only, not total wins |
| 9 | UI: VIP Tomorrow tab | Shows "Preview" text, not "VALUE" badge |

---

## Summary of Changes

| Phase | Files Modified | Impact |
|-------|---------------|--------|
| 1.1 | `data_pipeline.py` | xG inputs corrected → Poisson model now accurate |
| 1.2 | `data_pipeline.py` | Sportmonks 4th model signal integrated |
| 1.3 | `probability_engine.py` | 4th model blended at 10% weight |
| 2.1 | `scheduler.js` | Stats now fetched post-match (23:30) |
| 2.2 | `scheduler.js` | UI shows correct quant schedule time |
| 2.3 | `scheduler.js` | Corrupted predictions auto-repaired nightly |
| 2.4 | `scheduler.js` | Tomorrow tab shows "Preview" not fake VALUE |
| 3.1 | `pages/Home.tsx` | Streak = consecutive wins, not total wins |
| 3.2 | `backend/quant/grid_search.py` | Windows `/dev/null` crash fixed |
| 3.3 | `pages/Kelly.tsx` | Kelly inputs validated, no Infinity |
| 4.1–4.2 | `services/sportsData.ts`, `MatchDetailsModal.tsx` | Pre-match news shown in match detail modal |
