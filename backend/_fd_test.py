import os, requests

token = os.environ.get('FD_ORG_TOKEN', os.environ.get('FOOTBALL_DATA_TOKEN', ''))
print('FD.org token present:', bool(token))

if not token:
    print('No FD.org token - cannot test')
    exit(0)

# Test Europa League (EL)
resp = requests.get(
    'https://api.football-data.org/v4/competitions/EL/matches',
    headers={'X-Auth-Token': token},
    timeout=10
)
print('EL status:', resp.status_code)

# Test World Cup
resp2 = requests.get(
    'https://api.football-data.org/v4/competitions/WC/matches',
    headers={'X-Auth-Token': token},
    timeout=10
)
print('WC status:', resp2.status_code)
if resp2.ok:
    data = resp2.json()
    matches = data.get('matches', [])
    print('WC fixtures count:', len(matches))
    for m in matches[:5]:
        print(f"  {m.get('utcDate', '')[:10]} {m['homeTeam']['name']} vs {m['awayTeam']['name']}")

# Check what the free_data_client actually uses for WC
print()
print('--- Checking free_data_client WC handling ---')
from free_data_client import fetch_fixtures_for_date
for date in ['2026-06-14', '2026-06-15', '2026-06-16', '2026-06-17']:
    fixtures = fetch_fixtures_for_date(date)
    print(f'{date}: {len(fixtures)} fixtures')
