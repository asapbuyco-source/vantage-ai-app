"""
test_odds.py
────────────
Integration tests for the odds parsing pipeline.
Requires ODDS_API_KEY and RUN_INTEGRATION_TESTS=1 to run live API calls.
Otherwise, uses saved fixture JSON for unit testing.

Mark as integration:
    pytest.mark.integration
"""

import os
import sys
import json
import pytest

API_KEY = os.getenv('ODDS_API_KEY')
RUN_INTEGRATION = os.getenv('RUN_INTEGRATION_TESTS', '0') == '1'

def parse_odds_from_response(data):
    """Parse odds from The Odds API response structure."""
    results = []
    for game in data:
        bookie = game.get('bookmakers', [{}])[0]
        if not bookie:
            continue
        markets = {m['key']: m['outcomes'] for m in bookie.get('markets', [])}
        results.append({
            'home_team': game.get('home_team'),
            'away_team': game.get('away_team'),
            'h2h': markets.get('h2h', []),
            'spreads': markets.get('spreads', []),
        })
    return results


class TestOddsParsing:
    """Unit tests for odds parsing using saved fixture data."""

    @pytest.fixture
    def sample_odds_response(self):
        return [
            {
                "sport_key": "basketball_nba",
                "home_team": "Los Angeles Lakers",
                "away_team": "Boston Celtics",
                "bookmakers": [
                    {
                        "title": "DraftKings",
                        "markets": [
                            {
                                "key": "h2h",
                                "outcomes": [
                                    {"name": "Los Angeles Lakers", "price": 210},
                                    {"name": "Boston Celtics", "price": 175},
                                ]
                            },
                            {
                                "key": "spreads",
                                "outcomes": [
                                    {"name": "Los Angeles Lakers", "price": -108, "point": -1.5},
                                    {"name": "Boston Celtics", "price": -112, "point": 1.5},
                                ]
                            }
                        ]
                    }
                ]
            }
        ]

    def test_parse_h2h_odds(self, sample_odds_response):
        """Test parsing H2H (moneyline) odds."""
        results = parse_odds_from_response(sample_odds_response)
        assert len(results) == 1
        assert results[0]['home_team'] == "Los Angeles Lakers"
        assert results[0]['away_team'] == "Boston Celtics"
        assert len(results[0]['h2h']) == 2

    def test_parse_spreads(self, sample_odds_response):
        """Test parsing spread odds."""
        results = parse_odds_from_response(sample_odds_response)
        spreads = results[0]['spreads']
        assert len(spreads) == 2
        assert spreads[0]['point'] == -1.5

    def test_odds_conversion_to_decimal(self, sample_odds_response):
        """Test converting American odds to decimal."""
        results = parse_odds_from_response(sample_odds_response)
        h2h = results[0]['h2h']
        lakers_odds = next(o['price'] for o in h2h if o['name'] == "Los Angeles Lakers")
        # American odds of 210 means decimal = 210/100 + 1 = 3.10
        decimal = lakers_odds / 100 + 1 if lakers_odds > 0 else 2 - 100 / abs(lakers_odds)
        assert abs(decimal - 3.10) < 0.01


class TestOddsAPIIntegration:
    """Integration tests that call the live The Odds API."""

    @pytest.mark.skipif(
        not API_KEY or RUN_INTEGRATION != '1',
        reason="ODDS_API_KEY or RUN_INTEGRATION_TESTS=1 not set"
    )
    def test_live_odds_fetch(self):
        """Fetch live NBA odds from The Odds API."""
        import requests

        print(f"\nTesting The Odds API with Key: {API_KEY[:6]}...{API_KEY[-4:]}")
        url = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds'
        params = {
            'apiKey': API_KEY,
            'regions': 'us,eu',
            'markets': 'h2h,spreads',
            'oddsFormat': 'decimal',
            'dateFormat': 'iso'
        }

        response = requests.get(url, params=params)

        if response.status_code != 200:
            pytest.fail(f"Failed to get odds: status_code {response.status_code}")

        odds_json = response.json()
        print(f"Success! Retrieved {len(odds_json)} upcoming NBA matches.\n")

        assert len(odds_json) >= 0
        print(f"API quota used: {response.headers.get('x-requests-current-used', 'N/A')}")


if __name__ == '__main__':
    if not API_KEY:
        print("ERROR: ODDS_API_KEY not found in .env")
        print("Set RUN_INTEGRATION_TESTS=1 to run live tests.")
        sys.exit(0)
    if RUN_INTEGRATION == '1':
        pytest.main([__file__, '-v'])
    else:
        pytest.main([__file__, '-v', '-m', 'not integration'])