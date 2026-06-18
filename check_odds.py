from dotenv import load_dotenv
load_dotenv('.env.local')
import os, requests

key = os.environ.get('ODDS_API_KEY')
resp = requests.get(
    'https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds',
    params={'apiKey': key, 'regions': 'eu'},
    verify=False
)
games = resp.json()
today = '2026-06-18'
print('Today WC games in Odds API:')
for g in games:
    day = g.get('commence_time', '')[:10]
    if day == today:
        print(f"  [{day}] {g['home_team']} vs {g['away_team']}")
