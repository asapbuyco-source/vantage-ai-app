"""
replay_engine.py
────────────────
Backtesting utility that replays the quant pipeline against historical data.
Fetches past matches, runs the models, and compares predictions to actual scores.
"""

import os
import sys
import json
import time
from datetime import datetime, timedelta, timezone

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from quant_pipeline import run_pipeline
from data_pipeline import SM_TOKEN, _get

LAGOS_TZ = timezone(timedelta(hours=1))

def _safe_print(text: str, file=sys.stdout):
    try:
        print(text, file=file)
    except UnicodeEncodeError:
        print(text.encode('ascii', 'replace').decode('ascii'), file=file)

def get_actual_result(match_data: dict) -> str | None:
    """Extract the result from match scores."""
    scores = match_data.get("scores", [])
    if not scores:
        print(f"      [DEBUG] No scores found for match {match_data.get('id')}")
        return None
    
    participants = match_data.get("participants", [])
    home_p = next((p for p in participants if p.get("meta", {}).get("location") == "home"), {})
    away_p = next((p for p in participants if p.get("meta", {}).get("location") == "away"), {})
    
    home_id = home_p.get("id")
    away_id = away_p.get("id")

    if not home_id or not away_id:
        return None
    
    # Try multiple descriptions: CURRENT (live/recent) or FT (Full Time)
    home_goals = None
    away_goals = None
    
    for s in scores:
        p_id = s.get("participant_id")
        desc = s.get("description", "")
        goals = s.get("score", {}).get("goals")
        
        if p_id == home_id and desc in ["CURRENT", "FT", "FINAL"]:
            home_goals = goals
        if p_id == away_id and desc in ["CURRENT", "FT", "FINAL"]:
            away_goals = goals
            
    if home_goals is None or away_goals is None:
        return None
        
    return f"{home_goals}-{away_goals}"

def grade_prediction(prediction: str, result: str) -> str:
    """Compare prediction string to result string (e.g. '2-1')."""
    try:
        h, a = map(int, result.split("-"))
    except:
        return "void"
        
    p = prediction.lower()
    
    if p == "home win": return "won" if h > a else "lost"
    if p == "away win": return "won" if a > h else "lost"
    if p == "draw": return "won" if h == a else "lost"
    if p == "double chance (1x)": return "won" if h >= a else "lost"
    if p == "double chance (x2)": return "won" if a >= h else "lost"
    if p == "over 2.5 goals": return "won" if (h + a) > 2.5 else "lost"
    if p == "under 2.5 goals": return "won" if (h + a) < 2.5 else "lost"
    if p == "over 1.5 goals": return "won" if (h + a) > 1.5 else "lost"
    if p == "btts": return "won" if h > 0 and a > 0 else "lost"
    
    return "void"

def run_replay(days: int = 30):
    """Run the replay for the last N days."""
    _safe_print(f"\n{'='*60}")
    _safe_print(f"🔄 REPLAY ENGINE: VALID TEST ({days} DAYS)")
    _safe_print(f"{'='*60}\n")
    
    stats = {
        "total_matches": 0,
        "predictions_made": 0,
        "wins": 0,
        "losses": 0,
        "roi_sum": 0.0,
        "by_market": {}
    }
    
    for i in range(days):
        date_str = (datetime.now(LAGOS_TZ) - timedelta(days=i+1)).strftime("%Y-%m-%d")
        _safe_print(f"👉 Analyzing {date_str}...")
        
        # Run pipeline in dry_run mode to avoid Firestore writes
        result = run_pipeline(date_str, dry_run=True)
        
        if result["status"] != "success":
            _safe_print(f"   Skipping: {result.get('reason', 'unknown')}")
            continue
            
        predictions = result.get("predictions", [])
        stats["total_matches"] += result.get("matches_analyzed", 0)
        
        for pred in predictions:
            # We need the actual result for this match
            # Upgrade #12: Include participants so we know home_id/away_id for grading
            fid = pred["fixture_id"]
            raw_match = _get(f"/fixtures/{fid}", {"include": "scores;participants"})
            if not raw_match or not raw_match.get("data"):
                continue
                
            actual_score = get_actual_result(raw_match["data"])
            if not actual_score:
                continue
                
            grade = grade_prediction(pred["prediction"], actual_score)
            
            if grade == "void":
                continue
                
            stats["predictions_made"] += 1
            if grade == "won":
                stats["wins"] += 1
                stats["roi_sum"] += (pred["odds"] - 1)
            else:
                stats["losses"] += 1
                stats["roi_sum"] -= 1
                
            # Market stats
            m = pred["prediction"]
            if m not in stats["by_market"]:
                stats["by_market"][m] = {"wins": 0, "losses": 0}
            if grade == "won": stats["by_market"][m]["wins"] += 1
            else: stats["by_market"][m]["losses"] += 1
            
            _safe_print(f"   MATCH: {pred['home_team']} {actual_score} {pred['away_team']}")
            _safe_print(f"   PICK : {pred['prediction']} @ {pred['odds']} -> {grade.upper()}")

    # Final Summary
    _safe_print(f"\n{'='*60}")
    _safe_print(f"📈 TEST SUMMARY: {days} DAYS")
    _safe_print(f"{'='*60}")
    
    decided = stats["wins"] + stats["losses"]
    if decided > 0:
        hit_rate = stats["wins"] / decided
        roi = stats["roi_sum"] / decided
        _safe_print(f"Total Predictions: {stats['predictions_made']}")
        _safe_print(f"Wins / Losses:     {stats['wins']} / {stats['losses']}")
        _safe_print(f"Hit Rate:          {hit_rate:.1%}")
        _safe_print(f"Estimated ROI:     {roi:+.1%}")
    else:
        _safe_print("No predictions were completed in this period.")
        
    _safe_print(f"{'='*60}\n")

if __name__ == "__main__":
    days_to_test = 7 # Default to 7 days for a quick test run
    if len(sys.argv) > 1:
        try:
            days_to_test = int(sys.argv[1])
        except:
            pass
            
    run_replay(days_to_test)
