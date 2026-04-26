"""
form_model.py
─────────────
Form adjustment model.
Computes a form-based probability modifier from a team's last-5 results.
Uses weighted recency so more recent matches count more.
"""
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from data_pipeline import TeamStats

# ── Point system ──────────────────────────────────────────────────────────────
RESULT_WEIGHTS = {"W": 3, "D": 1, "L": 0}

# Recency weights for last-5 matches (most recent first)
RECENCY_WEIGHTS = [1.5, 1.3, 1.1, 0.9, 0.7]
MAX_WEIGHTED_SCORE = sum(3 * w for w in RECENCY_WEIGHTS)  # All wins


@dataclass
class FormProbabilities:
    """Form-based outcome probabilities for one match."""
    home_win: float = 0.0
    draw: float = 0.0
    away_win: float = 0.0
    home_form_score: float = 0.5   # 0–1 normalized
    away_form_score: float = 0.5


def _form_score(form_str: str, opponent_strengths: list[float] | None = None) -> float:
    """
    Convert form string like 'W D L W W' to a 0–1 score.
    Most recent match is first.
    
    Upgrade #4: If opponent_strengths are provided (Elo-based difficulty),
    wins against strong opponents are worth more.
    """
    if not form_str or form_str == "N/A":
        return 0.5  # Neutral

    tokens = form_str.strip().upper().split()[:5]
    if not tokens:
        return 0.5

    weighted_sum = 0.0
    total_weight = 0.0
    for i, token in enumerate(tokens):
        w = RECENCY_WEIGHTS[i] if i < len(RECENCY_WEIGHTS) else 0.5
        score = RESULT_WEIGHTS.get(token, 0)
        
        # Opponent quality multiplier (Upgrade #4)
        opp_mult = 1.0
        if opponent_strengths and i < len(opponent_strengths):
            # opponent_strengths are Elo-based: >1 = strong opponent, <1 = weak
            opp_mult = opponent_strengths[i]
            # Beating a strong team (1.2x) is worth 20% more
            # Beating a weak team (0.8x) is worth 20% less
        
        weighted_sum += score * w * opp_mult
        total_weight += 3 * w * opp_mult  # Max possible at this position

    return weighted_sum / total_weight if total_weight > 0 else 0.5


def _performance_score(stats: 'TeamStats') -> float:
    """
    Computes a True Dominance score (0–1) based on underlying performance metrics.
    Looks at xG created vs conceded, average possession, and shots on target.
    """
    # Handle zero stats - return neutral 0.5 instead of dividing by zero
    xg = getattr(stats, 'avg_xg_created', 0) or 0
    xg_conceded = getattr(stats, 'avg_xg_conceded', 0) or 0
    poss = getattr(stats, 'avg_possession', 0) or 0
    sot = getattr(stats, 'avg_shots_on_target', 0) or 0
    
    if xg == 0 and xg_conceded == 0 and poss == 0 and sot == 0:
        return 0.5
    
    # 1. xG Dominance (0–1)
    xg_sum = xg + xg_conceded
    xg_ratio = (xg / xg_sum) if xg_sum > 0 else 0.5
    
    # 2. Match Control (0–1)
    poss_score = min(1.0, max(0.0, poss / 100.0))
    
    # 3. Attacking Threat (0–1)
    sot_score = min(1.0, sot / 8.0)
    
    # True Dominance: 60% xG, 20% Possession, 20% SOT
    true_dominance = (xg_ratio * 0.6) + (poss_score * 0.2) + (sot_score * 0.2)
    return true_dominance



def _scores_to_probabilities(home_score: float, away_score: float) -> tuple[float, float, float]:
    """
    Convert two form scores (0–1) into match outcome probabilities.
    Returns (home_win, draw, away_win).
    """
    # Form advantage: difference between team scores
    diff = home_score - away_score  # Range: -1 to +1

    # Center around a 40/25/35 base (slight home bias)
    base_home, base_draw, base_away = 0.40, 0.26, 0.34

    # Shift based on form differential
    SHIFT = 0.25  # Max shift per direction
    p_home = base_home + diff * SHIFT
    p_away = base_away - diff * SHIFT
    p_draw = 1.0 - p_home - p_away

    # Clamp to sensible ranges
    p_home = max(0.10, min(0.80, p_home))
    p_away = max(0.10, min(0.80, p_away))
    p_draw = max(0.05, min(0.40, p_draw))

    # Normalize
    total = p_home + p_draw + p_away
    return p_home / total, p_draw / total, p_away / total


def compute_form_probabilities(
    home_stats: 'TeamStats', away_stats: 'TeamStats',
    home_opp_strengths: list[float] | None = None,
    away_opp_strengths: list[float] | None = None,
) -> FormProbabilities:
    """
    Main entry point.
    Given TeamStats objects for home/away teams, return FormProbabilities.
    Upgrade #4: Accepts optional opponent strength lists for quality-adjusted scoring.
    Fix: Advanced Underlying Performance Form Model (blends W/D/L with xG/Poss/SOT)
    """
    # 1. Classic Form (W/D/L adjusted for opponent strength)
    home_res_score = _form_score(home_stats.form, home_opp_strengths)
    away_res_score = _form_score(away_stats.form, away_opp_strengths)

    # 2. True Dominance (xG, Possession, SOT)
    home_perf_score = _performance_score(home_stats)
    away_perf_score = _performance_score(away_stats)

    # 3. Blended Form Score (50% Results, 50% Underlying Performance)
    # Gives a massive edge in catching "Unlucky" performing teams
    home_score = (home_res_score * 0.5) + (home_perf_score * 0.5)
    away_score = (away_res_score * 0.5) + (away_perf_score * 0.5)

    p_home, p_draw, p_away = _scores_to_probabilities(home_score, away_score)

    return FormProbabilities(
        home_win=p_home,
        draw=p_draw,
        away_win=p_away,
        home_form_score=home_score,
        away_form_score=away_score,
    )


if __name__ == "__main__":
    from data_pipeline import TeamStats
    # Demo
    ts_home = TeamStats(1, "Home", form="W W W D W", avg_xg_created=2.5, avg_xg_conceded=0.5, avg_possession=65, avg_shots_on_target=6)
    ts_away = TeamStats(2, "Away", form="L D L L W", avg_xg_created=1.2, avg_xg_conceded=1.8, avg_possession=45, avg_shots_on_target=3)
    
    probs = compute_form_probabilities(ts_home, ts_away)
    print(f"Home Win: {probs.home_win:.3f}")
    print(f"Draw:     {probs.draw:.3f}")
    print(f"Away Win: {probs.away_win:.3f}")
    print(f"Home Form Score: {probs.home_form_score:.3f}")
    print(f"Away Form Score: {probs.away_form_score:.3f}")
