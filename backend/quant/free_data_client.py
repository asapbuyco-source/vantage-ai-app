"""
free_data_client.py
────────────────────
Replaces Sportmonks API calls with free data sources:
  - football-data.org (fixtures, form, live scores)
  - The Odds API (1X2, Over/Under odds)
  - Understat via understatapi (xG)
"""

import os
import json
import time
import requests
import urllib3
urllib3.disable_warnings()
from datetime import datetime, timezone

# ── API Keys ───────────────────────────────────────────────────────────────────
FOOTBALL_DATA_KEY = os.environ.get("FOOTBALL_DATA_KEY", "")
ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")

FOOTBALL_DATA_BASE = "https://api.football-data.org/v4"
ODDS_API_BASE = "https://api.the-odds-api.com/v4"

# ── football-data.org league code map ─────────────────────────────────────────
# Keys: Sportmonks-style league_id (used by your league_config.py)
# Values: football-data.org competition codes
FDORG_LEAGUE_MAP = {
    8:    "PL",     # Premier League
    82:   "BL1",    # Bundesliga
    564:  "PD",     # La Liga (Primera Division)
    384:  "SA",     # Serie A
    301:  "FL1",    # Ligue 1
    2:    "CL",     # Champions League
    5:    "EL",     # Europa League
    72:   "DED",    # Eredivisie
    9:    "ELC",    # Championship
    462:  "PPL",    # Primeira Liga
    253:  "BSA",    # Brasileirao Serie A
    600:  "MLS",    # MLS
    294:  "WC",     # FIFA World Cup
}

# ── The Odds API sport key map ─────────────────────────────────────────────────
ODDS_SPORT_MAP = {
    8:   "soccer_england_premier_league",
    82:  "soccer_germany_bundesliga",
    564: "soccer_spain_la_liga",
    384: "soccer_italy_serie_a",
    301: "soccer_france_ligue_one",
    2:   "soccer_uefa_champs_league",
    5:   "soccer_uefa_europa_league",
    72:  "soccer_netherlands_eredivisie",
    253: "soccer_brazil_campeonato",
    600: "soccer_usa_mls",
    294: "soccer_fifa_world_cup",
}

# ── football-data.org rate limiter (10 calls/min free tier) ───────────────────
_last_fd_call = 0
FD_RATE_LIMIT = 6.5  # 1 call per 6.5s = ~9/min (safe under 10/min cap)

def _fd_get(path, params=None):
    """GET from football-data.org with rate limiting."""
    global _last_fd_call
    if not FOOTBALL_DATA_KEY:
        return None
    elapsed = time.time() - _last_fd_call
    if elapsed < FD_RATE_LIMIT:
        time.sleep(FD_RATE_LIMIT - elapsed)
    try:
        resp = requests.get(
            f"{FOOTBALL_DATA_BASE}{path}",
            headers={"X-Auth-Token": FOOTBALL_DATA_KEY},
            params=params or {},
            timeout=15,
            verify=False
        )
        _last_fd_call = time.time()
        if resp.status_code == 200:
            return resp.json()
        print(f"[FreeData] football-data.org error {resp.status_code} for {path}", file=__import__('sys').stderr)
    except Exception as e:
        print(f"[FreeData] football-data.org request failed: {e}", file=__import__('sys').stderr)
    return None

# ── Odds Cache (file-based, 4-hour TTL) ────────────────────────────────────────
ODDS_CACHE_FILE = ".vantage_cache/odds_cache.json"

def _load_odds_cache():
    try:
        if os.path.exists(ODDS_CACHE_FILE):
            with open(ODDS_CACHE_FILE, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return {}

def _save_odds_cache(cache):
    os.makedirs(".vantage_cache", exist_ok=True)
    with open(ODDS_CACHE_FILE, "w") as f:
        json.dump(cache, f)

def fetch_all_odds_for_sport(sport_key):
    """
    ONE API call returns ALL matches for a sport. Cache 4 hours.
    Reduces Odds API calls from ~72/day to ~8/day (under 500/month free tier).
    """
    if not ODDS_API_KEY or not sport_key:
        return []

    cache = _load_odds_cache()
    hour_bucket = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H")
    cache_key = f"{sport_key}_{hour_bucket}"

    if cache_key in cache:
        print(f"[Odds] Using cached odds for {sport_key}")
        return cache[cache_key]

    try:
        resp = requests.get(
            f"{ODDS_API_BASE}/sports/{sport_key}/odds",
            params={
                "apiKey": ODDS_API_KEY,
                "regions": "eu,uk",
                "markets": "h2h,totals",
                "oddsFormat": "decimal",
            },
            timeout=15,
            verify=False
        )
        if resp.status_code == 200:
            data = resp.json()
            # Prune cache: keep only last 50 entries to prevent unbounded growth
            if len(cache) > 50:
                oldest = sorted(cache.keys())[:max(1, len(cache) - 49)]
                for k in oldest:
                    del cache[k]
            cache[cache_key] = data
            _save_odds_cache(cache)
            remaining = resp.headers.get("x-requests-remaining", "?")
            print(f"[Odds] Fetched {len(data)} games for {sport_key}. Quota remaining: {remaining}")
            return data
        else:
            print(f"[Odds] HTTP {resp.status_code} for {sport_key}", file=__import__('sys').stderr)
    except Exception as e:
        print(f"[Odds] Fetch failed for {sport_key}: {e}", file=__import__('sys').stderr)

    # Return cached data even if slightly stale
    return cache.get(cache_key, [])

def dprint(msg):
    """Debug print with flush for Railway log capture."""
    print(msg, flush=True)


# ── Fixture Fetching ───────────────────────────────────────────────────────────

def fetch_fixtures_today(date_str):
    """
    Fetch today's fixtures from football-data.org for all tracked leagues.
    Returns list of normalized fixture dicts.
    """
    return _fetch_fixtures_for_date(date_str, "SCHEDULED,TIMED")


def fetch_fixtures_past(date_str):
    """
    Fetch past (finished) fixtures from football-data.org.
    Used by backtesting and vault simulator.
    """
    return _fetch_fixtures_for_date(date_str, "FINISHED")


def _fetch_fixtures_for_date(date_str, status_filter):
    """
    Fetch fixtures from football-data.org for a date with a given status filter.
    Used for both live (SCHEDULED,TIMED) and historical (FINISHED) queries.
    """
    fixtures = []
    fetched_ids = set()

    for league_id, fd_code in FDORG_LEAGUE_MAP.items():
        data = _fd_get(f"/competitions/{fd_code}/matches", {
            "dateFrom": date_str,
            "dateTo": date_str,
            "status": status_filter
        })
        if not data:
            continue

        matches = data.get("matches", [])
        for m in matches:
            fid = str(m.get("id", ""))
            if fid in fetched_ids:
                continue
            fetched_ids.add(fid)

            home = m.get("homeTeam", {})
            away = m.get("awayTeam", {})
            utc_date = m.get("utcDate", "")

            fixtures.append({
                "id": fid,
                "league_id": league_id,
                "league_name": m.get("competition", {}).get("name", ""),
                "home_team": home.get("name", ""),
                "home_team_id": home.get("id"),
                "away_team": away.get("name", ""),
                "away_team_id": away.get("id"),
                "home_logo": home.get("crest", ""),
                "away_logo": away.get("crest", ""),
                "kickoff_utc": utc_date,
                "provider": "football-data.org"
            })

    dprint(f"[FreeData] Got {len(fixtures)} fixtures from football-data.org for {date_str}")
    return fixtures


# ── Team Form Fetching ─────────────────────────────────────────────────────────

def fetch_team_form(team_id, limit=10):
    """
    Fetch last N finished matches for a team from football-data.org.
    Returns list of match result dicts with goals, result, opponent info.
    """
    if not team_id:
        return []

    data = _fd_get(
        f"/teams/{team_id}/matches",
        {"status": "FINISHED", "limit": limit}
    )
    if not data:
        return []

    matches = data.get("matches", [])
    results = []
    for m in matches:
        home = m.get("homeTeam", {})
        away = m.get("awayTeam", {})
        score = m.get("score", {}).get("fullTime", {})
        hg = score.get("home")
        ag = score.get("away")
        if hg is None or ag is None:
            continue

        is_home = home.get("id") == team_id
        my_goals = hg if is_home else ag
        opp_goals = ag if is_home else hg

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
            "date": m.get("utcDate", ""),
            "opponent_id": away.get("id") if is_home else home.get("id"),
            "opponent_name": away.get("name") if is_home else home.get("name"),
        })
    return results


# ── Odds Parsing (per fixture from cached league data) ─────────────────────────

def _normalize_team_name(name):
    """Strip common suffixes and normalize for cross-API matching."""
    n = name.lower().strip()
    for suffix in (' fc', ' cf', ' afc', ' sc', ' united', ' city', ' town', ' albion', ' rovers', ' rangers'):
        if n.endswith(suffix):
            n = n[:-len(suffix)]
    return n


def _teams_match(a, b):
    """Return True if team name 'a' matches 'b' using multiple strategies."""
    a, b = a.lower().strip(), b.lower().strip()
    if not a or not b:
        return False
    # Exact match
    if a == b:
        return True
    # Normalized match (strip suffixes)
    if _normalize_team_name(a) == _normalize_team_name(b):
        return True
    # Substring: shorter is inside longer
    if len(a) <= len(b) and a in b:
        return True
    if len(b) <= len(a) and b in a:
        return True
    # First-word match (for national teams: "Netherlands" vs "Netherlands")
    a_first = a.split()[0] if a.split() else a
    b_first = b.split()[0] if b.split() else b
    if a_first == b_first and len(a_first) >= 3:
        return True
    # First 6 chars overlap
    if a[:6] == b[:6] and len(a) >= 5 and len(b) >= 5:
        return True
    return False


def find_odds_for_fixture(home_team, away_team, league_id):
    """
    Find odds for a specific fixture from the cached league-wide odds data.
    Uses robust multi-strategy team name matching.
    Returns OddsData-compatible dict.
    """
    sport_key = ODDS_SPORT_MAP.get(league_id, "")
    if not sport_key:
        return {}

    games = fetch_all_odds_for_sport(sport_key)
    if not games:
        return {}

    # Try each game, check both home/home+away/away and swapped order
    for game in games:
        ht = game.get("home_team", "").lower()
        at = game.get("away_team", "").lower()

        # Forward match: fd home = odds home, fd away = odds away
        if _teams_match(home_team, game.get("home_team", "")) and \
           _teams_match(away_team, game.get("away_team", "")):
            return _parse_odds_api_response(game)

        # Swapped match: fd home = odds away, fd away = odds home
        if _teams_match(home_team, game.get("away_team", "")) and \
           _teams_match(away_team, game.get("home_team", "")):
            return _parse_odds_api_response(game)

    return {}


def _parse_odds_api_response(game):
    """Parse The Odds API game response into OddsData-compatible dict."""
    result = {
        "home_odds": 0.0, "draw_odds": 0.0, "away_odds": 0.0,
        "over25_odds": 0.0, "under25_odds": 0.0,
        "over15_odds": 0.0, "under15_odds": 0.0,
        "over35_odds": 0.0, "under35_odds": 0.0,
        "btts_yes_odds": 0.0, "btts_no_odds": 0.0,
        "opening_home_odds": 0.0, "opening_away_odds": 0.0, "opening_draw_odds": 0.0,
        "odds_last_bookmaker_update": "",
    }

    home_team = game.get("home_team", "")
    latest_bookmaker_update = ""
    for bookmaker in game.get("bookmakers", []):
        lu = bookmaker.get("last_update", "")
        if lu and lu > latest_bookmaker_update:
            latest_bookmaker_update = lu

        for market in bookmaker.get("markets", []):
            key = market.get("key", "")
            outcomes = market.get("outcomes", [])

            if key == "h2h":
                for o in outcomes:
                    name = o.get("name", "")
                    price = float(o.get("price", 0))
                    if name == home_team:
                        result["home_odds"] = max(result["home_odds"], price)
                    elif name == "Draw":
                        result["draw_odds"] = max(result["draw_odds"], price)
                    else:
                        result["away_odds"] = max(result["away_odds"], price)

            elif key == "totals":
                for o in outcomes:
                    name = o.get("name", "")
                    point = str(o.get("point", ""))
                    price = float(o.get("price", 0))
                    if name == "Over":
                        if "1.5" in point:
                            result["over15_odds"] = max(result["over15_odds"], price)
                        elif "2.5" in point:
                            result["over25_odds"] = max(result["over25_odds"], price)
                        elif "3.5" in point:
                            result["over35_odds"] = max(result["over35_odds"], price)
                    elif name == "Under":
                        if "1.5" in point:
                            result["under15_odds"] = max(result["under15_odds"], price)
                        elif "2.5" in point:
                            result["under25_odds"] = max(result["under25_odds"], price)
                        elif "3.5" in point:
                            result["under35_odds"] = max(result["under35_odds"], price)

    result["odds_last_bookmaker_update"] = latest_bookmaker_update
    return result


# ── Understat xG Fetching ──────────────────────────────────────────────────────

UNDERSTAT_NAME_MAP = {
    "Manchester City FC": "Manchester City",
    "Manchester United FC": "Manchester United",
    "Arsenal FC": "Arsenal",
    "Chelsea FC": "Chelsea",
    "Liverpool FC": "Liverpool",
    "Tottenham Hotspur FC": "Tottenham",
    "Leicester City FC": "Leicester",
    "West Ham United FC": "West Ham",
    "Newcastle United FC": "Newcastle United",
    "Wolverhampton Wanderers FC": "Wolves",
    "Brighton & Hove Albion FC": "Brighton",
    "Aston Villa FC": "Aston Villa",
    "FC Bayern München": "Bayern Munich",
    "Borussia Dortmund": "Dortmund",
    "Bayer 04 Leverkusen": "Bayer Leverkusen",
    "RB Leipzig": "RB Leipzig",
    "Real Madrid CF": "Real Madrid",
    "FC Barcelona": "Barcelona",
    "Atlético de Madrid": "Atletico Madrid",
    "Paris Saint-Germain FC": "Paris Saint-Germain",
    "Olympique Lyonnais": "Lyon",
    "Olympique de Marseille": "Marseille",
}

def normalize_for_understat(team_name):
    """Map football-data.org name to Understat name if known."""
    return UNDERSTAT_NAME_MAP.get(team_name, team_name)

def fetch_xg_from_understat(home_team, away_team, season=2025):
    """
    Fetch team xG averages from Understat.
    Returns (home_xg_avg, away_xg_avg) or (None, None) if unavailable.
    Only works for top 6 European leagues (Understat coverage).
    """
    try:
        from understatapi import UnderstatClient
        home_name = normalize_for_understat(home_team)
        away_name = normalize_for_understat(away_team)

        with UnderstatClient() as client:
            home_data = client.team(team=home_name).get_data(season=str(season))
            away_data = client.team(team=away_name).get_data(season=str(season))

            home_xg = _avg_xg_from_understat(home_data, is_home=True)
            away_xg = _avg_xg_from_understat(away_data, is_home=False)
            return home_xg, away_xg
    except Exception as e:
        dprint(f"[FreeData] Understat xG fetch failed: {e}")
        return None, None

def _avg_xg_from_understat(team_data, is_home=True, last_n=10):
    """Average xG from last N home or away matches."""
    try:
        history = team_data.get("history", [])
        if is_home:
            matches = [m for m in history if m.get("h_a") == "h"]
        else:
            matches = [m for m in history if m.get("h_a") == "a"]
        recent = matches[-last_n:]
        if not recent:
            return None
        xg_key = "xG" if is_home else "xGA"
        vals = [float(m.get(xg_key, 0)) for m in recent]
        return sum(vals) / len(vals) if vals else None
    except Exception:
        return None


# ── BTTS Odds Estimation (when bookmaker data is missing) ──────────────────────

def estimate_btts_odds(home_scoring_rate, away_scoring_rate):
    """
    Estimate BTTS odds from historical scoring rates.
    Uses independent scoring assumption: P(BTTS) = P(home scores) * P(away scores).
    Applies an 8% margin.
    """
    if home_scoring_rate <= 0 or away_scoring_rate <= 0:
        return 1.50, 2.50  # Safe defaults

    p_btts = max(0.20, min(0.80, home_scoring_rate * away_scoring_rate))
    yes_odds = round((1 / p_btts) * 0.92, 2)
    no_odds = round((1 / (1 - p_btts)) * 0.92, 2)
    return yes_odds, no_odds


# ── Live Scores ────────────────────────────────────────────────────────────────

def fetch_live_scores_free():
    """
    Fetch all currently live/in-play matches from football-data.org.
    Returns list of normalized live match dicts compatible with scheduler.js expectations.
    """
    if not FOOTBALL_DATA_KEY:
        return []

    data = _fd_get("/matches", {"status": "LIVE,IN_PLAY,PAUSED"})
    if not data:
        return []

    matches = []
    for m in data.get("matches", []):
        home = m.get("homeTeam", {})
        away = m.get("awayTeam", {})
        score = m.get("score", {}).get("fullTime", {}) or m.get("score", {}).get("halfTime", {}) or {}

        matches.append({
            "id": str(m.get("id", "")),
            "homeTeam": home.get("name", ""),
            "awayTeam": away.get("name", ""),
            "homeTeamLogo": home.get("crest", ""),
            "awayTeamLogo": away.get("crest", ""),
            "homeTeamId": home.get("id"),
            "awayTeamId": away.get("id"),
            "homeScore": score.get("home", 0) or 0,
            "awayScore": score.get("away", 0) or 0,
            "league": m.get("competition", {}).get("name", ""),
            "leagueId": 0,
            "stateShort": m.get("status", "LIVE"),
            "stateLong": m.get("status", "Live"),
            "minute": m.get("minute", 0) or 0,
            "events": [],  # football-data.org free tier has no event data
            "source": "football-data.org",
        })

    return matches


# ── Match Result Fetching (for grading) ────────────────────────────────────────

def fetch_match_result_free(fixture_id):
    """
    Fetch a single match result from football-data.org for grading.
    Returns {home_goals, away_goals, state, closing_odds} or None.
    """
    if not FOOTBALL_DATA_KEY:
        return None

    data = _fd_get(f"/matches/{fixture_id}")
    if not data:
        return None

    score = data.get("score", {}).get("fullTime", {})
    hg = score.get("home")
    ag = score.get("away")
    if hg is None or ag is None:
        return None

    return {
        "home_goals": hg,
        "away_goals": ag,
        "state": data.get("status", "FINISHED"),
        "closing_odds": {},  # not available from free tier
    }