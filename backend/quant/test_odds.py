import os
import requests
from dotenv import load_dotenv
import json

# Load the env file
load_dotenv()

API_KEY = os.getenv('ODDS_API_KEY')

if not API_KEY:
    print("ERROR: ODDS_API_KEY not found in .env")
    exit(1)

SPORT = 'basketball_nba' # or basketball_euroleague
REGIONS = 'us,eu' # uk, us, eu, au
MARKETS = 'h2h,spreads' # h2h = moneyline/match winner, spreads = handicap

print(f"Testing The Odds API with Key: {API_KEY[:6]}...{API_KEY[-4:]}")
print(f"Fetching active basketball games for: {SPORT}")

url = f'https://api.the-odds-api.com/v4/sports/{SPORT}/odds'
params = {
    'apiKey': API_KEY,
    'regions': REGIONS,
    'markets': MARKETS,
    'oddsFormat': 'decimal',
    'dateFormat': 'iso'
}

response = requests.get(url, params=params)

if response.status_code != 200:
    print(f"Failed to get odds: status_code {response.status_code}, response body {response.text}")
    exit(1)

odds_json = response.json()
print(f"Success! Retrieved {len(odds_json)} upcoming NBA matches.\n")

if len(odds_json) > 0:
    print("--- SAMPLE MATCH ---")
    game = odds_json[0]
    print(f"Match: {game['home_team']} vs {game['away_team']}")
    print(f"Commence Time: {game['commence_time']}")
    
    if len(game['bookmakers']) > 0:
        bookie = game['bookmakers'][0]
        print(f"\nSample Odds from {bookie['title']}:")
        for market in bookie['markets']:
            print(f"Market: {market['key']}")
            for outcome in market['outcomes']:
                price = f"@{outcome['price']}"
                point = f"(Spread: {outcome.get('point')})" if 'point' in outcome else ""
                print(f"  - {outcome['name']} {price} {point}")
else:
    print("No upcoming NBA matches found right now.")
