# Vantage AI — MiniMax 2.8: Strategy Calibration Audit

> **Date**: June 2026  
> **Supersedes**: `MINIMAX_2_7_IMPLEMENTATION_PLAN.md`  
> **Scope**: Fix overconfidence from calibration/data-quality assumptions before the strategy goes live with World Cup data.

---

## Claim Validation

Each claim from the audit was verified against the actual codebase:

### Claim 1: Double Calibration — CONFIRMED

| Location | What | Purpose |
|----------|------|---------|
| `probability_engine.py:48` | `MARKET_CALIBRATION` (11 market factors, e.g. Away Win × 0.80) | "Corrects systematic overconfidence in Poisson-derived probabilities" |
| `ev_engine.py:44` | `MARKET_PROBABILITY_HAIRCUTS` (13 market factors, e.g. Away Win × 0.84) | "Final market-specific probability haircuts before EV/Kelly" |

**Result**: An "Away Win" probability of 0.65 gets calibrated to `0.65 × 0.80 = 0.52` in probability_engine.py, then haircut again to `0.52 × 0.84 = 0.44` in ev_engine.py. Each layer independently applies its own discount with no coordination. Combined haircut is `0.80 × 0.84 = 0.67`, a 33% reduction from the raw model output.

### Claim 2: Confidence = Model Probability — CONFIRMED

`quant_pipeline.py:382`:
```python
"confidence": round(best_bet.model_prob * 100, 1) if best_bet else 0,
```

This is literally `probability × 100` with a misleading label. The frontend uses this field in several places (VIP page, ticket wizard, accumulator modal) as a "confidence" indicator when it's just the hit probability.

### Claim 3: valid_backtest Not the Authority — CONFIRMED

| Tool | File | Approach | Risk |
|------|------|----------|------|
| Valid backtest | `valid_backtest.py:113` | Only pre-kickoff graded bets, 30-min cutoff, daily exposure caps | Conservative, trustworthy |
| Grid search | `grid_search.py:69` | Replays historical fixtures with exhaustive parameter combinations | Can overfit to historical data |
| Vault simulator | `vault_simulator.py:247` | Full replay using identical pipeline | No lookahead guard, relies on API-cached data |

### Claim 4: Tier 5 Leagues Not Excluded From Vault — CONFIRMED

`data_pipeline.py:1040` — When approved fixture count is < 15, the fallback assigns `"league_tier": 5` to any league with odds. 

`quant_pipeline.py:341-347` — Vault eligibility checks only `odds > 1.0`, `odds_fresh`, `category in (safe, value)`, and `value_rank in (high, medium)`. It does NOT check `league_tier`. A Tier 5/unknown league bet can qualify for vault.

### Claim 5: Accumulator Thresholds Relaxed From Original — CONFIRMED

`accumulator_engine.py:27-28`:
```python
"min_prob": 0.55,           # Relaxed from 0.60
"min_combined_odds": 1.50,  # Relaxed from 2.00
```
And `accumulator_engine.py:38-39`:
```python
"min_prob": 0.50,           # Relaxed from implicit higher
"min_combined_odds": 2.00,  # Relaxed from 2.50
```

### Claim 6: Odds Freshness Tracks Fetch Time, Not Bookmaker Update Time — CONFIRMED

`data_pipeline.py:303`:
```python
odds_fetched_at=datetime.now(timezone.utc).isoformat()
```

This records when the pipeline fetched odds from The Odds API, not when the bookmaker last updated their line. Opening odds are the minimum price seen across bookmakers (`data_pipeline.py:650-726`), not a guaranteed time-ordered opening line.

---

## Implementation Plan — 8 Tasks

### TASK 1: Consolidate Calibration Into One Module

**File: NEW** `backend/quant/calibration_registry.py`

**Problem**: Two independent calibration layers apply stacked haircuts with no versioning, sample sizes, or last-updated tracking.

**Action**: Create a single calibration registry that both `probability_engine.py` and `ev_engine.py` read from. Remove `MARKET_PROBABILITY_HAIRCUTS` from `ev_engine.py`.

```python
"""
calibration_registry.py
───────────────────────
Single source of truth for all probability calibration factors.
Versioned, with sample sizes and last-updated dates for auditability.
"""

from datetime import datetime, timezone

# Version: increment when factors change after a backtest
CALIBRATION_VERSION = "2026-06-15-v1"
CALIBRATION_LAST_UPDATED = datetime(2026, 6, 15, tzinfo=timezone.utc).isoformat()

# Each entry: (avg_predicted, avg_actual, discount_factor, sample_size, last_updated)
MARKET_FACTORS = {
    "over25":             (0.92, 0.82, 0.89, 120, "2026-06-15"),
    "under25":            (0.08, 0.18, 1.00, 120, "2026-06-15"),
    "over15":             (0.85, 0.80, 0.94, 200, "2026-06-15"),
    "under15":            (0.15, 0.43, 1.00, 200, "2026-06-15"),
    "over35":             (0.75, 0.64, 0.86, 90,  "2026-06-15"),
    "under35":            (0.25, 0.36, 1.00, 90,  "2026-06-15"),
    "btts":               (0.55, 0.55, 0.95, 150, "2026-06-15"),
    "btts_no":            (0.45, 0.42, 0.93, 150, "2026-06-15"),
    "home_win":           (0.65, 0.65, 0.95, 300, "2026-06-15"),
    "away_win":           (0.65, 0.44, 0.80, 300, "2026-06-15"),
    "draw":               (0.22, 0.22, 0.90, 300, "2026-06-15"),
    "AH Away +0.5":       (0.55, 0.50, 0.90, 50,  "2026-06-15"),
    "Double Chance (X2)": (0.60, 0.55, 0.92, 50,  "2026-06-15"),
    "Draw No Bet (Away)": (0.50, 0.45, 0.90, 50,  "2026-06-15"),
}

def get_calibration_factor(market_key: str, default: float = 0.95) -> float:
    """Return the single authoritative calibration factor for a market."""
    entry = MARKET_FACTORS.get(market_key)
    if entry:
        return entry[2]
    return default

def get_calibration_metadata(market_key: str) -> dict:
    """Return full metadata for audit trail."""
    entry = MARKET_FACTORS.get(market_key)
    if entry:
        return {
            "avg_predicted": entry[0],
            "avg_actual": entry[1],
            "discount_factor": entry[2],
            "sample_size": entry[3],
            "last_updated": entry[4],
        }
    return {"discount_factor": 0.95, "sample_size": 0, "note": "default"}
```

**Edit `probability_engine.py`**: Import from calibration_registry instead of local MARKET_CALIBRATION.

```python
# Replace lines 48-61 (MARKET_CALIBRATION dict) with:
from calibration_registry import get_calibration_factor, CALIBRATION_VERSION

def _calibrate(raw: float, market_key: str, default: float = 0.92) -> float:
    factor = get_calibration_factor(market_key, default)
    return max(0.01, min(0.99, raw * factor))
```

**Edit `ev_engine.py`**: Remove lines 44-57 (MARKET_PROBABILITY_HAIRCUTS) and merge into calibration_registry. Update `calibrate_market_probability()` to use the registry.

```python
# Replace lines 44-57 with:
from calibration_registry import get_calibration_factor

def calibrate_market_probability(raw_prob: float, market: str) -> tuple[float, float, str]:
    factor = get_calibration_factor(_market_to_key(market), 0.97)
    calibrated = max(0.01, min(0.99, raw_prob * factor))
    return calibrated, factor, CALIBRATION_VERSION
```

**Validation**: Run `python quant_pipeline.py 2026-06-16 --dry-run`. Compare the `calibration_factor` field in output — should be a single value, not a product of two haircuts.

---

### TASK 2: Replace "Confidence" with Proper Metrics

**File**: `backend/quant/quant_pipeline.py`

**Problem**: `confidence` = `model_prob * 100` is misleading. The frontend displays it as if it's a confidence score.

**Action**: Add three separate fields and deprecate the old `confidence` field (keep for backward compatibility).

In the prediction dict (around line 382), replace the confidence line:

```python
# Replace line 382:
"confidence": round(best_bet.model_prob * 100, 1) if best_bet else 0,

# With:
"probability": round(best_bet.model_prob, 4) if best_bet else 0,
"confidence": round(best_bet.model_prob * 100, 1) if best_bet else 0,  # kept for UI compat
"model_agreement": round(best_bet.confidence_score, 2) if best_bet else 0,  # Poisson/Elo/Form agreement
"data_quality": round(_data_quality_score(match, best_bet, odds_fresh), 2) if best_bet else 0,
```

Add the helper function in `quant_pipeline.py`:

```python
def _data_quality_score(match, best_bet, odds_fresh: bool) -> float:
    """Score 0-1 based on data quality factors."""
    score = 1.0
    if not odds_fresh: score -= 0.15
    if match.league_tier >= 4: score -= 0.10
    if match.league_tier == 5: score -= 0.15
    if not hasattr(match, 'home_stats') or not match.home_stats or match.home_stats.matches_analyzed < 5:
        score -= 0.10
    if not best_bet or best_bet.odds <= 1.0: score -= 0.20
    if getattr(match, 'provider_source', '') == 'api_football': score -= 0.05
    return max(0.0, round(score, 2))
```

**Validation**: Check the output JSON has `model_agreement` and `data_quality` fields beside `confidence`.

---

### TASK 3: Make valid_backtest the Official Report

**File**: `backend/quant/valid_backtest.py`

**Problem**: Multiple backtesting tools exist (grid_search, vault_simulator, replay_engine, valid_backtest) with no clear authority.

**Action**: Add an export that generates a report suitable for display in the admin panel. No code changes to the backtest logic itself — it's already the most conservative tool.

Add a report export function (at the end of `valid_backtest.py`):

```python
def export_valid_report(days: int = 30, bankroll: float = 10000.0) -> dict:
    """Run a valid backtest and return a JSON-serializable report dict.
    This is the OFFICIAL performance report for the strategy.
    """
    docs = load_firestore(days)
    bets, rejected = extract_valid_bets(docs)
    if not bets:
        return {"status": "no_valid_bets", "days_scanned": days, "rejected": rejected.to_dict()}
    result = run_simulation(bets, starting_bankroll=bankroll)
    return {
        "status": "success",
        "days_scanned": days,
        "active_days": result.active_days,
        "total_bets": result.total_bets,
        "wins": result.wins,
        "losses": result.losses,
        "voids": result.voids,
        "hit_rate": round(result.hit_rate, 4),
        "starting_bankroll": bankroll,
        "final_bankroll": round(result.final_bankroll, 2),
        "roi": round(result.roi, 4),
        "max_drawdown": round(result.max_drawdown, 4),
        "avg_clv": round(result.avg_clv, 4),
        "rejected": rejected.to_dict(),
        "valid": result.is_valid,
        "validation_issues": result.validation_issues,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "backtest_version": "valid-v2",
    }
```

Add a `to_dict()` method to the `RejectionStats` dataclass.

**Validation**: Run `python valid_backtest.py` and confirm the output is a clean JSON report.

---

### TASK 4: Exclude Tier 5 From vault_eligible

**File**: `backend/quant/quant_pipeline.py`

**Problem**: Unknown/tier-5 leagues are not excluded from vault eligibility.

**Action**: Add `league_tier < 5` to the vault_eligible check.

```python
# Line 341-347 — add league_tier check:
vault_eligible = bool(
    best_bet
    and best_bet.odds > 1.0
    and odds_fresh
    and category in ("safe", "value")
    and value_rank in ("high", "medium")
    and match.league_tier < 5        # <── ADD THIS
)
```

Same change in vault_simulator.py line 264 (add `pred.get("league_tier", 5) < 5` to the filter).

**Validation**: Run the pipeline with a tier-5 league present. Confirm vault_eligible is False for those bets.

---

### TASK 5: Mark Accumulators as High Variance

**File**: `backend/quant/accumulator_engine.py`

**Problem**: Accumulators are not clearly marked as high variance / entertainment. The current labeling doesn't distinguish them from single bets.

**Action**: Add a `risk_warning` field to each tier config and propagate it to the output.

```python
# Add to each tier in TIER_CONFIG (line 20):
"baseline": {
    ...
    "count": 1,
    "risk_level": "moderate",        # <── add
    "risk_warning": "Multi-leg — higher variance than single bets.",
},
"alpha_edge": {
    ...
    "count": 1,
    "risk_level": "high",            # <── add
    "risk_warning": "EV-optimized — combines uncorrelated edges but variance compounds.",
},
"syndicate": {
    ...
    "risk_level": "very_high",       # <── add
    "risk_warning": "High-risk — for entertainment only. Do NOT stake from core bankroll.",
},
"variance_play": {
    ...
    "risk_level": "extreme",         # <── add
    "risk_warning": "Extreme variance — 5-leg accumulator. Bankroll suicide without separate bankroll.",
},
```

Propagate risk_level and risk_warning to the output dict in `_build_accumulator_output()`.

**Validation**: Check accumulator output JSON includes `risk_level` and `risk_warning` fields.

---

### TASK 6: Add Bookmaker Update Time to Odds

**File**: `backend/quant/free_data_client.py`

**Problem**: `odds_fetched_at` records when we fetched, not when the bookmaker last updated. The Odds API provides `last_update` per bookmaker.

**Action**: Extract the latest `last_update` across bookmakers and store it.

In `_parse_odds_api_response()`, after the existing parsing loop, add:

```python
# Track the latest bookmaker update time
    latest_update = ""
    for bookmaker in game.get("bookmakers", []):
        lu = bookmaker.get("last_update", "")
        if lu > latest_update:
            latest_update = lu
    result["odds_last_bookmaker_update"] = latest_update
```

Also add this field to the `OddsData` dataclass in `data_pipeline.py`:

```python
@dataclass
class OddsData:
    # ... existing fields ...
    odds_last_bookmaker_update: str = ""  # <── ADD
```

Update the free stack odds construction in `fetch_matches_free()`:

```python
od = OddsData(
    # ... existing fields ...
    odds_last_bookmaker_update=odds_dict.get("odds_last_bookmaker_update", ""),
)
```

**Validation**: Run the pipeline and check that `odds_last_bookmaker_update` contains a timestamp.

---

### TASK 7: Update TypeScript Types for New Fields

**File**: `types.ts`

**Problem**: New fields (`model_agreement`, `data_quality`, `risk_level`, `risk_warning`, `odds_last_bookmaker_update`) need TypeScript types.

**Action**: Add fields to the `Match` interface and accumulator types in `types.ts`:

```typescript
// Add to Match interface (around line 60):
model_agreement?: number;        // 0-1 Poisson/Elo/Form agreement
data_quality?: number;           // 0-1 data quality score
odds_last_bookmaker_update?: string;  // ISO timestamp

// Add to AccumulatorTicket interface (around line 207):
risk_level?: string;             // moderate/high/very_high/extreme
risk_warning?: string;           // human-readable warning
```

**Validation**: `npx tsc --noEmit` passes.

---

### TASK 8: Add data_quality to the UI Decision

**File**: `components/Screener.tsx` and `components/VaultTab.tsx`

**Problem**: The frontend doesn't display data quality at all. When confidence shows 78% but data_quality is 0.45, users are misled.

**Action**: In the Screener and VaultTab, show data_quality as a visual indicator when sorting/filtering.

In `Screener.tsx`, add a column or badge:

```tsx
// In the bet row, after EV display:
{m.data_quality !== undefined && m.data_quality < 0.6 && (
  <span className="text-[10px] text-amber-500 ml-1" title="Low data quality">
    ⚠️
  </span>
)}
```

In `VaultTab.tsx`, exclude picks with `data_quality < 0.50` from vault selection:

```typescript
// In selectVaultPicks or isVaultEligible:
const isVaultEligible = (match) => {
    // ... existing checks ...
    if (match.data_quality !== undefined && match.data_quality < 0.50) return false;
    return true;
};
```

**Validation**: A vault pick with low data quality should either show a warning or be excluded.

---

## Summary

| Task | File(s) | Lines Changed | Priority |
|------|---------|--------------|----------|
| 1. Consolidate calibration | `calibration_registry.py` (NEW), `probability_engine.py`, `ev_engine.py` | ~40 added, ~30 removed | P0 |
| 2. Proper confidence metrics | `quant_pipeline.py` | ~15 added | P0 |
| 3. Official backtest report | `valid_backtest.py` | ~30 added | P0 |
| 4. Exclude tier 5 from vault | `quant_pipeline.py`, `vault_simulator.py` | 2 lines | P1 |
| 5. Accumulator risk labels | `accumulator_engine.py` | ~20 added | P1 |
| 6. Bookmaker update time | `free_data_client.py`, `data_pipeline.py` | ~10 added | P2 |
| 7. TypeScript types | `types.ts` | ~8 added | P1 |
| 8. UI data quality display | `Screener.tsx`, `VaultTab.tsx` | ~15 added | P2 |

## Pre-Deploy Validation Checklist

```
[ ] Task 1: Away Win calibration_factor is a single value (not product of two)
[ ] Task 2: model_agreement and data_quality present in pipeline output JSON
[ ] Task 3: valid_backtest.py returns clean JSON report
[ ] Task 4: Tier-5 league bet has vault_eligible=false
[ ] Task 5: Accumulator output includes risk_level and risk_warning
[ ] Task 6: odds_last_bookmaker_update populated in OddsData
[ ] Task 7: tsc --noEmit passes
[ ] Task 8: Low data_quality picks show warning in UI
```
