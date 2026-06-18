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

# ── Global SSL patch (Windows dev environment: broken CA bundle) ───────────────
# Suppress SSL errors for all requests in this module without per-call boilerplate.
_orig_request = requests.Session.request
def _ssl_off_request(self, method, url, **kwargs):
    kwargs.setdefault("verify", False)
    return _orig_request(self, method, url, **kwargs)
requests.Session.request = _ssl_off_request
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
    462: "soccer_portugal_primeira_liga",
    9:   "soccer_england_championship",
    7:   "soccer_uefa_europa_conference_league",
    1204: "soccer_scotland_premiership",
    138: "soccer_belgium_first_div",
    176: "soccer_turkey_super_league",
    288: "soccer_poland_ekstraklasa",
    325: "soccer_argentina_primera_division",
    392: "soccer_norway_eliteserien",
    395: "soccer_italy_serie_b",
    567: "soccer_spain_segunda_division",
    572: "soccer_sweden_allsvenskan",
}

SOFASCORE_LEAGUE_MAP = {
    8:    ["Premier League"],
    2:    ["UEFA Champions League"],
    564:  ["LaLiga"],
    82:   ["Bundesliga"],
    384:  ["Serie A"],
    5:    ["UEFA Europa League"],
    294:  ["World Cup"],
    301:  ["Ligue 1"],
    462:  ["Liga Portugal", "Primeira Liga"],
    7:    ["UEFA Europa Conference League", "UEFA Conference League"],
    72:   ["Eredivisie"],
    9:    ["Championship"],
    1204: ["Premiership"],
    138:  ["Pro League"],
    600:  ["Major League Soccer", "MLS"],
    253:  ["Brasileirão Série A"],
    325:  ["Liga Profesional", "Liga Profesional de Fútbol"],
    176:  ["Trendyol Süper Lig", "Super Lig"],
    570:  ["Saudi Pro League"],
    392:  ["Eliteserien"],
    572:  ["Allsvenskan"],
    288:  ["Ekstraklasa"],
    1186: ["CAF Champions League"],
    1187: ["CAF Confederation Cup"],
    567:  ["LaLiga 2"],
    85:   ["2. Bundesliga"],
    395:  ["Serie B"],
    302:  ["Ligue 2"],
    10:   ["League One"],
    # Alias used by The Odds API fallback (maps to FIFA World Cup id=294)
    294:  ["World Cup", "World Championship", "FIFA World Cup 2026"],
    12:   ["League Two"],
    254:  ["Brasileirão Série B"],
    14:   ["National League"],
    51:   ["Liga Portugal 2"],
}

def get_internal_league_id_from_sofascore(ss_name):
    for lid, names in SOFASCORE_LEAGUE_MAP.items():
        if ss_name in names:
            return lid
    return None

# ── football-data.org wrapper (replaces raw request boilerplate) ───────────────────
class FootballData:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = "https://api.football-data.org/v4"
        self._last_call = 0
        self.rate_limit = 6.5

    def _get(self, path, params=None):
        if not self.api_key:
            return None
        elapsed = time.time() - self._last_call
        if elapsed < self.rate_limit:
            time.sleep(self.rate_limit - elapsed)
        try:
            resp = requests.get(
                f"{self.base_url}{path}",
                headers={"X-Auth-Token": self.api_key},
                params=params or {},
                timeout=15,
                verify=False
            )
            self._last_call = time.time()
            if resp.status_code == 200:
                return resp.json()
            print(f"[FreeData] football-data.org error {resp.status_code} for {path}", file=__import__('sys').stderr)
        except Exception as e:
            print(f"[FreeData] football-data.org request failed: {e}", file=__import__('sys').stderr)
        return None

    def competition_matches(self, competition_id, date_from=None, date_to=None, status=None):
        params = {}
        if date_from: params["dateFrom"] = date_from
        if date_to: params["dateTo"] = date_to
        if status: params["status"] = status
        data = self._get(f"/competitions/{competition_id}/matches", params)
        return data.get("matches", []) if data else []

    def team_matches(self, team_id, status=None, limit=None):
        params = {}
        if status: params["status"] = status
        if limit: params["limit"] = limit
        data = self._get(f"/teams/{team_id}/matches", params)
        return data.get("matches", []) if data else []

    def match_result(self, fixture_id):
        return self._get(f"/matches/{fixture_id}")

    def live_matches(self):
        data = self._get("/matches", {"status": "LIVE,IN_PLAY,PAUSED"})
        return data.get("matches", []) if data else []

fd_api = FootballData(api_key=FOOTBALL_DATA_KEY)

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

def fetch_fixtures_today(date_str, end_date_str=None):
    """
    Fetch today's fixtures from football-data.org for all tracked leagues.
    Returns list of normalized fixture dicts.
    """
    return _fetch_fixtures_for_date(date_str, end_date_str or date_str, "SCHEDULED,TIMED")


def fetch_fixtures_past(date_str, end_date_str=None):
    """
    Fetch past (finished) fixtures from football-data.org.
    Used by backtesting and vault simulator.
    """
    return _fetch_fixtures_for_date(date_str, end_date_str or date_str, "FINISHED")


# ── Country code map for flag images (ISO 3166-1 alpha-2) ─────────────────────
_COUNTRY_CODE_MAP = {
    "argentina": "ar", "australia": "au", "belgium": "be", "brazil": "br",
    "cameroon": "cm", "canada": "ca", "chile": "cl", "colombia": "co",
    "costa rica": "cr", "croatia": "hr", "czech republic": "cz", "denmark": "dk",
    "ecuador": "ec", "egypt": "eg", "england": "gb-eng", "france": "fr",
    "germany": "de", "ghana": "gh", "greece": "gr", "honduras": "hn",
    "iran": "ir", "ireland": "ie", "italy": "it", "ivory coast": "ci",
    "japan": "jp", "jordan": "jo", "mexico": "mx", "morocco": "ma",
    "netherlands": "nl", "new zealand": "nz", "nigeria": "ng", "norway": "no",
    "panama": "pa", "paraguay": "py", "peru": "pe", "poland": "pl",
    "portugal": "pt", "qatar": "qa", "romania": "ro", "russia": "ru",
    "saudi arabia": "sa", "scotland": "gb-sct", "senegal": "sn",
    "serbia": "rs", "south africa": "za", "south korea": "kr", "spain": "es",
    "sweden": "se", "switzerland": "ch", "tunisia": "tn", "turkey": "tr",
    "ukraine": "ua", "uruguay": "uy", "usa": "us", "united states": "us",
    "wales": "gb-wls", "dr congo": "cd", "cape verde": "cv", "algeria": "dz",
    "cuba": "cu", "curaçao": "cw", "curacao": "cw", "new zealand": "nz",
    "bosnia & herzegovina": "ba", "bosnia and herzegovina": "ba",
}

def _country_code(name: str) -> str:
    """Return ISO 3166-1 alpha-2 country code for flag CDN URL. Defaults to 'xx'."""
    return _COUNTRY_CODE_MAP.get(name.lower().strip(), "xx")


def _fetch_fixtures_for_date(date_from, date_to, status_filter):
    """
    Fetch fixtures from Sofascore for a date.
    Used for both live and historical queries, unlocking 30+ leagues.
    Includes a fallback to The Odds API for today's matches when Sofascore fails.
    """
    from sofascore_client import fetch_todays_fixtures_sofascore
    
    fixtures = []
    ss_fixtures = fetch_todays_fixtures_sofascore(date_from)

    # ── Fallback to The Odds API for today/future matches if Sofascore is blocked ──
    if not ss_fixtures:
        dprint("[FreeData] Sofascore returned 0 fixtures. Attempting The Odds API fallback...")
        import requests
        from datetime import datetime
        today_str = datetime.now().strftime("%Y-%m-%d")
        if date_from >= today_str and ODDS_API_KEY:
            try:
                for sport_key in set(ODDS_SPORT_MAP.values()):
                    games = fetch_all_odds_for_sport(sport_key)
                    if not games:
                        continue
                        
                    for ev in games:
                        commence_time = ev.get("commence_time", "")
                        if date_from in commence_time:
                            ss_fixtures.append({
                                "id": abs(hash(ev.get("home_team","") + ev.get("away_team","") + commence_time)) % 9_000_000,
                                "league": sport_key.replace("soccer_", "").replace("_", " ").title(),
                                "homeTeam": ev.get("home_team"),
                                "homeTeamId": abs(hash(ev.get("home_team", ""))) % 9_000_000,
                                "awayTeam": ev.get("away_team"),
                                "awayTeamId": abs(hash(ev.get("away_team", ""))) % 9_000_000,
                                "homeTeamLogo": f"https://flagcdn.com/w40/{_country_code(ev.get('home_team',''))}.png",
                                "awayTeamLogo": f"https://flagcdn.com/w40/{_country_code(ev.get('away_team',''))}.png",
                                "kickoff_utc": commence_time,
                                "stateShort": "TIMED",
                                "_odds_bookmakers": ev.get("bookmakers", []),
                            })
                dprint(f"[FreeData] The Odds API fallback supplied {len(ss_fixtures)} fixtures across {len(set(ODDS_SPORT_MAP.values()))} sports.")
            except Exception as e:
                dprint(f"[FreeData] The Odds API fallback error: {e}")

    fetched_ids = set()

    for sf in ss_fixtures:
        league_name = sf.get("league", "")
        league_id = get_internal_league_id_from_sofascore(league_name)
        if not league_id:
            continue

        fid = str(sf.get("id", ""))
        if fid in fetched_ids:
            continue
            
        state = sf.get("stateShort", "")
        if "FINISHED" in status_filter and state not in ("FT", "AET", "PEN"):
            continue
        if "SCHEDULED" in status_filter and state in ("FT", "AET", "PEN", "Postponed", "Canceled"):
            continue
            
        fetched_ids.add(fid)

        fixtures.append({
            "id": fid,
            "league_id": league_id,
            "league_name": league_name,
            "home_team": sf.get("homeTeam", ""),
            "home_team_id": sf.get("homeTeamId"),
            "away_team": sf.get("awayTeam", ""),
            "away_team_id": sf.get("awayTeamId"),
            "home_logo": sf.get("homeTeamLogo", ""),
            "away_logo": sf.get("awayTeamLogo", ""),
            "kickoff_utc": sf.get("kickoff_utc", date_from),
            "provider": sf.get("provider", "sofascore")
        })

    dprint(f"[FreeData] Got {len(fixtures)} fixtures from free stack for {date_from}")
    return fixtures


# ── Team Form Fetching ─────────────────────────────────────────────────────────

def fetch_team_form(team_id, limit=10, league_id=None):
    """
    Fetch last N finished matches for a team.
    Routes through sportscore_client for primary data, with fallbacks.
    """
    is_intl = league_id in INTERNATIONAL_LEAGUE_IDS if league_id else False
    if is_intl:
        try:
            from international_data import fetch_intl_form
            return fetch_intl_form(team_id, limit=limit)
        except Exception as e:
            dprint(f"[FreeData] International form fetch failed: {e}")

    try:
        from sportscore_client import fetch_team_recent_matches as sportscore_form
        results = sportscore_form(str(team_id), limit=limit)
        if results:
            return results
    except Exception as e:
        dprint(f"[FreeData] SportScore1 form fetch failed: {e}")

    matches = fd_api.team_matches(
        team_id=team_id,
        status="FINISHED",
        limit=limit
    )
    if not matches:
        return _fetch_team_form_sofascore(team_id, limit)

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

def _fetch_team_form_sofascore(team_id, limit=10):
    """Fallback fetch for teams/leagues that return 403 from football-data.org."""
    try:
        from sofascore_client import fetch_team_form as sofascore_form
        return sofascore_form(team_id, limit)
    except Exception as e:
        dprint(f"[FreeData] Sofascore form fallback failed: {e}")
        return []


# ── Odds Parsing (per fixture from cached league data) ─────────────────────────

def _normalize_team_name(name):
    """Strip common suffixes and normalize for cross-API matching."""
    n = name.lower().strip()
    for suffix in (' fc', ' cf', ' afc', ' sc', ' united', ' city', ' town', ' albion', ' rovers', ' rangers'):
        if n.endswith(suffix):
            n = n[:-len(suffix)]
            
    # Hardcoded aliases for common national team mismatches
    aliases = {
        "czechia": "czech republic",
        "usa": "united states",
        "south korea": "korea republic",
        "dr congo": "congo dr",
    }
    return aliases.get(n, n)


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

INTERNATIONAL_LEAGUE_IDS = {294, 3016, 3015, 3014, 3013, 3012, 3011, 3010, 3009, 3008, 3007}

def normalize_for_understat(team_name):
    """Map football-data.org name to Understat name if known."""
    return UNDERSTAT_NAME_MAP.get(team_name, team_name)

def _calc_avg_xg(match_data, is_home=True, last_n=10):
    """Calculate average xG from Understat match_data (new get_match_data format)."""
    try:
        if is_home:
            matches = [m for m in match_data if m.get("h_a") == "h"]
        else:
            matches = [m for m in match_data if m.get("h_a") == "a"]
        recent = matches[-last_n:]
        if not recent:
            return None
        xg_key = "xG" if is_home else "xGA"
        vals = [float(m.get(xg_key, 0)) for m in recent if m.get(xg_key) is not None]
        return sum(vals) / len(vals) if vals else None
    except Exception:
        return None

def fetch_xg_from_understat(home_team, away_team, season=2025, league_id=None):
    """
    Fetch team xG averages from Understat.
    Returns (home_xg_avg, away_xg_avg) or (None, None) if unavailable.
    For international games (league_id in INTERNATIONAL_LEAGUE_IDS), delegates to
    international_data.py. Only works for top European leagues (Understat coverage).
    """
    is_intl = league_id in INTERNATIONAL_LEAGUE_IDS if league_id else False
    if is_intl:
        try:
            from international_data import fetch_intl_xg
            return fetch_intl_xg(home_team, away_team)
        except Exception as e:
            dprint(f"[FreeData] International xG fetch failed, falling back to Understat: {e}")

    try:
        from understatapi import UnderstatClient
        home_name = normalize_for_understat(home_team)
        away_name = normalize_for_understat(away_team)

        with UnderstatClient() as client:
            home_data = client.team(team=home_name).get_match_data(season=str(season))
            away_data = client.team(team=away_name).get_match_data(season=str(season))

            home_xg = _calc_avg_xg(home_data, is_home=True)
            away_xg = _calc_avg_xg(away_data, is_home=False)
            return home_xg, away_xg
    except Exception as e:
        dprint(f"[FreeData] Understat xG fetch failed: {e}")
        return None, None

def fetch_xg_for_match(home_team, away_team, season=2025, league_id=None, home_id=None, away_id=None):
    """
    Route xG fetch to appropriate source based on league type.
    International games -> international_data.py (soccerdata/FBref)
    Top 6 Club games -> Understat
    Other leagues -> Sofascore Historical Stats
    """
    is_intl = league_id in INTERNATIONAL_LEAGUE_IDS if league_id else False
    if is_intl:
        try:
            from international_data import fetch_intl_xg
            return fetch_intl_xg(home_team, away_team)
        except Exception:
            pass
            
    hx, ax = fetch_xg_from_understat(home_team, away_team, season)
    
    # Fallback to Sofascore for unsupported lower leagues
    if (hx is None or ax is None) and home_id and away_id:
        try:
            from sofascore_client import fetch_historical_xg_sofascore
            ss_hx = fetch_historical_xg_sofascore(home_id)
            ss_ax = fetch_historical_xg_sofascore(away_id)
            if ss_hx > 0 and ss_ax > 0:
                dprint(f"[FreeData] Using Sofascore historical xG for {home_team} vs {away_team}")
                return ss_hx, ss_ax
        except Exception as e:
            dprint(f"[FreeData] Sofascore xG fallback failed: {e}")
            
    return hx, ax


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

    matches = fd_api.live_matches()
    if not matches:
        return []

    live_games = []
    for m in matches:
        home = m.get("homeTeam", {})
        away = m.get("awayTeam", {})
        score = m.get("score", {}).get("fullTime", {}) or m.get("score", {}).get("halfTime", {}) or {}

        live_games.append({
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

    return live_games


# ── Match Result Fetching (for grading) ────────────────────────────────────────

def fetch_match_result_free(fixture_id):
    """
    Fetch a single match result from football-data.org for grading.
    Returns {home_goals, away_goals, state, closing_odds} or None.
    """
    if not FOOTBALL_DATA_KEY:
        return None

    data = fd_api.match_result(fixture_id)
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