import { GoogleGenAI, Type } from "@google/genai";
import admin from 'firebase-admin';

// ── Model list: VALID Gemini model IDs (verified against Google AI API) ─────────
// Do NOT add fake model IDs here. If a model is unavailable it will fail silently
// in the fallback loop. Keep gemini-2.0-flash first as the most stable option.
const AVAILABLE_MODELS = [
    { id: 'gemini-2.0-flash', name: 'Vantage AI 2.0 Flash (Stable)' },
    { id: 'gemini-2.5-flash', name: 'Vantage AI 2.5 Flash (Versatile)' },
    { id: 'gemini-2.0-flash-exp', name: 'Vantage AI 2.0 Flash (Experimental)' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Complex Reasoning)' },
];

/** Helper to get a date key for N days ago */
const getDateKeyDaysAgo = (daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const getGlobalTodayKey = () => getDateKeyDaysAgo(0);
export const getGlobalYesterdayKey = () => getDateKeyDaysAgo(1);

/** Build a GoogleGenAI instance using the server-side API key */
const getAI = () => {
    const key = process.env.VITE_GOOGLE_GENAI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    if (!key) throw new Error("Missing Google GenAI API Key on server");
    return new GoogleGenAI({ apiKey: key });
};

/** Safe text extractor — handles both response.text string and response.text() function */
const extractText = (response) => {
    if (!response) return '';
    if (typeof response.text === 'function') return response.text();
    if (typeof response.text === 'string') return response.text;
    return '';
};

// ── Sportmonks Fetch ──────────────────────────────────────────────────────────
export const fetchSportmonksServerSide = async (path) => {
    try {
        const token = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;

        let allData = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 50) {
            const pagePath = path.includes('?') ? `${path}&page=${page}` : `${path}?page=${page}`;
            const separator = pagePath.includes('?') ? '&' : '?';
            const url = `https://api.sportmonks.com/v3/football${pagePath}${separator}api_token=${token}`;

            const res = await fetch(url, { method: 'GET' });
            if (!res.ok) {
                console.warn(`[Backend] Sportmonks API Error (${res.status}) on ${pagePath}`);
                break;
            }
            const json = await res.json();

            if (json.data && Array.isArray(json.data)) {
                allData = allData.concat(json.data);
            } else if (json.data) {
                // Not an array response, return immediately (e.g. single item fetch)
                return json.data;
            }

            if (json.pagination && json.pagination.has_more) {
                page++;
            } else {
                hasMore = false;
            }
        }

        return allData.length > 0 ? allData : null;
    } catch (e) {
        console.warn(`[Backend] Fetch catch error on ${path}`, e);
        return null; // Ensure fallback triggering
    }
};

export const getTodaysFixturesServerSide = async (dateStr) => {
    const dateToFetch = dateStr || new Date().toISOString().split('T')[0];
    const data = await fetchSportmonksServerSide(`/fixtures/date/${dateToFetch}?include=league;participants;scores`);
    if (!data) return [];
    return data.map((item) => {
        const homeTeam = item.participants?.find((p) => p.meta?.location === 'home') || {};
        const awayTeam = item.participants?.find((p) => p.meta?.location === 'away') || {};

        return {
            fixture: {
                id: item.id,
                date: item.starting_at,
                venue: { name: item.venue_id?.toString() || 'Unknown', city: '' },
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
                home: { id: homeTeam.id, name: homeTeam.name, logo: homeTeam.image_path, winner: item.scores?.find((s) => s.description === 'CURRENT')?.participant_id === homeTeam.id },
                away: { id: awayTeam.id, name: awayTeam.name, logo: awayTeam.image_path, winner: item.scores?.find((s) => s.description === 'CURRENT')?.participant_id === awayTeam.id },
            },
            goals: {
                home: item.scores?.find((s) => s.participant_id === homeTeam.id && s.description === 'CURRENT')?.score?.goals || 0,
                away: item.scores?.find((s) => s.participant_id === awayTeam.id && s.description === 'CURRENT')?.score?.goals || 0,
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

const TIER_1_LEAGUE_IDS = new Set([8, 2]);
const TIER_2_LEAGUE_IDS = new Set([564, 82, 384, 5]);
const TIER_3_LEAGUE_IDS = new Set([301, 462, 7]);
const TIER_4_LEAGUE_IDS = new Set([72, 9, 600, 253, 325, 176]);
const TIER_5_LEAGUE_IDS = new Set([1186, 1187, 1329, 570, 392]);
const TIER_6_LEAGUE_IDS = new Set([572, 288, 636, 406, 201, 480, 551]);
const PRIORITY_COUNTRIES = new Set(['England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Turkey', 'Brazil', 'Argentina', 'USA', 'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Egypt', 'Morocco', 'Cameroon', 'Uganda', 'Tanzania', 'Algeria', 'Tunisia']);

const getPriorityScore = (f) => {
    let score = 0;
    const leagueId = f.league.id;
    const country = f.league.country;
    const name = f.league.name?.toLowerCase() || '';
    if (TIER_1_LEAGUE_IDS.has(leagueId)) score += 150;
    else if (TIER_2_LEAGUE_IDS.has(leagueId)) score += 120;
    else if (TIER_3_LEAGUE_IDS.has(leagueId)) score += 100;
    else if (TIER_4_LEAGUE_IDS.has(leagueId)) score += 80;
    else if (TIER_5_LEAGUE_IDS.has(leagueId)) score += 60;
    else if (TIER_6_LEAGUE_IDS.has(leagueId)) score += 40;
    if (PRIORITY_COUNTRIES.has(country)) score += 20;
    if (name.includes('world cup') || name.includes('euro') || name.includes('copa america') || name.includes('nations cup') || name.includes('afcon')) score += 90;
    if (name.includes('premier') || name.includes('division 1') || name.includes('primera')) score += 10;
    return score;
};

export const filterGlobalFixturesServerSide = (fixtures) => {
    const scored = fixtures.map(f => ({ fixture: f, score: getPriorityScore(f) })).sort((a, b) => b.score - a.score);
    return scored.filter(s => s.score > 0).map(s => s.fixture).slice(0, 50);
};

// ── Daily Football Predictions ────────────────────────────────────────────────
export const generateDailyPredictionsServerSide = async () => {
    console.log('[Backend] Starting scheduled Daily Predictions...');
    try {
        const todayStr = getGlobalTodayKey();
        const rawFixtures = await getTodaysFixturesServerSide(todayStr);
        const filteredFixtures = filterGlobalFixturesServerSide(rawFixtures);

        // FIX: Define simplifiedRaw at function scope so it's always accessible below
        let simplifiedRaw = [];

        if (filteredFixtures.length > 0) {
            simplifiedRaw = filteredFixtures.map(f => ({
                id: f.fixture.id.toString(),
                league: f.league.name,
                leagueId: f.league.id,
                seasonId: f.league.season,
                homeTeam: f.teams.home.name,
                homeTeamId: f.teams.home.id,
                awayTeam: f.teams.away.name,
                awayTeamId: f.teams.away.id,
                time: f.fixture.date,
                prediction: '',
                confidence: 0, odds: 0, category: 'safe',
                homeTeamLogo: f.teams.home.logo,
                awayTeamLogo: f.teams.away.logo,
                sport: 'football',
                status: 'pending'
            }));

            // Save raw fixtures placeholder
            await admin.firestore().collection('daily_predictions').doc(todayStr).set({
                rawFixtures: simplifiedRaw,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        const searchPrompt = `
You are the "Quant-Desk Decision Engine v6.0", an elite global sports betting model with access to real statistical data.

DATE: ${todayStr}

ENRICHED FIXTURES FOR TODAY:
${JSON.stringify(filteredFixtures)}

═══════════════════════════════════════════════
YOUR OBJECTIVE
═══════════════════════════════════════════════
Using the fixture data above AND Google Search for additional matches today:
- Identify and analyze at least 15 to 20 high-quality betting opportunities.
- Goal: Ensure the app is content-rich.

LEAGUE PRIORITY (scan in this order — this reflects actual African betting volume):
1. 🏆 English Premier League + UEFA Champions League (HIGHEST — ~50% of bets)
2. ⭐ La Liga, Serie A, Bundesliga, UEFA Europa League (~25%)
3. 🇫🇷 Ligue 1, Primeira Liga, Conference League (~10%)
4. 🌍 Eredivisie, Championship, Turkish Süper Lig, MLS, Brazilian Série A (~8%)
5. 🌍 AFCON, CAF Champions League, NPFL (big derbies only), Ghana Premier League (~5%)

- Only include matches where you have a "Model Edge" (your probability > bookmaker implied probability).
- Predictions must be professional and use standard market labels.

═══════════════════════════════════════════════
🧮 QUANTITATIVE RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════
1. EV CALCULATION: EV = (Your model probability × Decimal odds) − 1. Only pick if EV ≥ +0.06 (6% edge).
2. CONFIDENCE FLOOR: ≥ 72%. Use team form, H2H record, injury absences, and market implied probability.
3. ONE Market Per Match (safest one). Choose from: "Home Win", "Away Win", "Draw", "Double Chance (1X)", "Double Chance (X2)", "Double Chance (12)", "Draw No Bet (Home)", "Draw No Bet (Away)", "Over 1.5 Goals", "Over 2.5 Goals", "Both Teams Score", "Both Teams Score - No".

═══════════════════════════════════════════════
🚨 OUTPUT FORMAT & ADDITIONAL DATA REQUIREMENTS (Strict JSON)
═══════════════════════════════════════════════
- 'id': Use the exact ID provided in the JSON payload.
- 'prediction_en' / 'prediction_fr': Localized prediction label.
- 'analysis_en' format: "EV: +X.X% | Edge: Y% | [max 20 words of reasoning]"
- 'analysis_fr': French translation of analysis.
- 'confidence': 0–100 integer.
- 'odds': Real bookmaker decimal odds for your chosen market.
- 'category': "safe" (confidence >= 80), "value" (70-79), or "risky" (<70)
- 'homeForm' / 'awayForm': Last 5 games form mapping e.g., "W W D L W" (String).
- 'homeWinRate' / 'awayWinRate': 0-100 integer representing win rate percentage.
- 'homeAvgScored' / 'awayAvgScored': Float, avg goals scored per game.
- 'homeAvgConceded' / 'awayAvgConceded': Float, avg goals conceded per game.
- 'homeCleanSheetRate' / 'awayCleanSheetRate': 0-100 integer.
- 'h2hHomeWins' / 'h2hAwayWins' / 'h2hDraws': Integer count of last 5 H2H results.
- 'h2hLast5Goals': String of recent H2H scores e.g., "2-1, 1-1, 0-0".
- 'homeInjured' / 'awayInjured': Array of strings representing key injured players, e.g., ["Saka", "Odegaard"]. Empty array if none.
- Output JSON array only.
        `;

        const ai = getAI();
        let response = null;
        let usedModel = null;
        let lastError = null;

        // Fallback Logic: Try models sequentially if one fails due to quota or server errors
        for (const modelDef of AVAILABLE_MODELS) {
            try {
                console.log(`[Backend] Attempting generation with model: ${modelDef.id}...`);
                response = await ai.models.generateContent({
                    model: modelDef.id,
                    contents: searchPrompt,
                    config: {
                        temperature: 0.1,
                        tools: [{ googleSearch: {} }],
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING },
                                    prediction_en: { type: Type.STRING },
                                    prediction_fr: { type: Type.STRING },
                                    confidence: { type: Type.NUMBER },
                                    odds: { type: Type.NUMBER },
                                    category: { type: Type.STRING },
                                    analysis_en: { type: Type.STRING },
                                    analysis_fr: { type: Type.STRING },
                                    homeForm: { type: Type.STRING },
                                    awayForm: { type: Type.STRING },
                                    homeWinRate: { type: Type.NUMBER },
                                    awayWinRate: { type: Type.NUMBER },
                                    homeAvgScored: { type: Type.NUMBER },
                                    awayAvgScored: { type: Type.NUMBER },
                                    homeAvgConceded: { type: Type.NUMBER },
                                    awayAvgConceded: { type: Type.NUMBER },
                                    homeCleanSheetRate: { type: Type.NUMBER },
                                    awayCleanSheetRate: { type: Type.NUMBER },
                                    h2hHomeWins: { type: Type.NUMBER },
                                    h2hAwayWins: { type: Type.NUMBER },
                                    h2hDraws: { type: Type.NUMBER },
                                    h2hLast5Goals: { type: Type.STRING },
                                    homeInjured: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    awayInjured: { type: Type.ARRAY, items: { type: Type.STRING } }
                                },
                                required: ["id", "prediction_en", "confidence", "odds", "analysis_en", "category"]
                            }
                        }
                    }
                });

                usedModel = modelDef.id;
                console.log(`[Backend] ✅ Generation successful using ${usedModel}`);
                break;
            } catch (apiError) {
                lastError = apiError;
                console.warn(`[Backend] ⚠️ Model ${modelDef.id} failed: ${apiError.message}. Trying next model...`);
            }
        }

        if (!response) {
            throw new Error(`All available Gemini models failed. Last error: ${lastError?.message}`);
        }

        const responseText = extractText(response);
        const predictions = JSON.parse(responseText || "[]");

        // Merge AI predictions back with the simplified raw matches
        const finalMatches = simplifiedRaw.map(raw => {
            const pred = predictions.find(p => p.id === raw.id || p.id === parseInt(raw.id));
            if (pred) {
                return { ...raw, ...pred };
            }
            return raw;
        }).filter(m => m.prediction_en); // Only keep ones AI analyzed

        // Also add any AI-generated matches that weren't in simplifiedRaw (from Search)
        const existingIds = new Set(simplifiedRaw.map(r => r.id));
        const aiOnlyMatches = predictions.filter(p => !existingIds.has(p.id) && !existingIds.has(String(p.id)));
        const allMatches = [...finalMatches, ...aiOnlyMatches];

        console.log(`[Backend] Generated ${allMatches.length} predictions successfully.`);

        // Save to Firebase Admin
        await admin.firestore().collection('daily_predictions').doc(todayStr).set({
            status: 'completed',
            matches: allMatches,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        return { status: "success", generated: allMatches.length, matches: allMatches };
    } catch (e) {
        console.error('Backend generation error:', e);
        return { status: "error", error: e.message };
    }
};

// ── Daily Blog Generation ─────────────────────────────────────────────────────
export const generateDailyBlogServerSide = async () => {
    console.log('[Backend] Starting scheduled Daily SEO Blog Generation...');
    try {
        const todayStr = getGlobalTodayKey();

        const docSnap = await admin.firestore().collection('daily_predictions').doc(todayStr).get();
        if (!docSnap.exists) {
            console.warn(`[Backend] No predictions found for ${todayStr}. Cannot generate blog.`);
            return { status: "skipped", reason: "no_predictions" };
        }

        const data = docSnap.data();
        const matches = data.matches || [];

        if (matches.length === 0) {
            console.warn(`[Backend] Predictions array is empty for ${todayStr}. Cannot generate blog.`);
            return { status: "skipped", reason: "empty_predictions" };
        }

        // Feed Gemini the best 5-10 matches to keep the blog focused
        const topMatches = matches
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 8);

        const blogPrompt = `
You are the Chief Editor for Vantage AI, a leading sports betting predictions platform in Africa (specifically targeting Cameroon, using 1xBet and Premier Bet).

Today is ${todayStr}. Our quantitative AI model has just analyzed the daily sports schedule and identified these top fixtures:

${JSON.stringify(topMatches, null, 2)}

═══════════════════════════════════════════════
YOUR OBJECTIVE
═══════════════════════════════════════════════
Write an engaging, SEO-optimized daily sports betting blog post in French analyzing today's top picks.
This post will be injected directly into the HTML of our site to attract search engine traffic.

REQUIREMENTS:
1. Title: Create a catchy, click-worthy H1 title incorporating keywords like "Pronostics", "1xBet", "Cameroun", "Coupon du jour", or the names of the biggest teams playing today.
2. Introduction: A brief hype intro (2-3 sentences) about today's football schedule.
3. Top Picks Breakdown: Choose 3-4 of the most interesting matches from the JSON above. For each, write a short paragraph explaining *why* the prediction was made (e.g., team form, injuries, historical dominance). Use H2 tags for the match names.
4. Accumulator Idea: Propose a "Coupon du Jour" (Accumulator of the Day) combining a few safe picks with their combined odds.
5. Formatting: Use proper HTML tags (<h1>, <h2>, <p>, <ul>, <li>, <strong>). DO NOT use Markdown backticks around your response. Return pure HTML.
6. Tone: Confident, expert, and encouraging. Remind users to bet responsibly at the end.
        `;

        const ai = getAI();
        let response = null;
        let lastError = null;

        for (const modelDef of AVAILABLE_MODELS) {
            try {
                console.log(`[Backend] Attempting Blog Gen with model: ${modelDef.id}...`);
                response = await ai.models.generateContent({
                    model: modelDef.id,
                    contents: blogPrompt,
                    config: {
                        temperature: 0.7,
                        responseMimeType: "text/plain",
                    }
                });
                console.log(`[Backend] ✅ Blog Generation successful using ${modelDef.id}`);
                break;
            } catch (apiError) {
                lastError = apiError;
                console.warn(`[Backend] ⚠️ Model ${modelDef.id} failed: ${apiError.message}. Trying next...`);
            }
        }

        const responseText = extractText(response);
        if (!response || !responseText) {
            throw new Error(`All available Gemini models failed for Blog Gen. Last error: ${lastError?.message}`);
        }

        const blogHtml = responseText;

        const strippedText = blogHtml.replace(/<[^>]+>/g, '');
        const excerpt = strippedText.substring(0, 150).trim() + '...';

        await admin.firestore().collection('daily_blogs').doc(todayStr).set({
            content: blogHtml,
            excerpt: excerpt,
            updatedAt: new Date().toISOString()
        });

        console.log(`[Backend] ✅ Daily Blog saved successfully for ${todayStr}.`);
        return { status: "success", generatedLength: blogHtml.length };

    } catch (e) {
        console.error('[Backend] Blog generation error:', e);
        return { status: "error", error: e.message };
    }
};

// ── Yesterday Grading ─────────────────────────────────────────────────────────
/**
 * Grades yesterday's predictions using Gemini + Google Search.
 * Called by the scheduler and the /api/admin/grade-yesterday endpoint.
 */
export const gradeYesterdayServerSide = async (customDate = null, forceRegrade = false) => {
    console.log(`[Backend] Starting Grading for ${customDate || 'yesterday'}... (Force Regrade: ${forceRegrade})`);
    try {
        const yesterday = customDate || getGlobalYesterdayKey();
        const db = admin.firestore();

        // 1. Fetch yesterday's predictions from Firestore
        const docSnap = await db.collection('daily_predictions').doc(yesterday).get();
        if (!docSnap.exists) {
            console.warn(`[Backend Grading] No predictions document found for ${yesterday}.`);
            return { status: "skipped", reason: "no_document", date: yesterday };
        }

        const data = docSnap.data();
        const existingMatches = data.matches || [];

        if (existingMatches.length === 0) {
            console.warn(`[Backend Grading] No matches found for ${yesterday}.`);
            return { status: "skipped", reason: "empty_matches", date: yesterday };
        }

        // 2. Filter to only ungraded matches unless forceRegrade is true
        const matchesToGrade = forceRegrade
            ? existingMatches
            : existingMatches.filter(m => !m.status || m.status === 'pending');

        if (matchesToGrade.length === 0) {
            console.log(`[Backend Grading] All matches for ${yesterday} already graded.`);
            return { status: "skipped", reason: "already_graded", total: existingMatches.length, date: yesterday };
        }

        console.log(`[Backend Grading] Grading ${matchesToGrade.length} matches for ${yesterday}...`);

        // 3. Grading Schema
        const gradingSchema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    score: { type: Type.STRING },
                    status: { type: Type.STRING, enum: ['won', 'lost', 'void'] }
                },
                required: ["id", "score", "status"]
            }
        };

        const simplifiedList = matchesToGrade.map(m => ({ id: m.id, home: m.homeTeam, away: m.awayTeam }));

        let gradedResults = [];
        const ai = getAI();
        let lastError = null;

        // 4. Step 1: Use Sportmonks API for accurate scores, fallback to Search
        let rawScores = '';
        let missingFromSportmonks = [];

        try {
            console.log(`[Backend Grading] Fetching official Sportmonks results for ${yesterday}...`);
            const smFixtures = await getTodaysFixturesServerSide(yesterday);

            for (const m of matchesToGrade) {
                // Try to find in Sportmonks data
                const matchFound = smFixtures.find(f =>
                    f.fixture.id.toString() === m.id ||
                    (f.teams.home.name === m.homeTeam && f.teams.away.name === m.awayTeam)
                );

                if (matchFound && matchFound.score && (matchFound.fixture.status.short === 'FT' || matchFound.fixture.status.short === 'AET' || matchFound.fixture.status.short === 'PEN')) {
                    rawScores += `Match ID: ${m.id} | ${matchFound.teams.home.name} ${matchFound.goals.home} - ${matchFound.goals.away} ${matchFound.teams.away.name}\n`;
                } else if (matchFound && (matchFound.fixture.status.short === 'CANCL' || matchFound.fixture.status.short === 'POSTP' || matchFound.fixture.status.short === 'INT')) {
                    rawScores += `Match ID: ${m.id} | ${m.homeTeam} vs ${m.awayTeam} | Status: Postponed/Cancelled\n`;
                } else {
                    missingFromSportmonks.push({ id: m.id, home: m.homeTeam, away: m.awayTeam });
                }
            }
        } catch (err) {
            console.warn(`[Backend Grading] Failed to fetch Sportmonks data: ${err.message}. Falling back to AI search for all.`);
            missingFromSportmonks = simplifiedList; // fallback everything
        }

        if (missingFromSportmonks.length > 0) {
            console.log(`[Backend Grading] Missing ${missingFromSportmonks.length} scores from Sportmonks. Using Gemini Search fallback...`);
            let searchScores = '';
            for (const modelDef of AVAILABLE_MODELS) {
                try {
                    const searchResponse = await ai.models.generateContent({
                        model: modelDef.id,
                        contents: `Find the FINAL full-time scores for these football matches played on ${yesterday}. List each match with its exact score: ${JSON.stringify(missingFromSportmonks)}`,
                        config: {
                            temperature: 0.1,
                            tools: [{ googleSearch: {} }]
                        }
                    });
                    searchScores = extractText(searchResponse);
                    console.log(`[Backend Grading] ✅ Fallback Scores fetched using ${modelDef.id}`);
                    break;
                } catch (apiError) {
                    lastError = apiError;
                    console.warn(`[Backend Grading] ⚠️ Search model ${modelDef.id} failed: ${apiError.message}`);
                }
            }
            if (searchScores) {
                rawScores += `\n[FALLBACK SCORES FROM WEB]\n` + searchScores;
            } else if (!rawScores) {
                // If both Sportmonks AND Search failed, we can't grade
                throw new Error(`Could not fetch match scores from API or any model. Last error: ${lastError?.message}`);
            }
        }

        // 5. Step 2: Grade predictions against fetched scores
        const parsePrompt = `
Grade these football predictions using the final scores retrieved below.

PREDICTIONS:
${JSON.stringify(matchesToGrade.map(m => ({ id: m.id, home: m.homeTeam, away: m.awayTeam, prediction: m.prediction_en || m.prediction })), null, 2)}

SCORES RETRIEVED:
${rawScores}

GRADING RULES (apply strictly):

═══ GENERAL ═══
- Use FULL-TIME (90 min + injury time) scores only unless specified otherwise.
- If a match was postponed, abandoned before 90 min, or no result found → status: "void".

═══ MATCH RESULT (1X2) ═══
- "Home Win" → won if home goals > away goals at FT.
- "Away Win" → won if away goals > home goals at FT.
- "Draw" → won if goals are equal at FT.

═══ DOUBLE CHANCE ═══
- "Double Chance (1X)" → won if home wins OR draw.
- "Double Chance (X2)" → won if away wins OR draw.
- "Double Chance (12)" → won if home wins OR away wins (not a draw).

═══ DRAW NO BET ═══
- "Draw No Bet (Home)" → won if home wins; void if draw; lost if away wins.
- "Draw No Bet (Away)" → won if away wins; void if draw; lost if home wins.

═══ OVER/UNDER GOALS ═══
- "Over 0.5 Goals" → won if total goals >= 1.
- "Over 1.5 Goals" → won if total goals >= 2.
- "Over 2.5 Goals" → won if total goals >= 3.
- "Over 3.5 Goals" → won if total goals >= 4.
- "Under 1.5 Goals" → won if total goals <= 1.
- "Under 2.5 Goals" → won if total goals <= 2.
- "Under 3.5 Goals" → won if total goals <= 3.

═══ BOTH TEAMS TO SCORE (BTTS) ═══
- "Both Teams Score" → won if both teams scored at least 1 goal each.
- "Both Teams Score - No" → won if at least one team scored 0 goals.

Return a JSON array with id, score ("2-1" format), and status ("won"|"lost"|"void") for each match.
        `;

        for (const modelDef of AVAILABLE_MODELS) {
            try {
                const formatResponse = await ai.models.generateContent({
                    model: modelDef.id,
                    contents: parsePrompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: gradingSchema
                    }
                });
                const formatText = extractText(formatResponse);
                gradedResults = JSON.parse(formatText || "[]");
                console.log(`[Backend Grading] ✅ Grading parse successful using ${modelDef.id}. Graded ${gradedResults.length} matches.`);
                break;
            } catch (apiError) {
                lastError = apiError;
                console.warn(`[Backend Grading] ⚠️ Parse model ${modelDef.id} failed: ${apiError.message}`);
            }
        }

        if (gradedResults.length === 0) {
            throw new Error(`Grading parse failed across all models. Last error: ${lastError?.message}`);
        }

        // 6. Merge grades back into full match list
        let updatesCount = 0;
        const updatedMatches = existingMatches.map(m => {
            const grade = gradedResults.find(g => g.id === m.id || g.id === String(m.id));
            if (grade) {
                updatesCount++;
                return { ...m, score: grade.score || "N/A", status: grade.status };
            }
            return m;
        });

        // 7. Save back to Firestore via Admin SDK
        await db.collection('daily_predictions').doc(yesterday).set({
            matches: updatedMatches,
            gradedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        console.log(`[Backend Grading] ✅ Grading complete. Updated ${updatesCount}/${existingMatches.length} matches for ${yesterday}.`);
        return { status: "success", total: existingMatches.length, graded: updatesCount, saved: true, date: yesterday };

    } catch (e) {
        console.error('[Backend Grading] Error:', e);
        return { status: "error", error: e.message };
    }
};
// ── Basketball Predictions ────────────────────────────────────────────────────
/**
 * Generates today's basketball predictions using Gemini with Google Search grounding.
 * Targets NBA, EuroLeague, NBL, WNBA, and major African/international leagues.
 * Saves results to Firestore collection 'basketball_predictions' (today's date key).
 */
export const generateBasketballPredictionsServerSide = async () => {
    console.log('[Backend] Starting Basketball Predictions Generation...');
    try {
        const todayStr = getGlobalTodayKey();
        const ai = getAI();
        let response = null;
        let usedModel = null;
        let lastError = null;

        const prompt = `
You are the "Quant-Desk Basketball Engine v2.0", an elite global basketball betting model with access to real statistical data and live game schedules.

DATE: ${todayStr}

═══════════════════════════════════════════════
YOUR OBJECTIVE
═══════════════════════════════════════════════
Use Google Search to find ALL basketball games scheduled for ${todayStr} worldwide.
Then analyze and identify 10 to 15 high-value betting opportunities.

LEAGUE PRIORITY (scan in this order — reflects African betting volume for basketball):
1. 🏀 NBA (HIGHEST — most popular basketball league in Africa)
2. 🏀 EuroLeague / EuroCup
3. 🏀 WNBA, G-League (when NBA is in off-season)
4. 🏀 NBB (Brazil), ACB (Spain), LNB Pro A (France), Bundesliga Basketball (Germany)
5. 🌍 BAL (Basketball Africa League), FIBA World Cup / EuroBasket (when in season)

═══════════════════════════════════════════════
🧮 QUANTITATIVE RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════
1. EV CALCULATION: EV = (Your model probability × Decimal odds) − 1. Only pick if EV ≥ +0.06.
2. CONFIDENCE FLOOR: ≥ 70%. Use team form (last 5 games), home/away record, injury report, and pace stats.
3. ONE market per match. Choose from: "Home Win", "Away Win", "Over [X] Points", "Under [X] Points", "Handicap: Home -[X.5]", "Handicap: Away -[X.5]".
4. Use total points lines commonly offered by bookmakers (e.g. "Over 220.5 Points").

═══════════════════════════════════════════════
🚨 OUTPUT FORMAT & ADDITIONAL DATA REQUIREMENTS (Strict JSON)
═══════════════════════════════════════════════
Each object must have:
- 'id': a unique string identifying this match, format: "bball-YYYYMMDD-HomeTeamSlug-AwayTeamSlug"
- 'homeTeam': full team name
- 'awayTeam': full team name
- 'league': league name (e.g. "NBA", "EuroLeague")
- 'time': match time in HH:MM format (local game time or UTC)
- 'prediction_en': the market and outcome (e.g. "Home Win", "Over 224.5 Points")
- 'prediction_fr': French translation
- 'prediction': same as prediction_en
- 'confidence': 0–100 integer
- 'odds': decimal odds for the chosen market
- 'category': "safe" (confidence >= 80), "value" (70-79), or "risky" (<70)
- 'analysis_en': "EV: +X.X% | Edge: Y% | [max 20 words of reasoning]"
- 'analysis_fr': French translation
- 'homeForm' / 'awayForm': Last 5 games form mapping e.g., "W W L L W" (String).
- 'homeWinRate' / 'awayWinRate': 0-100 integer representing win rate percentage.
- 'homeAvgScored' / 'awayAvgScored': Float, avg points scored per game.
- 'homeAvgConceded' / 'awayAvgConceded': Float, avg points conceded per game.
- 'homeCleanSheetRate' / 'awayCleanSheetRate': 0-100 integer (usually 0 for basketball, but required for schema).
- 'h2hHomeWins' / 'h2hAwayWins' / 'h2hDraws': Integer count of last 5 H2H results.
- 'h2hLast5Goals': String of recent H2H scores e.g., "112-108, 98-105".
- 'homeInjured' / 'awayInjured': Array of strings representing key injured players. Empty array if none.
- 'homeTeamLogo': empty string ""
- 'awayTeamLogo': empty string ""
- 'sport': "basketball"
- 'status': "pending"

Output JSON array only. No markdown. No preamble.
        `;

        // Try models with Google Search grounding
        for (const modelDef of AVAILABLE_MODELS) {
            try {
                console.log(`[Backend Basketball] Attempting with model: ${modelDef.id}...`);
                response = await ai.models.generateContent({
                    model: modelDef.id,
                    contents: prompt,
                    config: {
                        temperature: 0.15,
                        tools: [{ googleSearch: {} }],
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING },
                                    homeTeam: { type: Type.STRING },
                                    awayTeam: { type: Type.STRING },
                                    league: { type: Type.STRING },
                                    time: { type: Type.STRING },
                                    prediction_en: { type: Type.STRING },
                                    prediction_fr: { type: Type.STRING },
                                    prediction: { type: Type.STRING },
                                    confidence: { type: Type.NUMBER },
                                    odds: { type: Type.NUMBER },
                                    category: { type: Type.STRING },
                                    analysis_en: { type: Type.STRING },
                                    analysis_fr: { type: Type.STRING },
                                    homeForm: { type: Type.STRING },
                                    awayForm: { type: Type.STRING },
                                    homeWinRate: { type: Type.NUMBER },
                                    awayWinRate: { type: Type.NUMBER },
                                    homeAvgScored: { type: Type.NUMBER },
                                    awayAvgScored: { type: Type.NUMBER },
                                    homeAvgConceded: { type: Type.NUMBER },
                                    awayAvgConceded: { type: Type.NUMBER },
                                    homeCleanSheetRate: { type: Type.NUMBER },
                                    awayCleanSheetRate: { type: Type.NUMBER },
                                    h2hHomeWins: { type: Type.NUMBER },
                                    h2hAwayWins: { type: Type.NUMBER },
                                    h2hDraws: { type: Type.NUMBER },
                                    h2hLast5Goals: { type: Type.STRING },
                                    homeInjured: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    awayInjured: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    homeTeamLogo: { type: Type.STRING },
                                    awayTeamLogo: { type: Type.STRING },
                                    sport: { type: Type.STRING },
                                    status: { type: Type.STRING },
                                },
                                required: ["id", "homeTeam", "awayTeam", "league", "time", "prediction_en", "confidence", "odds", "category", "analysis_en"]
                            }
                        }
                    }
                });
                usedModel = modelDef.id;
                console.log(`[Backend Basketball] ✅ Generation successful using ${usedModel}`);
                break;
            } catch (apiError) {
                lastError = apiError;
                console.warn(`[Backend Basketball] ⚠️ Model ${modelDef.id} failed: ${apiError.message}. Trying next...`);
            }
        }

        if (!response) {
            throw new Error(`All Gemini models failed for basketball generation. Last error: ${lastError?.message}`);
        }

        const responseText = extractText(response);
        const predictions = JSON.parse(responseText || "[]");

        if (!Array.isArray(predictions) || predictions.length === 0) {
            console.warn('[Backend Basketball] No predictions returned from Gemini.');
            return { status: "skipped", reason: "no_predictions_returned" };
        }

        console.log(`[Backend Basketball] Generated ${predictions.length} basketball predictions.`);

        // Normalise: ensure sport & status fields are set
        const normalised = predictions.map(p => ({
            ...p,
            sport: 'basketball',
            status: p.status || 'pending',
            homeTeamLogo: p.homeTeamLogo || '',
            awayTeamLogo: p.awayTeamLogo || '',
            prediction: p.prediction || p.prediction_en,
        }));

        // Save to Firestore under a dedicated 'basketball_predictions' collection
        await admin.firestore().collection('basketball_predictions').doc(todayStr).set({
            matches: normalised,
            generatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        console.log(`[Backend Basketball] ✅ ${normalised.length} predictions saved for ${todayStr}.`);
        return { status: "success", generated: normalised.length, matches: normalised };

    } catch (e) {
        console.error('[Backend Basketball] Error:', e);
        return { status: "error", error: e.message };
    }
};
