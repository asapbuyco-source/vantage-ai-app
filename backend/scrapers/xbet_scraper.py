import requests
import json
import time

class XbetScraper:
    def __init__(self):
        # 1XBet's undocumented JSON API endpoint for upcoming matches
        # This endpoint is used by their mobile app and bypasses Cloudflare html blocks
        self.url = "https://1xbet.mobi/LineFeed/Get1x2_VZip"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Origin": "https://1xbet.mobi"
        }

    def fetch_odds(self, sport_id=1):
        """
        Fetch odds for a specific sport. Sport ID 1 = Football.
        """
        params = {
            "sports": sport_id,
            "count": 50, # Get top 50 matches
            "tf": 1000000,
            "tz": 3,
            "mode": 4,
            "getEmpty": True
        }
        
        matches = []
        try:
            # We use a timeout to prevent hanging the engine
            response = requests.get(self.url, params=params, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if "Value" in data and data["Value"]:
                    for item in data["Value"]:
                        # Extracting team names and odds
                        # 1 = Home Win, 2 = Away Win, 3 = Draw (Keys depend on 1xBet schema)
                        home_team = item.get("O1E", "Unknown")
                        away_team = item.get("O2E", "Unknown")
                        
                        # E is the array of odds. 1=1, 2=X, 3=2
                        odds_data = item.get("E", [])
                        home_odds = next((o.get("C") for o in odds_data if o.get("T") == 1), None)
                        draw_odds = next((o.get("C") for o in odds_data if o.get("T") == 2), None)
                        away_odds = next((o.get("C") for o in odds_data if o.get("T") == 3), None)

                        if home_odds and draw_odds and away_odds:
                            matches.append({
                                "bookmaker": "1XBet",
                                "home_team": home_team,
                                "away_team": away_team,
                                "odds_1": home_odds,
                                "odds_x": draw_odds,
                                "odds_2": away_odds,
                                "match_time": item.get("S", 0) # Timestamp
                            })
        except Exception as e:
            print(f"[XBet Scraper] Error fetching odds: {str(e)}")
            
        return matches

if __name__ == "__main__":
    scraper = XbetScraper()
    print("Fetching 1XBet Odds...")
    results = scraper.fetch_odds()
    print(f"Found {len(results)} matches with odds.")
    for r in results[:3]:
        print(r)
