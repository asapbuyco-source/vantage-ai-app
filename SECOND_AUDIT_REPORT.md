# VANTAGE AI — SECOND AUDIT REPORT
**Date:** March 20, 2026  
**Focus:** Assessment of changes made (H2H Data Integration + API-Football.org)  
**Review Type:** Delta Audit (changes vs. original)

---

## WHAT YOU CHANGED ✅

### 1. **Added Football-Data.org (API-Sports) Integration**

**Files Modified:**
- `backend/quant/data_pipeline.py` — H2H fetching + caching
- `backend/quantService.js` — Environment variable forwarding
- `.env.example` — Configuration documentation
- `backend/quant/basketball_pipeline.py` — API key usage
- Increased `MAX_MATCHES` from 50 → 100

**New Functions in data_pipeline.py:**
```python
_af_get()              # GET requests to API-Football with auth
_af_find_team_id()    # Resolve team names to API-Football IDs  
_fetch_h2h_cached()   # Fetch H2H with Firestore caching (30-day TTL)
```

**Impact:**
- ✅ Solves H2H data problem (Sportmonks Pro plan missing it)
- ✅ Adds intelligent caching (Firestore, 30-day TTL)
- ✅ Reduces H2H weight from 0% → can be enabled in ensemble

---

## WHAT YOU DIDN'T CHANGE ❌

### 2. **No Tier 1 Fixes Implemented** (CRITICAL)

Expected from Priority Recommendations:
- [ ] Exponential backoff retry logic → **MISSING**
- [ ] Sentry error tracking → **MISSING**
- [ ] Health check endpoint (`/health/python`) → **MISSING**
- [ ] Structured logging (Pino) → **MISSING**
- [ ] Firebase init verification → **MISSING**

---

## DETAILED AUDIT OF YOUR CHANGES

### Change #1: Football-Data.org H2H Integration

**Quality: B** (Good but risky)

**What Works:**
```python
✅ _af_get() has timeout (15s)
✅ Error handling on API calls (try/catch)
✅ Team ID caching in memory
✅ Firestore caching with 30-day TTL
✅ Fallback to default values on failure
✅ Team name matching (exact + fuzzy)
```

**Critical Issues:**

1. **No retry logic on API-Football calls** 🔴
   ```python
   data = _af_get("fixtures/headtohead", {"h2h": f"{af_home}-{af_away}"})
   if not data or not data.get("response"):
       return default  # ← Silent failure, returns (0,0,0) defaults
   ```
   - If API temporarily fails → system uses zero H2H data
   - No exponential backoff, no retry attempt
   - Silent failure masks problems

2. **Firestore cache call unprotected** 🔴
   ```python
   db = gfs.Client()  # ← Can crash if not initialized
   cache_doc = db.collection("h2h_cache").document(cache_key).get()
   ```
   - No Firebase availability check
   - No timeout on Firestore read
   - If Firestore down → entire function crashes

3. **API rate limit risk** 🟡
   ```python
   AF_KEY has 100 calls/day limit (free plan)
   But calling _af_find_team_id() for every match = unnecessary calls
   ```
   - Should cache team IDs permanently (S3 or Firestore, not just memory)
   - Memory cache lost on server restart

4. **No logging of H2H quality** 🟡
   ```python
   result = (hw, aw, dr, round(avg_goals, 2), round(btts_rate, 3))
   # ← No indication if this is from:
   #    - Fresh API call
   #    - Firestore cache (how old?)
   #    - Defaults (no data found)
   ```
   - Can't debug which matches used real vs. fallback data

**Severity:** Medium (works when APIs up, fails silently when down)

---

### Change #2: Environment Variable Forwarding

**Quality: A-** (Good)

```javascript
// quantService.js
API_FOOTBALL_KEY: process.env.VITE_FOOTBALL_API_KEY || process.env.API_FOOTBALL_KEY || '',
```

**What's Good:**
- ✅ Dual fallback (prefers VITE_ prefix, fallback to API_FOOTBALL_KEY)
- ✅ Documented in .env.example
- ✅ Safely propagates to Python subprocess

**Issue:**
- ⚠️ If both missing → empty string passed to Python
- Python silently skips H2H (correct), but no warning logged

---

### Change #3: MAX_MATCHES 50 → 100

**Quality: C** (Incomplete)

```python
MAX_MATCHES = 100  # Was 50
```

**Issues:**
1. **No corresponding increase in model capacity** 🔴
   - Your original limit was 50 because Python times out on massive analysis
   - 100 matches × 3 models × preprocessing = likely 10+ min execution
   - Python timeout is still 10 minutes → new bottleneck

2. **No performance testing** 🟡
   - Have you tested with 100 matches? How long does it take?
   - Is it still under 10-min timeout?

3. **No Firestore quota review** 🟡
   - 100 matches × ~100 predictions = 10,000 Firestore writes/day
   - Costs scale linearly

---

## PRODUCTION READINESS: **STILL 30-40%** (No improvement)

| Category | Before | After | Status |
|----------|--------|-------|--------|
| **Error Handling** | D- | D | ❌ Worse (more APIs = more failures) |
| **Retry Logic** | F | F | ❌ No improvement |
| **Observability** | F | F | ❌ Still zero monitoring |
| **Data Sources** | C (1 vendor) | D+ (2 vendors) | 🟡 More risk, not less |
| **Data Quality** | C | B- | ✅ H2H data now available |
| **Testability** | D- | D | ❌ Complex H2H caching untested |

---

## WHAT WENT WRONG

**You chose to add a new feature (H2H data) instead of fixing critical stability issues.**

This is backwards prioritization:

```
Priority 1: Make system STABLE (doesn't crash)
Priority 2: Make system OBSERVABLE (can see what's wrong)  
Priority 3: Add features (better data sources)

← You did Priority 3 first
```

**Result:**
- System now depends on 2 external APIs (Sportmonks + API-Football)
- Both can fail independently
- Neither has retry logic
- Complexity increased, reliability decreased

---

## RISKS INTRODUCED

### 🔴 TIER 1: SYSTEM-BREAKING

1. **Firestore cache unprotected** — Function crashes if Firestore unavailable
   ```python
   db = gfs.Client()  # No check if initialized
   ```

2. **Silent H2H failures** — If API-Football down, system silently uses defaults
   ```python
   if not data or not data.get("response"):
       return default  # No error logged
   ```

3. **Rate limit exhaustion** — Team ID cache lost on restart, spends quota on re-lookups
   ```python
   _af_team_id_cache: dict[str, int] = {}  # Memory only
   ```

### 🟡 TIER 2: OPERATIONAL

4. **Increased API complexity** — 2 vendors instead of 1, no vendor strategy
5. **No fallback chain** — If API-Football down, no alternative (Football-Data.org not implemented)
6. **Untested at scale** — Changed MAX_MATCHES to 100 without performance testing

---

## SPECIFIC CODE ISSUES

### Issue #1: Unprotected Firestore Access

**Current (Broken):**
```python
def _fetch_h2h_cached(...):
    try:
        from google.cloud import firestore as gfs
        db = gfs.Client()  # ← Can crash if not available
        cache_doc = db.collection("h2h_cache").document(cache_key).get()
        if cache_doc.exists:
            cd = cache_doc.to_dict()
    except Exception:
        pass  # ← Silent catch-all
```

**Problems:**
- `gfs.Client()` could fail
- No timeout on `.get()`
- Exception swallowed without logging

**FIXED VERSION:**
```python
def _fetch_h2h_cached(...):
    default = (0, 0, 0, _league_avg(league_id), 0.45)
    
    if not AF_KEY:
        return default
    
    # ── Check Firestore cache with exception handling ────────────────────
    try:
        from google.cloud import firestore as gfs
        db = gfs.Client()
        
        # Use timeout on read
        cache_doc = db.collection("h2h_cache").document(cache_key).get(timeout=5)
        
        if cache_doc.exists:
            cd = cache_doc.to_dict()
            cached_at = cd.get("cached_at", "")
            try:
                ct = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                # Cache valid for 30 days
                if (datetime.now(timezone.utc) - ct).days < 30:
                    print(f"[H2H] Using cached data for {cache_key}", file=sys.stdout)
                    return (cd.get("hw", 0), cd.get("aw", 0), cd.get("dr", 0),
                            cd.get("avg_goals", default[3]), cd.get("btts_rate", 0.45))
            except Exception as e:
                print(f"[H2H] Cache date parse error: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[H2H] Firestore unavailable: {e}", file=sys.stderr)
        # Continue with API call (don't retry cache)
```

---

### Issue #2: Silent API Failures

**Current (Broken):**
```python
af_home = _af_find_team_id(home_name)
af_away = _af_find_team_id(away_name)
if not af_home or not af_away:
    print(f"[H2H] Could not find API-Football IDs for {home_name} / {away_name}")
    return default  # ← Silently returns default, H2H data lost
```

**Problems:**
- If API-Football down → prints to stderr, user never sees it
- System continues with incorrect data

**FIXED VERSION:**
```python
# Add attempt counter + fallback logging
attempt = 0
max_attempts = 2
delay_ms = 1000

while attempt < max_attempts:
    try:
        af_home = _af_find_team_id(home_name)
        af_away = _af_find_team_id(away_name)
        
        if af_home and af_away:
            break  # Success
        
        # Team not found — log and return default
        print(f"[H2H] Team IDs not found: {home_name}/{away_name}", file=sys.stderr)
        return default
        
    except Exception as e:
        attempt += 1
        if attempt < max_attempts:
            print(f"[H2H] API lookup failed (attempt {attempt}), retrying in {delay_ms}ms...", file=sys.stderr)
            import time
            time.sleep(delay_ms / 1000)
        else:
            print(f"[H2H] API lookup failed after {max_attempts} attempts: {e}", file=sys.stderr)
            return default
```

---

### Issue #3: Memory-Only Team Cache

**Current (Breaks on Restart):**
```python
_af_team_id_cache: dict[str, int] = {}  # Lost on server restart!

def _af_find_team_id(team_name: str) -> int | None:
    if team_name in _af_team_id_cache:
        return _af_team_id_cache[team_name]  # ← Only in memory
    # API call (burns API quota)
```

**Problems:**
- Football-Data.org free plan: 100 calls/day
- Server restart with ~30 matches → cache cleared → re-lookup 30 teams = 30 API calls wasted
- After 3-4 restarts → quota exhausted, system fails

**FIXED VERSION:**
```python
def _load_team_cache():
    """Load team ID cache from Firestore (persistent)."""
    cache = {}
    try:
        from google.cloud import firestore as gfs
        db = gfs.Client()
        cache_doc = db.collection("system_cache").document("af_team_ids").get()
        if cache_doc.exists:
            cache = cache_doc.to_dict().get("teams", {})
    except Exception as e:
        print(f"[H2H] Failed to load team cache from Firestore: {e}", file=sys.stderr)
    return cache

def _save_team_cache(cache):
    """Persist team cache to Firestore."""
    try:
        from google.cloud import firestore as gfs
        db = gfs.Client()
        db.collection("system_cache").document("af_team_ids").set({
            "teams": cache,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        print(f"[H2H] Failed to save team cache: {e}", file=sys.stderr)

# Load cache at startup
_af_team_id_cache = _load_team_cache()

def _af_find_team_id(team_name: str) -> int | None:
    global _af_team_id_cache
    
    if team_name in _af_team_id_cache:
        return _af_team_id_cache[team_name]  # From persistent cache
    
    data = _af_get("teams", {"search": team_name})
    if data and data.get("response"):
        for t in data["response"]:
            tid = t.get("team", {}).get("id")
            name = t.get("team", {}).get("name", "")
            if name.lower() == team_name.lower():
                _af_team_id_cache[team_name] = tid
                _save_team_cache(_af_team_id_cache)  # Persist
                return tid
        tid = data["response"][0].get("team", {}).get("id")
        if tid:
            _af_team_id_cache[team_name] = tid
            _save_team_cache(_af_team_id_cache)  # Persist
            return tid
    return None
```

---

## VERDICT

### **Your Changes: B- (Good data source, poor implementation)**

| Aspect | Status | Notes |
|--------|--------|-------|
| **Concept** | ✅ Excellent | Solving H2H problem is right priority |
| **Execution** | ⚠️ Risky | No retry logic, unprotected Firestore, silent failures |
| **Testing** | ❌ None | Features untested at scale |
| **Error Handling** | ❌ Weak | Silent failures, no logging |
| **Production Ready** | ❌ No | Introduces new failure modes |

### **Production Readiness: STILL 30-40%** (unchanged from first audit)

You've added complexity without fixing the foundation.

---

## RECOMMENDED CORRECTIONS (Priority Order)

```
TIER 1 (FIX NOW):
□ Add try/catch protection to Firestore cache access
□ Add retry logic to _af_find_team_id() (2 retries, backoff)
□ Persist team cache to Firestore (not just memory)
□ Log all H2H cache hits/misses (for debugging)
□ Add timeout to all Firestore calls

TIER 2 (BEFORE LAUNCH):
□ Performance test: 100 matches × H2H lookups → measure execution time
□ Verify Python timeout still adequate
□ Monitor API-Football quota (log calls remaining)
□ Add fallback if API-Football unavailable (use Football-Data.org instead)

TIER 3 (MONITORING):
□ Alert on API rate limit approaching
□ Track H2H cache hit rate (should be >95% after warmup)
□ Monitor Firestore cache staleness
```

---

## MISSING: TIER 1 FIXES

**These still need to be done:**

✗ **Exponential backoff in quantService.js** — Python timeout crashes pipeline  
✗ **Health check endpoint** — Can't verify Python service  
✗ **Structured logging** — Can't debug production issues  
✗ **Sentry integration** — Errors disappear silently  
✗ **Firebase init verification** — Can crash on startup  

**Without these, even if H2H works perfectly, the system is still fragile.**

---

## NEXT STEPS

1. **Apply corrections** to H2H code (Tier 1 above)
2. **THEN implement Tier 1 fixes** from first audit (retry logic, logging, health check)
3. **Test at 100 matches** with time tracking
4. **Monitor API quota** on Football-Data.org

**Current status: 40% complete on data improvements, 0% complete on stability.**

Do you want me to implement the corrections to your H2H code now?
