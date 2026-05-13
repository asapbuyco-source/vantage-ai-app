/**
 * staticDataSeeder.js
 * ───────────────────
 * One-time seeder for semi-permanent Sportmonks data.
 * 
 * Fetches data that NEVER or RARELY changes (leagues, countries, team metadata,
 * season standings) and stores it in Firestore under `static_cache/{key}`.
 * 
 * The frontend and quant pipeline read from Firestore instead of hitting
 * the Sportmonks API on every request — saving hundreds of API calls per day.
 *
 * Run manually:   node backend/staticDataSeeder.js
 * Auto-run:       Weekly cron (Sunday 02:00 Lagos) in scheduler.js
 *
 * Data seeded:
 *   - Approved leagues metadata (name, country, logo, tier)
 *   - Country list (for flag display)
 *   - Season IDs for approved leagues (current season)
 *   - Team metadata for all teams in approved leagues (name, logo, short_name)
 *   - Standings for all approved leagues (league table positions)
 */

import admin from 'firebase-admin';

const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football';

// Approved league IDs (must match backend/quant/league_config.py)
const APPROVED_LEAGUE_IDS = [
    8,    // Premier League
    82,   // Bundesliga
    301,  // La Liga
    384,  // Serie A
    2,    // Ligue 1
    5,    // Eredivisie
    72,   // Liga NOS (Portugal)
    564,  // Championship
    462,  // Scottish Premiership
    7,    // Liga MX
];

// Static cache TTL — 7 days in Firestore (data rarely changes)
const STATIC_TTL_DAYS = 7;

async function smGet(token, path, params = {}) {
    const url = new URL(`${SPORTMONKS_BASE}${path}`);
    url.searchParams.set('api_token', token);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    
    const res = await fetch(url.toString());
    if (!res.ok) {
        console.warn(`[Seeder] API error ${res.status} for ${path}`);
        return null;
    }
    return res.json();
}

async function smGetPaginated(token, path, params = {}) {
    const allData = [];
    let page = 1;
    while (true) {
        const json = await smGet(token, path, { ...params, page });
        if (!json) break;
        const data = json.data || [];
        if (Array.isArray(data)) allData.push(...data);
        else if (data) allData.push(data);
        if (!json.pagination?.has_more) break;
        page++;
    }
    return allData;
}

function isStale(doc) {
    if (!doc?.exists) return true;
    const seededAt = doc.data()?.seededAt;
    if (!seededAt) return true;
    const seededMs = new Date(seededAt).getTime();
    return Date.now() - seededMs > STATIC_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export async function seedStaticData(db, token, { force = false } = {}) {
    if (!token) {
        console.error('[Seeder] No Sportmonks token — aborting');
        return;
    }

    console.log('[Seeder] 🌱 Starting static data seed...');
    const ref = db.collection('static_cache');
    const now = new Date().toISOString();

    // ── 1. Leagues Metadata ──────────────────────────────────────────────────
    const leaguesDoc = await ref.doc('leagues').get();
    if (force || isStale(leaguesDoc)) {
        console.log('[Seeder] Fetching leagues...');
        const leagues = {};
        for (const id of APPROVED_LEAGUE_IDS) {
            const json = await smGet(token, `/leagues/${id}`, { include: 'country' });
            if (!json?.data) continue;
            const l = json.data;
            leagues[id] = {
                id: l.id,
                name: l.name,
                shortCode: l.short_code || '',
                logo: l.image_path || '',
                country: l.country?.name || '',
                countryCode: l.country?.official_name || '',
                countryFlag: l.country?.image_path || '',
            };
            await new Promise(r => setTimeout(r, 300)); // gentle rate limit
        }
        await ref.doc('leagues').set({ data: leagues, seededAt: now });
        console.log(`[Seeder] ✅ Seeded ${Object.keys(leagues).length} leagues`);
    } else {
        console.log('[Seeder] ⏭️  Leagues up-to-date, skipping');
    }

    // ── 2. Current Season IDs ─────────────────────────────────────────────────
    const seasonsDoc = await ref.doc('seasons').get();
    if (force || isStale(seasonsDoc)) {
        console.log('[Seeder] Fetching current seasons...');
        const seasons = {};
        for (const leagueId of APPROVED_LEAGUE_IDS) {
            const json = await smGet(token, `/seasons`, { 'filter[league_id]': leagueId });
            if (!json?.data) continue;
            // Get the most recent season by ID (highest ID = current)
            const sorted = (Array.isArray(json.data) ? json.data : [json.data])
                .filter(s => s.is_current_season)
                .sort((a, b) => b.id - a.id);
            if (sorted[0]) {
                seasons[leagueId] = {
                    id: sorted[0].id,
                    name: sorted[0].name,
                    year: sorted[0].finished ? 'finished' : 'active',
                };
            }
            await new Promise(r => setTimeout(r, 300));
        }
        await ref.doc('seasons').set({ data: seasons, seededAt: now });
        console.log(`[Seeder] ✅ Seeded ${Object.keys(seasons).length} current seasons`);
    } else {
        console.log('[Seeder] ⏭️  Seasons up-to-date, skipping');
    }

    // ── 3. Team Metadata (name + logo for all approved league teams) ──────────
    const teamsDoc = await ref.doc('teams').get();
    if (force || isStale(teamsDoc)) {
        console.log('[Seeder] Fetching team metadata...');
        const teams = {};
        const seasonsData = (await ref.doc('seasons').get()).data()?.data || {};
        
        for (const leagueId of APPROVED_LEAGUE_IDS) {
            const season = seasonsData[leagueId];
            if (!season?.id) continue;
            const json = await smGet(token, `/teams/seasons/${season.id}`);
            if (!json?.data) continue;
            const teamList = Array.isArray(json.data) ? json.data : [json.data];
            for (const t of teamList) {
                teams[t.id] = {
                    id: t.id,
                    name: t.name,
                    shortName: t.short_code || t.name?.slice(0, 3).toUpperCase() || '',
                    logo: t.image_path || '',
                    leagueId,
                };
            }
            await new Promise(r => setTimeout(r, 400));
        }
        await ref.doc('teams').set({ data: teams, seededAt: now });
        console.log(`[Seeder] ✅ Seeded ${Object.keys(teams).length} team records`);
    } else {
        console.log('[Seeder] ⏭️  Teams up-to-date, skipping');
    }

    // ── 4. League Standings ───────────────────────────────────────────────────
    // Run weekly — standings change every matchday but are not needed real-time.
    const standingsDoc = await ref.doc('standings').get();
    if (force || isStale(standingsDoc)) {
        console.log('[Seeder] Fetching standings...');
        const standings = {};
        const seasonsData = (await ref.doc('seasons').get()).data()?.data || {};

        for (const leagueId of APPROVED_LEAGUE_IDS) {
            const season = seasonsData[leagueId];
            if (!season?.id) continue;
            const json = await smGet(token, `/standings/seasons/${season.id}`);
            if (!json?.data) continue;
            const rows = Array.isArray(json.data) ? json.data : [json.data];
            standings[leagueId] = rows.map(row => ({
                position: row.position,
                teamId: row.participant_id,
                teamName: row.participant?.name || '',
                teamLogo: row.participant?.image_path || '',
                played: row.details?.find(d => d.type_id === 129)?.value || 0,
                won: row.details?.find(d => d.type_id === 130)?.value || 0,
                drawn: row.details?.find(d => d.type_id === 131)?.value || 0,
                lost: row.details?.find(d => d.type_id === 132)?.value || 0,
                goalsFor: row.details?.find(d => d.type_id === 133)?.value || 0,
                goalsAgainst: row.details?.find(d => d.type_id === 134)?.value || 0,
                goalDiff: row.details?.find(d => d.type_id === 135)?.value || 0,
                points: row.points || 0,
                form: row.form || '',
            }));
            await new Promise(r => setTimeout(r, 400));
        }
        await ref.doc('standings').set({ data: standings, seededAt: now });
        console.log(`[Seeder] ✅ Seeded standings for ${Object.keys(standings).length} leagues`);
    } else {
        console.log('[Seeder] ⏭️  Standings up-to-date, skipping');
    }

    // ── 5. Top Scorers ────────────────────────────────────────────────────────
    const scorersDoc = await ref.doc('topscorers').get();
    if (force || isStale(scorersDoc)) {
        console.log('[Seeder] Fetching top scorers...');
        const scorers = {};
        const seasonsData = (await ref.doc('seasons').get()).data()?.data || {};

        for (const leagueId of APPROVED_LEAGUE_IDS) {
            const season = seasonsData[leagueId];
            if (!season?.id) continue;
            const json = await smGet(token, `/topscorers/seasons/${season.id}`, { include: 'player;participant' });
            if (!json?.data) continue;
            const rows = Array.isArray(json.data) ? json.data : [json.data];
            scorers[leagueId] = rows.slice(0, 10).map((row, i) => ({
                rank: i + 1,
                playerId: row.player_id,
                playerName: row.player?.display_name || row.player?.name || 'Unknown',
                teamName: row.participant?.name || '',
                teamLogo: row.participant?.image_path || '',
                goals: row.total || 0,
                assists: row.assists || 0,
                appearances: row.appearances || 0,
            }));
            await new Promise(r => setTimeout(r, 400));
        }
        await ref.doc('topscorers').set({ data: scorers, seededAt: now });
        console.log(`[Seeder] ✅ Seeded top scorers for ${Object.keys(scorers).length} leagues`);
    } else {
        console.log('[Seeder] ⏭️  Top scorers up-to-date, skipping');
    }

    console.log('[Seeder] 🏁 Static data seed complete!');
}

// ── CLI runner ────────────────────────────────────────────────────────────────
if (process.argv[1].includes('staticDataSeeder')) {
    const token = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
    if (!admin.apps.length) {
        try {
            const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '{}';
            const sa = JSON.parse(raw);
            admin.initializeApp({ credential: admin.credential.certificate(sa) });
        } catch (initErr) {
            // Fallback: try Application Default Credentials (works on GCP/Railway)
            console.warn('[Seeder] FIREBASE_SERVICE_ACCOUNT parse failed, trying ADC:', initErr.message);
            admin.initializeApp();
        }
    }
    const db = admin.firestore();
    seedStaticData(db, token, { force: process.argv.includes('--force') })
        .then(() => process.exit(0))
        .catch(e => { console.error(e); process.exit(1); });
}
