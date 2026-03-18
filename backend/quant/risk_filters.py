"""
risk_filters.py
───────────────
Strict bet risk filters. A bet must pass ALL conditions to be accepted.

Reject if:
  probability < 0.40  (40% confidence floor, tiered by league)
  EV < 0.05           (5% minimum edge)
  odds > 3.50         (excessive odds)
  odds < 1.30         (too short, poor risk/reward)

Upgrade #8: Odds staleness guard — demotes bets with stale odds.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from ev_engine import ValueBet


# ── Filter thresholds ──────────────────────────────────────────────────────────
MIN_PROBABILITY = 0.40     # Lowered from 0.55 — let EV/inefficiency filters guard quality
MIN_EV = 0.05              # Minimum expected value (5%)
MAX_ODDS = 3.50            # Reject high-risk outliers
MIN_ODDS = 1.30            # Reject near-certainty bets (usually no edge)
MIN_INEFFICIENCY = 0.04    # Model must differ from market by at least 4%


@dataclass
class FilterResult:
    passed: bool
    reason: str | None = None  # Why it failed (if it did)


def apply_filters(bet: ValueBet, league_tier: int = 1) -> FilterResult:
    """
    Run all risk filters on a single ValueBet, with thresholds
    adjusting based on the league tier (safety first).
    """
    # ── Tier-based dynamic thresholds ──────────────────────────────────────────
    t_min_prob = MIN_PROBABILITY
    t_min_ev = MIN_EV

    if league_tier == 3:
        t_min_prob = 0.45  # 45% floor for Tier 3
        t_min_ev = 0.06    # 6% edge for Tier 3
    elif league_tier >= 4:
        t_min_prob = 0.50  # 50% floor for Tier 4 (high noise)
        t_min_ev = 0.08    # 8% edge for Tier 4

    # ── Logic ──────────────────────────────────────────────────────────────────
    if bet.odds < MIN_ODDS:
        return FilterResult(False, f"Odds too low ({bet.odds:.2f} < {MIN_ODDS})")

    if bet.odds > MAX_ODDS:
        return FilterResult(False, f"Odds too high ({bet.odds:.2f} > {MAX_ODDS})")

    if bet.model_prob < t_min_prob:
        return FilterResult(False, f"Probability too low for Tier {league_tier} ({bet.model_prob:.1%} < {t_min_prob:.0%})")

    if bet.expected_value < t_min_ev:
        return FilterResult(False, f"EV too low for Tier {league_tier} ({bet.expected_value:.1%} < {t_min_ev:.0%})")

    if bet.inefficiency < MIN_INEFFICIENCY:
        return FilterResult(False, f"Market inefficiency too small ({bet.inefficiency:.1%} < {MIN_INEFFICIENCY:.0%})")

    return FilterResult(True)


def check_odds_staleness(odds_fetched_at: str, max_hours: float = 2.0) -> float:
    """
    Upgrade #8: Check if odds are stale.
    Returns a Kelly multiplier:
      1.0  = fresh odds (< max_hours old)
      0.5  = stale odds (> max_hours old)
      0.25 = very stale odds (> 2x max_hours old)
    """
    if not odds_fetched_at:
        return 0.75  # No timestamp = assume mildly stale
    try:
        fetched = datetime.fromisoformat(odds_fetched_at.replace("Z", "+00:00"))
        age_hours = (datetime.now(timezone.utc) - fetched).total_seconds() / 3600
        if age_hours > max_hours * 2:
            return 0.25  # Very stale
        elif age_hours > max_hours:
            return 0.5   # Stale
        return 1.0       # Fresh
    except Exception:
        return 0.75  # Parse error = assume mildly stale


def filter_bets(bets: list[ValueBet], league_tier: int = 1) -> list[ValueBet]:
    """
    Filter a list of bets.
    Returns only those that pass all risk filters, sorted by EV descending.
    """
    passed = []
    for bet in bets:
        result = apply_filters(bet, league_tier)
        if result.passed:
            passed.append(bet)
        else:
            pass  # Silently drop (logged at pipeline level)
    return sorted(passed, key=lambda b: b.expected_value, reverse=True)


def grade_risk(bet: ValueBet) -> str:
    """
    Map a bet to a display category.
    safe  → confidence ≥ 70% and EV ≥ 8%
    value → confidence ≥ 60% and EV ≥ 5%
    risky → confidence < 60%
    """
    if bet.model_prob >= 0.70 and bet.expected_value >= 0.08:
        return "safe"
    if bet.model_prob >= 0.60:
        return "value"
    return "risky"


if __name__ == "__main__":
    from ev_engine import ValueBet
    sample = [
        ValueBet("Home Win", "Home Win", 0.63, 0.54, 1.85, 0.166, 0.09, True),
        ValueBet("Away Win", "Away Win", 0.50, 0.42, 2.40, 0.20, 0.08, True),
        ValueBet("Draw", "Draw", 0.22, 0.28, 3.60, -0.21, -0.06, False),
    ]
    approved = filter_bets(sample)
    print(f"Approved: {len(approved)}")
    for b in approved:
        print(f"  {b.market}: {b.model_prob:.1%} prob | EV {b.expected_value:.1%} | {grade_risk(b)}")
