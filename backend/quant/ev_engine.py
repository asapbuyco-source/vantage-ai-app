"""
ev_engine.py
─────────────
Expected Value engine + market inefficiency detection.

EV = (model_probability × decimal_odds) − 1
Flag a bet if:
  EV ≥ 0.05  (5% minimum edge)
  model_prob - market_implied_prob ≥ 0.06  (6% inefficiency)
"""

from dataclasses import dataclass
from typing import Optional
from probability_engine import CombinedProbabilities
from data_pipeline import OddsData


# ── Constants ─────────────────────────────────────────────────────────────────
MIN_EV = 0.05           # 5% minimum expected value
MIN_INEFFICIENCY = 0.06  # 6% model vs market gap


# ── Market → probability mapping ───────────────────────────────────────────────
MARKET_TO_PROB = {
    "Home Win": "home_win",
    "Away Win": "away_win",
    "Draw": "draw",
    "Double Chance (1X)": "double_chance_1x",
    "Double Chance (X2)": "double_chance_x2",
    "Double Chance (12)": "double_chance_12",
    "Draw No Bet (Home)": "draw_no_bet_home",
    "Draw No Bet (Away)": "draw_no_bet_away",
    "Over 1.5 Goals": "over15",
    "Over 2.5 Goals": "over25",
    "Under 2.5 Goals": "under25",
    "Over 3.5 Goals": "over35",
    "Under 3.5 Goals": "under35",
    "BTTS": "btts",
    "BTTS No": "btts_no",
}

# Market → odds field in OddsData
MARKET_TO_ODDS_FIELD = {
    "Home Win": "home_odds",
    "Away Win": "away_odds",
    "Draw": "draw_odds",
    "Double Chance (1X)": "home_odds",     # Approx — 1X is almost always cheaper than DC spec
    "Double Chance (X2)": "away_odds",
    "Double Chance (12)": "home_odds",
    "Draw No Bet (Home)": "home_odds",
    "Draw No Bet (Away)": "away_odds",
    "Over 1.5 Goals": "over25_odds",       # Use over25 as fallback
    "Over 2.5 Goals": "over25_odds",
    "Under 2.5 Goals": "under25_odds",
    "Over 3.5 Goals": "over25_odds",
    "Under 3.5 Goals": "under25_odds",
    "BTTS": "btts_yes_odds",
    "BTTS No": "btts_no_odds",
}


@dataclass
class ValueBet:
    market: str
    bet_label: str          # Human-readable e.g. "Home Win"
    model_prob: float       # Our model's probability
    market_prob: float      # Implied by bookmaker odds
    odds: float             # Decimal odds
    expected_value: float   # EV (positive = value)
    inefficiency: float     # model_prob - market_prob
    is_value: bool          # Passes all filters


def implied_prob(odds: float) -> float:
    """Convert decimal odds to implied probability (with vig removed simply)."""
    if odds <= 1.0:
        return 1.0
    return 1.0 / odds


def compute_ev(model_prob: float, odds: float) -> float:
    """EV = (prob × odds) − 1"""
    return (model_prob * odds) - 1.0


def evaluate_all_markets(
    probs: CombinedProbabilities,
    odds: OddsData,
) -> list[ValueBet]:
    """
    Evaluate all available markets and return all ValueBet objects.
    Only markets with odds > 1.05 are evaluated.
    """
    results: list[ValueBet] = []

    for market, prob_attr in MARKET_TO_PROB.items():
        model_prob = getattr(probs, prob_attr, None)
        if model_prob is None:
            continue

        odds_attr = MARKET_TO_ODDS_FIELD.get(market, "")
        market_odds = getattr(odds, odds_attr, 0.0) if odds_attr else 0.0

        # Skip if no market odds
        if market_odds <= 1.05:
            continue

        mkt_prob = implied_prob(market_odds)
        ev = compute_ev(model_prob, market_odds)
        inefficiency = model_prob - mkt_prob

        is_value = (ev >= MIN_EV) and (inefficiency >= MIN_INEFFICIENCY)

        results.append(ValueBet(
            market=market,
            bet_label=market,
            model_prob=round(model_prob, 4),
            market_prob=round(mkt_prob, 4),
            odds=round(market_odds, 2),
            expected_value=round(ev, 4),
            inefficiency=round(inefficiency, 4),
            is_value=is_value,
        ))

    # Sort by EV descending
    results.sort(key=lambda x: x.expected_value, reverse=True)
    return results


def get_best_value_bet(
    probs: CombinedProbabilities,
    odds: OddsData,
) -> Optional[ValueBet]:
    """
    Return the single best value bet (highest EV that passes all filters).
    Returns None if no value found.
    """
    all_bets = evaluate_all_markets(probs, odds)
    for bet in all_bets:
        if bet.is_value:
            return bet
    return None


if __name__ == "__main__":
    from data_pipeline import OddsData
    from probability_engine import CombinedProbabilities

    # Mock test
    probs = CombinedProbabilities(
        home_win=0.63, draw=0.22, away_win=0.15,
        over25=0.60, under25=0.40, btts=0.55, btts_no=0.45,
        double_chance_1x=0.85, double_chance_x2=0.37, double_chance_12=0.78,
        draw_no_bet_home=0.71, draw_no_bet_away=0.29,
    )
    odds = OddsData(home_odds=1.85, draw_odds=3.60, away_odds=5.00,
                    over25_odds=1.90, under25_odds=1.95,
                    btts_yes_odds=1.85, btts_no_odds=1.95)

    bet = get_best_value_bet(probs, odds)
    if bet:
        print(f"Best bet: {bet.market} | Model: {bet.model_prob:.1%} | Market: {bet.market_prob:.1%} | EV: {bet.expected_value:.1%} | Odds: {bet.odds}")
    else:
        print("No value bet found.")
