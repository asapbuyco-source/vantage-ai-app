# Prediction Engine — Implementation Plan

## BUG FIXES (Critical → Minor)

### 🔴 FIX-1: Double Calibration on Goals/BTTS Markets
**Severity:** Critical — suppresses 9-11% probability mass on all goals/BTTS markets  
**Files:** `probability_engine.py:260-263`, `ev_engine.py:300-303`  

**Problem:** Goals/BTTS probs are calibrated in `probability_engine.py` via `_calibrate()`, then calibrated again in `ev_engine.py` via `calibrate_market_probability()`. Over 2.5 raw 0.90 → calibrated 0.801 → re-calibrated 0.713 (should be 0.801). Affects all Over/Under 1.5/2.5/3.5 and BTTS markets.

**Fix (Option A — recommended):** Remove calibration from `probability_engine.py`, let `ev_engine.py` handle it exclusively:
```python
# probability_engine.py:259-263 — REMOVE these 4 lines:
# over25 = _calibrate(raw_over25, "over25")
# over35 = _calibrate(raw_over35, "over35")
# over15 = _calibrate(raw_over15, "over15")
# btts   = _calibrate(raw_btts,   "btts")

# Replace with direct use of raw Poisson values:
over25 = raw_over25
over35 = raw_over35
over15 = raw_over15
btts   = raw_btts
```

**Why Option A:** Keeps all calibration in the EV layer where `calibration_factor` and `calibration_tier` metadata are attached to each ValueBet for auditability. The `probability_engine.py` `_calibrate()` function can be removed or deprecated.

**Verification:** After fix, for Over 2.5 with raw Poisson 0.92: final probability should be 0.92 × 0.89 = 0.819, NOT 0.92 × 0.89 × 0.89 = 0.729.

---

### 🟡 FIX-2: League Average Goals Always Returns Default 2.65
**Severity:** Medium — biases xG toward league-agnostic average  
**File:** `data_pipeline.py:62-68`

**Fix:** Replace the static default with a hardcoded lookup table from empirical data:
```python
LEAGUE_AVERAGES = {
    # Tier 1
    2:   2.85,   # UCL
    8:   2.78,   # EPL
    564: 2.58,   # La Liga
    82:  3.10,   # Bundesliga
    384: 2.45,   # Serie A
    5:   2.72,   # Europa League
    # Tier 2
    301: 2.68,   # Ligue 1
    462: 2.42,   # Primeira Liga
    72:  2.95,   # Eredivisie
    9:   2.55,   # Championship
    1204:2.72,   # Scottish Premiership
    138: 2.82,   # Jupiler Pro League
    # Tier 3
    253: 2.85,   # MLS
    71:  2.32,   # Brasileirão
    325: 2.15,   # Argentine Primera
    176: 2.65,   # Süper Lig
    570: 2.78,   # Saudi Pro League
    103: 2.82,   # Eliteserien
    113: 2.75,   # Allsvenskan
    292: 2.58,   # K League 1
    1186:2.10,   # CAF Champions League
    1187:2.05,   # CAF Confederation Cup
    567: 2.25,   # Segunda División
    85:  2.82,   # 2. Bundesliga
    395: 2.32,   # Serie B
    302: 2.38,   # Ligue 2
}

def _league_avg(league_id: int) -> float:
    return LEAGUE_AVERAGES.get(league_id, 2.65)
```
Also populate dynamically from graded results: run a query every Sunday that updates the lookup from actual scored goals in the last 30 days per league.

---

### 🟡 FIX-3: Grading Engine Redundant Case Checks
**Severity:** Cosmetic — no functional impact  
**File:** `grading_engine.py:93-100`

**Fix:** Remove the redundant `market.lower()` calls, use only `m`:
```python
# Lines 93-100: Replace "m or market.lower()" patterns with just "m"
if "over 1.5" in m:
    return MarketType.OVER_1_5
if "over 2.5" in m:
    return MarketType.OVER_2_5
if "over 3.5" in m:
    return MarketType.OVER_3_5
if "under 2.5" in m:
    return MarketType.UNDER_2_5
if "under 3.5" in m:
    return MarketType.UNDER_3_5
```

---

## PREDICTION IMPROVEMENTS (High Impact)

### 🟢 IMPROVE-1: Integrate Fotmob for Match-Specific xG Data
**Impact:** Very High — replaces team-average xG with actual match-specific xG  
**Files:** New integration in `data_pipeline.py`, `fotmob_client.py` already exists  

**Current state:** `data_pipeline.py` sets `expected_goals_home/away` from `team.avg_xg_created` (seasonal team average). Every Arsenal match gets the same xG regardless of opponent.

**Fotmob provides per-fixture:** xG, xGOT (expected goals on target), shot maps, possession. This is free and already has a client (`fotmob_client.py`).

**Implementation:**
1. Extend `fotmob_client.py` with `fetch_prematch_stats(fixture_id)` that returns team-level xG for the upcoming fixture
2. In `data_pipeline.py`, after fetching fixtures, call Fotmob for each fixture's expected lineups/stats
3. Map Fotmob team IDs to internal team IDs (or use team name fuzzy matching)
4. Set `match.expected_goals_home = fotmob_xg_home` and `match.expected_goals_away = fotmob_xg_away`
5. Fall back to team-average xG if Fotmob unavailable

**Estimated accuracy improvement:** 5-12% better probability estimates (xG is the single strongest predictor of match outcomes)

---

### 🟢 IMPROVE-2: Weekly Auto-Recalibration Pipeline
**Impact:** High — prevents calibration drift as leagues/teams change  
**Files:** New cron job in `scheduler.js`, new Python script or extend `performance_tracker.py`  

**Current state:** Calibration factors in `calibration_registry.py` are static (dated 2026-06-15, one-time manual run).

**Implementation:**
1. Create `recalibrate.py` that:
   - Reads last 30 days of graded `quant_predictions` from Firestore
   - Groups by market key (over25, btts, home_win, etc.)
   - Computes avg_predicted_prob vs avg_actual_hit_rate per market
   - Computes new discount factor = actual / predicted
   - Saves updated factors to `calibration_registry.py` (or to Firestore `settings/calibration`)
   - Exports to Firestore for runtime consumption (avoids code changes)
2. Add cron job: `0 23 * * 0` (Sunday 23:00 Lagos) — runs weekly
3. Add a `calibration_version` field to each prediction so old predictions don't get re-graded with new factors

**Risk management:** Cap factor changes at ±5% per week to prevent oscillation. Require ≥50 bets per market for update. Keep 4-week rolling average.

---

### 🟢 IMPROVE-3: Player-Level Injury Impact from Lineup Data
**Impact:** Medium-High — replaces flat 3%/player penalty with weighted impact  
**Files:** `probability_engine.py:180-181`, `lineup_syncer.py`, new `injury_impact.py`  

**Current state:** Every sidelined player reduces xG by 3% regardless of who they are (star striker or backup GK). `lineup_syncer.py` fetches starting XIs but doesn't feed back into predictions.

**Implementation:**
1. Extend `lineup_syncer.py` to also fetch expected lineups (available from API-Football 1-2 hours pre-match)
2. Create `injury_impact.py` with:
   - Map of key players per team (top 3 scorers, top 2 assisters, captain)
   - Weighted impact: missing star striker → 8-12% xG reduction; missing backup CB → 2-3%
   - Use Transfermarkt market value as proxy for player importance (free via `transfermarkt_client.py`)
3. Feed player-level impact into `probability_engine.py` instead of flat 3% multiplier
4. Mark predictions with `lineup_confidence` flag (high = confirmed XI, low = expected)

---

### 🟢 IMPROVE-4: Ensemble Disagreement as Confidence Signal
**Impact:** Medium — identifies high-conviction bets where all 4 models agree  
**Files:** `probability_engine.py`, `quant_pipeline.py`  

**Current state:** Per-market confidence scores exist (result/goals/btts_confidence) but don't measure cross-model agreement. A bet where Poisson says 65%, Elo says 62%, Form says 67%, H2H says 50% is treated the same as one where all four say 63-65%.

**Implementation:**
1. In `compute_combined()`, compute ensemble standard deviation across the 4 model outputs:
```python
ensemble_std = statistics.stdev([poisson.home_win, elo["home_win"], form.home_win, h2h_p_home])
ensemble_agreement = 1.0 - min(1.0, ensemble_std / 0.15)
```
2. Add `ensemble_agreement` to `CombinedProbabilities`
3. In `quant_pipeline.py`, boost confidence for high-agreement picks: if `ensemble_agreement > 0.85`, allow lower EV threshold (4% instead of 5%)
4. Flag low-agreement picks: if `ensemble_agreement < 0.5`, require higher EV (7% instead of 5%)

---

### 🟢 IMPROVE-5: Time-Decay Weighting for Form Model
**Impact:** Medium — most recent matches get proper weight  
**Files:** `form_model.py:18`  

**Current state:** Recency weights `[1.5, 1.3, 1.1, 0.9, 0.7]` for last 5 matches. These are fixed and don't account for match recency in days (a match 2 days ago vs 30 days ago get the same position-based weight if both are in the "last 5").

**Implementation:**
1. Store match dates alongside form results in `TeamStats`
2. Apply exponential decay based on days-since-match:
```python
import math
decay_rate = 0.05  # 5% decay per day
day_weight = math.exp(-decay_rate * days_ago)
combined_weight = position_weight * day_weight
```
3. A win 3 days ago: 1.5 × e^(-0.05×3) = 1.5 × 0.86 = 1.29
4. A win 25 days ago: 1.5 × e^(-0.05×25) = 1.5 × 0.29 = 0.43

---

### 🟢 IMPROVE-6: Asian Handicap Market Support
**Impact:** Medium — captures profitable AH markets where bookmakers misprice  
**Files:** `ev_engine.py:83-105`, `data_pipeline.py` (OddsData)  

**Current state:** AH Home -0.5 and AH Away +0.5 exist in `MARKET_TO_PROB` but are rarely populated. No AH -1.0, -1.5, +1.0 markets. These are highly liquid markets with frequent mispricing.

**Implementation:**
1. Add AH market fields to `OddsData`: `ah_home_minus10`, `ah_home_minus15`, `ah_away_plus10`, `ah_away_plus15`
2. Map them to correct probabilities: AH -1.0 = win by 2+ (use Poisson grid to compute P(home_goals ≥ away_goals + 2))
3. Compute EV for AH markets using the score grid directly
4. AH markets often have lower bookmaker margins → easier to find +EV

---

### 🟢 IMPROVE-7: Market-Specific Kelly Fraction Tuning
**Impact:** Medium — optimized stake sizing per market type  
**Files:** `kelly_optimizer.py:16`  

**Current state:** All markets use the same 25% fractional Kelly. But different markets have different variance profiles — Over 2.5 has higher variance than Home Win, so should use a lower fraction.

**Implementation:**
```python
MARKET_KELLY_FRACTIONS = {
    "over25":  0.20,  # Over 2.5: moderate variance
    "over35":  0.15,  # Over 3.5: high variance
    "btts":    0.20,  # BTTS: moderate variance
    "home_win": 0.25, # Home Win: lower variance, full fraction
    "away_win": 0.20, # Away Win: moderate variance
    "draw":    0.15,  # Draw: highest variance in 1X2
    "under25": 0.25,  # Under 2.5: lower variance
    "under35": 0.25,  # Under 3.5: lower variance
    # Default: 0.25
}

fraction = MARKET_KELLY_FRACTIONS.get(_market_base(market), 0.25)
```

---

## PIPELINE HARDENING

### 🟡 HARDEN-1: Negative EV Detection Before Publish
**Severity:** Medium — grading engine detects negative EV, but predictions are already published  
**Files:** `quant_pipeline.py:406-407`  

**Problem:** `grading_engine.py:378-383` detects negative EV picks and marks them `no_bet`, but by then the prediction is already in Firestore and potentially displayed to users for 24+ hours.

**Fix:** Move the negative EV check to `quant_pipeline.py`, right after EV computation (after line 278):
```python
# After evaluate_all_markets, before saving to Firestore:
if best_bet and best_bet.expected_value < 0:
    best_bet = None
    category = "no_edge"
    value_rank = "none"
```
This prevents negative EV predictions from ever being published.

---

### 🟡 HARDEN-2: Add Prediction Confidence Interval
**Files:** `ev_engine.py`, `quant_pipeline.py`  

**Implementation:** Instead of publishing a single point probability, compute a 90% confidence interval:
```python
# Based on calibration tier:
if tier == "stable":
    margin = 0.03   # ±3%
elif tier == "watch":
    margin = 0.06   # ±6%
else:
    margin = 0.10   # ±10%

pred["prob_low"] = max(0.01, model_prob - margin)
pred["prob_high"] = min(0.99, model_prob + margin)
pred["prob_margin"] = margin
```
Frontend can display this as a confidence band on probability displays.

---

### 🟡 HARDEN-3: Integrate Backtester into CI/CD
**Files:** `backtester.py`, `.github/workflows/ci.yml`  

**Current state:** `backtester.py` exists (342 lines) but runs only manually.

**Implementation:**
1. Add a CI step that runs `python backtester.py --days 7` on every PR
2. Fail the build if 7-day hit rate drops below 45% or ROI goes negative
3. This catches model regression before it reaches production
4. Store backtest results as CI artifacts for trend analysis

---

## SUMMARY

| ID | Description | Impact | Effort | Priority |
|---|---|---|---|---|
| FIX-1 | Double calibration on goals/BTTS | 🔴 Critical | 15 min | P0 |
| FIX-2 | League avg goals default 2.65 | 🟡 Medium | 30 min | P1 |
| FIX-3 | Grading engine redundant case checks | 🟡 Low | 5 min | P3 |
| IMPROVE-1 | Fotmob match-specific xG | 🟢 Very High | 4h | P1 |
| IMPROVE-2 | Weekly auto-recalibration | 🟢 High | 3h | P1 |
| IMPROVE-3 | Player-level injury impact | 🟢 Medium-High | 5h | P2 |
| IMPROVE-4 | Ensemble disagreement signal | 🟢 Medium | 2h | P2 |
| IMPROVE-5 | Time-decay form weighting | 🟢 Medium | 1h | P2 |
| IMPROVE-6 | Asian Handicap markets | 🟢 Medium | 3h | P3 |
| IMPROVE-7 | Market-specific Kelly fractions | 🟢 Medium | 1h | P2 |
| HARDEN-1 | Pre-publish negative EV filter | 🟡 Medium | 30 min | P1 |
| HARDEN-2 | Probability confidence intervals | 🟡 Low | 1h | P3 |
| HARDEN-3 | Backtester in CI/CD | 🟡 Medium | 2h | P2 |

**Total estimated effort:** ~23 hours across all items.

### Recommended Execution Order
1. **FIX-1** → deploy immediately (unblocks all goals/BTTS markets)
2. **FIX-2** → improves xG baseline for all leagues
3. **IMPROVE-1** → largest single accuracy gain (match-specific xG)
4. **IMPROVE-2** → prevents drift, enables continuous improvement
5. **HARDEN-1** → prevents bad predictions from reaching users
6. **IMPROVE-4** + **IMPROVE-5** + **IMPROVE-7** → model refinements (can be done in parallel)
7. **IMPROVE-3** → requires most work but adds unique edge
8. **HARDEN-3** → safety net for future changes
9. **IMPROVE-6** + **HARDEN-2** + **FIX-3** → polish
