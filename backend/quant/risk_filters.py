"""
risk_filters.py
───────────────
Strict bet risk filters. A bet must pass ALL conditions to be accepted.

Reject if:
  probability < 0.55  (55% confidence floor)
  EV < 0.05           (5% minimum edge)
  odds > 3.50         (excessive odds)
  odds < 1.30         (too short, poor risk/reward)
"""

from dataclasses import dataclass
from ev_engine import ValueBet


# ── Filter thresholds ──────────────────────────────────────────────────────────
MIN_PROBABILITY = 0.55     # Minimum model probability
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
        t_min_prob = 0.58  # 58% floor for Tier 3
        t_min_ev = 0.06    # 6% edge for Tier 3
    elif league_tier >= 4:
        t_min_prob = 0.62  # 62% floor for Tier 4 (high noise)
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
