// ══════════════════════════════════════════════════════════════════════
// BACKEND PROXY INTEGRATION
// We now route all Sportmonks requests through our Express backend
// This solves CORS and hides the API key from the frontend.
// ══════════════════════════════════════════════════════════════════════
let BACKEND_URL = import.meta.env?.VITE_BACKEND_URL || "http://localhost:8080";
if (BACKEND_URL && !BACKEND_URL.startsWith('http')) {
    BACKEND_URL = `https://${BACKEND_URL}`;
}
// Fix common Railway domain typo: railwayapp -> railway.app
if (BACKEND_URL.includes('railwayapp') && !BACKEND_URL.includes('railway.app')) {
    BACKEND_URL = BACKEND_URL.replace('railwayapp', 'railway.app');
}
// Remove trailing slash if present
BACKEND_URL = BACKEND_URL.replace(/\/$/, "");
const API_BASE = `${BACKEND_URL}/api/sportmonks`;

// The API token is securely appended by the backend proxy.
// No longer needed on the frontend.

// ══════════════════════════════════════════════════════════════════════
// LEAGUE PRIORITY TIERS — Ordered by actual African betting volume
// Research: EPL alone accounts for ~50% of betting volume in Nigeria.
// African domestic leagues are niche — most bettors prefer European leagues.
// ══════════════════════════════════════════════════════════════════════

// Tier 1: Highest betting volume in Africa (~50% of all bets)
const TIER_1_LEAGUE_IDS = new Set([
    8,   // English Premier League (Sportmonks ID)
    2,   // UEFA Champions League
]);

// Tier 2: Very high volume (~25%)
const TIER_2_LEAGUE_IDS = new Set([
    564, // La Liga
    82,  // Bundesliga
    384, // Serie A
    5,   // UEFA Europa League
]);

// Tier 3: High volume (~10%) — Ligue 1 especially popular in Francophone Africa
const TIER_3_LEAGUE_IDS = new Set([
    301, // Ligue 1
    462, // Primeira Liga (Portugal)
    7,   // UEFA Conference League
]);

// Tier 4: Medium volume (~8%)
const TIER_4_LEAGUE_IDS = new Set([
    72,  // Eredivisie
    9,   // EFL Championship
    600, // Turkish Süper Lig
    253, // MLS
    325, // Brazilian Série A
    176, // Argentine Liga Profesional
]);

// Tier 5: African continental + big domestic derbies (~5%)
const TIER_5_LEAGUE_IDS = new Set([
    1186, // CAF Champions League
    1187, // CAF Confederation Cup
    1329, // AFCON
    570,  // NPFL (Nigeria)
    392,  // Ghana Premier League
]);

// Tier 6: Other African domestic (~2%)
const TIER_6_LEAGUE_IDS = new Set([
    572,  // Kenya Premier League / SportPesa League
    288,  // South African PSL
    636,  // Cameroon Elite One
    406,  // Egyptian Premier League
    201,  // Moroccan Botola Pro
    480,  // Algerian Ligue 1
    551,  // Tunisian Ligue 1
]);

const PRIORITY_COUNTRIES = new Set([
    'England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal',
    'Netherlands', 'Turkey', 'Brazil', 'Argentina', 'USA',
    'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Egypt', 'Morocco',
    'Cameroon', 'Uganda', 'Tanzania', 'Algeria', 'Tunisia',
]);

const buildParams = (path: string) => {
    return `${API_BASE}${path}`;
};

export interface Fixture {
    fixture: {
        id: number;
        date: string;
        venue: { name: string; city: string };
        status: { long: string; short: string; elapsed: number };
    };
    league: { id: number; name: string; country: string; logo: string; flag: string; season: number; round: string };
    teams: {
        home: { id: number; name: string; logo: string; winner: boolean };
        away: { id: number; name: string; logo: string; winner: boolean };
    };
    goals: { home: number; away: number };
    score: {
        halftime: { home: number; away: number };
        fulltime: { home: number; away: number };
        extratime: { home: number; away: number };
        penalty: { home: number; away: number };
    };
}

export interface TeamForm {
    teamId: number;
    teamName: string;
    last5: string;          // e.g. "W W D L W"
    homeWinRate: number;    // 0–100
    awayWinRate: number;
    avgGoalsScored: number;
    avgGoalsConceded: number;
    cleanSheetRate: number; // 0–100 over last 5
}

export interface H2HRecord {
    homeTeamWins: number;
    awayTeamWins: number;
    draws: number;
    last5Goals: string;    // e.g. "2-1, 0-0, 3-2, 1-0, 2-2"
}

export interface MatchOdds {
    home: number;           // decimal odds
    draw: number;
    away: number;
    homeImpliedProb: number; // 0–100
    drawImpliedProb: number;
    awayImpliedProb: number;
}

export interface InjuryReport {
    teamId: number;
    injured: string[];      // ["Mbappe (thigh)", "Bellingham (ankle)"]
}

// ── Safe API fetch helper ───────────────────────────────────────────────────
async function apiFetch<T>(path: string): Promise<T | null> {
    try {
        const fullUrl = buildParams(path);
        const res = await fetch(fullUrl, { method: 'GET' });
        if (!res.ok) {
            console.warn(`Sportmonks API Error (${res.status}) on ${path}`);
            return null;
        }
        const data = await res.json();
        return data.data ?? null; // Sportmonks wraps responses in 'data'
    } catch (e) {
        console.warn(`Fetch catch error on ${path}`, e);
        return null;
    }
}

/**
 * Fetches today's fixtures from Sportmonks.
 */
export const getTodaysFixtures = async (dateStr?: string): Promise<Fixture[]> => {
    // API_KEY is no longer needed on the frontend, as it's handled by the backend proxy.
    const dateToFetch = dateStr || new Date().toISOString().split('T')[0];

    // Fetch fixtures by date, including league, participants (teams), and scores
    const data: any[] | null = await apiFetch(`/fixtures/date/${dateToFetch}?include=league;participants;scores`);
    if (!data) return [];

    // Map Sportmonks response to our existing Fixture interface
    return data.map((item: any) => {
        const homeTeam = item.participants?.find((p: any) => p.meta?.location === 'home') || {};
        const awayTeam = item.participants?.find((p: any) => p.meta?.location === 'away') || {};

        return {
            fixture: {
                id: item.id,
                date: item.starting_at,
                venue: { name: item.venue_id?.toString() || 'Unknown', city: '' }, // Venue nested data usually requires extra includes
                status: { long: item.state?.name || 'Scheduled', short: item.state?.state || 'NS', elapsed: item.minute || 0 },
            },
            league: {
                id: item.league_id,
                name: item.league?.name || 'Unknown League',
                country: item.league?.country?.name || 'Unknown',
                logo: item.league?.image_path || '',
                flag: '',
                season: item.season_id,
                round: item.round_id?.toString() || ''
            },
            teams: {
                home: { id: homeTeam.id, name: homeTeam.name, logo: homeTeam.image_path, winner: item.scores?.find((s: any) => s.description === 'CURRENT')?.participant_id === homeTeam.id },
                away: { id: awayTeam.id, name: awayTeam.name, logo: awayTeam.image_path, winner: item.scores?.find((s: any) => s.description === 'CURRENT')?.participant_id === awayTeam.id },
            },
            goals: {
                home: item.scores?.find((s: any) => s.participant_id === homeTeam.id && s.description === 'CURRENT')?.score?.goals || 0,
                away: item.scores?.find((s: any) => s.participant_id === awayTeam.id && s.description === 'CURRENT')?.score?.goals || 0,
            },
            score: {
                halftime: { home: 0, away: 0 },
                fulltime: { home: 0, away: 0 },
                extratime: { home: 0, away: 0 },
                penalty: { home: 0, away: 0 },
            }
        };
    });
};

/**
 * Assigns a priority score to a fixture based on its league and country.
 * Tiers are ordered by actual African betting volume (EPL/UCL first).
 */
const getPriorityScore = (f: Fixture): number => {
    let score = 0;
    const leagueId = f.league.id;
    const country = f.league.country;
    const name = f.league.name?.toLowerCase() || '';

    // ── Tier 1: EPL + UCL (~50% of African betting volume) ────────
    if (TIER_1_LEAGUE_IDS.has(leagueId)) score += 150;
    // ── Tier 2: La Liga, Serie A, Bundesliga, UEL (~25%) ──────────
    else if (TIER_2_LEAGUE_IDS.has(leagueId)) score += 120;
    // ── Tier 3: Ligue 1, Primeira Liga, Conference League (~10%) ──
    else if (TIER_3_LEAGUE_IDS.has(leagueId)) score += 100;
    // ── Tier 4: Eredivisie, Championship, Turkish, MLS (~8%) ──────
    else if (TIER_4_LEAGUE_IDS.has(leagueId)) score += 80;
    // ── Tier 5: AFCON, CAF CL, NPFL, Ghana PL (~5%) ──────────────
    else if (TIER_5_LEAGUE_IDS.has(leagueId)) score += 60;
    // ── Tier 6: Other African domestic (~2%) ──────────────────────
    else if (TIER_6_LEAGUE_IDS.has(leagueId)) score += 40;

    // Country-level bonus for recognized betting markets
    if (PRIORITY_COUNTRIES.has(country)) score += 20;

    // Major tournament name bonus (catches World Cup, AFCON, Copa America etc.)
    if (name.includes('world cup') || name.includes('euro') || name.includes('copa america') ||
        name.includes('nations cup') || name.includes('afcon')) score += 90;

    // Generic "premier" or "division 1" name bonus
    if (name.includes('premier') || name.includes('division 1') || name.includes('primera')) score += 10;

    return score;
};

/**
 * Filters & PRIORITISES fixtures — ensures we always have enough matches (target 15-20)
 * by taking the highest scoring games globally.
 */
export const filterGlobalFixtures = (fixtures: Fixture[]) => {
    // Sort all fixtures by our priority score
    const scored = fixtures
        .map(f => ({ fixture: f, score: getPriorityScore(f) }))
        .sort((a, b) => b.score - a.score);

    // Filter out very low quality or irrelevant matches (score > 0 ensures we have some criteria)
    const filtered = scored.filter(s => s.score > 0).map(s => s.fixture);

    // Increase limit to 50 to give Gemini more "raw material" to work with
    return filtered.slice(0, 50);
};

/**
 * Fetches team statistics to derive form data using Sportmonks.
 */
export const getTeamForm = async (
    teamId: number,
    leagueId: number,
    season: number
): Promise<TeamForm | null> => {
    // Sportmonks provides form and statistics within the team endpoint
    const data: any = await apiFetch(`/teams/${teamId}?include=statistics&filters=coreLeagues:${leagueId}`);
    if (!data) return null;

    const stats = data.statistics?.[0] || {};
    const teamName = data.name || '';

    // Sportmonks doesn't provide a direct "W W D L" string globally in the free tier
    // For now, we fallback to a safe default if not easily calculable, to prevent AI hallucinations
    const last5Str = 'Unknown';
    const homeWinRate = stats.details?.find((d: any) => d.type_id === 214)?.value?.home || 0; // Type ID for Win %
    const awayWinRate = stats.details?.find((d: any) => d.type_id === 214)?.value?.away || 0;

    const avgGoalsScored = stats.details?.find((d: any) => d.type_id === 52)?.value?.all || 0; // Type ID for goals scored
    const avgGoalsConceded = stats.details?.find((d: any) => d.type_id === 54)?.value?.all || 0; // Type ID for goals conceded
    const cleanSheetRate = stats.details?.find((d: any) => d.type_id === 228)?.value?.all || 0; // Type ID for clean sheet %

    return {
        teamId,
        teamName,
        last5: last5Str,
        homeWinRate: Number(homeWinRate),
        awayWinRate: Number(awayWinRate),
        avgGoalsScored: Number(avgGoalsScored),
        avgGoalsConceded: Number(avgGoalsConceded),
        cleanSheetRate: Number(cleanSheetRate)
    };
};

/**
 * Fetches the last 5 head-to-head meetings between two teams via Sportmonks.
 */
export const getH2H = async (homeId: number, awayId: number): Promise<H2HRecord | null> => {
    const data: any[] | null = await apiFetch(`/head-to-head/${homeId}/${awayId}?include=participants;scores`);
    if (!data || data.length === 0) return null;

    let homeWins = 0, awayWins = 0, draws = 0;
    const goalStrings: string[] = [];

    // Analyze up to the last 5
    const last5 = data.slice(0, 5);

    for (const match of last5) {
        const homeScore = match.scores?.find((s: any) => s.participant_id === homeId && s.description === 'CURRENT')?.score?.goals;
        const awayScore = match.scores?.find((s: any) => s.participant_id === awayId && s.description === 'CURRENT')?.score?.goals;

        if (homeScore !== undefined && awayScore !== undefined) {
            goalStrings.push(`${homeScore}-${awayScore}`);
            if (homeScore > awayScore) {
                homeWins++;
            } else if (awayScore > homeScore) {
                awayWins++;
            } else {
                draws++;
            }
        }
    }

    return {
        homeTeamWins: homeWins,
        awayTeamWins: awayWins,
        draws,
        last5Goals: goalStrings.join(', ')
    };
};

/**
 * Fetches pre-match bookmaker 1X2 odds for a fixture via Sportmonks.
 */
export const getMatchOdds = async (fixtureId: number): Promise<MatchOdds | null> => {
    // 1X2 market ID is typically 1 in Sportmonks
    const data: any[] | null = await apiFetch(`/odds/pre-match/fixtures/${fixtureId}`);
    if (!data || data.length === 0) return null;

    try {
        // Find 1x2 market (market_id = 1 usually)
        const market1x2 = data.find((m: any) => m.market_id === 1);
        if (!market1x2) return null;

        const homeOdd = parseFloat(market1x2.values?.find((v: any) => v.name === '1')?.value ?? '0');
        const drawOdd = parseFloat(market1x2.values?.find((v: any) => v.name === 'X')?.value ?? '0');
        const awayOdd = parseFloat(market1x2.values?.find((v: any) => v.name === '2')?.value ?? '0');

        if (!homeOdd || !drawOdd || !awayOdd) return null;

        // Remove overround to get true implied probabilities
        const overround = (1 / homeOdd) + (1 / drawOdd) + (1 / awayOdd);
        return {
            home: homeOdd,
            draw: drawOdd,
            away: awayOdd,
            homeImpliedProb: Math.round((1 / homeOdd / overround) * 100),
            drawImpliedProb: Math.round((1 / drawOdd / overround) * 100),
            awayImpliedProb: Math.round((1 / awayOdd / overround) * 100),
        };
    } catch {
        return null;
    }
};

/**
 * Fetches active injury list via Sportmonks.
 */
export const getTeamInjuries = async (teamId: number): Promise<InjuryReport | null> => {
    const data: any[] | null = await apiFetch(`/sidelined/teams/${teamId}?include=player;type`);
    if (!data) return null;

    const injured = data
        .filter(p => !p.completed) // Only active injuries
        .map(p => `${p.player?.name ?? 'Unknown'} (${p.type?.name ?? 'Sidelined'})`)
        .slice(0, 5);

    return { teamId, injured };
};

/**
 * Enriches a batch of fixtures with form, H2H, odds, and injury data.
 * Use this to build the full context block for the Gemini prompt.
 * Runs all fetches in parallel per fixture for speed.
 */
export const enrichFixtures = async (fixtures: Fixture[], season: number = 2024) => {
    const enriched = await Promise.all(
        fixtures.map(async (f) => {
            const homeId = f.teams.home.id;
            const awayId = f.teams.away.id;
            const fixtureId = f.fixture.id;
            const leagueId = f.league.id;

            const [homeForm, awayForm, h2h, odds, homeInjuries, awayInjuries] = await Promise.all([
                getTeamForm(homeId, leagueId, season),
                getTeamForm(awayId, leagueId, season),
                getH2H(homeId, awayId),
                getMatchOdds(fixtureId),
                getTeamInjuries(homeId),
                getTeamInjuries(awayId),
            ]);

            return {
                fixture: f,
                homeForm,
                awayForm,
                h2h,
                odds,
                homeInjuries,
                awayInjuries,
            };
        })
    );

    return enriched;
};

/**
 * Converts an enriched fixture object into a compact plain-text
 * context string suitable for embedding in a Gemini prompt.
 */
export const formatFixtureContext = (enriched: Awaited<ReturnType<typeof enrichFixtures>>) => {
    return enriched.map(e => {
        const f = e.fixture;
        const hName = f.teams.home.name;
        const aName = f.teams.away.name;
        const lines: string[] = [
            `MATCH: ${hName} vs ${aName} | League: ${f.league.name} (${f.league.country}) | KO: ${f.fixture.date.split('T')[1]?.substring(0, 5) ?? 'TBD'}`,
            `HOME LOGO: ${f.teams.home.logo} | AWAY LOGO: ${f.teams.away.logo}`,
        ];

        if (e.homeForm) {
            lines.push(`${hName} FORM (last 5): ${e.homeForm.last5} | Home W%: ${e.homeForm.homeWinRate}% | Avg scored: ${e.homeForm.avgGoalsScored.toFixed(1)} | Clean sheets: ${e.homeForm.cleanSheetRate}%`);
        }
        if (e.awayForm) {
            lines.push(`${aName} FORM (last 5): ${e.awayForm.last5} | Away W%: ${e.awayForm.awayWinRate}% | Avg scored: ${e.awayForm.avgGoalsScored.toFixed(1)} | Avg conceded: ${e.awayForm.avgGoalsConceded.toFixed(1)}`);
        }
        if (e.h2h) {
            lines.push(`H2H (last 5): ${hName} won ${e.h2h.homeTeamWins}, ${aName} won ${e.h2h.awayTeamWins}, Draws ${e.h2h.draws} | Scores: ${e.h2h.last5Goals}`);
        }
        if (e.odds) {
            lines.push(`MARKET ODDS: 1=${e.odds.home} (${e.odds.homeImpliedProb}% implied) | X=${e.odds.draw} (${e.odds.drawImpliedProb}%) | 2=${e.odds.away} (${e.odds.awayImpliedProb}%)`);
        }
        if (e.homeInjuries?.injured.length) {
            lines.push(`${hName} INJURIES: ${e.homeInjuries.injured.join(', ')}`);
        }
        if (e.awayInjuries?.injured.length) {
            lines.push(`${aName} INJURIES: ${e.awayInjuries.injured.join(', ')}`);
        }

        return lines.join('\n');
    }).join('\n\n---\n\n');
};
