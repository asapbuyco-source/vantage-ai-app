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
from data_pipeline import fetch_matches, MatchData, TeamStats
from poisson_model import compute_probabilities, compute_dynamic_rho
from elo_rating import load_ratings_from_firestore, match_probabilities as elo_probs, save_dirty_ratings, get_team_rating, is_derby_match
from form_model import compute_form_probabilities
from probability_engine import compute_combined, CombinedProbabilities
from ev_engine import evaluate_all_markets, get_best_value_bet
from risk_filters import filter_bets, grade_risk, check_odds_staleness
from kelly_optimizer import kelly_stake_pct
from accumulator_engine import generate_accumulators, accumulator_to_dict

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_PREDICTIONS_PER_DAY = 100


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_print(text: str, file=sys.stdout):
    """Safely print text that may contain emojis on Windows CMD/PowerShell."""
    try:
        print(text, file=file)
    except UnicodeEncodeError:
        print(text.encode('ascii', 'replace').decode('ascii'), file=file)


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
                      dc_1x_odds=1.20, dc_x2_odds=1.35, dc_12_odds=1.15,
                      over15_odds=1.25, under15_odds=3.00,
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

    _safe_print(f"[QuantPipeline] 🚀 Starting quant pipeline for {date_str} (dry_run={dry_run})")

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
    # MATCH ANALYSIS PLATFORM: Analyze ALL matches, never discard.
    # Filtering is ONLY applied when building accumulators.
    predictions: list[dict] = []
    bet_pool: list[dict] = []  # Only value bets go here (for accumulators)

    for match in matches[:MAX_PREDICTIONS_PER_DAY]:
        try:
            mu_home = match.expected_goals_home
            mu_away = match.expected_goals_away
            home_id = match.home_team_id
            away_id = match.away_team_id
            
            home_stats = match.home_stats if match.home_stats else TeamStats(team_id=home_id, team_name=match.home_team)
            away_stats = match.away_stats if match.away_stats else TeamStats(team_id=away_id, team_name=match.away_team)
            
            home_form_str = home_stats.form
            away_form_str = away_stats.form

            # ── Extract opponent strengths for form model ───────────────────
            home_opp_strengths = []
            away_opp_strengths = []
            if match.home_stats and hasattr(match.home_stats, 'recent_opponents'):
                home_opp_strengths = [get_team_rating(opp_id) / 1500 for opp_id in match.home_stats.recent_opponents[:5]]
            if match.away_stats and hasattr(match.away_stats, 'recent_opponents'):
                away_opp_strengths = [get_team_rating(opp_id) / 1500 for opp_id in match.away_stats.recent_opponents[:5]]

            # ── Dynamic Dixon-Coles rho (BUG-01 fixed) ─────────────────────
            # BUG-01: was `str(id) in str(id)` which was always True for any ID
            # containing a digit that appeared in another. Now uses frozenset lookup.
            is_derby = is_derby_match(match.home_team_id, match.away_team_id)
            rho = compute_dynamic_rho(mu_home, mu_away, match.league_tier, is_derby)

            # Combine models (Poisson + Elo + Form + H2H)
            probs: CombinedProbabilities = compute_combined(
                mu_home, mu_away, home_id, away_id, home_stats, away_stats,
                home_opp_strengths=home_opp_strengths,
                away_opp_strengths=away_opp_strengths,
                h2h_home_wins=match.h2h_home_wins,
                h2h_away_wins=match.h2h_away_wins,
                h2h_draws=match.h2h_draws,
                rho=rho,
            )

            # ── Evaluate ALL markets for this match (FIX: was undefined) ────
            all_value_bets = evaluate_all_markets(probs, match.odds)

            # ── Apply risk filters to find approved value bets ──────────────
            approved_bets = filter_bets(all_value_bets, match.league_tier)

            # ── Determine best bet & category ───────────────────────────────
            # Match Analysis Platform: NEVER skip a match. Always pick the
            # best available angle even if it has no edge.
            if approved_bets:
                best_bet = approved_bets[0]
                category = grade_risk(best_bet)
                value_rank = "high" if category == "safe" else "medium"
            elif all_value_bets:
                # No approved bet, but markets exist — pick the best lean
                all_value_bets.sort(key=lambda b: b.expected_value * 0.5 + b.model_prob * 0.5, reverse=True)
                best_bet = all_value_bets[0]
                # Check if it has positive EV but just failed a minor filter
                if best_bet.expected_value > 0:
                    category = "lean"
                    value_rank = "low"
                else:
                    category = "no_edge"
                    value_rank = "none"
            else:
                # No odds/markets at all — still keep the match for the dashboard
                _safe_print(f"[QuantPipeline]   ⚪ {match.home_team} vs {match.away_team}: No odds available, providing probability lean.")
                
                from ev_engine import ValueBet
                candidate_markets = [
                    ("Home Win", probs.home_win),
                    ("Away Win", probs.away_win),
                    ("Draw", probs.draw),
                    ("Over 2.5 Goals", probs.over25),
                    ("Under 2.5 Goals", probs.under25),
                    ("BTTS", probs.btts),
                    ("Double Chance (1X)", probs.double_chance_1x),
                    ("Double Chance (X2)", probs.double_chance_x2),
                ]
                lean_market, lean_prob = max(candidate_markets, key=lambda x: x[1])
                
                best_bet = ValueBet(
                    market=lean_market,
                    bet_label=lean_market,
                    model_prob=lean_prob,
                    market_prob=1.0,
                    odds=0.0,
                    expected_value=0.0,
                    inefficiency=0.0,
                    is_value=False
                )
                category = "lean"
                value_rank = "none"

            # ── Conditional Safety Downgrade for Predictions (Risk Mitigation) ──
            if best_bet:
                dynamic_draw_safe = "Double Chance (1X)" if probs.home_win >= probs.away_win else "Double Chance (X2)"
                
                SAFETY_DOWNGRADES = {
                    "Over 2.5 Goals": "Over 1.5 Goals",
                    "Over 3.5 Goals": "Over 2.5 Goals",
                    "Home Win": "Double Chance (1X)",
                    "Away Win": "Double Chance (X2)",
                    "BTTS": "Over 1.5 Goals",
                    "Draw": dynamic_draw_safe
                }
                
                if best_bet.market in SAFETY_DOWNGRADES:
                    # MODEL-05 fix: Require BOTH probability AND agreement to be low
                    # before downgrading result markets in Tier 1/2 leagues.
                    # Previously fired on ANY single condition, over-downgrading EPL/La Liga picks.
                    is_risky_prob = best_bet.model_prob < 0.62
                    is_low_agreement = probs.confidence_score < 0.60
                    is_volatile_league = match.league_tier >= 3

                    # Downgrade if: (both prob low AND agreement low) OR volatile league
                    should_downgrade = (is_risky_prob and is_low_agreement) or is_volatile_league

                    if should_downgrade:
                        safe_target = SAFETY_DOWNGRADES[best_bet.market]
                        safe_bet = next((b for b in all_value_bets if b.market == safe_target), None)
                        if safe_bet:
                            reasons = []
                            if is_risky_prob: reasons.append(f"Prob {best_bet.model_prob:.0%}")
                            if is_low_agreement: reasons.append(f"Agreement {probs.confidence_score:.2f}")
                            if is_volatile_league: reasons.append(f"Tier {match.league_tier}")
                            reason_str = " & ".join(reasons)
                            _safe_print(f"[QuantPipeline]   🛡️ Safety Downgrade [{reason_str}]: {best_bet.market} -> {safe_target}")
                            best_bet = safe_bet

            # ── Odds Staleness Guard ────────────────────────────────────────
            staleness_mult = check_odds_staleness(match.odds.odds_fetched_at) if match.odds else 1.0

            # ── Kelly stake (ISSUE-01 fixed) ────────────────────────────────
            if best_bet:
                # Kelly already applies kelly_fraction=0.25 internally in kelly_stake_pct().
                # Don't apply it again here.
                base_kelly = kelly_stake_pct(best_bet.model_prob, best_bet.odds)
                kelly = round(max(0, base_kelly * staleness_mult), 2)
            else:
                kelly = 0.0

            # ── Build prediction dict with RICH match stats ─────────────────
            pred = {
                "fixture_id": match.fixture_id,
                "league": match.league,
                "league_id": match.league_id,
                "league_tier": match.league_tier,
                "home_team": match.home_team,
                "away_team": match.away_team,
                "home_team_logo": match.home_logo,
                "away_team_logo": match.away_logo,
                "kickoff_utc": match.kickoff_utc,
                "kickoff_local": match.kickoff_local,
                # ── Best bet for this match ─────────────────────────────────
                "bet_type": best_bet.market if best_bet else "N/A",
                "prediction": best_bet.market if best_bet else "N/A",
                "probability": round(best_bet.model_prob, 4) if best_bet else 0,
                "confidence": round(best_bet.model_prob * 100, 1) if best_bet else 0,
                "odds": best_bet.odds if best_bet else 0,
                "pick_time_odds": best_bet.odds if best_bet else 0,
                "clv_tracked": True,
                "expected_value": best_bet.expected_value if best_bet else 0,
                "ev_pct": round(best_bet.expected_value * 100, 2) if best_bet else 0,
                "market_implied_prob": best_bet.market_prob if best_bet else 0,
                "inefficiency": best_bet.inefficiency if best_bet else 0,
                "kelly_stake": kelly,
                # OPP-03: Flag high-value away wins as potential upsets
                "upset_alert": best_bet is not None and best_bet.market == "Away Win" and best_bet.expected_value >= 0.05,
                # ── Match analysis data (rich stats for cards) ──────────────
                "expected_goals_home": round(mu_home, 2),
                "expected_goals_away": round(mu_away, 2),
                "home_form": home_form_str,
                "away_form": away_form_str,
                "home_win_rate": round(home_stats.win_rate * 100, 1),
                "away_win_rate": round(away_stats.win_rate * 100, 1),
                "home_avg_scored": round(home_stats.avg_scored, 2),
                "away_avg_scored": round(away_stats.avg_scored, 2),
                "home_avg_conceded": round(home_stats.avg_conceded, 2),
                "away_avg_conceded": round(away_stats.avg_conceded, 2),
                "home_clean_sheet_rate": round(home_stats.clean_sheet_rate * 100, 1),
                "away_clean_sheet_rate": round(away_stats.clean_sheet_rate * 100, 1),
                "home_xg_avg": round(home_stats.avg_xg_created, 2),
                "away_xg_avg": round(away_stats.avg_xg_created, 2),
                "home_possession": round(home_stats.avg_possession, 1),
                "away_possession": round(away_stats.avg_possession, 1),
                "home_shots_on_target": round(home_stats.avg_shots_on_target, 1),
                "away_shots_on_target": round(away_stats.avg_shots_on_target, 1),
                # ── Head-to-head ────────────────────────────────────────────
                "h2h_home_wins": match.h2h_home_wins,
                "h2h_away_wins": match.h2h_away_wins,
                "h2h_draws": match.h2h_draws,
                # ── Model probabilities (all markets) ───────────────────────
                "home_win_prob": round(probs.home_win, 4),
                "draw_prob": round(probs.draw, 4),
                "away_win_prob": round(probs.away_win, 4),
                "over25_prob": round(probs.over25, 4),
                "under25_prob": round(probs.under25, 4),
                "over15_prob": round(probs.over15, 4),
                "over35_prob": round(probs.over35, 4),
                "btts_prob": round(probs.btts, 4),
                "double_chance_1x": round(probs.double_chance_1x, 4),
                "double_chance_x2": round(probs.double_chance_x2, 4),
                "model_confidence": round(probs.confidence_score, 4),
                # ── Classification ──────────────────────────────────────────
                "category": category,
                "value_rank": value_rank,  # high / medium / low / none
                "status": "pending",
                "score": None,
                "sport": "football",
                "model": "quant",
                "generated_by": "quant_pipeline",
                "timestamp": _now_iso(),
                # All approved bets for this match (metadata)
                "all_value_bets": [
                    {"market": b.market, "prob": b.model_prob, "odds": b.odds, "ev": b.expected_value}
                    for b in approved_bets[:5]
                ],
            }
            predictions.append(pred)

            # ── Add to accumulator pool ONLY if it has real value ───────────
            if best_bet and category in ("safe", "value"):
                bet_pool.append({
                    "fixture_id": match.fixture_id,
                    "league": match.league,
                    "home_team": match.home_team,
                    "away_team": match.away_team,
                    "market": best_bet.market,
                    "odds": best_bet.odds,
                    "model_prob": best_bet.model_prob,
                    "expected_value": best_bet.expected_value,
                })

            emoji = {"high": "🟢", "medium": "🟡", "low": "⚪", "none": "⚫"}.get(value_rank, "⚫")
            bet_label = best_bet.market if best_bet else "N/A"
            ev_label = f"EV {best_bet.expected_value:.1%}" if best_bet else "No odds"
            _safe_print(f"[QuantPipeline]   {emoji} {match.home_team} vs {match.away_team}: {bet_label} | {ev_label} | Rank={value_rank}")

        except Exception as e:
            _safe_print(f"[QuantPipeline]   ❌ Error processing {match.home_team} vs {match.away_team}: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()

    if not predictions:
        _safe_print("[QuantPipeline] No matches could be analyzed today.")
        return {"status": "skipped", "reason": "no_matches_analyzed", "date": date_str, "matches_analyzed": len(matches)}

    # ── Step 10: Generate accumulators ─────────────────────────────────────
    accas_dict = generate_accumulators(bet_pool)
    
    total_accas = sum(len(v) for v in accas_dict.values())
    _safe_print(f"[QuantPipeline] 🎰 Generated {total_accas} named accumulators across 4 tiers.")

    # ── Step 11: Save to Firestore ─────────────────────────────────────────
    doc = {
        "date": date_str,
        "status": "completed",
        "predictions": predictions,
        "accumulators": accas_dict,
        "matches_analyzed": len(matches),
        "value_bets_found": len([p for p in predictions if p["value_rank"] in ("high", "medium")]),
        "total_analyzed": len(predictions),
        "generated_at": _now_iso(),
        "generated_by": "quant_pipeline",
    }

    if not dry_run:
        db = _get_firestore() # Re-fetch db if not dry_run
        if db:
            try:
                db.collection("quant_predictions").document(date_str).set(doc)
                _safe_print(f"[QuantPipeline] 💾 Saved {len(predictions)} match analyses to Firestore for {date_str}")
                # Update Elo ratings
                save_dirty_ratings()
            except Exception as e:
                _safe_print(f"[QuantPipeline]   ❌ Error saving to Firestore: {e}", file=sys.stderr)
        else:
            _safe_print("[QuantPipeline] ⚠️  Firestore unavailable — skipping save.", file=sys.stderr)
    else:
        _safe_print(f"[QuantPipeline] 🛑 Dry run: Skipping Firestore save.")

    _safe_print(f"\n[QuantPipeline] ✅ Pipeline complete!")
    _safe_print(f"  Matches analyzed: {len(matches)}")
    _safe_print(f"  Predictions generated: {len(predictions)}")
    value_count = len([p for p in predictions if p["value_rank"] in ("high", "medium")])
    _safe_print(f"  Value bets (high/medium): {value_count}")
    _safe_print(f"  Accumulators: {total_accas}")
    for tier_name, tier_list in accas_dict.items():
        if tier_list:
            t = tier_list[0]
            _safe_print(f"    {t.get('tier_icon', '')} {t.get('tier_label', tier_name)}: {t['combined_odds']:.2f}x ({t['leg_count']} legs)")

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
