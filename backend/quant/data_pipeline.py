"""
data_pipeline.py
────────────────
Fetches and normalizes match + team data from the Sportmonks API.
Outputs a list of enriched MatchData objects ready for the model pipeline.
"""

import os
import sys
import math
import requests
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import Optional
from league_config import APPROVED_LEAGUE_IDS, get_league_info, get_priority_score

# ── Config ────────────────────────────────────────────────────────────────────
SM_TOKEN = os.environ.get("SPORTMONKS_API_TOKEN") or os.environ.get("VITE_SPORTMONKS_API_TOKEN", "")
SM_BASE = "https://api.sportmonks.com/v3/football"
MAX_MATCHES = 50
RECENT_DAYS = 90  # Look back 90 days for form data


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
    h2h_home_wins: int = 0
    h2h_away_wins: int = 0
    h2h_draws: int = 0
    h2h_avg_goals: float = 0.0
    h2h_btts_rate: float = 0.0
    odds: OddsData = field(default_factory=OddsData)
    # Derived fields (filled by model pipeline)
    expected_goals_home: float = 0.0
    expected_goals_away: float = 0.0


# ── API Helpers ───────────────────────────────────────────────────────────────
def _get(path: str, params: dict | None = None) -> list | dict | None:
    """Single-page GET to Sportmonks v3 API."""
    if not SM_TOKEN:
        print("[DataPipeline] ERROR: No Sportmonks API token found.", file=sys.stderr)
        return None
    base_params = {"api_token": SM_TOKEN}
    if params:
        base_params.update(params)
    try:
        resp = requests.get(f"{SM_BASE}{path}", params=base_params, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[DataPipeline] API error on {path}: {e}", file=sys.stderr)
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

    for fx in recent_fixtures[:10]:
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

    return stats


# ── H2H parser ────────────────────────────────────────────────────────────────
def _parse_h2h(h2h_fixtures: list, home_id: int, away_id: int) -> tuple:
    """Returns (h2h_home_wins, h2h_away_wins, h2h_draws, avg_goals, btts_rate)."""
    hw = aw = dr = total_goals = btts = count = 0
    for fx in (h2h_fixtures or [])[:8]:
        scores = fx.get("scores", [])
        hg = next((s["score"]["goals"] for s in scores
                   if s.get("participant_id") == home_id and s.get("description") == "CURRENT"), None)
        ag = next((s["score"]["goals"] for s in scores
                   if s.get("participant_id") == away_id and s.get("description") == "CURRENT"), None)
        if hg is None or ag is None:
            continue
        total_goals += hg + ag; count += 1
        if hg > ag: hw += 1
        elif ag > hg: aw += 1
        else: dr += 1
        if hg > 0 and ag > 0:
            btts += 1
    avg = total_goals / count if count else _league_avg(8)
    btts_rate = btts / count if count else 0.45
    return hw, aw, dr, avg, btts_rate


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
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    print(f"[DataPipeline] Fetching fixtures for {date_str}...")
    raw = _get_paginated(
        f"/fixtures/date/{date_str}",
        params={"include": "league;participants;scores;odds;statistics", "per_page": 100},
        max_pages=3,
    )
    if not raw:
        print("[DataPipeline] No fixtures returned.", file=sys.stderr)
        return []

    print(f"[DataPipeline] Raw fixtures: {len(raw)}")

    # ── Filter approved leagues ────────────────────────────────────────────
    approved = []
    for item in raw:
        lid = item.get("league_id")
        if lid not in APPROVED_LEAGUE_IDS:
            continue
        participants = item.get("participants", [])
        home_p = next((p for p in participants if p.get("meta", {}).get("location") == "home"), None)
        away_p = next((p for p in participants if p.get("meta", {}).get("location") == "away"), None)
        if not home_p or not away_p:
            continue
        # Skip already-started matches
        starting_at = item.get("starting_at", "")
        if starting_at:
            try:
                kick = datetime.fromisoformat(starting_at.replace("Z", "+00:00"))
                if kick <= datetime.now(timezone.utc):
                    continue
            except Exception:
                pass

        info = get_league_info(lid)
        approved.append({
            "raw": item,
            "league_id": lid,
            "league_name": info["name"],
            "league_tier": info["tier"],
            "priority": get_priority_score(lid),
            "home_p": home_p,
            "away_p": away_p,
        })

    # Sort by priority, cap at MAX_MATCHES
    approved.sort(key=lambda x: x["priority"], reverse=True)
    approved = approved[:MAX_MATCHES]
    print(f"[DataPipeline] Approved + sorted fixtures: {len(approved)}")

    # ── Enrich each fixture with team stats + H2H ──────────────────────────
    from_date = (datetime.now(timezone.utc) - timedelta(days=RECENT_DAYS)).strftime("%Y-%m-%d")
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

        # ── Extract xG from Sportmonks statistics (Upgrade #1) ─────────
        xg_home, xg_away = None, None
        raw_stats = item.get("statistics") or []
        stats_list = raw_stats if isinstance(raw_stats, list) else (raw_stats.get("data", []) if isinstance(raw_stats, dict) else [])
        for stat in stats_list:
            # type_id 34 = Expected Goals (xG) on Sportmonks V3
            if stat.get("type_id") == 34:
                loc = stat.get("location", "")
                val = stat.get("data", {}).get("value") if isinstance(stat.get("data"), dict) else stat.get("value")
                try:
                    val = float(val)
                    if loc == "home": xg_home = val
                    elif loc == "away": xg_away = val
                except (TypeError, ValueError):
                    pass

        # Fetch team form (recent matches)
        try:
            home_recent = _get_paginated(
                f"/fixtures/between/{from_date}/{date_str}",
                {"include": "participants;scores", "filters": f"participantSearch:{home_id}", "per_page": 10},
                max_pages=1,
            )
            away_recent = _get_paginated(
                f"/fixtures/between/{from_date}/{date_str}",
                {"include": "participants;scores", "filters": f"participantSearch:{away_id}", "per_page": 10},
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

        # Fetch H2H (Endpoint not available on Pro plan)
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
            home_att = (md.home_stats.home_avg_scored if md.home_stats else 1.2) / (league_avg / 2)
            away_def = (md.away_stats.away_avg_conceded if md.away_stats else 1.2) / (league_avg / 2)
            away_att = (md.away_stats.away_avg_scored if md.away_stats else 1.0) / (league_avg / 2)
            home_def = (md.home_stats.home_avg_conceded if md.home_stats else 1.0) / (league_avg / 2)
            home_adv = 1.12
            md.expected_goals_home = max(0.2, home_att * away_def * (league_avg / 2) * home_adv)
            md.expected_goals_away = max(0.2, away_att * home_def * (league_avg / 2))
            xg_source = "model"

        matches.append(md)
        print(f"[DataPipeline]   ✓ {md.home_team} vs {md.away_team} (xG: {md.expected_goals_home:.2f}–{md.expected_goals_away:.2f} [{xg_source}])")

    print(f"[DataPipeline] Pipeline complete: {len(matches)} enriched matches.")
    return matches


if __name__ == "__main__":
    import json
    date = sys.argv[1] if len(sys.argv) > 1 else None
    result = fetch_matches(date)
    print(json.dumps([{"fixture_id": m.fixture_id, "home": m.home_team, "away": m.away_team,
                       "xG": [m.expected_goals_home, m.expected_goals_away]} for m in result], indent=2))
