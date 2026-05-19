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
import math

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
    home_sidelined: int = 0,
    away_sidelined: int = 0,
    rho: float | None = None,
    weights_override: dict | None = None,
    match=None,
) -> CombinedProbabilities:
    """
    Combine Poisson + Elo + Form + H2H into final probabilities.
    Fix #5: H2H historical win/draw/loss rates now contribute 5% of the 1X2 probability.

    Args:
        mu_home: Expected goals for home team (from data_pipeline)
        mu_away: Expected goals for away team
        home_team_id: Sportmonks team ID (for Elo lookup)
        away_team_id:
        home_stats: TeamStats object
        away_stats: TeamStats object
        home_opp_strengths: list of opponent Elo ratings
        away_opp_strengths: 
        h2h_home_wins: Number of H2H wins for home team (last 8 meetings)
        h2h_away_wins: Number of H2H wins for away team
        h2h_draws: Number of H2H draws
        home_sidelined: Count of injured/suspended players for home team
        away_sidelined: Count of injured/suspended players for away team
        rho: Dixon-Coles rho
        weights_override: dict of model weights (poisson, elo, form, h2h)

    Returns:
        CombinedProbabilities with all markets filled.
    """
    
    # Apply weights override if provided
    w_poisson = weights_override.get('poisson', W_POISSON) if weights_override else W_POISSON
    w_elo = weights_override.get('elo', W_ELO) if weights_override else W_ELO
    w_form = weights_override.get('form', W_FORM) if weights_override else W_FORM
    w_h2h = weights_override.get('h2h', W_H2H) if weights_override else W_H2H

    W_SM = 0.10
    has_sm = match is not None and getattr(match, 'sm_pred_available', False)

    # FIX #4: Normalize base weights BEFORE applying SM scale.
    # Previously, normalization happened AFTER scale, which restored original
    # weights then added W_SM=0.10 on top → total sum = 1.10.
    # Step 1: normalize the four base model weights to sum = 1.0
    w_total = w_poisson + w_elo + w_form + w_h2h
    if w_total > 0:
        w_poisson /= w_total
        w_elo     /= w_total
        w_form    /= w_total
        w_h2h     /= w_total

    # Step 2: if Sportmonks prediction available, scale all base weights by (1-W_SM)
    # so that base_sum = 0.90, and adding W_SM=0.10 in the final combination = 1.00
    if has_sm:
        scale = 1.0 - W_SM
        w_poisson *= scale
        w_elo     *= scale
        w_form    *= scale
        w_h2h     *= scale
        # No further normalization needed — sum is now exactly 1.00
    # ── Model 1: Poisson (MODEL-01: form-adjusted xG before grid) ────────
    # Multiplicative xG form scaling applied before Poisson grid so the full
    # probability distribution stays coherent (old additive tweak did not).
    _hfs = getattr(home_stats, 'form_score', 0.5) if home_stats else 0.5
    _afs = getattr(away_stats, 'form_score', 0.5) if away_stats else 0.5
    
    # UPGRADE #13: Sidelined (Injury) Penalty
    # Every missing player reduces expected goals by ~3%. 
    # If more than 4 players are missing, it signals a deeper squad crisis.
    home_injury_penalty = min(0.25, home_sidelined * 0.03 + (0.05 if home_sidelined > 4 else 0.0))
    away_injury_penalty = min(0.25, away_sidelined * 0.03 + (0.05 if away_sidelined > 4 else 0.0))

    # FIX #3 + FIX #10: Form is NO LONGER baked into adj_mu.
    # It enters the consensus purely through W_FORM * form.home_win below.
    # Old multiplier (0.90 + _hfs*0.20) double-counted form AND had a range of
    # [0.90, 1.10] that punished neutral teams (form_score=0 → -10% xG).
    # New multiplier: (0.85 + _hfs*0.30) would be correct IF we kept form here,
    # but we remove it entirely and apply injury penalty only.
    adj_mu_home = max(0.20, mu_home * (1.0 - home_injury_penalty))
    adj_mu_away = max(0.20, mu_away * (1.0 - away_injury_penalty))

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
    sm_home = getattr(match, 'sm_pred_home_win', 0.0) if has_sm else 0.0
    sm_draw = getattr(match, 'sm_pred_draw', 0.0) if has_sm else 0.0
    sm_away = getattr(match, 'sm_pred_away_win', 0.0) if has_sm else 0.0

    p_home = (w_poisson * poisson.home_win + w_elo * elo["home_win"]
              + w_form * form.home_win + w_h2h * h2h_p_home
              + (W_SM * sm_home if has_sm else 0.0))
    p_draw = (w_poisson * poisson.draw + w_elo * elo["draw"]
              + w_form * form.draw + w_h2h * h2h_p_draw
              + (W_SM * sm_draw if has_sm else 0.0))
    p_away = (w_poisson * poisson.away_win + w_elo * elo["away_win"]
              + w_form * form.away_win + w_h2h * h2h_p_away
              + (W_SM * sm_away if has_sm else 0.0))

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
    under25 = min(poisson.under25, 0.80)  # Under 2.5 cannot exceed 80%
    over25  = 1.0 - under25

    under35 = min(poisson.under35, 0.88)  # Under 3.5 cannot exceed 88%
    over35  = 1.0 - under35

    under15 = poisson.under15
    over15  = poisson.over15

    btts_no = min(poisson.btts_no, 0.85)  # BTTS No cannot exceed 85%
    btts    = 1.0 - btts_no

    # FIX #2: Enforce stochastic ordering — must hold: over15 >= over25 >= over35
    # Capping under35 at 0.88 can produce over35 > over25 which is impossible
    # ("over 3.5" is a strict subset of "over 2.5").
    over35  = min(over35,  over25)   # over35 cannot exceed over25
    under35 = 1.0 - over35
    over15  = max(over15,  over25)   # over15 must be at least as large as over25
    under15 = 1.0 - over15

    # ── Compound markets ───────────────────────────────────────────────────
    dc_1x = p_home + p_draw
    dc_x2 = p_away + p_draw
    dc_12 = p_home + p_away

    non_draw = p_home + p_away
    dnb_home = p_home / non_draw if non_draw > 0 else 0.5
    dnb_away = p_away / non_draw if non_draw > 0 else 0.5

    # ── Model agreement → confidence score (Shannon Entropy) ──────────────
    # A lower entropy means the model is mathematically more certain of the outcome.
    def shannon_entropy(probs: list[float]) -> float:
        return -sum(p * math.log2(p) for p in probs if p > 0)

    entropy = shannon_entropy([p_home, p_draw, p_away])
    # Max entropy for 3 outcomes is log2(3) ≈ 1.585
    # Normalize to 0-1 (1 means total certainty, 0 means total randomness)
    agreement = max(0.0, min(1.0, 1.0 - (entropy / 1.585)))

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
        # OPP-01: Composite — Exact joint probability from the Poisson grid
        btts_and_over25=round(poisson.btts_and_over25, 4),
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
