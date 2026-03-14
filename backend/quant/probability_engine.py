"""
probability_engine.py
─────────────────────
Weighted model combiner.
Merges Poisson, Elo, and Form probabilities into a single consensus.

Weights: 60% Poisson | 30% Elo | 10% Form
"""

from dataclasses import dataclass, field
from poisson_model import MarketProbabilities, compute_probabilities
from elo_rating import match_probabilities as elo_match_probs
from form_model import compute_form_probabilities, FormProbabilities

# ── Model weights ──────────────────────────────────────────────────────────────
W_POISSON = 0.60
W_ELO = 0.30
W_FORM = 0.10


@dataclass
class CombinedProbabilities:
    """Final consensus probabilities for all markets."""
    home_win: float = 0.0
    draw: float = 0.0
    away_win: float = 0.0
    over15: float = 0.0
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
    home_form: str,
    away_form: str,
    h2h_home_wins: int = 0,
    h2h_away_wins: int = 0,
    h2h_draws: int = 0,
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
    # ── Model 1: Poisson ───────────────────────────────────────────────────
    poisson: MarketProbabilities = compute_probabilities(mu_home, mu_away)

    # ── Model 2: Elo ───────────────────────────────────────────────────────
    elo = elo_match_probs(home_team_id, away_team_id)

    # ── Model 3: Form ──────────────────────────────────────────────────────
    form: FormProbabilities = compute_form_probabilities(home_form, away_form)

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

    # ── Goals markets: use Poisson (most objective) ────────────────────────
    # Apply a slight form adjustment (±5% shift) for over/under
    form_adj = (form.home_form_score + form.away_form_score - 1.0) * 0.05
    over25 = min(0.95, max(0.05, poisson.over25 + form_adj))
    under25 = 1.0 - over25
    over35 = min(0.90, max(0.05, poisson.over35 + form_adj * 0.6))
    under35 = 1.0 - over35
    over15 = min(0.98, max(0.10, poisson.over15))
    btts = min(0.90, max(0.05, poisson.btts + form_adj * 0.3))
    btts_no = 1.0 - btts

    # ── Compound markets ───────────────────────────────────────────────────
    dc_1x = p_home + p_draw
    dc_x2 = p_away + p_draw
    dc_12 = p_home + p_away

    non_draw = p_home + p_away
    dnb_home = p_home / non_draw if non_draw > 0 else 0.5
    dnb_away = p_away / non_draw if non_draw > 0 else 0.5

    # ── Model agreement → confidence score ───────────────────────────────
    # Std deviation of home_win across 3 models = low spread = high agreement
    home_preds = [poisson.home_win, elo["home_win"], form.home_win]
    mean_h = sum(home_preds) / 3
    variance = sum((x - mean_h) ** 2 for x in home_preds) / 3
    agreement = max(0.0, 1.0 - (variance ** 0.5) / 0.3)  # 0–1 scale

    cp = CombinedProbabilities(
        home_win=round(p_home, 4),
        draw=round(p_draw, 4),
        away_win=round(p_away, 4),
        over15=round(over15, 4),
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
