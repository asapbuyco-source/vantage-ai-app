import fetch from 'node-fetch'; // Polyfill or use native Node 18 fetch

async function run() {
    const token = process.env.SPORTMONKS_API_TOKEN;
    if (!token) { console.error('❌ SPORTMONKS_API_TOKEN not set in environment'); process.exit(1); }
    const path = '/fixtures/date/2026-02-28?include=league;participants;scores';
    const separator = path.includes('?') ? '&' : '?';
    const url = `https://api.sportmonks.com/v3/football${path}${separator}api_token=${token}`;

    try {
        console.log("Fetching: " + url.replace(token, "SECRET"));
        const res = await fetch(url);
        console.log("Status: ", res.status);
        if (!res.ok) {
            console.log("Error body: ", await res.text());
        } else {
            const data = await res.json();
            console.log("Returned fixtures count: ", data.data?.length);
            if (data.data?.length > 0) {
                console.log("First fixture:", data.data[0].id, data.data[0].name);
                const h = data.data[0].participants?.find(p => p.meta?.location === 'home')?.name;
                const a = data.data[0].participants?.find(p => p.meta?.location === 'away')?.name;
                console.log(`First fixture teams: ${h} vs ${a}`);
            }
        }
    } catch (e) {
        console.error("Fetch threw:", e);
    }
}
run();
