import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ev_backtest import load_replay_log, load_vault_csv, simulate_bankroll, validate_picks


class EvBacktestTests(unittest.TestCase):
    def test_vault_csv_loader_and_bankroll_simulation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "vault.csv"
            path.write_text(
                "date,prediction,odds,ev_pct,kelly_pct,grade,home_team,away_team\n"
                "2026-05-01,Over 1.5 Goals,1.5,10,5,won,A,B\n"
                "2026-05-02,Away Win,2.0,5,2,lost,C,D\n",
                encoding="utf-8",
            )

            picks = load_vault_csv(path)
            result = simulate_bankroll(picks, 200000)

        self.assertEqual(len(picks), 2)
        self.assertEqual(result.wins, 1)
        self.assertEqual(result.losses, 1)
        self.assertAlmostEqual(result.final_bankroll, 200900.0)
        self.assertAlmostEqual(result.total_profit, 900.0)

    def test_replay_log_loader_derives_kelly_from_ev(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "replay.txt"
            path.write_text(
                "Analyzing 2026-05-01...\n"
                "Team A vs Team B: Over 1.5 Goals | EV 20.0% | Rank=high\n"
                "   MATCH: Team A 2-1 Team B\n"
                "   PICK : Over 1.5 Goals @ 1.5 -> WON\n",
                encoding="utf-8",
            )

            picks = load_replay_log(path)

        self.assertEqual(len(picks), 1)
        self.assertEqual(picks[0].date, "2026-05-01")
        self.assertEqual(picks[0].grade, "won")
        self.assertGreater(picks[0].kelly_pct, 0)

    def test_validation_rejects_tiny_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "vault.csv"
            path.write_text(
                "date,prediction,odds,ev_pct,kelly_pct,grade\n"
                "2026-05-01,Over 1.5 Goals,1.5,10,5,won\n",
                encoding="utf-8",
            )

            valid, notes = validate_picks(load_vault_csv(path))

        self.assertFalse(valid)
        self.assertTrue(any("Only 1 graded picks" in note for note in notes))


if __name__ == "__main__":
    unittest.main()
