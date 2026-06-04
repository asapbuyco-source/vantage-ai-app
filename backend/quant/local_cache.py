"""
local_cache.py
──────────────
Local disk cache for Sportmonks API responses.

Stores JSON responses in .vantage_cache/ so that replay runs
don't hit the API for dates already fetched. This is critical
for backtesting — a 60-day replay would otherwise cost thousands
of API calls on every run.

Cache structure:
    .vantage_cache/
        fixtures/
            2025-03-14.json      # fetch_matches response (fixture list)
        scores/
            12345.json           # Individual fixture scores (for grading)
        form/
            team_12345.json      # Team form data (cached per team per date range)

Usage:
    from local_cache import LocalCache
    cache = LocalCache()

    # Transparent get with cache-through
    data = cache.get_or_fetch("/fixtures/date/2025-03-14", params={...}, fetch_fn=_get)
"""

import os
import json
import hashlib
import time
from datetime import datetime, timezone, timedelta

LAGOS_TZ = timezone(timedelta(hours=1))
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".vantage_cache")

class LocalCache:
    def __init__(self, cache_dir: str = CACHE_DIR, ttl_days: int = 90):
        self.cache_dir = cache_dir
        self.ttl_days = ttl_days
        self.hits = 0
        self.misses = 0
        os.makedirs(os.path.join(cache_dir, "fixtures"), exist_ok=True)
        os.makedirs(os.path.join(cache_dir, "scores"), exist_ok=True)
        os.makedirs(os.path.join(cache_dir, "form"), exist_ok=True)
        os.makedirs(os.path.join(cache_dir, "misc"), exist_ok=True)

    def _cache_key(self, path: str, params: dict | None = None) -> str:
        raw = path
        if params:
            for k in sorted(params.keys()):
                if k != "api_token" and k != "page":
                    raw += f"&{k}={params[k]}"
        return hashlib.md5(raw.encode()).hexdigest()[:12]

    def _category_and_key(self, path: str, params: dict | None = None) -> tuple[str, str]:
        path_lower = path.lower()

        if "/fixtures/date/" in path_lower:
            date_str = path.split("/date/")[-1].split("?")[0].split("&")[0]
            return "fixtures", date_str

        if "/fixtures/between/" in path_lower:
            team_id = ""
            if params and "participantSearch" in params:
                team_id = f"team_{params['participantSearch']}"
            from_date = path.split("/between/")[-1].split("/")[0] if "/between/" in path else ""
            to_parts = path.split("/")
            to_date = ""
            for i, p in enumerate(to_parts):
                if p == "between" and i + 2 < len(to_parts):
                    to_date = to_parts[i + 2].split("?")[0]
            key = f"{from_date}_to_{to_date}_{team_id}" if team_id else f"{from_date}_to_{to_date}"
            return "form", key

        if path.startswith("/fixtures/") and "/date/" not in path_lower and "/between/" not in path_lower:
            fid = path.split("/fixtures/")[-1].split("?")[0].split("/")[0]
            return "scores", f"fixture_{fid}"

        return "misc", self._cache_key(path, params)

    def get(self, path: str, params: dict | None = None) -> dict | list | None:
        category, key = self._category_and_key(path, params)
        fpath = os.path.join(self.cache_dir, category, f"{key}.json")
        if not os.path.exists(fpath):
            return None
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            cached_at = data.get("_cached_at", "")
            if cached_at:
                try:
                    ct = datetime.fromisoformat(cached_at)
                    if (datetime.now(timezone.utc) - ct).days > self.ttl_days:
                        return None
                except Exception:
                    pass
            self.hits += 1
            return data.get("response")
        except Exception:
            return None

    def put(self, path: str, params: dict | None, response) -> None:
        category, key = self._category_and_key(path, params)
        fpath = os.path.join(self.cache_dir, category, f"{key}.json")
        try:
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump({
                    "_cached_at": datetime.now(timezone.utc).isoformat(),
                    "_path": path,
                    "response": response,
                }, f, ensure_ascii=False, default=str)
        except Exception as e:
            print(f"[LocalCache] Write error for {key}: {e}", file=__import__("sys").stderr)

    def get_or_fetch(self, path: str, params: dict | None, fetch_fn) -> dict | list | None:
        cached = self.get(path, params)
        if cached is not None:
            return cached
        response = fetch_fn(path, params)
        if response is not None:
            self.put(path, params, response)
            self.misses += 1
        return response

    def stats(self) -> str:
        total = self.hits + self.misses
        pct = (self.hits / total * 100) if total > 0 else 0
        return f"Cache: {self.hits} hits / {self.misses} misses ({pct:.0f}% hit rate)"

    def clear(self):
        import shutil
        if os.path.exists(self.cache_dir):
            shutil.rmtree(self.cache_dir)
        os.makedirs(os.path.join(self.cache_dir, "fixtures"), exist_ok=True)
        os.makedirs(os.path.join(self.cache_dir, "scores"), exist_ok=True)
        os.makedirs(os.path.join(self.cache_dir, "form"), exist_ok=True)
        os.makedirs(os.path.join(self.cache_dir, "misc"), exist_ok=True)
        self.hits = 0
        self.misses = 0