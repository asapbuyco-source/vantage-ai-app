"""
transfermarkt_client.py
───────────────────────
Skeleton client for future deployment of TransferMarkt Docker image.
Intended to fetch real injury/suspension data.

Note: This is a placeholder. Full implementation requires running the
TransferMarkt scraper as a Docker container with a REST API interface.

Lower priority - not actively used.
"""

import os
import sys
from typing import Optional

def fetch_injuries(team_id: int) -> list:
    """
    Fetch current injuries for a team from TransferMarkt.
    Returns list of player injury dicts.
    Placeholder - requires TransferMarkt Docker image deployment.
    """
    print("[TransferMarkt] Not implemented - requires Docker deployment", file=sys.stderr)
    return []

def fetch_suspensions(team_id: int) -> list:
    """
    Fetch current suspensions for a team from TransferMarkt.
    Returns list of suspended player dicts.
    Placeholder - requires TransferMarkt Docker image deployment.
    """
    print("[TransferMarkt] Not implemented - requires Docker deployment", file=sys.stderr)
    return []

def fetch_squad_status(team_id: int) -> dict:
    """
    Fetch squad availability status (injuries + suspensions + misc) for a team.
    Returns dict with available_count, unavailable_count, and player list.
    Placeholder - requires TransferMarkt Docker image deployment.
    """
    print("[TransferMarkt] Not implemented - requires Docker deployment", file=sys.stderr)
    return {"available_count": 0, "unavailable_count": 0, "players": []}
