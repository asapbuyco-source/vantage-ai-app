"""
calibration.py
──────────────
Upgrade #10: Model calibration logging.

After each grading cycle, compute and store calibration data:
  "For bets where we predicted 65% win probability, what % actually won?"

This produces a calibration table stored in Firestore `calibration/{date}`,
enabling detection of systematic over/under-estimation of probabilities.
"""

import os
import sys
import math
from datetime import datetime, timezone


def compute_calibration(predictions: list[dict], bucket_size: float = 0.10) -> dict:
    """
    Compute calibration table from a list of graded predictions.
    
    Groups predictions into probability buckets (e.g. 40-50%, 50-60%)
    and compares predicted probability to actual win rate.
    
    Args:
        predictions: List of prediction dicts with 'probability' and 'status' fields.
        bucket_size: Width of each probability bucket (default 10%).
    
    Returns:
        Dict with calibration data per bucket and overall metrics.
    """
    buckets = {}
    
    for pred in predictions:
        prob = pred.get("probability", 0)
        status = pred.get("status", "pending")
        
        if status not in ("won", "lost"):
            continue  # Skip pending/void
        
        # Determine bucket (e.g. 0.55 -> "50-60%")
        bucket_lower = math.floor(prob / bucket_size) * bucket_size
        bucket_key = f"{int(bucket_lower*100)}-{int((bucket_lower+bucket_size)*100)}%"
        
        if bucket_key not in buckets:
            buckets[bucket_key] = {
                "predicted_avg": 0.0,
                "actual_wins": 0,
                "total": 0,
                "sum_predicted": 0.0,
            }
        
        buckets[bucket_key]["total"] += 1
        buckets[bucket_key]["sum_predicted"] += prob
        if status == "won":
            buckets[bucket_key]["actual_wins"] += 1
    
    # Compute averages and calibration error
    total_abs_error = 0.0
    total_sq_error = 0.0
    total_bets = 0
    calibration_table = {}
    
    for key, data in sorted(buckets.items()):
        if data["total"] == 0:
            continue
        predicted_avg = data["sum_predicted"] / data["total"]
        actual_rate = data["actual_wins"] / data["total"]
        error = actual_rate - predicted_avg  # Positive = underestimating, Negative = overestimating
        
        calibration_table[key] = {
            "predicted_avg": round(predicted_avg, 4),
            "actual_win_rate": round(actual_rate, 4),
            "calibration_error": round(error, 4),
            "sample_size": data["total"],
            "wins": data["actual_wins"],
            "direction": "under-predicting" if error > 0.03 else ("over-predicting" if error < -0.03 else "well-calibrated"),
        }
        
        total_abs_error += abs(error) * data["total"]
        total_sq_error += error ** 2 * data["total"]
        total_bets += data["total"]
    
    # Overall calibration score (lower = better)
    mae = total_abs_error / total_bets if total_bets > 0 else 0
    rmse = math.sqrt(total_sq_error / total_bets) if total_bets > 0 else 0
    
    return {
        "buckets": calibration_table,
        "overall": {
            "total_bets": total_bets,
            "mean_absolute_error": round(mae, 4),
            "root_mean_squared_error": round(rmse, 4),
            "calibration_grade": _grade_calibration(mae),
        },
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


def _grade_calibration(mae: float) -> str:
    """Grade the calibration quality based on MAE."""
    if mae < 0.03:
        return "A (Excellent)"
    elif mae < 0.06:
        return "B (Good)"
    elif mae < 0.10:
        return "C (Fair)"
    elif mae < 0.15:
        return "D (Poor)"
    return "F (Unreliable)"


def save_calibration(date_str: str, calibration_data: dict):
    """Save calibration data to Firestore."""
    try:
        import firebase_admin
        from firebase_admin import firestore as fs
        db = fs.client()
        db.collection("calibration").document(date_str).set(calibration_data, merge=True)
        print(f"[Calibration] Saved calibration for {date_str}: {calibration_data['overall']['calibration_grade']}")
    except Exception as e:
        print(f"[Calibration] Error saving: {e}", file=sys.stderr)


def compute_rolling_calibration(days: int = 30) -> dict:
    """
    Compute calibration over the last N days of graded predictions.
    Provides a more stable view of model accuracy.
    """
    try:
        import firebase_admin
        from firebase_admin import firestore as fs
        from datetime import timedelta
        
        db = fs.client()
        all_predictions = []
        
        for i in range(days):
            date_str = (datetime.now(timezone.utc) - timedelta(days=i+1)).strftime("%Y-%m-%d")
            doc = db.collection("quant_predictions").document(date_str).get()
            if doc.exists:
                data = doc.to_dict()
                preds = data.get("predictions", [])
                all_predictions.extend([p for p in preds if p.get("status") in ("won", "lost")])
        
        if not all_predictions:
            return {"status": "no_data", "days_checked": days}
        
        result = compute_calibration(all_predictions)
        result["rolling_days"] = days
        result["sample_size"] = len(all_predictions)
        return result
        
    except Exception as e:
        print(f"[Calibration] Rolling calibration error: {e}", file=sys.stderr)
        return {"status": "error", "error": str(e)}


if __name__ == "__main__":
    # Demo with mock data
    mock_preds = [
        {"probability": 0.65, "status": "won"},
        {"probability": 0.62, "status": "won"},
        {"probability": 0.58, "status": "lost"},
        {"probability": 0.70, "status": "won"},
        {"probability": 0.55, "status": "lost"},
        {"probability": 0.72, "status": "won"},
        {"probability": 0.45, "status": "won"},
        {"probability": 0.48, "status": "lost"},
        {"probability": 0.80, "status": "won"},
        {"probability": 0.42, "status": "lost"},
    ]
    result = compute_calibration(mock_preds)
    import json
    print(json.dumps(result, indent=2))
