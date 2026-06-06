"""
Cached sports prediction EV backtester.

This module validates cached prediction results and resimulates bankroll growth
from a requested starting capital. It supports the structured vault simulator
CSV first, then falls back to parsing the 30-day replay text log.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CSV = ROOT / "backend" / "vault_sim_30d.csv"
DEFAULT_LOG = ROOT / "backend" / "quant" / "test_results_30d.txt"
MAX_STAKE_PCT = 0.05


@dataclass
class BacktestPick:
    date: str
    prediction: str
    odds: float
    grade: str
    ev_pct: float
    kelly_pct: float
    home_team: str = ""
    away_team: str = ""
    source: str = ""


@dataclass
class BacktestResult:
    source: str
    valid: bool
    validity_notes: list[str]
    starting_bankroll: float
    final_bankroll: float
    total_profit: float
    capital_roi_pct: float
    betting_roi_pct: float
    expected_profit: float
    expected_roi_pct: float
    total_picks: int
    wins: int
    losses: int
    voids: int
    hit_rate_pct: float
    total_staked: float
    active_days: int
    first_date: str | None
    last_date: str | None
    max_drawdown_pct: float
    min_bankroll: float
    max_bankroll: float


def _to_float(value, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _kelly_from_ev(ev_pct: float, odds: float) -> float:
    if odds <= 1:
        return 0.0
    edge = ev_pct / 100.0
    stake_pct = max(0.0, edge / (odds - 1.0)) * 0.25
    return min(stake_pct, MAX_STAKE_PCT) * 100.0


def load_vault_csv(path: Path) -> list[BacktestPick]:
    picks: list[BacktestPick] = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            grade = (row.get("grade") or "").strip().lower()
            if grade not in {"won", "lost", "void"}:
                continue

            odds = _to_float(row.get("odds"))
            ev_pct = _to_float(row.get("ev_pct"))
            kelly_pct = _to_float(row.get("kelly_pct"))
            if odds <= 1:
                continue

            picks.append(
                BacktestPick(
                    date=(row.get("date") or "").strip(),
                    prediction=(row.get("prediction") or "").strip(),
                    odds=odds,
                    grade=grade,
                    ev_pct=ev_pct,
                    kelly_pct=kelly_pct,
                    home_team=(row.get("home_team") or "").strip(),
                    away_team=(row.get("away_team") or "").strip(),
                    source=str(path),
                )
            )
    return picks


def load_replay_log(path: Path) -> list[BacktestPick]:
    text = ""
    for encoding in ("utf-8", "utf-16", "utf-8-sig"):
        try:
            candidate = path.read_text(encoding=encoding, errors="replace")
        except UnicodeError:
            continue
        if "MATCH:" in candidate and "PICK" in candidate:
            text = candidate
            break
        if not text:
            text = candidate
    date_pattern = re.compile(r"Analyzing (\d{4}-\d{2}-\d{2})")
    ev_pattern = re.compile(r"\| EV ([\d.\-]+)%")
    pick_pattern = re.compile(
        r"MATCH: (.+?) (\d+)-(\d+) (.+?)\r?\n\s+PICK\s*:\s*(.+?) @ ([\d.]+) -> (WON|LOST|VOID)"
    )

    dated_spans = [(m.start(), m.group(1)) for m in date_pattern.finditer(text)]
    ev_values = [float(m.group(1)) for m in ev_pattern.finditer(text)]
    picks: list[BacktestPick] = []

    for index, match in enumerate(pick_pattern.finditer(text)):
        home, _home_goals, _away_goals, away, prediction, odds_raw, grade_raw = match.groups()
        odds = float(odds_raw)
        ev_pct = ev_values[index] if index < len(ev_values) else 0.0
        current_date = None
        for span_start, span_date in dated_spans:
            if span_start <= match.start():
                current_date = span_date
            else:
                break
        picks.append(
            BacktestPick(
                date=current_date or "",
                prediction=prediction.strip(),
                odds=odds,
                grade=grade_raw.lower(),
                ev_pct=ev_pct,
                kelly_pct=_kelly_from_ev(ev_pct, odds),
                home_team=home.strip(),
                away_team=away.strip(),
                source=str(path),
            )
        )
    return picks


def load_auto(csv_path: Path = DEFAULT_CSV, log_path: Path = DEFAULT_LOG) -> tuple[str, list[BacktestPick]]:
    if csv_path.exists():
        picks = load_vault_csv(csv_path)
        if picks:
            return str(csv_path), picks
    if log_path.exists():
        picks = load_replay_log(log_path)
        if picks:
            return str(log_path), picks
    return "none", []


def validate_picks(picks: Iterable[BacktestPick], min_picks: int = 30, min_active_days: int = 20) -> tuple[bool, list[str]]:
    pick_list = list(picks)
    notes: list[str] = []
    if not pick_list:
        return False, ["No graded cached predictions were found."]

    active_dates = {p.date for p in pick_list if p.date}
    missing_required = [
        p for p in pick_list if not p.date or p.odds <= 1 or p.grade not in {"won", "lost", "void"}
    ]
    if len(pick_list) < min_picks:
        notes.append(f"Only {len(pick_list)} graded picks found; expected at least {min_picks}.")
    if len(active_dates) < min_active_days:
        notes.append(f"Only {len(active_dates)} active dates found; expected at least {min_active_days}.")
    if missing_required:
        notes.append(f"{len(missing_required)} picks are missing date, odds, or grade fields.")

    if not notes:
        notes.append("Cache has enough graded picks, dates, odds, EV, and Kelly fields for a one-month EV test.")
    return len(notes) == 1 and notes[0].startswith("Cache has enough"), notes


def simulate_bankroll(picks: Iterable[BacktestPick], starting_bankroll: float) -> BacktestResult:
    pick_list = list(picks)
    valid, notes = validate_picks(pick_list)
    bankroll = float(starting_bankroll)
    max_bankroll = bankroll
    min_bankroll = bankroll
    max_drawdown = 0.0
    total_staked = 0.0
    expected_profit = 0.0
    wins = losses = voids = 0

    for pick in pick_list:
        stake_pct = min(max(pick.kelly_pct / 100.0, 0.0), MAX_STAKE_PCT)
        stake = round(bankroll * stake_pct, 2)
        if stake < 1:
            continue

        total_staked += stake
        expected_profit += stake * (pick.ev_pct / 100.0)

        if pick.grade == "won":
            wins += 1
            bankroll += stake * (pick.odds - 1.0)
        elif pick.grade == "lost":
            losses += 1
            bankroll -= stake
        else:
            voids += 1

        bankroll = round(bankroll, 2)
        max_bankroll = max(max_bankroll, bankroll)
        min_bankroll = min(min_bankroll, bankroll)
        if max_bankroll > 0:
            max_drawdown = max(max_drawdown, (max_bankroll - bankroll) / max_bankroll)

    total_profit = round(bankroll - starting_bankroll, 2)
    active_dates = sorted({p.date for p in pick_list if p.date})
    decided = wins + losses
    if len(active_dates) > 0 and len(pick_list) / len(active_dates) > 5:
        notes.append(
            "High pick volume detected; compounding results are optimistic unless the bankroll can absorb every listed stake."
        )
    if starting_bankroll > 0 and total_profit / starting_bankroll > 5:
        notes.append(
            "Realized return is extremely high; review market limits, correlated picks, and data leakage before treating this as deployable edge."
        )
    return BacktestResult(
        source=pick_list[0].source if pick_list else "none",
        valid=valid,
        validity_notes=notes,
        starting_bankroll=round(starting_bankroll, 2),
        final_bankroll=round(bankroll, 2),
        total_profit=total_profit,
        capital_roi_pct=(total_profit / starting_bankroll * 100.0) if starting_bankroll else 0.0,
        betting_roi_pct=(total_profit / total_staked * 100.0) if total_staked else 0.0,
        expected_profit=round(expected_profit, 2),
        expected_roi_pct=(expected_profit / starting_bankroll * 100.0) if starting_bankroll else 0.0,
        total_picks=len(pick_list),
        wins=wins,
        losses=losses,
        voids=voids,
        hit_rate_pct=(wins / decided * 100.0) if decided else 0.0,
        total_staked=round(total_staked, 2),
        active_days=len(active_dates),
        first_date=active_dates[0] if active_dates else None,
        last_date=active_dates[-1] if active_dates else None,
        max_drawdown_pct=max_drawdown * 100.0,
        min_bankroll=round(min_bankroll, 2),
        max_bankroll=round(max_bankroll, 2),
    )


def run_cached_backtest(bankroll: float, source: str = "auto", csv_path: Path = DEFAULT_CSV, log_path: Path = DEFAULT_LOG) -> BacktestResult:
    if source == "csv":
        picks = load_vault_csv(csv_path)
    elif source == "log":
        picks = load_replay_log(log_path)
    else:
        _selected, picks = load_auto(csv_path, log_path)
    return simulate_bankroll(picks, bankroll)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run cached one-month EV backtest for sports predictions.")
    parser.add_argument("--bankroll", type=float, default=200000.0, help="Starting capital in FCFA.")
    parser.add_argument("--source", choices=["auto", "csv", "log"], default="auto")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--log", type=Path, default=DEFAULT_LOG)
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args()

    result = run_cached_backtest(args.bankroll, args.source, args.csv, args.log)
    payload = asdict(result)

    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print("Cached Sports EV Backtest")
        print(f"Source: {result.source}")
        print(f"Valid cache: {'yes' if result.valid else 'no'}")
        for note in result.validity_notes:
            print(f"- {note}")
        print(f"Period: {result.first_date} to {result.last_date} ({result.active_days} active days)")
        print(f"Picks: {result.total_picks} | W-L-V: {result.wins}-{result.losses}-{result.voids} | Hit rate: {result.hit_rate_pct:.1f}%")
        print(f"Starting bankroll: {result.starting_bankroll:,.0f} FCFA")
        print(f"Final bankroll: {result.final_bankroll:,.0f} FCFA")
        print(f"Profit: {result.total_profit:+,.0f} FCFA")
        print(f"Capital ROI: {result.capital_roi_pct:+.2f}%")
        print(f"Betting ROI: {result.betting_roi_pct:+.2f}%")
        print(f"Expected EV profit: {result.expected_profit:+,.0f} FCFA ({result.expected_roi_pct:+.2f}% of capital)")
        print(f"Max drawdown: {result.max_drawdown_pct:.2f}%")

    return 0 if result.valid else 2


if __name__ == "__main__":
    raise SystemExit(main())
