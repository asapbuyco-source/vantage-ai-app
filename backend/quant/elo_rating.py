"""
elo_rating.py
─────────────
Elo rating system for football teams.
Ratings are persisted in Firestore `elo_ratings/{teamId}`.
Provides match outcome probabilities from Elo spread.
"""

import math
import os
from typing import Optional


# ── Elo constants ──────────────────────────────────────────────────────────────
DEFAULT_ELO = 1500.0
K_FACTOR = 20.0          # Reduced from 32 — FiveThirtyEight football standard
HOME_ADVANTAGE = 55.0    # Default Elo points added to home team
DRAW_PROB_BASE = 0.26    # Base draw probability correction

# League-specific home advantage (Elo points). Falls back to HOME_ADVANTAGE.
LEAGUE_HOME_ADV: dict[int, float] = {
    8: 45,     # EPL (post-COVID decline)
    564: 55,   # La Liga
    82: 50,    # Bundesliga
    384: 55,   # Serie A
    301: 50,   # Ligue 1
    2: 30,     # UCL (neutral-ish venues)
    5: 35,     # Europa League
    176: 75,   # Turkish Süper Lig (intense home crowds)
    253: 65,   # Brasileirão
    600: 50,   # MLS
    570: 70,   # Saudi Pro League
}

# ── Fix #6: Pre-seed Elo ratings for top clubs ────────────────────────────────
# Sportmonks team IDs → approximate Elo (based on 2024/25 perf + UEFA coefficient)
# Prevents cold-start. Real graded Firestore values will override these seeds.
PRE_SEED_ELO: dict[int, float] = {
    214: 1870,  # Real Madrid
    631: 1855,  # Manchester City
    8:   1830,  # Bayern Munich
    5:   1820,  # Arsenal
    9:   1815,  # Liverpool
    593: 1810,  # Barcelona
    232: 1805,  # PSG
    82:  1800,  # Atletico Madrid
    7:   1790,  # Chelsea
    2:   1785,  # Bayer Leverkusen
    3:   1780,  # Inter Milan
    6:   1775,  # Borussia Dortmund
    1:   1770,  # Juventus
    10:  1765,  # Napoli
    52:  1760,  # Aston Villa
    29:  1755,  # Manchester United
    45:  1750,  # Tottenham
    251: 1740,  # Porto
    267: 1730,  # Benfica
    62:  1720,  # Celtic
    72:  1715,  # Ajax
    3468: 1620, # Wydad
    3479: 1610, # Al Ahly
    3481: 1605, # Esperance
}

# ── In-memory cache (populated from Firestore at startup) ─────────────────────
_elo_cache: dict[int, float] = {}
_dirty: set[int] = set()   # Teams whose rating changed and need saving


def _get_firestore():
    """Lazy import of firebase_admin to avoid circular deps."""
    try:
        import firebase_admin
        from firebase_admin import firestore as fs
        return fs.client()
    except Exception:
        return None


def load_ratings_from_firestore():
    """Load all Elo ratings from Firestore into memory cache.
    Fix #6: Pre-seeds unknown teams from PRE_SEED_ELO before loading real values.
    Real Firestore values overwrite seeds for any team with recorded match history.
    """
    # Apply pre-seeds for teams not yet in cache (won't overwrite real values)
    for team_id, seed_rating in PRE_SEED_ELO.items():
        if team_id not in _elo_cache:
            _elo_cache[team_id] = seed_rating
    print(f"[Elo] Pre-seeded {len(PRE_SEED_ELO)} elite club ratings.")

    db = _get_firestore()
    if not db:
        print("[Elo] No Firestore — using pre-seeded ratings only.")
        return
    try:
        docs = db.collection("elo_ratings").stream()
        count = 0
        for doc in docs:
            data = doc.to_dict()
            team_id = int(doc.id)
            _elo_cache[team_id] = float(data.get("rating", DEFAULT_ELO))  # Real value overrides seed
            count += 1
        print(f"[Elo] Loaded {count} Elo ratings from Firestore (overrides pre-seeds where applicable).")
    except Exception as e:
        print(f"[Elo] Firestore load error: {e}")


def save_dirty_ratings():
    """Persist only modified Elo ratings back to Firestore."""
    if not _dirty:
        return
    db = _get_firestore()
    if not db:
        return
    try:
        batch = db.batch()
        for team_id in _dirty:
            ref = db.collection("elo_ratings").document(str(team_id))
            batch.set(ref, {"rating": _elo_cache[team_id], "updatedAt": _now_iso()}, merge=True)
        batch.commit()
        print(f"[Elo] Saved {len(_dirty)} updated ratings to Firestore.")
        _dirty.clear()
    except Exception as e:
        print(f"[Elo] Firestore save error: {e}")


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ── Rating accessors ───────────────────────────────────────────────────────────
def get_rating(team_id: int) -> float:
    return _elo_cache.get(team_id, DEFAULT_ELO)


def get_team_rating(team_id: int) -> float:
    """Alias for get_rating, used by pipeline."""
    return get_rating(team_id)


def set_rating(team_id: int, rating: float):
    _elo_cache[team_id] = round(rating, 2)
    _dirty.add(team_id)


# ── Core Elo formulas ──────────────────────────────────────────────────────────
def expected_score(rating_a: float, rating_b: float) -> float:
    """
    Elo expected score for team A vs team B.
    Returns probability A wins (0–1), ignoring draws.
    """
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))


def match_probabilities(home_team_id: int, away_team_id: int,
                        home_adj: float = HOME_ADVANTAGE,
                        league_id: int | None = None) -> dict[str, float]:
    """
    Compute match outcome probabilities from Elo ratings.
    Returns: {home_win, draw, away_win}
    Uses the Bradley-Terry logistic model with draw zone.
    """
    adj = LEAGUE_HOME_ADV.get(league_id, home_adj) if league_id else home_adj
    ra = get_rating(home_team_id) + adj  # Home advantage bonus
    rb = get_rating(away_team_id)

    # P(home wins) ignoring draws
    p_win_raw = expected_score(ra, rb)

    # Apply draw zone correction using logistic squeezing
    # P(draw) is higher when teams are evenly matched
    rating_diff = abs(ra - rb)
    draw_prob = DRAW_PROB_BASE * math.exp(-rating_diff / 350.0)

    p_home = p_win_raw * (1.0 - draw_prob)
    p_away = (1.0 - p_win_raw) * (1.0 - draw_prob)

    # Normalize so they sum to 1
    total = p_home + draw_prob + p_away
    return {
        "home_win": p_home / total,
        "draw": draw_prob / total,
        "away_win": p_away / total,
    }


# ── Rating update ──────────────────────────────────────────────────────────────
def update_ratings(home_team_id: int, away_team_id: int, home_goals: int, away_goals: int):
    """
    Update Elo ratings after a match result.
    Actual score: 1 = win, 0.5 = draw, 0 = loss.
    """
    ra = get_rating(home_team_id)
    rb = get_rating(away_team_id)

    ea = expected_score(ra + HOME_ADVANTAGE, rb)
    eb = 1.0 - ea

    if home_goals > away_goals:
        sa, sb = 1.0, 0.0
    elif home_goals < away_goals:
        sa, sb = 0.0, 1.0
    else:
        sa, sb = 0.5, 0.5

    # Goal difference multiplier (larger wins = bigger rating swing)
    goal_diff = abs(home_goals - away_goals)
    k_mult = 1.0 if goal_diff <= 1 else (1.5 if goal_diff == 2 else 1.75)

    new_ra = ra + K_FACTOR * k_mult * (sa - ea)
    new_rb = rb + K_FACTOR * k_mult * (sb - eb)

    set_rating(home_team_id, new_ra)
    set_rating(away_team_id, new_rb)


# ── Bulk update from graded matches ───────────────────────────────────────────
def bulk_update_from_results(match_results: list[dict]):
    """
    Update Elo ratings from a list of match results.
    Each dict: {home_team_id, away_team_id, home_goals, away_goals}
    """
    for m in match_results:
        try:
            update_ratings(
                int(m["home_team_id"]), int(m["away_team_id"]),
                int(m["home_goals"]), int(m["away_goals"])
            )
        except (KeyError, ValueError, TypeError) as e:
            print(f"[Elo] Skipping result due to error: {e}")
    save_dirty_ratings()
    print(f"[Elo] Bulk update complete for {len(match_results)} matches.")


if __name__ == "__main__":
    # Quick demo
    probs = match_probabilities(12, 14)  # Fake team IDs
    print(f"Home Win: {probs['home_win']:.3f}")
    print(f"Draw:     {probs['draw']:.3f}")
    print(f"Away Win: {probs['away_win']:.3f}")
