import os, json, sys

# Check what's actually in Firestore for World Cup dates
service_account = os.environ.get('FIREBASE_SERVICE_ACCOUNT', '')
if not service_account:
    print('FIREBASE_SERVICE_ACCOUNT not set - cannot access Firestore')
    print('Need Railway env vars to check Firestore predictions')
    sys.exit(0)

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print('firebase-admin not installed')
    sys.exit(0)

sa_parsed = json.loads(service_account.replace(r'\n', '\n'))
cred = credentials.Certificate(sa_parsed)
firebase_admin.initialize_app(cred)
db = firestore.client()

print('Checking Firestore for quant_predictions...')
print()

for date in ['2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15', '2026-06-16']:
    doc = db.collection('quant_predictions').document(date).get()
    if doc.exists:
        d = doc.to_dict()
        preds = d.get('predictions', [])
        accas = d.get('accumulators', {})
        status = d.get('status', 'unknown')
        total_accas = sum(len(v) for v in accas.values())
        print(f'{date}: {status} | {len(preds)} predictions | {total_accas} accumulators')
        if preds:
            # Show a sample prediction
            p = preds[0]
            print(f'  Sample: {p.get("home_team", "?")} vs {p.get("away_team", "?")} | '
                  f'{p.get("bet_type", "?")} @ {p.get("odds", 0):.2f} | '
                  f'EV={p.get("expected_value", 0):.1%} | '
                  f'vault={p.get("vault_eligible", False)}')
    else:
        print(f'{date}: NO DATA')
