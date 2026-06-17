"""
international_data.py
──────────────────────
Dedicated module using soccerdata (FBref) for fetching international team data:
  - Team form and recent results
  - xG (expected goals) from FBref
  - Head-to-head records
  - Separate Elo handling for international matches

Used for FIFA World Cup and other international tournaments.
"""

import os
import sys
from datetime import datetime, timezone
from typing import Optional

try:
    import soccerdata as sd
except ImportError:
    sd = None

INTL_ELO_SEEDS = {
    "Argentina": 2091,
    "Brazil": 2084,
    "France": 2066,
    "England": 2060,
    "Spain": 2048,
    "Germany": 2038,
    "Italy": 2027,
    "Netherlands": 2015,
    "Portugal": 2012,
    "Belgium": 1998,
    "Croatia": 1992,
    "Uruguay": 1987,
    "Mexico": 1968,
    "Colombia": 1965,
    "United States": 1958,
    "Japan": 1955,
    "Morocco": 1952,
    "Senegal": 1948,
    "Netherlands": 1945,
    "Denmark": 1942,
    "Switzerland": 1938,
    "Portugal": 1935,
    "Sweden": 1932,
    "Poland": 1928,
    "Ukraine": 1924,
    "Wales": 1921,
    "Chile": 1918,
    "Ecuador": 1915,
    "Peru": 1912,
    "Australia": 1908,
    "South Korea": 1905,
    "Nigeria": 1902,
    "Serbia": 1898,
    "Cameroon": 1895,
    "Ghana": 1892,
    "Ivory Coast": 1888,
    "Algeria": 1885,
    "Egypt": 1882,
    "Qatar": 1878,
    "Iran": 1875,
    "Costa Rica": 1872,
    "Saudi Arabia": 1868,
    "Tunisia": 1865,
    "Canada": 1862,
    "New Zealand": 1858,
    "Panama": 1855,
    "South Africa": 1852,
}

INTL_ELO_CACHE = INTL_ELO_SEEDS.copy()

def get_intl_elo(team_name: str) -> float:
    """Get international Elo rating for a team. Returns default 1850 if unknown."""
    return INTL_ELO_CACHE.get(team_name, 1850.0)

def intl_match_probabilities(home_elo: float, away_elo: float) -> dict:
    """
    Calculate match probabilities based on international Elo ratings.
    Uses the standard Elo formula with home advantage (~100 Elo points).
    """
    HOME_ADVANTAGE = 100
    adj_home = home_elo + HOME_ADVANTAGE
    elo_diff = adj_home - away_elo
    exp_home = 1 / (1 + 10 ** ((away_elo - adj_home) / 400))
    exp_away = 1 - exp_home
    exp_draw = 1 - abs(exp_home - exp_away)
    total = exp_home + exp_away + exp_draw
    if total > 0:
        exp_home /= total
        exp_away /= total
        exp_draw /= total
    return {
        "home_win": round(exp_home, 4),
        "draw": round(exp_draw, 4),
        "away_win": round(exp_away, 4),
    }

def fetch_intl_xg(home_team: str, away_team: str) -> tuple:
    """
    Fetch xG for international teams using soccerdata (FBref).
    Returns (home_xg_avg, away_xg_avg) or (None, None) if unavailable.
    """
    if sd is None:
        return None, None
    try:
        fbref = sd.FBREf(leagues=["FIFA World Cup"])
        team_names = [home_team, away_team]
        xgs = {}
        for team in team_names:
            try:
                team_data = fbref.read_team_history([team])
                if team_data is not None and not team_data.empty:
                    recent = team_data.tail(10)
                    if "xG" in recent.columns:
                        xgs[team] = recent["xG"].mean()
                    elif "xG" in str(team_data.columns):
                        xgs[team] = team_data["xG"].tail(10).mean()
            except Exception:
                pass
        home_xg = xgs.get(home_team)
        away_xg = xgs.get(away_team)
        return (home_xg, away_xg) if home_xg and away_xg else (None, None)
    except Exception as e:
        print(f"[InternationalData] FBref xG fetch failed: {e}", file=sys.stderr)
        return None, None

def fetch_intl_form(team_id_or_name, limit=10) -> list:
    """
    Fetch recent international match results using soccerdata (FBref).
    Returns list of match result dicts with goals, result, opponent info.
    """
    if sd is None:
        return []
    try:
        fbref = sd.FBREf(leagues=["FIFA World Cup"])
        team_name = str(team_id_or_name)
        results = []
        try:
            team_data = fbref.read_team_history([team_name])
            if team_data is not None and not team_data.empty:
                recent = team_data.tail(limit)
                for _, row in recent.iterrows():
                    try:
                        date = row.get("Date", "") or row.index[0] if hasattr(row, "index") else ""
                        home_goals = row.get("GF", 0)
                        away_goals = row.get("GA", 0)
                        opponent = row.get("Opponent", "Unknown")
                        venue = row.get("Venue", "")
                        is_home = venue.upper() == "Home" if venue else True
                        my_goals = home_goals if is_home else away_goals
                        opp_goals = away_goals if is_home else home_goals
                        if my_goals > opp_goals:
                            result = "W"
                        elif my_goals < opp_goals:
                            result = "L"
                        else:
                            result = "D"
                        results.append({
                            "result": result,
                            "goals_scored": my_goals,
                            "goals_conceded": opp_goals,
                            "is_home": is_home,
                            "date": str(date),
                            "opponent_name": opponent,
                        })
                    except Exception:
                        continue
        except Exception as e:
            print(f"[InternationalData] FBref form fetch failed for {team_name}: {e}", file=sys.stderr)
        return results
    except Exception as e:
        print(f"[InternationalData] FBref initialization failed: {e}", file=sys.stderr)
        return []

def fetch_intl_h2h(home_team: str, away_team: str, limit: int = 8) -> tuple:
    """
    Fetch head-to-head records between two international teams.
    Returns (home_wins, away_wins, draws, avg_goals, btts_rate).
    """
    if sd is None:
        return (0, 0, 0, 2.0, 0.45)
    try:
        fbref = sd.FBREf(leagues=["FIFA World Cup"])
        all_matches = fbref.read_team_history([home_team, away_team])
        if all_matches is None or all_matches.empty:
            return (0, 0, 0, 2.0, 0.45)
        h2h = all_matches[
            (all_matches["Home"] == home_team) & (all_matches["Away"] == away_team) |
            (all_matches["Home"] == away_team) & (all_matches["Away"] == home_team)
        ].tail(limit)
        hw = aw = dr = total_goals = btts_count = 0
        for _, row in h2h.iterrows():
            try:
                hg = int(row.get("GF", 0))
                ag = int(row.get("GA", 0))
                if row.get("Home") == home_team:
                    if hg > ag: hw += 1
                    elif ag > hg: aw += 1
                    else: dr += 1
                else:
                    if ag > hg: hw += 1
                    elif hg > ag: aw += 1
                    else: dr += 1
                total_goals += hg + ag
                if hg > 0 and ag > 0:
                    btts_count += 1
            except Exception:
                continue
        n = hw + aw + dr
        avg_goals = total_goals / n if n > 0 else 2.0
        btts_rate = btts_count / n if n > 0 else 0.45
        return (hw, aw, dr, round(avg_goals, 2), round(btts_rate, 3))
    except Exception as e:
        print(f"[InternationalData] FBref H2H fetch failed: {e}", file=sys.stderr)
        return (0, 0, 0, 2.0, 0.45)
