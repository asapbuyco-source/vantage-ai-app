import os
import requests
import json
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore

RAPIDAPI_KEY = os.environ.get('RAPIDAPI_KEY', '96329fba36msh293dfd95c0b7196p102286jsndc9aa594e4c3')
RAPIDAPI_HOST = 'flashscore4.p.rapidapi.com'

def init_firebase():
    if not firebase_admin._apps:
        try:
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            return firestore.client()
        except Exception as e:
            print(f"[LiveMomentum] Firebase init error: {e}")
            return None
    return firestore.client()

def fetch_live_matches():
    url = f"https://{RAPIDAPI_HOST}/api/flashscore/v2/matches/live?sport_id=1"
    headers = {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY
    }
    print("[LiveMomentum] Fetching live matches from Flashscore...")
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    # Using verify=False because of local SSL issues in this environment
    response = requests.get(url, headers=headers, verify=False)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"[LiveMomentum] Failed to fetch. Status: {response.status_code}")
        return []

def calculate_momentum(match_data):
    """
    Calculates a basic momentum score based on current scores and odds.
    If we had point-by-point data, we would calculate pressure here.
    For now, we flag matches where the underdog has scored as "High Momentum".
    """
    home_score = match_data.get('scores', {}).get('home', 0)
    away_score = match_data.get('scores', {}).get('away', 0)
    odds = match_data.get('odds', {})
    
    momentum = 50 # Base 50/50 momentum
    flag = 'Neutral'

    if odds:
        home_odds = odds.get('1', 2.0)
        away_odds = odds.get('2', 2.0)
        
        # If home was massive favorite but away is winning
        if home_odds < 1.5 and away_score > home_score:
            momentum = 90
            flag = 'Underdog Winning'
        # If away was massive favorite but home is winning
        elif away_odds < 1.5 and home_score > away_score:
            momentum = 90
            flag = 'Underdog Winning'
            
    return {
        'score': momentum,
        'flag': flag,
        'home_goals': home_score,
        'away_goals': away_score
    }

def run_momentum_engine():
    db = init_firebase()
    if not db:
        print("[LiveMomentum] Skipping run due to missing Firebase credentials.")
        return

    data = fetch_live_matches()
    
    live_results = []
    
    for tournament in data:
        for match in tournament.get('matches', []):
            home_team = match.get('home_team', {}).get('name', 'Unknown')
            away_team = match.get('away_team', {}).get('name', 'Unknown')
            match_id = match.get('match_id')
            
            momentum_data = calculate_momentum(match)
            
            live_results.append({
                'match_id': match_id,
                'home_team': home_team,
                'away_team': away_team,
                'league': tournament.get('name', 'Unknown'),
                'momentum_score': momentum_data['score'],
                'momentum_flag': momentum_data['flag'],
                'home_score': momentum_data['home_goals'],
                'away_score': momentum_data['away_goals'],
                'live_time': match.get('match_status', {}).get('live_time', '0'),
                'updated_at': datetime.utcnow().isoformat()
            })
            
    if live_results:
        print(f"[LiveMomentum] Calculated momentum for {len(live_results)} live matches.")
        # Store in firestore
        try:
            db.collection('live_momentum').doc('current').set({
                'matches': live_results,
                'last_updated': datetime.utcnow().isoformat()
            })
            print("[LiveMomentum] Successfully saved to Firestore.")
        except Exception as e:
            print(f"[LiveMomentum] Error saving to Firestore: {e}")
    else:
        print("[LiveMomentum] No live matches to process.")

if __name__ == '__main__':
    run_momentum_engine()
