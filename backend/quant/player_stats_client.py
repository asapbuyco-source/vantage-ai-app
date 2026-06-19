"""
player_stats_client.py
───────────────────────
Analyzes match impact using API-Football:
- Lineups (startXI vs star players)
- Live events (red cards trigger momentum recalculation)
- Player statistics
"""

import os
import json
from datetime import datetime

try:
    import certifi
    os.environ["GRPC_DEFAULT_SSL_ROOTS_FILE_PATH"] = certifi.where()
except ImportError:
    pass
import firebase_admin
from firebase_admin import credentials, firestore

from api_football_client import fetch_lineups, fetch_events, fetch_player_stats, fetch_live_fixtures

STAR_PLAYERS = {
    278: "Lionel Messi",
    154: "Cristiano Ronaldo",
    204: "Kylian Mbappe",
    132: "Erling Haaland",
    108: "Kevin De Bruyne",
    195: "Mohamed Salah",
    144: "Neymar Jr",
    143: "Luka Modric",
    157: "Harry Kane",
    211: "Sadio Mane",
}

def init_firebase():
    if not firebase_admin._apps:
        try:
            service_account_raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
            if service_account_raw:
                sa = json.loads(service_account_raw)
                cred = credentials.Certificate(sa)
            else:
                cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            return firestore.client()
        except Exception as e:
            print(f"[PlayerStats] Firebase init error: {e}")
            return None
    return firestore.client()

def check_lineup_alerts(fixture_id):
    """
    Check if any star players are missing from starting XI.
    Returns list of alerts for missing star players.
    """
    lineups = fetch_lineups(fixture_id)
    alerts = []

    for entry in lineups:
        team = entry.get("team", {})
        team_name = team.get("name", "Unknown")
        team_id = team.get("id")
        start_xi = entry.get("startXI", [])

        start_xi_player_ids = {player.get("id") for player in start_xi}

        for player_id, player_name in STAR_PLAYERS.items():
            if player_id not in start_xi_player_ids:
                confidence_penalty = -5
                alerts.append({
                    "type": "lineup_alert",
                    "team_id": team_id,
                    "team_name": team_name,
                    "player_name": player_name,
                    "player_id": player_id,
                    "fixture_id": fixture_id,
                    "confidence_penalty": confidence_penalty,
                    "message": f"{player_name} ({team_name}) NOT in starting XI! Confidence -5%",
                    "timestamp": datetime.utcnow().isoformat(),
                })

    return alerts

def check_red_cards(fixture_id):
    """
    Check for red cards in live events.
    Returns list of red card events.
    """
    events = fetch_events(fixture_id)
    red_cards = []

    for event in events:
        if event.get("type") == "Card" and event.get("detail") == "Red Card":
            team = event.get("team", {})
            player = event.get("player", {})
            red_cards.append({
                "type": "red_card",
                "team_id": team.get("id"),
                "team_name": team.get("name", "Unknown"),
                "player_name": player.get("name", "Unknown"),
                "player_id": player.get("id"),
                "fixture_id": fixture_id,
                "elapsed": event.get("time", {}).get("elapsed", 0),
                "timestamp": datetime.utcnow().isoformat(),
            })

    return red_cards

def send_telegram_alert(message):
    """Store Telegram alert in Firestore for the frontend to process."""
    db = init_firebase()
    if not db:
        return

    try:
        db.collection("pending_telegram_alerts").add({
            "message": message,
            "created_at": datetime.utcnow().isoformat(),
            "processed": False,
        })
        print(f"[PlayerStats] Telegram alert queued: {message}")
    except Exception as e:
        print(f"[PlayerStats] Error queuing Telegram alert: {e}")

def analyze_match_impact(fixture_id):
    """
    Main function to analyze match impact for a fixture.
    Checks lineups for missing star players and red cards.
    Stores alerts in Firestore.
    """
    db = init_firebase()
    if not db:
        print("[PlayerStats] Skipping due to missing Firebase credentials.")
        return

    print(f"[PlayerStats] Analyzing fixture {fixture_id}...")

    lineup_alerts = check_lineup_alerts(fixture_id)
    red_cards = check_red_cards(fixture_id)

    if lineup_alerts:
        print(f"[PlayerStats] Found {len(lineup_alerts)} lineup alerts for fixture {fixture_id}")
        for alert in lineup_alerts:
            print(f"  - {alert['message']}")
            send_telegram_alert(f"⚠️ {alert['message']}")

    if red_cards:
        print(f"[PlayerStats] Found {len(red_cards)} red cards for fixture {fixture_id}")
        for card in red_cards:
            msg = f"🔴 RED CARD: {card['player_name']} ({card['team_name']}) at {card['elapsed']}'"
            print(f"  - {msg}")
            send_telegram_alert(msg)

        print("[PlayerStats] Red card detected — triggering momentum recalculation...")
        try:
            from live_momentum_engine import run_momentum_engine
            run_momentum_engine()
        except Exception as e:
            print(f"[PlayerStats] Error triggering momentum recalculation: {e}")

    if lineup_alerts or red_cards:
        try:
            db.collection("match_alerts").document(str(fixture_id)).set({
                "fixture_id": fixture_id,
                "lineup_alerts": lineup_alerts,
                "red_cards": red_cards,
                "analyzed_at": datetime.utcnow().isoformat(),
            }, merge=True)
            print(f"[PlayerStats] Alerts saved to Firestore for fixture {fixture_id}")
        except Exception as e:
            print(f"[PlayerStats] Error saving alerts: {e}")

    return {
        "lineup_alerts": lineup_alerts,
        "red_cards": red_cards,
    }

def run_player_stats():
    """Run analysis on all live fixtures."""
    db = init_firebase()
    if not db:
        print("[PlayerStats] Skipping due to missing Firebase credentials.")
        return

    print("[PlayerStats] Fetching live fixtures...")
    fixtures = fetch_live_fixtures()

    if not fixtures:
        print("[PlayerStats] No live fixtures found.")
        return

    print(f"[PlayerStats] Analyzing {len(fixtures)} live fixtures...")

    for fixture in fixtures:
        fixture_id = fixture.get("fixture", {}).get("id")
        if fixture_id:
            analyze_match_impact(fixture_id)

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        fixture_id = int(sys.argv[1])
        analyze_match_impact(fixture_id)
    else:
        run_player_stats()