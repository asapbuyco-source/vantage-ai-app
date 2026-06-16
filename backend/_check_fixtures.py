import sys
sys.path.insert(0, 'quant')
from free_data_client import fetch_fixtures_free

# Check what dates have fixtures
for date_str in ['2026-06-14', '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18']:
    try:
        fixtures = fetch_fixtures_free(date_str)
        print(f"{date_str}: {len(fixtures)} fixtures")
        for f in fixtures[:3]:
            print(f"  - {f.get('home_team', '?')} vs {f.get('away_team', '?')} | league={f.get('league', '?')}")
        if len(fixtures) > 3:
            print(f"  ... and {len(fixtures)-3} more")
    except Exception as e:
        print(f"{date_str}: ERROR - {e}")
