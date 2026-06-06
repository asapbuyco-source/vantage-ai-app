import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from valid_backtest import extract_valid_bets, run_valid_backtest


def _pred(status="won", generated_at="2026-05-01T10:00:00Z", kickoff_utc="2026-05-01T12:00:00Z"):
    return {
        "fixture_id": "fx-1",
        "home_team": "Home",
        "away_team": "Away",
        "bet_type": "Over 1.5 Goals",
        "odds": 1.8,
        "status": status,
        "expected_value": 0.08,
        "kelly_stake": 5.0,
        "generated_at": generated_at,
        "kickoff_utc": kickoff_utc,
    }


class ValidBacktestTests(unittest.TestCase):
    def test_accepts_only_pre_kickoff_graded_predictions(self):
        docs = [{
            "date": "2026-05-01",
            "predictions": [
                _pred(),
                _pred(generated_at="2026-05-01T11:45:00Z"),
                _pred(status="pending"),
            ],
        }]

        bets, rejected = extract_valid_bets(docs)

        self.assertEqual(len(bets), 1)
        self.assertEqual(rejected.generated_after_cutoff, 1)
        self.assertEqual(rejected.ungraded, 1)

    def test_rejects_missing_prediction_timestamp(self):
        pred = _pred()
        pred.pop("generated_at")
        docs = [{"date": "2026-05-01", "predictions": [pred]}]

        bets, rejected = extract_valid_bets(docs)

        self.assertEqual(bets, [])
        self.assertEqual(rejected.missing_generated_at, 1)

    def test_simulation_caps_daily_exposure_and_marks_small_sample_invalid(self):
        docs = [{
            "date": "2026-05-01",
            "predictions": [
                {**_pred(), "fixture_id": f"fx-{i}", "status": "won" if i % 2 == 0 else "lost"}
                for i in range(10)
            ],
        }]

        report = run_valid_backtest(docs, bankroll=200000)

        self.assertFalse(report.valid)
        self.assertEqual(report.total_bets, 10)
        self.assertLessEqual(report.total_staked, 24000.01)

    def test_valid_month_sample_can_pass(self):
        docs = []
        for day in range(1, 22):
            docs.append({
                "date": f"2026-05-{day:02d}",
                "generated_at": f"2026-05-{day:02d}T08:00:00Z",
                "predictions": [
                    {
                        **_pred(
                            status="won" if pick % 3 else "lost",
                            generated_at=f"2026-05-{day:02d}T08:00:00Z",
                            kickoff_utc=f"2026-05-{day:02d}T12:00:00Z",
                        ),
                        "fixture_id": f"fx-{day}-{pick}",
                    }
                    for pick in range(2)
                ],
            })

        report = run_valid_backtest(docs, bankroll=200000)

        self.assertTrue(report.valid)
        self.assertEqual(report.active_days, 21)
        self.assertEqual(report.total_bets, 42)


if __name__ == "__main__":
    unittest.main()
