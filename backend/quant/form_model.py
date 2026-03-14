"""
form_model.py
─────────────
Form adjustment model.
Computes a form-based probability modifier from a team's last-5 results.
Uses weighted recency so more recent matches count more.
"""

from dataclasses import dataclass


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


def _form_score(form_str: str) -> float:
    """
    Convert form string like 'W D L W W' to a 0–1 score.
    Most recent match is first.
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
        weighted_sum += score * w
        total_weight += 3 * w  # Max possible at this position

    return weighted_sum / total_weight if total_weight > 0 else 0.5


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


def compute_form_probabilities(home_form: str, away_form: str) -> FormProbabilities:
    """
    Main entry point.
    Given form strings for home/away teams, return FormProbabilities.
    """
    home_score = _form_score(home_form)
    away_score = _form_score(away_form)

    p_home, p_draw, p_away = _scores_to_probabilities(home_score, away_score)

    return FormProbabilities(
        home_win=p_home,
        draw=p_draw,
        away_win=p_away,
        home_form_score=home_score,
        away_form_score=away_score,
    )


if __name__ == "__main__":
    # Demo
    probs = compute_form_probabilities("W W W D W", "L D L L W")
    print(f"Home Win: {probs.home_win:.3f}")
    print(f"Draw:     {probs.draw:.3f}")
    print(f"Away Win: {probs.away_win:.3f}")
    print(f"Home Form Score: {probs.home_form_score:.3f}")
    print(f"Away Form Score: {probs.away_form_score:.3f}")
