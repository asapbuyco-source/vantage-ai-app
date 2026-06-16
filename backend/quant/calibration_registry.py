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

CALIBRATION_VERSION = "2026-06-15-v1"
CALIBRATION_LAST_UPDATED = datetime(2026, 6, 15, tzinfo=timezone.utc).isoformat()

MARKET_FACTORS = {
    # key: (avg_predicted, avg_actual, discount_factor, sample_size, last_updated)
    # ── Goals markets (from probability_engine.py MARKET_CALIBRATION) ──────────
    "over25":  (0.92, 0.82, 0.89, 120, "2026-06-15"),
    "under25": (0.08, 0.18, 1.00, 120, "2026-06-15"),
    "over15":  (0.85, 0.80, 0.94, 200, "2026-06-15"),
    "under15": (0.15, 0.43, 1.00, 200, "2026-06-15"),
    "over35":  (0.75, 0.64, 0.86,  90, "2026-06-15"),
    "under35": (0.25, 0.36, 1.00,  90, "2026-06-15"),
    "btts":    (0.55, 0.55, 0.95, 150, "2026-06-15"),
    "btts_no": (0.45, 0.42, 0.93, 150, "2026-06-15"),
    # ── Result markets ─────────────────────────────────────────────────────────
    "home_win": (0.65, 0.65, 0.95, 300, "2026-06-15"),
    "away_win": (0.65, 0.44, 0.80, 300, "2026-06-15"),  # conservative — model was 44% actual
    "draw":     (0.22, 0.22, 0.90, 300, "2026-06-15"),
    # ── Derived/composite markets (from ev_engine.py MARKET_PROBABILITY_HAIRCUTS) ─
    "AH Away +0.5":       (0.55, 0.50, 0.90,  50, "2026-06-15"),
    "Double Chance (X2)": (0.60, 0.55, 0.92,  50, "2026-06-15"),
    "Draw No Bet (Away)": (0.50, 0.45, 0.90,  50, "2026-06-15"),
}

FRAGILE_MARKETS = {"away_win", "draw", "btts_no", "over35"}


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