const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football';

// ── In-memory cache with TTL ─────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 60_000; // 60 seconds

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
    return entry.value;
}

function cacheSet(key, value) {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Per-endpoint rate limiter ─────────────────────────────────────────────────
const rateLimits = new Map();
const RL_WINDOW_MS = 60_000; // 1 minute
const RL_MAX_REQS = 10;      // 10 req/min per endpoint

function rateLimit(key) {
    const now = Date.now();
    const entry = rateLimits.get(key);
    if (!entry || now > entry.windowEnd) {
        rateLimits.set(key, { count: 1, windowEnd: now + RL_WINDOW_MS });
        return true;
    }
    if (entry.count >= RL_MAX_REQS) return false;
    entry.count++;
    return true;
}

export const fetchSportmonksServerSide = async (path) => {
    const token = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
    if (!token) {
        console.warn('[Sportmonks] No API token configured');
        return null;
    }

    // Normalize path for cache/rate-limit keys (strip leading ? if present)
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const cacheKey = normalizedPath;
    const rlKey = normalizedPath.split('?')[0]; // rate-limit by endpoint path only

    // Check rate limit
    if (!rateLimit(rlKey)) {
        console.warn(`[Sportmonks] Rate limit exceeded for ${rlKey} — skipping request`);
        return null;
    }

    // Check cache
    const cached = cacheGet(cacheKey);
    if (cached !== null) return cached;

    try {
        let allData = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 50) {
            const pagePath = normalizedPath.includes('?') ? `${normalizedPath}&page=${page}` : `${normalizedPath}?page=${page}`;
            const separator = pagePath.includes('?') ? '&' : '?';
            const url = `${SPORTMONKS_BASE}${pagePath}${separator}api_token=${token}`;

            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`[Sportmonks] API error (${res.status}) on ${pagePath}`);
                break;
            }

            const json = await res.json();
            if (json.data && Array.isArray(json.data)) {
                allData = allData.concat(json.data);
            } else if (json.data) {
                cacheSet(cacheKey, json.data);
                return json.data;
            }

            hasMore = !!json.pagination?.has_more;
            page++;
        }

        const result = allData.length > 0 ? allData : null;
        if (result) cacheSet(cacheKey, result);
        return result;
    } catch (e) {
        console.warn('[Sportmonks] Fetch error:', e.message);
        return null;
    }
};

export const getTodaysFixtures = async (dateStr) => {
    return fetchSportmonksServerSide(`/fixtures/date/${dateStr}?include=league;participants;scores`);
};

export const getFixturesForDateRange = async (startDate, endDate) => {
    return fetchSportmonksServerSide(`/fixtures/between/${startDate}/${endDate}?include=league;participants;scores`);
};

export const getHeadToHead = async (homeId, awayId) => {
    return fetchSportmonksServerSide(`/fixtures/head-to-head/${homeId}/${awayId}?include=participants;scores&per_page=5`);
};

export const getTeamRecentForm = async (teamId, fromDate, toDate) => {
    return fetchSportmonksServerSide(`/fixtures/between/${fromDate}/${toDate}?include=participants;scores&filters=fixtureParticipants:${teamId}&per_page=5`);
};

export const getLiveScores = async () => {
    return fetchSportmonksServerSide('/livescores/latest?include=league;participants;scores;events;state');
};

export default {
    fetchSportmonksServerSide,
    getTodaysFixtures,
    getFixturesForDateRange,
    getHeadToHead,
    getTeamRecentForm,
    getLiveScores,
};