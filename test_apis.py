import requests, os
import urllib3
urllib3.disable_warnings()
from dotenv import load_dotenv
load_dotenv('backend/quant/.env')
load_dotenv('.env.local')

SM_TOKEN = os.environ.get('SPORTMONKS_API_TOKEN', '')
FD_KEY = os.environ.get('FOOTBALL_DATA_KEY', '')

print('FD_KEY:', bool(FD_KEY))

if FD_KEY:
    res = requests.get('https://api.football-data.org/v4/competitions/WC/matches', params={'dateFrom': '2026-06-16', 'dateTo': '2026-06-16'}, headers={'X-Auth-Token': FD_KEY}, verify=False)
    print('FD WC matches on 2026-06-16:', res.status_code, res.text)
    
    # Just list all WC matches
    res2 = requests.get('https://api.football-data.org/v4/competitions/WC/matches', headers={'X-Auth-Token': FD_KEY}, verify=False)
    if res2.status_code == 200:
        matches = res2.json().get('matches', [])
        print('Total WC matches:', len(matches))
        if matches:
            print('First match:', matches[0]['utcDate'])
            for m in matches:
                if m['utcDate'].startswith('2026-06-16'):
                    print('Match on 16th:', m['homeTeam']['name'], m['awayTeam']['name'], m['status'])
