import sys
import os
import json
from datetime import datetime
sys.path.append(os.path.join(os.getcwd(), "backend", "quant"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local")

import firebase_admin
from firebase_admin import credentials, firestore

try:
    from api_football_client import fetch_fixtures_by_date
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

def main():
    date_str = "2026-06-20"
    
    print(f"API_FOOTBALL_KEY: {'set' if os.environ.get('API_FOOTBALL_KEY') else 'not set'}")
    
    af_fixtures = fetch_fixtures_by_date(date_str)
    print(f"API-Football fetched {len(af_fixtures)} fixtures for {date_str}.")
    
    results_map = {}
    for item in af_fixtures:
        fixture = item.get("fixture", {})
        match_id = str(fixture.get("id") or "")
        if not match_id: continue
        status = fixture.get("status", {}).get("short")
        if status in ["FT", "AET", "PEN"]:
            results_map[match_id] = fixture
            
    print(f"Finished fixtures from API-Football: {len(results_map)}")
    
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa_json:
        print("No FIREBASE_SERVICE_ACCOUNT found in env")
        return
        
    try:
        cred = credentials.Certificate(json.loads(sa_json))
        firebase_admin.initialize_app(cred)
        db = firestore.client()
    except Exception as e:
        print(f"Firebase init error: {e}")
        return
        
    doc = db.collection("quant_predictions").document(date_str).get()
    if not doc.exists:
        print(f"No predictions found for {date_str}")
        return
        
    data = doc.to_dict()
    preds = data.get("predictions", [])
    print(f"Found {len(preds)} predictions in DB for {date_str}")
    
    found_count = 0
    not_found_count = 0
    for p in preds:
        fid = str(p.get("fixture_id", ""))
        print(f"  Prediction: {p.get('home_team')} vs {p.get('away_team')} (fid: '{fid}') - Status: {p.get('status')}")
        if fid in results_map:
            print(f"    -> FOUND in results_map! API-Football status: {results_map[fid].get('status', {}).get('short')}")
            found_count += 1
        else:
            print(f"    -> NOT FOUND in results_map")
            not_found_count += 1
            
    print(f"\nSummary: {found_count} found, {not_found_count} not found in results_map.")

if __name__ == "__main__":
    main()
