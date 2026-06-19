"""
league_config.py
────────────────
Approved league tiers and IDs for the quant pipeline.
Only matches from these leagues are analyzed.

Two ID namespaces are tracked:
  - Sportmonks / API-Football IDs (legacy, used by api_football provider)
  - Sport Highlights API IDs     (used by sport_highlights provider)
"""

# ── Tier 1: Top European + Global competitions ─────────────────────────────
TIER_1 = {
    8:    "English Premier League",
    2:    "UEFA Champions League",
    564:  "La Liga",
    82:   "Bundesliga",
    384:  "Serie A",
    5:    "UEFA Europa League",
    294:  "FIFA World Cup",
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
    567:  "Segunda División (Spain)",
    85:   "2. Bundesliga (Germany)",
    395:  "Serie B (Italy)",
    302:  "Ligue 2 (France)",
}

# ── Tier 4: Minor / High Variance (Safety First) ──────────────────────────
TIER_4 = {
    10:   "England League 1",
    12:   "England League 2",
    254:  "Brasileirão Série B",
    14:   "England National League",
    51:   "Liga Portugal 2",
}

# ── All approved leagues (merged) ─────────────────────────────────────────
ALL_APPROVED_LEAGUES: dict[int, dict] = {}
for _league_id, _name in TIER_1.items():
    ALL_APPROVED_LEAGUES[_league_id] = {"name": _name, "tier": 1, "weight": 1.0}
for _league_id, _name in TIER_2.items():
    ALL_APPROVED_LEAGUES[_league_id] = {"name": _name, "tier": 2, "weight": 0.85}
for _league_id, _name in TIER_3.items():
    ALL_APPROVED_LEAGUES[_league_id] = {"name": _name, "tier": 3, "weight": 0.70}
for _league_id, _name in TIER_4.items():
    ALL_APPROVED_LEAGUES[_league_id] = {"name": _name, "tier": 4, "weight": 0.55}

APPROVED_LEAGUE_IDS = set(ALL_APPROVED_LEAGUES.keys())

# ── Name-based matching (case-insensitive substrings) ─────────────────────
# Used when an API returns a league with an unrecognised numeric ID.
_APPROVED_NAMES_TIER: list[tuple[str, int, float]] = [
    # (lowercase substring, tier, weight)
    ("premier league", 1, 1.0),
    ("champions league", 1, 1.0),
    ("world cup", 1, 1.0),
    ("copa del mundo", 1, 1.0),
    ("europa league", 1, 1.0),
    ("conference league", 1, 1.0),
    ("la liga", 1, 1.0),
    ("bundesliga", 1, 1.0),
    ("serie a", 2, 0.90),
    ("ligue 1", 2, 0.85),
    ("eredivisie", 2, 0.85),
    ("primeira liga", 2, 0.85),
    ("championship", 2, 0.85),
    ("scottish premiership", 2, 0.85),
    ("jupiler", 2, 0.85),
    ("mls", 3, 0.70),
    ("brasileirão", 3, 0.70),
    ("brasileiro", 3, 0.70),
    ("primera división", 3, 0.70),
    ("primera division", 3, 0.70),
    ("süper lig", 3, 0.70),
    ("super lig", 3, 0.70),
    ("saudi pro league", 3, 0.70),
    ("eliteserien", 3, 0.70),
    ("allsvenskan", 3, 0.70),
    ("ekstraklasa", 3, 0.70),
    ("caf champions", 3, 0.70),
    ("segunda división", 3, 0.65),
    ("segunda division", 3, 0.65),
    ("2. bundesliga", 3, 0.70),
    ("serie b", 3, 0.70),
    ("ligue 2", 3, 0.70),
    ("league one", 4, 0.55),
    ("league two", 4, 0.55),
    ("usl championship", 3, 0.70),
    ("primera nacional", 3, 0.65),
    ("copa de la liga", 3, 0.65),
    ("copa chile", 3, 0.65),
]


def get_league_info_by_name(league_name: str) -> dict | None:
    """Return league metadata matched by name substring (case-insensitive)."""
    lower = league_name.lower()
    for substr, tier, weight in _APPROVED_NAMES_TIER:
        if substr in lower:
            return {"name": league_name, "tier": tier, "weight": weight}
    return None


# ── Priority scores for fixture sorting (higher = more important) ──────────
TIER_PRIORITY = {1: 150, 2: 100, 3: 60, 4: 30}


def get_league_info(league_id: int) -> dict | None:
    """Return league metadata or None if not approved."""
    return ALL_APPROVED_LEAGUES.get(league_id)


def get_priority_score(league_id: int) -> int:
    info = ALL_APPROVED_LEAGUES.get(league_id)
    if not info:
        return 0
    return TIER_PRIORITY[info["tier"]]
