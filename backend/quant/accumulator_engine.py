"""
accumulator_engine.py
──────────────────────
Automatically generates accumulators from filtered value bets.

Rules:
  - Max 4 selections per accumulator
  - No two legs from the same fixture
  - Minimum combined odds: 2.00 for safe, 3.50 for value
  - Three tiers: safe (prob ≥ 0.68), value (prob ≥ 0.58), risky (all)
"""

from dataclasses import dataclass, field
from itertools import combinations
from ev_engine import ValueBet


# ── Accumulator config ─────────────────────────────────────────────────────────
MAX_LEGS = 4
MIN_COMBINED_ODDS_SAFE = 2.00
MIN_COMBINED_ODDS_VALUE = 3.50
MIN_COMBINED_ODDS_HIGH = 5.00

SAFE_MIN_PROB = 0.68
VALUE_MIN_PROB = 0.58


@dataclass
class AccumulatorLeg:
    fixture_id: str
    home_team: str
    away_team: str
    market: str
    odds: float
    model_prob: float
    expected_value: float


@dataclass
class Accumulator:
    tier: str          # "safe" | "value" | "risky"
    legs: list[AccumulatorLeg]
    combined_odds: float = 0.0
    combined_prob: float = 0.0
    combined_ev: float = 0.0
    leg_count: int = 0

    def __post_init__(self):
        self.leg_count = len(self.legs)
        if self.legs:
            odds_list = [l.odds for l in self.legs]
            self.combined_odds = round(1.0, 2)
            for o in odds_list:
                self.combined_odds *= o
            self.combined_odds = round(self.combined_odds, 2)
            self.combined_prob = round(1.0, 4)
            for l in self.legs:
                self.combined_prob *= l.model_prob
            self.combined_prob = round(self.combined_prob, 4)
            self.combined_ev = round((self.combined_prob * self.combined_odds) - 1.0, 4)


def _select_legs(bets: list[dict], min_prob: float, max_legs: int) -> list[dict]:
    """
    Select up to max_legs bets from the pool.
    - Filters by minimum probability
    - One bet per fixture only
    - Maximizes sum of EV
    """
    pool = [b for b in bets if b["model_prob"] >= min_prob]
    # One bet per fixture
    seen_fixtures = set()
    selected = []
    for b in sorted(pool, key=lambda x: x["expected_value"], reverse=True):
        if b["fixture_id"] in seen_fixtures:
            continue
        seen_fixtures.add(b["fixture_id"])
        selected.append(b)
        if len(selected) >= max_legs:
            break
    return selected


def build_accumulator(bets: list[dict], tier: str) -> Accumulator | None:
    """
    Build a single-tier accumulator from bet pool.
    bets: list of dicts with keys: fixture_id, home_team, away_team, market, odds, model_prob, expected_value
    """
    if tier == "safe":
        min_prob = SAFE_MIN_PROB
        min_combined = MIN_COMBINED_ODDS_SAFE
    elif tier == "value":
        min_prob = VALUE_MIN_PROB
        min_combined = MIN_COMBINED_ODDS_VALUE
    else:  # risky
        min_prob = 0.55
        min_combined = MIN_COMBINED_ODDS_HIGH

    legs_data = _select_legs(bets, min_prob, MAX_LEGS)
    if len(legs_data) < 2:
        return None

    # Build legs
    legs = [
        AccumulatorLeg(
            fixture_id=b["fixture_id"],
            home_team=b["home_team"],
            away_team=b["away_team"],
            market=b["market"],
            odds=b["odds"],
            model_prob=b["model_prob"],
            expected_value=b["expected_value"],
        )
        for b in legs_data
    ]

    acca = Accumulator(tier=tier, legs=legs)

    # Check minimum combined odds
    if acca.combined_odds < min_combined:
        return None

    return acca


def generate_accumulators(value_bets: list[dict]) -> dict[str, Accumulator | None]:
    """
    Generate three-tier accumulators from a list of value bet dicts.

    value_bets items must have:
        fixture_id, home_team, away_team, market, odds, model_prob, expected_value

    Returns:
        {
          "safe": Accumulator or None,
          "value": Accumulator or None,
          "risky": Accumulator or None,
        }
    """
    return {
        "safe": build_accumulator(value_bets, "safe"),
        "value": build_accumulator(value_bets, "value"),
        "risky": build_accumulator(value_bets, "risky"),
    }


def accumulator_to_dict(acca: Accumulator) -> dict:
    """Serialize an accumulator to a Firestore-ready dict."""
    return {
        "tier": acca.tier,
        "leg_count": acca.leg_count,
        "combined_odds": acca.combined_odds,
        "combined_prob": acca.combined_prob,
        "combined_ev": acca.combined_ev,
        "legs": [
            {
                "fixture_id": l.fixture_id,
                "home_team": l.home_team,
                "away_team": l.away_team,
                "market": l.market,
                "odds": l.odds,
                "model_prob": l.model_prob,
                "expected_value": l.expected_value,
            }
            for l in acca.legs
        ],
    }


if __name__ == "__main__":
    # Demo
    sample_bets = [
        {"fixture_id": "101", "home_team": "Arsenal", "away_team": "Everton",
         "market": "Home Win", "odds": 1.65, "model_prob": 0.72, "expected_value": 0.088},
        {"fixture_id": "102", "home_team": "Real Madrid", "away_team": "Getafe",
         "market": "Over 2.5 Goals", "odds": 1.75, "model_prob": 0.68, "expected_value": 0.085},
        {"fixture_id": "103", "home_team": "Bayern", "away_team": "Dortmund",
         "market": "BTTS", "odds": 1.70, "model_prob": 0.65, "expected_value": 0.105},
        {"fixture_id": "104", "home_team": "PSG", "away_team": "Lyon",
         "market": "Home Win", "odds": 1.55, "model_prob": 0.78, "expected_value": 0.209},
    ]

    accas = generate_accumulators(sample_bets)
    for tier, acca in accas.items():
        if acca:
            print(f"{tier.upper()} ACCA: {acca.leg_count} legs | Odds: {acca.combined_odds:.2f} | EV: {acca.combined_ev:.2%}")
        else:
            print(f"{tier.upper()} ACCA: Not possible")
