"""
kelly_optimizer.py
──────────────────
Kelly Criterion optimal stake calculator.

f* = (b × p − q) / b
where:
  b = net odds (decimal odds − 1)
  p = probability of winning
  q = probability of losing (1 − p)

A fractional Kelly (25%) is used to be conservative.
Max stake capped at 5% of bankroll.
"""


# ── Constants ─────────────────────────────────────────────────────────────────
KELLY_FRACTION = 0.25     # Use 1/4 Kelly for conservatism
MAX_STAKE_PCT = 0.05      # Hard cap at 5% of bankroll
MIN_STAKE_PCT = 0.005     # Minimum stake: 0.5%


def kelly_stake(probability: float, decimal_odds: float, fraction: float = KELLY_FRACTION) -> float:
    """
    Compute optimal stake as a fraction of bankroll (0–1 scale).

    Args:
        probability: Model probability of winning (0–1)
        decimal_odds: Bookmaker decimal odds (e.g. 1.85)
        fraction: Kelly multiplier (default 0.25 = quarter-Kelly)

    Returns:
        Recommended stake as fraction of bankroll.
        Returns 0.0 if Kelly is negative (no edge).
    """
    if decimal_odds <= 1.0 or probability <= 0 or probability >= 1:
        return 0.0

    b = decimal_odds - 1.0   # Net profit per unit staked on a win
    p = probability
    q = 1.0 - p

    full_kelly = (b * p - q) / b

    if full_kelly <= 0:
        return 0.0  # No mathematical edge

    frac_kelly = full_kelly * fraction

    # Clamp to [0, MAX_STAKE_PCT] — do NOT enforce a minimum floor.
    # Forcing MIN_STAKE_PCT=0.5% would place bets even when edge rounds to near-zero.
    return round(min(MAX_STAKE_PCT, frac_kelly), 4)


def kelly_stake_pct(probability: float, decimal_odds: float) -> float:
    """Return stake as a percentage string-ready value (0–100 scale)."""
    return round(kelly_stake(probability, decimal_odds) * 100, 2)


def recommended_stake_amount(probability: float, decimal_odds: float, bankroll: float) -> dict:
    """
    Return full stake recommendation with amounts.

    Returns:
        {
          stake_pct: float    # e.g. 2.5 (percent)
          stake_amount: float  # e.g. 25.00 (currency)
          potential_profit: float
          potential_return: float
        }
    """
    pct = kelly_stake(probability, decimal_odds)
    amount = bankroll * pct
    profit = amount * (decimal_odds - 1.0)
    total_return = amount * decimal_odds

    return {
        "stake_pct": round(pct * 100, 2),
        "stake_amount": round(amount, 2),
        "potential_profit": round(profit, 2),
        "potential_return": round(total_return, 2),
    }


if __name__ == "__main__":
    # Arsenal to win at 1.85 with 63% model prob
    prob = 0.63
    odds = 1.85
    pct = kelly_stake_pct(prob, odds)
    print(f"Kelly stake: {pct:.2f}%")
    reco = recommended_stake_amount(prob, odds, 10000)
    print(f"On ₦10,000 bankroll: Stake ₦{reco['stake_amount']:.2f} → Potential profit ₦{reco['potential_profit']:.2f}")
