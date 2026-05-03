import fetch from 'node-fetch';

async function run() {
    const token = process.env.SPORTMONKS_API_TOKEN;
    if (!token) {
        console.error('SPORTMONKS_API_TOKEN environment variable is not set');
        process.exit(1);
    }
    const path = '/fixtures/date/2026-02-28?include=league;participants;scores';

    let allData = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
        const pagePath = path.includes('?') ? `${path}&page=${page}` : `${path}?page=${page}`;
        const separator = pagePath.includes('?') ? '&' : '?';
        const url = `https://api.sportmonks.com/v3/football${pagePath}${separator}api_token=${token}`;

        console.log(`Fetching page ${page}...`);
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) {
            console.warn(`Error (${res.status})`);
            break;
        }
        const json = await res.json();

        if (json.data && Array.isArray(json.data)) {
            allData = allData.concat(json.data);
        } else if (json.data) {
            return json.data;
        }

        if (json.pagination && json.pagination.has_more) {
            page++;
        } else {
            hasMore = false;
        }
    }

    console.log(`Total fixtures fetched: ${allData.length} over ${page} pages.`);
}
run();
