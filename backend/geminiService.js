import { GoogleGenAI, Type } from "@google/genai";
import admin from 'firebase-admin';

// Reusing same models and context generation flow from the frontend
const AVAILABLE_MODELS = [
    { id: 'gemini-3-flash-preview', name: 'Vantage AI 3.0 Flash (Stable)' },
    { id: 'gemini-2.0-flash-exp', name: 'Vantage AI 2.0 Flash (Experimental)' },
    { id: 'gemini-3-pro-preview', name: 'Vantage AI 3.0 Pro (Reasoning)' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Complex Reasoning)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Versatile)' }
];

/** Helper to get a date key for N days ago */
const getDateKeyDaysAgo = (daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const getGlobalTodayKey = () => getDateKeyDaysAgo(0);
export const getGlobalYesterdayKey = () => getDateKeyDaysAgo(1);

// Utility to fetch SportsData via local fetch passing token natively since we're Server-side
export const fetchSportmonksServerSide = async (path) => {
    try {
        const token = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
        const separator = path.includes('?') ? '&' : '?';
        const url = `https://api.sportmonks.com/v3/football${path}${separator}api_token=${token}`;

        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) {
            console.warn(`[Backend] Sportmonks API Error (${res.status}) on ${path}`);
            return null;
        }
        const data = await res.json();
        return data.data ?? null;
    } catch (e) {
        console.warn(`[Backend] Fetch catch error on ${path}`, e);
        return null;
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

export const generateDailyPredictionsServerSide = async () => {
    console.log('[Backend] Starting scheduled Daily Predictions...');
    try {
        const todayStr = getGlobalTodayKey();
        const rawFixtures = await getTodaysFixturesServerSide(todayStr);
        const filteredFixtures = filterGlobalFixturesServerSide(rawFixtures);

        if (filteredFixtures.length > 0) {
            const simplifiedRaw = filteredFixtures.map(f => ({
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

            // Saving raw fixtures placeholder for backend flow via admin
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
🚨 OUTPUT FORMAT
═══════════════════════════════════════════════
- 'id': Use the exact ID provided in the JSON payload.
- 'prediction_en' / 'prediction_fr': Localized prediction label.
- 'analysis_en' format: "EV: +X.X% | Edge: Y% | [max 20 words of reasoning]"
- 'analysis_fr': French translation of analysis.
- 'confidence': 0–100 integer.
- 'odds': Real bookmaker decimal odds for your chosen market.
- Output JSON array only.
        `;

        if (!process.env.GOOGLE_GENAI_API_KEY && !process.env.VITE_GOOGLE_GENAI_API_KEY) {
            throw new Error("Missing Google Gen AI API Key on server");
        }

        const ai = new GoogleGenAI({ apiKey: process.env.VITE_GOOGLE_GENAI_API_KEY || process.env.GOOGLE_GENAI_API_KEY });
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
                                    analysis_fr: { type: Type.STRING }
                                },
                                required: ["id", "prediction_en", "confidence", "odds", "analysis_en", "category"]
                            }
                        }
                    }
                });

                // If we get here without throwing, the model succeeded
                usedModel = modelDef.id;
                console.log(`[Backend] ✅ Generation successful using ${usedModel}`);
                break; // Exit the fallback loop
            } catch (apiError) {
                lastError = apiError;
                console.warn(`[Backend] ⚠️ Model ${modelDef.id} failed: ${apiError.message}. Trying next model...`);
                // Continue to the next iteration of the loop
            }
        }

        if (!response) {
            throw new Error(`All available Gemini models failed. Last error: ${lastError?.message}`);
        }

        const predictions = JSON.parse(response.text || "[]");

        // Merge AI predictions back with the simplified raw matches
        const finalMatches = simplifiedRaw.map(raw => {
            const pred = predictions.find(p => p.id === raw.id || p.id === parseInt(raw.id));
            if (pred) {
                return { ...raw, ...pred };
            }
            return raw;
        }).filter(m => m.prediction_en); // Only keep ones AI analyzed

        console.log(`[Backend] Generated ${finalMatches.length} predictions successfully.`);

        // Save to Firebase Admin
        await admin.firestore().collection('daily_predictions').doc(todayStr).set({
            status: 'completed',
            matches: finalMatches,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        return { status: "success", generated: finalMatches.length, matches: finalMatches };
    } catch (e) {
        console.error('Backend generation error:', e);
        return { status: "error", error: e.message };
    }
}
