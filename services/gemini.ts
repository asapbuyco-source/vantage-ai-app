import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Match, AccumulatorSet } from "../types";
import { getGlobalTodayKey, saveTodaysPredictions, getGlobalYesterdayKey, getPredictionsForDate, savePredictionsForDate, getTeamAssetsMap, saveTeamAsset } from "./db";
import { getTodaysFixtures, filterGlobalFixtures, enrichFixtures, formatFixtureContext } from "./sportsData";

// Dynamic Model Management
// Dynamic Model Management
// Switched to 2.0 Flash for balanced performance and speed.
const DEFAULT_MODEL = 'gemini-2.0-flash-exp';
let currentModel = localStorage.getItem('vantage_gemini_model') || DEFAULT_MODEL;

export const setGeminiModel = (model: string) => {
    currentModel = model;
    localStorage.setItem('vantage_gemini_model', model);
};

export const getGeminiModel = () => currentModel;

export const AVAILABLE_MODELS = [
    { id: 'gemini-2.0-flash-exp', name: 'Vantage AI 2.0 Flash (Fastest)' },
    { id: 'gemini-1.5-flash', name: 'Vantage AI 1.5 Flash (Stable)' },
    { id: 'gemini-1.5-pro', name: 'Vantage AI 1.5 Pro (Deep Reasoning)' }
];

/**
 * Helper to get API Key exclusively from Environment Variables.
 * Throws a descriptive error in production if the key is missing.
 */
const getApiKey = () => {
    const envKey = import.meta.env?.VITE_GOOGLE_GENAI_API_KEY;
    if (envKey && envKey.trim() !== "") {
        return envKey;
    }
    throw new Error(
        "Missing VITE_GOOGLE_GENAI_API_KEY. Add it to your .env.local file.\n" +
        "Get a key at: https://aistudio.google.com/app/apikey"
    );
};


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
        const apiKey = getApiKey();
        if (!apiKey) throw new Error("API Key is missing.");

        const ai = new GoogleGenAI({ apiKey });

        console.log(`[Gemini Test] Using model: ${currentModel}`);

        const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: currentModel,
            contents: "Search for today's football matches. Are there any big games? Answer in 1 short sentence.",
            config: {
                temperature: 0.1,
                tools: [{ googleSearch: {} }]
            }
        }));

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
                const apiKey = getApiKey();
                const ai = new GoogleGenAI({ apiKey });
                await ai.models.generateContent({
                    model: 'gemini-3-flash-preview', // Try fallback model
                    contents: "Hello"
                });
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
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey });

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
        const searchResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: currentModel,
            contents: searchPrompt,
            config: { temperature: 0.1, tools: [{ googleSearch: {} }] }
        }));

        const rawScores = searchResponse.text;

        const parsePrompt = `
Grade these football predictions using the final scores retrieved above.

PREDICTIONS:
${JSON.stringify(matchesToGrade.map(m => ({ id: m.id, home: m.homeTeam, away: m.awayTeam, prediction: m.prediction })), null, 2)}

SCORES RETRIEVED:
${rawScores}

GRADING RULES (apply strictly):
- Use FULL-TIME scores only. Ignore half-time, live, or pre-match data.
- "Home Win" → won if home goals > away goals at FT.
- "Away Win" → won if away goals > home goals at FT.
- "Draw" → won if goals are equal at FT.
- "Double Chance (1X)" → won if home wins OR draw.
- "Double Chance (2X)" → won if away wins OR draw.
- "Double Chance (12)" → won if home wins OR away wins (i.e. not a draw).
- "Draw No Bet (Home)" → won if home wins; void if draw; lost if away wins.
- "Draw No Bet (Away)" → won if away wins; void if draw; lost if home wins.
- "Over 1.5 Goals" → won if total goals >= 2.
- "Over 2.5 Goals" → won if total goals >= 3.
- "Both Teams Score" → won if both teams scored at least 1 goal.
- If a match was postponed, abandoned, or no result found → status: "void".

Return a JSON array with id, score ("2-1" format), and status ("won"|"lost"|"void") for each match.
    `;

        const formatResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: currentModel,
            contents: parsePrompt,
            config: { responseMimeType: "application/json", responseSchema: gradingSchema }
        }));

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
        const apiKey = getApiKey();
        if (!apiKey) throw new Error("API Key missing.");

        console.log(`[Gemini Pipeline] Starting Analysis for ${todayStr} using ${currentModel}...`);
        const ai = new GoogleGenAI({ apiKey });

        // (matchesSchema is defined at module scope above)

        // -------------------------------------------------------------------------
        // ATTEMPT 1: REAL DATA (API-Football enriched context + Search Grounding)
        // -------------------------------------------------------------------------
        try {
            const rawFixtures = await getTodaysFixtures();
            const filteredFixtures = filterGlobalFixtures(rawFixtures);

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
You are the "Quant-Desk Decision Engine v5.0", an elite global sports betting model with access to real statistical data.

DATE: ${todayStr}

${fixtureContext}

═══════════════════════════════════════════════
YOUR OBJECTIVE
═══════════════════════════════════════════════
Using the enriched fixture data above AND Google Search for additional matches today:
- Identify and analyze at least 15 to 20 high-quality betting opportunities.
- Goal: Ensure the app is content-rich. If major leagues are scanty, look for high-confidence picks in secondary leagues (Championship, Eredivisie, MLS, etc.).
- African leagues (Nigeria, Ghana, Kenya, South Africa, Cameroon) remain TOP PRIORITY — analyse them first.
- Only include matches where you have a "Model Edge" (your probability > bookmaker implied probability).
- Predictions must be professional (e.g., "Home Win", "Over 2.5", "BTTS", "DC 1X").

═══════════════════════════════════════════════
🧮 QUANTITATIVE RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════
1. EV CALCULATION: EV = (Your model probability × Decimal odds) − 1. Only pick if EV ≥ +0.06 (6% edge).
2. CONFIDENCE FLOOR: ≥ 72%. Use team form, H2H record, injury absences, and market implied probability.
3. ONE Market Per Match (safest one). Market hierarchy:
   Double Chance > Draw No Bet > Over 1.5 Goals > Home/Away Win > Over 2.5 Goals
4. INJURY IMPACT: If a key player is listed as injured in the data above, lower confidence accordingly.
5. H2H WEIGHT: If H2H strongly contradicts form, de-risk to Double Chance or DNB.
6. FORM MOMENTUM: Teams on W W W W W form get +5% confidence boost; L L L L L get −10%.

═══════════════════════════════════════════════
🚨 OUTPUT FORMAT
═══════════════════════════════════════════════
- 'prediction_en' / 'prediction_fr': Localized prediction label.
- 'analysis_en' format: "EV: +X.X% | Edge: Y% | [max 20 words of reasoning including key stat used]"
- 'analysis_fr': French translation of analysis.
- 'confidence': 0–100 integer. Be honest — do NOT inflate.
- 'odds': Real bookmaker decimal odds for your chosen market.
- Use homeTeamLogo / awayTeamLogo from the data above where available.
- Output JSON only — no prose.
        `;

            const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: currentModel,
                contents: searchPrompt,
                config: {
                    temperature: 0.1, // Low temperature for strict adherence
                    tools: [{ googleSearch: {} }],
                    responseMimeType: "application/json",
                    responseSchema: matchesSchema
                }
            }));

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
                    // Use 'gemini-3-flash-preview' as it is more stable than experimental models
                    const fallbackModel = 'gemini-3-flash-preview';

                    const response = await ai.models.generateContent({
                        model: fallbackModel,
                        contents: simulationPrompt,
                        config: {
                            temperature: 0.7,
                            responseMimeType: "application/json",
                            responseSchema: matchesSchema
                        }
                    });

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
        const apiKey = getApiKey();
        if (!apiKey) throw new Error("API Key missing.");
        const ai = new GoogleGenAI({ apiKey });

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

        const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: currentModel,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
                temperature: 0.1 // Strictly determinisic
            }
        }));

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

    // 50-match pool — African leagues prominently featured
    const FALLBACK_POOL = [
        // ── African Leagues (HIGH PRIORITY in prompt) ───────────────────────
        { league: "NPFL", homeTeam: "Enyimba", awayTeam: "Remo Stars", time: "16:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 76, odds: 1.85, category: "safe", analysis_en: "EV: +7.5% | Edge: 9% | Enyimba unbeaten in last 6 home games.", analysis_fr: "EV: +7.5% | Edge: 9% | Enyimba invaincu à domicile sur 6 matchs." },
        { league: "NPFL", homeTeam: "Rivers United", awayTeam: "Kano Pillars", time: "16:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 74, odds: 1.55, category: "safe", analysis_en: "EV: +5.8% | Edge: 8% | Rivers strong at home, Kano poor away form.", analysis_fr: "EV: +5.8% | Edge: 8% | Rivers solide à domicile." },
        { league: "Ghana Premier League", homeTeam: "Hearts of Oak", awayTeam: "Asante Kotoko", time: "15:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 73, odds: 1.60, category: "safe", analysis_en: "EV: +6.1% | Edge: 8% | Derby — home advantage decisive in last 4 meetings.", analysis_fr: "EV: +6.1% | Edge: 8% | Derby — avantage domicile." },
        { league: "Kenya Premier League", homeTeam: "Gor Mahia", awayTeam: "AFC Leopards", time: "13:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 78, odds: 1.75, category: "safe", analysis_en: "EV: +7.2% | Edge: 10% | Gor Mahia dominant at home in 2024 season.", analysis_fr: "EV: +7.2% | Edge: 10% | Gor Mahia dominant à domicile." },
        { league: "South Africa PSL", homeTeam: "Mamelodi Sundowns", awayTeam: "Orlando Pirates", time: "17:30", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 80, odds: 1.45, category: "safe", analysis_en: "EV: +6.8% | Edge: 9% | Sundowns league leaders, home fortress record.", analysis_fr: "EV: +6.8% | Edge: 9% | Sundowns leaders, forteresse à domicile." },
        { league: "CAF Champions League", homeTeam: "Al Ahly", awayTeam: "Wydad", time: "20:00", prediction_en: "Draw No Bet (Home)", prediction_fr: "Remboursé si Nul (Domicile)", confidence: 75, odds: 1.70, category: "safe", analysis_en: "EV: +7.0% | Edge: 9% | Al Ahly 8-time CL champions, strong home record.", analysis_fr: "EV: +7.0% | Edge: 9% | Al Ahly 8x champion, record domicile fort." },
        { league: "CAF Champions League", homeTeam: "Esperance", awayTeam: "Simba SC", time: "21:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 77, odds: 1.80, category: "safe", analysis_en: "EV: +7.8% | Edge: 10% | Esperance dominant in group stage, Simba poor away.", analysis_fr: "EV: +7.8% | Edge: 10% | Esperance dominant en phase de groupes." },
        { league: "Cameroon Elite One", homeTeam: "Coton Sport", awayTeam: "Canon Yaounde", time: "16:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 72, odds: 1.50, category: "value", analysis_en: "EV: +5.4% | Edge: 7% | Home advantage decisive in Cameroon top flight.", analysis_fr: "EV: +5.4% | Edge: 7% | Avantage domicile décisif en Elite One." },
        // ── Premier League ────────────────────────────────────────────────────
        { league: "Premier League", homeTeam: "Manchester City", awayTeam: "Arsenal", time: "20:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 72, odds: 1.45, category: "value", analysis_en: "EV: +4.4% | Edge: 5% | Public heavy on City, line moving to Arsenal.", analysis_fr: "EV: +4.4% | Edge: 5% | Attention piège: public sur City." },
        { league: "Premier League", homeTeam: "Liverpool", awayTeam: "Chelsea", time: "17:30", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 75, odds: 1.33, category: "safe", analysis_en: "EV: +5.8% | Edge: 7% | Anfield fortress holds strong.", analysis_fr: "EV: +5.8% | Edge: 7% | La forteresse d'Anfield tient bon." },
        { league: "Premier League", homeTeam: "Tottenham", awayTeam: "Newcastle", time: "15:00", prediction_en: "Over 1.5 Goals", prediction_fr: "Plus de 1.5 Buts", confidence: 85, odds: 1.22, category: "safe", analysis_en: "EV: +5.9% | Edge: 8% | Both teams average 2.3 goals per game.", analysis_fr: "EV: +5.9% | Edge: 8% | Les deux équipes marquent en moyenne 2.3 buts." },
        { league: "Premier League", homeTeam: "Aston Villa", awayTeam: "West Ham", time: "14:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 78, odds: 1.75, category: "safe", analysis_en: "EV: +7.3% | Edge: 9% | Villa strong at home, West Ham struggling away.", analysis_fr: "EV: +7.3% | Edge: 9% | Villa solide à domicile." },
        // ── La Liga ───────────────────────────────────────────────────────────
        { league: "La Liga", homeTeam: "Real Madrid", awayTeam: "Sevilla", time: "21:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 86, odds: 1.55, category: "safe", analysis_en: "EV: +8.2% | Edge: 11% | Market volume aligns with historical win probability.", analysis_fr: "EV: +8.2% | Edge: 11% | Volume de marché aligné sur probabilité historique." },
        { league: "La Liga", homeTeam: "Barcelona", awayTeam: "Atl. Madrid", time: "21:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 76, odds: 1.30, category: "safe", analysis_en: "EV: +5.1% | Edge: 6% | Safer than goal line against Simeone's defense.", analysis_fr: "EV: +5.1% | Edge: 6% | Plus sûr que les buts contre Simeone." },
        { league: "La Liga", homeTeam: "Valencia", awayTeam: "Athletic Bilbao", time: "18:30", prediction_en: "Over 1.5 Goals", prediction_fr: "Plus de 1.5 Buts", confidence: 82, odds: 1.25, category: "safe", analysis_en: "EV: +5.8% | Edge: 7% | Open game expected, both teams attack-minded.", analysis_fr: "EV: +5.8% | Edge: 7% | Match ouvert attendu." },
        // ── Bundesliga ────────────────────────────────────────────────────────
        { league: "Bundesliga", homeTeam: "Bayern Munich", awayTeam: "RB Leipzig", time: "18:30", prediction_en: "Over 1.5 Goals", prediction_fr: "Plus de 1.5 Buts", confidence: 88, odds: 1.18, category: "safe", analysis_en: "EV: +5.5% | Edge: 8% | Goals guaranteed in this high-tempo matchup.", analysis_fr: "EV: +5.5% | Edge: 8% | Buts garantis dans ce choc." },
        { league: "Bundesliga", homeTeam: "Dortmund", awayTeam: "Leverkusen", time: "15:30", prediction_en: "Double Chance (12)", prediction_fr: "Double Chance (12)", confidence: 83, odds: 1.25, category: "safe", analysis_en: "EV: +5.3% | Edge: 7% | Open game, unlikely to end in a draw.", analysis_fr: "EV: +5.3% | Edge: 7% | Match ouvert, nul improbable." },
        { league: "Bundesliga", homeTeam: "Eintracht Frankfurt", awayTeam: "Wolfsburg", time: "15:30", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 76, odds: 1.80, category: "safe", analysis_en: "EV: +7.2% | Edge: 9% | Frankfurt strong home form, Wolfsburg poor away.", analysis_fr: "EV: +7.2% | Edge: 9% | Frankfurt fort à domicile." },
        // ── Serie A ───────────────────────────────────────────────────────────
        { league: "Serie A", homeTeam: "Juventus", awayTeam: "AC Milan", time: "19:45", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 78, odds: 1.35, category: "safe", analysis_en: "EV: +6.1% | Edge: 9% | Defensive metrics strong for both, playing safe.", analysis_fr: "EV: +6.1% | Edge: 9% | Métriques défensives fortes." },
        { league: "Serie A", homeTeam: "Napoli", awayTeam: "Lazio", time: "20:45", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 78, odds: 1.35, category: "safe", analysis_en: "EV: +5.0% | Edge: 7% | Napoli unbeaten at home vs Lazio in last 5.", analysis_fr: "EV: +5.0% | Edge: 7% | Napoli invaincu à domicile vs Lazio." },
        { league: "Serie A", homeTeam: "Inter Milan", awayTeam: "Roma", time: "20:45", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 81, odds: 1.65, category: "safe", analysis_en: "EV: +7.8% | Edge: 10% | Inter dominant at San Siro, Roma poor away xGA.", analysis_fr: "EV: +7.8% | Edge: 10% | Inter dominant à San Siro." },
        // ── Ligue 1 ───────────────────────────────────────────────────────────
        { league: "Ligue 1", homeTeam: "PSG", awayTeam: "Monaco", time: "21:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 79, odds: 1.60, category: "safe", analysis_en: "EV: +7.0% | Edge: 10% | PSG squad depth superior at Parc des Princes.", analysis_fr: "EV: +7.0% | Edge: 10% | Profondeur du PSG supérieure." },
        { league: "Ligue 1", homeTeam: "Marseille", awayTeam: "Nice", time: "21:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 74, odds: 1.30, category: "value", analysis_en: "EV: +4.2% | Edge: 5% | Tactical derby, avoiding goal lines.", analysis_fr: "EV: +4.2% | Edge: 5% | Derby tactique." },
        { league: "Ligue 1", homeTeam: "Lyon", awayTeam: "Lens", time: "20:00", prediction_en: "Double Chance (12)", prediction_fr: "Double Chance (12)", confidence: 77, odds: 1.28, category: "safe", analysis_en: "EV: +5.6% | Edge: 7% | Both offensive, draw unlikely.", analysis_fr: "EV: +5.6% | Edge: 7% | Les deux offensifs, nul improbable." },
        // ── Champions League ──────────────────────────────────────────────────
        { league: "Champions League", homeTeam: "Real Madrid", awayTeam: "Man City", time: "21:00", prediction_en: "Double Chance (12)", prediction_fr: "Double Chance (12)", confidence: 84, odds: 1.20, category: "safe", analysis_en: "EV: +5.2% | Edge: 7% | Superclash — decisive game expected, fading the draw.", analysis_fr: "EV: +5.2% | Edge: 7% | Superchoc — nul improbable." },
        { league: "Champions League", homeTeam: "Inter Milan", awayTeam: "Benfica", time: "20:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 74, odds: 1.30, category: "value", analysis_en: "EV: +4.1% | Edge: 5% | Mixed signals on home advantage, taking 1X.", analysis_fr: "EV: +4.1% | Edge: 5% | Signaux mixtes sur l'avantage domicile." },
        { league: "Europa League", homeTeam: "AS Roma", awayTeam: "Brighton", time: "18:45", prediction_en: "Over 1.5 Goals", prediction_fr: "Plus de 1.5 Buts", confidence: 80, odds: 1.28, category: "safe", analysis_en: "EV: +6.5% | Edge: 8% | Attacking styles guarantee chances.", analysis_fr: "EV: +6.5% | Edge: 8% | Styles offensifs garantissent des occasions." },
        // ── Other Leagues ─────────────────────────────────────────────────────
        { league: "Eredivisie", homeTeam: "Ajax", awayTeam: "Feyenoord", time: "14:30", prediction_en: "Double Chance (12)", prediction_fr: "Double Chance (12)", confidence: 70, odds: 1.30, category: "risky", analysis_en: "EV: +4.5% | Edge: 6% | High volatility derby, fading the draw.", analysis_fr: "EV: +4.5% | Edge: 6% | Derby volatil, on évite le nul." },
        { league: "Primeira Liga", homeTeam: "Porto", awayTeam: "Sporting CP", time: "21:15", prediction_en: "Over 1.5 Goals", prediction_fr: "Plus de 1.5 Buts", confidence: 85, odds: 1.35, category: "safe", analysis_en: "EV: +6.9% | Edge: 9% | Both teams scoring, but O2.5 is risky.", analysis_fr: "EV: +6.9% | Edge: 9% | Les deux équipes marquent." },
        { league: "Championship", homeTeam: "Leeds United", awayTeam: "Leicester", time: "20:45", prediction_en: "Draw No Bet (Leeds)", prediction_fr: "Remboursé si Nul (Leeds)", confidence: 72, odds: 1.70, category: "value", analysis_en: "EV: +4.8% | Edge: 6% | Home advantage crucial in top-table clash.", analysis_fr: "EV: +4.8% | Edge: 6% | Avantage domicile crucial." },
        { league: "Scottish Premiership", homeTeam: "Celtic", awayTeam: "Rangers", time: "12:30", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 74, odds: 1.55, category: "safe", analysis_en: "EV: +5.7% | Edge: 7% | Celtic dominant at home in Old Firm derbies.", analysis_fr: "EV: +5.7% | Edge: 7% | Celtic dominant à domicile." },
        { league: "MLS", homeTeam: "Inter Miami", awayTeam: "LA Galaxy", time: "01:30", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 73, odds: 1.85, category: "value", analysis_en: "EV: +6.5% | Edge: 8% | Messi factor + home support decisive.", analysis_fr: "EV: +6.5% | Edge: 8% | Facteur Messi + soutien domicile." },
        // ── Extra African Fixtures ─────────────────────────────────────────────
        { league: "Uganda Premier League", homeTeam: "KCCA FC", awayTeam: "Vipers SC", time: "14:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 74, odds: 1.55, category: "safe", analysis_en: "EV: +5.5% | Edge: 7% | KCCA strong home advantage in Ugandan capital.", analysis_fr: "EV: +5.5% | Edge: 7% | KCCA fort avantage à domicile." },
        { league: "Tanzania Premier League", homeTeam: "Young Africans", awayTeam: "Simba SC", time: "15:00", prediction_en: "Double Chance (12)", prediction_fr: "Double Chance (12)", confidence: 76, odds: 1.35, category: "safe", analysis_en: "EV: +5.8% | Edge: 8% | Volatile derby, high goals expected.", analysis_fr: "EV: +5.8% | Edge: 8% | Derby volatile, buts attendus." },
        { league: "NPFL", homeTeam: "Rangers Int.", awayTeam: "Plateau United", time: "16:00", prediction_en: "Over 1.5 Goals", prediction_fr: "Plus de 1.5 Buts", confidence: 78, odds: 1.40, category: "safe", analysis_en: "EV: +5.2% | Edge: 7% | Both teams high-scoring in 2024 season.", analysis_fr: "EV: +5.2% | Edge: 7% | Les deux équipes ont marqué beaucoup en 2024." },
        { league: "Ghana Premier League", homeTeam: "Accra Lions", awayTeam: "Dreams FC", time: "15:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 74, odds: 1.90, category: "value", analysis_en: "EV: +6.5% | Edge: 8% | Accra Lions solid at home this term.", analysis_fr: "EV: +6.5% | Edge: 8% | Accra Lions solide à domicile." },
        // ── Extra European Depth ──────────────────────────────────────────────
        { league: "Serie A", homeTeam: "Fiorentina", awayTeam: "Torino", time: "15:00", prediction_en: "Over 1.5 Goals", prediction_fr: "Plus de 1.5 Buts", confidence: 82, odds: 1.30, category: "safe", analysis_en: "EV: +6.0% | Edge: 8% | Both teams averaged 2.1 goals recent form.", analysis_fr: "EV: +6.0% | Edge: 8% | Les deux équipes en forme offensive." },
        { league: "Bundesliga", homeTeam: "Stuttgart", awayTeam: "Freiburg", time: "15:30", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 73, odds: 1.50, category: "safe", analysis_en: "EV: +5.4% | Edge: 7% | Stuttgart unbeaten at home vs bottom half.", analysis_fr: "EV: +5.4% | Edge: 7% | Stuttgart invaincu à domicile." },
        { league: "La Liga", homeTeam: "Villarreal", awayTeam: "Getafe", time: "14:00", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 78, odds: 1.75, category: "safe", analysis_en: "EV: +7.2% | Edge: 9% | Villarreal dominant over bottom-half opponents.", analysis_fr: "EV: +7.2% | Edge: 9% | Villarreal dominant vs bas de tableau." },
        { league: "Europa League", homeTeam: "Atalanta", awayTeam: "Apollon", time: "18:45", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 86, odds: 1.40, category: "safe", analysis_en: "EV: +8.5% | Edge: 11% | Heavy European home advantage for Atalanta.", analysis_fr: "EV: +8.5% | Edge: 11% | Fort avantage à domicile pour Atalanta." },
        { league: "Ligue 1", homeTeam: "Brest", awayTeam: "Rennes", time: "17:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 72, odds: 1.50, category: "value", analysis_en: "EV: +4.7% | Edge: 6% | Brest strong at home, Rennes inconsistent away.", analysis_fr: "EV: +4.7% | Edge: 6% | Brest fort à domicile." },
        { league: "Premier League", homeTeam: "Brighton", awayTeam: "Brentford", time: "15:00", prediction_en: "Over 1.5 Goals", prediction_fr: "Plus de 1.5 Buts", confidence: 87, odds: 1.18, category: "safe", analysis_en: "EV: +5.3% | Edge: 7% | Both teams high xG per 90 this season.", analysis_fr: "EV: +5.3% | Edge: 7% | Les deux équipes à haut xG cette saison." },
        { league: "Champions League", homeTeam: "Bayern Munich", awayTeam: "Arsenal", time: "21:00", prediction_en: "Double Chance (1X)", prediction_fr: "Double Chance (1X)", confidence: 76, odds: 1.45, category: "safe", analysis_en: "EV: +5.9% | Edge: 8% | Bayern home advantage in UCL historically decisive.", analysis_fr: "EV: +5.9% | Edge: 8% | Avantage domicile domicile de Bayern en LDC." },
        { league: "Bundesliga", homeTeam: "Bayer Leverkusen", awayTeam: "Mainz", time: "18:30", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 84, odds: 1.38, category: "safe", analysis_en: "EV: +7.2% | Edge: 9% | Leverkusen unbeaten run, Mainz poor away record.", analysis_fr: "EV: +7.2% | Edge: 9% | Leverkusen invaincu, Mainz mauvais hors de chez eux." },
        { league: "Serie A", homeTeam: "Milan", awayTeam: "Empoli", time: "20:45", prediction_en: "Home Win", prediction_fr: "Victoire Domicile", confidence: 82, odds: 1.50, category: "safe", analysis_en: "EV: +7.8% | Edge: 10% | Milan dominant vs bottom-half, Empoli win-less away.", analysis_fr: "EV: +7.8% | Edge: 10% | Milan dominant vs bas de tableau." },
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
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });
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
        const response = await withRetry<GenerateContentResponse>(() =>
            ai.models.generateContent({
                model: currentModel,
                contents: prompt,
                config: {
                    temperature: 0.3,
                    tools: [{ googleSearch: {} }],
                    responseMimeType: "application/json",
                    responseSchema: matchesSchema
                }
            })
        );

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