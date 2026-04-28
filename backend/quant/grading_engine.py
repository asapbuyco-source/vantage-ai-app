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
import json
import requests
from datetime import datetime, timezone, timedelta


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
    Fetch completed fixtures for a date, including closing odds for CLV tracking.
    Returns a map: fixture_id → {home_goals, away_goals, state, closing_odds}
    """
    result = _sm_get(
        f"/fixtures/date/{date_str}",
        {"include": "participants;scores;state;odds", "per_page": 200},
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

        # ── Parse closing odds for CLV tracking ───────────────────────────
        closing_odds = _parse_closing_odds(item.get("odds") or [])

        out[str(item["id"])] = {
            "home_goals": hg, "away_goals": ag, "state": state,
            "closing_odds": closing_odds,
        }
    return out


def _parse_closing_odds(odds_list: list) -> dict:
    """
    Parse closing odds from Sportmonks odds data.
    Returns a dict mapping market names to their closing decimal odds.
    These are the last odds available before the match started (closing line).
    """
    closing = {}
    if not odds_list:
        return closing

    raw_odds = odds_list if isinstance(odds_list, list) else (odds_list.get("data", []) if isinstance(odds_list, dict) else [])

    for odd in raw_odds:
        market_id = odd.get("market_id")
        label = str(odd.get("label") or "").lower()
        name = str(odd.get("name") or "").lower()
        price = float(odd.get("value") or 0.0)
        if price <= 1.0:
            continue

        # BUG-04: Collect ALL prices per market, then take MIN (sharpest closing line).
        # Previously used max() which inflated closing odds and biased CLV downward.
        # 1X2 Match Winner
        if market_id == 1:
            if "home" in label or "1" == label:
                closing["Home Win"] = min(closing.get("Home Win", 9999), price)
            elif "draw" in label or "x" == label:
                closing["Draw"] = min(closing.get("Draw", 9999), price)
            elif "away" in label or "2" == label:
                closing["Away Win"] = min(closing.get("Away Win", 9999), price)
        # Over/Under Goals
        elif market_id == 80:
            total = str(odd.get("total") or "")
            is_over = "over" in label or "over" in name
            is_under = "under" in label or "under" in name
            if "1.5" in total:
                if is_over: closing["Over 1.5 Goals"] = min(closing.get("Over 1.5 Goals", 9999), price)
                elif is_under: closing["Under 1.5 Goals"] = min(closing.get("Under 1.5 Goals", 9999), price)
            elif "2.5" in total:
                if is_over: closing["Over 2.5 Goals"] = min(closing.get("Over 2.5 Goals", 9999), price)
                elif is_under: closing["Under 2.5 Goals"] = min(closing.get("Under 2.5 Goals", 9999), price)
            elif "3.5" in total:
                if is_over: closing["Over 3.5 Goals"] = min(closing.get("Over 3.5 Goals", 9999), price)
                elif is_under: closing["Under 3.5 Goals"] = min(closing.get("Under 3.5 Goals", 9999), price)
        # BTTS
        elif market_id == 14:
            if "yes" in label or "yes" in name:
                closing["BTTS"] = min(closing.get("BTTS", 9999), price)
            elif "no" in label or "no" in name:
                closing["BTTS No"] = min(closing.get("BTTS No", 9999), price)

    # Clean up sentinel values (9999 means no odds were found)
    closing = {k: v for k, v in closing.items() if v < 9000}
    return closing


def _compute_clv(pick_odds: float, closing_odds: float) -> float:
    """
    Compute Closing Line Value.

    CLV = (implied_prob_closing - implied_prob_pick) / implied_prob_pick

    Positive CLV → you got better odds than the closing line → edge confirmed.
    Negative CLV → the line moved against you → no proven edge on this bet.

    Example: Pick at 1.85 (54.05%), closing at 1.75 (57.14%)
      CLV = (57.14% - 54.05%) / 54.05% = +5.7%  → the market agreed with you.
    """
    if pick_odds <= 1.0 or closing_odds <= 1.0:
        return 0.0
    pick_implied = 1.0 / pick_odds
    closing_implied = 1.0 / closing_odds
    if pick_implied <= 0:
        return 0.0
    return round((closing_implied - pick_implied) / pick_implied, 4)


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


def _chatgpt_grade_fallback(pending_preds: list, date_str: str) -> dict:
    """Uses OpenAI API to find results for matches that Sportmonks missed and grades them."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("[Grading/ChatGPT] No OPENAI_API_KEY found. Skipping fallback.", file=sys.stderr)
        return {}
    
    import json
    
    missing_list = []
    for p in pending_preds:
        missing_list.append({
            "id": str(p.get("fixture_id", "")),
            "home": p.get("home_team", ""),
            "away": p.get("away_team", ""),
            "prediction": p.get("bet_type", "")
        })
    
    if not missing_list:
        return {}
        
    prompt = f"""
Find the FINAL full-time scores for these football matches played on {date_str}.
Grade the predictions based on the final scores.
MATCHES:
{json.dumps(missing_list, indent=2)}

GRADING RULES:
- Use FULL-TIME (90 min + stoppage) scores only.
- If match was postponed/cancelled/no result -> status: "void".
- RESULT: "Home Win" -> home > away. "Away Win" -> away > home. "Draw" -> equal.
- DOUBLE CHANCE (1X) -> won if home wins OR draw.
- DOUBLE CHANCE (X2) -> won if away wins OR draw.
- DOUBLE CHANCE (12) -> won if home OR away wins (not draw).
- OVER 1.5 -> total > 1. OVER 2.5 -> total > 2. UNDER 2.5 -> total < 3. OVER 3.5 -> total > 3. UNDER 3.5 -> total < 4.
- BTTS -> home > 0 AND away > 0. BTTS No -> home == 0 OR away == 0.
- DRAW NO BET (Home) -> won if home wins; void if draw; lost if away wins.
- DRAW NO BET (Away) -> won if away wins; void if draw; lost if home wins.

Return ONLY a valid JSON array. Each object: {{ "id": string, "score": "H-A" (or "?" if unknown), "status": "won"|"lost"|"void" }}.
Do NOT skip any match.
"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You are a precise sports data assistant with access to recent match results."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1
    }
    
    try:
        r = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=45)
        r.raise_for_status()
        res_json = r.json()
        content = res_json['choices'][0]['message']['content']
        content = content.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(content)
        
        fallback_map = {}
        for item in parsed:
            fallback_map[str(item.get("id"))] = {
                "status": item.get("status", "void"),
                "score": item.get("score", "?")
            }
        return fallback_map
    except Exception as e:
        print(f"[Grading/ChatGPT] Failed to fetch grades from ChatGPT: {e}", file=sys.stderr)
        return {}


def grade_predictions(date_str: str, force_regrade: bool = False) -> dict:
    """
    Grade all quant predictions for a given date.
    Also fetches closing odds and computes CLV for each prediction.
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

    print(f"[Grading] Fetching results + closing odds for {date_str}...")
    results_map = _fetch_results_for_date(date_str)
    print(f"[Grading] Found {len(results_map)} finished fixtures from Sportmonks.")

    graded_count = 0
    clv_sum = 0.0
    clv_count = 0
    
    pending_preds = []

    for pred in predictions:
        fid = str(pred.get("fixture_id", ""))
        result = results_map.get(fid)
        if not result:
            pending_preds.append((fid, pred))
            continue  # Will be handled by fallback

        hg = result["home_goals"]
        ag = result["away_goals"]
        market = pred.get("bet_type", "")

        pred["status"] = _grade_bet(market, hg, ag)
        pred["score"] = f"{hg}-{ag}"
        pred["graded_at"] = datetime.now(timezone.utc).isoformat()

        # ── CLV Tracking ──────────────────────────────────────────────────
        closing_odds_map = result.get("closing_odds", {})
        closing_odd = closing_odds_map.get(market, 0.0)
        pick_odd = float(pred.get("pick_time_odds", 0) or pred.get("odds", 0) or 0)

        if closing_odd > 1.0 and pick_odd > 1.0:
            clv = _compute_clv(pick_odd, closing_odd)
            pred["closing_odds"] = closing_odd
            pred["clv"] = clv
            clv_sum += clv
            clv_count += 1
            direction = "+" if clv >= 0 else ""
            print(f"[Grading]   CLV {pred.get('home_team','?')} vs {pred.get('away_team','?')}: "
                  f"pick {pick_odd} -> close {closing_odd} = {direction}{clv:.2%}")

        graded_count += 1

    # ── ChatGPT Fallback for Missing Results ──────────────────────────
    if pending_preds:
        print(f"[Grading] {len(pending_preds)} matches not found on Sportmonks. Attempting ChatGPT fallback...")
        fallback_results = _chatgpt_grade_fallback([p for _, p in pending_preds], date_str)
        if fallback_results:
            for fid, pred in pending_preds:
                fb = fallback_results.get(fid)
                if fb:
                    pred["status"] = fb["status"]
                    pred["score"] = fb["score"]
                    pred["graded_at"] = datetime.now(timezone.utc).isoformat()
                    pred["graded_by"] = "chatgpt"
                    graded_count += 1
                    print(f"[Grading/ChatGPT] Graded {pred.get('home_team')} vs {pred.get('away_team')} -> {fb['status']} ({fb['score']})")

    avg_clv = round(clv_sum / clv_count, 4) if clv_count > 0 else None

    doc_ref.set({
        "predictions": predictions,
        "graded_at": datetime.now(timezone.utc).isoformat(),
        "graded_count": graded_count,
        "avg_clv": avg_clv,
        "clv_sample_size": clv_count,
    }, merge=True)

    # Wire calibration into grading
    try:
        from calibration import compute_calibration, save_calibration
        cal_data = compute_calibration(predictions)
        save_calibration(date_str, cal_data)
    except Exception as e:
        print(f"[Grading] Calibration failed (non-fatal): {e}", file=sys.stderr)

    clv_str = f" | Avg CLV: {avg_clv:+.2%} ({clv_count} bets)" if avg_clv is not None else ""
    print(f"[Grading] Graded {graded_count}/{len(predictions)} predictions for {date_str}.{clv_str}")
    return {"status": "success", "total": len(predictions), "graded": graded_count,
            "date": date_str, "avg_clv": avg_clv, "clv_sample_size": clv_count}


if __name__ == "__main__":
    date = sys.argv[1] if len(sys.argv) > 1 else None
    if not date:
        yesterday = (datetime.now(timezone(timedelta(hours=1))) - timedelta(days=1)).strftime("%Y-%m-%d")
        date = yesterday
    try:
        result = grade_predictions(date)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))
        sys.exit(1)
