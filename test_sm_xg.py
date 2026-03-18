"""
Targeted xG + Statistics Deep Dive using Sportmonks Pro Plan
"""
import requests
import json

TOKEN = "m55Ud6uKvc3rpzuU3tOKJi46oIZ5YOTK1T8i0kRrcYoAldJ9vTEEKjTa4FBS"
BASE = "https://api.sportmonks.com/v3/football"

def get(url, params=None):
    p = {"api_token": TOKEN, **(params or {})}
    r = requests.get(url, params=p, timeout=15)
    return r.status_code, r.json()

def pp(data):
    print(json.dumps(data, default=str, indent=2)[:2000])

# ────────────────────────────────────────────────────────────────────────────────
# STEP 1: Find a premier league fixture from 2026-03-16 (good date for data)
# ────────────────────────────────────────────────────────────────────────────────
print("\n=== STEP 1: Find Premier League fixtures ===")
status, data = get(f"{BASE}/fixtures/date/2026-03-16", {
    "include": "participants;league",
    "per_page": 100
})
print(f"HTTP: {status}, Total: {data.get('pagination', {}).get('total', '?')}")
fixtures = data.get("data", [])

prem_fids = []
for f in fixtures:
    name = f.get("name", "")
    # Premier League ID is 8
    if f.get("league_id") == 8:
        prem_fids.append(f["id"])
        print(f"  PL Match: {name} (id={f['id']})")

# Also collect all fixture IDs (for stats testing even if no PL)
all_fids = [f["id"] for f in fixtures[:5]]
print(f"\nAll fixture IDs sample: {all_fids}")
print(f"Premier League matches found: {len(prem_fids)}")

# ────────────────────────────────────────────────────────────────────────────────
# STEP 2: Pull full statistics for a few fixtures
# ────────────────────────────────────────────────────────────────────────────────
test_ids = prem_fids[:2] if prem_fids else all_fids[:2]

for fid in test_ids:
    print(f"\n=== STEP 2: Statistics for fixture {fid} ===")
    status, data = get(f"{BASE}/fixtures/{fid}", {
        "include": "statistics;participants;scores"
    })
    print(f"HTTP: {status}")
    if status == 200:
        d = data.get("data", {})
        name = d.get("name", "Unknown")
        print(f"Match: {name}")
        stats = d.get("statistics", [])
        print(f"Statistics array length: {len(stats)}")
        if stats:
            print("Stat types found:")
            for s in stats:
                tid = s.get("type_id")
                val = s.get("data", {}).get("value")
                loc = s.get("location")
                print(f"  type_id={tid} | location={loc} | value={val}")
    else:
        print(f"ERROR: {data.get('message')}")

# ────────────────────────────────────────────────────────────────────────────────
# STEP 3: Subscription — check what includes/resources are listed
# ────────────────────────────────────────────────────────────────────────────────
print("\n=== STEP 3: Full Subscription Data ===")
status, data = get("https://api.sportmonks.com/v3/my/subscription")
print(f"HTTP: {status}")
if status == 200:
    d = data.get("data", {})
    plan = d.get("plan", {})
    print(f"Plan: {plan.get('name')}")
    
    addons = d.get("add_ons", [])
    print(f"\nAdd-ons ({len(addons)}):")
    for a in addons:
        ao = a.get("add_on", {})
        print(f"  - {ao.get('name')} | id={ao.get('id')}")
    
    includes = []
    for resource in plan.get("resources", []):
        includes.append(resource.get("name"))
    print(f"\nPlan resources: {includes}")

# ────────────────────────────────────────────────────────────────────────────────
# STEP 4: Check types API for statistics type names
# ────────────────────────────────────────────────────────────────────────────────
print("\n=== STEP 4: Stat Types (type_ids) ===")
status, data = get("https://api.sportmonks.com/v3/types", {"per_page": 100})
print(f"HTTP: {status}")
if status == 200:
    types = data.get("data", [])
    # Filter for football/stat-related types
    for t in types:
        name = t.get("name", "").lower()
        dev = t.get("developer_name", "").lower()
        if any(k in name or k in dev for k in ["xg", "expect", "shot", "possession", "attack", "corners", "goal"]):
            print(f"  id={t['id']} | {t.get('name')} | dev={t.get('developer_name')}")

# ────────────────────────────────────────────────────────────────────────────────
# STEP 5: Expected Lineups endpoint test
# ────────────────────────────────────────────────────────────────────────────────
if test_ids:
    print(f"\n=== STEP 5: Expected Lineups for {test_ids[0]} ===")
    status, data = get(f"{BASE}/fixtures/{test_ids[0]}", {
        "include": "lineups.players;squad"
    })
    print(f"HTTP: {status}")
    if status == 200:
        d = data.get("data", {})
        lineups = d.get("lineups", [])
        print(f"Lineups entries: {len(lineups)}")
        if lineups:
            pp(lineups[0])

# ────────────────────────────────────────────────────────────────────────────────
# STEP 6: Season team statistics (xG per season aggregated)
# ────────────────────────────────────────────────────────────────────────────────
print("\n=== STEP 6: Season stats for a big fixture ===")
if test_ids:
    status, data = get(f"{BASE}/fixtures/{test_ids[0]}", {
        "include": "participants"
    })
    if status == 200 and data.get("data"):
        parts = data["data"].get("participants", [])
        season_id = data["data"].get("season_id")
        if parts:
            tid = parts[0]["id"]
            print(f"Testing team {tid} season {season_id}")
            s, d = get(f"{BASE}/teams/{tid}/statistics/seasons/{season_id}")
            print(f"Team season stats HTTP: {s}")
            if s == 200:
                pp(d.get("data", {}))
            else:
                print(f"  ERROR: {d.get('message')}")

print("\n=== ALL TESTS DONE ===")
