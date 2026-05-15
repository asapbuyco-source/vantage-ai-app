import sys
import os
import time
import json
import difflib
import logging

# Ensure scrapers can be imported
sys.path.append(os.path.join(os.path.dirname(__file__), 'scrapers'))
from xbet_scraper import XbetScraper
from betpawa_scraper import BetPawaScraper

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_db():
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        cred_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', 'vantage-ai-firebase-adminsdk.json')
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        else:
            logging.error(f"Could not find Firebase credentials at {cred_path}")
            return None
    return firestore.client()

class ArbCalculator:
    def __init__(self):
        self.xbet = XbetScraper()
        self.betpawa = BetPawaScraper()
        self.db = get_db()
        self.threshold = 1.0 # Looking for combined probability < 1.0

    def similar(self, a, b):
        """String similarity ratio to match team names across different bookmakers"""
        return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()

    def find_arbs(self):
        logging.info("Fetching odds from bookmakers...")
        xbet_matches = self.xbet.fetch_odds()
        pawa_matches = self.betpawa.fetch_odds()

        logging.info(f"Retrieved {len(xbet_matches)} matches from 1XBet and {len(pawa_matches)} from BetPawa.")
        
        arbs_found = []

        # Simple O(N^2) matching, acceptable for top 50 matches. For scale, use a mapping dict.
        for x in xbet_matches:
            for p in pawa_matches:
                # Match home and away teams with > 70% similarity
                if self.similar(x['home_team'], p['home_team']) > 0.7 and \
                   self.similar(x['away_team'], p['away_team']) > 0.7:
                    
                    logging.info(f"Matched: {x['home_team']} vs {x['away_team']}")
                    
                    # Scenario 1: 1XBet Home, BetPawa Draw, BetPawa Away
                    prob_1 = (1 / x['odds_1']) + (1 / p['odds_x']) + (1 / p['odds_2'])
                    if prob_1 < self.threshold:
                        arbs_found.append(self._format_arb(x, p, '1XBet', 'BetPawa', 'BetPawa', prob_1))

                    # Scenario 2: BetPawa Home, 1XBet Draw, 1XBet Away
                    prob_2 = (1 / p['odds_1']) + (1 / x['odds_x']) + (1 / x['odds_2'])
                    if prob_2 < self.threshold:
                        arbs_found.append(self._format_arb(p, x, 'BetPawa', '1XBet', '1XBet', prob_2))

                    # Add more permutations as needed...
                    
        return arbs_found

    def _format_arb(self, m1, mx, bk1, bkx, bk2, prob):
        profit_margin = (1 - prob) * 100
        arb = {
            "match": f"{m1['home_team']} vs {m1['away_team']}",
            "profit_margin": round(profit_margin, 2),
            "timestamp": time.time(),
            "legs": [
                {"selection": "Home (1)", "bookmaker": bk1, "odds": m1['odds_1']},
                {"selection": "Draw (X)", "bookmaker": bkx, "odds": mx['odds_x']},
                {"selection": "Away (2)", "bookmaker": bk2, "odds": mx['odds_2']} # Simplified logic, bk2 usually same as bkx
            ]
        }
        return arb

    def push_to_firestore(self, arbs):
        if not self.db:
            return
            
        logging.info(f"Pushing {len(arbs)} arbitrage opportunities to Firestore...")
        batch = self.db.batch()
        arb_ref = self.db.collection('arbitrage_bets')
        
        # In a real production system, you'd delete expired arbs here
        for arb in arbs:
            # Create a deterministic ID so we don't spam duplicates
            doc_id = f"{arb['match']}_{int(arb['profit_margin'])}".replace(' ', '_').replace('/', '_')
            doc_ref = arb_ref.document(doc_id)
            batch.set(doc_ref, arb)
            
        batch.commit()
        logging.info("Push complete.")

    def run(self):
        while True:
            try:
                arbs = self.find_arbs()
                if arbs:
                    logging.info(f"FOUND {len(arbs)} ARBS!")
                    for a in arbs:
                        logging.info(f"ARB: {a['profit_margin']}% -> {a['match']}")
                    self.push_to_firestore(arbs)
                else:
                    logging.info("No arbs found in this cycle.")
            except Exception as e:
                logging.error(f"Error in Arb Engine cycle: {str(e)}")
                
            logging.info("Sleeping for 60 seconds...")
            time.sleep(60)

if __name__ == "__main__":
    engine = ArbCalculator()
    engine.run()
