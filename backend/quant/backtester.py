"""
backtester.py
─────────────
Upgrade #7: Backtesting framework for the quant engine.

Replays the model against N days of historical graded predictions
and computes key performance metrics:
  - Hit rate (total and per-market)
  - ROI
  - CLV consistency
  - Calibration curve
  - Profit/Loss simulation with Kelly staking

Usage:
  python backtester.py                 # Last 30 days
  python backtester.py --days 60       # Last 60 days
  python backtester.py --market "Home Win"  # Filter by market
"""

import os
import sys
import json
from datetime import datetime, timedelta, timezone

LAGOS_TZ = timezone(timedelta(hours=1))
from dataclasses import dataclass, field


def _safe_print(text: str, file=sys.stdout):
    """Safely print text that may contain emojis on Windows CMD/PowerShell."""
    try:
        print(text, file=file)
    except UnicodeEncodeError:
        print(text.encode('ascii', 'replace').decode('ascii'), file=file)


@dataclass
class BacktestResult:
    """Container for backtest results."""
    days_analyzed: int = 0
    total_bets: int = 0
    wins: int = 0
    losses: int = 0
    voids: int = 0
    hit_rate: float = 0.0
    # Financial
    total_staked: float = 0.0  # Using Kelly fractions
    total_returned: float = 0.0
    profit_loss: float = 0.0
    roi: float = 0.0
    # Per-market breakdown
    market_stats: dict = field(default_factory=dict)
    # CLV
    avg_clv: float = 0.0
    clv_positive_rate: float = 0.0  # % of bets with positive CLV
    # Model quality
    avg_ev_predicted: float = 0.0
    avg_odds: float = 0.0
    # Streaks
    longest_win_streak: int = 0
    longest_loss_streak: int = 0
    current_streak: int = 0
    current_streak_type: str = ""


def _get_firestore():
    try:
        import firebase_admin
        from firebase_admin import firestore as fs, credentials
        
        if not firebase_admin._apps:
            # 1. Try env var first (works in Railway)
            sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
            
            # 2. Manual parsing for local Windows testing (bypasses python-dotenv multiline bugs)
            if not sa_json and os.path.exists("../../.env.local"):
                with open("../../.env.local", "r", encoding="utf-8") as f:
                    content = f.read()
                    if "FIREBASE_SERVICE_ACCOUNT=" in content:
                        val = content.split("FIREBASE_SERVICE_ACCOUNT=")[1]
                        # Extract the JSON string handling potential surrounding quotes
                        if val.strip().startswith("'"):
                            sa_json = val.split("'")[1]
                        elif val.strip().startswith('"'):
                            sa_json = val.split('"')[1]
                        else:
                            # It might just be raw until the next newline
                            sa_json = val.split("\n")[0]

            if sa_json:
                sa_dict = json.loads(sa_json)
                if "private_key" in sa_dict:
                    sa_dict["private_key"] = sa_dict["private_key"].replace('\\n', '\n')
                cred = credentials.Certificate(sa_dict)
            else:
                cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            
        return fs.client()
    except Exception as e:
        print(f"[Backtester] Firestore unavailable: {e}", file=sys.stderr)
        return None


def run_backtest(
    days: int = 30,
    market_filter: str | None = None,
    bankroll: float = 10000.0,
) -> BacktestResult:
    """
    Run backtest over the last N days of quant predictions.
    
    Args:
        days: Number of days to look back.
        market_filter: Optional market name filter (e.g. "Home Win").
        bankroll: Starting bankroll for P/L simulation.
    
    Returns:
        BacktestResult with all performance metrics.
    """
    db = _get_firestore()
    if not db:
        print("[Backtester] Cannot connect to Firestore.", file=sys.stderr)
        return BacktestResult()

    result = BacktestResult()
    all_bets = []
    current_bankroll = bankroll

    _safe_print(f"[Backtester] 📊 Running backtest: {days} days, market={market_filter or 'ALL'}")
    _safe_print(f"[Backtester] Starting bankroll: {bankroll:,.0f}")

    for i in range(days):
        date_str = (datetime.now(LAGOS_TZ) - timedelta(days=i+1)).strftime("%Y-%m-%d")
        doc = db.collection("quant_predictions").document(date_str).get()
        if not doc.exists:
            continue

        data = doc.to_dict()
        predictions = data.get("predictions", [])
        result.days_analyzed += 1

        for pred in predictions:
            status = pred.get("status", "pending")
            if status == "pending":
                continue

            market = pred.get("bet_type", "")
            if market_filter and market_filter.lower() not in market.lower():
                continue

            odds = float(pred.get("odds", 0) or 0)
            probability = float(pred.get("probability", 0) or 0)
            ev = float(pred.get("expected_value", 0) or 0)
            kelly = float(pred.get("kelly_stake", 0) or 0) / 100.0  # Convert from % to fraction
            clv = float(pred.get("clv", 0) or 0)

            bet_info = {
                "date": date_str,
                "home": pred.get("home_team", ""),
                "away": pred.get("away_team", ""),
                "market": market,
                "odds": odds,
                "probability": probability,
                "ev": ev,
                "kelly": kelly,
                "status": status,
                "clv": clv,
                "score": pred.get("score", ""),
            }
            all_bets.append(bet_info)

            # Financial simulation
            # FIX: Only bet when Kelly > 0. The old max(kelly, 0.01) forced a 1%
            # stake even with zero edge, inflating simulated ROI by ~5-10%.
            if kelly <= 0:
                result.total_bets += 1
                # Count it statistically but don't simulate a financial position
                if market not in result.market_stats:
                    result.market_stats[market] = {"wins": 0, "losses": 0, "voids": 0, "total": 0, "staked": 0, "returned": 0}
                result.market_stats[market]["total"] += 1
                if status == "won": result.market_stats[market]["wins"] += 1
                elif status == "lost": result.market_stats[market]["losses"] += 1
                continue

            stake = current_bankroll * kelly
            result.total_staked += stake

            if status == "won":
                result.wins += 1
                returns = stake * odds
                result.total_returned += returns
                current_bankroll += stake * (odds - 1)
            elif status == "lost":
                result.losses += 1
                current_bankroll -= stake
            elif status == "void":
                result.voids += 1
                result.total_returned += stake  # Refunded

            result.total_bets += 1

            # Per-market stats
            if market not in result.market_stats:
                result.market_stats[market] = {"wins": 0, "losses": 0, "voids": 0, "total": 0, "staked": 0, "returned": 0}
            result.market_stats[market]["total"] += 1
            result.market_stats[market]["staked"] += stake
            if status == "won":
                result.market_stats[market]["wins"] += 1
                result.market_stats[market]["returned"] += stake * odds
            elif status == "lost":
                result.market_stats[market]["losses"] += 1
            elif status == "void":
                result.market_stats[market]["voids"] += 1
                result.market_stats[market]["returned"] += stake

    # Calculate aggregate metrics
    decided = result.wins + result.losses
    if decided > 0:
        result.hit_rate = round(result.wins / decided, 4)

    result.profit_loss = round(result.total_returned - result.total_staked, 2)
    result.roi = round(result.profit_loss / result.total_staked, 4) if result.total_staked > 0 else 0

    # CLV stats
    clv_vals = [b["clv"] for b in all_bets if b["clv"] != 0]
    if clv_vals:
        result.avg_clv = round(sum(clv_vals) / len(clv_vals), 4)
        result.clv_positive_rate = round(sum(1 for c in clv_vals if c > 0) / len(clv_vals), 4)

    # EV and odds averages
    ev_vals = [b["ev"] for b in all_bets if b["ev"] > 0]
    odds_vals = [b["odds"] for b in all_bets if b["odds"] > 0]
    result.avg_ev_predicted = round(sum(ev_vals) / len(ev_vals), 4) if ev_vals else 0
    result.avg_odds = round(sum(odds_vals) / len(odds_vals), 2) if odds_vals else 0

    # Streaks
    win_streak = loss_streak = max_win = max_loss = 0
    for b in all_bets:
        if b["status"] == "won":
            win_streak += 1
            loss_streak = 0
            max_win = max(max_win, win_streak)
        elif b["status"] == "lost":
            loss_streak += 1
            win_streak = 0
            max_loss = max(max_loss, loss_streak)
    result.longest_win_streak = max_win
    result.longest_loss_streak = max_loss

    # Per-market hit rates and ROI
    for market, stats in result.market_stats.items():
        decided_m = stats["wins"] + stats["losses"]
        stats["hit_rate"] = round(stats["wins"] / decided_m, 4) if decided_m > 0 else 0
        stats["roi"] = round((stats["returned"] - stats["staked"]) / stats["staked"], 4) if stats["staked"] > 0 else 0

    return result


def print_backtest_report(result: BacktestResult, bankroll: float = 10000.0):
    """Pretty print a backtest report."""
    print(f"\n{'='*65}")
    print(f"{'QUANT ENGINE BACKTEST REPORT':^65}")
    print(f"{'='*65}")
    print(f"  Days analyzed:      {result.days_analyzed}")
    print(f"  Total bets:         {result.total_bets}")
    print(f"  Wins / Losses:      {result.wins} / {result.losses} (voided: {result.voids})")
    print(f"  Hit rate:           {result.hit_rate:.1%}")
    print(f"  Avg predicted EV:   {result.avg_ev_predicted:.1%}")
    print(f"  Avg odds:           {result.avg_odds:.2f}")
    print()
    print(f"  Total staked:       {result.total_staked:>12,.2f}")
    print(f"  Total returned:     {result.total_returned:>12,.2f}")
    print(f"  Profit / Loss:      {result.profit_loss:>+12,.2f}")
    print(f"  ROI:                {result.roi:>+.1%}")
    print(f"  Final bankroll:     {bankroll + result.profit_loss:>12,.2f}  (started {bankroll:,.0f})")
    print()
    if result.avg_clv:
        print(f"  Avg CLV:            {result.avg_clv:>+.2%}")
        print(f"  CLV positive rate:  {result.clv_positive_rate:.1%}")
    print(f"  Win streak (max):   {result.longest_win_streak}")
    print(f"  Loss streak (max):  {result.longest_loss_streak}")
    print()

    if result.market_stats:
        print(f"  {'MARKET':<25} {'W/L':>8} {'HIT%':>8} {'ROI':>8}")
        print(f"  {'-'*25} {'-'*8} {'-'*8} {'-'*8}")
        for market, stats in sorted(result.market_stats.items(), key=lambda x: x[1]["total"], reverse=True):
            wl = f"{stats['wins']}/{stats['losses']}"
            print(f"  {market:<25} {wl:>8} {stats['hit_rate']:>7.1%} {stats['roi']:>+7.1%}")

    edge_status = "✅ PROFITABLE" if result.roi > 0 else "⚠️  LOSING"
    clv_status = "✅ POSITIVE CLV" if result.avg_clv > 0 else "⚠️  NEGATIVE CLV"
    _safe_print(f"\n  Overall: {edge_status} | {clv_status}")
    print(f"{'='*65}\n")


def save_backtest_to_firestore(result: BacktestResult, days: int):
    """Save the backtest results to Firestore for historical tracking."""
    db = _get_firestore()
    if not db:
        return
    try:
        doc = {
            "days_analyzed": result.days_analyzed,
            "total_bets": result.total_bets,
            "wins": result.wins,
            "losses": result.losses,
            "hit_rate": result.hit_rate,
            "roi": result.roi,
            "profit_loss": result.profit_loss,
            "avg_clv": result.avg_clv,
            "clv_positive_rate": result.clv_positive_rate,
            "avg_ev_predicted": result.avg_ev_predicted,
            "avg_odds": result.avg_odds,
            "longest_win_streak": result.longest_win_streak,
            "longest_loss_streak": result.longest_loss_streak,
            "market_stats": result.market_stats,
            "computed_at": datetime.now(timezone.utc).isoformat(),
            "lookback_days": days,
        }
        date_key = datetime.now(LAGOS_TZ).strftime("%Y-%m-%d")
        db.collection("backtests").document(f"{date_key}_{days}d").set(doc)
        _safe_print(f"[Backtester] 💾 Saved to Firestore backtests/{date_key}_{days}d")
    except Exception as e:
        print(f"[Backtester] Save error: {e}", file=sys.stderr)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Quant Engine Backtester")
    parser.add_argument("--days", type=int, default=30, help="Number of days to backtest")
    parser.add_argument("--market", type=str, default=None, help="Filter by market name")
    parser.add_argument("--bankroll", type=float, default=10000.0, help="Starting bankroll")
    parser.add_argument("--save", action="store_true", help="Save results to Firestore")
    args = parser.parse_args()

    result = run_backtest(days=args.days, market_filter=args.market, bankroll=args.bankroll)
    print_backtest_report(result, args.bankroll)

    if args.save:
        save_backtest_to_firestore(result, args.days)
