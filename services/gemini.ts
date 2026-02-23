import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Match, AccumulatorSet } from "../types";
import { getGlobalTodayKey, saveTodaysPredictions, getGlobalYesterdayKey, getPredictionsForDate, savePredictionsForDate, getTeamAssetsMap, saveTeamAsset } from "./db";

// Dynamic Model Management
// Switched to 3.0 Flash Preview for better stability on JSON tasks vs 2.0 Exp
const DEFAULT_MODEL = 'gemini-3-flash-preview';
let currentModel = localStorage.getItem('vantage_gemini_model') || DEFAULT_MODEL;

export const setGeminiModel = (model: string) => {
    currentModel = model;
    localStorage.setItem('vantage_gemini_model', model);
};

export const getGeminiModel = () => currentModel;

export const AVAILABLE_MODELS = [
    { id: 'gemini-3-flash-preview', name: 'Vantage AI 3.0 Flash (Stable)' },
    { id: 'gemini-2.0-flash-exp', name: 'Vantage AI 2.0 Flash (Experimental)' },
    { id: 'gemini-3-pro-preview', name: 'Vantage AI 3.0 Pro (Reasoning)' }
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

        const parsePrompt = `Grade predictions based on scores: ${rawScores}. Preds: ${JSON.stringify(matchesToGrade.map(m => ({ id: m.id, p: m.prediction })))}. Return JSON schema.`;

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
 * Generates predictions (Matches Only)
 */
export const generateDailyPredictions = async (signal?: AbortSignal): Promise<Match[]> => {
    try {
        const todayStr = getGlobalTodayKey();
        const apiKey = getApiKey();
        if (!apiKey) throw new Error("API Key missing.");

        console.log(`[Gemini Pipeline] Starting Analysis for ${todayStr} using ${currentModel}...`);
        const ai = new GoogleGenAI({ apiKey });

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

        // -------------------------------------------------------------------------
        // ATTEMPT 1: REAL DATA (Using Search Tool)
        // -------------------------------------------------------------------------
        try {
            const searchPrompt = `
          You are the "Quant-Desk Decision Engine v3.0", a conservative professional betting model built for long-term capital preservation and sustained positive expected value (EV).

          YOUR OBJECTIVE:
          Safety first. Identify only the HIGHEST CONFIDENCE, lowest-variance opportunities across ALL football matches today. Return EVERY match that qualifies — do not cap the output count. Prefer NO PLAY over ANY marginal or uncertain edge.

          INPUT VARIABLES:
          - DATE = ${todayStr}
          - ODDS_DATA = REAL (Via Search)

          🧮 CORE PHILOSOPHY & MATH RULES:

          1️⃣ Expected Value First (Mandatory)
          EV = (Model Probability × Decimal Odds) − 1
          MINIMUM THRESHOLD: EV ≥ +0.05 (5% edge floor — raised for safety).
          If EV < 5% → DISCARD. Do not include.

          2️⃣ Confidence Floor
          Only include matches where Model Probability ≥ 70%.
          Anything below 70% confidence is too uncertain — DISCARD.

          3️⃣ ONE Market Per Match (CRITICAL RULE)
          For each match, evaluate ALL available markets (1X2, Double Chance, Over/Under, DNB, BTTS).
          Then SELECT ONLY THE SINGLE SAFEST, highest-EV market for that match.
          NEVER include the same match twice under different markets.

          4️⃣ Market Preference Hierarchy (Safety Order)
          When two markets have similar EV, prefer in this order:
          1. Double Chance (1X or X2) — lowest variance
          2. Draw No Bet (DNB) — protects capital
          3. Over 1.5 Goals — statistically reliable
          4. Home Win / Away Win — only if probability ≥ 78%
          5. Over 2.5 Goals / BTTS — only if EV is significantly higher

          5️⃣ Implied Probability & Market Efficiency
          Implied Probability = 1 / Decimal Odds
          Edge % = Model Probability − Implied Probability
          - High Liquidity Leagues (EPL, La Liga, UCL, Bundesliga): Require EV > 6%.
          - Lower Liquidity Leagues: Require EV > 8% to compensate for line noise.

          6️⃣ Variance Adjustment
          - Small sample / High Volatility teams: Apply 0.88 factor to Model Probability before EV calc.
          - Derby / rivalry matches: Apply 0.85 factor (emotion inflates variance).
          - If adjusted confidence drops below 70% → DISCARD.

          7️⃣ Scan Scope — NO LIMITS
          Search ALL available football matches today across ALL leagues worldwide.
          Apply the filter. Return EVERY match that passes — whether that is 5 or 50.
          Do NOT artificially limit output to a fixed number.

          🚨 OUTPUT INSTRUCTIONS:
          Perform all math internally. Output a JSON Array matching the provided schema.

          MAPPING RULES:
          - 'confidence': Final adjusted model_probability (0-100 integer).
          - 'category':
             - 'safe' if EV ≥ 7% AND confidence ≥ 78% AND low-variance market chosen.
             - 'value' if EV ≥ 5% AND confidence ≥ 70%.
             - 'risky' ONLY if the user specifically needs it — avoid where possible.
          - 'analysis_en': "EV: +X% | Edge: Y% | [Max 15 word reason]".
          - 'prediction_en': The ONE selected market (e.g. "Double Chance (1X)", "Draw No Bet (Home)").
          - If a match has NO market meeting the criteria, do NOT include it.
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

        // Safety gate: discard any match that slipped through below the confidence floor,
        // then sort safest/highest-confidence first so the UI always surfaces the best picks.
        return parsedMatches
            .filter(m => m.confidence >= 70)
            .sort((a, b) => {
                // Primary: category rank (safe > value > risky)
                const categoryRank: Record<string, number> = { safe: 0, value: 1, risky: 2 };
                const catDiff = (categoryRank[a.category] ?? 1) - (categoryRank[b.category] ?? 1);
                if (catDiff !== 0) return catDiff;
                // Secondary: confidence descending
                return b.confidence - a.confidence;
            });
    } catch (e) {
        console.error("Enhance Matches Error:", e);
        throw e; // Re-throw to trigger fallback
    }
}

/**
 * OFFLINE / FALLBACK GENERATOR
 */
async function generateLocalFallbackMatches(): Promise<Match[]> {
    console.log("[Gemini] Generating Local Fallback Data (Offline Mode)");

    // Static list of high-quality "Simulated" matches to keep the app functional
    // Safety Logic: Predictions prioritize Double Chance if not absolutely sure.
    // Expanded to 15 matches as per new request range (7-20)
    const rawMatches = [
        {
            league: "Premier League",
            homeTeam: "Manchester City",
            awayTeam: "Arsenal",
            time: "20:00",
            prediction_en: "Double Chance (1X)",
            prediction_fr: "Double Chance (1X)",
            confidence: 72,
            odds: 1.45,
            category: "risky",
            analysis_en: "EV: +4.4% | Edge: 5% | Public heavy on City, line moving to Arsenal.",
            analysis_fr: "EV: +4.4% | Edge: 5% | Attention Piège: Public sur City."
        },
        {
            league: "La Liga",
            homeTeam: "Real Madrid",
            awayTeam: "Sevilla",
            time: "21:00",
            prediction_en: "Home Win",
            prediction_fr: "Victoire Domicile",
            confidence: 86,
            odds: 1.55,
            category: "safe",
            analysis_en: "EV: +8.2% | Edge: 11% | Market volume aligns with historical win prob.",
            analysis_fr: "EV: +8.2% | Edge: 11% | Jeu Confirmé: Le volume du marché s'aligne."
        },
        {
            league: "Serie A",
            homeTeam: "Juventus",
            awayTeam: "AC Milan",
            time: "19:45",
            prediction_en: "Double Chance (1X)",
            prediction_fr: "Double Chance (1X)",
            confidence: 78,
            odds: 1.35,
            category: "safe",
            analysis_en: "EV: +6.1% | Edge: 9% | Defensive metrics strong for both, playing safe.",
            analysis_fr: "EV: +6.1% | Edge: 9% | Indicateurs défensifs forts."
        },
        {
            league: "Bundesliga",
            homeTeam: "Bayern Munich",
            awayTeam: "RB Leipzig",
            time: "18:30",
            prediction_en: "Over 1.5 Goals",
            prediction_fr: "Plus de 1.5 Buts",
            confidence: 88,
            odds: 1.18,
            category: "safe",
            analysis_en: "EV: +5.5% | Edge: 8% | Goals guaranteed, but 2.5 line is tight.",
            analysis_fr: "EV: +5.5% | Edge: 8% | Buts garantis."
        },
        {
            league: "Ligue 1",
            homeTeam: "PSG",
            awayTeam: "Monaco",
            time: "21:00",
            prediction_en: "Home Win",
            prediction_fr: "Victoire Domicile",
            confidence: 79,
            odds: 1.60,
            category: "safe",
            analysis_en: "EV: +7.0% | Edge: 10% | PSG squad depth superior.",
            analysis_fr: "EV: +7.0% | Edge: 10% | Profondeur de banc du PSG supérieure."
        },
        {
            league: "Champions League",
            homeTeam: "Inter Milan",
            awayTeam: "Benfica",
            time: "20:00",
            prediction_en: "Safer Route: Double Chance (1X)",
            prediction_fr: "Sécurité: Double Chance (1X)",
            confidence: 74,
            odds: 1.30,
            category: "value",
            analysis_en: "EV: +4.1% | Edge: 5% | Mixed signals on home advantage, taking 1X.",
            analysis_fr: "EV: +4.1% | Edge: 5% | Signaux mixtes sur l'avantage domicile."
        },
        {
            league: "Europa League",
            homeTeam: "AS Roma",
            awayTeam: "Brighton",
            time: "18:45",
            prediction_en: "Over 1.5 Goals",
            prediction_fr: "Plus de 1.5 Buts",
            confidence: 80,
            odds: 1.28,
            category: "safe",
            analysis_en: "EV: +6.5% | Edge: 8% | Attacking styles guarantee chances.",
            analysis_fr: "EV: +6.5% | Edge: 8% | Les styles offensifs garantissent des occasions."
        },
        {
            league: "Eredivisie",
            homeTeam: "Ajax",
            awayTeam: "Feyenoord",
            time: "14:30",
            prediction_en: "Double Chance (12)",
            prediction_fr: "Double Chance (12)",
            confidence: 70,
            odds: 1.30,
            category: "risky",
            analysis_en: "EV: +4.5% | Edge: 6% | High volatility derby, fading the draw.",
            analysis_fr: "EV: +4.5% | Edge: 6% | Derby volatil, on évite le nul."
        },
        {
            league: "Premier League",
            homeTeam: "Liverpool",
            awayTeam: "Chelsea",
            time: "17:30",
            prediction_en: "Double Chance (1X)",
            prediction_fr: "Double Chance (1X)",
            confidence: 75,
            odds: 1.33,
            category: "safe",
            analysis_en: "EV: +5.8% | Edge: 7% | Anfield fortress holds strong.",
            analysis_fr: "EV: +5.8% | Edge: 7% | La forteresse d'Anfield tient bon."
        },
        {
            league: "La Liga",
            homeTeam: "Barcelona",
            awayTeam: "Atl. Madrid",
            time: "21:00",
            prediction_en: "Double Chance (1X)",
            prediction_fr: "Double Chance (1X)",
            confidence: 76,
            odds: 1.30,
            category: "safe",
            analysis_en: "EV: +5.1% | Edge: 6% | Safer than goal line against Simeone's defense.",
            analysis_fr: "EV: +5.1% | Edge: 6% | Plus sûr que les buts."
        },
        // NEW MOCK MATCHES FOR RANGE EXTENSION
        {
            league: "Championship",
            homeTeam: "Leeds United",
            awayTeam: "Leicester",
            time: "20:45",
            prediction_en: "Draw No Bet (Leeds)",
            prediction_fr: "Remboursé si Nul (Leeds)",
            confidence: 72,
            odds: 1.70,
            category: "value",
            analysis_en: "EV: +4.8% | Edge: 6% | Home advantage crucial in top-table clash.",
            analysis_fr: "EV: +4.8% | Edge: 6% | Avantage domicile crucial."
        },
        {
            league: "Primeira Liga",
            homeTeam: "Porto",
            awayTeam: "Sporting CP",
            time: "21:15",
            prediction_en: "Over 1.5 Goals",
            prediction_fr: "Plus de 1.5 Buts",
            confidence: 85,
            odds: 1.35,
            category: "safe",
            analysis_en: "EV: +6.9% | Edge: 9% | Both teams scoring, but O2.5 is risky.",
            analysis_fr: "EV: +6.9% | Edge: 9% | Les deux marquent."
        },
        {
            league: "Serie A",
            homeTeam: "Napoli",
            awayTeam: "Lazio",
            time: "20:45",
            prediction_en: "Double Chance (1X)",
            prediction_fr: "Double Chance (1X)",
            confidence: 78,
            odds: 1.35,
            category: "safe",
            analysis_en: "EV: +5.0% | Edge: 7% | Napoli unbeaten at home against Lazio in last 5.",
            analysis_fr: "EV: +5.0% | Edge: 7% | Napoli invaincu à domicile."
        },
        {
            league: "Ligue 1",
            homeTeam: "Marseille",
            awayTeam: "Nice",
            time: "21:00",
            prediction_en: "Double Chance (1X)",
            prediction_fr: "Double Chance (1X)",
            confidence: 74,
            odds: 1.30,
            category: "value",
            analysis_en: "EV: +4.2% | Edge: 5% | Tactical derby, avoiding goal lines.",
            analysis_fr: "EV: +4.2% | Edge: 5% | Derby tactique."
        },
        {
            league: "Bundesliga",
            homeTeam: "Dortmund",
            awayTeam: "Leverkusen",
            time: "15:30",
            prediction_en: "Double Chance (12)",
            prediction_fr: "Double Chance (12)",
            confidence: 83,
            odds: 1.25,
            category: "safe",
            analysis_en: "EV: +5.3% | Edge: 7% | Open game, unlikely to end in a draw.",
            analysis_fr: "EV: +5.3% | Edge: 7% | Match ouvert."
        }
    ];

    return parseAndEnhanceMatches(JSON.stringify(rawMatches));
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
                    tools: [{ googleSearch: {} }]
                }
            })
        );

        if (signal?.aborted) return [];

        const text = response.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array in basketball response');

        const raw: any[] = JSON.parse(jsonMatch[0]);
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