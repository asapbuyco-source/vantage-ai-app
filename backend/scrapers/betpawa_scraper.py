import requests
import json
import time

class BetPawaScraper:
    def __init__(self, country_code="cm"): # Default to Cameroon (cm), can be ng, ke, etc.
        # Betpawa uses a generic JSON API for their frontend
        self.url = f"https://www.betpawa.{country_code}/api/events/top"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json"
        }

    def fetch_odds(self):
        """
        Fetch top upcoming matches and their 1X2 odds.
        """
        matches = []
        try:
            # We use a timeout to prevent hanging the engine
            response = requests.get(self.url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                
                # Betpawa schema traversal (simplified for the engine)
                events = data.get("events", [])
                for item in events:
                    home_team = item.get("home", "Unknown")
                    away_team = item.get("away", "Unknown")
                    
                    markets = item.get("markets", [])
                    # Find the 1X2 (Match Result) market
                    match_result_market = next((m for m in markets if m.get("name") == "1X2"), None)
                    
                    if match_result_market:
                        selections = match_result_market.get("selections", [])
                        
                        home_odds = next((s.get("price") for s in selections if s.get("name") == "1"), None)
                        draw_odds = next((s.get("price") for s in selections if s.get("name") == "X"), None)
                        away_odds = next((s.get("price") for s in selections if s.get("name") == "2"), None)

                        if home_odds and draw_odds and away_odds:
                            matches.append({
                                "bookmaker": "BetPawa",
                                "home_team": home_team,
                                "away_team": away_team,
                                "odds_1": float(home_odds),
                                "odds_x": float(draw_odds),
                                "odds_2": float(away_odds),
                                "match_time": item.get("start", 0)
                            })
        except Exception as e:
            print(f"[BetPawa Scraper] Error fetching odds: {str(e)}")
            
        return matches

if __name__ == "__main__":
    scraper = BetPawaScraper()
    print("Fetching BetPawa Odds...")
    results = scraper.fetch_odds()
    print(f"Found {len(results)} matches with odds.")
    for r in results[:3]:
        print(r)
