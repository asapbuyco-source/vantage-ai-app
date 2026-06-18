"""
sofascore_client.py
───────────────────
Unofficial Sofascore API client for fetching:
  - Fixtures and live scores
  - Lineups
  - Match stats
  - Head-to-head records

Uses tls_client (Chrome TLS fingerprint) to bypass Cloudflare on Railway/cloud.
Falls back to requests if tls_client is unavailable.

Working base URL: https://www.sofascore.com/api/v1  (NOT api.sofascore.com)
"""

import os
import sys
import urllib3
urllib3.disable_warnings()
from datetime import datetime, timezone
from typing import Optional

# ── HTTP session: prefer tls_client (bypasses Cloudflare) ─────────────────────
try:
    import tls_client as _tls_client
    _session = _tls_client.Session(client_identifier="chrome_120")
    _TLS_MODE = True
except ImportError:
    import requests as _requests_mod
    _session = _requests_mod.Session()
    _session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
    })
    _session.verify = False
    _TLS_MODE = False

# ── Base URLs ─────────────────────────────────────────────────────────────────
# www.sofascore.com/api/v1 bypasses Cloudflare; api.sofascore.com does not.
SOFASCORE_BASE = "https://www.sofascore.com/api/v1"
SOFASCORE_EVENTS_BASE = "https://www.sofascore.com/api/v1/event"

def _get(url: str, timeout: int = 15):
    """Unified GET with tls_client or requests fallback."""
    try:
        if _TLS_MODE:
            return _session.get(url, timeout_seconds=timeout)
        return _session.get(url, timeout=timeout, verify=False)
    except Exception as e:
        print(f"[Sofascore] GET failed for {url}: {e}", file=sys.stderr)
        return None

def fetch_live_scores_sofascore() -> list:
    """
    Fetch all currently live/in-play matches from Sofascore.
    Returns list of normalized live match dicts.
    """
    try:
        resp = _get(f"{SOFASCORE_BASE}/sport/football/events/live")
        if resp is None or resp.status_code != 200:
            print(f"[Sofascore] Live scores error: {getattr(resp, 'status_code', 'N/A')}", file=sys.stderr)
            return []
        data = resp.json()
        events = data.get("events", [])
        return [_normalize_sofascore_event(e) for e in events]
    except Exception as e:
        print(f"[Sofascore] Live scores fetch failed: {e}", file=sys.stderr)
        return []

def fetch_fixture(fixture_id: int) -> Optional[dict]:
    """
    Fetch a single fixture's details from Sofascore.
    Returns normalized fixture dict or None.
    """
    try:
        resp = _get(f"{SOFASCORE_EVENTS_BASE}/{fixture_id}")
        if resp is None or resp.status_code != 200:
            return None
        data = resp.json()
        event = data.get("event", {})
        return _normalize_sofascore_event(event)
    except Exception as e:
        print(f"[Sofascore] Fixture fetch failed for {fixture_id}: {e}", file=sys.stderr)
        return None

def fetch_h2h(home_team_id: int, away_team_id: int) -> dict:
    """
    Fetch head-to-head records between two teams from Sofascore.
    Returns dict with wins/draws/goals info.
    """
    try:
        resp = _get(f"{SOFASCORE_BASE}/team/{home_team_id}/h2h/{away_team_id}")
        if resp is None or resp.status_code != 200:
            return {"home_wins": 0, "away_wins": 0, "draws": 0, "matches": []}
        data = resp.json()
        matches = data.get("matches", [])
        hw = aw = dr = 0
        for m in matches:
            home_score = m.get("homeScore", {})
            away_score = m.get("awayScore", {})
            if home_score is None or away_score is None:
                continue
            hg = home_score.get("current", 0) or home_score.get("full", 0) or 0
            ag = away_score.get("current", 0) or away_score.get("full", 0) or 0
            if hg > ag:
                hw += 1
            elif ag > hg:
                aw += 1
            else:
                dr += 1
        return {"home_wins": hw, "away_wins": aw, "draws": dr, "matches": matches}
    except Exception as e:
        print(f"[Sofascore] H2H fetch failed: {e}", file=sys.stderr)
        return {"home_wins": 0, "away_wins": 0, "draws": 0, "matches": []}

def fetch_team_form(team_id: int, limit: int = 10) -> list:
    """
    Fetch last N matches for a team from Sofascore.
    Returns list of match result dicts.
    """
    try:
        resp = _get(f"{SOFASCORE_BASE}/team/{team_id}/events/last/{limit}")
        if resp is None or resp.status_code != 200:
            return []
        data = resp.json()
        events = data.get("events", [])
        results = []
        for e in events:
            home_team = e.get("homeTeam", {})
            away_team = e.get("awayTeam", {})
            home_score = e.get("homeScore", {})
            away_score = e.get("awayScore", {})
            is_home = home_team.get("id") == team_id
            my_score = home_score.get("current", 0) if is_home else away_score.get("current", 0)
            opp_score = away_score.get("current", 0) if is_home else home_score.get("current", 0)
            if my_score is None or opp_score is None:
                continue
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
                "date": e.get("startTimestamp", ""),
                "opponent_name": away_team.get("name", "") if is_home else home_team.get("name", ""),
                "opponent_id": away_team.get("id") if is_home else home_team.get("id"),
            })
        return results
    except Exception as e:
        print(f"[Sofascore] Team form fetch failed for {team_id}: {e}", file=sys.stderr)
        return []

def fetch_historical_xg_sofascore(team_id: int, limit: int = 5) -> float:
    """
    Fetch average xG for a team from recent matches on Sofascore.
    Queries match stats for the last N matches.
    """
    try:
        resp = _get(f"{SOFASCORE_BASE}/team/{team_id}/events/last/{limit}")
        if resp is None or resp.status_code != 200:
            return 0.0
        events = resp.json().get("events", [])

        total_xg = 0.0
        count = 0
        for e in events:
            fix_id = e.get("id")
            if not fix_id:
                continue
            stats = fetch_match_stats(fix_id)
            if not stats:
                continue
            is_home = e.get("homeTeam", {}).get("id") == team_id
            xg_stat = stats.get("Expected goals")
            if not xg_stat:
                continue
            val = xg_stat.get("home") if is_home else xg_stat.get("away")
            try:
                total_xg += float(val)
                count += 1
            except Exception:
                pass
        return total_xg / count if count > 0 else 0.0
    except Exception as e:
        print(f"[Sofascore] Historical xG fetch failed for {team_id}: {e}", file=sys.stderr)
        return 0.0

def fetch_match_stats(fixture_id: int) -> dict:
    """
    Fetch detailed match statistics from Sofascore.
    Returns dict of stat categories with home/away values.
    """
    try:
        resp = _get(f"{SOFASCORE_EVENTS_BASE}/{fixture_id}/statistics")
        if resp is None or resp.status_code != 200:
            return {}
        data = resp.json()
        statistics = data.get("statistics", [])
        result = {}
        for stat in statistics:
            name = stat.get("name", "")
            home_val = stat.get("home", "")
            away_val = stat.get("away", "")
            result[name] = {"home": home_val, "away": away_val}
        return result
    except Exception as e:
        print(f"[Sofascore] Match stats fetch failed for {fixture_id}: {e}", file=sys.stderr)
        return {}

def _normalize_sofascore_event(event: dict) -> dict:
    """Normalize Sofascore event to common format."""
    home_team = event.get("homeTeam", {})
    away_team = event.get("awayTeam", {})
    home_score = event.get("homeScore", {})
    away_score = event.get("awayScore", {})
    status = event.get("status", {})
    tournament = event.get("tournament", {})
    league_name = (
        tournament.get("name", "")
        or event.get("league", {}).get("name", "")
    )
    # Strip group suffix e.g. "FIFA World Cup, Group A" → "World Cup"
    if "World Cup" in league_name or "World Championship" in league_name:
        league_name = "World Cup"
    return {
        "id": str(event.get("id", "")),
        "homeTeam": home_team.get("name", ""),
        "awayTeam": away_team.get("name", ""),
        "homeTeamLogo": home_team.get("logo", ""),
        "awayTeamLogo": away_team.get("logo", ""),
        "homeTeamId": home_team.get("id"),
        "awayTeamId": away_team.get("id"),
        "homeScore": home_score.get("current", 0) or home_score.get("full", 0) or 0,
        "awayScore": away_score.get("current", 0) or away_score.get("full", 0) or 0,
        "league": league_name,
        "leagueId": tournament.get("id", 0) or event.get("league", {}).get("id", 0),
        "stateShort": status.get("description", "") or status.get("shortName", "LIVE"),
        "stateLong": status.get("description", "Live"),
        "minute": event.get("minute", 0) or 0,
        "kickoff_utc": event.get("startTimestamp", 0),
        "events": [],
        "source": "sofascore",
    }

def fetch_todays_fixtures_sofascore(date_str: str = None) -> list:
    """
    Fetch today's fixtures from Sofascore.
    Uses www.sofascore.com/api/v1 (bypasses Cloudflare via tls_client).
    Returns list of normalized fixture dicts.
    """
    if date_str is None:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        resp = _get(f"{SOFASCORE_BASE}/sport/football/scheduled-events/{date_str}")
        if resp is None or resp.status_code != 200:
            print(f"[Sofascore] Today's fixtures error: {getattr(resp, 'status_code', 'N/A')}", file=sys.stderr)
            return []
        data = resp.json()
        events = data.get("events", [])
        print(f"[Sofascore] Fetched {len(events)} events for {date_str} via {'tls_client' if _TLS_MODE else 'requests'}")
        return [_normalize_sofascore_event(e) for e in events]
    except Exception as e:
        print(f"[Sofascore] Today's fixtures fetch failed: {e}", file=sys.stderr)
        return []
