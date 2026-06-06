"""
Strict, valid-only sports prediction backtest.

This backtest is intentionally conservative. It rejects any prediction that
cannot prove it was generated before kickoff, because historical replay data can
otherwise leak final scores, fixture statistics, or post-match odds.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


LAGOS_TZ = timezone(timedelta(hours=1))
VALID_STATUSES = {"won", "lost", "void"}
MAX_DAILY_EXPOSURE_PCT = 0.12
MAX_PICK_STAKE_PCT = 0.025
MIN_PREKICKOFF_MINUTES = 30


@dataclass
class ValidBacktestBet:
    date: str
    fixture_id: str
    home_team: str
    away_team: str
    market: str
    odds: float
    status: str
    expected_value: float
    kelly_pct: float
    generated_at: str
    kickoff_utc: str


@dataclass
class RejectionStats:
    missing_generated_at: int = 0
    missing_kickoff: int = 0
    generated_after_cutoff: int = 0
    ungraded: int = 0
    invalid_odds: int = 0
    invalid_stake: int = 0


@dataclass
class ValidBacktestReport:
    valid: bool
    reason: str
    starting_bankroll: float
    final_bankroll: float
    profit: float
    capital_roi_pct: float
    betting_roi_pct: float
    total_staked: float
    total_bets: int
    wins: int
    losses: int
    voids: int
    hit_rate_pct: float
    active_days: int
    first_date: str | None
    last_date: str | None
    max_drawdown_pct: float
    rejected: RejectionStats = field(default_factory=RejectionStats)
    notes: list[str] = field(default_factory=list)


def parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        raw = str(value).strip()
        if not raw:
            return None
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_docs(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and isinstance(payload.get("documents"), list):
        return payload["documents"]
    if isinstance(payload, dict) and isinstance(payload.get("predictions"), list):
        return [payload]
    if isinstance(payload, list):
        return payload
    return []


def extract_valid_bets(docs: list[dict[str, Any]], cutoff_minutes: int = MIN_PREKICKOFF_MINUTES) -> tuple[list[ValidBacktestBet], RejectionStats]:
    bets: list[ValidBacktestBet] = []
    rejected = RejectionStats()
    cutoff = timedelta(minutes=cutoff_minutes)

    for doc in docs:
        doc_date = str(doc.get("date") or doc.get("id") or "")
        doc_generated_at = doc.get("generated_at") or doc.get("generatedAt") or doc.get("created_at")
        predictions = doc.get("predictions") or doc.get("matches") or []
        if not isinstance(predictions, list):
            continue

        for pred in predictions:
            status = str(pred.get("status") or "").lower()
            if status not in VALID_STATUSES:
                rejected.ungraded += 1
                continue

            odds = to_float(pred.get("odds"))
            if odds <= 1:
                rejected.invalid_odds += 1
                continue

            generated_at_raw = (
                pred.get("generated_at")
                or pred.get("generatedAt")
                or pred.get("prediction_generated_at")
                or doc_generated_at
            )
            kickoff_raw = pred.get("kickoff_utc") or pred.get("kickoffUtc") or pred.get("kickoff")
            generated_at = parse_time(generated_at_raw)
            kickoff = parse_time(kickoff_raw)
            if not generated_at:
                rejected.missing_generated_at += 1
                continue
            if not kickoff:
                rejected.missing_kickoff += 1
                continue
            if generated_at > kickoff - cutoff:
                rejected.generated_after_cutoff += 1
                continue

            kelly_pct = to_float(pred.get("kelly_stake") or pred.get("kelly_pct") or pred.get("kellyStake"))
            if kelly_pct <= 0:
                rejected.invalid_stake += 1
                continue

            bets.append(
                ValidBacktestBet(
                    date=doc_date or generated_at.astimezone(LAGOS_TZ).strftime("%Y-%m-%d"),
                    fixture_id=str(pred.get("fixture_id") or pred.get("id") or ""),
                    home_team=str(pred.get("home_team") or pred.get("homeTeam") or ""),
                    away_team=str(pred.get("away_team") or pred.get("awayTeam") or ""),
                    market=str(pred.get("bet_type") or pred.get("prediction") or pred.get("market") or ""),
                    odds=odds,
                    status=status,
                    expected_value=to_float(pred.get("expected_value") or pred.get("ev")),
                    kelly_pct=kelly_pct,
                    generated_at=generated_at.isoformat(),
                    kickoff_utc=kickoff.isoformat(),
                )
            )

    bets.sort(key=lambda b: (b.date, b.kickoff_utc, b.fixture_id))
    return bets, rejected


def run_valid_backtest(
    docs: list[dict[str, Any]],
    bankroll: float,
    min_bets: int = 30,
    min_active_days: int = 20,
) -> ValidBacktestReport:
    bets, rejected = extract_valid_bets(docs)
    current_bankroll = float(bankroll)
    total_staked = 0.0
    wins = losses = voids = 0
    max_bankroll = current_bankroll
    max_drawdown = 0.0

    daily_exposure: dict[str, float] = {}
    active_dates = sorted({b.date for b in bets})

    for bet in bets:
        daily_cap = bankroll * MAX_DAILY_EXPOSURE_PCT
        already_staked_today = daily_exposure.get(bet.date, 0.0)
        remaining_daily = max(0.0, daily_cap - already_staked_today)
        if remaining_daily < 1:
            continue

        stake_pct = min(max(bet.kelly_pct / 100.0, 0.0), MAX_PICK_STAKE_PCT)
        stake = min(current_bankroll * stake_pct, remaining_daily)
        if stake < 1:
            continue

        daily_exposure[bet.date] = already_staked_today + stake
        total_staked += stake

        if bet.status == "won":
            wins += 1
            current_bankroll += stake * (bet.odds - 1)
        elif bet.status == "lost":
            losses += 1
            current_bankroll -= stake
        else:
            voids += 1

        current_bankroll = round(current_bankroll, 2)
        max_bankroll = max(max_bankroll, current_bankroll)
        if max_bankroll > 0:
            max_drawdown = max(max_drawdown, (max_bankroll - current_bankroll) / max_bankroll)

    profit = round(current_bankroll - bankroll, 2)
    decided = wins + losses
    notes: list[str] = [
        f"Requires prediction timestamp at least {MIN_PREKICKOFF_MINUTES} minutes before kickoff.",
        f"Stake capped at {MAX_PICK_STAKE_PCT:.1%} per pick and {MAX_DAILY_EXPOSURE_PCT:.1%} daily exposure.",
    ]

    valid = len(bets) >= min_bets and len(active_dates) >= min_active_days
    if not valid:
        reason = f"Not enough clean pre-kickoff graded data: {len(bets)} bets across {len(active_dates)} active days."
    else:
        reason = "Clean pre-kickoff graded data is sufficient for a one-month validity test."

    return ValidBacktestReport(
        valid=valid,
        reason=reason,
        starting_bankroll=round(bankroll, 2),
        final_bankroll=round(current_bankroll, 2),
        profit=profit,
        capital_roi_pct=(profit / bankroll * 100.0) if bankroll else 0.0,
        betting_roi_pct=(profit / total_staked * 100.0) if total_staked else 0.0,
        total_staked=round(total_staked, 2),
        total_bets=len(bets),
        wins=wins,
        losses=losses,
        voids=voids,
        hit_rate_pct=(wins / decided * 100.0) if decided else 0.0,
        active_days=len(active_dates),
        first_date=active_dates[0] if active_dates else None,
        last_date=active_dates[-1] if active_dates else None,
        max_drawdown_pct=max_drawdown * 100.0,
        rejected=rejected,
        notes=notes,
    )


def load_json_file(path: Path) -> list[dict[str, Any]]:
    return normalize_docs(json.loads(path.read_text(encoding="utf-8")))


def load_firestore(days: int) -> list[dict[str, Any]]:
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        print("[ValidBacktest] firebase-admin is not installed.", file=sys.stderr)
        return []

    if not firebase_admin._apps:
        service_account = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
        if service_account:
            cred = credentials.Certificate(json.loads(service_account.replace("\\n", "\n")))
        else:
            cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)

    db = firestore.client()
    docs: list[dict[str, Any]] = []
    for i in range(days):
        date_key = (datetime.now(LAGOS_TZ) - timedelta(days=i + 1)).strftime("%Y-%m-%d")
        snap = db.collection("quant_predictions").document(date_key).get()
        if snap.exists:
            data = snap.to_dict()
            data["id"] = date_key
            docs.append(data)
    return docs


def print_report(report: ValidBacktestReport) -> None:
    print("Valid Sports Prediction Backtest")
    print(f"Valid: {'yes' if report.valid else 'no'}")
    print(f"Reason: {report.reason}")
    for note in report.notes:
        print(f"- {note}")
    print(f"Period: {report.first_date} to {report.last_date} ({report.active_days} active days)")
    print(f"Bets: {report.total_bets} | W-L-V: {report.wins}-{report.losses}-{report.voids} | Hit rate: {report.hit_rate_pct:.1f}%")
    print(f"Starting bankroll: {report.starting_bankroll:,.0f} FCFA")
    print(f"Final bankroll: {report.final_bankroll:,.0f} FCFA")
    print(f"Profit: {report.profit:+,.0f} FCFA")
    print(f"Capital ROI: {report.capital_roi_pct:+.2f}%")
    print(f"Betting ROI: {report.betting_roi_pct:+.2f}%")
    print(f"Total staked: {report.total_staked:,.0f} FCFA")
    print(f"Max drawdown: {report.max_drawdown_pct:.2f}%")
    print("Rejected:")
    print(json.dumps(asdict(report.rejected), indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run strict valid-only sports prediction backtest.")
    parser.add_argument("--bankroll", type=float, default=200000.0)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--input", type=Path, help="JSON export with quant prediction documents.")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    docs = load_json_file(args.input) if args.input else load_firestore(args.days)
    report = run_valid_backtest(docs, args.bankroll)

    if args.json:
        print(json.dumps(asdict(report), indent=2))
    else:
        print_report(report)

    return 0 if report.valid else 2


if __name__ == "__main__":
    raise SystemExit(main())
