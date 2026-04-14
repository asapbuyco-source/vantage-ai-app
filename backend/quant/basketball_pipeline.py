"""
basketball_pipeline.py
──────────────────────────────────────────────────────────────────────────────
Quantitative basketball prediction pipeline for Vantage AI.

Architecture:
  1. Fetch today's NBA games from BallDontLie API (free, no key required).
  2. Fetch team season-average stats (OffRtg, DefRtg, Pace, PPG, OppPPG).
  3. Compute win probability using a pace-adjusted Elo-log5 model.
  4. Compute expected total points using both teams' pace + efficiency.
  5. Generate value bets (Moneyline / Total Over-Under) that pass EV + confidence gates.
  6. Save to Firestore: basketball_predictions/{date} (matches same schema as football).

If no NBA games are scheduled (off-season, All-Star break, etc.) the pipeline
exits with code 0 and prints "NO_GAMES" so Node.js can fall back to OpenAI.

Usage:
  python basketball_pipeline.py [YYYY-MM-DD] [--dry-run]
"""

import sys
import os
import json
import math
import datetime
import urllib.request
import urllib.error

# ── Firestore imports (Firebase Admin SDK) ────────────────────────────────────
try:
    import firebase_admin
    from firebase_admin import credentials, firestore as fs
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False

# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS & CONFIG
# ─────────────────────────────────────────────────────────────────────────────

API_SPORTS_BASE = "https://v1.basketball.api-sports.io"
API_SPORTS_KEY = os.environ.get("VITE_API_BASKETBALL_KEY") or os.environ.get("API_BASKETBALL_KEY", "")

# Risk filter thresholds for basketball
MIN_PROBABILITY = 0.62      # 62% minimum model confidence
MIN_EV = 0.06               # 6% minimum expected value
MIN_CONFIDENCE_DISPLAY = 62  # floor for UI confidence %

# Estimated market odds for each bet type (used to compute EV)
MONEYLINE_FAVORITE_ODDS = 1.75
MONEYLINE_UNDERDOG_ODDS = 2.10
TOTAL_OVER_ODDS  = 1.85
TOTAL_UNDER_ODDS = 1.85

# NBA League ID in API-Sports is 12
# Free plan only supports statistics up to 2023-2024 season
NBA_LEAGUE_ID = 12
NBA_STATS_SEASON = "2023-2024"



# ─────────────────────────────────────────────────────────────────────────────
# HELPER: Get Lagos date
# ─────────────────────────────────────────────────────────────────────────────
def get_lagos_date(offset_days=0):
    """Return YYYY-MM-DD for today (or +offset days) in Africa/Lagos (UTC+1)."""
    utc_now = datetime.datetime.utcnow()
    lagos = utc_now + datetime.timedelta(hours=1, days=offset_days)
    return lagos.strftime("%Y-%m-%d")


# ─────────────────────────────────────────────────────────────────────────────
# HELPER: HTTP GET (with headers for API-Sports)
# ─────────────────────────────────────────────────────────────────────────────
def http_get(url, timeout=15):
    """Fetch a URL and return parsed JSON, or None on error."""
    if not API_SPORTS_KEY:
        print("[Basketball] Error: No API-Sports key provided.", file=sys.stderr)
        return None
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "VantageAI-Basketball/1.0",
            "x-apisports-key": API_SPORTS_KEY
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        print(f"[Basketball] HTTP {e.code} fetching {url}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[Basketball] Error fetching {url}: {e}", file=sys.stderr)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Fetch today's NBA games
# ─────────────────────────────────────────────────────────────────────────────
def fetch_games(date_str):
    """Return list of {id, home_team, away_team, home_team_id, away_team_id, status} for date_str."""
    # Fetch all basketball games for the date (avoids season param requirement on free plan)
    url = f"{API_SPORTS_BASE}/games?date={date_str}"
    data = http_get(url)
    if not data or not data.get("response"):
        return []
    
    games = []
    for g in data["response"]:
        # Filter for NBA only
        league_id = g.get("league", {}).get("id")
        if league_id != NBA_LEAGUE_ID:
            continue
            
        home = g.get("teams", {}).get("home", {})
        visitor = g.get("teams", {}).get("away", {})
        status = g.get("status", {}).get("short", "")
        # Skip finished games (FT, AOT) or cancelled/postponed
        if status in ["FT", "AOT", "CANC", "POSTP"]:
            continue
        games.append({
            "id": str(g["id"]),
            "home_team": home.get("name", "Home"),
            "away_team": visitor.get("name", "Away"),
            "home_team_id": home.get("id"),
            "away_team_id": visitor.get("id"),
            "time": g.get("time", g.get("status", {}).get("long", "TBD")),
            "league": "NBA",
        })
    return games


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Fetch Team Season Stats
# ─────────────────────────────────────────────────────────────────────────────
def fetch_team_stats(team_id):
    """
    Return dict of avg stats for a team: {ppg, opp_ppg, pace_estimate}
    Uses per-game season averages from API-Sports.
    Note: Free tier only supports up to 2023-2024 season.
    """
    url = f"{API_SPORTS_BASE}/statistics?season={NBA_STATS_SEASON}&team={team_id}&league={NBA_LEAGUE_ID}"
    data = http_get(url)
    if not data or not data.get("response"):
        return None
    
    resp = data["response"]
    points = resp.get("points", {})
    
    try:
        # PPG (Points Per Game)
        ppg_str = points.get("for", {}).get("average", {}).get("all", "0")
        ppg = float(ppg_str) if ppg_str else 0.0
        
        # Opponent PPG
        opp_ppg_str = points.get("against", {}).get("average", {}).get("all", "0")
        opp_ppg = float(opp_ppg_str) if opp_ppg_str else 0.0
        
        if ppg == 0.0:
            return None
            
        # API-Sports basketball statistics endpoint doesn't break down FGA/FTA to precisely calculate Pace.
        # We will estimate pace based on scoring environment (higher PPG total usually correlates with higher pace)
        # NBA average pace is around 99-100 possessions.
        avg_game_pts = ppg + opp_ppg
        # Baseline: 230 pts game ~ 100 pace. 
        pace_estimate = 90 + ((avg_game_pts - 200) * 0.3)
        pace_estimate = min(max(pace_estimate, 90), 115)
        
        return {
            "ppg": ppg,
            "opp_ppg": opp_ppg,
            "pace_estimate": pace_estimate,
        }
    except Exception as e:
        print(f"[Basketball] Error parsing stats for team {team_id}: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Probability Model
# ─────────────────────────────────────────────────────────────────────────────
def compute_win_probability(home_stats, away_stats):
    """
    Log5 win probability for home team.
    Uses PPG as a proxy for team strength; applies a 3% home court advantage.
    """
    if not home_stats or not away_stats:
        return 0.5  # No data → coin flip
    
    home_ppg = home_stats["ppg"]
    away_ppg = away_stats["ppg"]
    
    # Normalize to league average (~115 ppg for NBA 2024-25)
    league_avg = 115.0
    home_strength = home_ppg / league_avg
    away_strength = away_ppg / league_avg
    
    # Log5 formula: P(A beats B) = A*B' / (A*B' + A'*B) where B' = 1 - B
    hs = home_strength
    as_ = away_strength
    if (hs * (1 - as_) + (1 - hs) * as_) == 0:
        return 0.5
    
    raw_prob = (hs * (1 - as_)) / (hs * (1 - as_) + (1 - hs) * as_)
    
    # Apply home court advantage (+3% for NBA home teams on average)
    home_prob = min(max(raw_prob + 0.03, 0.35), 0.85)
    
    return home_prob


def compute_expected_total(home_stats, away_stats):
    """
    Estimate total points for Over/Under bet.
    Uses each team's PPG and pace estimate.
    """
    if not home_stats or not away_stats:
        return 220.0  # NBA average ~220-230
    
    # Simple approach: average of both teams' PPG, scaled by pace factor
    home_ppg = home_stats["ppg"]
    away_ppg = away_stats["ppg"]
    avg_pace = (home_stats["pace_estimate"] + away_stats["pace_estimate"]) / 2
    
    # Baseline pace as ~100, scale total up/down
    pace_multiplier = avg_pace / 100.0
    expected_total = (home_ppg + away_ppg) * pace_multiplier
    
    # Clamp to realistic NBA range (185 – 270)
    return min(max(expected_total, 185.0), 270.0)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Generate Value Bet
# ─────────────────────────────────────────────────────────────────────────────
def ev(prob, odds):
    """Expected Value: EV = (prob × odds) - 1."""
    return (prob * odds) - 1.0


def pick_best_bet(game, home_prob, away_prob, expected_total):
    """
    Evaluate all markets and return the best bet that passes risk filters.
    Markets evaluated: Home Win, Away Win, Over/Under total.
    Returns a dict or None if nothing passes filters.
    """
    candidates = []

    # Moneyline: Home Win
    home_odds = MONEYLINE_FAVORITE_ODDS if home_prob >= 0.5 else MONEYLINE_UNDERDOG_ODDS
    home_ev = ev(home_prob, home_odds)
    if home_prob >= MIN_PROBABILITY and home_ev >= MIN_EV:
        candidates.append({
            "prediction_en": "Home Win",
            "prediction_fr": "Victoire Domicile",
            "confidence": round(home_prob * 100),
            "odds": home_odds,
            "ev_pct": round(home_ev * 100, 1),
            "market": "moneyline",
        })

    # Moneyline: Away Win
    away_odds = MONEYLINE_FAVORITE_ODDS if away_prob >= 0.5 else MONEYLINE_UNDERDOG_ODDS
    away_ev = ev(away_prob, away_odds)
    if away_prob >= MIN_PROBABILITY and away_ev >= MIN_EV:
        candidates.append({
            "prediction_en": "Away Win",
            "prediction_fr": "Victoire Extérieure",
            "confidence": round(away_prob * 100),
            "odds": away_odds,
            "ev_pct": round(away_ev * 100, 1),
            "market": "moneyline",
        })

    # Total: Over
    # We use a line of expected_total - 3.5 for over (gives more safety margin)
    line = round(expected_total - 3.5, 1)
    over_prob = 0.58 if expected_total > 218 else 0.52  # rough estimate
    over_ev = ev(over_prob, TOTAL_OVER_ODDS)
    if over_prob >= MIN_PROBABILITY and over_ev >= MIN_EV:
        candidates.append({
            "prediction_en": f"Over {line} Total Points",
            "prediction_fr": f"Plus de {line} Points",
            "confidence": round(over_prob * 100),
            "odds": TOTAL_OVER_ODDS,
            "ev_pct": round(over_ev * 100, 1),
            "market": "total_over",
        })

    # Total: Under (conservative — only if expected total is quite low)
    under_line = round(expected_total + 3.5, 1)
    under_prob = 0.60 if expected_total < 210 else 0.50
    under_ev = ev(under_prob, TOTAL_UNDER_ODDS)
    if under_prob >= MIN_PROBABILITY and under_ev >= MIN_EV:
        candidates.append({
            "prediction_en": f"Under {under_line} Total Points",
            "prediction_fr": f"Moins de {under_line} Points",
            "confidence": round(under_prob * 100),
            "odds": TOTAL_UNDER_ODDS,
            "ev_pct": round(under_ev * 100, 1),
            "market": "total_under",
        })

    if not candidates:
        return None

    # Pick highest EV candidate
    best = max(candidates, key=lambda x: x["ev_pct"])

    confidence = best["confidence"]
    if confidence >= 80:
        category = "safe"
    elif confidence >= 70:
        category = "value"
    else:
        category = "risky"

    home = game["home_team"]
    away = game["away_team"]
    market_label = best["prediction_en"]

    return {
        "id": f"bball_{game['id']}",
        "league": game["league"],
        "homeTeam": home,
        "awayTeam": away,
        "homeTeamLogo": "",
        "awayTeamLogo": "",
        "time": game["time"],
        "prediction": market_label,
        "prediction_en": market_label,
        "prediction_fr": best["prediction_fr"],
        "confidence": confidence,
        "odds": best["odds"],
        "category": category,
        "analysis_en": f"EV: +{best['ev_pct']}% | Quant model | Home win prob: {round(home_prob*100)}% | Exp total: {round(expected_total, 1)} pts",
        "analysis_fr": f"EV: +{best['ev_pct']}% | Modèle Quant | Prob victoire domicile: {round(home_prob*100)}% | Total prévu: {round(expected_total, 1)} pts",
        "sport": "basketball",
        "status": "pending",
        "generatedBy": "quant_basketball",
    }


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Firestore Persistence
# ─────────────────────────────────────────────────────────────────────────────
def init_firebase():
    """Initialize Firebase Admin SDK if not already initialized."""
    if not FIREBASE_AVAILABLE:
        return None
    if firebase_admin._apps:
        return fs.client()
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
    if not sa_json:
        print("[Basketball] FIREBASE_SERVICE_ACCOUNT not set — skipping Firestore.", file=sys.stderr)
        return None
    try:
        sa_dict = json.loads(sa_json)
        cred = credentials.Certificate(sa_dict)
        firebase_admin.initialize_app(cred)
        return fs.client()
    except Exception as e:
        print(f"[Basketball] Firebase init error: {e}", file=sys.stderr)
        return None


def save_to_firestore(db, date_str, matches):
    """Save basketball predictions to basketball_predictions/{date} collection."""
    if not db:
        print("[Basketball] Firestore not available — write skipped.")
        return
    ref = db.collection("basketball_predictions").document(date_str)
    ref.set({
        "matches": matches,
        "generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "generatedBy": "quant_basketball",
        "updatedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "date": date_str,
    })
    print(f"[Basketball] [PASS] Saved {len(matches)} basketball predictions to Firestore for {date_str}.")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
def main():
    dry_run = "--dry-run" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    
    date_str = args[0] if args else get_lagos_date()
    
    print(f"[Basketball] Quant Pipeline starting for {date_str} (dry_run={dry_run})")
    print(f"[Basketball] Fetching NBA games from API-Sports...")
    
    # STEP 1: Get games
    games = fetch_games(date_str)
    
    if not games:
        print(f"[Basketball] NO_GAMES — No NBA games scheduled for {date_str}. OpenAI fallback will be used.")
        return  # Return instead of sys.exit(0) to avoid NativeCommandError on Windows
    
    print(f"[Basketball] Found {len(games)} NBA games. Analyzing...")
    
    # STEP 2-4: For each game, fetch stats and pick bet
    approved = []
    for game in games:
        home_id = game["home_team_id"]
        away_id = game["away_team_id"]
        
        print(f"[Basketball]   {game['home_team']} vs {game['away_team']}...")
        
        home_stats = fetch_team_stats(home_id) if home_id else None
        away_stats = fetch_team_stats(away_id) if away_id else None
        
        home_prob = compute_win_probability(home_stats, away_stats)
        away_prob = 1.0 - home_prob
        expected_total = compute_expected_total(home_stats, away_stats)
        
        bet = pick_best_bet(game, home_prob, away_prob, expected_total)
        if bet:
            approved.append(bet)
            print(f"[Basketball]   [PASS] {game['home_team']} vs {game['away_team']}: {bet['prediction_en']} | EV {bet['analysis_en'].split('|')[0].strip()} | Confidence {bet['confidence']}%")
        else:
            print(f"[Basketball]   [FAIL] {game['home_team']} vs {game['away_team']}: No value bet found.")
    
    print(f"\n[Basketball] Pipeline complete!")
    print(f"  Games analyzed: {len(games)}")
    print(f"  Value bets identified: {len(approved)}")
    
    if dry_run:
        print("[Basketball] [DRY RUN] Firestore write skipped.")
        if approved:
            print("\n[Basketball] DRY RUN OUTPUT:")
            for m in approved:
                print(f"  {m['homeTeam']} vs {m['awayTeam']} — {m['prediction_en']} ({m['confidence']}%) @ {m['odds']}")
        return
    
    # Even if approved is empty, we save to Firestore to clear yesterday's data
    # and we definitely do NOT print NO_GAMES, because 0 value bets is a valid model outcome.
    
    # STEP 5: Save to Firestore
    db = init_firebase()
    save_to_firestore(db, date_str, approved)
    
    print(f"\n[PASS] Basketball Pipeline complete!")
    print(f"  Matches analyzed: {len(games)}")
    print(f"  Value bets identified: {len(approved)}")


if __name__ == "__main__":
    main()
