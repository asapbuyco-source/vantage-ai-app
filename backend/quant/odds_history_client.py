import os
import requests
import urllib3
from datetime import datetime

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

RAPIDAPI_KEY = os.environ.get('RAPIDAPI_KEY', '96329fba36msh293dfd95c0b7196p102286jsndc9aa594e4c3')
RAPIDAPI_HOST = 'sportscore1.p.rapidapi.com'

class OddsHistoryClient:
    def __init__(self):
        self.headers = {
            'x-rapidapi-host': RAPIDAPI_HOST,
            'x-rapidapi-key': RAPIDAPI_KEY,
            'Content-Type': 'application/json'
        }
        self.base_url = f"https://{RAPIDAPI_HOST}"

    def search_events(self, date_start: str, date_end: str, sport_id: int = 1):
        """
        Search for events between dates to get odds history.
        """
        url = f"{self.base_url}/events/search?date_start={date_start}&date_end={date_end}&sport_id={sport_id}&page=1"
        try:
            response = requests.post(url, headers=self.headers, verify=False)
            if response.status_code == 200:
                data = response.json()
                return data.get('data', [])
            return []
        except Exception as e:
            print(f"[OddsHistoryClient] Error searching events: {e}")
            return []

    def detect_sharp_money(self, date_start: str, date_end: str):
        """
        Scans events and flags those with significant odds movements.
        """
        events = self.search_events(date_start, date_end)
        sharp_money_flags = []
        
        for event in events:
            # Note: actual sportscore1 odds object structure may vary.
            # This implements the logic assuming 'odds' object exists with 'pre' and 'live' or 'opening' and 'closing'
            odds = event.get('odds', {})
            if odds and isinstance(odds, dict):
                opening = odds.get('opening', odds.get('pre', {}))
                closing = odds.get('closing', odds.get('current', {}))
                
                if opening and closing:
                    open_home = float(opening.get('home_win', 2.0))
                    close_home = float(closing.get('home_win', 2.0))
                    
                    # If odds dropped by more than 15%, that's sharp money
                    if open_home > 0 and (open_home - close_home) / open_home > 0.15:
                        sharp_money_flags.append({
                            'event_id': event.get('id'),
                            'home_team': event.get('home_team', {}).get('name'),
                            'away_team': event.get('away_team', {}).get('name'),
                            'movement': f"Home odds dropped from {open_home} to {close_home}"
                        })
        return sharp_money_flags

if __name__ == '__main__':
    client = OddsHistoryClient()
    today = datetime.utcnow().strftime('%Y-%m-%d')
    print(f"Testing odds history for {today}...")
    results = client.detect_sharp_money(today, today)
    print(f"Found {len(results)} matches with sharp money movement.")
    for r in results:
        print(r)
