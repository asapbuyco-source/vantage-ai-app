import os
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

RAPIDAPI_KEY = os.environ.get('RAPIDAPI_KEY', '96329fba36msh293dfd95c0b7196p102286jsndc9aa594e4c3')
RAPIDAPI_HOST = 'free-api-live-football-data.p.rapidapi.com'

class PlayerStatsClient:
    def __init__(self):
        self.headers = {
            'x-rapidapi-host': RAPIDAPI_HOST,
            'x-rapidapi-key': RAPIDAPI_KEY
        }
        self.base_url = f"https://{RAPIDAPI_HOST}"

    def search_player(self, name: str):
        """
        Search for a player by name to get their ID and basic info.
        """
        url = f"{self.base_url}/football-players-search?search={name}"
        try:
            response = requests.get(url, headers=self.headers, verify=False)
            if response.status_code == 200:
                data = response.json()
                if 'response' in data and 'suggestions' in data['response']:
                    return data['response']['suggestions']
                elif 'suggestions' in data:
                    return data['suggestions']
            return []
        except Exception as e:
            print(f"[PlayerStatsClient] Error searching for player {name}: {e}")
            return []

if __name__ == '__main__':
    client = PlayerStatsClient()
    print("Testing player search for 'messi'...")
    results = client.search_player('messi')
    for r in results[:3]:
        print(f"ID: {r.get('id')}, Name: {r.get('name')}, Team: {r.get('teamName')}")
