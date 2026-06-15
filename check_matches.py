import requests
import json

TOKEN = "m55Ud6uKvc3rpzuU3tOKJi46oIZ5YOTK1T8i0kRrcYoAldJ9vTEEKjTa4FBS"
DATE = "2026-06-13"
url = f"https://api.sportmonks.com/v3/football/fixtures/date/{DATE}?api_token={TOKEN}"
r = requests.get(url)
print(f"Status Code: {r.status_code}")
data = r.json()
if "data" in data:
    print(f"Matches today: {len(data['data'])}")
    if data['data']:
        print(f"First match ID: {data['data'][0]['id']}")
else:
    print(data)
