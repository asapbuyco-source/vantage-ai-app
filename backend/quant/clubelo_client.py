"""
clubelo_client.py
─────────────────
Client for fetching professionally maintained club Elo ratings from ClubElo.net.
Used to seed the _elo_cache in data_pipeline.py, overriding the manual club Elo system.
"""

import os
import sys
import requests
from datetime import datetime, timezone
from typing import Optional

CLUBELO_BASE = "http://api.clubelo.com"

_elo_cache: dict[str, float] = {}
_elo_cache_loaded: bool = False

def fetch_all_elos_by_date(date_str: str = None) -> dict[str, float]:
    """
    Fetch all club Elo ratings as of a given date from ClubElo.net.
    Returns dict mapping team names to Elo ratings.
    Cache results in memory for the session.
    """
    global _elo_cache, _elo_cache_loaded
    if _elo_cache_loaded and _elo_cache:
        return _elo_cache
    if date_str is None:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        resp = requests.get(
            f"{CLUBELO_BASE}/{date_str}",
            timeout=30,
            verify=True,
        )
        if resp.status_code != 200:
            print(f"[ClubElo] Fetch error: {resp.status_code}", file=sys.stderr)
            return _elo_cache
        lines = resp.text.strip().split("\n")
        for line in lines[1:]:
            parts = line.split(",")
            if len(parts) >= 3:
                team_name = parts[0].strip()
                try:
                    elo = float(parts[2].strip())
                    _elo_cache[team_name] = elo
                except ValueError:
                    continue
        _elo_cache_loaded = True
        print(f"[ClubElo] Loaded {len(_elo_cache)} club Elo ratings", file=sys.stderr)
    except Exception as e:
        print(f"[ClubElo] Fetch failed: {e}", file=sys.stderr)
    return _elo_cache

def get_club_elo(team_name: str, date_str: str = None) -> Optional[float]:
    """
    Get Elo rating for a specific team by name.
    Falls back to fetching all Elos if cache is empty.
    """
    if not _elo_cache_loaded:
        fetch_all_elos_by_date(date_str)
    return _elo_cache.get(team_name)

def get_club_elo_fuzzy(team_name: str, date_str: str = None) -> Optional[float]:
    """
    Get Elo rating for a team using fuzzy matching on team name.
    Tries exact match first, then case-insensitive, then substring.
    """
    if not _elo_cache_loaded:
        fetch_all_elos_by_date(date_str)
    if not team_name or not _elo_cache:
        return None
    team_lower = team_name.lower().strip()
    if team_lower in _elo_cache:
        return _elo_cache[team_lower]
    for name, elo in _elo_cache.items():
        if name.lower() == team_lower:
            return elo
    for name, elo in _elo_cache.items():
        if team_lower in name.lower() or name.lower() in team_lower:
            return elo
    return None

def seed_elo_cache() -> dict[str, float]:
    """
    Seed the global Elo cache from ClubElo for use in data_pipeline.py.
    Call this at startup to override manual club Elo system.
    """
    return fetch_all_elos_by_date()
