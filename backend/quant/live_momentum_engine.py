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

from api_football_client import fetch_live_fixtures, fetch_fixture_statistics

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
            print(f"[LiveMomentum] Firebase init error: {e}")
            return None
    return firestore.client()

def parse_stat_value(stat_value):
    """Extract numeric value from stat string like '45%' or '12'."""
    if stat_value is None:
        return 0
    if isinstance(stat_value, (int, float)):
        return float(stat_value)
    val_str = str(stat_value).strip()
    if val_str.endswith('%'):
        return float(val_str[:-1])
    try:
        return float(val_str)
    except ValueError:
        return 0

def get_stat_by_type(statistics, stat_type):
    """Find a stat value by type name (e.g., 'Ball Possession', 'Dangerous Attacks')."""
    for stat in statistics:
        if stat.get("type", "").lower() == stat_type.lower():
            return parse_stat_value(stat.get("value"))
    return 0

def calculate_momentum(fixture_data, statistics):
    """
    Calculates momentum based on API-Football statistics.
    - Attacks per minute = Dangerous Attacks / elapsed_time
    - Pressure Index = (Possession * 0.5) + (Shots on Goal * 5)
    - If Attacks per minute > 1.5 and Pressure Index > 70, flag as HIGH_MOMENTUM
    """
    elapsed = fixture_data.get("fixture", {}).get("status", {}).get("elapsed") or 1

    home_stats = statistics.get("home", {}).get("statistics", [])
    away_stats = statistics.get("away", {}).get("statistics", [])

    home_possession = get_stat_by_type(home_stats, "Ball Possession")
    away_possession = get_stat_by_type(away_stats, "Ball Possession")

    home_attacks = get_stat_by_type(home_stats, "Dangerous Attacks")
    away_attacks = get_stat_by_type(away_stats, "Dangerous Attacks")

    home_shots_on_goal = get_stat_by_type(home_stats, "Shots on Goal")
    away_shots_on_goal = get_stat_by_type(away_stats, "Shots on Goal")

    home_attacks_per_min = home_attacks / elapsed if elapsed > 0 else 0
    away_attacks_per_min = away_attacks / elapsed if elapsed > 0 else 0

    home_pressure = (home_possession * 0.5) + (home_shots_on_goal * 5)
    away_pressure = (away_possession * 0.5) + (away_shots_on_goal * 5)

    home_momentum = 50
    away_momentum = 50
    home_flag = "Neutral"
    away_flag = "Neutral"

    if home_attacks_per_min > 1.5 and home_pressure > 70:
        home_momentum = 90
        home_flag = "HIGH_MOMENTUM"
    elif home_attacks_per_min > 1.0 and home_pressure > 50:
        home_momentum = 75
        home_flag = "Moderate"

    if away_attacks_per_min > 1.5 and away_pressure > 70:
        away_momentum = 90
        away_flag = "HIGH_MOMENTUM"
    elif away_attacks_per_min > 1.0 and away_pressure > 50:
        away_momentum = 75
        away_flag = "Moderate"

    return {
        "home_momentum": home_momentum,
        "home_flag": home_flag,
        "away_momentum": away_momentum,
        "away_flag": away_flag,
        "home_possession": home_possession,
        "away_possession": away_possession,
        "home_attacks": home_attacks,
        "away_attacks": away_attacks,
        "home_shots_on_goal": home_shots_on_goal,
        "away_shots_on_goal": away_shots_on_goal,
    }

def run_momentum_engine():
    db = init_firebase()
    if not db:
        print("[LiveMomentum] Skipping run due to missing Firebase credentials.")
        return

    print("[LiveMomentum] Fetching live matches from API-Football...")
    fixtures = fetch_live_fixtures()

    if not fixtures:
        print("[LiveMomentum] No live matches found.")
        return

    live_results = []

    for fixture in fixtures:
        fixture_id = fixture.get("fixture", {}).get("id")
        league = fixture.get("league", {}).get("name", "Unknown")
        home_team = fixture.get("teams", {}).get("home", {}).get("name", "Unknown")
        away_team = fixture.get("teams", {}).get("away", {}).get("name", "Unknown")
        home_score = fixture.get("goals", {}).get("home")
        away_score = fixture.get("goals", {}).get("away")
        elapsed = fixture.get("fixture", {}).get("status", {}).get("elapsed", 0)

        print(f"[LiveMomentum] Processing: {home_team} vs {away_team} (ID: {fixture_id})")

        statistics = fetch_fixture_statistics(fixture_id)
        momentum_data = calculate_momentum(fixture, statistics)

        live_results.append({
            "fixture_id": fixture_id,
            "home_team": home_team,
            "away_team": away_team,
            "league": league,
            "home_score": home_score,
            "away_score": away_score,
            "elapsed": elapsed,
            "momentum": {
                "home": momentum_data["home_momentum"],
                "home_flag": momentum_data["home_flag"],
                "away": momentum_data["away_momentum"],
                "away_flag": momentum_data["away_flag"],
            },
            "stats": {
                "home_possession": momentum_data["home_possession"],
                "away_possession": momentum_data["away_possession"],
                "home_attacks": momentum_data["home_attacks"],
                "away_attacks": momentum_data["away_attacks"],
                "home_shots_on_goal": momentum_data["home_shots_on_goal"],
                "away_shots_on_goal": momentum_data["away_shots_on_goal"],
            },
            "updated_at": datetime.utcnow().isoformat(),
        })

    if live_results:
        print(f"[LiveMomentum] Calculated momentum for {len(live_results)} live matches.")
        try:
            db.collection("live_matches").document("current").set({
                "matches": live_results,
                "last_updated": datetime.utcnow().isoformat(),
            })
            print("[LiveMomentum] Successfully saved to Firestore.")
        except Exception as e:
            print(f"[LiveMomentum] Error saving to Firestore: {e}")
    else:
        print("[LiveMomentum] No live matches to process.")

if __name__ == "__main__":
    run_momentum_engine()