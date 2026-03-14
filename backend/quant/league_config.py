"""
league_config.py
────────────────
Approved league tiers and IDs for the quant pipeline.
Only matches from these leagues are analyzed.
"""

# ── Tier 1: Top European + Global competitions ─────────────────────────────
TIER_1 = {
    8:    "English Premier League",
    2:    "UEFA Champions League",
    564:  "La Liga",
    82:   "Bundesliga",
    384:  "Serie A",
    5:    "UEFA Europa League",
}

# ── Tier 2: Strong mid-tier European ──────────────────────────────────────
TIER_2 = {
    301:  "Ligue 1",
    462:  "Primeira Liga",
    7:    "UEFA Conference League",
    72:   "Eredivisie",
    9:    "Championship",
    1204: "Scottish Premiership",
    138:  "Jupiler Pro League",
}

# ── Tier 3: Reliable data, good volume ────────────────────────────────────
TIER_3 = {
    600:  "MLS",
    253:  "Brasileirão Série A",
    325:  "Argentine Primera División",
    176:  "Turkish Süper Lig",
    570:  "Saudi Pro League",
    392:  "Eliteserien (Norway)",
    572:  "Allsvenskan (Sweden)",
    288:  "Ekstraklasa (Poland)",
    1186: "CAF Champions League",
    1187: "CAF Confederation Cup",
}

# ── All approved leagues (merged) ─────────────────────────────────────────
ALL_APPROVED_LEAGUES: dict[int, dict] = {}
for _league_id, _name in TIER_1.items():
    ALL_APPROVED_LEAGUES[_league_id] = {"name": _name, "tier": 1, "weight": 1.0}
for _league_id, _name in TIER_2.items():
    ALL_APPROVED_LEAGUES[_league_id] = {"name": _name, "tier": 2, "weight": 0.85}
for _league_id, _name in TIER_3.items():
    ALL_APPROVED_LEAGUES[_league_id] = {"name": _name, "tier": 3, "weight": 0.70}

APPROVED_LEAGUE_IDS = set(ALL_APPROVED_LEAGUES.keys())

# ── Priority scores for fixture sorting (higher = more important) ──────────
TIER_PRIORITY = {1: 150, 2: 100, 3: 60}


def get_league_info(league_id: int) -> dict | None:
    """Return league metadata or None if not approved."""
    return ALL_APPROVED_LEAGUES.get(league_id)


def get_priority_score(league_id: int) -> int:
    info = ALL_APPROVED_LEAGUES.get(league_id)
    if not info:
        return 0
    return TIER_PRIORITY[info["tier"]]
