"""
fotmob_client.py
────────────────
Fotmob API client as an alternative for:
  - Live score backup
  - In-match xG polling
  - Detailed match statistics

Source: https://www.fotmob.com/
"""

import os
import sys
import requests
from datetime import datetime, timezone
from typing import Optional

FOTMOB_BASE = "https://www.fotmob.com/api"

def fetch_match_details(match_id: int) -> Optional[dict]:
    """
    Fetch detailed match information from Fotmob.
    Includes xG, shots, and other match statistics.
    """
    try:
        resp = requests.get(
            f"{FOTMOB_BASE}/matchDetails?matchId={match_id}",
            timeout=15,
            verify=True,
        )
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception as e:
        print(f"[Fotmob] Match details fetch failed for {match_id}: {e}", file=sys.stderr)
        return None

def fetch_live_matches() -> list:
    """
    Fetch all currently live matches from Fotmob.
    Returns list of match dicts with basic info.
    """
    try:
        resp = requests.get(
            f"{FOTMOB_BASE}/matches?date=current",
            timeout=15,
            verify=True,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        leagues = data.get("leagues", [])
        matches = []
        for league in leagues:
            for match in league.get("matches", []):
                matches.append(_normalize_fotmob_match(match, league))
        return matches
    except Exception as e:
        print(f"[Fotmob] Live matches fetch failed: {e}", file=sys.stderr)
        return []

def fetch_team_matches(team_id: int, limit: int = 10) -> list:
    """
    Fetch recent matches for a team from Fotmob.
    Returns list of match result dicts.
    """
    try:
        resp = requests.get(
            f"{FOTMOB_BASE}/teams?teamId={team_id}&limit={limit}",
            timeout=15,
            verify=True,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        matches = data.get("matches", [])
        results = []
        for m in matches:
            try:
                home = m.get("home", {})
                away = m.get("away", {})
                is_home = home.get("id") == team_id
                my_score = home.get("score", 0) if is_home else away.get("score", 0)
                opp_score = away.get("score", 0) if is_home else home.get("score", 0)
                if my_score > opp_score:
                    result = "W"
                elif my_score < opp_score:
                    result = "L"
                else:
                    result = "D"
                results.append({
                    "result": result,
                    "goals_scored": my_score,
                    "goals_conceded": opp_score,
                    "is_home": is_home,
                    "date": m.get("date", ""),
                    "opponent_name": away.get("name", "") if is_home else home.get("name", ""),
                })
            except Exception:
                continue
        return results
    except Exception as e:
        print(f"[Fotmob] Team matches fetch failed for {team_id}: {e}", file=sys.stderr)
        return []

def _normalize_fotmob_match(match: dict, league: dict) -> dict:
    """Normalize Fotmob match to common format."""
    home = match.get("home", {})
    away = match.get("away", {})
    return {
        "id": str(match.get("id", "")),
        "homeTeam": home.get("name", ""),
        "awayTeam": away.get("name", ""),
        "homeTeamLogo": home.get("imageUrl", ""),
        "awayTeamLogo": away.get("imageUrl", ""),
        "homeTeamId": home.get("id"),
        "awayTeamId": away.get("id"),
        "homeScore": home.get("score", 0),
        "awayScore": away.get("score", 0),
        "league": league.get("name", ""),
        "leagueId": league.get("id", 0),
        "stateShort": match.get("status", ""),
        "stateLong": match.get("status", "Live"),
        "minute": match.get("minute", 0),
        "source": "fotmob",
    }
