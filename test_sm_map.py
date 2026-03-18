"""
Detailed type_id mapping test for Sportmonks statistics
"""
import requests
import json

TOKEN = "m55Ud6uKvc3rpzuU3tOKJi46oIZ5YOTK1T8i0kRrcYoAldJ9vTEEKjTa4FBS"
BASE = "https://api.sportmonks.com/v3/football"

def get(url, params=None):
    p = {"api_token": TOKEN, **(params or {})}
    r = requests.get(url, params=p, timeout=15)
    return r.status_code, r.json()

# Get a completed PL fixture via fixture ID we already know
# Testing Am vs Maz: 19628322 with all known type_ids

# Reference table of known Sportmonks type_ids:
KNOWN_TYPES = {
    34: "Expected Goals (xG)",
    41: "Shots On Target",
    42: "Shots Off Target",
    43: "Shots Total",
    44: "Shots Blocked",
    45: "Ball Possession (%)",
    46: "Passes",
    47: "Fouls",
    49: "Corners",
    50: "Offsides",
    51: "Yellow Cards",
    52: "Red Cards",
    53: "Clearances",
    54: "Crosses",
    55: "Goal Kicks",
    56: "Throw Ins",
    57: "Free Kicks",
    58: "Penalties",
    59: "Substitutions",
    60: "Dangerous Attacks",
    62: "Attacks",
    78: "Tackles",
    79: "Blocks",
    80: "Long Balls",
    81: "Passes",
    82: "Pass Accuracy (%)",
    84: "Big Chances",
    86: "Duels Won",
    87: "Aerials Won",
    98: "Dribbles Attempted",
    99: "Dribbles Won",
    100: "Injuries",
    108: "Counter Attacks",
    109: "Shot Inside Box",
    117: "Shots Outside Box",
    580: "xG On Target",
    581: "xG Off Target",
    1605: "Goal Attempts",
    27264: "Corners",
    27265: "Attacks (alt)",
}

print("=== TYPE_ID REFERENCE ===")
for tid, name in sorted(KNOWN_TYPES.items()):
    print(f"  {tid}: {name}")

print("\n=== LIVE xG CONFIRMATION ===")
# Use the match we already know works
status, data = get(f"{BASE}/fixtures/19628322", {"include": "statistics"})
if status == 200:
    stats = data["data"].get("statistics", [])
    xg_home = next((s["data"]["value"] for s in stats if s.get("type_id") == 34 and s.get("location") == "home"), None)
    xg_away = next((s["data"]["value"] for s in stats if s.get("type_id") == 34 and s.get("location") == "away"), None)
    xg_ot_home = next((s["data"]["value"] for s in stats if s.get("type_id") == 580 and s.get("location") == "home"), None)
    xg_ot_away = next((s["data"]["value"] for s in stats if s.get("type_id") == 580 and s.get("location") == "away"), None)
    shots_on_home = next((s["data"]["value"] for s in stats if s.get("type_id") == 41 and s.get("location") == "home"), None)
    shots_on_away = next((s["data"]["value"] for s in stats if s.get("type_id") == 41 and s.get("location") == "away"), None)
    poss_home = next((s["data"]["value"] for s in stats if s.get("type_id") == 45 and s.get("location") == "home"), None)
    poss_away = next((s["data"]["value"] for s in stats if s.get("type_id") == 45 and s.get("location") == "away"), None)
    corners_home = next((s["data"]["value"] for s in stats if s.get("type_id") == 49 and s.get("location") == "home"), None)
    
    print(f"  Match: América vs Mazatlán")
    print(f"  xG Home (type=34): {xg_home}")
    print(f"  xG Away (type=34): {xg_away}")
    print(f"  xG On Target Home (type=580): {xg_ot_home}")
    print(f"  xG On Target Away (type=580): {xg_ot_away}")
    print(f"  Shots On Target Home (type=41): {shots_on_home}")
    print(f"  Shots On Target Away (type=41): {shots_on_away}")
    print(f"  Possession Home (type=45): {poss_home}%")
    print(f"  Possession Away (type=45): {poss_away}%")
    print(f"  Corners Home (type=49): {corners_home}")
    print(f"\n  RESULT: xG DATA IS {'AVAILABLE ✓' if xg_home is not None else 'NOT AVAILABLE ✗'}")

# Test: can we pull team historical stats (for form calculation)?
print("\n=== TEAM HISTORICAL FIXTURES with statistics ===")
# Use team ID of one of the teams
status, data = get(f"{BASE}/fixtures/date/2026-03-17", {
    "include": "participants", "per_page": 1
})
if status == 200 and data.get("data"):
    parts = data["data"][0].get("participants", [])
    if parts:
        team_id = parts[0]["id"]
        team_name = parts[0].get("name", "?")
        season_id = data["data"][0].get("season_id")
        
        print(f"  Testing team: {team_name} (id={team_id})")
        s, d = get(f"{BASE}/fixtures", {
            "filters": f"teamId:{team_id};seasonId:{season_id}",
            "include": "statistics",
            "per_page": 5
        })
        print(f"  HTTP: {s}")
        if s == 200:
            fx = d.get("data", [])
            print(f"  Got {len(fx)} fixtures")
            if fx:
                print(f"  Keys: {list(fx[0].keys())}")
        else:
            print(f"  ERROR: {d.get('message', '')}")
        
        # Try correct filter syntax
        s2, d2 = get(f"{BASE}/teams/{team_id}/fixtures", {
            "include": "statistics;scores",
            "per_page": 5
        })
        print(f"\n  Team fixtures endpoint HTTP: {s2}")
        if s2 == 200:
            print(f"  Got {len(d2.get('data', []))} fixtures with stats")
        else:
            print(f"  ERROR: {d2.get('message', '')}")
