"""
data_pipeline.py
────────────────
Fetches and normalizes match + team data from the Sportmonks API.
Outputs a list of enriched MatchData objects ready for the model pipeline.
"""

import os
import sys
import math
import time
import requests
from datetime import datetime, timedelta, timezone

LAGOS_TZ = timezone(timedelta(hours=1))
from dataclasses import dataclass, field
from typing import Optional
from league_config import APPROVED_LEAGUE_IDS, get_league_info, get_priority_score

# ── Config ────────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env.local'))
except ImportError:
    pass

SM_TOKEN = os.environ.get("SPORTMONKS_API_TOKEN") or os.environ.get("VITE_SPORTMONKS_API_TOKEN", "")
SM_BASE = "https://api.sportmonks.com/v3/football"
MAX_MATCHES = 100
RECENT_DAYS = 90  # Look back 90 days for form data

# API-Football.com (for H2H data — free plan, 100 calls/day)
AF_KEY = os.environ.get("API_FOOTBALL_KEY", "")
AF_BASE = "https://v3.football.api-sports.io"


# ── Data Structures ───────────────────────────────────────────────────────────
@dataclass
class TeamStats:
    team_id: int
    team_name: str
    avg_scored: float = 0.0
    avg_conceded: float = 0.0
    home_avg_scored: float = 0.0
    home_avg_conceded: float = 0.0
    away_avg_scored: float = 0.0
    away_avg_conceded: float = 0.0
    form: str = "N/A"          # e.g. "W W D L W"
    form_score: float = 0.5    # 0–1 normalized
    win_rate: float = 0.0
    clean_sheet_rate: float = 0.0
    matches_analyzed: int = 0

    # --- Advanced Form Metrics ---
    avg_xg_created: float = 0.0
    avg_xg_conceded: float = 0.0
    avg_possession: float = 50.0
    avg_shots_on_target: float = 0.0
    sidelined_count: int = 0

    # FIX-6: Opponent strengths for form model (opponent Elo ratings)
    recent_opponents: list[int] = field(default_factory=list)


@dataclass
class OddsData:
    home_odds: float = 0.0
    draw_odds: float = 0.0
    away_odds: float = 0.0
    over25_odds: float = 0.0
    under25_odds: float = 0.0
    over15_odds: float = 0.0
    under15_odds: float = 0.0
    over35_odds: float = 0.0
    under35_odds: float = 0.0
    btts_yes_odds: float = 0.0
    btts_no_odds: float = 0.0
    # OPP-01: Composite odds
    btts_and_over25_odds: float = 0.0
    # Double Chance
    dc_1x_odds: float = 0.0
    dc_x2_odds: float = 0.0
    dc_12_odds: float = 0.0
    # Draw No Bet
    dnb_home_odds: float = 0.0
    dnb_away_odds: float = 0.0
    # Asian Handicap -0.5 (equivalent to DNB but priced differently)
    ah_home_minus05: float = 0.0
    ah_away_plus05: float = 0.0
    # Line movement tracking (Upgrade #3)
    opening_home_odds: float = 0.0
    opening_away_odds: float = 0.0
    opening_draw_odds: float = 0.0
    odds_fetched_at: str = ""  # ISO timestamp for staleness guard

    def has_odds(self) -> bool:
        return self.home_odds > 1.0 and self.away_odds > 1.0


@dataclass
class MatchData:
    fixture_id: str
    league: str
    league_id: int
    league_tier: int
    home_team: str
    home_team_id: int
    away_team: str
    away_team_id: int
    kickoff_utc: str
    kickoff_local: str
    home_logo: str = ""
    away_logo: str = ""
    home_stats: Optional[TeamStats] = None
    away_stats: Optional[TeamStats] = None
    home_sidelined_count: int = 0
    away_sidelined_count: int = 0
    h2h_home_wins: int = 0
    h2h_away_wins: int = 0
    h2h_draws: int = 0
    h2h_avg_goals: float = 0.0
    h2h_btts_rate: float = 0.0
    odds: OddsData = field(default_factory=OddsData)
    # Derived fields (filled by model pipeline)
    expected_goals_home: float = 0.0
    expected_goals_away: float = 0.0
    sm_pred_home_win: float = 0.0
    sm_pred_draw: float = 0.0
    sm_pred_away_win: float = 0.0
    sm_pred_available: bool = False


# ── API Helpers ───────────────────────────────────────────────────────────────
def _get(path: str, params: dict | None = None) -> list | dict | None:
    """Single-page GET to Sportmonks v3 API with exponential backoff retry."""
    if not SM_TOKEN:
        print("[DataPipeline] ERROR: No Sportmonks API token found.", file=sys.stderr)
        return None
    base_params = {"api_token": SM_TOKEN}
    if params:
        base_params.update(params)
        
    max_attempts = 5
    base_delay = 2.0
    for attempt in range(max_attempts):
        try:
            resp = requests.get(f"{SM_BASE}{path}", params=base_params, timeout=45)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt < max_attempts - 1:
                delay = base_delay * (2 ** attempt)
                print(f"[DataPipeline] API error on {path} (attempt {attempt+1}): {e}. Retrying in {delay}s...", file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[DataPipeline] API error on {path} after {max_attempts} attempts: {e}", file=sys.stderr)
    return None


def _get_paginated(path: str, params: dict | None = None, max_pages: int = 5) -> list:
    """Paginated GET, returns flattened data array."""
    all_data = []
    p = params.copy() if params else {}
    for page in range(1, max_pages + 1):
        p["page"] = page
        result = _get(path, p)
        if not result:
            break
        data = result.get("data", [])
        if isinstance(data, list):
            all_data.extend(data)
        elif isinstance(data, dict):
            all_data.append(data)
            break
        pagination = result.get("pagination", {})
        if not pagination.get("has_more", False):
            break
    return all_data


def fetch_sportmonks_prediction(fixture_id: int) -> dict | None:
    """Fetch Sportmonks' own pre-built probability model for a fixture.
    Returns dict with keys: home_win, draw, away_win (0-1 floats) or None."""
    try:
        result = _get(f"/predictions/probabilities/fixture/{fixture_id}")
        if not result or not result.get("data"):
            return None
        data = result["data"]
        if isinstance(data, list):
            data = data[0] if data else {}
        predictions = data.get("predictions", {})
        hw = float(predictions.get("home_win_percentage", 0)) / 100.0
        d  = float(predictions.get("draw_percentage", 0)) / 100.0
        aw = float(predictions.get("away_win_percentage", 0)) / 100.0
        if hw + d + aw < 0.5:
            return None
        return {"home_win": hw, "draw": d, "away_win": aw}
    except Exception as e:
        print(f"[DataPipeline] Sportmonks prediction fetch failed for {fixture_id}: {e}", file=sys.stderr)
        return None


# ── League average goals (fallback) ───────────────────────────────────────────
LEAGUE_AVG_GOALS = {
    8: 2.85, 564: 2.64, 82: 3.05, 384: 2.75, 301: 2.65,
    2: 2.95, 5: 2.80, 7: 2.60, 72: 3.10, 462: 2.50,
}
DEFAULT_LEAGUE_AVG = 2.70


def _league_avg(league_id: int) -> float:
    return LEAGUE_AVG_GOALS.get(league_id, DEFAULT_LEAGUE_AVG)


# ── Form parser ───────────────────────────────────────────────────────────────
def _parse_form(recent_fixtures: list, team_id: int) -> TeamStats:
    """Parse last-N fixtures for a team into TeamStats."""
    stats = TeamStats(team_id=team_id, team_name="")
    if not recent_fixtures:
        return stats

    results = []
    home_scored, home_conceded, home_matches = 0, 0, 0
    away_scored, away_conceded, away_matches = 0, 0, 0
    wins, clean_sheets = 0, 0

    total_xg_created, total_xg_conceded = 0.0, 0.0
    total_possession, total_sot = 0.0, 0.0
    total_shots = 0.0
    stats_matches = 0
    opponent_ids = []  # FIX-6: Track recent opponents for Elo-based form weighting

    for fx in recent_fixtures[:10]:
        # FIX-7: Only include completed matches in form analysis
        state = fx.get("state", {})
        state_val = (state.get("state") or "") if state else ""
        if state_val not in ("FT", "AET", "PEN"):
            continue

        participants = fx.get("participants", [])
        home_p = next((p for p in participants if p.get("meta", {}).get("location") == "home"), {})
        away_p = next((p for p in participants if p.get("meta", {}).get("location") == "away"), {})
        scores = fx.get("scores", [])

        is_home = home_p.get("id") == team_id
        my_pid = home_p.get("id") if is_home else away_p.get("id")
        opp_pid = away_p.get("id") if is_home else home_p.get("id")

        my_goals = next((s["score"]["goals"] for s in scores
                        if s.get("participant_id") == my_pid and s.get("description") == "CURRENT"), None)
        opp_goals = next((s["score"]["goals"] for s in scores
                         if s.get("participant_id") == opp_pid and s.get("description") == "CURRENT"), None)

        if my_goals is None or opp_goals is None:
            continue

        if is_home:
            home_scored += my_goals; home_conceded += opp_goals; home_matches += 1
        else:
            away_scored += my_goals; away_conceded += opp_goals; away_matches += 1

        if my_goals > opp_goals:
            results.append("W"); wins += 1
        elif my_goals < opp_goals:
            results.append("L")
        else:
            results.append("D")

        if opp_goals == 0:
            clean_sheets += 1

        # Extract advanced statistics
        raw_stats = fx.get("statistics") or []
        stats_list = raw_stats if isinstance(raw_stats, list) else (raw_stats.get("data", []) if isinstance(raw_stats, dict) else [])
        
        has_stats = False
        my_xg, opp_xg, my_poss, my_sot = 0.0, 0.0, 50.0, 0.0
        my_shots = 0.0
        loc_str = "home" if is_home else "away"
        opp_loc = "away" if is_home else "home"

        for stat in stats_list:
            tid = stat.get("type_id")
            s_loc = stat.get("location", "")
            val = stat.get("data", {}).get("value") if isinstance(stat.get("data"), dict) else stat.get("value")
            try:
                val = float(val)
                has_stats = True
                # FIX-1: Correct type_id mapping
                # type_id=580 = xG On Target (Sportmonks' own expected goals metric)
                if tid == 580:
                    if s_loc == loc_str: my_xg = val
                    elif s_loc == opp_loc: opp_xg = val
                # type_id=86 = Shots on Target
                elif tid == 86 and s_loc == loc_str:
                    my_sot = val
                # type_id=41 = Total Shots (use as xG fallback if no SOT xG)
                elif tid == 41 and s_loc == loc_str:
                    my_shots = val
                # type_id=45 = Ball Possession (%)
                elif tid == 45 and s_loc == loc_str:
                    my_poss = val
            except (TypeError, ValueError):
                pass

        if has_stats:
            # FIX-1: xG on target is the gold standard (Sportmonks computed xG)
            # If unavailable, derive xG proxy from shots on target (avg 0.35 xG/SOT)
            # and also use total shots as secondary signal
            if my_xg == 0.0 and my_sot > 0:
                my_xg = round(my_sot * 0.35, 3)
            if opp_xg == 0.0 and my_shots > 0:
                # Use our shots to estimate opp's xG conceded (rough but better than zero)
                opp_xg = round(my_shots * 0.12, 3)
            total_xg_created  += my_xg
            total_xg_conceded += opp_xg
            total_possession  += my_poss
            total_sot         += my_sot
            stats_matches += 1

    n = len(results)
    if n == 0:
        return stats

    # Form string (last 5 only)
    last5 = results[-5:][::-1]  # Reverse so most recent match is FIRST (matches recency weights)
    stats.form = " ".join(last5)
    stats.form_score = sum(3 if r == "W" else (1 if r == "D" else 0) for r in last5) / (3 * len(last5))
    stats.win_rate = wins / n
    stats.clean_sheet_rate = clean_sheets / n
    stats.matches_analyzed = n

    total_scored = home_scored + away_scored
    total_conceded = home_conceded + away_conceded
    total_m = home_matches + away_matches
    stats.avg_scored = total_scored / total_m if total_m > 0 else 1.2
    stats.avg_conceded = total_conceded / total_m if total_m > 0 else 1.2
    stats.home_avg_scored = home_scored / home_matches if home_matches > 0 else stats.avg_scored
    stats.home_avg_conceded = home_conceded / home_matches if home_matches > 0 else stats.avg_conceded
    stats.away_avg_scored = away_scored / away_matches if away_matches > 0 else stats.avg_scored
    stats.away_avg_conceded = away_conceded / away_matches if away_matches > 0 else stats.avg_conceded

    if stats_matches > 0:
        stats.avg_xg_created = total_xg_created / stats_matches
        stats.avg_xg_conceded = total_xg_conceded / stats_matches
        stats.avg_possession = total_possession / stats_matches
        stats.avg_shots_on_target = total_sot / stats_matches
    else:
        stats.avg_xg_created = stats.avg_scored
        stats.avg_xg_conceded = stats.avg_conceded

    # FIX-6: Store recent opponent IDs for Elo-based form weighting
    stats.recent_opponents = opponent_ids[-10:]

    return stats


# ── H2H via API-Football.com (with Firestore cache) ──────────────────────────

def _get_firestore_client():
    """
    Return an authenticated Firestore client.
    Reads FIREBASE_SERVICE_ACCOUNT JSON (already set in Railway for Node.js backend)
    and uses it as explicit credentials so no ADC / key-file is needed.
    Falls back to ADC if the env var is absent (local dev with `gcloud auth`).
    """
    import json
    from google.cloud import firestore as gfs
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
    if sa_json:
        try:
            from google.oauth2 import service_account
            info = json.loads(sa_json)
            creds = service_account.Credentials.from_service_account_info(
                info,
                scopes=["https://www.googleapis.com/auth/datastore"],
            )
            project_id = info.get("project_id") or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
            return gfs.Client(project=project_id, credentials=creds)
        except Exception as e:
            print(f"[H2H] Failed to build Firestore client from FIREBASE_SERVICE_ACCOUNT: {e}", file=sys.stderr)
    # Fallback: Application Default Credentials (local dev)
    return gfs.Client()


def _load_team_cache() -> dict[str, int]:
    """Load API-Football team ID cache from Firestore (persistent across runs)."""
    try:
        db = _get_firestore_client()
        doc = db.collection("system_cache").document("af_team_ids").get(timeout=5)
        if doc.exists:
            return doc.to_dict().get("teams", {})
    except Exception as e:
        print(f"[H2H] Persistent team cache unavailable: {e}", file=sys.stderr)
    return {}

def _save_team_cache(cache: dict[str, int]):
    """Persist team ID cache to Firestore."""
    try:
        db = _get_firestore_client()
        db.collection("system_cache").document("af_team_ids").set({
            "teams": cache,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, timeout=10)
    except Exception as e:
        print(f"[H2H] Failed to save persistent team cache: {e}", file=sys.stderr)

_af_team_id_cache: dict[str, int] = _load_team_cache()  # team_name -> API-Football team ID


def _af_get(endpoint: str, params: dict | None = None) -> dict | None:
    """GET request to API-Football.com with header auth."""
    if not AF_KEY:
        return None
    try:
        resp = requests.get(
            f"{AF_BASE}/{endpoint}",
            params=params or {},
            headers={"x-apisports-key": AF_KEY},
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json()
        print(f"[H2H] API-Football error {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"[H2H] API-Football request error: {e}", file=sys.stderr)
    return None


def _af_find_team_id(team_name: str) -> int | None:
    """Search API-Football for a team ID by name. Cached persistently."""
    global _af_team_id_cache
    if team_name in _af_team_id_cache:
        return _af_team_id_cache[team_name]
    
    for attempt in range(2):
        try:
            data = _af_get("teams", {"search": team_name})
            if data and data.get("response"):
                # Take exact match or first result
                for t in data["response"]:
                    tid = t.get("team", {}).get("id")
                    name = t.get("team", {}).get("name", "")
                    if name.lower() == team_name.lower() and tid:
                        _af_team_id_cache[team_name] = tid
                        _save_team_cache(_af_team_id_cache)
                        return tid
                # Fallback: first result
                tid = data["response"][0].get("team", {}).get("id")
                if tid:
                    _af_team_id_cache[team_name] = tid
                    _save_team_cache(_af_team_id_cache)
                    return tid
            return None # Successful API call but no teams found
        except Exception as e:
            print(f"[H2H] API-Football lookup failed for {team_name} (attempt {attempt+1}): {e}", file=sys.stderr)
            time.sleep(1) # delay before retry
    return None


def _fetch_h2h_cached(home_name: str, away_name: str, home_sm_id: int, away_sm_id: int, league_id: int) -> tuple:
    """
    Fetch H2H data via API-Football.com with Firestore caching.
    Returns (h2h_home_wins, h2h_away_wins, h2h_draws, avg_goals, btts_rate).
    Cache key: sorted team IDs to ensure consistency regardless of home/away order.
    """
    default = (0, 0, 0, _league_avg(league_id), 0.45)

    if not AF_KEY:
        return default

    # ── Check Firestore cache first ────────────────────────────────────────
    cache_key = f"{min(home_sm_id, away_sm_id)}_{max(home_sm_id, away_sm_id)}"
    try:
        db = _get_firestore_client()
        cache_doc = db.collection("h2h_cache").document(cache_key).get(timeout=5)
        if cache_doc.exists:
            cd = cache_doc.to_dict()
            # Cache valid for 30 days
            cached_at = cd.get("cached_at", "")
            if cached_at:
                try:
                    ct = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                    if (datetime.now(timezone.utc) - ct).days < 30:
                        print(f"[H2H] Using cached data for {home_name} vs {away_name}")
                        return (cd.get("hw", 0), cd.get("aw", 0), cd.get("dr", 0),
                                cd.get("avg_goals", default[3]), cd.get("btts_rate", 0.45))
                except Exception as e:
                    print(f"[H2H] Cache date parse error: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[H2H] Firestore cache read error: {e}", file=sys.stderr)

    # ── Resolve API-Football team IDs ──────────────────────────────────────
    af_home = _af_find_team_id(home_name)
    af_away = _af_find_team_id(away_name)
    if not af_home or not af_away:
        print(f"[H2H] Team IDs not found ({home_name}: {af_home}, {away_name}: {af_away}) — FALLBACK TO ZERO H2H", file=sys.stderr)
        return default

    # ── Fetch H2H from API-Football with retry ────────────────────────────
    h2h_data = None
    for attempt in range(2):
        data = _af_get("fixtures/headtohead", {"h2h": f"{af_home}-{af_away}"})
        if data and data.get("response"):
            h2h_data = data
            break
        if attempt < 1:
            print(f"[H2H] H2H fetch failed (attempt {attempt+1}), retrying in 1s...", file=sys.stderr)
            time.sleep(1)
        else:
            print(f"[H2H] H2H fetch failed after 2 attempts for {home_name} vs {away_name} — FALLBACK TO ZERO H2H", file=sys.stderr)
    
    if not h2h_data or not h2h_data.get("response"):
        return default

    # Parse last 8 completed matches
    matches = [m for m in h2h_data["response"] if m.get("fixture", {}).get("status", {}).get("short") == "FT"]
    matches.sort(key=lambda x: x.get("fixture", {}).get("date", ""), reverse=True)
    recent = matches[:8]

    hw = aw = dr = total_goals = btts_count = 0
    for m in recent:
        hg = m.get("goals", {}).get("home")
        ag = m.get("goals", {}).get("away")
        if hg is None or ag is None:
            continue
        h_team_id = m.get("teams", {}).get("home", {}).get("id")
        # Determine who is "home" in our context
        if h_team_id == af_home:
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

    n = hw + aw + dr
    avg_goals = total_goals / n if n > 0 else _league_avg(league_id)
    btts_rate = btts_count / n if n > 0 else 0.45
    result = (hw, aw, dr, round(avg_goals, 2), round(btts_rate, 3))

    # ── Cache to Firestore ─────────────────────────────────────────────────
    try:
        db = _get_firestore_client()
        db.collection("h2h_cache").document(cache_key).set({
            "hw": hw, "aw": aw, "dr": dr,
            "avg_goals": result[3], "btts_rate": result[4],
            "home_name": home_name, "away_name": away_name,
            "af_home_id": af_home, "af_away_id": af_away,
            "matches_parsed": n,
            "cached_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        print(f"[H2H] Cache save error: {e}", file=sys.stderr)

    print(f"[H2H] {home_name} vs {away_name}: {hw}W/{dr}D/{aw}L (avg {avg_goals:.1f} goals, BTTS {btts_rate:.0%})")
    return result


# ── Odds parser ───────────────────────────────────────────────────────────────
def _parse_odds(odds_list: list) -> OddsData:
    od = OddsData()
    if not odds_list:
        return od

    od.odds_fetched_at = datetime.now(timezone.utc).isoformat()

    # Track opening odds (first/lowest-timestamped) and current (highest price)
    opening_1x2 = {"home": 999.0, "draw": 999.0, "away": 999.0}

    # Sportmonks v3 returns odds as a flat list of objects.
    # Market IDs: 1=1X2, 2=Double Chance, 7=Draw No Bet, 14=BTTS, 80=Over/Under
    for odd in odds_list:
        market_id = odd.get("market_id")
        name = str(odd.get("name") or "").lower()
        label = str(odd.get("label") or "").lower()
        price = float(odd.get("value") or 0.0)
        if price <= 1.0:
            continue

        # ── 1X2 Match Winner ───────────────────────────────────────────
        if market_id == 1:
            if "home" in label or "1" == label:
                od.home_odds = max(od.home_odds, price)
                opening_1x2["home"] = min(opening_1x2["home"], price)
            elif "draw" in label or "x" == label:
                od.draw_odds = max(od.draw_odds, price)
                opening_1x2["draw"] = min(opening_1x2["draw"], price)
            elif "away" in label or "2" == label:
                od.away_odds = max(od.away_odds, price)
                opening_1x2["away"] = min(opening_1x2["away"], price)

        # ── Double Chance (market_id=2) ────────────────────────────────
        elif market_id == 2:
            if "1x" in label or "home or draw" in name:
                od.dc_1x_odds = max(od.dc_1x_odds, price)
            elif "x2" in label or "draw or away" in name:
                od.dc_x2_odds = max(od.dc_x2_odds, price)
            elif "12" in label or "home or away" in name:
                od.dc_12_odds = max(od.dc_12_odds, price)

        # ── Draw No Bet (market_id=7) ──────────────────────────────────
        elif market_id == 7:
            if "home" in label or "1" == label:
                od.dnb_home_odds = max(od.dnb_home_odds, price)
            elif "away" in label or "2" == label:
                od.dnb_away_odds = max(od.dnb_away_odds, price)

        # ── Over/Under Goals (market_id=80) ────────────────────────────
        elif market_id == 80:
            total = str(odd.get("total") or "")
            is_over = "over" in label or "over" in name
            is_under = "under" in label or "under" in name
            if "1.5" in total:
                if is_over: od.over15_odds = max(od.over15_odds, price)
                elif is_under: od.under15_odds = max(od.under15_odds, price)
            elif "2.5" in total:
                if is_over: od.over25_odds = max(od.over25_odds, price)
                elif is_under: od.under25_odds = max(od.under25_odds, price)
            elif "3.5" in total:
                if is_over: od.over35_odds = max(od.over35_odds, price)
                elif is_under: od.under35_odds = max(od.under35_odds, price)

        # ── BTTS (market_id=14) ────────────────────────────────────────
        elif market_id == 14:
            if "yes" in label or "yes" in name:
                od.btts_yes_odds = max(od.btts_yes_odds, price)
            elif "no" in label or "no" in name:
                od.btts_no_odds = max(od.btts_no_odds, price)

        # ── Asian Handicap -0.5 (market_id=10 in Sportmonks) ───────────
        elif market_id == 10:
            handicap = str(odd.get("handicap") or odd.get("total") or "")
            if "-0.5" in handicap and ("home" in label or "1" == label):
                od.ah_home_minus05 = max(od.ah_home_minus05, price)
            elif "+0.5" in handicap and ("away" in label or "2" == label):
                od.ah_away_plus05 = max(od.ah_away_plus05, price)

    # Store opening odds for line movement analysis
    if opening_1x2["home"] < 900:
        od.opening_home_odds = opening_1x2["home"]
    if opening_1x2["away"] < 900:
        od.opening_away_odds = opening_1x2["away"]
    if opening_1x2["draw"] < 900:
        od.opening_draw_odds = opening_1x2["draw"]

    return od


# ── Main pipeline ─────────────────────────────────────────────────────────────
def fetch_matches(date_str: str | None = None) -> list[MatchData]:
    """
    Fetch and normalize matches for the given date (YYYY-MM-DD).
    Returns a list of MatchData sorted by league tier, up to MAX_MATCHES.
    """
    if date_str is None:
        date_str = datetime.now(LAGOS_TZ).strftime("%Y-%m-%d")

    print(f"[DataPipeline] Fetching fixtures for {date_str}...")
    # Upgrade #10: Include lineups and sidelined for richer "Valid Test" data
    # Note: Only available in Sportmonks Pro/Enterprise plans.
    include_str = "league;participants;scores;odds;statistics;lineups;sidelined"
    
    raw = _get_paginated(
        f"/fixtures/date/{date_str}",
        params={"include": include_str, "per_page": 100},
        max_pages=3,
    )
    if not raw:
        print("[DataPipeline] No fixtures returned.", file=sys.stderr)
        return []

    # ── 🚨 Global Past Match Filter (Bypassed if date_str is in the past) ──
    is_today = date_str == datetime.now(LAGOS_TZ).strftime("%Y-%m-%d")
    if is_today:
        future_raw = []
        now_utc = datetime.now(timezone.utc)
        for item in raw:
            starting_at = item.get("starting_at", "")
            if starting_at:
                try:
                    kick = datetime.fromisoformat(starting_at.replace("Z", "+00:00"))
                    if kick.tzinfo is None:
                        kick = kick.replace(tzinfo=timezone.utc)
                    # Filter out matches starting within 30 minutes to avoid late predictions
                    if kick > (now_utc + timedelta(minutes=30)):
                        future_raw.append(item)
                except Exception:
                    pass
        raw = future_raw
    else:
        print(f"[DataPipeline] Past date requested ({date_str}). Bypassing future filter.")

    print(f"[DataPipeline] Raw fixtures (future only): {len(raw)}")

    # ── Filter approved leagues ────────────────────────────────────────────
    from league_config import get_league_info, get_priority_score
    TIER_PRIORITY = {1: 150, 2: 100, 3: 60, 4: 30}
    approved = []
    for item in raw:
        lid = item.get("league_id")
        league_info = get_league_info(lid)
        
        if league_info:
            tier = league_info["tier"]
            priority = get_priority_score(lid)
            participants = item.get("participants", [])
            home_p = next((p for p in participants if p.get("meta", {}).get("location") == "home"), None)
            away_p = next((p for p in participants if p.get("meta", {}).get("location") == "away"), None)
            
            if home_p and away_p:
                approved.append({
                    "raw": item,
                    "league_id": lid,
                    "league_name": league_info.get("name") or (item.get("league", {}).get("name") if item.get("league") else "Unknown League"),
                    "league_tier": tier,
                    "priority": priority,
                    "home_p": home_p,
                    "away_p": away_p,
                })

    # Sort by priority
    approved.sort(key=lambda x: x["priority"], reverse=True)
    
    # --- FALLBACK LOGIC ---
    # If we have very few matches from approved leagues, fill with ANY fixture that has odds
    if len(approved) < 15:
        print(f"[DataPipeline] Only {len(approved)} approved fixtures. Loosening filters to include all leagues...")
        for item in raw:
            lid = item.get("league_id")
            # Skip if already in approved list
            if any(a["raw"].get("id") == item.get("id") for a in approved):
                continue
            
            # Basic validation: must have participants and odds
            participants = item.get("participants", [])
            home_p = next((p for p in participants if p.get("meta", {}).get("location") == "home"), None)
            away_p = next((p for p in participants if p.get("meta", {}).get("location") == "away"), None)
            if not home_p or not away_p:
                continue
            
            # Must have at least basic 1X2 odds to be useful
            raw_odds = item.get("odds") or []
            if not raw_odds:
                continue

            # Skip already-starte matches
            starting_at = item.get("starting_at", "")
            if starting_at:
                try:
                    kick = datetime.fromisoformat(starting_at.replace("Z", "+00:00"))
                    if kick <= datetime.now(timezone.utc):
                        continue
                except Exception:
                    pass

            approved.append({
                "raw": item,
                "league_id": lid,
                "league_name": item.get("league", {}).get("name", "Unknown League"),
                "league_tier": 5, # Low priority / Unknown
                "priority": 0,
                "home_p": home_p,
                "away_p": away_p,
            })
    
    # Cap at MAX_MATCHES
    approved = approved[:MAX_MATCHES]
    print(f"[DataPipeline] Final fixtures for analysis: {len(approved)}")

    # ── Enrich each fixture with team stats + H2H ──────────────────────────
    from_date = (datetime.now(LAGOS_TZ) - timedelta(days=RECENT_DAYS)).strftime("%Y-%m-%d")
    matches: list[MatchData] = []

    for entry in approved:
        item = entry["raw"]
        home_p = entry["home_p"]
        away_p = entry["away_p"]
        home_id = home_p.get("id")
        away_id = away_p.get("id")
        lid = entry["league_id"]

        # Build kickoff strings
        starting_at = item.get("starting_at", "")
        try:
            kick_utc = datetime.fromisoformat(starting_at.replace("Z", "+00:00"))
            kickoff_utc = kick_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
            kickoff_local = kick_utc.strftime("%H:%M")
        except Exception:
            kickoff_utc = starting_at
            kickoff_local = starting_at

        md = MatchData(
            fixture_id=str(item.get("id", "")),
            league=entry["league_name"],
            league_id=lid,
            league_tier=entry["league_tier"],
            home_team=home_p.get("name", "Home"),
            home_team_id=home_id,
            away_team=away_p.get("name", "Away"),
            away_team_id=away_id,
            kickoff_utc=kickoff_utc,
            kickoff_local=kickoff_local,
            home_logo=home_p.get("image_path", ""),
            away_logo=away_p.get("image_path", ""),
        )

        # Parse odds (now includes DC, DNB, O/U 1.5/3.5, AH, line movement)
        raw_odds = item.get("odds") or []
        odds_list = raw_odds if isinstance(raw_odds, list) else (raw_odds.get("data", []) if isinstance(raw_odds, dict) else [])
        md.odds = _parse_odds(odds_list)

        # ── Extract sidelined (injury) counts (Upgrade #13) ────────────
        raw_sidelined = item.get("sidelined") or []
        sidelined_list = raw_sidelined if isinstance(raw_sidelined, list) else (raw_sidelined.get("data", []) if isinstance(raw_sidelined, dict) else [])
        for s in sidelined_list:
            s_team_id = s.get("team_id")
            if s_team_id == home_id:
                md.home_sidelined_count += 1
            elif s_team_id == away_id:
                md.away_sidelined_count += 1


        # ── Extract xG from Sportmonks fixture statistics ─────────────────
        # FIX-1: Use type_id=580 (xG On Target) — Sportmonks' own computed xG
        # If unavailable, fall back to avg_xg_created from form analysis (already computed)
        xg_home = None
        xg_away = None
        raw_stats = item.get("statistics") or []
        stats_list = raw_stats if isinstance(raw_stats, list) else (raw_stats.get("data", []) if isinstance(raw_stats, dict) else [])
        for stat in stats_list:
            tid = stat.get("type_id")
            s_loc = stat.get("location", "")
            val = stat.get("data", {}).get("value") if isinstance(stat.get("data"), dict) else stat.get("value")
            try:
                val = float(val)
                if tid == 580:
                    if s_loc == "home": xg_home = val
                    elif s_loc == "away": xg_away = val
            except (TypeError, ValueError):
                pass

        # Fetch team form (recent matches)
        try:
            home_recent = _get_paginated(
                f"/fixtures/between/{from_date}/{date_str}",
                {"include": "participants;scores;statistics", "filters": f"participantSearch:{home_id}", "per_page": 10},
                max_pages=1,
            )
            away_recent = _get_paginated(
                f"/fixtures/between/{from_date}/{date_str}",
                {"include": "participants;scores;statistics", "filters": f"participantSearch:{away_id}", "per_page": 10},
                max_pages=1,
            )
            home_stats = _parse_form(home_recent, home_id)
            away_stats = _parse_form(away_recent, away_id)
            home_stats.team_name = md.home_team
            away_stats.team_name = md.away_team
            md.home_stats = home_stats
            md.away_stats = away_stats
        except Exception as e:
            print(f"[DataPipeline] Form fetch error for {md.home_team} vs {md.away_team}: {e}", file=sys.stderr)

        # Fetch H2H via API-Football.com (cached in Firestore)
        try:
            hw, aw, dr, avg_g, btts_r = _fetch_h2h_cached(
                md.home_team, md.away_team, home_id, away_id, lid
            )
            md.h2h_home_wins = hw
            md.h2h_away_wins = aw
            md.h2h_draws = dr
            md.h2h_avg_goals = avg_g
            md.h2h_btts_rate = btts_r
        except Exception as e:
            print(f"[DataPipeline] H2H fetch error: {e}", file=sys.stderr)
            md.h2h_home_wins, md.h2h_away_wins, md.h2h_draws, md.h2h_btts_rate = 0, 0, 0, 0.0
            md.h2h_avg_goals = _league_avg(lid)

        # ── Compute expected goals ─────────────────────────────────────
        # Upgrade #1: Prefer real xG from Sportmonks statistics.
        # Falls back to Dixon-Coles attack/defence product from raw goals.
        league_avg = _league_avg(lid)

        if xg_home is not None and xg_away is not None:
            # Real xG available — use directly (gold standard)
            md.expected_goals_home = max(0.2, xg_home)
            md.expected_goals_away = max(0.2, xg_away)
            xg_source = "API-xG"
        else:
            # Fallback: Dixon-Coles attack/defence from raw goal averages
            # Use league-average defaults when team stats are missing or zero
            # (zero avg_scored means form fetch returned no data — don't let xG collapse to 0.2)
            half_avg = league_avg / 2

            home_scored_val = md.home_stats.home_avg_scored if md.home_stats else 0
            away_conceded_val = md.away_stats.away_avg_conceded if md.away_stats else 0
            away_scored_val = md.away_stats.away_avg_scored if md.away_stats else 0
            home_conceded_val = md.home_stats.home_avg_conceded if md.home_stats else 0

            # If no data available, default to league-average attacking/defensive strength (1.0 ratio)
            home_att = (home_scored_val / half_avg) if home_scored_val > 0 else 1.0
            away_def = (away_conceded_val / half_avg) if away_conceded_val > 0 else 1.0
            away_att = (away_scored_val / half_avg) if away_scored_val > 0 else 1.0
            home_def = (home_conceded_val / half_avg) if home_conceded_val > 0 else 1.0

            # FIX-4: Home advantage multiplier removed here.
            # League-aware home advantage (5-10%) is now applied ONLY in probability_engine.py
            # via HOME_ADVANTAGE dict keyed by league_tier. Having it here too caused
            # double-application (1.12 × 1.08 = 1.23 for tier-2) inflating home win probabilities.
            md.expected_goals_home = max(0.75, home_att * away_def * half_avg)
            md.expected_goals_away = max(0.60, away_att * home_def * half_avg)
            xg_source = "model"

        matches.append(md)
        print(f"[DataPipeline]   [OK] {md.home_team} vs {md.away_team} (xG: {md.expected_goals_home:.2f}-{md.expected_goals_away:.2f} [{xg_source}])")

    print(f"[DataPipeline] Pipeline complete: {len(matches)} enriched matches.")
    return matches


if __name__ == "__main__":
    import json
    date = sys.argv[1] if len(sys.argv) > 1 else None
    result = fetch_matches(date)
    print(json.dumps([{"fixture_id": m.fixture_id, "home": m.home_team, "away": m.away_team,
                       "xG": [m.expected_goals_home, m.expected_goals_away]} for m in result], indent=2))
