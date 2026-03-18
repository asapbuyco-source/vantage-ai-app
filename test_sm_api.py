"""
Sportmonks API Comprehensive Capability Test
Tests what data is available on the user's Pro plan
"""
import requests
import json
import sys

TOKEN = "m55Ud6uKvc3rpzuU3tOKJi46oIZ5YOTK1T8i0kRrcYoAldJ9vTEEKjTa4FBS"
BASE = "https://api.sportmonks.com/v3/football"

def get(url, params=None):
    p = {"api_token": TOKEN, **(params or {})}
    r = requests.get(url, params=p, timeout=15)
    return r.status_code, r.json()

def test(label, url, params=None):
    print(f"\n{'='*60}")
    print(f"TEST: {label}")
    print(f"URL: {url}")
    status, data = get(url, params)
    print(f"HTTP Status: {status}")
    if status == 200:
        if "data" in data:
            d = data["data"]
            if isinstance(d, list):
                print(f"  Records returned: {len(d)}")
                if d:
                    print(f"  First record keys: {list(d[0].keys()) if isinstance(d[0], dict) else 'scalar'}")
                    print(f"  Sample: {json.dumps(d[0], default=str)[:400]}")
            else:
                print(f"  Data: {json.dumps(d, default=str)[:400]}")
        else:
            print(f"  Response: {json.dumps(data, default=str)[:400]}")
    else:
        msg = data.get("message", "")
        print(f"  ERROR: {msg}")
    return status, data

# ─── 1. SUBSCRIPTION ─────────────────────────────────────────────────────────
print("\n" + "="*60)
print("SUBSCRIPTION DETAILS")
status, data = get("https://api.sportmonks.com/v3/my/subscription")
print(f"HTTP: {status}")
if status == 200:
    subs = data.get("data", {}).get("plan", {})
    print(f"  Plan: {subs.get('name', 'unknown')}")
    addons = data.get("data", {}).get("add_ons", [])
    print(f"  Add-ons ({len(addons)}): {[a.get('add_on', {}).get('name', '') for a in addons]}")
    sports = data.get("data", {}).get("sports", [])
    print(f"  Sports: {[s.get('name', '') for s in sports]}")
    includes = data.get("data", {}).get("plan", {}).get("includes", [])
    print(f"  Includes: {includes}")
    caps = data.get("data", {}).get("plan", {}).get("resources", [])
    print(f"  Resources: {[r.get('name') for r in caps]}")

# ─── 2. FIXTURES WITH ALL INCLUDES ───────────────────────────────────────────
# Pick a recent date with matches
test_date = "2026-03-17"  # yesterday

# 2a. Base fixture without includes
test("FIXTURE - base only", f"{BASE}/fixtures/date/{test_date}", {"per_page": 3})

# 2b. With statistics
s, d = test("FIXTURE - with statistics", f"{BASE}/fixtures/date/{test_date}", 
           {"include": "statistics", "per_page": 3})

# 2c. With participants (team names)
test("FIXTURE - with participants", f"{BASE}/fixtures/date/{test_date}",
     {"include": "participants", "per_page": 3})

# 2d. With scores
test("FIXTURE - with scores", f"{BASE}/fixtures/date/{test_date}",
     {"include": "scores", "per_page": 3})

# 2e. With odds
test("FIXTURE - with odds", f"{BASE}/fixtures/date/{test_date}",
     {"include": "odds", "per_page": 1})

# 2f. With expected lineups
test("FIXTURE - with lineups", f"{BASE}/fixtures/date/{test_date}",
     {"include": "lineups", "per_page": 3})

# 2g. With events (goals, cards etc)
test("FIXTURE - with events", f"{BASE}/fixtures/date/{test_date}",
     {"include": "events", "per_page": 3})

# ─── 3. STATISTICS ENDPOINT ───────────────────────────────────────────────────
# First get a real fixture ID from yesterday
print(f"\n{'='*60}")
print("Getting real fixture IDs...")
s, d = get(f"{BASE}/fixtures/date/{test_date}", {"per_page": 2})
fixture_ids = []
if s == 200 and d.get("data"):
    for fx in d["data"][:2]:
        fixture_ids.append(fx.get("id", ""))
    print(f"  Fixture IDs: {fixture_ids}")

# 3a. xG / expected goals via statistics
if fixture_ids:
    fid = fixture_ids[0]
    test(f"STATISTICS for fixture {fid}", f"{BASE}/fixtures/{fid}",
         {"include": "statistics"})
    
    # 3b. Specific stat types
    test(f"FIXTURE complete data {fid}", f"{BASE}/fixtures/{fid}",
         {"include": "statistics;participants;scores;events;odds"})

# ─── 4. TEAMS STATS / HISTORY ─────────────────────────────────────────────────
# Get a team from the fixture
if fixture_ids:
    s, d = get(f"{BASE}/fixtures/{fixture_ids[0]}", {"include": "participants"})
    team_id = None
    if s == 200 and d.get("data"):
        parts = d["data"].get("participants", [])
        if parts:
            team_id = parts[0].get("id")
            print(f"\nTeam ID: {team_id}")
    
    if team_id:
        test(f"TEAM fixtures (recent)", f"{BASE}/fixtures",
             {"filters": f"teamId:{team_id}", "per_page": 5, 
              "include": "statistics;scores"})
        
        # Team statistics
        test(f"TEAM season stats", f"{BASE}/teams/{team_id}",
             {"include": "statistics"})

# ─── 5. LIVESCORES (real-time xG) ─────────────────────────────────────────────
test("LIVESCORES", f"{BASE}/livescores", {"include": "statistics"})

# ─── 6. ODDS MARKETS ─────────────────────────────────────────────────────────
test("ODDS MARKETS list", f"{BASE}/odds/markets", {"per_page": 30})

# ─── 7. STATISTICS TYPES ─────────────────────────────────────────────────────
test("STATISTICS TYPES", f"{BASE}/statistics/types", {})

# ─── 8. H2H ──────────────────────────────────────────────────────────────────
if len(fixture_ids) >= 1:
    s2, d2 = get(f"{BASE}/fixtures/{fixture_ids[0]}", {"include": "participants"})
    if s2 == 200 and d2.get("data"):
        parts = d2["data"].get("participants", [])
        if len(parts) >= 2:
            tid1 = parts[0].get("id")
            tid2 = parts[1].get("id")
            test(f"H2H {tid1} vs {tid2}", f"{BASE}/fixtures/head-to-head/{tid1}/{tid2}",
                 {"per_page": 5})

print("\n\nTEST COMPLETE")
