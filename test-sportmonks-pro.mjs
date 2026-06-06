/**
 * ========================================================
 * SPORTMONKS PRO SUBSCRIPTION — COMPREHENSIVE API TEST
 * ========================================================
 * Tests all features unlocked by the Pro subscription:
 *  - Core fixtures & leagues (120 leagues)
 *  - Premium Odds Lite (add-on)
 *  - Expected Lineups (add-on)
 *  - News (add-on)
 *  - Euro Club Tournaments
 *  - Standings, H2H, Seasons, Teams, Players
 * ========================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom .env.local parser that strips inline comments (dotenv doesn't strip them)
function parseEnvToken(key) {
    try {
        const raw = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf-8');
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith(key + '=')) {
                let value = trimmed.slice(key.length + 1).trim();
                // Strip inline comment (anything after the first space that starts with letters or parens)
                const spaceIdx = value.indexOf(' ');
                if (spaceIdx !== -1) value = value.slice(0, spaceIdx);
                return value.trim();
            }
        }
    } catch (_) {}
    return null;
}

const TOKEN = process.env.SPORTMONKS_API_TOKEN || parseEnvToken('SPORTMONKS_API_TOKEN');
const BASE = 'https://api.sportmonks.com/v3/football';
const TODAY = new Date().toISOString().split('T')[0];
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

// ── Results collector ────────────────────────────────────
const results = [];

async function smFetch(endpoint, description) {
    const url = `${BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_token=${TOKEN}`;
    const start = Date.now();
    try {
        const res = await fetch(url);
        const latency = Date.now() - start;
        const json = await res.json();
        const count = Array.isArray(json.data) ? json.data.length : (json.data ? 1 : 0);
        const hasData = count > 0;
        const status = res.status;

        results.push({ description, endpoint, status, count, latency, ok: res.ok, sample: hasData ? json.data[0] ?? json.data : null, pagination: json.pagination, subscription: json.subscription });
        return { ok: res.ok, status, count, data: json.data, json, latency };
    } catch (e) {
        results.push({ description, endpoint, status: 'ERROR', count: 0, latency: Date.now() - start, ok: false, error: e.message });
        return { ok: false, error: e.message };
    }
}

function printResult(r) {
    const statusColor = r.ok ? 'green' : (r.status === 403 ? 'yellow' : 'red');
    const statusText = r.ok ? '✅ OK' : (r.status === 403 ? '🔒 FORBIDDEN (not in plan)' : `❌ ${r.status}`);
    console.log(`\n  ${c(statusColor, statusText)} — ${c('bold', r.description)}`);
    console.log(`  ${c('dim', r.endpoint)}`);
    if (r.ok) {
        console.log(`  📦 Records returned: ${c('cyan', r.count)} | ⚡ Latency: ${c('cyan', r.latency + 'ms')}`);
        if (r.sample && typeof r.sample === 'object') {
            const keys = Object.keys(r.sample).slice(0, 8);
            console.log(`  🔑 Sample keys: ${c('dim', keys.join(', '))}`);
        }
    }
    if (r.error) console.log(`  ${c('red', 'Error: ' + r.error)}`);
}

// ── MAIN ─────────────────────────────────────────────────
async function main() {
    if (!TOKEN) {
        console.error(c('red', '❌ SPORTMONKS_API_TOKEN not found in .env.local'));
        process.exit(1);
    }

    console.log(c('bold', '\n╔══════════════════════════════════════════════════════╗'));
    console.log(c('bold', '║   SPORTMONKS PRO — FULL SUBSCRIPTION CAPABILITY TEST  ║'));
    console.log(c('bold', '╚══════════════════════════════════════════════════════╝'));
    console.log(c('dim', `Token: ...${TOKEN.slice(-8)} | Date: ${TODAY}\n`));

    // ── 1. ACCOUNT / SUBSCRIPTION INFO ──────────────────
    console.log(c('blue', '\n▶ [1] ACCOUNT & MY SUBSCRIPTION'));
    const sub = await smFetch('/my-subscription', 'My Subscription Plan Info');
    printResult(results[results.length - 1]);

    const cores = await smFetch('/my-cores', 'My Core Objects (leagues, seasons)');
    printResult(results[results.length - 1]);

    const addons = await smFetch('/my-addons', 'My Add-ons');
    printResult(results[results.length - 1]);

    // ── 2. TODAY'S FIXTURES (BASIC) ──────────────────────
    console.log(c('blue', '\n▶ [2] TODAY\'S FIXTURES'));
    const todayBasic = await smFetch(`/fixtures/date/${TODAY}?include=league;participants;scores;state`, "Today's Fixtures (basic)");
    const firstFixtureId = todayBasic.ok && Array.isArray(todayBasic.data) && todayBasic.data.length > 0 ? todayBasic.data[0].id : null;
    const firstTeamId = todayBasic.ok && Array.isArray(todayBasic.data) && todayBasic.data.length > 0
        ? (todayBasic.data[0].participants?.[0]?.id || null) : null;
    printResult(results[results.length - 1]);

    // ── 3. PREMIUM ODDS LITE (ADD-ON) ───────────────────
    console.log(c('blue', '\n▶ [3] PREMIUM ODDS LITE (ADD-ON)'));
    await smFetch(`/fixtures/date/${TODAY}?include=odds`, "Today's Fixtures with Odds");
    printResult(results[results.length - 1]);

    if (firstFixtureId) {
        await smFetch(`/odds/fixture/${firstFixtureId}`, `Odds for Fixture #${firstFixtureId}`);
        printResult(results[results.length - 1]);

        await smFetch(`/odds/pre-match/fixtures/${firstFixtureId}`, `Pre-Match Odds for Fixture #${firstFixtureId}`);
        printResult(results[results.length - 1]);
    }
    // Bookmakers list
    await smFetch('/bookmakers', 'Available Bookmakers');
    printResult(results[results.length - 1]);

    // Markets list
    await smFetch('/markets', 'Available Betting Markets');
    printResult(results[results.length - 1]);

    // ── 4. EXPECTED LINEUPS (ADD-ON) ────────────────────
    console.log(c('blue', '\n▶ [4] EXPECTED LINEUPS (ADD-ON)'));
    if (firstFixtureId) {
        await smFetch(`/fixtures/date/${TODAY}?include=lineups`, `Today's Fixtures with Lineups`);
        printResult(results[results.length - 1]);

        await smFetch(`/lineups/fixture/${firstFixtureId}`, `Lineup for Fixture #${firstFixtureId}`);
        printResult(results[results.length - 1]);
    }

    // ── 5. NEWS (ADD-ON) ────────────────────────────────
    console.log(c('blue', '\n▶ [5] NEWS (ADD-ON)'));
    await smFetch('/news/pre-match', 'Pre-Match News');
    printResult(results[results.length - 1]);

    await smFetch('/news/in-play', 'In-Play News');
    printResult(results[results.length - 1]);

    if (firstFixtureId) {
        await smFetch(`/news/pre-match/fixture/${firstFixtureId}`, `News for Fixture #${firstFixtureId}`);
        printResult(results[results.length - 1]);
    }

    // ── 6. STANDINGS ─────────────────────────────────────
    console.log(c('blue', '\n▶ [6] STANDINGS'));
    // EPL Season ID (example - season 23614 = EPL 24/25)
    await smFetch('/standings/season/23614', 'EPL 24/25 Standings');
    printResult(results[results.length - 1]);

    // La Liga
    await smFetch('/standings/season/23686', 'La Liga 24/25 Standings');
    printResult(results[results.length - 1]);

    // ── 7. TOP SCORERS / STATISTICS ─────────────────────
    console.log(c('blue', '\n▶ [7] TOP SCORERS & STATISTICS'));
    await smFetch('/topscorers/season/23614', 'EPL 24/25 Top Scorers');
    printResult(results[results.length - 1]);

    // ── 8. H2H (HEAD TO HEAD) ────────────────────────────
    console.log(c('blue', '\n▶ [8] HEAD TO HEAD'));
    // Arsenal (9) vs Chelsea (8) — popular H2H
    await smFetch('/fixtures/head-to-head/9/8', 'H2H: Arsenal vs Chelsea (last 10)');
    printResult(results[results.length - 1]);

    // ── 9. LEAGUES (120 LEAGUES) ─────────────────────────
    console.log(c('blue', '\n▶ [9] LEAGUES (120 IN PLAN)'));
    await smFetch('/leagues?select=id,name,country_id', 'All Leagues in Subscription');
    printResult(results[results.length - 1]);

    await smFetch('/leagues/live', 'Live Leagues Right Now');
    printResult(results[results.length - 1]);

    // ── 10. LIVE FIXTURES ────────────────────────────────
    console.log(c('blue', '\n▶ [10] LIVE FIXTURES'));
    await smFetch('/livescores/latest?include=league;participants;scores;events', 'Live Fixtures with Events');
    printResult(results[results.length - 1]);

    await smFetch('/livescores?include=league;participants;scores;events', 'All Live Fixtures');
    printResult(results[results.length - 1]);

    // ── 11. TEAM FORM / SQUADS ───────────────────────────
    console.log(c('blue', '\n▶ [11] TEAM INFO & SQUADS'));
    if (firstTeamId) {
        await smFetch(`/teams/${firstTeamId}?include=players;stats`, `Team #${firstTeamId} with Squad and Stats`);
        printResult(results[results.length - 1]);
    }
    // Arsenal (id=9 in Sportmonks)
    await smFetch('/teams/9?include=players', 'Arsenal Squad');
    printResult(results[results.length - 1]);

    // ── 12. PLAYERS / INJURIES ────────────────────────────────
    console.log(c('blue', '\n▶ [12] PLAYERS & INJURIES'));
    // Haaland player ID in Sportmonks is 220834
    await smFetch('/players/220834?include=statistics', 'Erling Haaland Player Stats');
    printResult(results[results.length - 1]);

    await smFetch('/injuries?include=player;fixture', 'Current Injuries');
    printResult(results[results.length - 1]);

    // ── 13. FIXTURES — ENRICHED ──────────────────────────
    console.log(c('blue', '\n▶ [13] FIXTURES — FULL ENRICHMENT'));
    if (firstFixtureId) {
        await smFetch(`/fixtures/${firstFixtureId}?include=lineups;events;statistics;odds;tv_stations`, `Fixture #${firstFixtureId} — Fully Enriched`);
        printResult(results[results.length - 1]);
    }

    // ── 14. PREDICTIONS (SPORTMONKS NATIVE) ──────────────
    console.log(c('blue', '\n▶ [14] SPORTMONKS NATIVE PREDICTIONS'));
    await smFetch(`/predictions/probabilities/fixture/${firstFixtureId || 0}`, `Native Win Probabilities for Fixture #${firstFixtureId}`);
    printResult(results[results.length - 1]);

    // ── 15. TV STATIONS ───────────────────────────────────
    console.log(c('blue', '\n▶ [15] TV STATIONS / BROADCASTING'));
    if (firstFixtureId) {
        await smFetch(`/tv-stations/fixture/${firstFixtureId}`, `TV Stations for Fixture #${firstFixtureId}`);
        printResult(results[results.length - 1]);
    }

    // ── 16. ROUNDS / SEASONS ────────────────────────────
    console.log(c('blue', '\n▶ [16] SEASONS & ROUNDS'));
    await smFetch('/seasons', 'All Seasons');
    printResult(results[results.length - 1]);

    // ── 17. TOMORROW FIXTURES ────────────────────────────
    console.log(c('blue', '\n▶ [17] UPCOMING FIXTURES (TOMORROW)'));
    await smFetch(`/fixtures/date/${TOMORROW}?include=league;participants;odds`, "Tomorrow's Fixtures with Odds");
    printResult(results[results.length - 1]);

    // ── SUMMARY ──────────────────────────────────────────
    const totalOk = results.filter(r => r.ok).length;
    const totalForbidden = results.filter(r => r.status === 403).length;
    const totalError = results.filter(r => !r.ok && r.status !== 403).length;

    console.log(c('bold', '\n╔══════════════════════════════════════════════════════╗'));
    console.log(c('bold', '║                   TEST SUMMARY                       ║'));
    console.log(c('bold', '╚══════════════════════════════════════════════════════╝'));
    console.log(`  ${c('green', '✅ Accessible:')} ${totalOk} endpoints`);
    console.log(`  ${c('yellow', '🔒 Forbidden (upgrade needed):')} ${totalForbidden} endpoints`);
    console.log(`  ${c('red', '❌ Errors:')} ${totalError} endpoints`);
    console.log(`  Total tested: ${results.length} endpoints\n`);

    // Print what's actively working
    console.log(c('green', '✅ WORKING ENDPOINTS (Available for site use):'));
    results.filter(r => r.ok && r.count > 0).forEach(r => {
        console.log(`  → ${r.description} (${r.count} records)`);
    });

    // Print forbidden
    if (totalForbidden > 0) {
        console.log(c('yellow', '\n🔒 FORBIDDEN ENDPOINTS (Not in current plan):'));
        results.filter(r => r.status === 403).forEach(r => {
            console.log(`  → ${r.description}`);
        });
    }

    // Print fixture IDs found for reference
    if (firstFixtureId) {
        console.log(c('dim', `\nℹ️  First fixture ID used in tests: ${firstFixtureId}`));
    }
}

main().catch(e => {
    console.error(c('red', '❌ Fatal error: ' + e.message));
    process.exit(1);
});
