import requests, os
import urllib3
urllib3.disable_warnings()
from dotenv import load_dotenv
load_dotenv('backend/quant/.env')
load_dotenv('.env.local')

FD_KEY = os.environ.get('FOOTBALL_DATA_KEY', '')

if FD_KEY:
    res = requests.get('https://api.football-data.org/v4/competitions/WC/matches', params={'dateFrom': '2026-06-16', 'dateTo': '2026-06-16', 'status': 'SCHEDULED,TIMED'}, headers={'X-Auth-Token': FD_KEY}, verify=False)
    print('FD WC matches on 2026-06-16 with status TIMED,SCHEDULED:', res.status_code, res.text)
