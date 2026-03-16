"""
grading_engine.py
─────────────────
Grades quant predictions stored in Firestore.
Fetches final results from Sportmonks and updates each prediction with:
  status: "won" | "lost" | "void"
  score: "2-1"
"""

import os
import sys
import requests
from datetime import datetime, timezone


# ── Sportmonks helper ─────────────────────────────────────────────────────────
SM_TOKEN = os.environ.get("SPORTMONKS_API_TOKEN") or os.environ.get("VITE_SPORTMONKS_API_TOKEN", "")
SM_BASE = "https://api.sportmonks.com/v3/football"

FINISHED_STATES = {"FT", "AET", "PEN", "FINS"}
VOIDED_STATES = {"CANCL", "POSTP", "INT", "ABANDONED", "TBA", "NS"}


def _sm_get(path: str, params: dict | None = None) -> dict | None:
    if not SM_TOKEN:
        return None
    p = {"api_token": SM_TOKEN}
    if params:
        p.update(params)
    try:
        r = requests.get(f"{SM_BASE}{path}", params=p, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[Grading] API error on {path}: {e}", file=sys.stderr)
        return None


def _fetch_results_for_date(date_str: str) -> dict[str, dict]:
    """
    Fetch completed fixtures for a date.
    Returns a map: fixture_id → {home_goals, away_goals, state}
    """
    result = _sm_get(
        f"/fixtures/date/{date_str}",
        {"include": "participants;scores;state", "per_page": 200},
    )
    data = result.get("data", []) if result else []
    out = {}
    for item in data:
        state = item.get("state", {}).get("state", "") or item.get("state", {}).get("short_name", "")
        if state not in FINISHED_STATES:
            # Try state name as fallback
            state_name = item.get("state", {}).get("name", "").upper()
            if "FINISH" not in state_name and "FULL" not in state_name:
                continue
        participants = item.get("participants", [])
        home_p = next((p for p in participants if p.get("meta", {}).get("location") == "home"), None)
        away_p = next((p for p in participants if p.get("meta", {}).get("location") == "away"), None)
        if not home_p or not away_p:
            continue
        scores = item.get("scores", [])
        hg = next((s["score"]["goals"] for s in scores
                   if s.get("participant_id") == home_p["id"] and s.get("description") == "CURRENT"), None)
        ag = next((s["score"]["goals"] for s in scores
                   if s.get("participant_id") == away_p["id"] and s.get("description") == "CURRENT"), None)
        if hg is None or ag is None:
            continue
        out[str(item["id"])] = {"home_goals": hg, "away_goals": ag, "state": state}
    return out


def _grade_bet(market: str, home_goals: int, away_goals: int) -> str:
    """Return 'won', 'lost', or 'void' for a specific bet given the result."""
    total = home_goals + away_goals
    m = market.lower()

    if "home win" in m and "draw no bet" not in m and "double" not in m:
        return "won" if home_goals > away_goals else "lost"
    if "away win" in m and "draw no bet" not in m and "double" not in m:
        return "won" if away_goals > home_goals else "lost"
    if m == "draw":
        return "won" if home_goals == away_goals else "lost"
    if "double chance (1x)" in m:
        return "won" if home_goals >= away_goals else "lost"
    if "double chance (x2)" in m:
        return "won" if away_goals >= home_goals else "lost"
    if "double chance (12)" in m:
        return "won" if home_goals != away_goals else "lost"
    if "draw no bet (home)" in m:
        if home_goals == away_goals: return "void"
        return "won" if home_goals > away_goals else "lost"
    if "draw no bet (away)" in m:
        if home_goals == away_goals: return "void"
        return "won" if away_goals > home_goals else "lost"
    if "over 1.5" in m:
        return "won" if total > 1 else "lost"
    if "over 2.5" in m:
        return "won" if total > 2 else "lost"
    if "under 2.5" in m:
        return "won" if total < 3 else "lost"
    if "over 3.5" in m:
        return "won" if total > 3 else "lost"
    if "under 3.5" in m:
        return "won" if total < 4 else "lost"
    if "btts" in m and "no" not in m:
        return "won" if home_goals > 0 and away_goals > 0 else "lost"
    if "btts no" in m or ("btts" in m and "no" in m):
        return "won" if home_goals == 0 or away_goals == 0 else "lost"

    return "void"  # Unknown market


def grade_predictions(date_str: str, force_regrade: bool = False) -> dict:
    """
    Grade all quant predictions for a given date.
    Reads from and writes to Firestore collection `quant_predictions/{date_str}`.
    """
    try:
        import firebase_admin
        from firebase_admin import firestore as fs, credentials

        # Initialize if not already done
        if not firebase_admin._apps:
            sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
            if sa_json:
                import json
                cred = credentials.Certificate(json.loads(sa_json))
            else:
                # Fallback: try Application Default Credentials
                cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)

        db = fs.client()
    except Exception as e:
        print(f"[Grading] Firestore unavailable: {e}", file=sys.stderr)
        return {"status": "error", "error": str(e)}


    doc_ref = db.collection("quant_predictions").document(date_str)
    doc = doc_ref.get()
    if not doc.exists:
        return {"status": "skipped", "reason": "no_document", "date": date_str}

    data = doc.to_dict()
    predictions = data.get("predictions", [])
    if not predictions:
        return {"status": "skipped", "reason": "no_predictions", "date": date_str}

    # If not force regrade, skip already graded
    to_grade = predictions if force_regrade else [p for p in predictions if p.get("status") == "pending"]
    if not to_grade:
        return {"status": "skipped", "reason": "already_graded", "date": date_str}

    print(f"[Grading] Fetching results for {date_str}...")
    results_map = _fetch_results_for_date(date_str)
    print(f"[Grading] Found {len(results_map)} finished fixtures from Sportmonks.")

    graded_count = 0
    for pred in predictions:
        fid = str(pred.get("fixture_id", ""))
        result = results_map.get(fid)
        if not result:
            continue  # Still pending or not found

        hg = result["home_goals"]
        ag = result["away_goals"]
        market = pred.get("bet_type", "")

        pred["status"] = _grade_bet(market, hg, ag)
        pred["score"] = f"{hg}-{ag}"
        pred["graded_at"] = datetime.now(timezone.utc).isoformat()
        graded_count += 1

    doc_ref.set({
        "predictions": predictions,
        "graded_at": datetime.now(timezone.utc).isoformat(),
        "graded_count": graded_count,
    }, merge=True)

    print(f"[Grading] ✅ Graded {graded_count}/{len(predictions)} predictions for {date_str}.")
    return {"status": "success", "total": len(predictions), "graded": graded_count, "date": date_str}


if __name__ == "__main__":
    date = sys.argv[1] if len(sys.argv) > 1 else None
    if not date:
        from datetime import timedelta
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
        date = yesterday
    result = grade_predictions(date)
    print(result)
