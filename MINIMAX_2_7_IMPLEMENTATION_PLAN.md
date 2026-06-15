# Vantage AI — MiniMax 2.7 Implementation Plan (Revised)

> **Target Executor**: MiniMax M2.7 AI Model  
> **Codebase**: `C:\Users\pc\Downloads\vantage-ai`  
> **Supersedes**: Original `MINIMAX_2_7_IMPLEMENTATION_PLAN.md`  
> **Date**: June 2026  
> **Context**: Sportmonks API is dead. Migrate entire data pipeline to the free stack: football-data.org + The Odds API + Understat + API-Football + OpenFootball.

---

## ⚠️ Instructions for MiniMax

Execute all phases **sequentially**. Each task has an explicit **Action** block with exact code. Do not paraphrase or infer — apply the code exactly as written. Run the **Validation** command after each task before proceeding. If a validation fails, fix it before continuing.

Python files live in `backend/quant/`. JavaScript files live at the project root or `backend/`. TypeScript/React files live in `pages/`, `components/`, `context/`, or `services/`.

---

## Environment Variables Required

Before starting, ensure these are set in `.env.local`:

```bash
# football-data.org — free tier, instant signup at football-data.org
FOOTBALL_DATA_KEY=your_key_here

# The Odds API — free tier (500 credits/month), already in your env for basketball
ODDS_API_KEY=your_existing_key

# API-Football — already configured (free plan, 100 calls/day)
API_FOOTBALL_KEY=your_existing_key
```

---

## Phase 1 — Free Data Stack: Core Client

### Task 1.1 — Create `free_data_client.py`

**File (NEW):** `backend/quant/free_data_client.py`

**Problem:** No Sportmonks replacement exists. We need a single module that fetches fixtures, form, odds, and xG from the free sources.

**Action:** Create the file with this exact content:

```python
"""
free_data_client.py
────────────────────
Replaces Sportmonks API calls with free data sources:
  - football-data.org (fixtures, form, live scores)
  - The Odds API (1X2, Over/Under odds)
  - Understat via understatapi (xG)
  - OpenFootball (historical results — future phase)
"""

import os
import json
import time
import requests
import urllib.request
import urllib.error
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
    # World Cup (id varies — handled dynamically)
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
}

# ── football-data.org rate limiter (10 calls/min free) ────────────────────────
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
            timeout=15
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
    Reduces Odds API calls from ~72/day to ~8/day.
    """
    if not ODDS_API_KEY or not sport_key:
        return []

    cache = _load_odds_cache()
    hour_bucket = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H")
    # Cache for 4 hours by storing 4 hourly buckets
    cache_key = f"{sport_key}_{hour_bucket}"

    if cache_key in cache:
        data = cache[cache_key]
        if data:
            print(f"[Odds] Using cached odds for {sport_key}")
            return data

    try:
        resp = requests.get(
            f"{ODDS_API_BASE}/sports/{sport_key}/odds",
            params={
                "apiKey": ODDS_API_KEY,
                "regions": "eu,uk",
                "markets": "h2h,totals",
                "oddsFormat": "decimal",
            },
            timeout=15
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
            print(f"[Odds] Fetched {len(data)} games for {sport_key}. Quota: {remaining}")
            return data
        else:
            dprint(f"[Odds] HTTP {resp.status_code} for {sport_key}")
    except Exception as e:
        print(f"[Odds] Fetch failed for {sport_key}: {e}", file=__import__('sys').stderr)

    # Return cached data even if slightly stale
    return cache.get(cache_key, [])

def dprint(msg):
    """Debug print — use print() with flush=True so Railway captures output."""
    print(msg, flush=True)


# ── Fixture Fetching ───────────────────────────────────────────────────────────

def fetch_fixtures_today(date_str):
    """
    Fetch today's fixtures from football-data.org for all tracked leagues.
    Returns list of normalized fixture dicts.
    """
    fixtures = []
    fetched_ids = set()

    for league_id, fd_code in FDORG_LEAGUE_MAP.items():
        data = _fd_get(f"/competitions/{fd_code}/matches", {
            "dateFrom": date_str,
            "dateTo": date_str,
            "status": "SCHEDULED,TIMED"
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

def find_odds_for_fixture(home_team, away_team, league_id):
    """
    Find odds for a specific fixture from the cached league-wide odds data.
    Returns OddsData-compatible dict.
    """
    sport_key = ODDS_SPORT_MAP.get(league_id, "")
    if not sport_key:
        return {}

    games = fetch_all_odds_for_sport(sport_key)
    if not games:
        return {}

    # Find matching game by team name fuzzy match
    for game in games:
        ht = game.get("home_team", "").lower()
        at = game.get("away_team", "").lower()
        ht_search = home_team.lower()
        at_search = away_team.lower()

        # Match: try substring in either direction
        home_match = (ht_search[:5] in ht or ht[:5] in ht_search)
        away_match = (at_search[:5] in at or at[:5] in at_search)

        if home_match and away_match:
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
    }

    home_team = game.get("home_team", "")
    for bookmaker in game.get("bookmakers", []):
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
            "leagueId": 0,  # resolved by scheduler if needed
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
```

**Validation:** Run `python -c "from backend.quant.free_data_client import *; print('Module loaded OK')"`. No import errors.

---

### Task 1.2 — Create Team ID Translation Map

**File (NEW):** `backend/quant/team_id_map.py`

**Problem:** football-data.org, API-Football, and your legacy Elo cache use different team IDs. Without translation, H2H lookups fail, Elo doesn't update, and form models read wrong teams.

**Action:** Create the file:

```python
"""
team_id_map.py
───────────────
Cross-source team ID translation.
Maps football-data.org team IDs → API-Football team IDs → legacy Sportmonks IDs.
"""

import os
import json
import requests

AF_KEY = os.environ.get("API_FOOTBALL_KEY", "")
AF_BASE = "https://v3.football.api-sports.io"

# ── Known Mappings (seed from verified data) ───────────────────────────────────
# Format: { fd_org_id: af_id }
KNOWN_TEAM_MAP = {
    # Premier League
    57:  33,    # Arsenal
    61:  49,    # Chelsea
    64:  45,    # Everton
    65:  40,    # Liverpool
    66:  33,    # Manchester City (verify)
    67:  52,    # Newcastle United
    73:  66,    # Tottenham
    76:  48,    # West Ham United
    1044: 65,   # Nottingham Forest
    # Bundesliga
    5:   157,   # Bayern Munich
    4:   165,   # Borussia Dortmund
    3:   168,   # Bayer Leverkusen
    721: 173,   # RB Leipzig
    # La Liga
    78:  541,   # Barcelona
    86:  541,   # Real Madrid (verify)
    77:  530,   # Atletico Madrid
    # Serie A
    98:  489,   # AC Milan
    108: 505,   # Inter Milan
    109: 496,   # Juventus
    # Ligue 1
    524: 85,    # PSG
    523: 80,    # Lyon
    516: 81,    # Marseille
}

TEAM_CACHE_FILE = ".vantage_cache/team_id_map.json"

def load_team_map():
    """Load team ID map from disk cache."""
    try:
        if os.path.exists(TEAM_CACHE_FILE):
            with open(TEAM_CACHE_FILE, "r") as f:
                loaded = json.load(f)
                # Merge with known map (disk takes priority)
                merged = dict(KNOWN_TEAM_MAP)
                merged.update({int(k): int(v) for k, v in loaded.items()})
                return merged
    except Exception:
        pass
    return dict(KNOWN_TEAM_MAP)

def save_team_map(team_map):
    """Persist team ID map to disk."""
    os.makedirs(".vantage_cache", exist_ok=True)
    with open(TEAM_CACHE_FILE, "w") as f:
        json.dump({str(k): v for k, v in team_map.items()}, f)

# Global cache — loaded once per process
_team_map = None

def get_af_id_from_fd_id(fd_id, team_name=""):
    """
    Resolve football-data.org team ID → API-Football team ID.
    Checks local map first, then searches API-Football by name.
    """
    global _team_map
    if _team_map is None:
        _team_map = load_team_map()

    fd_id = int(fd_id) if fd_id else 0
    if fd_id and fd_id in _team_map:
        return _team_map[fd_id]

    # Search API-Football by team name
    if not AF_KEY or not team_name:
        return None

    try:
        resp = requests.get(
            f"{AF_BASE}/teams",
            headers={"x-apisports-key": AF_KEY},
            params={"search": team_name},
            timeout=10
        )
        if resp.status_code == 200:
            results = resp.json().get("response", [])
            if results:
                af_id = results[0]["team"]["id"]
                if fd_id:
                    _team_map[fd_id] = af_id
                    save_team_map(_team_map)
                return af_id
    except Exception as e:
        print(f"[TeamMap] Lookup failed for '{team_name}' (fd_id={fd_id}): {e}")

    return None
```

**Validation:** Run `python -c "from backend.quant.team_id_map import get_af_id_from_fd_id; print(get_af_id_from_fd_id(57, 'Arsenal'))"` — should print a valid API-Football team ID (not None).

---

## Phase 2 — Data Pipeline Migration

### Task 2.1 — Add `fetch_matches_free()` to `data_pipeline.py`

**File:** `backend/quant/data_pipeline.py`

**Problem:** The existing `fetch_matches()` uses Sportmonks exclusively. Need a parallel function that builds `MatchData` objects from the free stack.

**Action:** Add this function after the existing `fetch_matches()` function (before `LEAGUE_AVG_GOALS`). Place it after the `_af_fetch_fixtures()` function (around line 230):

```python
def fetch_matches_free(date_str: str) -> list:
    """
    Free data source fallback replacing Sportmonks.
    Uses football-data.org + The Odds API + Understat + API-Football H2H.
    Returns list of MatchData objects.
    """
    from free_data_client import (
        fetch_fixtures_today, fetch_team_form,
        find_odds_for_fixture, fetch_xg_from_understat,
        estimate_btts_odds,
    )
    from team_id_map import get_af_id_from_fd_id

    print(f"[DataPipeline] Using FREE data stack for {date_str}", file=sys.stderr)

    raw_fixtures = fetch_fixtures_today(date_str)
    if not raw_fixtures:
        print("[DataPipeline] No fixtures from football-data.org", file=sys.stderr)
        return []

    print(f"[DataPipeline] Got {len(raw_fixtures)} fixtures from free stack", file=sys.stderr)

    matches = []
    for fix in raw_fixtures:
        try:
            league_id = fix["league_id"]
            home_id = fix["home_team_id"]
            away_id = fix["away_team_id"]
            home_name = fix["home_team"]
            away_name = fix["away_team"]

            # ── Resolve team IDs for H2H/API-Football ────────────────────────
            af_home_id = get_af_id_from_fd_id(home_id, home_name)
            af_away_id = get_af_id_from_fd_id(away_id, away_name)

            # ── Team Form ──────────────────────────────────────────────────
            home_form_raw = fetch_team_form(home_id, limit=10)
            away_form_raw = fetch_team_form(away_id, limit=10)

            home_stats = _build_free_team_stats(
                home_id, home_name, home_form_raw, is_home=True
            )
            away_stats = _build_free_team_stats(
                away_id, away_name, away_form_raw, is_home=False
            )

            # ── xG from Understat ─────────────────────────────────────────
            home_xg, away_xg = fetch_xg_from_understat(home_name, away_name)

            # Fall back to goal-based xG approximation
            if home_xg is None:
                home_xg = max(0.5, home_stats.avg_scored * 0.95)
            if away_xg is None:
                away_xg = max(0.5, away_stats.avg_scored * 0.95)

            # ── Odds ──────────────────────────────────────────────────────
            odds_dict = find_odds_for_fixture(home_name, away_name, league_id)

            od = OddsData(
                home_odds=odds_dict.get("home_odds", 0.0),
                draw_odds=odds_dict.get("draw_odds", 0.0),
                away_odds=odds_dict.get("away_odds", 0.0),
                over25_odds=odds_dict.get("over25_odds", 0.0),
                under25_odds=odds_dict.get("under25_odds", 0.0),
                over15_odds=odds_dict.get("over15_odds", 0.0),
                under15_odds=odds_dict.get("under15_odds", 0.0),
                over35_odds=odds_dict.get("over35_odds", 0.0),
                under35_odds=odds_dict.get("under35_odds", 0.0),
                btts_yes_odds=odds_dict.get("btts_yes_odds", 0.0),
                btts_no_odds=odds_dict.get("btts_no_odds", 0.0),
                odds_fetched_at=datetime.now(timezone.utc).isoformat()
            )

            # ── Estimate BTTS odds if bookmaker data missing ──────────────
            if od.btts_yes_odds <= 0:
                home_btts = 1 - home_stats.clean_sheet_rate if home_stats.clean_sheet_rate else 0.65
                away_btts = 1 - away_stats.clean_sheet_rate if away_stats.clean_sheet_rate else 0.60
                btts_y, btts_n = estimate_btts_odds(home_btts, away_btts)
                od.btts_yes_odds = btts_y
                od.btts_no_odds = btts_n

            # ── H2H via API-Football (already in your pipeline) ────────────
            hw, aw, dr, avg_g, btts_r = 0, 0, 0, _league_avg(league_id), 0.45
            if af_home_id and af_away_id:
                try:
                    hw, aw, dr, avg_g, btts_r = _fetch_h2h_cached(
                        home_name, away_name, af_home_id, af_away_id, league_id
                    )
                except Exception as e:
                    print(f"[DataPipeline] H2H fetch failed: {e}", file=sys.stderr)

            # ── Kickoff time (convert UTC to Lagos local) ──────────────────
            kickoff_utc = fix.get("kickoff_utc", "")
            kickoff_local = kickoff_utc
            try:
                kick = datetime.fromisoformat(kickoff_utc.replace("Z", "+00:00"))
                kick_lagos = kick + timedelta(hours=1)  # Lagos = UTC+1
                kickoff_local = kick_lagos.strftime("%H:%M")
            except Exception:
                pass

            league_info = get_league_info(league_id)
            league_tier = league_info["tier"] if league_info else 2

            md = MatchData(
                fixture_id=fix["id"],
                league=fix.get("league_name", ""),
                league_id=league_id,
                league_tier=league_tier,
                home_team=home_name,
                home_team_id=home_id,
                away_team=away_name,
                away_team_id=away_id,
                kickoff_utc=kickoff_utc,
                kickoff_local=kickoff_local,
                home_logo=fix.get("home_logo", ""),
                away_logo=fix.get("away_logo", ""),
                provider_source="free_stack",
                home_stats=home_stats,
                away_stats=away_stats,
                h2h_home_wins=hw,
                h2h_away_wins=aw,
                h2h_draws=dr,
                h2h_avg_goals=avg_g,
                h2h_btts_rate=btts_r,
                odds=od,
                expected_goals_home=max(0.5, home_xg),
                expected_goals_away=max(0.5, away_xg),
            )
            matches.append(md)
            print(f"[DataPipeline] [FREE] {home_name} vs {away_name} "
                  f"(xG: {home_xg:.2f}-{away_xg:.2f}, odds: {od.home_odds:.1f}/{od.draw_odds:.1f}/{od.away_odds:.1f})",
                  file=sys.stderr)
        except Exception as e:
            print(f"[DataPipeline] Error on {fix.get('home_team')} vs {fix.get('away_team')}: {e}", file=sys.stderr)

    return matches


def _build_free_team_stats(team_id, team_name, form_raw, is_home=True):
    """
    Build a TeamStats object from football-data.org form results.
    Mirrors _parse_form() output shape so the model pipeline works unchanged.
    """
    from dataclasses import field

    stats = TeamStats(team_id=team_id, team_name=team_name)
    if not form_raw:
        return stats

    wins = sum(1 for m in form_raw if m["result"] == "W")
    draws = sum(1 for m in form_raw if m["result"] == "D")
    recent5 = form_raw[:5]
    results = [m["result"] for m in recent5]

    stats.form = " ".join(results)
    stats.form_score = sum(3 if r == "W" else (1 if r == "D" else 0)
                           for r in results) / (3 * len(results)) if results else 0.5
    stats.win_rate = wins / len(form_raw) if form_raw else 0
    stats.matches_analyzed = len(form_raw)

    home_matches = [m for m in form_raw if m["is_home"]]
    away_matches = [m for m in form_raw if not m["is_home"]]

    all_scored = [m["goals_scored"] for m in form_raw]
    all_conceded = [m["goals_conceded"] for m in form_raw]
    stats.avg_scored = sum(all_scored) / len(all_scored) if all_scored else 1.2
    stats.avg_conceded = sum(all_conceded) / len(all_conceded) if all_conceded else 1.2

    if home_matches:
        stats.home_avg_scored = sum(m["goals_scored"] for m in home_matches) / len(home_matches)
        stats.home_avg_conceded = sum(m["goals_conceded"] for m in home_matches) / len(home_matches)
    if away_matches:
        stats.away_avg_scored = sum(m["goals_scored"] for m in away_matches) / len(away_matches)
        stats.away_avg_conceded = sum(m["goals_conceded"] for m in away_matches) / len(away_matches)

    clean_sheets = sum(1 for m in form_raw if m["goals_conceded"] == 0)
    stats.clean_sheet_rate = clean_sheets / len(form_raw) if form_raw else 0

    # xG approximation from goals (when Understat unavailable)
    stats.avg_xg_created = stats.avg_scored * 0.95
    stats.avg_xg_conceded = stats.avg_conceded * 0.95
    stats.avg_possession = 50.0
    stats.avg_shots_on_target = stats.avg_scored * 3.5

    # Opponent IDs for form model
    stats.recent_opponents = [m.get("opponent_id", 0) for m in recent5]

    return stats
```

**Validation:** Run pipeline in dry mode: `python backend/quant/quant_pipeline.py 2025-06-14 --dry-run`. Confirm output shows `[FREE] TeamA vs TeamB (xG: X.XX-X.XX, odds: X.X/X.X/X.X)` for each fixture.

---

### Task 2.2 — Add Auto-Fallback to `fetch_matches()`

**File:** `backend/quant/data_pipeline.py`

**Problem:** The existing `fetch_matches()` only works with Sportmonks. Need it to auto-detect when SM_TOKEN is missing and switch to the free stack.

**Action:** Find the `fetch_matches()` function definition (should be around line 360-380). At the very top of the function, after `if date_str is None:`, add:

```python
    # ── Auto-fallback to free data stack if no Sportmonks token ────────────
    if not SM_TOKEN:
        print("[DataPipeline] No SPORTMONKS_API_TOKEN — using free data stack", file=sys.stderr)
        return fetch_matches_free(date_str)
```

Then, find the Sportmonks API call line (around line 390, something like `result = _get(f"/fixtures/date/{date_str}", ...)`). After the API call returns, add a fallback for when Sportmonks returns empty:

```python
    # ── Fallback to free stack if Sportmonks returns empty ────────────────
    if not data:
        print("[DataPipeline] Sportmonks returned empty — falling back to free stack", file=sys.stderr)
        return fetch_matches_free(date_str)
```

Find the lines that are approximately:

```python
    data = _get(f"/fixtures/date/{date_str}", {
        "include": "league;participants;scores;odds;statistics;lineups;sidelined",
        "per_page": MAX_MATCHES,
    })
    if not data:
        return []
```

Replace with:

```python
    data = _get(f"/fixtures/date/{date_str}", {
        "include": "league;participants;scores;odds;statistics;lineups;sidelined",
        "per_page": MAX_MATCHES,
    })
    if not data or not data.get("data"):
        print("[DataPipeline] Sportmonks returned empty — falling back to free stack", file=sys.stderr)
        return fetch_matches_free(date_str)
```

**Validation:** Unset `SPORTMONKS_API_TOKEN` and run `python backend/quant/data_pipeline.py 2025-06-14`. Confirm output says "using free data stack" and produces MatchData objects.

---

### Task 2.3 — Update `requirements.txt`

**File:** `backend/quant/requirements.txt` (or `backend/requirements.txt`)

**Action:** Ensure these lines are present:

```txt
requests>=2.31.0
understatapi>=0.4.0
```

**Validation:** `pip install -r backend/quant/requirements.txt` succeeds.

---

## Phase 3 — Grading & Live Scores Migration

### Task 3.1 — Add Free Grading Fallback to `grading_engine.py`

**File:** `backend/quant/grading_engine.py`

**Problem:** `grading_engine.py` calls `_fetch_results_for_date()` which uses Sportmonks. With the free stack, we need to fetch results from football-data.org.

**Action 1:** Add the import at the top of the file (after existing imports):

```python
try:
    from free_data_client import fetch_match_result_free
except ImportError:
    fetch_match_result_free = None
```

**Action 2:** In the `grade_predictions()` function (or the main grading loop), find where results are fetched from Sportmonks. Look for `_fetch_results_for_date(date_str)`. Add a fallback:

```python
    # Fetch results — try Sportmonks first, fall back to free stack
    results_map = {}
    if SM_TOKEN:
        results_map = _fetch_results_for_date(date_str)
    if (not results_map or len(results_map) < 5) and fetch_match_result_free:
        print(f"[Grading] Using free data for {date_str}", file=sys.stderr)
        free_results = _fetch_results_from_free(date_str, preds)
        results_map.update(free_results)
```

**Action 3:** Add the free results fetcher function (after `_parse_closing_odds`):

```python
def _fetch_results_from_free(date_str, predictions):
    """
    Fetch match results from football-data.org for grading.
    Matches predictions by team name since fixture IDs differ between sources.
    """
    results = {}
    if not fetch_match_result_free:
        return results

    for pred in predictions:
        fixture_id = pred.get("fixture_id")
        if not fixture_id:
            # Try team name matching
            results = _fetch_results_by_team(date_str, predictions)
            break

        result = fetch_match_result_free(fixture_id)
        if result:
            results[str(fixture_id)] = result

    return results


def _fetch_results_by_team(date_str, predictions):
    """Fallback: fetch all finished matches for date, match by team name."""
    from free_data_client import _fd_get
    data = _fd_get("/matches", {"dateFrom": date_str, "dateTo": date_str, "status": "FINISHED"})
    if not data:
        return {}

    results = {}
    matches = data.get("matches", [])
    for pred in predictions:
        home_pred = (pred.get("home_team") or pred.get("homeTeam") or "").lower().strip()
        away_pred = (pred.get("away_team") or pred.get("awayTeam") or "").lower().strip()

        for m in matches:
            home_api = m.get("homeTeam", {}).get("name", "").lower()
            away_api = m.get("awayTeam", {}).get("name", "").lower()
            if (home_pred[:5] in home_api or home_api[:5] in home_pred) and \
               (away_pred[:5] in away_api or away_api[:5] in away_pred):
                score = m.get("score", {}).get("fullTime", {})
                hg = score.get("home")
                ag = score.get("away")
                if hg is not None and ag is not None:
                    results[str(m["id"])] = {
                        "home_goals": hg,
                        "away_goals": ag,
                        "state": "FT",
                        "closing_odds": {},
                    }
                break

    print(f"[Grading] Team-name matched {len(results)} free results", file=sys.stderr)
    return results
```

**Validation:** Run `python backend/quant/grading_engine.py 2025-06-13`. Confirm grading runs without Sportmonks errors.

---

### Task 3.2 — Add Free Live Score Fetcher to `scheduler.js`

**File:** `backend/scheduler.js`

**Problem:** The `liveScoreTask` cron (around line 400) calls `api.sportmonks.com/v3/football/livescores`. Without a token, live scores go blank.

**Action 1:** Add a helper function at the top of `scheduler.js` (after imports, before `triggerAccumulatorGeneration`):

```javascript
/**
 * Fetch live scores from football-data.org free tier.
 * Returns normalized match objects compatible with the existing Firestore shape.
 */
const fetchLiveScoresFree = async () => {
    const fdKey = process.env.FOOTBALL_DATA_KEY;
    if (!fdKey) return [];
    
    try {
        const res = await fetch(
            'https://api.football-data.org/v4/matches?status=LIVE,IN_PLAY,PAUSED',
            { headers: { 'X-Auth-Token': fdKey }, signal: AbortSignal.timeout(15000) }
        );
        if (!res.ok) return [];
        const json = await res.json();
        return (json.matches || []).map(m => {
            const score = m.score || {};
            const fullTime = score.fullTime || {};
            const halfTime = score.halfTime || {};
            const home = m.homeTeam || {};
            const away = m.awayTeam || {};
            return {
                id: String(m.id),
                homeTeam: home.name || 'Unknown',
                awayTeam: away.name || 'Unknown',
                homeTeamLogo: home.crest || '',
                awayTeamLogo: away.crest || '',
                homeTeamId: home.id,
                awayTeamId: away.id,
                homeScore: fullTime.home ?? halfTime.home ?? 0,
                awayScore: fullTime.away ?? halfTime.away ?? 0,
                league: (m.competition || {}).name || 'Unknown League',
                leagueId: (m.competition || {}).id || 0,
                stateShort: m.status || 'LIVE',
                stateLong: m.status || 'Live',
                minute: m.minute || 0,
                events: [],
                source: 'football-data.org',
            };
        });
    } catch (e) {
        console.warn('[LiveScore-Free] Fetch error:', e.message);
        return [];
    }
};
```

**Action 2:** In the `liveScoreTask` cron (around line 395), find where it fetches from Sportmonks. The existing code does something like:

```javascript
    const liveScoreTask = cron.schedule('*/2 13-23 * * *', async () => {
        // ...acquire lock...
        const token = process.env.SPORTMONKS_API_TOKEN;
        const url = `https://api.sportmonks.com/v3/football/livescores/latest?include=...&api_token=${token}`;
        const res = await fetch(url);
```

Replace the `const token = ...` through `const json = await res.json()` section with a fallback:

```javascript
    const liveScoreTask = cron.schedule('*/2 13-23 * * *', async () => {
        // Acquire concurrency lock (existing code — keep as-is)
        // ...
        
        try {
            let matches = [];
            const smToken = process.env.SPORTMONKS_API_TOKEN;
            
            // Try Sportmonks first if token exists
            if (smToken) {
                const url = `https://api.sportmonks.com/v3/football/livescores/latest?include=league;participants;scores;events;state&api_token=${smToken}`;
                const res = await fetch(url);
                if (res.ok) {
                    const json = await res.json();
                    const raw = json.data || [];
                    // ... existing Sportmonks normalization code ...
                    matches = raw.map(item => {
                        // ... existing map logic ...
                    });
                }
            }
            
            // Fallback to football-data.org if Sportmonks returned nothing
            if (matches.length === 0) {
                console.log('[Live] Sportmonks unavailable — using football-data.org');
                matches = await fetchLiveScoresFree();
            }
            
            // ... rest of existing code (write to Firestore, auto-grade, etc.)
```

**Validation:** Restart server. Watch logs for `[Live] Sportmonks unavailable — using football-data.org`. Live dashboard should show matches during active hours.

---

### Task 3.3 — Disable Dead Scheduler Tasks (Lineups, Stats, Tomorrow)

**File:** `backend/scheduler.js`

**Problem:** Lineup, stats, and tomorrow fixture fetchers all call Sportmonks endpoints that no longer work. They should gracefully degrade.

**Action 1:** The `lineupTask` (line 665) already checks `if (!token) return;`. This is sufficient — it will just skip. No change needed.

**Action 2:** The `statsTask` (line 720) already checks `if (!token) return;`. No change needed.

**Action 3:** The `tomorrowTask` (line 779) should use football-data.org as fallback. Find its `const token = ...` check and add:

```javascript
    const tomorrowTask = cron.schedule('0 23 * * *', async () => {
        try {
            const smToken = process.env.SPORTMONKS_API_TOKEN;
            const fdKey = process.env.FOOTBALL_DATA_KEY;
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

            let fixtures = [];
            
            // Try Sportmonks first
            if (smToken) {
                const url = `https://api.sportmonks.com/v3/football/fixtures/date/${dateKey}?include=league;participants&api_token=${smToken}`;
                const res = await fetch(url);
                if (res.ok) {
                    const json = await res.json();
                    const raw = json.data || [];
                    fixtures = raw.map(item => {
                        // ... existing Sportmonks map logic ...
                    });
                }
            }
            
            // Fallback to football-data.org
            if (fixtures.length === 0 && fdKey) {
                // Fetch all free competitions for tomorrow's date
                const freeComps = ['PL', 'BL1', 'PD', 'SA', 'FL1', 'CL', 'EL'];
                for (const comp of freeComps) {
                    try {
                        const res = await fetch(
                            `https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${dateKey}&dateTo=${dateKey}`,
                            { headers: { 'X-Auth-Token': fdKey } }
                        );
                        if (!res.ok) continue;
                        const json = await res.json();
                        for (const m of (json.matches || [])) {
                            const kickoff = m.utcDate ? new Date(m.utcDate) : null;
                            const timeStr = kickoff ? kickoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : 'TBD';
                            fixtures.push({
                                id: String(m.id),
                                fixtureId: m.id,
                                homeTeam: (m.homeTeam || {}).name || 'Unknown',
                                awayTeam: (m.awayTeam || {}).name || 'Unknown',
                                homeTeamLogo: (m.homeTeam || {}).crest || '',
                                awayTeamLogo: (m.awayTeam || {}).crest || '',
                                league: (m.competition || {}).name || 'Unknown League',
                                time: timeStr,
                                category: 'no_edge',
                                confidence: 0,
                                odds: 0,
                                prediction: 'Preview — Analysis runs at 19:00',
                                prediction_en: 'Preview — Vantage AI analysis runs at 19:00 Lagos',
                                prediction_fr: 'Aperçu — L\'analyse IA est disponible à 19h00',
                            });
                        }
                    } catch (_) {}
                }
            }
            
            if (fixtures.length > 0) {
                const db = admin.firestore();
                await db.collection('daily_predictions').doc(dateKey).set({
                    rawFixtures: fixtures,
                    updatedAt: new Date().toISOString(),
                }, { merge: true });
                console.log(`[Tomorrow] 📅 Stored ${fixtures.length} fixtures for ${dateKey}`);
            }
        } catch (e) {
            console.warn('[Scheduler] Tomorrow fixtures fetch error:', e.message);
        }
    }, { timezone: 'Africa/Lagos' });
```

**Validation:** Restart server. Check logs — no Sportmonks 403 errors for lineup/stats/tomorrow tasks.

---

## Phase 4 — Scheduler & Frontend Fixes (from original MM2.7)

### Task 4.1 — Fix Scheduled Time Display Mismatch

**File:** `backend/scheduler.js`

**Action:** In `syncSchedules()`, locate the two lines that read settings (around line 250-270). Find:

```javascript
            const footballTime = safeTime(config.footballGenTime, '08:00');
```

Replace with:

```javascript
            const footballTime = safeTime(config.quantGenTime || config.footballGenTime, '19:00');
```

**Validation:** The Home page "Next predictions" display should show the quant pipeline time.

---

### Task 4.2 — Fix Streak Counter Logic

**File:** `pages/Home.tsx`

**Action:** Find the IIFE that computes `won`, `lost`, `rate` in the Rolling Results Ticker (search for `won >= 3`). Replace the streak-won block:

```tsx
                {won >= 3 && (
                  <span className="text-[10px] font-black text-orange-500 animate-pulse flex items-center gap-0.5">
                    🔥 {won} streak
                  </span>
                )}
```

With true consecutive streak computation:

```tsx
                {(() => {
                  const sorted = [...predictions.filter(m => m.status === 'won' || m.status === 'lost')]
                    .sort((a, b) => (b.time || '').localeCompare(a.time || ''));
                  let streak = 0;
                  for (const m of sorted) {
                    if (m.status === 'won') streak++;
                    else break;
                  }
                  if (streak >= 3) return (
                    <span className="text-[10px] font-black text-orange-500 animate-pulse flex items-center gap-0.5">
                      🔥 {streak} streak
                    </span>
                  );
                  return null;
                })()}
```

**Validation:** With test data `[won, won, lost, won]` (sorted newest first), streak should show `2`, not `4`.

---

### Task 4.3 — Fix Windows `/dev/null` Crash

**File:** `backend/quant/grid_search.py`

**Action:** Find `open(os.devnull, 'w')` (around line 88). Replace with:

```python
_null_device = 'nul' if os.name == 'nt' else os.devnull
sys.stdout = open(_null_device, 'w')
```

Also fix any other `open(os.devnull, ...)` occurrences in the same file.

**Validation:** Run `python backend/quant/grid_search.py 3` on Windows. No `FileNotFoundError`.

---

### Task 4.4 — Kelly Calculator Input Validation

**File:** `pages/Kelly.tsx`

**Action:** Find the Kelly calculation (search for `kelly` computation). Add input guards:

```typescript
  const clampedOdds = Math.max(1.01, odds);
  const clampedProb = Math.min(0.99, Math.max(0.01, prob / 100));
  const b = clampedOdds - 1;
  const kelly = b > 0 ? ((b * clampedProb) - (1 - clampedProb)) / b : 0;
  const kellyStake = Math.max(0, kelly);
```

Also add `min="1.01"` and `max="99"` to the odds and probability input fields.

**Validation:** Enter `odds=1.0` and `prob=100`. Confirm no `Infinity` or negative.

---

## Phase 5 — Final Validation Checklist

Run every item. Do not skip.

| # | Command | Expected Result |
|---|---------|-----------------|
| 1 | `pip install -r backend/quant/requirements.txt` | understatapi installed, no errors |
| 2 | `python -c "from backend.quant.free_data_client import *; print('OK')"` | `OK` |
| 3 | `python -c "from backend.quant.team_id_map import get_af_id_from_fd_id; print(get_af_id_from_fd_id(57, 'Arsenal'))"` | Prints a number (not None) |
| 4 | `python backend/quant/data_pipeline.py 2025-06-14` (with variables set) | Prints `[FREE] TeamA vs TeamB (xG: ...)` for each fixture; no Sportmonks errors |
| 5 | `python backend/quant/quant_pipeline.py 2025-06-14 --dry-run` | Kelly stakes 1-5%, EV values present, xG between 0.3–2.5 |
| 6 | `python backend/quant/grading_engine.py 2025-06-13` | Grades predictions via free data; no `401`/`403` errors |
| 7 | `python backend/quant/grid_search.py 3` | Completes on Windows without crash |
| 8 | `npm run build` | Zero TypeScript errors |
| 9 | `node server.js` | Startup logs: no Sportmonks 403 errors; `[Live]` poller uses free source |
| 10 | UI: Home page | Predictions load, streak shows consecutive not total |
| 11 | UI: VIP page | Kelly stakes appear, EV values display |
| 12 | UI: Kelly Calculator | Entering `odds=1.0` shows 0% not Infinity |

---

## Summary of Changes

| Phase | File | Change |
|-------|------|--------|
| 1.1 | `backend/quant/free_data_client.py` (NEW) | Core module: fixtures, form, odds, xG, live scores from free sources |
| 1.2 | `backend/quant/team_id_map.py` (NEW) | Cross-source team ID translation (fd.org → API-Football) |
| 2.1 | `backend/quant/data_pipeline.py` | `fetch_matches_free()` + `_build_free_team_stats()` |
| 2.2 | `backend/quant/data_pipeline.py` | Auto-fallback: empty SM_TOKEN → free stack |
| 2.3 | `backend/quant/requirements.txt` | Add `understatapi` |
| 3.1 | `backend/quant/grading_engine.py` | `_fetch_results_from_free()` fallback |
| 3.2 | `backend/scheduler.js` | `fetchLiveScoresFree()` + Sportmonks fallback in liveScoreTask |
| 3.3 | `backend/scheduler.js` | Tomorrow fixtures use football-data.org fallback |
| 4.1 | `backend/scheduler.js` | Fix display time to show quantGenTime |
| 4.2 | `pages/Home.tsx` | Fix streak = consecutive not total |
| 4.3 | `backend/quant/grid_search.py` | Windows `nul` device fix |
| 4.4 | `pages/Kelly.tsx` | Input validation (no Infinity) |

**Files removed from original plan (Sportmonks-only features now impossible):**
- Task 1.1 (xG stat ID fix) — irrelevant, free stack uses Understat/FBref xG
- Task 1.2-1.3 (Sportmonks Predictions API) — API is dead, no replacement exists
- Phase 4 (Match News display) — news data came from Sportmonks, no free source

**Odometer after completion:** Pipeline runs fully on free data. 12 leagues covered. Basketball (already on The Odds API) and cricket (still needs Sportmonks Cricket API replacement — future phase) unaffected.
