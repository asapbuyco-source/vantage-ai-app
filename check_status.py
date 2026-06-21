import sys
import os
import json
sys.path.append(os.path.join(os.getcwd(), "backend", "quant"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local")

import requests

def main():
    api_key = os.environ.get("API_FOOTBALL_KEY")
    if not api_key:
        print("No API key")
        return
        
    url = "https://v3.football.api-sports.io/status"
    headers = {
        "x-apisports-key": api_key
    }
    
    resp = requests.get(url, headers=headers)
    print(resp.json())

if __name__ == "__main__":
    main()
