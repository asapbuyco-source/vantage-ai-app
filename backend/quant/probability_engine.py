"""
probability_engine.py
─────────────────────
Weighted model combiner.
Merges Poisson, Elo, and Form probabilities into a single consensus.

Weights: 60% Poisson | 30% Elo | 10% Form
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING
from poisson_model import MarketProbabilities, compute_probabilities
from elo_rating import match_probabilities as elo_match_probs
from form_model import compute_form_probabilities, FormProbabilities

if TYPE_CHECKING:
    from data_pipeline import TeamStats

# ── Model weights (must sum to 1.00) ──────────────────────────────────────────
# H2H endpoint is unavailable on Sportmonks Pro plan — always defaults to Poisson.
# Setting W_H2H = 0.0 makes this explicit and prevents implicit Poisson double-weighting.
W_POISSON = 0.65  # Was 0.55; +0.10 absorbed from H2H
W_ELO     = 0.25
W_FORM    = 0.10
W_H2H     = 0.00  # H2H data unavailable — do not use


@dataclass
class CombinedProbabilities:
    """Final consensus probabilities for all markets."""
    home_win: float = 0.0
    draw: float = 0.0
    away_win: float = 0.0
    over15: float = 0.0
    under15: float = 0.0
    over25: float = 0.0
    under25: float = 0.0
    over35: float = 0.0
    under35: float = 0.0
    btts: float = 0.0
    btts_no: float = 0.0
    double_chance_1x: float = 0.0
    double_chance_x2: float = 0.0
    double_chance_12: float = 0.0
    draw_no_bet_home: float = 0.0
    draw_no_bet_away: float = 0.0
    # OPP-01: BTTS + Over 2.5 composite probability
    btts_and_over25: float = 0.0
    # Model contributions for transparency
    poisson_home: float = 0.0
    elo_home: float = 0.0
    form_home: float = 0.0
    confidence_score: float = 0.0  # Derived measure of model agreement


def _normalize(p_home: float, p_draw: float, p_away: float) -> tuple[float, float, float]:
    total = p_home + p_draw + p_away
    if total == 0:
        return 1/3, 1/3, 1/3
    return p_home / total, p_draw / total, p_away / total


def compute_combined(
    mu_home: float,
    mu_away: float,
    home_team_id: int,
    away_team_id: int,
    home_stats: 'TeamStats',
    away_stats: 'TeamStats',
    home_opp_strengths: list[float] | None = None,
    away_opp_strengths: list[float] | None = None,
    h2h_home_wins: int = 0,
    h2h_away_wins: int = 0,
    h2h_draws: int = 0,
    rho: float | None = None,
) -> CombinedProbabilities:
    """
    Combine Poisson + Elo + Form + H2H into final probabilities.
    Fix #5: H2H historical win/draw/loss rates now contribute 5% of the 1X2 probability.

    Args:
        mu_home: Expected goals for home team (from data_pipeline)
        mu_away: Expected goals for away team
        home_team_id: Sportmonks team ID (for Elo lookup)
        away_team_id:
        home_form: Form string like "W D W W L"
        away_form: Form string like "L W D L W"
        h2h_home_wins: Number of H2H wins for home team (last 8 meetings)
        h2h_away_wins: Number of H2H wins for away team
        h2h_draws: Number of H2H draws

    Returns:
        CombinedProbabilities with all markets filled.
    """
    # ── Model 1: Poisson (MODEL-01: form-adjusted xG before grid) ────────
    # Multiplicative xG form scaling applied before Poisson grid so the full
    # probability distribution stays coherent (old additive tweak did not).
    _hfs = getattr(home_stats, 'form_score', 0.5) if home_stats else 0.5
    _afs = getattr(away_stats, 'form_score', 0.5) if away_stats else 0.5
    adj_mu_home = max(0.20, mu_home * (0.90 + _hfs * 0.20))  # 0.90–1.10×
    adj_mu_away = max(0.20, mu_away * (0.90 + _afs * 0.20))

    # UPGRADE B: League-aware Home Advantage
    # Real football has systemic home advantage. We apply a multiplier to the 
    # home team's expected goals based on league tier.
    # Default to 1.08 (8% boost) if tier isn't provided (backwards compat).
    league_tier = getattr(home_stats, 'league_tier', 2) if home_stats else 2
    HOME_ADVANTAGE = {1: 1.10, 2: 1.08, 3: 1.05, 4: 1.03, 5: 1.00}
    adj_mu_home *= HOME_ADVANTAGE.get(league_tier, 1.08)

    poisson: MarketProbabilities = compute_probabilities(adj_mu_home, adj_mu_away, rho)

    # ── Model 2: Elo ───────────────────────────────────────────────────────
    elo = elo_match_probs(home_team_id, away_team_id)

    # ── Model 3: Form (Upgrade #4: opponent strength aware) ───────────────
    form: FormProbabilities = compute_form_probabilities(
        home_stats, away_stats, home_opp_strengths, away_opp_strengths
    )

    # ── Model 4: H2H (Fix #5) ─────────────────────────────────────────────
    h2h_total = h2h_home_wins + h2h_away_wins + h2h_draws
    if h2h_total >= 3:  # Only use H2H signal if sufficient samples
        h2h_p_home = h2h_home_wins / h2h_total
        h2h_p_draw = h2h_draws / h2h_total
        h2h_p_away = h2h_away_wins / h2h_total
    else:
        # Insufficient H2H data — fall back to Poisson (neutral contribution)
        h2h_p_home = poisson.home_win
        h2h_p_draw = poisson.draw
        h2h_p_away = poisson.away_win

    # ── Weighted combination of 1x2 probabilities ──────────────────────────
    p_home = (W_POISSON * poisson.home_win + W_ELO * elo["home_win"]
              + W_FORM * form.home_win + W_H2H * h2h_p_home)
    p_draw = (W_POISSON * poisson.draw + W_ELO * elo["draw"]
              + W_FORM * form.draw + W_H2H * h2h_p_draw)
    p_away = (W_POISSON * poisson.away_win + W_ELO * elo["away_win"]
              + W_FORM * form.away_win + W_H2H * h2h_p_away)

    p_home, p_draw, p_away = _normalize(p_home, p_draw, p_away)

    # ── Goals markets: taken directly from form-adjusted Poisson grid ─────
    # MODEL-01: Poisson already used form-scaled xG above — no additive tweaks.
    over25 = poisson.over25
    under25 = 1.0 - over25
    over35 = poisson.over35
    under35 = 1.0 - over35
    over15 = poisson.over15
    under15 = 1.0 - over15
    btts = poisson.btts
    btts_no = 1.0 - btts

    # ── Realistic probability caps for defensive markets ───────────────────
    # Prevents artificially low xG from generating over-confident Under/BTTS No picks.
    under25 = min(under25, 0.80)   # Under 2.5 cannot exceed 80% (avg ~2.7 goals)
    under35 = min(under35, 0.88)   # Under 3.5 cannot exceed 88%
    btts_no = min(btts_no, 0.85)   # BTTS No cannot exceed 85%
    # Re-balance complementary markets after capping
    over25 = 1.0 - under25
    over35 = 1.0 - under35
    btts = 1.0 - btts_no

    # ── Compound markets ───────────────────────────────────────────────────
    dc_1x = p_home + p_draw
    dc_x2 = p_away + p_draw
    dc_12 = p_home + p_away

    non_draw = p_home + p_away
    dnb_home = p_home / non_draw if non_draw > 0 else 0.5
    dnb_away = p_away / non_draw if non_draw > 0 else 0.5

    # ── Model agreement → confidence score (MODEL-02) ─────────────────────
    # Average agreement across home/draw/away — not just home_win (was a bug).
    def _oa(a: float, b: float, c: float) -> float:
        m = (a + b + c) / 3.0
        # Reduced divisor from 0.30 to 0.25: makes model slightly more 
        # sensitive to disagreement, resulting in lower confidence scores
        # when models heavily diverge.
        return max(0.0, 1.0 - (((a-m)**2 + (b-m)**2 + (c-m)**2) / 3.0)**0.5 / 0.25)
    agreement = (
        _oa(poisson.home_win, elo["home_win"], form.home_win)
        + _oa(poisson.draw,     elo["draw"],     form.draw)
        + _oa(poisson.away_win, elo["away_win"], form.away_win)
    ) / 3.0

    cp = CombinedProbabilities(
        home_win=round(p_home, 4),
        draw=round(p_draw, 4),
        away_win=round(p_away, 4),
        over15=round(over15, 4),
        under15=round(under15, 4),
        over25=round(over25, 4),
        under25=round(under25, 4),
        over35=round(over35, 4),
        under35=round(under35, 4),
        btts=round(btts, 4),
        btts_no=round(btts_no, 4),
        double_chance_1x=round(dc_1x, 4),
        double_chance_x2=round(dc_x2, 4),
        double_chance_12=round(dc_12, 4),
        draw_no_bet_home=round(dnb_home, 4),
        draw_no_bet_away=round(dnb_away, 4),
        # OPP-01: Composite — P(BTTS AND Over 2.5) = P(BTTS) × P(O2.5) assuming near-independence
        btts_and_over25=round(btts * over25, 4),
        poisson_home=round(poisson.home_win, 4),
        elo_home=round(elo["home_win"], 4),
        form_home=round(form.home_win, 4),
        confidence_score=round(agreement, 4),
    )
    return cp


if __name__ == "__main__":
    result = compute_combined(1.8, 0.9, 12, 14, "W W W D W", "L D L L W")
    print(f"Home Win:  {result.home_win:.3f}")
    print(f"Draw:      {result.draw:.3f}")
    print(f"Away Win:  {result.away_win:.3f}")
    print(f"Over 2.5:  {result.over25:.3f}")
    print(f"BTTS:      {result.btts:.3f}")
    print(f"Agreement: {result.confidence_score:.3f}")
