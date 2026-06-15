"""
team_id_map.py
───────────────
Cross-source team ID translation.
Maps football-data.org team IDs → API-Football team IDs.
Used when switching from Sportmonks to the free data stack.
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
    77:  530,   # Atletico Madrid
    # Serie A
    98:  489,   # AC Milan
    108: 505,   # Inter Milan
    109: 496,   # Juventus
    # Ligue 1
    524: 85,    # PSG
    523: 80,    # Lyon
    516: 81,    # Marseille
    # UEFA
    2:   2,      # Champions League
    5:   3,      # Europa League
    # Others
    72:  190,    # Eredivisie (Ajax etc — add as discovered)
    9:   40,     # Championship (verify per team)
}

TEAM_CACHE_FILE = ".vantage_cache/team_id_map.json"

def load_team_map():
    """Load team ID map from disk cache (merged with known map)."""
    try:
        if os.path.exists(TEAM_CACHE_FILE):
            with open(TEAM_CACHE_FILE, "r") as f:
                loaded = json.load(f)
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