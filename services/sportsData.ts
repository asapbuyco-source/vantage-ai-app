
const API_BASE = "https://v3.football.api-sports.io";
const API_KEY = import.meta.env?.VITE_FOOTBALL_API_KEY || "";

// African league IDs + top European competition IDs to prioritise
const PRIORITY_LEAGUE_IDS = new Set([
    // ── African Leagues ────────────────────────────────────────────
    90,  // Nigeria Premier League
    103, // Ghana Premier League
    363, // Kenyan Premier League
    288, // South African PSL
    262, // Cameroon Elite One
    12,  // CAF Champions League
    // ── Top European ──────────────────────────────────────────────
    39,  // Premier League
    140, // La Liga
    78,  // Bundesliga
    135, // Serie A
    61,  // Ligue 1
    94,  // Primeira Liga
    2,   // UEFA Champions League
    3,   // UEFA Europa League
]);

const PRIORITY_COUNTRIES = new Set([
    'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Uganda', 'Tanzania',
    'Rwanda', 'Cameroon', 'England', 'Spain', 'Germany', 'Italy',
    'France', 'Portugal',
]);

const buildHeaders = () => ({
    'x-rapidapi-key': API_KEY,
    'x-rapidapi-host': 'v3.football.api-sports.io',
});

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
    if (!API_KEY) return null;
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'GET',
            headers: buildHeaders(),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.response ?? null;
    } catch {
        return null;
    }
}

/**
 * Fetches today's fixtures from API-Football.
 */
export const getTodaysFixtures = async (): Promise<Fixture[]> => {
    if (!API_KEY) {
        console.warn("API-Football Key is missing. Fixture data will be empty.");
        return [];
    }

    const today = new Date().toISOString().split('T')[0];
    try {
        const response = await fetch(`${API_BASE}/fixtures?date=${today}`, {
            method: 'GET',
            headers: buildHeaders(),
        });

        if (!response.ok) throw new Error(`API-Football Error: ${response.status}`);
        const data = await response.json();
        return data.response || [];
    } catch (e) {
        console.error("Failed to fetch fixtures:", e);
        return [];
    }
};

/**
 * Filters & PRIORITISES fixtures — African leauges come first,
 * then top European leagues, max 30 to avoid Gemini context bloat.
 */
export const filterGlobalFixtures = (fixtures: Fixture[]) => {
    const matched = fixtures.filter(f =>
        PRIORITY_COUNTRIES.has(f.league.country) ||
        PRIORITY_LEAGUE_IDS.has(f.league.id) ||
        ['UEFA Champions League', 'UEFA Europa League', 'Premier League'].includes(f.league.name)
    );

    // Put African leagues at the front so they get the AI's attention first
    const african = matched.filter(f =>
        ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Uganda', 'Tanzania', 'Rwanda', 'Cameroon'].includes(f.league.country)
    );
    const european = matched.filter(f => !african.includes(f));

    return [...african, ...european].slice(0, 30);
};

/**
 * Fetches team statistics for the current season to derive form data.
 */
export const getTeamForm = async (
    teamId: number,
    leagueId: number,
    season: number
): Promise<TeamForm | null> => {
    const data: any = await apiFetch(`/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`);
    if (!data) return null;

    const fixtures = data.fixtures;
    const goals = data.goals;
    const teamName = data.team?.name ?? '';

    // Last 5 results
    const last5Wins = data.form?.slice(-5).split('') ?? [];
    const last5Str = last5Wins.join(' ') || 'N/A';

    const played = fixtures?.played?.total ?? 1;
    const homeWinRate = fixtures?.wins?.home && fixtures?.played?.home
        ? Math.round((fixtures.wins.home / fixtures.played.home) * 100)
        : 0;
    const awayWinRate = fixtures?.wins?.away && fixtures?.played?.away
        ? Math.round((fixtures.wins.away / fixtures.played.away) * 100)
        : 0;

    const avgGoalsScored = goals?.for?.average?.total ? parseFloat(goals.for.average.total) : 0;
    const avgGoalsConceded = goals?.against?.average?.total ? parseFloat(goals.against.average.total) : 0;

    const cleanSheets = data.clean_sheet?.total ?? 0;
    const cleanSheetRate = played > 0 ? Math.round((cleanSheets / played) * 100) : 0;

    return { teamId, teamName, last5: last5Str, homeWinRate, awayWinRate, avgGoalsScored, avgGoalsConceded, cleanSheetRate };
};

/**
 * Fetches the last 5 head-to-head meetings between two teams.
 */
export const getH2H = async (homeId: number, awayId: number): Promise<H2HRecord | null> => {
    const data: any[] | null = await apiFetch(`/fixtures/headtohead?h2h=${homeId}-${awayId}&last=5`);
    if (!data || data.length === 0) return null;

    let homeWins = 0, awayWins = 0, draws = 0;
    const goalStrings: string[] = [];

    for (const match of data) {
        const ht = match.teams?.home?.id;
        const hw = match.teams?.home?.winner;
        const aw = match.teams?.away?.winner;
        const gh = match.goals?.home ?? '?';
        const ga = match.goals?.away ?? '?';
        goalStrings.push(`${gh}-${ga}`);

        if (hw) {
            ht === homeId ? homeWins++ : awayWins++;
        } else if (aw) {
            ht === homeId ? awayWins++ : homeWins++;
        } else {
            draws++;
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
 * Fetches pre-match bookmaker 1X2 odds for a fixture.
 * Returns implied probabilities so the AI can compute its own edge.
 */
export const getMatchOdds = async (fixtureId: number): Promise<MatchOdds | null> => {
    const data: any[] | null = await apiFetch(`/odds?fixture=${fixtureId}&bookmaker=8`); // bookmaker 8 = Bet365
    if (!data || data.length === 0) return null;

    try {
        const bookmaker = data[0]?.bookmakers?.[0];
        const market = bookmaker?.bets?.find((b: any) => b.name === 'Match Winner');
        if (!market) return null;

        const homeOdd = parseFloat(market.values.find((v: any) => v.value === 'Home')?.odd ?? '0');
        const drawOdd = parseFloat(market.values.find((v: any) => v.value === 'Draw')?.odd ?? '0');
        const awayOdd = parseFloat(market.values.find((v: any) => v.value === 'Away')?.odd ?? '0');

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
 * Fetches active injury and suspension list for a team.
 */
export const getTeamInjuries = async (teamId: number, fixtureId: number): Promise<InjuryReport | null> => {
    const data: any[] | null = await apiFetch(`/injuries?team=${teamId}&fixture=${fixtureId}`);
    if (!data) return null;

    const injured = data
        .filter(p => p.player?.reason === 'Injured' || p.player?.reason === 'Suspended')
        .map(p => `${p.player?.name ?? 'Unknown'} (${(p.player?.reason ?? 'Out').toLowerCase()})`)
        .slice(0, 5); // cap at 5 for prompt brevity

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
                getTeamInjuries(homeId, fixtureId),
                getTeamInjuries(awayId, fixtureId),
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
