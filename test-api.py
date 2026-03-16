import requests

TOKEN = 'jFxFL5OlyrkkV9Aa1WcgwNV5kPpMuCCGfvNgmgLx5FGJ21joEHsHG47809Bn'

urls = [
    'https://api.sportmonks.com/v3/football/fixtures/date/2026-03-16',
    'https://api.sportmonks.com/v3/football/fixtures',
    'https://api.sportmonks.com/v3/core/my/subscription',
    'https://api.sportmonks.com/v3/my/subscription'
]

for url in urls:
    params = {'api_token': TOKEN}
    if 'fixtures' in url and '/date/' not in url:
        params['filters'] = 'fixtureDate:2026-03-16'
        
    print(f"\n--- GET {url} ---")
    try:
        r = requests.get(url, params=params, timeout=10)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")
