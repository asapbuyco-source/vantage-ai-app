"""
calibration_registry.py
────────────────────────
Single source of truth for all probability calibration factors.
Versioned, with sample sizes and last-updated dates for auditability.

Replaces the split calibration that existed across:
  - probability_engine.py: MARKET_CALIBRATION  (goals/BTTS primary)
  - ev_engine.py:          MARKET_PROBABILITY_HAIRCUTS  (result markets)

The old split applied two independent haircuts to some markets (e.g. Away Win:
0.65 → 0.52 via probability_engine.py, then 0.52 → 0.44 via ev_engine.py).
This registry provides a single authoritative factor per market.

Version history:
  2026-06-15-v1  Initial — consolidated from probability_engine + ev_engine
"""

from datetime import datetime, timezone

CALIBRATION_VERSION = "2026-06-25-v2"
CALIBRATION_LAST_UPDATED = datetime(2026, 6, 25, tzinfo=timezone.utc).isoformat()

MARKET_FACTORS = {
    # key: (avg_predicted, avg_actual, discount_factor, sample_size, last_updated)
    # ── Goals markets (updated from 30-day backtest — see prediction_strategy_audit.md) ──
    "over25":  (0.88, 0.82, 0.82, 130, "2026-06-25"),  # v1: 0.89 → reduced after double-cal fix uncovered overconfidence
    "under25": (0.12, 0.18, 1.00, 130, "2026-06-25"),
    "over15":  (0.84, 0.72, 0.86, 210, "2026-06-25"),  # v1: 0.94 → 72.1% hit rate in backtest, was far too generous
    "under15": (0.16, 0.28, 1.00, 210, "2026-06-25"),
    "over35":  (0.75, 0.50, 0.72,  95, "2026-06-25"),  # v1: 0.86 → insufficient sample, conservative downgrade
    "under35": (0.38, 0.50, 0.85,  95, "2026-06-25"),  # v1: 1.00 → 37.5% hit rate (was predicting ~55%), needs big cut
    "btts":    (0.57, 0.50, 0.87, 160, "2026-06-25"),  # v1: 0.95 → 50.0% hit rate, was too generous
    "btts_no": (0.43, 0.50, 0.90, 160, "2026-06-25"),  # v1: 0.93 → mild adjustment
    # ── Result markets (updated from backtest — catastrophic -43% ROI, suppressed from bets) ──
    "home_win": (0.60, 0.21, 0.37, 314, "2026-06-25"),  # v1: 0.95 → 21.4% hit rate! Severe overconfidence exposed.
    "away_win": (0.50, 0.14, 0.27, 314, "2026-06-25"),  # v1: 0.80 → 13.6% hit rate! Model cannot predict winners.
    "draw":     (0.22, 0.22, 0.90, 314, "2026-06-25"),  # v1: 0.90 → no change (draw model is reasonably calibrated)
    # ── Derived/composite markets ────────────────────────────────────────────────
    "AH Away +0.5":       (0.55, 0.50, 0.90,  50, "2026-06-25"),
    "Double Chance (X2)": (0.60, 0.55, 0.92,  50, "2026-06-25"),
    "Draw No Bet (Away)": (0.50, 0.45, 0.90,  50, "2026-06-25"),
}

FRAGILE_MARKETS = {"home_win", "away_win", "draw", "btts_no", "over35", "under35"}


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


def get_calibration_tier(market_key: str) -> str:
    """Return trust tier for display."""
    if market_key in FRAGILE_MARKETS:
        return "fragile"
    factor = get_calibration_factor(market_key, 0.97)
    if factor < 0.95:
        return "watch"
    return "stable"