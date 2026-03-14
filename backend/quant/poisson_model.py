"""
poisson_model.py
────────────────
Poisson goal model.
Given expected goals (mu_home, mu_away), computes a full score-grid (0-5 x 0-5),
then derives probabilities for all key markets.
"""

import math
from dataclasses import dataclass


# ── Score grid config ─────────────────────────────────────────────────────────
MAX_GOALS = 8          # Fix #8: raised from 6 — correctly prices Over 3.5 in EPL/Bundesliga
DIXON_COLES_RHO = -0.13  # Fix #4: rho for low-score bias correction (empirical football value)


@dataclass
class MarketProbabilities:
    """All market probabilities derived from the Poisson score grid."""
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
    double_chance_1x: float = 0.0   # Home or Draw
    double_chance_x2: float = 0.0   # Away or Draw
    double_chance_12: float = 0.0   # Home or Away (no draw)
    draw_no_bet_home: float = 0.0   # Home win (excluding draws)
    draw_no_bet_away: float = 0.0   # Away win (excluding draws)
    score_grid: dict | None = None  # Optional: full {(h,a): prob}


def _poisson_pmf(k: int, mu: float) -> float:
    """P(X=k) for Poisson distribution with mean mu."""
    if mu <= 0:
        return 1.0 if k == 0 else 0.0
    return (mu ** k) * math.exp(-mu) / math.factorial(k)


def _tau(h: int, a: int, mu_h: float, mu_a: float, rho: float) -> float:
    """
    Dixon-Coles correction factor tau for low-scoring scorelines.
    Only applied to scores (0,0), (1,0), (0,1), (1,1).
    rho < 0 means these 4 scorelines get adjusted (0-0 and 1-1 boosted,
    1-0 and 0-1 reduced) to match empirical football distributions.
    """
    if h == 0 and a == 0:
        return 1 - mu_h * mu_a * rho
    elif h == 1 and a == 0:
        return 1 + mu_a * rho
    elif h == 0 and a == 1:
        return 1 + mu_h * rho
    elif h == 1 and a == 1:
        return 1 - rho
    return 1.0


def compute_score_grid(mu_home: float, mu_away: float) -> dict[tuple[int, int], float]:
    """
    Build a (MAX_GOALS+1 x MAX_GOALS+1) dictionary of score probabilities
    with Dixon-Coles rho correction applied to the four low-score cells.
    Key: (home_goals, away_goals), Value: corrected probability.
    Grid is re-normalized so all probabilities sum to 1.0.
    """
    grid: dict[tuple[int, int], float] = {}
    for h in range(MAX_GOALS + 1):
        for a in range(MAX_GOALS + 1):
            raw = _poisson_pmf(h, mu_home) * _poisson_pmf(a, mu_away)
            correction = _tau(h, a, mu_home, mu_away, DIXON_COLES_RHO)
            grid[(h, a)] = raw * correction

    # Re-normalize to handle the correction disturbing the sum
    total = sum(grid.values())
    if total > 0:
        grid = {k: v / total for k, v in grid.items()}
    return grid


def derive_markets(grid: dict[tuple[int, int], float]) -> MarketProbabilities:
    """Aggregate score-grid into standard betting market probabilities."""
    mp = MarketProbabilities(score_grid=grid)

    for (h, a), prob in grid.items():
        total = h + a

        if h > a:
            mp.home_win += prob
        elif h == a:
            mp.draw += prob
        else:
            mp.away_win += prob

        if total > 1.5: mp.over15 += prob
        if total > 2.5: mp.over25 += prob
        if total < 2.5: mp.under25 += prob
        if total > 3.5: mp.over35 += prob
        if total < 3.5: mp.under35 += prob

        if h >= 1 and a >= 1: mp.btts += prob
        if h == 0 or a == 0: mp.btts_no += prob

    # Compound markets
    mp.double_chance_1x = mp.home_win + mp.draw
    mp.double_chance_x2 = mp.away_win + mp.draw
    mp.double_chance_12 = mp.home_win + mp.away_win

    # Draw No Bet: re-normalize excluding draw probability
    non_draw = mp.home_win + mp.away_win
    if non_draw > 0:
        mp.draw_no_bet_home = mp.home_win / non_draw
        mp.draw_no_bet_away = mp.away_win / non_draw

    return mp


def compute_probabilities(mu_home: float, mu_away: float) -> MarketProbabilities:
    """
    Main entry point.
    Given expected goal means, return all market probabilities.
    """
    mu_home = max(0.01, mu_home)
    mu_away = max(0.01, mu_away)
    grid = compute_score_grid(mu_home, mu_away)
    return derive_markets(grid)


# ── Utility ────────────────────────────────────────────────────────────────────
def top_scorelines(grid: dict[tuple[int, int], float], n: int = 5) -> list[tuple[str, float]]:
    """Return the N most probable scorelines."""
    sorted_scores = sorted(grid.items(), key=lambda x: x[1], reverse=True)
    return [(f"{h}-{a}", round(p, 4)) for (h, a), p in sorted_scores[:n]]


if __name__ == "__main__":
    import json
    # Example: Arsenal (1.8 xG) vs Everton (0.9 xG)
    probs = compute_probabilities(1.80, 0.90)
    print(f"Home Win:  {probs.home_win:.3f}")
    print(f"Draw:      {probs.draw:.3f}")
    print(f"Away Win:  {probs.away_win:.3f}")
    print(f"Over 2.5:  {probs.over25:.3f}")
    print(f"Under 2.5: {probs.under25:.3f}")
    print(f"BTTS:      {probs.btts:.3f}")
    grid = compute_score_grid(1.80, 0.90)
    print("Top scorelines:", top_scorelines(grid))
