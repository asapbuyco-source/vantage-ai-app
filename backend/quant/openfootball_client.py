"""
openfootball_client.py
──────────────────────
Client for parsing raw OpenFootball JSON data from GitHub.
Provides:
  - Historical H2H records
  - Dynamic league goal averages
  - Match data for clubs and national teams

Data source: https://github.com/openfootball/football.json
"""

import os
import sys
import requests
import urllib3
urllib3.disable_warnings()
from datetime import datetime, timezone
from typing import Optional

OPENFOOTBALL_GITHUB = "https://raw.githubusercontent.com/openfootball/football.json/master"

_league_goal_avgs: dict[int, float] = {}
_h2h_cache: dict[str, tuple] = {}

def fetch_league_matches(league_code: str, season: str = "2023-2024") -> list:
    """
    Fetch match data for a given league and season from OpenFootball.
    League codes: "eng.1" (Premier League), "de.1" (Bundesliga), "es.1" (La Liga), etc.
    """
    try:
        url = f"{OPENFOOTBALL_GITHUB}/{league_code}/{season}.json"
        resp = requests.get(url, timeout=30, verify=False)
        if resp.status_code != 200:
            print(f"[OpenFootball] Fetch error for {league_code}/{season}: {resp.status_code}", file=sys.stderr)
            return []
        data = resp.json()
        return data.get("matches", [])
    except Exception as e:
        print(f"[OpenFootball] Fetch failed for {league_code}/{season}: {e}", file=sys.stderr)
        return []

def get_league_avg_goals(league_id: int, season: str = "2023-2024") -> float:
    """
    Calculate average goals per match for a league from OpenFootball data.
    Caches results in memory.
    """
    global _league_goal_avgs
    cache_key = f"{league_id}_{season}"
    if cache_key in _league_goal_avgs:
        return _league_goal_avgs[cache_key]
    league_code_map = {
        8: "eng.1",    # Premier League
        82: "de.1",    # Bundesliga
        564: "es.1",   # La Liga
        384: "it.1",   # Serie A
        301: "fr.1",   # Ligue 1
        2: "eu.1",     # Champions League
        5: "eu.2",     # Europa League
    }
    league_code = league_code_map.get(league_id)
    if not league_code:
        return 2.70
    matches = fetch_league_matches(league_code, season)
    if not matches:
        return 2.70
    total_goals = 0
    valid_matches = 0
    for m in matches:
        try:
            hg = int(m.get("score", {}).get("ft", [0, 0])[0])
            ag = int(m.get("score", {}).get("ft", [0, 0])[1])
            if hg > 0 or ag > 0:
                total_goals += hg + ag
                valid_matches += 1
        except Exception:
            continue
    avg = total_goals / valid_matches if valid_matches > 0 else 2.70
    _league_goal_avgs[cache_key] = avg
    return avg

def fetch_h2h_openfootball(home_team: str, away_team: str, league_code: str = None) -> tuple:
    """
    Fetch H2H records between two teams from OpenFootball data.
    Returns (home_wins, away_wins, draws, avg_goals, btts_rate).
    """
    cache_key = f"{home_team}_{away_team}"
    if cache_key in _h2h_cache:
        return _h2h_cache[cache_key]
    hw = aw = dr = total_goals = btts_count = 0
    if league_code:
        all_matches = fetch_league_matches(league_code)
    else:
        all_matches = []
        for code in ["eng.1", "de.1", "es.1", "it.1", "fr.1"]:
            all_matches.extend(fetch_league_matches(code))
    for m in all_matches:
        try:
            team1 = m.get("team1", {}).get("name", "")
            team2 = m.get("team2", {}).get("name", "")
            if not ((team1 == home_team and team2 == away_team) or
                    (team1 == away_team and team2 == home_team)):
                continue
            score = m.get("score", {}).get("ft", [0, 0])
            hg = int(score[0])
            ag = int(score[1])
            if hg is None or ag is None:
                continue
            if team1 == home_team:
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
    avg_goals = total_goals / n if n > 0 else 2.70
    btts_rate = btts_count / n if n > 0 else 0.45
    result = (hw, aw, dr, round(avg_goals, 2), round(btts_rate, 3))
    _h2h_cache[cache_key] = result
    return result
