"""
worldfootballr_client.py
────────────────────────
Subprocess logic for running the R library worldfootballR to grab comprehensive stats:
  - FBref data
  - Transfermarkt data
  - Understat data
  - Fotmob data

Note: This is only used if R is installed on the host environment.
Lower priority - not actively used unless R runtime is available.
"""

import os
import sys
import subprocess
from typing import Optional

def run_worldfootballr_script(script: str) -> Optional[str]:
    """
    Run a worldfootballR R script and return the output.
    Requires R to be installed on the host system.
    Returns None if R is not available or script fails.
    """
    try:
        result = subprocess.run(
            ["Rscript", "-e", script],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            print(f"[worldfootballR] Script failed: {result.stderr}", file=sys.stderr)
            return None
        return result.stdout
    except FileNotFoundError:
        print("[worldfootballR] R not found on system - functionality disabled", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[worldfootballR] Execution failed: {e}", file=sys.stderr)
        return None

def fetch_fbref_team_stats(team_name: str, league: str = " Premier League", season: str = "2023/24") -> Optional[dict]:
    """
    Fetch FBref team statistics via worldfootballR.
    Placeholder - requires R runtime with worldfootballR package installed.
    """
    script = f'''
library(worldfootballR)
Sys.setenv(R_FUTURE_PLANNERS_DISABLE="true")
data <- fb_team_stats(team_url = "https://fbref.com/en/squads/...
", stat_type = "standard")
print(data)
'''
    output = run_worldfootballr_script(script)
    if output:
        return {"data": output}
    return None

def fetch_transfermarkt_injuries(team_id: str) -> Optional[list]:
    """
    Fetch Transfermarkt injury data via worldfootballR.
    Placeholder - requires R runtime with worldfootballR package installed.
    """
    print("[worldfootballR] Transfermarkt fetching not yet implemented", file=sys.stderr)
    return None
