import sys
import os
import json
sys.path.append(os.path.join(os.getcwd(), "backend", "quant"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local")

from api_football_client import _get

def main():
    date_str = "2026-06-20"
    data = _get("fixtures", {"date": date_str})
    if data:
        print(f"Data response keys: {data.keys()}")
        print(f"Errors: {data.get('errors')}")
        print(f"Results count: {data.get('results')}")
    else:
        print("Data is None")

if __name__ == "__main__":
    main()
