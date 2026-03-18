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
MAX_LEGS_PER_ACCA = 3  # Stable trebles
MIN_COMBINED_ODDS_SAFE = 2.00
MIN_COMBINED_ODDS_VALUE = 3.50
MIN_COMBINED_ODDS_HIGH = 7.00

SAFE_MIN_PROB = 0.65   # Avg prob per leg
VALUE_MIN_PROB = 0.55
RISKY_MIN_PROB = 0.45


@dataclass
class AccumulatorLeg:
    fixture_id: str
    home_team: str
    away_team: str
    market: str
    odds: float
    model_prob: float
    expected_value: float
    league: str = "unknown"


@dataclass
class Accumulator:
    tier: str          # "banker" | "value_triple" | "moonshot"
    legs: list[AccumulatorLeg]
    combined_odds: float = 0.0
    combined_prob: float = 0.0
    combined_ev: float = 0.0
    kelly_stake: float = 0.0
    leg_count: int = 0

    def __post_init__(self):
        self.leg_count = len(self.legs)
        if self.legs:
            # Calculate combined metrics
            self.combined_odds = 1.0
            self.combined_prob = 1.0
            for l in self.legs:
                self.combined_odds *= l.odds
                self.combined_prob *= l.model_prob
            
            self.combined_odds = round(self.combined_odds, 2)
            self.combined_prob = round(self.combined_prob, 4)
            self.combined_ev = round((self.combined_prob * self.combined_odds) - 1.0, 4)
            
            # Calculate Kelly Stake for the parlay
            # Formula: (bp - q) / b  where b is net odds (odds - 1)
            b = self.combined_odds - 1
            if b > 0:
                p = self.combined_prob
                q = 1 - p
                kelly = (b * p - q) / b
                # Use a very conservative fractional Kelly for parlays (0.10 multiplier)
                self.kelly_stake = round(max(0, kelly * 100 * 0.10), 2)


def _market_base(market: str) -> str:
    """Normalize market names for correlation grouping."""
    m = market.lower()
    if any(x in m for x in ["home win", "away win", "draw"]): return "1x2"
    if any(x in m for x in ["over", "under"]): return "goals_total"
    if "btts" in m: return "btts"
    if "double chance" in m: return "double_chance"
    if "draw no bet" in m: return "dnb"
    return market


def _select_optimized_legs(bets: list[dict], min_prob: float, max_legs: int, tier: str, exclude_fixtures: set = None) -> list[dict]:
    """
    Select legs optimized for the specific tier.
    - Exclude already used fixtures for diversity.
    - Risk parity: prevents pairing 0.85 prob with 0.30 prob in a 'Safe' ticket.
    """
    if exclude_fixtures is None: exclude_fixtures = set()
    
    # Filter pool
    pool = [b for b in bets if b["model_prob"] >= min_prob and b["fixture_id"] not in exclude_fixtures]
    
    # Tier-specific sorting
    if tier == "banker":
        # Sort by higher probability first for bankers
        pool.sort(key=lambda x: (x["model_prob"], x["expected_value"]), reverse=True)
    else:
        # Sort by EV first
        pool.sort(key=lambda x: x["expected_value"], reverse=True)

    selected = []
    seen_fixtures = set()
    market_counts = {}
    
    for b in pool:
        if b["fixture_id"] in seen_fixtures: continue
        
        # Risk parity check: don't let one leg be a 'junk' leg
        # For 'banker' tier, all legs must be > 60%
        if tier == "banker" and b["model_prob"] < 0.60: continue
        
        # Market correlation guard
        m_base = _market_base(b["market"])
        if market_counts.get(m_base, 0) >= 2: continue

        selected.append(b)
        seen_fixtures.add(b["fixture_id"])
        market_counts[m_base] = market_counts.get(m_base, 0) + 1
        
        if len(selected) >= max_legs: break
        
    return selected


def generate_accumulators(value_bets: list[dict]) -> dict[str, list[dict]]:
    """
    Generate Advanced Accumulators: Multiple tickets per tier.
    Returns serialized dicts ready for Firestore.
    """
    results = {
        "banker": [],
        "value_triple": [],
        "moonshot": []
    }
    
    used_fixtures = set()

    # 1. Generate Bankers (up to 2 tickets)
    for _ in range(2):
        legs = _select_optimized_legs(value_bets, SAFE_MIN_PROB, 3, "banker", used_fixtures)
        if len(legs) >= 2:
            acca = Accumulator(tier="banker", legs=[AccumulatorLeg(**l) for l in legs])
            if acca.combined_odds >= MIN_COMBINED_ODDS_SAFE:
                results["banker"].append(accumulator_to_dict(acca))
                # Burn fixtures so tickets are distinct
                for l in legs: used_fixtures.add(l["fixture_id"])

    # 2. Generate Value Triples (up to 2 tickets)
    # Reset used fixtures for value triples to allow best bets to re-appear in different combos
    # but still prioritize new ones first.
    for _ in range(2):
        legs = _select_optimized_legs(value_bets, VALUE_MIN_PROB, 3, "value_triple", used_fixtures)
        if len(legs) >= 2:
            acca = Accumulator(tier="value_triple", legs=[AccumulatorLeg(**l) for l in legs])
            if acca.combined_odds >= MIN_COMBINED_ODDS_VALUE:
                results["value_triple"].append(accumulator_to_dict(acca))
                for l in legs: used_fixtures.add(l["fixture_id"])

    # 3. Generate Moonshot (1 ticket)
    legs = _select_optimized_legs(value_bets, RISKY_MIN_PROB, 4, "moonshot", used_fixtures)
    if len(legs) >= 3:
        acca = Accumulator(tier="moonshot", legs=[AccumulatorLeg(**l) for l in legs])
        if acca.combined_odds >= MIN_COMBINED_ODDS_HIGH:
            results["moonshot"].append(accumulator_to_dict(acca))

    return results


def accumulator_to_dict(acca: Accumulator) -> dict:
    """Serialize an accumulator to a Firestore-ready dict."""
    return {
        "tier": acca.tier,
        "leg_count": acca.leg_count,
        "combined_odds": acca.combined_odds,
        "combined_prob": acca.combined_prob,
        "combined_ev": acca.combined_ev,
        "kelly_stake": acca.kelly_stake,
        "legs": [
            {
                "fixture_id": l.fixture_id,
                "home_team": l.home_team,
                "away_team": l.away_team,
                "market": l.market,
                "odds": l.odds,
                "model_prob": l.model_prob,
                "expected_value": l.expected_value,
                "league": l.league,
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
