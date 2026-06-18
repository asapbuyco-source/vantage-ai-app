"""
sportscore_client.py
────────────────────
RapidAPI client for SportScore1 API to fetch team recent match history.
Used as the definitive source for team statistics when football-data.org
and understat are unavailable or rate-limited.

Endpoint: /events/search (POST)
Host: sportscore1.p.rapidapi.com
"""

import os
import sys
import requests
import urllib3
from datetime import datetime, timezone
from typing import Optional

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

RAPIDAPI_KEY = os.environ.get('RAPIDAPI_KEY', '96329fba36msh293dfd95c0b7196p102286jsndc9aa594e4c3')
RAPIDAPI_HOST = 'sportscore1.p.rapidapi.com'

_session = requests.Session()
_session.headers.update({
    'x-rapidapi-host': RAPIDAPI_HOST,
    'x-rapidapi-key': RAPIDAPI_KEY,
    'Content-Type': 'application/json'
})
_session.verify = False

BASE_URL = f"https://{RAPIDAPI_HOST}"


def _post(endpoint: str, data: dict, timeout: int = 20) -> Optional[dict]:
    """POST request to SportScore1 API."""
    try:
        resp = _session.post(f"{BASE_URL}{endpoint}", params=data, timeout=timeout)
        if resp.status_code == 200:
            return resp.json()
        print(f"[SportScore] POST {endpoint} returned {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"[SportScore] POST error on {endpoint}: {e}", file=sys.stderr)
    return None


def get_team_id(team_name: str) -> Optional[int]:
    """Lookup the team ID using SportScore1 API."""
    if isinstance(team_name, str) and team_name.isdigit():
        return int(team_name)
    data = {"name": team_name}
    resp = _post("/teams/search", data)
    if not resp or not resp.get("data"):
        return None
    for team in resp["data"]:
        # Try to find exact match
        if team.get("name", "").lower() == team_name.lower():
            return team["id"]
    # Fallback to first result
    return resp["data"][0]["id"]


def fetch_team_recent_matches(team_name: str, limit: int = 10) -> list:
    """
    Fetch the last N finished matches for a team using SportScore1 API.
    Returns list of match result dicts with goals, result, opponent info.
    """
    team_id = get_team_id(team_name)
    if not team_id:
        print(f"[SportScore] Could not find team ID for {team_name}", file=sys.stderr)
        return []

    # Fetch home matches
    home_resp = _post("/events/search", {"home_team_id": team_id, "status": "finished", "page": 1})
    home_events = home_resp.get("data", []) if home_resp else []

    # Fetch away matches
    away_resp = _post("/events/search", {"away_team_id": team_id, "status": "finished", "page": 1})
    away_events = away_resp.get("data", []) if away_resp else []

    all_events = home_events + away_events
    # Sort by start_at descending
    all_events.sort(key=lambda x: x.get("start_at", ""), reverse=True)

    results = []
    for event in all_events:
        home_team = event.get('home_team', {})
        away_team = event.get('away_team', {})
        
        # Get scores, handle both dict and int formats
        h_score_raw = event.get('home_score')
        a_score_raw = event.get('away_score')
        
        home_score = h_score_raw.get('display', h_score_raw.get('current')) if isinstance(h_score_raw, dict) else h_score_raw
        away_score = a_score_raw.get('display', a_score_raw.get('current')) if isinstance(a_score_raw, dict) else a_score_raw

        if home_score is None or away_score is None:
            continue

        is_home = event.get('home_team_id') == team_id

        if is_home:
            my_score = home_score
            opp_score = away_score
            opp_name = away_team.get('name', '')
            opp_id = away_team.get('id')
        else:
            my_score = away_score
            opp_score = home_score
            opp_name = home_team.get('name', '')
            opp_id = home_team.get('id')

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
            "date": event.get('start_at', ''),
            "opponent_name": opp_name or '',
            "opponent_id": opp_id or 0,
        })

        if len(results) >= limit:
            break

    return results


def compute_team_xg(team_name: str, limit: int = 10) -> tuple:
    """
    Compute average xG (goals scored/conceded) for a team from recent matches.
    Returns (avg_scored, avg_conceded) tuple.
    """
    matches = fetch_team_recent_matches(team_name, limit=limit)

    if not matches:
        return None, None

    all_scored = [m["goals_scored"] for m in matches]
    all_conceded = [m["goals_conceded"] for m in matches]

    avg_scored = sum(all_scored) / len(all_scored) if all_scored else None
    avg_conceded = sum(all_conceded) / len(all_conceded) if all_conceded else None

    return avg_scored, avg_conceded


if __name__ == '__main__':
    test_teams = ["Manchester City", "Liverpool", "Arsenal"]
    for team in test_teams:
        matches = fetch_team_recent_matches(team, limit=5)
        avg_scored, avg_conceded = compute_team_xg(team, limit=5)
        print(f"\n{team}:")
        print(f"  Matches found: {len(matches)}")
        print(f"  Avg scored: {avg_scored}")
        print(f"  Avg conceded: {avg_conceded}")
        if matches:
            form = " ".join([m["result"] for m in matches[:5]])
            print(f"  Form (last 5): {form}")
