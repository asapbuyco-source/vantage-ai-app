"""
api_football_client.py
───────────────────────
Centralized client for API-Football (v3).
Handles fetching fixtures, odds, predictions, and form/xG data.
Replaces sport_highlights_client, sportscore_client, and free_data_client.
"""

import os
import sys
import time
import json
import requests
from typing import Optional
from datetime import datetime, timedelta
from functools import lru_cache

API_KEY = os.environ.get("API_FOOTBALL_KEY", "")
BASE_URL = "https://v3.football.api-sports.io"

_session = requests.Session()
if API_KEY:
    _session.headers.update({"x-apisports-key": API_KEY})

# ── Request Budgeting ──────────────────────────────────────────────────────────
_call_counts = {
    "fixtures": 0,
    "odds": 0,
    "predictions": 0,
    "form": 0,
    "injuries": 0,
    "h2h": 0,
    "lineups": 0,
    "events": 0,
    "players": 0,
    "statistics": 0,
}

def reset_call_counts():
    global _call_counts
    _call_counts = {k: 0 for k in _call_counts}

def get_call_counts():
    return dict(_call_counts)

def _get(endpoint: str, params: dict = None, max_retries: int = 2, call_type: str = None) -> Optional[dict]:
    if not API_KEY:
        print("[API-Football] Error: API_FOOTBALL_KEY environment variable not set.", file=sys.stderr)
        return None

    if call_type:
        _call_counts[call_type] = _call_counts.get(call_type, 0) + 1

    url = f"{BASE_URL}/{endpoint}"
    for attempt in range(max_retries):
        try:
            resp = _session.get(url, params=params or {}, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                if "response" in data:
                    return data
            print(f"[API-Football] Error {resp.status_code} on {endpoint}: {resp.text[:200]}", file=sys.stderr)
        except Exception as e:
            print(f"[API-Football] Request exception on {endpoint}: {e}", file=sys.stderr)
        
        time.sleep(1)
    return None

def log_api_summary(fixtures_analyzed: int = 0, cache_hits: int = 0):
    total = sum(_call_counts.values())
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║              API-Football Call Summary                       ║
╠══════════════════════════════════════════════════════════════╣
║  Fixtures analyzed: {fixtures_analyzed}
║  Cache hits:       {cache_hits}
║  ──────────────────────────────────────────────────────────── ║
║  fixtures:   {_call_counts.get('fixtures', 0):>5}    odds:         {_call_counts.get('odds', 0):>5}       ║
║  predictions:{_call_counts.get('predictions', 0):>5}    injuries:     {_call_counts.get('injuries', 0):>5}       ║
║  form:       {_call_counts.get('form', 0):>5}    h2h:           {_call_counts.get('h2h', 0):>5}       ║
║  lineups:    {_call_counts.get('lineups', 0):>5}    events:       {_call_counts.get('events', 0):>5}       ║
║  statistics: {_call_counts.get('statistics', 0):>5}    players:      {_call_counts.get('players', 0):>5}       ║
╠══════════════════════════════════════════════════════════════╣
║  TOTAL API CALLS: {total}
╚══════════════════════════════════════════════════════════════╝
""")

# ── Cache Storage ──────────────────────────────────────────────────────────────
_CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")
os.makedirs(_CACHE_DIR, exist_ok=True)

def _cache_get(cache_key: str, ttl_minutes: int = 30) -> Optional[dict]:
    cache_file = os.path.join(_CACHE_DIR, f"{cache_key}.json")
    if not os.path.exists(cache_file):
        return None
    try:
        mtime = os.path.getmtime(cache_file)
        age_minutes = (time.time() - mtime) / 60
        if age_minutes > ttl_minutes:
            return None
        with open(cache_file, "r") as f:
            return json.load(f)
    except Exception:
        return None

def _cache_set(cache_key: str, data: dict):
    cache_file = os.path.join(_CACHE_DIR, f"{cache_key}.json")
    try:
        with open(cache_file, "w") as f:
            json.dump(data, f)
    except Exception as e:
        print(f"[API-Football] Cache write error for {cache_key}: {e}", file=sys.stderr)

# ── H2H Cache Key Helper ──────────────────────────────────────────────────────
def _h2h_cache_key(home_id: int, away_id: int) -> str:
    pair = tuple(sorted([home_id, away_id]))
    return f"h2h_{pair[0]}_{pair[1]}"

# ── API Functions ─────────────────────────────────────────────────────────────

def fetch_fixtures_by_date(date_str: str) -> list:
    """Fetch all fixtures for a given date (YYYY-MM-DD)."""
    data = _get("fixtures", {"date": date_str}, call_type="fixtures")
    return data.get("response", []) if data else []

def fetch_live_fixtures() -> list:
    """Fetch all currently live fixtures."""
    data = _get("fixtures", {"live": "all"}, call_type="fixtures")
    return data.get("response", []) if data else []

def fetch_odds_for_fixture(fixture_id: int, bookmaker_id: int = 8) -> dict:
    """
    Fetch pre-match odds for a fixture.
    bookmaker_id=8 is Bet365 (standard reliable bookie).
    Cached for 5-15 minutes pre-match.
    """
    cache_key = f"odds_{fixture_id}_{bookmaker_id}"
    cached = _cache_get(cache_key, ttl_minutes=10)
    if cached is not None:
        return cached

    data = _get("odds", {"fixture": fixture_id, "bookmaker": bookmaker_id}, call_type="odds")
    odds_data = {}
    
    if not data or not data.get("response"):
        return odds_data

    bets = data["response"][0].get("bookmakers", [{}])[0].get("bets", [])
    
    for bet in bets:
        market_name = bet.get("name")
        values = bet.get("values", [])
        
        if market_name == "Match Winner":
            for v in values:
                if str(v.get("value")) == "Home": odds_data["home_odds"] = float(v["odd"])
                elif str(v.get("value")) == "Draw": odds_data["draw_odds"] = float(v["odd"])
                elif str(v.get("value")) == "Away": odds_data["away_odds"] = float(v["odd"])
                
        elif market_name == "Goals Over/Under":
            for v in values:
                val_str = str(v.get("value"))
                if val_str == "Over 1.5": odds_data["over15_odds"] = float(v["odd"])
                elif val_str == "Under 1.5": odds_data["under15_odds"] = float(v["odd"])
                elif val_str == "Over 2.5": odds_data["over25_odds"] = float(v["odd"])
                elif val_str == "Under 2.5": odds_data["under25_odds"] = float(v["odd"])
                elif val_str == "Over 3.5": odds_data["over35_odds"] = float(v["odd"])
                elif val_str == "Under 3.5": odds_data["under35_odds"] = float(v["odd"])
                
        elif market_name == "Both Teams Score":
            for v in values:
                if str(v.get("value")) == "Yes": odds_data["btts_yes_odds"] = float(v["odd"])
                if str(v.get("value")) == "No": odds_data["btts_no_odds"] = float(v["odd"])
                
        elif market_name == "Double Chance":
            for v in values:
                if str(v.get("value")) == "Home/Draw": odds_data["dc_1x_odds"] = float(v["odd"])
                elif str(v.get("value")) == "Home/Away": odds_data["dc_12_odds"] = float(v["odd"])
                elif str(v.get("value")) == "Draw/Away": odds_data["dc_x2_odds"] = float(v["odd"])

        elif market_name == "Draw No Bet":
            for v in values:
                if str(v.get("value")) == "Home": odds_data["dnb_home_odds"] = float(v["odd"])
                if str(v.get("value")) == "Away": odds_data["dnb_away_odds"] = float(v["odd"])

    if odds_data:
        _cache_set(cache_key, odds_data)
    return odds_data

def fetch_predictions(fixture_id: int) -> dict:
    """Fetch native API-Football ML predictions for a fixture."""
    data = _get("predictions", {"fixture": fixture_id}, call_type="predictions")
    if not data or not data.get("response"):
        return {}
    
    pred = data["response"][0].get("predictions", {})
    return {
        "home_win": pred.get("percent", {}).get("home"),
        "draw": pred.get("percent", {}).get("draw"),
        "away_win": pred.get("percent", {}).get("away"),
        "advice": pred.get("advice"),
    }

def fetch_team_form_and_xg(team_id: int, limit: int = 10) -> tuple:
    """
    Fetch the last `limit` finished fixtures for a team.
    Returns (form_string, avg_scored, avg_conceded).
    Cached for 60 minutes by team_id.
    """
    cache_key = f"form_{team_id}_{limit}"
    cached = _cache_get(cache_key, ttl_minutes=60)
    if cached is not None:
        return cached.get("form_string", ""), cached.get("avg_scored"), cached.get("avg_conceded")

    data = _get("fixtures", {"team": team_id, "last": limit, "status": "FT"}, call_type="form")
    fixtures = data.get("response", []) if data else []
    
    if not fixtures:
        return "", None, None

    form_chars = []
    total_scored = 0
    total_conceded = 0
    
    for fix in reversed(fixtures):
        home_id = fix["teams"]["home"]["id"]
        away_id = fix["teams"]["away"]["id"]
        goals_home = fix["goals"]["home"]
        goals_away = fix["goals"]["away"]
        
        if goals_home is None or goals_away is None:
            continue
            
        is_home = (home_id == team_id)
        scored = goals_home if is_home else goals_away
        conceded = goals_away if is_home else goals_home
        
        total_scored += scored
        total_conceded += conceded
        
        if scored > conceded:
            form_chars.append("W")
        elif scored < conceded:
            form_chars.append("L")
        else:
            form_chars.append("D")

    form_string = " ".join(form_chars)
    count = len(form_chars)
    avg_scored = total_scored / count if count > 0 else None
    avg_conceded = total_conceded / count if count > 0 else None
    
    result = {
        "form_string": form_string,
        "avg_scored": avg_scored,
        "avg_conceded": avg_conceded,
    }
    _cache_set(cache_key, result)
    return form_string, avg_scored, avg_conceded

def fetch_injuries(fixture_id: int) -> dict:
    """
    Fetch sidelined players for a fixture.
    Cached for 30-60 minutes.
    """
    cache_key = f"injuries_{fixture_id}"
    cached = _cache_get(cache_key, ttl_minutes=30)
    if cached is not None:
        return cached

    data = _get("injuries", {"fixture": fixture_id}, call_type="injuries")
    injuries = data.get("response", []) if data else []
    
    sidelined = {}
    if not injuries:
        _cache_set(cache_key, sidelined)
        return sidelined
        
    for inj in injuries:
        team_id = inj["team"]["id"]
        if team_id not in sidelined:
            sidelined[team_id] = 0
        sidelined[team_id] += 1
    
    _cache_set(cache_key, sidelined)
    return sidelined

def fetch_h2h(home_id: int, away_id: int, limit: int = 10) -> dict:
    """
    Fetch head-to-head fixtures between two teams.
    Uses fixtures/headtohead endpoint.
    """
    data = _get("fixtures/headtohead", {
        "h2h": f"{home_id}-{away_id}",
        "last": limit
    }, call_type="h2h")
    
    fixtures = data.get("response", []) if data else []
    if not fixtures:
        return {"home_wins": 0, "away_wins": 0, "draws": 0, "avg_goals": 0.0, "btts_rate": 0.0}
    
    home_wins = 0
    away_wins = 0
    draws = 0
    total_goals = 0
    btts_count = 0
    
    for fix in fixtures:
        goals_home = fix.get("goals", {}).get("home")
        goals_away = fix.get("goals", {}).get("away")
        if goals_home is None or goals_away is None:
            continue
        total_goals += goals_home + goals_away
        if goals_home > goals_away:
            home_wins += 1
        elif goals_away > goals_home:
            away_wins += 1
        else:
            draws += 1
        if goals_home > 0 and goals_away > 0:
            btts_count += 1
    
    count = home_wins + away_wins + draws
    avg_goals = total_goals / count if count > 0 else 0.0
    btts_rate = btts_count / count if count > 0 else 0.0
    
    return {
        "home_wins": home_wins,
        "away_wins": away_wins,
        "draws": draws,
        "avg_goals": avg_goals,
        "btts_rate": btts_rate,
    }

def _fetch_h2h_cached(home_id: int, away_id: int, ttl_days: int = 7) -> tuple:
    """
    Fetch H2H data with caching (7-30 day TTL).
    Returns (home_wins, away_wins, draws, avg_goals, btts_rate).
    """
    cache_key = _h2h_cache_key(home_id, away_id)
    cached = _cache_get(cache_key, ttl_minutes=ttl_days * 24 * 60)
    if cached is not None:
        return (
            cached.get("home_wins", 0),
            cached.get("away_wins", 0),
            cached.get("draws", 0),
            cached.get("avg_goals", 0.0),
            cached.get("btts_rate", 0.0),
        )
    
    data = fetch_h2h(home_id, away_id)
    _cache_set(cache_key, data)
    return (
        data.get("home_wins", 0),
        data.get("away_wins", 0),
        data.get("draws", 0),
        data.get("avg_goals", 0.0),
        data.get("btts_rate", 0.0),
    )

def fetch_lineups(fixture_id: int) -> list:
    """Fetch lineups for a fixture (startXI and substitutes)."""
    data = _get("fixtures/lineups", {"fixture": fixture_id}, call_type="lineups")
    lineups = data.get("response", []) if data else []
    return lineups

def fetch_events(fixture_id: int) -> list:
    """Fetch events (goals, cards, substitutions) for a fixture."""
    data = _get("fixtures/events", {"fixture": fixture_id}, call_type="events")
    events = data.get("response", []) if data else []
    return events

def fetch_player_stats(fixture_id: int) -> dict:
    """Fetch player statistics for a fixture."""
    data = _get("fixtures/players", {"fixture": fixture_id}, call_type="players")
    players_data = data.get("response", []) if data else []
    result = {"home": [], "away": []}
    for entry in players_data:
        team = entry.get("team", {})
        is_home = entry.get("venue") == "Home" if "venue" in entry else False
        key = "home" if is_home else "away"
        result[key].append({
            "team_id": team.get("id"),
            "team_name": team.get("name", "Unknown"),
            "players": entry.get("players", []),
        })
    return result

def fetch_fixture_statistics(fixture_id: int) -> dict:
    """Fetch match statistics (possession, shots, corners, etc.) for a fixture."""
    data = _get("fixtures/statistics", {"fixture": fixture_id}, call_type="statistics")
    stats = data.get("response", []) if data else []
    result = {"home": {}, "away": {}}
    for entry in stats:
        team = entry.get("team", {})
        team_name = team.get("name", "Unknown")
        is_home = entry.get("venue") == "Home" if "venue" in entry else False
        key = "home" if is_home else "away"
        result[key] = {
            "team_id": team.get("id"),
            "team_name": team_name,
            "statistics": entry.get("statistics", []),
        }
    return result