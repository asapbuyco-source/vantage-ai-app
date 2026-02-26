import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Match, AccumulatorSet } from "../types";
import { getGlobalTodayKey, saveTodaysPredictions, saveDailyFixtures, getGlobalYesterdayKey, getPredictionsForDate, savePredictionsForDate, getTeamAssetsMap, saveTeamAsset } from "./db";
import { getTodaysFixtures, filterGlobalFixtures, enrichFixtures, formatFixtureContext } from "./sportsData";

// Dynamic Model Management
// Switched to 3.0 Flash for balanced performance and speed.
const DEFAULT_MODEL = 'gemini-3.0-flash';

export const AVAILABLE_MODELS = [
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro (Complex Tasks & Engineering)' },
    { id: 'gemini-3.0-deep-think', name: 'Gemini 3 Deep Think (Research & Logic)' },
    { id: 'gemini-3.0-flash', name: 'Gemini 3 Flash (Ultra-Fast & Efficient)' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Complex Reasoning)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Versatile)' }
];

const savedModel = localStorage.getItem('vantage_gemini_model');
const isValidModel = savedModel && AVAILABLE_MODELS.some(m => m.id === savedModel);
let currentModel = isValidModel ? savedModel : DEFAULT_MODEL;

export const setGeminiModel = (model: string) => {
    currentModel = model;
    localStorage.setItem('vantage_gemini_model', model);
};

export const getGeminiModel = () => currentModel;

const BACKEND_URL = import.meta.env?.VITE_BACKEND_URL || "http://localhost:8080";

/**
 * Hits the backend proxy instead of exposing the API key to the browser.
 */
async function backendGenerateContent(model: string, contents: string, config: any = {}) {
    const res = await fetch(`${BACKEND_URL}/api/gemini/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, contents, config })
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error: any = new Error(errData.details || errData.error || `HTTP error ${res.status}`);
        error.status = res.status;
        throw error;
    }

    return await res.json(); // returns { text: '...' }
}

/**
 * Helper: Retry mechanism with exponential backoff
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        const isRateLimit = error.status === 429 || error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED');
        const isPermissionDenied = error.status === 403 || error.message?.includes('403');

        // Server errors or Network/RPC errors (code 500, 503, xhr error)
        // We SHOULD retry these as they are often transient.

        // If Permission Denied (403), do not retry, throw immediately to be handled by fallback logic
        if (isPermissionDenied) {
            throw error;
        }

        // Stop retrying if Quota Exceeded, let the main handler switch to local fallback immediately
        if (isRateLimit) {
            throw error;
        }

        if (retries > 0) {
            console.warn(`[Gemini] Request failed (Status ${error.status || 'Unknown'}). Retrying in ${delay}ms...`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
            return withRetry(fn, retries - 1, delay * 2);
        }
        throw error;
    }
}

/**
 * Tests the Gemini connection with Search Grounding.
 */
export const testGeminiConnection = async (): Promise<{ status: 'OK' | 'ERROR'; latency: number; message: string }> => {
    const start = performance.now();
    try {
        console.log(`[Gemini Test] Using model: ${currentModel}`);

        const response = await withRetry<any>(() => backendGenerateContent(
            currentModel,
            "Search for today's football matches. Are there any big games? Answer in 1 short sentence.",
            { temperature: 0.1, tools: [{ googleSearch: {} }] }
        ));

        const latency = Math.round(performance.now() - start);
        const text = response.text || "No response text";

        return { status: 'OK', latency, message: text.trim() };
    } catch (e: any) {
        const latency = Math.round(performance.now() - start);
        let msg = e.message || "Unknown error";

        // Custom friendly messages
        if (msg.includes('403')) {
            // Fallback test without search to see if key works at all
            try {
                await backendGenerateContent(
                    'gemini-3-pro', // Try fallback model
                    "Hello"
                );
                return { status: 'OK', latency, message: "Search Denied (403), but AI is active. Simulation Mode enabled." };
            } catch (innerE) {
                msg = "Permission Denied (403). API Key invalid.";
            }
        } else if (msg.includes('429')) {
            msg = "Quota Exceeded (429). Try again later.";
        }

        return { status: 'ERROR', latency, message: msg };
    }
};

/**
 * GRADES YESTERDAY'S MATCHES
 */
export const gradeYesterdayPredictions = async (): Promise<{ total: number, graded: number, saved: boolean }> => {
    // Note: Grading strictly requires search to be accurate. 
    // If search is 403, we can't really grade. 
    const yesterday = getGlobalYesterdayKey();

    const existingMatches = await getPredictionsForDate(yesterday);
    if (!existingMatches || existingMatches.length === 0) {
        throw new Error(`No predictions found for ${yesterday}.`);
    }

    const matchesToGrade = existingMatches.filter(m => !m.status || m.status === 'pending');
    if (matchesToGrade.length === 0) return { total: existingMatches.length, graded: 0, saved: false };

    const simplifiedList = matchesToGrade.map(m => ({ id: m.id, home: m.homeTeam, away: m.awayTeam }));

    // Grading Schema
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

    let gradedResults: any[] = [];

    try {
        // Attempt with Search
        const searchPrompt = `Find final scores for ${yesterday}: ${JSON.stringify(simplifiedList)}`;
        const searchResponse = await withRetry<any>(() => backendGenerateContent(
            currentModel,
            searchPrompt,
            { temperature: 0.1, tools: [{ googleSearch: {} }] }
        ));

        const rawScores = searchResponse.text;

        const parsePrompt = `
Grade these football predictions using the final scores retrieved above.

PREDICTIONS:
${JSON.stringify(matchesToGrade.map(m => ({ id: m.id, home: m.homeTeam, away: m.awayTeam, prediction: m.prediction })), null, 2)}

SCORES RETRIEVED:
${rawScores}

GRADING RULES (apply strictly — COMPREHENSIVE):

═══ GENERAL ═══
- Use FULL-TIME (90 min + injury time) scores only unless specified otherwise.
- Ignore half-time, live, or pre-match data for FT markets.
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
- "BTTS & Over 2.5" → won if both teams scored AND total goals >= 3.
- "BTTS & Under 3.5" → won if both teams scored AND total goals <= 3.

═══ HANDICAP ═══
- "Home -1" → apply -1 to home score, then grade as Home Win. Example: 2-1 → 1-1 → lost.
- "Home -1.5" → apply -1.5 to home score, then grade as Home Win. Example: 2-0 → 0.5-0 → won.
- "Away +1.5" → apply +1.5 to away score, then grade as Away Win or Draw. Example: 1-0 → 1-1.5 → won.
- General pattern: "Team ±N" → apply handicap, then evaluate.

═══ WIN TO NIL ═══
- "Home Win to Nil" → won if home wins AND away scored 0 goals.
- "Away Win to Nil" → won if away wins AND home scored 0 goals.

═══ CLEAN SHEET ═══
- "Home Clean Sheet" → won if away scored 0 goals (regardless of match result).
- "Away Clean Sheet" → won if home scored 0 goals (regardless of match result).

═══ HALF-TIME / FULL-TIME ═══
- "HT/FT: X/Y" → X is HT result, Y is FT result. Example: "HT/FT: Home/Home" → home leading at HT AND home winning at FT.
- Results: "Home", "Draw", "Away". All 9 combinations valid.
- "HT: Home" / "HT: Draw" / "HT: Away" → based on half-time score only.

═══ CORRECT SCORE ═══
- "Correct Score: X-Y" → won ONLY if the exact FT score matches (e.g., "Correct Score: 2-1" → FT must be 2-1).

═══ ODD / EVEN ═══
- "Total Goals Odd" → won if total goals is an odd number (1, 3, 5...).
- "Total Goals Even" → won if total goals is even (0, 2, 4...). 0-0 counts as even.

═══ SPECIAL CASES ═══
- Cup matches with Extra Time: grade on 90-minute (FT) score for goal-based markets. For match result markets, grade on the final result (including ET/penalties if applicable).
- Penalty Shootout: does NOT affect goal-based markets (Over/Under, BTTS, etc.). Only affects match winner markets.
- Walkover / Technical result → status: "void".
- If prediction text doesn't match any known market above, attempt best-effort interpretation; if ambiguous → status: "void".

Return a JSON array with id, score ("2-1" format), and status ("won"|"lost"|"void") for each match.
    `;

        const formatResponse = await withRetry<any>(() => backendGenerateContent(
            currentModel,
            parsePrompt,
            { responseMimeType: "application/json", responseSchema: gradingSchema }
        ));

        gradedResults = JSON.parse(formatResponse.text || "[]");

    } catch (e: any) {
        if (e.message?.includes('403')) {
            console.warn("[Grading] Search denied. Skipping grading.");
            return { total: existingMatches.length, graded: 0, saved: false };
        }
        throw e;
    }

    let updatesCount = 0;
    const updatedMatches = existingMatches.map(m => {
        const grade = gradedResults.find((g: any) => g.id === m.id);
        if (grade) {
            updatesCount++;
            return { ...m, score: grade.score || "N/A", status: grade.status };
        }
        return m;
    });

    await savePredictionsForDate(yesterday, updatedMatches);
    return { total: existingMatches.length, graded: updatesCount, saved: true };
};

/**
 * Shared schema — used by both football and basketball prediction generators.
 */
const matchesSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.STRING },
            league: { type: Type.STRING },
            homeTeam: { type: Type.STRING },
            awayTeam: { type: Type.STRING },
            time: { type: Type.STRING },
            prediction_en: { type: Type.STRING },
            prediction_fr: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            odds: { type: Type.NUMBER },
            category: { type: Type.STRING, enum: ['safe', 'value', 'risky'] },
            analysis_en: { type: Type.STRING },
            analysis_fr: { type: Type.STRING },
            homeTeamLogo: { type: Type.STRING },
            awayTeamLogo: { type: Type.STRING }
        },
        required: ["id", "league", "homeTeam", "awayTeam", "time", "prediction_en", "confidence", "category", "analysis_en"]
    }
};

/**
 * Generates predictions (Matches Only)
 */
export const generateDailyPredictions = async (signal?: AbortSignal): Promise<Match[]> => {
    try {
        const todayStr = getGlobalTodayKey();
        console.log(`[Gemini Pipeline] Starting Analysis for ${todayStr} using ${currentModel}...`);

        // (matchesSchema is defined at module scope above)

        // -------------------------------------------------------------------------
        // ATTEMPT 1: REAL DATA (API-Football enriched context + Search Grounding)
        // -------------------------------------------------------------------------
        try {
            const rawFixtures = await getTodaysFixtures();
            const filteredFixtures = filterGlobalFixtures(rawFixtures);

            if (filteredFixtures.length > 0) {
                const simplifiedRaw: Match[] = filteredFixtures.map(f => ({
                    id: f.fixture.id.toString(),
                    league: f.league.name,
                    leagueId: f.league.id,
                    seasonId: f.league.season,
                    homeTeam: f.teams.home.name,
                    homeTeamId: f.teams.home.id,
                    awayTeam: f.teams.away.name,
                    awayTeamId: f.teams.away.id,
                    time: new Date(f.fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    prediction: '',
                    confidence: 0,
                    odds: 0,
                    category: 'safe',
                    homeTeamLogo: f.teams.home.logo,
                    awayTeamLogo: f.teams.away.logo,
                    sport: 'football',
                    status: 'pending'
                }));
                saveDailyFixtures(todayStr, simplifiedRaw).catch(console.error);
            }

            // Enrich with form, H2H, odds, and injuries — all in parallel
            let fixtureContext: string;
            if (filteredFixtures.length > 0) {
                const enriched = await enrichFixtures(filteredFixtures, new Date().getFullYear());
                const richContext = formatFixtureContext(enriched);
                fixtureContext = `ENRICHED FIXTURES FOR TODAY (${todayStr}):\n\n${richContext}`;
            } else {
                fixtureContext = `No high-priority fixtures found via API for ${todayStr}. Use Google Search to find major global games.`;
            }

            const searchPrompt = `
You are the "Quant-Desk Decision Engine v6.0", an elite global sports betting model with access to real statistical data.

DATE: ${todayStr}

${fixtureContext}

═══════════════════════════════════════════════
YOUR OBJECTIVE
═══════════════════════════════════════════════
Using the enriched fixture data above AND Google Search for additional matches today:
- Identify and analyze at least 15 to 20 high-quality betting opportunities.
- Goal: Ensure the app is content-rich. If marquee leagues are light, look for high-confidence picks in secondary leagues.

LEAGUE PRIORITY (scan in this order — this reflects actual African betting volume):
1. 🏆 English Premier League + UEFA Champions League (HIGHEST — ~50% of bets)
2. ⭐ La Liga, Serie A, Bundesliga, UEFA Europa League (~25%)
3. 🇫🇷 Ligue 1, Primeira Liga, Conference League (~10%) — Ligue 1 is key for Francophone Africa
4. 🌍 Eredivisie, Championship, Turkish Süper Lig, MLS, Brazilian Série A (~8%)
5. 🌍 AFCON, CAF Champions League, NPFL (big derbies only), Ghana Premier League (~5%)
6. 🌍 Other African domestic leagues — only if there are high-confidence picks (~2%)

- Only include matches where you have a "Model Edge" (your probability > bookmaker implied probability).
- Predictions must be professional and use standard market labels.

═══════════════════════════════════════════════
🧮 QUANTITATIVE RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════
1. EV CALCULATION: EV = (Your model probability × Decimal odds) − 1. Only pick if EV ≥ +0.06 (6% edge).
2. CONFIDENCE FLOOR: ≥ 72%. Use team form, H2H record, injury absences, and market implied probability.
3. ONE Market Per Match (safest one). Choose from:

   AVAILABLE MARKETS (pick the safest qualifying one):
   • Match Result: "Home Win", "Away Win", "Draw"
   • Double Chance: "Double Chance (1X)", "Double Chance (X2)", "Double Chance (12)"
   • Draw No Bet: "Draw No Bet (Home)", "Draw No Bet (Away)"
   • Goals Over/Under: "Over 0.5 Goals", "Over 1.5 Goals", "Over 2.5 Goals", "Over 3.5 Goals",
     "Under 1.5 Goals", "Under 2.5 Goals", "Under 3.5 Goals"
   • BTTS: "Both Teams Score", "Both Teams Score - No"
   • Combo: "BTTS & Over 2.5", "BTTS & Under 3.5"
   • Win to Nil: "Home Win to Nil", "Away Win to Nil"
   • Clean Sheet: "Home Clean Sheet", "Away Clean Sheet"
   • Handicap: "Home -1", "Home -1.5", "Away +1.5", etc.
   • HT/FT: "HT/FT: Home/Home", "HT/FT: Draw/Home", etc.
   • Correct Score: "Correct Score: 2-1", etc. (use sparingly, high risk)
   • Odd/Even: "Total Goals Odd", "Total Goals Even"

   SAFETY HIERARCHY (prefer safer markets):
   Double Chance > Draw No Bet > Over 1.5 Goals > BTTS > Home/Away Win > Over 2.5 > Handicap > HT/FT > Correct Score

4. INJURY IMPACT: If a key player is listed as injured in the data above, lower confidence accordingly.
5. H2H WEIGHT: If H2H strongly contradicts form, de-risk to Double Chance or DNB.
6. FORM MOMENTUM: Teams on W W W W W form get +5% confidence boost; L L L L L get −10%.

═══════════════════════════════════════════════
🚨 OUTPUT FORMAT
═══════════════════════════════════════════════
- 'prediction_en' / 'prediction_fr': Localized prediction label (must exactly match one of the market names above).
- 'analysis_en' format: "EV: +X.X% | Edge: Y% | [max 20 words of reasoning including key stat used]"
- 'analysis_fr': French translation of analysis.
- 'confidence': 0–100 integer. Be honest — do NOT inflate.
- 'odds': Real bookmaker decimal odds for your chosen market.
- Use homeTeamLogo / awayTeamLogo from the data above where available.
- Output JSON only — no prose.
        `;

            const response = await withRetry<any>(() => backendGenerateContent(
                currentModel,
                searchPrompt,
                {
                    temperature: 0.1, // Low temperature for strict adherence
                    tools: [{ googleSearch: {} }],
                    responseMimeType: "application/json",
                    responseSchema: matchesSchema
                }
            ));

            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

            const jsonText = response.text;
            if (jsonText) {
                return parseAndEnhanceMatches(jsonText);
            }

        } catch (e: any) {
            const errStr = e.toString() || e.message;
            const isQuota = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota');
            const isServer = errStr.includes('500') || errStr.includes('503') || errStr.includes('Rpc failed');
            const isPermission = errStr.includes('403') || errStr.includes('Permission') || errStr.includes('Search');

            // IF QUOTA (429) OR SERVER (500) -> SWITCH TO LOCAL FALLBACK IMMEDIATELY
            if (isQuota || isServer) {
                console.warn(`[Gemini Pipeline] API Limit/Error (${e.status || 'Unknown'}). Switching to Local Fallback Data.`);
                return await generateLocalFallbackMatches();
            }

            // -------------------------------------------------------------------------
            // ATTEMPT 2: AI SIMULATION (If 403 or Search Failure, but API is alive)
            // -------------------------------------------------------------------------
            if (isPermission) {
                console.warn(`[Gemini Pipeline] Search Tool Access Denied (403). Activating Simulation Mode.`);

                try {
                    const simulationPrompt = `
                    SYSTEM OVERRIDE: SEARCH TOOL UNAVAILABLE. ACT AS SIMULATION ENGINE v3.0.
                    
                    TASK: Generate a REALISTIC simulation of football matches for DATE: ${todayStr}.
                    Simulate as many matches as plausible across global leagues. Apply the full safety filter and return ALL that qualify — no fixed count.
                    
                    APPLY "Quant-Desk Decision Engine v3.0" SAFETY LOGIC (ODDS_DATA = SIMULATED):
                    1. Simulate "Model Probability" & "Decimal Odds" realistically per league.
                    2. Calculate EV = (Model Prob * Odds) - 1.
                    3. FILTER: Discard if EV < 5% OR confidence < 70%.
                    4. ONE market per match — choose the SAFEST qualifying market only.
                    5. Market preference: Double Chance > DNB > Over 1.5 > Home/Away Win > Over 2.5.
                    6. OUTPUT JSON matching schema.
                    7. 'analysis_en' MUST look like: "EV: +5.2% | Edge: 7.1% | [Brief reason, max 15 words]".
                    8. Mark 'category' as 'safe' wherever confidence ≥ 78%.
                    
                    Use realistic team names, leagues, and times. Do not repeat a match.
                `;

                    // Call without tools, and force a generally available model to avoid cascading 403s
                    // Use 'gemini-3.0-flash' as it is more stable than experimental models
                    const fallbackModel = 'gemini-3.0-flash';

                    const response = await backendGenerateContent(
                        fallbackModel,
                        simulationPrompt,
                        {
                            temperature: 0.7,
                            responseMimeType: "application/json",
                            responseSchema: matchesSchema
                        }
                    );

                    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

                    if (response.text) {
                        return parseAndEnhanceMatches(response.text);
                    }
                } catch (simError: any) {
                    console.warn("Simulation failed (likely API Key restriction). Switching to offline data.", simError.message);
                    // If simulation fails, fall through to Local Fallback
                }
            }

            // Final catch-all for attempt 1 failures
            console.warn("Attempt 1 failed. Switching to Local Fallback.");
            return await generateLocalFallbackMatches();
        }

        return [];

    } catch (error: any) {
        if (error instanceof DOMException && error.name === 'AbortError') return [];
        console.error("Gemini Pipeline Critical Error:", error);
        // CRITICAL: Always return local data instead of failing completely
        return await generateLocalFallbackMatches();
    }
};

/**
 * SEPARATE FUNCTION: Generates Smart Accumulators based on existing matches
 */
export const generateSmartAccumulators = async (matches: Match[]): Promise<AccumulatorSet> => {
    // -------------------------------------------------------------------------
    // CRITICAL PRE-PROCESSING: STRICT UNCERTAINTY FILTER
    // -------------------------------------------------------------------------
    // We filter out ANY match that is flagged as Uncertain BEFORE sending to the AI.
    // This physically prevents the AI from picking them for accumulators.
    const eligibleMatches = matches.filter(m => {
        const analysis = (m.analysis_en || "").toLowerCase();
        // Check for 'uncertain' or 'no play' indicators
        if (analysis.startsWith('uncertain')) return false;
        if (analysis.includes('market mixed') || analysis.includes('data confidence insufficient')) return false;
        return true;
    });

    if (eligibleMatches.length === 0) {
        console.warn("[Accumulator] All matches were flagged as Uncertain. Returning empty sets.");
        return { safe: [], medium: [], high: [] };
    }

    try {

        const simplifiedMatches = eligibleMatches.map(m => ({
            id: m.id,
            match: `${m.homeTeam} vs ${m.awayTeam}`,
            prediction: m.prediction_en,
            odds: m.odds,
            confidence: m.confidence,
            category: m.category,
            analysis: m.analysis_en
        }));

        const prompt = `
            SYSTEM ROLE: You are the "Quant-Desk Senior Portfolio Manager" for Vantage AI.
            OBJECTIVE: Construct 3 distinct, optimized accumulator tickets (Portfolios) from a pre-qualified match pool.

            INPUT MATCH POOL (Pre-qualified — all passed EV ≥ 5% and confidence ≥ 70%):
            ${JSON.stringify(simplifiedMatches)}

            CRITICAL CONSTRAINTS (NON-NEGOTIABLE):
            1. MUTUAL EXCLUSIVITY: A match ID MUST NOT appear in more than one portfolio.
            2. SAFETY FIRST: When in doubt between two matches, always pick the higher-confidence, lower-variance one.
            3. ALLOCATION STRATEGY:
               - Step 1: Identify the top 2-3 matches by confidence (≥78%) → assign to 'safe'.
               - Step 2: Next tier by confidence (70-77%) or higher-EV value plays → assign to 'medium'.
               - Step 3: Remaining matches with solid EV but more variance → assign to 'high'.
            4. DIVERSITY: Do not include the same league more than twice in a single portfolio.
            5. If fewer than 2 matches qualify for a tier, assign an empty array for that tier.

            --------------------------------------------------
            PORTFOLIO 1: "SAFE" (Capital Preservation)
            --------------------------------------------------
            - RISK PROFILE: Minimal. Bankers only.
            - SELECTION: 2-3 highest confidence matches (prefer Double Chance / DNB markets).
            - TYPICAL ODDS: 1.60 - 2.50 combined.

            --------------------------------------------------
            PORTFOLIO 2: "MEDIUM" (Steady Compounder)
            --------------------------------------------------
            - RISK PROFILE: Balanced growth.
            - SELECTION: 3-5 next-best matches from remaining pool.
            - TYPICAL ODDS: 3.00 - 7.00 combined.

            --------------------------------------------------
            PORTFOLIO 3: "HIGH" (High Variance / Small Stake)
            --------------------------------------------------
            - RISK PROFILE: High variance. Use smallest stake.
            - SELECTION: 4-6 from remaining matches with highest EV, accepting more risk.
            - TYPICAL ODDS: 10.00+ combined.

            OUTPUT: JSON Object only.
            {
                "safe": ["id_1", "id_2"],
                "medium": ["id_3", "id_4", "id_5"],
                "high": ["id_6", "id_7", "id_8", "id_9"]
            }
        `;

        const schema = {
            type: Type.OBJECT,
            properties: {
                safe: { type: Type.ARRAY, items: { type: Type.STRING } },
                medium: { type: Type.ARRAY, items: { type: Type.STRING } },
                high: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["safe", "medium", "high"]
        };

        const response = await withRetry<any>(() => backendGenerateContent(
            currentModel,
            prompt,
            {
                responseMimeType: "application/json",
                responseSchema: schema,
                temperature: 0.1 // Strictly deterministic
            }
        ));

        const result = JSON.parse(response.text || "{}");
        return {
            safe: result.safe || [],
            medium: result.medium || [],
            high: result.high || []
        };

    } catch (e: any) {
        console.error("Failed to generate accumulators (using fallback):", e.message);

        // Fallback Algorithm: Manually enforce mutual exclusivity
        // 1. Deduplicate & Sort
        const uniqueMatches = [...eligibleMatches].sort((a, b) => b.confidence - a.confidence);
        const usedIds = new Set<string>();

        const getUnused = (count: number) => {
            const selected: string[] = [];
            for (const m of uniqueMatches) {
                if (selected.length >= count) break;
                if (!usedIds.has(m.id)) {
                    selected.push(m.id);
                    usedIds.add(m.id);
                }
            }
            return selected;
        };

        // 2. Allocate strictly
        const safe = getUnused(2);  // Top 2 for Safe
        const medium = getUnused(4); // Next 4 for Medium
        const high = getUnused(5);   // Next 5 for High

        return { safe, medium, high };
    }
};

/**
 * Shared Helper to parse JSON and add Custom Logos
 */
async function parseAndEnhanceMatches(jsonText: string): Promise<Match[]> {
    try {
        // Sanitize: Remove Markdown code blocks if present
        let cleanText = jsonText.trim();
        cleanText = cleanText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

        let matchesRaw;
        try {
            matchesRaw = JSON.parse(cleanText);
        } catch (e) {
            console.warn("JSON Parse Failed. Text might be truncated or invalid.", e);
            throw new Error("Failed to parse AI response. Data may be truncated.");
        }

        // Handle if AI wraps it in an object despite schema
        if (!Array.isArray(matchesRaw) && matchesRaw.matches) {
            matchesRaw = matchesRaw.matches;
        }

        const assetsMap = await getTeamAssetsMap();

        const parsedMatches = matchesRaw.map((p: any, index: number) => {
            let conf = Number(p.confidence);
            if (conf <= 1 && conf > 0) conf = Math.round(conf * 100);
            if (isNaN(conf)) conf = 50;

            const homeKey = (p.homeTeam || "").toLowerCase().trim();
            const awayKey = (p.awayTeam || "").toLowerCase().trim();

            // Image Logic: Prefer DB asset, then AI result
            let hLogo = assetsMap[homeKey];
            let aLogo = assetsMap[awayKey];

            // If DB missed it but AI found a valid URL, use it AND save it for future
            if (!hLogo && p.homeTeamLogo && p.homeTeamLogo.startsWith("http")) {
                hLogo = p.homeTeamLogo;
                saveTeamAsset(p.homeTeam, p.homeTeamLogo).catch(e => console.warn("Asset Save Fail (Home)", e));
            }

            if (!aLogo && p.awayTeamLogo && p.awayTeamLogo.startsWith("http")) {
                aLogo = p.awayTeamLogo;
                saveTeamAsset(p.awayTeam, p.awayTeamLogo).catch(e => console.warn("Asset Save Fail (Away)", e));
            }

            return {
                id: p.id || `gm-${index}-${Date.now()}`,
                league: p.league || "Simulated League",
                homeTeam: p.homeTeam || "Team A",
                awayTeam: p.awayTeam || "Team B",
                time: p.time || "20:00",
                prediction: p.prediction_en || "N/A",
                prediction_en: p.prediction_en || "N/A",
                prediction_fr: p.prediction_fr || p.prediction_en || "N/A",
                confidence: conf,
                odds: Number(p.odds) || 1.50,
                category: (['safe', 'value', 'risky'].includes(p.category) ? p.category : 'value') as any,
                analysis: p.analysis_en || "Market Analysis Pending",
                analysis_en: p.analysis_en || "Market Analysis Pending",
                analysis_fr: p.analysis_fr || "Analyse de marché en attente",
                homeTeamLogo: hLogo || "",
                awayTeamLogo: aLogo || "",
                status: 'pending' as const
            };
        });

        // ── Gate 1: Confidence floor ≥ 70 ────────────────────────────────────
        // ── Gate 2: EV floor ≥ +4% (parse from analysis string) ─────────────
        const gated = parsedMatches.filter(m => {
            if (m.confidence < 70) return false;
            // Try to parse EV from analysis string e.g. "EV: +5.2%"
            const evMatch = (m.analysis_en || '').match(/EV:\s*([+-]?\d+\.?\d*)/i);
            if (evMatch) {
                const ev = parseFloat(evMatch[1]);
                if (!isNaN(ev) && ev < 4) return false; // discard low/negative EV
            }
            return true;
        });

        // Sort: safe → value → risky, then by confidence descending
        return gated.sort((a, b) => {
            const categoryRank: Record<string, number> = { safe: 0, value: 1, risky: 2 };
            const catDiff = (categoryRank[a.category] ?? 1) - (categoryRank[b.category] ?? 1);
            if (catDiff !== 0) return catDiff;
            return b.confidence - a.confidence;
        });
    } catch (e) {
        console.error("Enhance Matches Error:", e);
        throw e; // Re-throw to trigger fallback
    }
}

/**
 * OFFLINE / FALLBACK GENERATOR — Day-indexed rotating pool of 50 matches.
 * Rotates every day so users never see the same stale set twice in a row.
 */
async function generateLocalFallbackMatches(): Promise<Match[]> {
    console.log("[Gemini] Generating Local Fallback Data (Rotating Pool, Offline Mode)");

    // 50-match pool — Ordered by actual African betting volume (EPL first)
    const FALLBACK_POOL = [
        // ── TIER 1: Premier League + Champions League (~40% of pool = 20 matches) ──
        { league: "Premier League", homeTeam: "Manchester City", awayTeam: "Arsenal", time: "17:30", prediction_en: "Both Teams Score", prediction_fr: "Les deux équipes marquent", confidence: 82, odds: 1.65, category: "safe", analysis_en: "EV: +7.2% | Edge: 9% | Both sides average 1.8+ goals scored per game.", analysis_fr: "EV: +7.2% | Edge: 9% | Les deux équipes marquent en moyenne 1.8+ buts." },
        { league: "Premier League", homeTeam: "Liverpool", awayTeam: "Chelsea", time: "17:30", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 78, odds: 1.33, category: "safe", analysis_en: "EV: +5.8% | Edge: 7% | Anfield fortress holds strong.", analysis_fr: "EV: +5.8% | Edge: 7% | La forteresse d'Anfield tient bon." },
        { league: "Premier League", homeTeam: "Tottenham", awayTeam: "Newcastle", time: "15:00", prediction_en: "Over 2.5 Goals", prediction_fr: "Plus de 2.5 Buts", confidence: 80, odds: 1.70, category: "safe", analysis_en: "EV: +6.8% | Edge: 9% | Both teams average 2.8 combined goals.", analysis_fr: "EV: +6.8% | Edge: 9% | Les deux équipes marquent 2.8 buts ensemble." },
        { league: "Premier League", homeTeam: "Aston Villa", awayTeam: "West Ham", time: "14:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 78, odds: 1.75, category: "safe", analysis_en: "EV: +7.3% | Edge: 9% | Villa strong at home, West Ham struggling away.", analysis_fr: "EV: +7.3% | Edge: 9% | Villa solide à domicile." },
        { league: "Premier League", homeTeam: "Brighton", awayTeam: "Brentford", time: "15:00", prediction_en: "Over 1.5 Goals", prediction_fr: "Plus de 1.5 Buts", confidence: 87, odds: 1.22, category: "safe", analysis_en: "EV: +5.3% | Edge: 7% | Both teams high xG per 90 this season.", analysis_fr: "EV: +5.3% | Edge: 7% | Les deux équipes à haut xG cette saison." },
        { league: "Premier League", homeTeam: "Manchester United", awayTeam: "Everton", time: "20:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 76, odds: 1.80, category: "safe", analysis_en: "EV: +7.0% | Edge: 9% | United strong home form, Everton winless in 5 away.", analysis_fr: "EV: +7.0% | Edge: 9% | United fort à domicile, Everton sans victoire." },
        { league: "Premier League", homeTeam: "Crystal Palace", awayTeam: "Wolves", time: "15:00", prediction_en: "Under 2.5 Goals", prediction_fr: "Moins de 2.5 Buts", confidence: 75, odds: 1.70, category: "safe", analysis_en: "EV: +6.5% | Edge: 8% | Both teams low-scoring, avg 1.8 combined.", analysis_fr: "EV: +6.5% | Edge: 8% | Les deux équipes peu offensives." },
        { league: "Premier League", homeTeam: "Fulham", awayTeam: "Bournemouth", time: "15:00", prediction_en: "Both Teams Score", prediction_fr: "Les deux équipes marquent", confidence: 80, odds: 1.55, category: "safe", analysis_en: "EV: +6.2% | Edge: 8% | Open attacking game, BTTS landed in 7/10 H2H.", analysis_fr: "EV: +6.2% | Edge: 8% | Match ouvert, BTTS dans 7/10 H2H." },
        { league: "Champions League", homeTeam: "Real Madrid", awayTeam: "Man City", time: "21:00", prediction_en: "Both Teams Score", prediction_fr: "Les deux équipes marquent", confidence: 84, odds: 1.50, category: "safe", analysis_en: "EV: +7.1% | Edge: 9% | BTTS in last 6 meetings between these sides.", analysis_fr: "EV: +7.1% | Edge: 9% | BTTS dans 6 dernières confrontations." },
        { league: "Champions League", homeTeam: "Bayern Munich", awayTeam: "Arsenal", time: "21:00", prediction_en: "Over 2.5 Goals", prediction_fr: "Plus de 2.5 Buts", confidence: 79, odds: 1.65, category: "safe", analysis_en: "EV: +6.8% | Edge: 9% | High-scoring UCL ties, both attack-minded.", analysis_fr: "EV: +6.8% | Edge: 9% | Matchs à buts en LDC, styles offensifs." },
        { league: "Champions League", homeTeam: "Inter Milan", awayTeam: "Benfica", time: "20:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 76, odds: 1.35, category: "safe", analysis_en: "EV: +5.5% | Edge: 7% | Inter strong at home in UCL.", analysis_fr: "EV: +5.5% | Edge: 7% | Inter fort à domicile en LDC." },
        { league: "Champions League", homeTeam: "PSG", awayTeam: "Dortmund", time: "21:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 77, odds: 1.30, category: "safe", analysis_en: "EV: +5.2% | Edge: 7% | Parc des Princes historically difficult for German visitors.", analysis_fr: "EV: +5.2% | Edge: 7% | Le Parc est historiquement difficile pour les visiteurs allemands." },
        // ── TIER 2: La Liga, Serie A, Bundesliga, Europa League (~25% = 12 matches) ──
        { league: "La Liga", homeTeam: "Real Madrid", awayTeam: "Sevilla", time: "21:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 86, odds: 1.55, category: "safe", analysis_en: "EV: +8.2% | Edge: 11% | Market volume aligns with historical win prob.", analysis_fr: "EV: +8.2% | Edge: 11% | Volume de marché aligné sur probabilité historique." },
        { league: "La Liga", homeTeam: "Barcelona", awayTeam: "Atl. Madrid", time: "21:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 76, odds: 1.30, category: "safe", analysis_en: "EV: +5.1% | Edge: 6% | Safer vs Simeone's low-block defense.", analysis_fr: "EV: +5.1% | Edge: 6% | Plus sûr contre la défense de Simeone." },
        { league: "La Liga", homeTeam: "Villarreal", awayTeam: "Getafe", time: "14:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 78, odds: 1.75, category: "safe", analysis_en: "EV: +7.2% | Edge: 9% | Villarreal dominant vs bottom-half opponents.", analysis_fr: "EV: +7.2% | Edge: 9% | Villarreal dominant vs bas de tableau." },
        { league: "Serie A", homeTeam: "Inter Milan", awayTeam: "Roma", time: "20:45", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 81, odds: 1.65, category: "safe", analysis_en: "EV: +7.8% | Edge: 10% | Inter dominant at San Siro, Roma poor away xGA.", analysis_fr: "EV: +7.8% | Edge: 10% | Inter dominant à San Siro." },
        { league: "Serie A", homeTeam: "Napoli", awayTeam: "Lazio", time: "20:45", prediction_en: "Both Teams Score", prediction_fr: "Les deux équipes marquent", confidence: 78, odds: 1.60, category: "safe", analysis_en: "EV: +6.5% | Edge: 8% | BTTS in 4 of last 5 H2H meetings.", analysis_fr: "EV: +6.5% | Edge: 8% | BTTS dans 4 des 5 derniers H2H." },
        { league: "Serie A", homeTeam: "Juventus", awayTeam: "AC Milan", time: "19:45", prediction_en: "Under 2.5 Goals", prediction_fr: "Moins de 2.5 Buts", confidence: 76, odds: 1.75, category: "safe", analysis_en: "EV: +6.8% | Edge: 9% | Defensive matchup, avg 1.6 goals in last 6 H2H.", analysis_fr: "EV: +6.8% | Edge: 9% | Match défensif, 1.6 buts en moyenne." },
        { league: "Serie A", homeTeam: "Milan", awayTeam: "Empoli", time: "20:45", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 82, odds: 1.50, category: "safe", analysis_en: "EV: +7.8% | Edge: 10% | Milan dominant, Empoli winless away.", analysis_fr: "EV: +7.8% | Edge: 10% | Milan dominant vs bas de tableau." },
        { league: "Bundesliga", homeTeam: "Bayern Munich", awayTeam: "RB Leipzig", time: "18:30", prediction_en: "Over 2.5 Goals", prediction_fr: "Plus de 2.5 Buts", confidence: 85, odds: 1.55, category: "safe", analysis_en: "EV: +7.5% | Edge: 10% | 3+ goals in 8 of last 10 meetings.", analysis_fr: "EV: +7.5% | Edge: 10% | 3+ buts dans 8 des 10 derniers matchs." },
        { league: "Bundesliga", homeTeam: "Dortmund", awayTeam: "Leverkusen", time: "15:30", prediction_en: "Both Teams Score", prediction_fr: "Les deux équipes marquent", confidence: 83, odds: 1.55, category: "safe", analysis_en: "EV: +6.8% | Edge: 8% | BTTS landed in 9 of last 10 H2H.", analysis_fr: "EV: +6.8% | Edge: 8% | BTTS dans 9 des 10 derniers H2H." },
        { league: "Bundesliga", homeTeam: "Bayer Leverkusen", awayTeam: "Mainz", time: "18:30", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 84, odds: 1.38, category: "safe", analysis_en: "EV: +7.2% | Edge: 9% | Leverkusen unbeaten, Mainz poor away record.", analysis_fr: "EV: +7.2% | Edge: 9% | Leverkusen invaincu." },
        { league: "Europa League", homeTeam: "Atalanta", awayTeam: "Apollon", time: "18:45", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 86, odds: 1.40, category: "safe", analysis_en: "EV: +8.5% | Edge: 11% | Heavy European home advantage.", analysis_fr: "EV: +8.5% | Edge: 11% | Fort avantage à domicile pour Atalanta." },
        { league: "Europa League", homeTeam: "AS Roma", awayTeam: "Brighton", time: "18:45", prediction_en: "Over 1.5 Goals", prediction_fr: "Plus de 1.5 Buts", confidence: 80, odds: 1.28, category: "safe", analysis_en: "EV: +6.5% | Edge: 8% | Attacking styles guarantee chances.", analysis_fr: "EV: +6.5% | Edge: 8% | Styles offensifs garantissent des occasions." },
        // ── TIER 3: Ligue 1, Primeira Liga (~15% = 7 matches) ──
        { league: "Ligue 1", homeTeam: "PSG", awayTeam: "Monaco", time: "21:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 79, odds: 1.60, category: "safe", analysis_en: "EV: +7.0% | Edge: 10% | PSG squad depth superior.", analysis_fr: "EV: +7.0% | Edge: 10% | Profondeur du PSG supérieure." },
        { league: "Ligue 1", homeTeam: "Marseille", awayTeam: "Nice", time: "21:00", prediction_en: "Under 2.5 Goals", prediction_fr: "Moins de 2.5 Buts", confidence: 74, odds: 1.70, category: "value", analysis_en: "EV: +5.8% | Edge: 7% | Tactical derby, both teams defensively sound.", analysis_fr: "EV: +5.8% | Edge: 7% | Derby tactique, défensif." },
        { league: "Ligue 1", homeTeam: "Lyon", awayTeam: "Lens", time: "20:00", prediction_en: "Both Teams Score", prediction_fr: "Les deux équipes marquent", confidence: 77, odds: 1.60, category: "safe", analysis_en: "EV: +6.2% | Edge: 8% | Both teams offensive, BTTS in 4/5 recent.", analysis_fr: "EV: +6.2% | Edge: 8% | Les deux offensifs, BTTS dans 4/5 récents." },
        { league: "Ligue 1", homeTeam: "Brest", awayTeam: "Rennes", time: "17:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 72, odds: 1.50, category: "value", analysis_en: "EV: +4.7% | Edge: 6% | Brest strong at home.", analysis_fr: "EV: +4.7% | Edge: 6% | Brest fort à domicile." },
        { league: "Primeira Liga", homeTeam: "Porto", awayTeam: "Sporting CP", time: "21:15", prediction_en: "Both Teams Score", prediction_fr: "Les deux équipes marquent", confidence: 82, odds: 1.55, category: "safe", analysis_en: "EV: +6.9% | Edge: 9% | BTTS in 7 of last 10 H2H meetings.", analysis_fr: "EV: +6.9% | Edge: 9% | BTTS dans 7 des 10 derniers H2H." },
        { league: "Primeira Liga", homeTeam: "Benfica", awayTeam: "Braga", time: "20:30", prediction_en: "Over 2.5 Goals", prediction_fr: "Plus de 2.5 Buts", confidence: 80, odds: 1.60, category: "safe", analysis_en: "EV: +6.8% | Edge: 9% | High-scoring fixture historically.", analysis_fr: "EV: +6.8% | Edge: 9% | Rencontre historiquement prolifique." },
        { league: "Ligue 1", homeTeam: "Lille", awayTeam: "Strasbourg", time: "19:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 76, odds: 1.70, category: "safe", analysis_en: "EV: +6.5% | Edge: 8% | Lille dominant at home this season.", analysis_fr: "EV: +6.5% | Edge: 8% | Lille dominant à domicile." },
        // ── TIER 4: Eredivisie, Championship, MLS (~10% = 5 matches) ──
        { league: "Eredivisie", homeTeam: "Ajax", awayTeam: "Feyenoord", time: "14:30", prediction_en: "Over 2.5 Goals", prediction_fr: "Plus de 2.5 Buts", confidence: 78, odds: 1.65, category: "safe", analysis_en: "EV: +6.5% | Edge: 8% | De Klassieker always has goals.", analysis_fr: "EV: +6.5% | Edge: 8% | De Klassieker toujours prolifique." },
        { league: "Championship", homeTeam: "Leeds United", awayTeam: "Leicester", time: "20:45", prediction_en: "Draw No Bet (Home)", prediction_fr: "Remboursé si Nul (Domicile)", confidence: 73, odds: 1.70, category: "value", analysis_en: "EV: +4.8% | Edge: 6% | Home advantage crucial.", analysis_fr: "EV: +4.8% | Edge: 6% | Avantage domicile crucial." },
        { league: "Scottish Premiership", homeTeam: "Celtic", awayTeam: "Rangers", time: "12:30", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 76, odds: 1.55, category: "safe", analysis_en: "EV: +5.7% | Edge: 7% | Celtic dominant at home in Old Firm.", analysis_fr: "EV: +5.7% | Edge: 7% | Celtic dominant à domicile." },
        { league: "MLS", homeTeam: "Inter Miami", awayTeam: "LA Galaxy", time: "01:30", prediction_en: "Both Teams Score", prediction_fr: "Les deux équipes marquent", confidence: 78, odds: 1.55, category: "safe", analysis_en: "EV: +6.0% | Edge: 8% | Attacking game guaranteed with Messi.", analysis_fr: "EV: +6.0% | Edge: 8% | Match offensif garanti avec Messi." },
        { league: "Eredivisie", homeTeam: "PSV", awayTeam: "AZ Alkmaar", time: "16:45", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 80, odds: 1.55, category: "safe", analysis_en: "EV: +7.0% | Edge: 9% | PSV dominant at Philips Stadion.", analysis_fr: "EV: +7.0% | Edge: 9% | PSV dominant au Philips Stadion." },
        // ── TIER 5-6: African leagues (~10% = 5 matches — only big derbies) ──
        { league: "CAF Champions League", homeTeam: "Al Ahly", awayTeam: "Wydad", time: "20:00", prediction_en: "Draw No Bet (Home)", prediction_fr: "Remboursé si Nul (Domicile)", confidence: 75, odds: 1.70, category: "safe", analysis_en: "EV: +7.0% | Edge: 9% | Al Ahly 8-time CL champions.", analysis_fr: "EV: +7.0% | Edge: 9% | Al Ahly 8x champion." },
        { league: "NPFL", homeTeam: "Enyimba", awayTeam: "Remo Stars", time: "16:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 76, odds: 1.85, category: "safe", analysis_en: "EV: +7.5% | Edge: 9% | Enyimba unbeaten in last 6 home games.", analysis_fr: "EV: +7.5% | Edge: 9% | Enyimba invaincu à domicile sur 6 matchs." },
        { league: "South Africa PSL", homeTeam: "Mamelodi Sundowns", awayTeam: "Orlando Pirates", time: "17:30", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 80, odds: 1.45, category: "safe", analysis_en: "EV: +6.8% | Edge: 9% | Sundowns home fortress record.", analysis_fr: "EV: +6.8% | Edge: 9% | Sundowns forteresse à domicile." },
        { league: "Ghana Premier League", homeTeam: "Hearts of Oak", awayTeam: "Asante Kotoko", time: "15:00", prediction_en: "Both Teams Score", prediction_fr: "Les deux équipes marquent", confidence: 74, odds: 1.70, category: "value", analysis_en: "EV: +5.8% | Edge: 7% | Derby — goals expected, form secondary.", analysis_fr: "EV: +5.8% | Edge: 7% | Derby — buts attendus." },
        { league: "Cameroon Elite One", homeTeam: "Coton Sport", awayTeam: "Canon Yaounde", time: "16:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 72, odds: 1.50, category: "value", analysis_en: "EV: +5.4% | Edge: 7% | Home advantage decisive.", analysis_fr: "EV: +5.4% | Edge: 7% | Avantage domicile décisif." },
    ];

    // Use day-of-week to rotate the starting index (7 days × 8 matches = 56 slots, wraps around pool)
    const dayIndex = new Date().getDay(); // 0 (Sun) to 6 (Sat)
    const START = (dayIndex * 8) % FALLBACK_POOL.length;
    const selected = [
        ...FALLBACK_POOL.slice(START, START + 8),
        ...FALLBACK_POOL.slice(0, Math.max(0, (START + 8) - FALLBACK_POOL.length))
    ].slice(0, 8);

    return parseAndEnhanceMatches(JSON.stringify(selected));
}



// ─── BASKETBALL PREDICTIONS ────────────────────────────────────────────────

/**
 * Generates basketball predictions (NBA / EuroLeague) using Gemini + Google Search Grounding.
 */
export const generateBasketballPredictions = async (signal?: AbortSignal): Promise<Match[]> => {
    const todayKey = getGlobalTodayKey();

    const prompt = `
You are a professional basketball analyst. Today is ${todayKey}.

Using Google Search, find 6–10 real basketball games scheduled for today from NBA, EuroLeague, or other top leagues.

For each game, provide your analysis. Return ONLY a valid JSON array (no markdown):
[
  {
    "league": "NBA",
    "homeTeam": "Lakers",
    "awayTeam": "Celtics",
    "time": "02:00",
    "prediction_en": "Home Win -5.5",
    "prediction_fr": "Victoire Domicile -5.5",
    "confidence": 78,
    "odds": 1.90,
    "category": "value",
    "analysis_en": "Lakers have won 8 of last 10 games at home vs Celtics.",
    "analysis_fr": "Les Lakers ont gagné 8 des 10 derniers matchs à domicile."
  }
]

Rules:
- Use real game times in HH:MM (24hr)
- confidence: 60–92
- odds: 1.40–3.20
- category: "safe" (conf 80+), "value" (conf 65–79), "risky" (conf <65)
- prediction markets: Home Win, Away Win, Total Over/Under, Handicap, Both Teams Score 80+
- Only include games that have real data to support the prediction
`;

    try {
        const response = await withRetry<any>(() => backendGenerateContent(
            currentModel,
            prompt,
            {
                temperature: 0.3,
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json",
                responseSchema: matchesSchema
            }
        ));

        if (signal?.aborted) return [];

        const text = response.text || '';
        // With schema enforcement the response IS the JSON array directly
        let raw: any[];
        try {
            raw = JSON.parse(text);
            if (!Array.isArray(raw)) throw new Error('Not an array');
        } catch {
            // Fallback: try regex extract for safety
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error('No JSON array in basketball response');
            raw = JSON.parse(jsonMatch[0]);
        }
        const matches: Match[] = raw.map((m: any) => ({
            id: `bball_${(m.homeTeam + m.awayTeam).toLowerCase().replace(/\s/g, '')}_${todayKey}`,
            league: m.league || 'Basketball',
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            time: m.time || '00:00',
            prediction: m.prediction_en || m.prediction_fr || 'Home Win',
            prediction_en: m.prediction_en,
            prediction_fr: m.prediction_fr,
            confidence: Math.min(95, Math.max(55, Number(m.confidence) || 70)),
            odds: Math.max(1.1, Number(m.odds) || 1.80),
            category: m.category || 'value',
            analysis: m.analysis_en,
            analysis_en: m.analysis_en,
            analysis_fr: m.analysis_fr,
            sport: 'basketball',
            status: 'pending',
        }));

        return matches;
    } catch (e: any) {
        console.error('[Gemini Basketball] Generation failed:', e.message);
        // Return a minimal set of fallback basketball predictions
        return [
            {
                id: `bball_lakers_celtics_${todayKey}`,
                league: 'NBA', homeTeam: 'Lakers', awayTeam: 'Celtics', time: '02:00',
                prediction: 'Over 218.5 Total Points', prediction_en: 'Over 218.5 Total Points',
                prediction_fr: 'Plus de 218.5 Points Total',
                confidence: 71, odds: 1.88, category: 'value',
                analysis_en: 'High-scoring matchup expected.', analysis_fr: 'Match à score élevé prévu.',
                sport: 'basketball', status: 'pending',
            },
            {
                id: `bball_gsw_mia_${todayKey}`,
                league: 'NBA', homeTeam: 'Golden State', awayTeam: 'Miami Heat', time: '04:30',
                prediction: 'Home Win', prediction_en: 'Home Win', prediction_fr: 'Victoire Domicile',
                confidence: 75, odds: 1.75, category: 'value',
                analysis_en: 'Warriors strong at home.', analysis_fr: 'Warriors solides à domicile.',
                sport: 'basketball', status: 'pending',
            },
        ];
    }
};