import sys
sys.path.insert(0, "./backend/quant")
from data_pipeline import fetch_matches

def check():
    print("Testing fetch_matches() integration with real xG...")
    # Fetch from yesterday to guarantee settled xG
    from datetime import datetime, timedelta, timezone
    yesterday_str = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
    matches = fetch_matches(yesterday_str)
    
    print(f"\nFetched {len(matches)} matches.")
    xg_found = 0
    for m in matches[:10]:
        print(f"  {m.home_team} vs {m.away_team} (id={m.fixture_id})")
        print(f"    xG Home: {m.expected_goals_home} | xG Away: {m.expected_goals_away}")
        if m.expected_goals_home > 0 or m.expected_goals_away > 0:
            xg_found += 1
            
    print(f"\nMatches with xG out of top 10 checked: {xg_found}")

if __name__ == "__main__":
    check()
