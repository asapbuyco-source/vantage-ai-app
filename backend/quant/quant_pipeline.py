"""
quant_pipeline.py
─────────────────
Main orchestrator for the quantitative football betting pipeline.

Daily workflow:
  1. Fetch upcoming fixtures (50+ from approved leagues)
  2. Build team statistics via data_pipeline
  3. Run Poisson model
  4. Run Elo model
  5. Run Form model
  6. Combine models (60/30/10)
  7. Evaluate all markets for EV
  8. Apply risk filters
  9. Calculate Kelly stakes
  10. Generate accumulators
  11. Save to Firestore quant_predictions/{dateKey}
  12. Compute performance metrics

Usage:
  python quant_pipeline.py              # Run for today
  python quant_pipeline.py 2025-03-14  # Run for specific date
  python quant_pipeline.py --dry-run   # Mock data, no API calls
"""

import os
import sys
import json
import math
from datetime import datetime, timezone

# ── Local imports ─────────────────────────────────────────────────────────────
from data_pipeline import fetch_matches, MatchData
from poisson_model import compute_probabilities
from elo_rating import load_ratings_from_firestore, match_probabilities as elo_probs, save_dirty_ratings
from form_model import compute_form_probabilities
from probability_engine import compute_combined, CombinedProbabilities
from ev_engine import evaluate_all_markets, get_best_value_bet
from risk_filters import filter_bets, grade_risk
from kelly_optimizer import kelly_stake_pct
from accumulator_engine import generate_accumulators, accumulator_to_dict

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_PREDICTIONS_PER_DAY = 50


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_firestore():
    try:
        import firebase_admin
        from firebase_admin import firestore as fs
        return fs.client()
    except Exception as e:
        print(f"[QuantPipeline] Firestore unavailable: {e}", file=sys.stderr)
        return None


def _init_firebase():
    """Initialize firebase_admin if not already initialized."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        if not firebase_admin._apps:
            service_account_raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
            if service_account_raw:
                import json as _json
                sa = _json.loads(service_account_raw)
                cred = credentials.Certificate(sa)
            else:
                cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
        return True
    except Exception as e:
        print(f"[QuantPipeline] Firebase init error: {e}", file=sys.stderr)
        return False


# ── Mock data for dry-run ─────────────────────────────────────────────────────
def _mock_matches() -> list[MatchData]:
    from data_pipeline import MatchData, TeamStats, OddsData
    matches = []
    fixtures = [
        ("Arsenal", "Everton", 8, "English Premier League", 1.65, 3.60, 5.50, 1.90, 1.95, 1.85, 1.95),
        ("Real Madrid", "Getafe", 564, "La Liga", 1.45, 4.20, 7.50, 1.75, 2.10, 1.75, 2.00),
        ("Bayern", "Dortmund", 82, "Bundesliga", 1.70, 3.50, 5.00, 1.80, 2.00, 1.65, 2.15),
        ("PSG", "Lyon", 301, "Ligue 1", 1.50, 4.00, 6.50, 1.70, 2.20, 1.75, 2.05),
        ("Juventus", "Roma", 384, "Serie A", 1.85, 3.50, 4.50, 1.90, 1.95, 1.80, 2.00),
    ]
    for i, (home, away, lid, league, ho, do, ao, ov25o, un25o, bttsy, bttsn) in enumerate(fixtures):
        home_stats = TeamStats(team_id=100+i, team_name=home,
                               avg_scored=1.7, avg_conceded=0.9,
                               home_avg_scored=2.0, home_avg_conceded=0.8,
                               away_avg_scored=1.4, away_avg_conceded=1.1,
                               form="W W W D W", form_score=0.80, win_rate=0.70)
        away_stats = TeamStats(team_id=200+i, team_name=away,
                               avg_scored=1.1, avg_conceded=1.4,
                               home_avg_scored=1.3, home_avg_conceded=1.1,
                               away_avg_scored=0.9, away_avg_conceded=1.7,
                               form="L D L W D", form_score=0.45, win_rate=0.30)
        od = OddsData(home_odds=ho, draw_odds=do, away_odds=ao,
                      over25_odds=ov25o, under25_odds=un25o,
                      btts_yes_odds=bttsy, btts_no_odds=bttsn)
        m = MatchData(
            fixture_id=str(5000+i), league=league, league_id=lid, league_tier=1,
            home_team=home, home_team_id=100+i,
            away_team=away, away_team_id=200+i,
            kickoff_utc="2025-03-14T18:00:00Z", kickoff_local="19:00",
            home_stats=home_stats, away_stats=away_stats, odds=od,
            expected_goals_home=1.80, expected_goals_away=0.90,
        )
        matches.append(m)
    return matches


# ── Core pipeline ─────────────────────────────────────────────────────────────
def run_pipeline(date_str: str | None = None, dry_run: bool = False) -> dict:
    """
    Run the full quantitative pipeline for the given date.
    Returns a summary dict with status, generated count, and predictions.
    """
    if date_str is None:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    print(f"[QuantPipeline] 🚀 Starting quant pipeline for {date_str} (dry_run={dry_run})")

    # ── Step 0: Initialize Firebase ────────────────────────────────────────
    if not dry_run:
        _init_firebase()
        load_ratings_from_firestore()

    # ── Step 1: Fetch matches ──────────────────────────────────────────────
    if dry_run:
        matches = _mock_matches()
        print(f"[QuantPipeline] [DRY RUN] Using {len(matches)} mock matches.")
    else:
        matches = fetch_matches(date_str)

    if not matches:
        print("[QuantPipeline] No matches found. Exiting.")
        return {"status": "skipped", "reason": "no_matches", "date": date_str}

    print(f"[QuantPipeline] Processing {len(matches)} matches...")

    # ── Steps 2–9: Model pipeline per match ───────────────────────────────
    predictions: list[dict] = []
    bet_pool: list[dict] = []  # For accumulator input

    for match in matches[:MAX_PREDICTIONS_PER_DAY]:
        try:
            mu_home = match.expected_goals_home
            mu_away = match.expected_goals_away
            home_form = match.home_stats.form if match.home_stats else "N/A"
            away_form = match.away_stats.form if match.away_stats else "N/A"
            home_id = match.home_team_id
            away_id = match.away_team_id

            # Combine models (Poisson + Elo + Form + H2H)
            probs: CombinedProbabilities = compute_combined(
                mu_home, mu_away, home_id, away_id, home_form, away_form,
                h2h_home_wins=match.h2h_home_wins,   # Fix #5: H2H now wired
                h2h_away_wins=match.h2h_away_wins,
                h2h_draws=match.h2h_draws,
            )

            # Evaluate all markets for EV
            all_value_bets = evaluate_all_markets(probs, match.odds)

            # Apply risk filters to find approved bets
            approved_bets = filter_bets(all_value_bets, league_tier=match.league_tier)

            if not approved_bets:
                print(f"[QuantPipeline]   ✗ {match.home_team} vs {match.away_team}: No value bets passed filters.")
                continue

            # Take the best bet
            best_bet = approved_bets[0]

            # Kelly stake
            kelly = kelly_stake_pct(best_bet.model_prob, best_bet.odds)

            # Risk category
            category = grade_risk(best_bet)

            pred = {
                "fixture_id": match.fixture_id,
                "league": match.league,
                "league_id": match.league_id,
                "home_team": match.home_team,
                "away_team": match.away_team,
                "home_team_logo": match.home_logo,
                "away_team_logo": match.away_logo,
                "kickoff_utc": match.kickoff_utc,
                "kickoff_local": match.kickoff_local,
                "bet_type": best_bet.market,
                "prediction": best_bet.market,       # Alias for frontend compat
                "probability": round(best_bet.model_prob, 4),
                "confidence": round(best_bet.model_prob * 100, 1),  # % for frontend
                "odds": best_bet.odds,
                # Fix #9: Store odds at pick-time for CLV calculation after match closes
                "pick_time_odds": best_bet.odds,
                "clv_tracked": True,  # Flag for performance_tracker to diff vs closing line
                "expected_value": best_bet.expected_value,
                "ev_pct": round(best_bet.expected_value * 100, 2),  # % display
                "market_implied_prob": best_bet.market_prob,
                "inefficiency": best_bet.inefficiency,
                "kelly_stake": kelly,                # % to stake
                "expected_goals_home": round(mu_home, 2),
                "expected_goals_away": round(mu_away, 2),
                "home_form": home_form,
                "away_form": away_form,
                "h2h_home_wins": match.h2h_home_wins,
                "h2h_away_wins": match.h2h_away_wins,
                "h2h_draws": match.h2h_draws,
                "home_win_prob": round(probs.home_win, 4),
                "draw_prob": round(probs.draw, 4),
                "away_win_prob": round(probs.away_win, 4),
                "over25_prob": round(probs.over25, 4),
                "btts_prob": round(probs.btts, 4),
                "model_confidence": round(probs.confidence_score, 4),
                "category": category,
                "status": "pending",
                "score": None,
                "sport": "football",
                "model": "quant",
                "generated_by": "quant_pipeline",
                "timestamp": _now_iso(),
                # All approved bets for this match (metadata)
                "all_value_bets": [
                    {"market": b.market, "prob": b.model_prob, "odds": b.odds, "ev": b.expected_value}
                    for b in approved_bets[:3]
                ],
            }
            predictions.append(pred)

            # Add to accumulator pool
            bet_pool.append({
                "fixture_id": match.fixture_id,
                "home_team": match.home_team,
                "away_team": match.away_team,
                "market": best_bet.market,
                "odds": best_bet.odds,
                "model_prob": best_bet.model_prob,
                "expected_value": best_bet.expected_value,
            })

            print(f"[QuantPipeline]   ✅ {match.home_team} vs {match.away_team}: {best_bet.market} | EV {best_bet.expected_value:.1%} | Odds {best_bet.odds} | Kelly {kelly}%")

        except Exception as e:
            print(f"[QuantPipeline]   ⚠️  Error processing {match.home_team} vs {match.away_team}: {e}", file=sys.stderr)
            continue

    if not predictions:
        print("[QuantPipeline] No bets passed filters today.")
        return {"status": "skipped", "reason": "no_value_bets", "date": date_str, "matches_analyzed": len(matches)}

    # ── Step 10: Generate accumulators ─────────────────────────────────────
    accas = generate_accumulators(bet_pool)
    accas_dict = {tier: (accumulator_to_dict(a) if a else None) for tier, a in accas.items()}

    safe_count = sum(1 for v in accas.values() if v is not None)
    print(f"[QuantPipeline] 🎰 Generated {safe_count}/3 accumulators.")

    # ── Step 11: Save to Firestore ─────────────────────────────────────────
    doc = {
        "date": date_str,
        "status": "completed",
        "predictions": predictions,
        "accumulators": accas_dict,
        "matches_analyzed": len(matches),
        "value_bets_found": len(predictions),
        "generated_at": _now_iso(),
        "generated_by": "quant_pipeline",
    }

    if not dry_run:
        db = _get_firestore()
        if db:
            db.collection("quant_predictions").document(date_str).set(doc)
            print(f"[QuantPipeline] 💾 Saved to Firestore quant_predictions/{date_str}")
            # Update Elo ratings
            save_dirty_ratings()
        else:
            print("[QuantPipeline] ⚠️  Firestore unavailable — skipping save.", file=sys.stderr)
    else:
        print("[QuantPipeline] [DRY RUN] Firestore write skipped.")

    print(f"\n[QuantPipeline] ✅ Pipeline complete!")
    print(f"  Matches analyzed: {len(matches)}")
    print(f"  Value bets identified: {len(predictions)}")
    if accas.get("safe"):
        print(f"  Safe acca: {accas['safe'].combined_odds:.2f}x ({accas['safe'].leg_count} legs)")

    return {
        "status": "success",
        "date": date_str,
        "generated": len(predictions),
        "matches_analyzed": len(matches),
        "predictions": predictions,
        "accumulators": accas_dict,
    }


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    date_arg = next((a for a in sys.argv[1:] if not a.startswith("--")), None)

    result = run_pipeline(date_arg, dry_run=dry_run)

    if result["status"] == "success":
        print(f"\n{'='*60}")
        print(f"OUTPUT SUMMARY ({result['date']})")
        print(f"{'='*60}")
        print(f"Matches analyzed: {result['matches_analyzed']}")
        print(f"Value bets found: {result['generated']}")
        print(f"\nPREDICTIONS:")
        for p in result["predictions"]:
            print(f"  {p['home_team']} vs {p['away_team']}")
            print(f"    Bet: {p['bet_type']}")
            print(f"    Prob: {p['confidence']}% | Odds: {p['odds']} | EV: +{p['ev_pct']}% | Kelly: {p['kelly_stake']}%")
    else:
        print(f"\n[STATUS] {result['status']}: {result.get('reason', '')}")
