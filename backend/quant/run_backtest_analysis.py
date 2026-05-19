"""
run_backtest_analysis.py
────────────────────────
Parses the historical test_results_30d.txt replay log and computes:
  - Overall hit rate and flat-stake ROI
  - Per-market breakdown (win rate, avg odds, ROI)
  - Calibration analysis (predicted EV vs actual ROI gap)
  - xG data quality flags (suspiciously large API values)
  - Model adjustment recommendations
"""

import re
import sys
import json
import math
from collections import defaultdict

# Fix for Windows console emoji encoding issues
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

LOG_FILE = "test_results_30d.txt"

def parse_log(path: str):
    # Try utf-16 first, fallback to utf-8 if it fails
    try:
        text = open(path, encoding="utf-16", errors="replace").read()
    except Exception:
        text = open(path, encoding="utf-8", errors="replace").read()

    bets = []
    markets = defaultdict(lambda: {"wins": 0, "losses": 0, "odds_sum": 0.0, "ev_sum": 0.0, "count": 0})

    # Match graded predictions
    pattern = re.compile(
        r"MATCH: (.+?) (\d+)-(\d+) (.+?)\r?\n\s+PICK\s*:\s*(.+?) @ ([\d.]+) -> (WON|LOST|VOID)"
    )
    ev_pattern = re.compile(r"\| EV ([\d.\-]+)%")
    date_pattern = re.compile(r"Analyzing (\d{4}-\d{2}-\d{2})")
    xg_pattern = re.compile(r"xG: ([\d.]+)-([\d.]+) \[API-xG\]")
    safety_pattern = re.compile(r"Safety Downgrade.*?: (.+?) -> (.+)")
    agreement_pattern = re.compile(r"Agreement ([\d.]+)")

    dates = date_pattern.findall(text)
    xg_vals = [(float(h), float(a)) for h, a in xg_pattern.findall(text)]
    safety_downgrades = safety_pattern.findall(text)
    agreements = [float(x) for x in agreement_pattern.findall(text)]

    # Extract EV values in order (one per match line)
    ev_sequence = [float(x) for x in ev_pattern.findall(text)]
    ev_index = 0

    for m in pattern.finditer(text):
        home, hg, ag, away, pick, odds, result = m.groups()
        odds = float(odds)
        hg, ag = int(hg), int(ag)

        ev = ev_sequence[ev_index] if ev_index < len(ev_sequence) else 0.0
        ev_index += 1

        bet = {
            "home": home.strip(),
            "away": away.strip(),
            "score": f"{hg}-{ag}",
            "pick": pick.strip(),
            "odds": odds,
            "result": result,
            "ev": ev,
            "total_goals": hg + ag,
        }
        bets.append(bet)

        mkt = pick.strip()
        markets[mkt]["count"] += 1
        markets[mkt]["odds_sum"] += odds
        markets[mkt]["ev_sum"] += ev
        if result == "WON":
            markets[mkt]["wins"] += 1
        elif result == "LOST":
            markets[mkt]["losses"] += 1

    return bets, markets, dates, xg_vals, safety_downgrades, agreements


def calibration_analysis(bets):
    """
    Group bets by predicted EV bucket and compare to actual ROI.
    Identifies where the model is systematically over/under-confident.
    """
    buckets = defaultdict(lambda: {"wins": 0, "losses": 0, "ev_sum": 0.0, "odds_sum": 0.0})
    for b in bets:
        if b["result"] == "VOID":
            continue
        ev = b["ev"]
        bucket = int(ev // 20) * 20  # 0-19%, 20-39%, 40-59%, 60-79%, 80%+
        key = f"{bucket}-{bucket+20}% EV"
        buckets[key]["ev_sum"] += ev
        buckets[key]["odds_sum"] += b["odds"]
        if b["result"] == "WON":
            buckets[key]["wins"] += 1
        else:
            buckets[key]["losses"] += 1
    return buckets


def print_report(bets, markets, dates, xg_vals, safety_downgrades, agreements):
    decided_bets = [b for b in bets if b["result"] in ("WON", "LOST")]
    wins = sum(1 for b in decided_bets if b["result"] == "WON")
    losses = len(decided_bets) - wins
    decided = wins + losses

    hit_rate = wins / decided if decided else 0
    roi_sum = sum((b["odds"] - 1) if b["result"] == "WON" else -1 for b in decided_bets)
    flat_roi = roi_sum / decided if decided else 0

    # Kelly simulation (approximate: assume 0.25 fractional kelly per bet)
    bankroll = 10000.0
    for b in decided_bets:
        edge = b["ev"] / 100.0  # convert from pct to fraction
        kelly_f = max(0, edge / (b["odds"] - 1)) * 0.25 if b["odds"] > 1 else 0
        stake = bankroll * kelly_f
        if b["result"] == "WON":
            bankroll += stake * (b["odds"] - 1)
        else:
            bankroll -= stake
    kelly_roi = (bankroll - 10000) / 10000

    print()
    print("=" * 68)
    print(" QUANT ENGINE BACKTEST — 30-DAY PARSED ANALYSIS")
    print("=" * 68)
    if dates:
        print(f"  Period:              {min(dates)} to {max(dates)}")
    print(f"  Total graded picks:  {decided}")
    print(f"  Wins / Losses:       {wins} / {losses}")
    print(f"  Hit Rate:            {hit_rate:.1%}")
    print(f"  Flat-stake ROI:      {flat_roi:+.1%}")
    print(f"  Kelly sim final bkr: {bankroll:,.0f}  (Kelly ROI: {kelly_roi:+.1%})")
    print()

    # ── Per-market table ─────────────────────────────────────────────────────
    print(f"  {'MARKET':<28} {'W':>4} {'L':>4} {'Hit%':>7} {'Avg Odds':>9} {'Avg EV':>8} {'Flat ROI':>9}")
    print(f"  {'-'*28} {'-'*4} {'-'*4} {'-'*7} {'-'*9} {'-'*8} {'-'*9}")
    for mkt, d in sorted(markets.items(), key=lambda x: x[1]["count"], reverse=True):
        w, l = d["wins"], d["losses"]
        n = w + l
        if n == 0:
            continue
        hr = w / n
        avg_o = d["odds_sum"] / d["count"]
        avg_ev = d["ev_sum"] / d["count"]
        mroi = ((w * (avg_o - 1)) - l) / n
        flag = " ⚠️" if hr < 0.45 and n >= 5 else ("  ✅" if hr >= 0.60 else "")
        print(f"  {mkt:<28} {w:>4} {l:>4} {hr:>6.1%} {avg_o:>9.2f} {avg_ev:>7.1f}% {mroi:>+8.1%}{flag}")

    # ── Calibration (EV bucket vs actual ROI) ───────────────────────────────
    print()
    print("  EV CALIBRATION (predicted EV vs actual flat ROI):")
    buckets = calibration_analysis(bets)
    print(f"  {'EV Bucket':<18} {'N':>4} {'Hit%':>7} {'Actual ROI':>11} {'Gap (ROI-EV midpoint)':>22}")
    print(f"  {'-'*18} {'-'*4} {'-'*7} {'-'*11} {'-'*22}")
    for key in sorted(buckets.keys()):
        d = buckets[key]
        n = d["wins"] + d["losses"]
        if n == 0:
            continue
        hr = d["wins"] / n
        avg_o = d["odds_sum"] / n if n > 0 else 1
        actual_roi = ((d["wins"] * (avg_o - 1)) - d["losses"]) / n
        ev_mid = (int(key.split("-")[0]) + 10) / 100.0  # midpoint of bucket
        gap = actual_roi - ev_mid
        direction = "OVER-conf" if gap < -0.05 else ("UNDER-conf" if gap > 0.05 else "OK")
        print(f"  {key:<18} {n:>4} {hr:>6.1%} {actual_roi:>+10.1%} {gap:>+12.1%}  {direction}")

    # ── Safety Downgrade Effectiveness ──────────────────────────────────────
    print()
    print(f"  Safety Downgrades triggered: {len(safety_downgrades)}")
    from_counts = defaultdict(int)
    for frm, to in safety_downgrades:
        from_counts[f"{frm.strip()} -> {to.strip()}"] += 1
    for k, v in sorted(from_counts.items(), key=lambda x: -x[1]):
        print(f"    {v:>3}x  {k}")

    # ── xG Data Quality ──────────────────────────────────────────────────────
    print()
    big_xg = [(h, a) for h, a in xg_vals if h >= 6 or a >= 6]
    pct_big = len(big_xg) / len(xg_vals) * 100 if xg_vals else 0
    print(f"  xG Data Quality:")
    print(f"    Total fixtures with xG:       {len(xg_vals)}")
    print(f"    Fixtures with xG >= 6 (bad):  {len(big_xg)}  ({pct_big:.0f}%)")
    if big_xg:
        print(f"    Max xG seen: home={max(h for h,a in big_xg):.0f}, away={max(a for h,a in big_xg):.0f}")
        print(f"    ⚠️  These are Shots on Target values mislabeled as xG — now fixed by Bug #5 patch.")

    # ── Model Agreement Distribution ─────────────────────────────────────────
    if agreements:
        avg_agreement = sum(agreements) / len(agreements)
        low_agreement = sum(1 for x in agreements if x < 0.50)
        print()
        print(f"  Model Agreement (confidence_score):")
        print(f"    Average agreement: {avg_agreement:.2f}")
        print(f"    Low agreement (<0.50): {low_agreement}/{len(agreements)} picks ({low_agreement/len(agreements):.0%})")

    # ── Recommendations ──────────────────────────────────────────────────────
    print()
    print("=" * 68)
    print(" MODEL ADJUSTMENT RECOMMENDATIONS")
    print("=" * 68)

    recs = []

    # Hit rate check
    if hit_rate < 0.50:
        recs.append(f"⚠️  Overall hit rate is {hit_rate:.1%} — model is losing money flat-staking.")
        recs.append("    → Check xG inputs. Large xG values (6+) from Shots on Target data caused")
        recs.append("      unrealistically high Over 2.5 predictions for low-tier matches.")
        recs.append("      Bug #5/#8/#9 patch now corrects this — re-run replay to see improvement.")

    # Market-specific
    for mkt, d in markets.items():
        w, l = d["wins"], d["losses"]
        n = w + l
        if n < 5:
            continue
        hr = w / n
        avg_o = d["odds_sum"] / d["count"]
        if hr < 0.40:
            recs.append(f"⚠️  {mkt}: hit rate {hr:.1%} on {n} picks — consider raising EV threshold for this market.")
        elif hr > 0.70 and avg_o < 1.50:
            recs.append(f"📌 {mkt}: {hr:.1%} hit rate but avg odds {avg_o:.2f} — margin too thin. Require odds ≥ 1.55.")

    # xG quality
    if pct_big > 50:
        recs.append(f"⚠️  {pct_big:.0f}% of xG values are ≥ 6 — data is Shots on Target, NOT xG.")
        recs.append("    → Bug #5/#8/#9 patch fixes the type_id mapping (tid=34) and removes 0.35 scale factor.")
        recs.append("    → All Over/Under predictions will be recalibrated once corrected xG flows through.")

    # EV over-inflation
    over_ev_bets = [b for b in decided_bets if b["ev"] > 50 and b["result"] == "LOST"]
    if len(over_ev_bets) > 3:
        recs.append(f"⚠️  {len(over_ev_bets)} bets predicted >50% EV but lost — EV is being systematically over-inflated.")
        recs.append("    → Root cause: xG from SOT data inflates mu → inflates Poisson probabilities → fake EV.")
        recs.append("    → Patching Bug #5 should correct this cascade.")

    # Safety downgrade effectiveness
    if len(safety_downgrades) > 10:
        recs.append(f"📌 Safety Downgrade fired {len(safety_downgrades)} times — very high for 30 days.")
        recs.append("    → Most are Tier 5 (low-league) downgrades. Consider excluding Tier 5+ leagues entirely.")

    for r in recs:
        print(f"  {r}")

    if not recs:
        print("  ✅ No critical adjustments needed based on this sample.")

    print()
    print("=" * 68)
    print(f" VERDICT: {'NEEDS CALIBRATION' if flat_roi < -0.05 else 'MARGINAL - MONITOR' if flat_roi < 0 else 'PROFITABLE'}")
    print("=" * 68)
    print()


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else LOG_FILE
    try:
        bets, markets, dates, xg_vals, safety_downgrades, agreements = parse_log(path)
        print_report(bets, markets, dates, xg_vals, safety_downgrades, agreements)
    except FileNotFoundError:
        print(f"[ERROR] Could not find {path}")
        sys.exit(1)
