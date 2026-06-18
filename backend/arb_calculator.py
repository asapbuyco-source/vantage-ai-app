import sys
import os
import time
import json
import difflib
import logging
import re
from itertools import product

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
        self.db = get_db()
        self.xbet = XbetScraper(db=self.db)
        self.betpawa = BetPawaScraper(db=self.db)
        self.threshold = 0.975 # Looking for combined probability < 0.975 (allowing for 1% margin + 1.5% fees)
        self.STRIP_SUFFIXES = re.compile(r'\s+(U\d{2}|B|II|III|Reserves|Women|Ladies|FC|SC|CF|AFC|RFC)$', re.I)

    def normalize_name(self, name):
        return self.STRIP_SUFFIXES.sub('', name.strip()).lower()

    def similar(self, a, b):
        """String similarity ratio to match team names across different bookmakers"""
        return difflib.SequenceMatcher(None, self.normalize_name(a), self.normalize_name(b)).ratio()

    def _build_event_map(self, sources):
        matched_events = {}
        canonical_events = []
        
        for bk, matches in sources.items():
            for m in matches:
                found = False
                for ce in canonical_events:
                    if self.similar(m['home_team'], ce['home_team']) > 0.82 and \
                       self.similar(m['away_team'], ce['away_team']) > 0.82:
                        ce['odds'][bk] = m
                        found = True
                        break
                if not found:
                    canonical_events.append({
                        'home_team': m['home_team'],
                        'away_team': m['away_team'],
                        'odds': {bk: m}
                    })
                    
        # Convert to dictionary map
        for ce in canonical_events:
            event_key = f"{ce['home_team']} vs {ce['away_team']}"
            matched_events[event_key] = ce['odds']
            
        return matched_events

    def find_arbs(self):
        logging.info("Fetching odds from bookmakers...")
        sources = {
            '1XBet': self.xbet.fetch_odds()[:50],
            'BetPawa': self.betpawa.fetch_odds()[:50],
        }

        matched_events = self._build_event_map(sources)
        arbs_found = []

        for event_key, bk_odds in matched_events.items():
            if len(bk_odds) < 2:
                continue
                
            bookmakers = list(bk_odds.keys())
            # Try every combination: Home from bk1, Draw from bkx, Away from bk2
            for bk1, bkx, bk2 in product(bookmakers, repeat=3):
                if bk1 == bkx == bk2:
                    continue  # all same book = no arb
                    
                m1 = bk_odds[bk1]
                mx = bk_odds[bkx]
                m2 = bk_odds[bk2]
                
                prob = (1 / m1['odds_1']) + (1 / mx['odds_x']) + (1 / m2['odds_2'])
                if prob < self.threshold:
                    arbs_found.append(self._format_arb_v2(event_key, bk_odds, bk1, bkx, bk2, prob))

        return arbs_found

    def _format_arb_v2(self, event_key, bk_odds, bk1, bkx, bk2, prob):
        profit_margin = (1 - prob) * 100
        arb = {
            "match": event_key,
            "profit_margin": round(profit_margin, 2),
            "timestamp": time.time(),
            "legs": [
                {"selection": "Home (1)", "bookmaker": bk1, "odds": bk_odds[bk1]['odds_1']},
                {"selection": "Draw (X)", "bookmaker": bkx, "odds": bk_odds[bkx]['odds_x']},
                {"selection": "Away (2)", "bookmaker": bk2, "odds": bk_odds[bk2]['odds_2']}
            ]
        }
        return arb

    def _delete_stale_arbs(self):
        if not self.db:
            return
        cutoff = time.time() - (90 * 60)
        old = self.db.collection('arbitrage_bets').where('timestamp', '<', cutoff).stream()
        batch = self.db.batch()
        count = 0
        for doc in old:
            batch.delete(doc.reference)
            count += 1
        if count > 0:
            batch.commit()
            logging.info(f"Deleted {count} stale arbs.")

    def push_to_firestore(self, arbs):
        if not self.db:
            return
            
        logging.info(f"Pushing {len(arbs)} arbitrage opportunities to Firestore...")
        batch = self.db.batch()
        arb_ref = self.db.collection('arbitrage_bets')
        
        for arb in arbs:
            doc_id = f"{arb['match']}_{arb['profit_margin']:.3f}_{int(arb['timestamp'])}".replace(' ', '_').replace('/', '_')
            doc_ref = arb_ref.document(doc_id)
            batch.set(doc_ref, arb)
            
        batch.commit()
        logging.info("Push complete.")

    def run(self):
        consecutive_errors = 0
        MAX_ERRORS = 5
        
        while True:
            try:
                self._delete_stale_arbs()
                
                arbs = self.find_arbs()
                if arbs:
                    logging.info(f"FOUND {len(arbs)} ARBS!")
                    for a in arbs:
                        logging.info(f"ARB: {a['profit_margin']}% -> {a['match']}")
                    self.push_to_firestore(arbs)
                else:
                    logging.info("No arbs found in this cycle.")
                    
                consecutive_errors = 0
            except Exception as e:
                consecutive_errors += 1
                logging.error(f"Cycle error ({consecutive_errors}/{MAX_ERRORS}): {str(e)}")
                if consecutive_errors >= MAX_ERRORS:
                    logging.critical("Circuit breaker triggered — sleeping 10 minutes")
                    time.sleep(600)
                    consecutive_errors = 0
                    
            logging.info("Sleeping for 60 seconds...")
            time.sleep(60)

if __name__ == "__main__":
    engine = ArbCalculator()
    engine.run()
