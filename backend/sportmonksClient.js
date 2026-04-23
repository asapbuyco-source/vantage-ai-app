const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football';

export const fetchSportmonksServerSide = async (path) => {
    const token = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
    if (!token) {
        console.warn('[Sportmonks] No API token configured');
        return null;
    }

    try {
        let allData = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 50) {
            const pagePath = path.includes('?') ? `${path}&page=${page}` : `${path}?page=${page}`;
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
                return json.data;
            }

            hasMore = !!json.pagination?.has_more;
            page++;
        }

        return allData.length > 0 ? allData : null;
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