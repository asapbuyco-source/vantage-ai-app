import sys
sys.path.insert(0, "./backend/quant")
from quant_pipeline import _init_firebase
import firebase_admin
from firebase_admin import firestore
import json
from datetime import datetime, timezone, timedelta

def run():
    if not _init_firebase():
        print("Firebase init failed")
        return
        
    db = firestore.client()
    dates = [(datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(5)]
    
    for date in dates:
        doc = db.collection("quant_predictions").document(date).get()
        if doc.exists:
            print(f"--- {date} ---")
            data = doc.to_dict()
            preds = data.get("predictions", [])
            if preds:
                print(json.dumps(preds[0], indent=2))
                return
    print("No predictions found in last 5 days")

run()
