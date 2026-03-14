/**
 * backend/openaiService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenAI-powered generation functions.
 * PRIMARY AI engine for Vantage AI — Gemini is the fallback.
 *
 * Model strategy:
 *   - Football predictions : gpt-4o       (best analysis quality)
 *   - Blog content         : gpt-4o       (best writing quality)
 *   - Grading              : gpt-4o-mini  (cheap + fast, task is simple)
 *   - Basketball           : gpt-4o       (best analysis quality)
 *
 * Each function has an internal OpenAI model fallback chain before giving up.
 * The OUTER fallback (OpenAI → Gemini) is handled in scheduler.js.
 */

import OpenAI from 'openai';
import admin from 'firebase-admin';
import { enrichMatchesWithLogos, buildSportmonksLogoMap } from './logoEnricher.js';

// ── Model chains ──────────────────────────────────────────────────────────────
const OPENAI_PREDICTION_MODELS = ['gpt-4o', 'gpt-4o-mini'];
const OPENAI_BLOG_MODELS = ['gpt-4o', 'gpt-4o-mini'];
const OPENAI_GRADING_MODELS = ['gpt-4o-mini', 'gpt-4o'];
const OPENAI_BASKETBALL_MODELS = ['gpt-4o', 'gpt-4o-mini'];
const OPENAI_ACCUMULATOR_MODELS = ['gpt-4o', 'gpt-4o-mini'];

// ── SDK instance ──────────────────────────────────────────────────────────────
const getOpenAI = () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Missing OPENAI_API_KEY environment variable on server');
    return new OpenAI({ apiKey: key });
};

// ── Date helpers ──────────────────────────────────────────────────────────────
// IMPORTANT: Uses Africa/Lagos timezone to match the cron scheduler.
// Without this, at midnight Lagos time (= 23:00 UTC), getDateKey(0)
// would return yesterday's date and write predictions to the wrong Firestore doc.
const getDateKey = (daysAgo = 0) => {
    const now = new Date();
    // Shift to Africa/Lagos (UTC+1, no DST)
    const lagosOffset = 60; // minutes
    const localMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
    const d = new Date(localMs);
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Helper: JSON parse with fallback ──────────────────────────────────────────
const safeJSON = (text, fallback = []) => {
    if (!text) return fallback;

    // Strip markdown code fence if present
    let cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // --- TRUNCATION RECOVERY ---
        try {
            const firstBracket = cleaned.indexOf('[');
            const firstBrace = cleaned.indexOf('{');
            let isArray = false;
            let startIndex = -1;

            if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
                isArray = true;
                startIndex = firstBracket;
            } else if (firstBrace !== -1) {
                isArray = false;
                startIndex = firstBrace;
            }

            if (startIndex !== -1) {
                const partial = cleaned.substring(startIndex);
                let braceDepth = 0;
                let bracketDepth = 0;
                let inString = false;
                let escapeNext = false;
                let lastValidEnd = -1;

                for (let i = 0; i < partial.length; i++) {
                    const char = partial[i];
                    if (escapeNext) { escapeNext = false; continue; }
                    if (char === '\\') { escapeNext = true; continue; }
                    if (char === '"') { inString = !inString; continue; }

                    if (!inString) {
                        if (char === '{') braceDepth++;
                        else if (char === '}') {
                            braceDepth--;
                            if (isArray && braceDepth === 0 && bracketDepth === 1) {
                                lastValidEnd = i;
                            } else if (!isArray && braceDepth === 0) {
                                lastValidEnd = i;
                            }
                        }
                        else if (char === '[') bracketDepth++;
                        else if (char === ']') bracketDepth--;
                    }
                }

                if (lastValidEnd !== -1) {
                    const recovered = partial.substring(0, lastValidEnd + 1) + (isArray ? ']' : '');
                    return JSON.parse(recovered);
                }
            }
        } catch (recoveryErr) {
            console.warn('[OpenAI] safeJSON robust recovery failed:', recoveryErr.message);
        }

        console.warn('[OpenAI] safeJSON parse error:', e.message);
        const snippet = text.length > 100 ? '...' + text.substring(text.length - 100) : text;
        console.log('[OpenAI] Raw response tail (debug):', snippet);
        return fallback;
    }
};

// ── Helper: Try a list of models sequentially ─────────────────────────────────
async function tryModels(openai, models, requestFn, taskName) {
    let lastError = null;
    for (const model of models) {
        try {
            console.log(`[OpenAI ${taskName}] Trying model: ${model}...`);
            const result = await requestFn(openai, model);
            console.log(`[OpenAI ${taskName}] ✅ Success with ${model}`);
            return result;
        } catch (err) {
            lastError = err;
            console.warn(`[OpenAI ${taskName}] ⚠️ ${model} failed: ${err.message}`);
        }
    }
    throw new Error(`All OpenAI models failed for ${taskName}. Last: ${lastError?.message}`);
}

const fetchSportmonksServerSide = async (path) => {
    const token = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
    if (!token) {
        console.warn('[OpenAI] No Sportmonks token — skipping fetch');
        return null;
    }
    try {
        let allData = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 50) {
            const pagePath = path.includes('?') ? `${path}&page=${page}` : `${path}?page=${page}`;
            const separator = pagePath.includes('?') ? '&' : '?';
            const url = `https://api.sportmonks.com/v3/football${pagePath}${separator}api_token=${token}`;
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`[OpenAI] Sportmonks API error (${res.status}) on ${pagePath}`);
                break;
            }
            const json = await res.json();
            if (json.data && Array.isArray(json.data)) {
                allData = allData.concat(json.data);
            } else if (json.data) {
                return json.data;
            }
            hasMore = !!json.pagination?.has_more;
            page++;
        }
        return allData.length > 0 ? allData : null;
    } catch (e) {
        console.warn('[OpenAI] fetchSportmonksServerSide error:', e.message);
        return null;
    }
};

// ── League Tiers (aligned with Livescore priority) ────────────────────────────
const TIER_1_LEAGUE_IDS = new Set([8, 2]); // PL, UCL
const TIER_2_LEAGUE_IDS = new Set([564, 82, 384, 5]); // La Liga, Bundesliga, Serie A, UEL
const TIER_3_LEAGUE_IDS = new Set([301, 462, 7]); // Ligue 1, Primeira Liga, Conference
const TIER_4_LEAGUE_IDS = new Set([72, 9, 600, 253, 325, 176]); // Eredivisie, Championship, MLS, Serie A Brazil, etc
const TIER_5_LEAGUE_IDS = new Set([1186, 1187, 1329, 570, 392]);
const TIER_6_LEAGUE_IDS = new Set([572, 288, 636, 406, 201, 480, 551]);
const PRIORITY_COUNTRIES = new Set(['England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Turkey', 'Brazil', 'Argentina', 'USA', 'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Egypt', 'Morocco', 'Cameroon', 'Uganda', 'Tanzania', 'Algeria', 'Tunisia']);

const getPriorityScore = (fixtureInfo) => {
    let score = 0;
    const leagueId = fixtureInfo.leagueId;
    const name = fixtureInfo.league?.toLowerCase() || '';
    
    if (TIER_1_LEAGUE_IDS.has(leagueId)) score += 150;
    else if (TIER_2_LEAGUE_IDS.has(leagueId)) score += 120;
    else if (TIER_3_LEAGUE_IDS.has(leagueId)) score += 100;
    else if (TIER_4_LEAGUE_IDS.has(leagueId)) score += 80;
    else if (TIER_5_LEAGUE_IDS.has(leagueId)) score += 60;
    else if (TIER_6_LEAGUE_IDS.has(leagueId)) score += 40;
    
    // Fallback text matching just in case ID is missing or new
    if (name.includes('world cup') || name.includes('euro') || name.includes('copa america') || name.includes('nations cup') || name.includes('afcon')) score += 90;
    if (name.includes('premier') || name.includes('division 1') || name.includes('primera')) score += 10;
    return score;
};

        // Fetch fixtures from Sportmonks for context
        const rawData = await fetchSportmonksServerSide(`/fixtures/date/${todayStr}?include=league;participants;scores`) || [];

        // FILTER: Keep only matches that have not yet started based on current UTC time
        const nowMs = Date.now();
        const upcomingData = rawData.filter(item => {
            if (!item.starting_at) return true;
            return new Date(item.starting_at).getTime() > nowMs;
        });

        const allMappedFixtures = upcomingData.map(item => {
            const home = item.participants?.find(p => p.meta?.location === 'home') || {};
            const away = item.participants?.find(p => p.meta?.location === 'away') || {};
            const rawTime = item.starting_at || '';
            const timeHHMM = rawTime.includes('T') ? rawTime.split('T')[1].substring(0, 5) : rawTime;
            return {
                id: String(item.id),
                league: item.league?.name || 'Unknown',
                leagueId: item.league_id,
                homeTeam: home.name || '',
                awayTeam: away.name || '',
                homeTeamId: home.id,
                awayTeamId: away.id,
                homeTeamLogo: home.image_path || '',
                awayTeamLogo: away.image_path || '',
                time: timeHHMM,
            };
        });

        // Build a team-name → logo URL map from today's Sportmonks data for later enrichment
        const sportmonksLogoMap = buildSportmonksLogoMap(rawData);

        // Filter valid fixtures and SORT by LiveScore league hierarchy
        let fixtures = allMappedFixtures
            .filter(f => f.homeTeam.trim().length > 1 && f.awayTeam.trim().length > 1)
            .map(f => ({ ...f, priorityScore: getPriorityScore(f) }))
            .sort((a, b) => b.priorityScore - a.priorityScore);

        // Keep the top 40 matches based on priority score
        fixtures = fixtures.filter(f => f.priorityScore > 0).slice(0, 40);

        // Save raw fixtures placeholder
        if (fixtures.length > 0) {
            await admin.firestore().collection('daily_predictions').doc(todayStr).set({
                rawFixtures: fixtures,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        // ── FETCH REAL SPORTMONKS FORM + H2H DATA FOR API INJECTION ────────────
        const fixtureRealData = {};
        const ENRICH_BATCH = 6;
        const fixturesToEnrich = fixtures.slice(0, 30); // Enrich top 30
        
        for (let i = 0; i < fixturesToEnrich.length; i += ENRICH_BATCH) {
            const batch = fixturesToEnrich.slice(i, i + ENRICH_BATCH);
            await Promise.all(batch.map(async (f) => {
                try {
                    const homeId = f.homeTeamId;
                    const awayId = f.awayTeamId;
                    if (!homeId || !awayId) return;

                    const h2hData = await fetchSportmonksServerSide(`/fixtures/head-to-head/${homeId}/${awayId}?include=participants;scores&per_page=5`);
                    const from = getDateKey(120);
                    const [homeRecent, awayRecent] = await Promise.all([
                        fetchSportmonksServerSide(`/fixtures/between/${from}/${todayStr}?include=participants;scores&filters=fixtureParticipants:${homeId}&per_page=5`),
                        fetchSportmonksServerSide(`/fixtures/between/${from}/${todayStr}?include=participants;scores&filters=fixtureParticipants:${awayId}&per_page=5`),
                    ]);

                    let h2hHomeWins = 0, h2hAwayWins = 0, h2hDraws = 0;
                    const h2hScores = [];
                    if (Array.isArray(h2hData)) {
                        for (const fx of h2hData.slice(0, 5)) {
                            const scores = fx.scores || [];
                            const hG = scores.find(s => s.participant_id === homeId && s.description === 'CURRENT')?.score?.goals ?? null;
                            const aG = scores.find(s => s.participant_id === awayId && s.description === 'CURRENT')?.score?.goals ?? null;
                            if (hG !== null && aG !== null) {
                                h2hScores.push(`${hG}-${aG}`);
                                if (hG > aG) h2hHomeWins++;
                                else if (aG > hG) h2hAwayWins++;
                                else h2hDraws++;
                            }
                        }
                    }

                    const parseForm = (recentFixtures, teamId) => {
                        if (!Array.isArray(recentFixtures) || recentFixtures.length === 0) return { form: 'N/A', winRate: null, avgScored: null, avgConceded: null };
                        const results = [];
                        let wins = 0, goals = 0, conc = 0;
                        for (const fx of recentFixtures.slice(0, 5)) {
                            const sc = fx.scores || [];
                            const myG = sc.find(s => s.participant_id === teamId && s.description === 'CURRENT')?.score?.goals;
                            const oppG = sc.find(s => s.participant_id !== teamId && s.description === 'CURRENT')?.score?.goals;
                            if (myG !== undefined && oppG !== undefined) {
                                goals += myG; conc += oppG;
                                if (myG > oppG) { results.push('W'); wins++; }
                                else if (myG < oppG) results.push('L');
                                else results.push('D');
                            }
                        }
                        const n = results.length;
                        return {
                            form: n > 0 ? results.join(' ') : 'N/A',
                            winRate: n > 0 ? Math.round((wins / n) * 100) : null,
                            avgScored: n > 0 ? Math.round((goals / n) * 100) / 100 : null,
                            avgConceded: n > 0 ? Math.round((conc / n) * 100) / 100 : null,
                        };
                    };

                    const homeStats = parseForm(homeRecent, homeId);
                    const awayStats = parseForm(awayRecent, awayId);

                    fixtureRealData[f.id] = {
                        homeForm: homeStats.form, homeWinRate: homeStats.winRate,
                        homeAvgScored: homeStats.avgScored, homeAvgConceded: homeStats.avgConceded,
                        awayForm: awayStats.form, awayWinRate: awayStats.winRate,
                        awayAvgScored: awayStats.avgScored, awayAvgConceded: awayStats.avgConceded,
                        h2hHomeWins, h2hAwayWins, h2hDraws,
                        h2hLast5Goals: h2hScores.join(', ') || 'N/A',
                    };
                } catch (e) {
                    // silently skip
                }
            }));
        }

        const realDataLines = fixturesToEnrich.filter(f => fixtureRealData[f.id]).map(f => {
            const d = fixtureRealData[f.id];
            return `Match ID ${f.id}: ${f.homeTeam} vs ${f.awayTeam}\n  Home form: ${d.homeForm} | Win%: ${d.homeWinRate ?? '?'}% | Avg: ${d.homeAvgScored ?? '?'} scored / ${d.homeAvgConceded ?? '?'} conceded\n  Away form: ${d.awayForm} | Win%: ${d.awayWinRate ?? '?'}% | Avg: ${d.awayAvgScored ?? '?'} scored / ${d.awayAvgConceded ?? '?'} conceded\n  H2H last 5: ${f.homeTeam} ${d.h2hHomeWins}W, ${f.awayTeam} ${d.h2hAwayWins}W, ${d.h2hDraws}D | Scores: ${d.h2hLast5Goals}`;
        }).join('\n\n');

        // ── SLIM system prompt: removes logos/fr-translations/minor stats to stay within 16384 tokens ──
        const systemPrompt = `You are the "Quant-Desk Decision Engine v6.0", an elite global sports betting model. You have access to real-time sports data.

RULES (NON-NEGOTIABLE):
1. EV = (probability × decimal odds) − 1. Only pick if EV ≥ +0.06 (6% edge minimum).
2. CONFIDENCE FLOOR: ≥ 72%. Use current team form, H2H records, injury reports, xG, market odds.
3. ONE market per match. Choose from: "Home Win", "Away Win", "Draw", "Double Chance (1X)", "Double Chance (X2)", "Double Chance (12)", "Draw No Bet (Home)", "Draw No Bet (Away)", "Over 1.5 Goals", "Over 2.5 Goals", "Both Teams Score", "Both Teams Score - No".
4. 'category': "safe" if confidence ≥ 80, "value" if 70–79, "risky" if < 70.
5. 'analysis_en': "EV: +X.X% | Edge: Y% | [max 15 words]"
6. USE THE REAL SPORTMONKS DATA PROVIDED BELOW for form and H2H statistics exactly as written. do NOT guess.

Output ONLY a compact JSON array. Each object must have EXACTLY these fields:
id, homeTeam, awayTeam, league, time, prediction_en, confidence, odds, category, analysis_en,
homeForm, awayForm, homeWinRate, awayWinRate, homeAvgScored, awayAvgScored,
h2hHomeWins, h2hAwayWins, h2hDraws, h2hLast5Goals, homeInjured, awayInjured`;

        const userPrompt = `DATE: ${todayStr}

LEAGUE PRIORITY (African betting volume - LiveScore hierarchy):
1. UEFA Champions League, English Premier League (HIGHEST)
2. La Liga, Serie A, Bundesliga, UEFA Europa League
3. Ligue 1, Primeira Liga, Conference League
4. Eredivisie, Championship, MLS, Brasileirão
5. AFCON, CAF Champions League, African leagues

⚡ REAL DATA FROM SPORTMONKS API (DO NOT OVERRIDE — USE EXACTLY AS GROUND TRUTH):
${realDataLines || 'No real-time data API available. Use Search.'}

TODAY'S TOP FIXTURES:
${JSON.stringify(fixturesToEnrich.slice(0, 15).map(f => ({ id: f.id, home: f.homeTeam, away: f.awayTeam, league: f.league, time: f.time })))}

Analyze ONLY the top 15 highest priority betting opportunities from the fixtures list above. Use the real data if provided for the fixture. Combine with search data for injuries and odds.
Output ONLY the raw JSON array. No markdown, no preamble.`;

        const openai = getOpenAI();
        const responseText = await tryModels(openai, OPENAI_PREDICTION_MODELS, async (client, model) => {
            const resp = await client.responses.create({
                model,
                tools: [{ type: 'web_search_preview' }],
                input: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.1,
                max_output_tokens: 16384,
            });
            // Detect token-limit truncation: incomplete_details.reason === 'max_tokens'
            if (resp.incomplete_details?.reason === 'max_tokens' || resp.status === 'incomplete') {
                console.warn(`[OpenAI Predictions] ⚠️ Response truncated (max_tokens hit) with ${model}. Will attempt recovery.`);
            }
            // resp.output_text is a convenience property in the OpenAI SDK (newer versions).
            // Fall back to manual traversal in case the SDK version doesn't have it.
            const text = resp.output_text
                || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text
                || resp.output?.find(o => o.type === 'message')?.content?.[0]?.text
                || '';
            if (!text) throw new Error('Empty response from OpenAI');
            return text;
        }, 'Predictions');

        let predictions = safeJSON(responseText, []);

        // ── Fallback: If web search returned empty/truncated, retry with pure AI simulation ──
        if (!Array.isArray(predictions) || predictions.length === 0) {
            console.warn('[OpenAI] Football predictions array is empty. Trying AI simulation fallback...');
            try {
                const openaiSim = getOpenAI();
                const simText = await tryModels(openaiSim, OPENAI_PREDICTION_MODELS, async (client, model) => {
                    const resp = await client.responses.create({
                        model,
                        // No web_search tool — model uses its own training data about today's schedule
                        input: [
                            { role: 'system', content: systemPrompt }, // reuse slim prompt
                            { role: 'user', content: `DATE: ${todayStr}\n\nSEARCH TOOL UNAVAILABLE. Use your training knowledge of today's football schedule (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, UCL, UEL, and major African leagues) to generate EXACTLY 15 high-quality predictions for ${todayStr}.\nApply the same EV filter (EV ≥ 6%, confidence ≥ 72%). Use id format \"sim-HomeSlug-AwaySlug-${todayStr}\".\n${fixturesToEnrich.length > 0 ? `Confirmed Sportmonks fixtures you can reference:\n${JSON.stringify(fixturesToEnrich.slice(0, 20).map(f => ({ id: f.id, home: f.homeTeam, away: f.awayTeam })))}` : ''}\nOutput ONLY the raw compact JSON array. No markdown, no preamble.` }
                        ],
                        temperature: 0.4,
                        max_output_tokens: 16384,
                    });
                    if (resp.incomplete_details?.reason === 'max_tokens' || resp.status === 'incomplete') {
                        console.warn(`[OpenAI Simulation] ⚠️ Simulation response truncated with ${model}. Will attempt partial recovery.`);
                    }
                    const text = resp.output_text
                        || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text
                        || resp.output?.find(o => o.type === 'message')?.content?.[0]?.text
                        || '';
                    if (!text) throw new Error('Empty simulation response');
                    return text;
                }, 'Predictions-Simulation');
                predictions = safeJSON(simText, []);
                if (Array.isArray(predictions) && predictions.length > 0) {
                    console.log(`[OpenAI] ✅ Simulation fallback returned ${predictions.length} football predictions.`);
                }
            } catch (simErr) {
                console.warn(`[OpenAI] Simulation fallback failed: ${simErr.message}`);
            }
        }


        if (!Array.isArray(predictions) || predictions.length === 0) {
            // Both web search and simulation returned nothing.
            // Returning an error instead of "skipped" ensures that `scheduler.js` falls back to Gemini.
            console.warn('[OpenAI] Football predictions array is empty after all attempts. Returning error to trigger Gemini fallback.');
            return { status: 'error', error: 'no_predictions_returned' };
        }

        // Merge predictions with fixture data
        // CRITICAL: SportMonks fixtures are ground truth for team NAMES only.
        // AI predictions are ground truth for prediction_en, confidence, odds, analysis_en, etc.
        // We must NOT spread the full fixture object over pred — it would stomp the AI fields.
        const fixtureMap = new Map(fixtures.map(f => [f.id, f]));
        const finalMatches = predictions.map(pred => {
            const fixture = fixtureMap.get(pred.id) || fixtureMap.get(String(pred.id));
            const realD = fixtureRealData[pred.id] || fixtureRealData[String(pred.id)];
            
            // Use Sportmonks name if available AND it's a real name (not empty/placeholder)
            const smHome = fixture?.homeTeam;
            const smAway = fixture?.awayTeam;
            const resolvedHome = (smHome && smHome.length > 1) ? smHome : pred.homeTeam;
            const resolvedAway = (smAway && smAway.length > 1) ? smAway : pred.awayTeam;
            
            return {
                sport: 'football',
                status: 'pending',
                homeTeamLogo: '',
                awayTeamLogo: '',
                // AI fields first (ground truth for predictions)
                ...pred,
                // Override ONLY the display fields with resolved names
                homeTeam: resolvedHome,
                awayTeam: resolvedAway,
                league: fixture?.league || pred.league || 'Unknown League',
                time: fixture?.time || pred.time || '',
                // Ensure prediction alias is always set
                prediction: pred.prediction_en || pred.prediction,
                // Real Sportmonks data injected over AI guesses:
                homeForm: realD?.homeForm || pred.homeForm,
                awayForm: realD?.awayForm || pred.awayForm,
                homeWinRate: realD?.homeWinRate ?? pred.homeWinRate,
                awayWinRate: realD?.awayWinRate ?? pred.awayWinRate,
                homeAvgScored: realD?.homeAvgScored ?? pred.homeAvgScored,
                awayAvgScored: realD?.awayAvgScored ?? pred.awayAvgScored,
                homeAvgConceded: realD?.homeAvgConceded ?? pred.homeAvgConceded,
                awayAvgConceded: realD?.awayAvgConceded ?? pred.awayAvgConceded,
                homeCleanSheetRate: pred.homeCleanSheetRate,
                awayCleanSheetRate: pred.awayCleanSheetRate,
                h2hHomeWins: realD?.h2hHomeWins ?? pred.h2hHomeWins,
                h2hAwayWins: realD?.h2hAwayWins ?? pred.h2hAwayWins,
                h2hDraws: realD?.h2hDraws ?? pred.h2hDraws,
                h2hLast5Goals: realD?.h2hLast5Goals || pred.h2hLast5Goals,
                homeInjured: pred.homeInjured,
                awayInjured: pred.awayInjured,
                generatedBy: 'openai',
            };
        }).filter(m => {
            // Drop matches with no recognisable team names — these would show blank cards
            const hasHome = m.homeTeam && m.homeTeam !== 'Home' && m.homeTeam.length > 1;
            const hasAway = m.awayTeam && m.awayTeam !== 'Away' && m.awayTeam.length > 1;
            const hasPrediction = !!(m.prediction_en || m.prediction);
            return hasHome && hasAway && hasPrediction;
        });

        console.log(`[OpenAI] Generated ${finalMatches.length} football predictions.`);

        // Enrich with logos from Sportmonks + Firestore team_assets
        const enrichedMatches = await enrichMatchesWithLogos(finalMatches, sportmonksLogoMap);

        await admin.firestore().collection('daily_predictions').doc(todayStr).set({
            status: 'completed',
            matches: enrichedMatches,
            generatedBy: 'openai',
            generatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        return { status: 'success', generated: enrichedMatches.length, matches: enrichedMatches };
    } catch (e) {
        console.error('[OpenAI] Football prediction error:', e.message);
        return { status: 'error', error: e.message };
    }
};

// ════════════════════════════════════════════════════════════════════════════
// 2. DAILY SEO BLOG
// ════════════════════════════════════════════════════════════════════════════
export const generateDailyBlogOpenAI = async () => {
    console.log('[OpenAI] Starting Daily Blog Generation...');
    try {
        const todayStr = getDateKey(0);
        const db = admin.firestore();

        // ── Load from BOTH collections in parallel ────────────────────────────
        const [footballSnap, basketballSnap] = await Promise.all([
            db.collection('daily_predictions').doc(todayStr).get(),
            db.collection('basketball_predictions').doc(todayStr).get(),
        ]);

        const footballMatches = (footballSnap.exists && footballSnap.data()?.matches) || [];
        const basketballMatches = (basketballSnap.exists && basketballSnap.data()?.matches) || [];

        const hasFootball = footballMatches.length > 0;
        const hasBasketball = basketballMatches.length > 0;

        if (!hasFootball && !hasBasketball) {
            console.warn('[OpenAI Blog] No football or basketball predictions found. Skipping.');
            return { status: 'skipped', reason: 'no_predictions_available' };
        }

        // ── Pick the best matches from each sport ─────────────────────────────
        const topFootball = footballMatches
            .filter(m => m.prediction_en)
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
            .slice(0, 5)
            .map(m => ({ ...m, sport: 'football' }));

        const topBasketball = basketballMatches
            .filter(m => m.prediction_en)
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
            .slice(0, 3)
            .map(m => ({ ...m, sport: 'basketball' }));

        const topMatches = [...topFootball, ...topBasketball];

        if (topMatches.length === 0) {
            console.warn('[OpenAI Blog] Predictions exist but none have AI analysis. Skipping.');
            return { status: 'skipped', reason: 'predictions_pending_analysis' };
        }

        const sportsAvailable = [
            hasFootball && topFootball.length > 0 ? 'Football' : null,
            hasBasketball && topBasketball.length > 0 ? 'Basketball' : null,
        ].filter(Boolean).join(' & ');

        const blogPrompt = `You are the Chief Editor for Vantage AI, a leading sports betting predictions platform in Africa (targeting Cameroon, Nigeria, Ghana; main platforms: 1xBet and Premier Bet).

Today is ${todayStr}. Our quantitative AI model identified top picks for: ${sportsAvailable}.

Top picks (JSON):
${JSON.stringify(topMatches, null, 2)}

Write an engaging, SEO-optimized daily sports betting blog post in French.
REQUIREMENTS:
1. H1 title: catchy, using keywords like "Pronostics", "1xBet", "Cameroun", "Coupon du jour", today's biggest teams. Cover: ${sportsAvailable}.
2. Brief 2-3 sentence hype introduction about today's betting schedule.
3. Top Picks: 3-5 matches with H2 headings (match name). Each: short paragraph explaining WHY (form, injuries, historical edge, pace stats for basketball). Label each clearly (⚽ Football or 🏀 Basketball).
4. Accumulator "Coupon du Jour": combine 2-3 safe picks with combined odds.
5. Closing: responsible gambling reminder.
6. Format: pure HTML using <h1>, <h2>, <p>, <ul>, <li>, <strong>. NO markdown. NO code fences. Start directly with the <h1> tag.`;

        const openai = getOpenAI();
        const rawHtml = await tryModels(openai, OPENAI_BLOG_MODELS, async (client, model) => {
            const resp = await client.responses.create({
                model,
                input: [{ role: 'user', content: blogPrompt }],
                temperature: 0.7,
            });
            const text = resp.output_text
                || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text
                || '';
            if (!text) throw new Error('Empty blog response');
            return text;
        }, 'Blog');

        // Strip accidental markdown code fences
        const blogHtml = rawHtml.replace(/^```html?\s*/i, '').replace(/\s*```$/i, '').trim();

        // Extract <h1> title for the blog index listing
        const titleMatch = blogHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const title = titleMatch
            ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
            : `Pronostics ${sportsAvailable} du ${todayStr} | Vantage AI`;

        const excerpt = blogHtml.replace(/<[^>]+>/g, '').substring(0, 160).trim() + '...';

        await db.collection('daily_blogs').doc(todayStr).set({
            title,
            content: blogHtml,
            excerpt,
            tags: [
                hasFootball ? 'football' : null,
                hasBasketball ? 'basketball' : null,
                'pronostics', 'cameroun', '1xbet',
            ].filter(Boolean),
            generatedAt: new Date().toISOString(),
            generatedBy: 'openai',
            updatedAt: new Date().toISOString(),
            footballCount: topFootball.length,
            basketballCount: topBasketball.length,
        });

        console.log(`[OpenAI Blog] ✅ Blog saved for ${todayStr} — ${topFootball.length} ⚽ + ${topBasketball.length} 🏀 picks (${blogHtml.length} chars)`);
        return {
            status: 'success',
            title,
            generatedLength: blogHtml.length,
            footballPicks: topFootball.length,
            basketballPicks: topBasketball.length,
        };
    } catch (e) {
        console.error('[OpenAI Blog] Error:', e.message);
        return { status: 'error', error: e.message };
    }
};

// ════════════════════════════════════════════════════════════════════════════
// 3. GRADE YESTERDAY'S PREDICTIONS
// ════════════════════════════════════════════════════════════════════════════
export const gradeYesterdayOpenAI = async (customDate = null, forceRegrade = false) => {
    const yesterday = customDate || getDateKey(1);
    console.log(`[OpenAI] Starting Grading for ${yesterday}... (Force: ${forceRegrade})`);
    try {
        const db = admin.firestore();
        const docSnap = await db.collection('daily_predictions').doc(yesterday).get();
        if (!docSnap.exists) return { status: 'skipped', reason: 'no_document', date: yesterday };

        const existingMatches = docSnap.data()?.matches || [];
        if (existingMatches.length === 0) return { status: 'skipped', reason: 'empty_matches', date: yesterday };

        const matchesToGrade = forceRegrade
            ? existingMatches
            : existingMatches.filter(m => !m.status || m.status === 'pending');

        if (matchesToGrade.length === 0) {
            return { status: 'skipped', reason: 'already_graded', total: existingMatches.length, date: yesterday };
        }

        console.log(`[OpenAI Grading] Grading ${matchesToGrade.length} matches for ${yesterday}...`);

        // Step 1: Fetch official scores from Sportmonks
        let rawScores = '';
        let missingIds = [];

        try {
            const smFixtures = await fetchSportmonksForDate(yesterday);
            for (const m of matchesToGrade) {
                const found = smFixtures.find(f => {
                    const home = f.participants?.find(p => p.meta?.location === 'home');
                    const away = f.participants?.find(p => p.meta?.location === 'away');
                    return String(f.id) === String(m.id) ||
                        (home?.name === m.homeTeam && away?.name === m.awayTeam);
                });
                const home = found?.participants?.find(p => p.meta?.location === 'home');
                const away = found?.participants?.find(p => p.meta?.location === 'away');
                const state = found?.state?.state || '';
                const isFinished = ['FT', 'AET', 'PEN'].includes(state);
                const isCancelled = ['CANCL', 'POSTP', 'INT'].includes(state);

                if (found && isFinished) {
                    const hGoals = found.scores?.find(s => s.participant_id === home?.id && s.description === 'CURRENT')?.score?.goals ?? '?';
                    const aGoals = found.scores?.find(s => s.participant_id === away?.id && s.description === 'CURRENT')?.score?.goals ?? '?';
                    rawScores += `Match ID: ${m.id} | ${m.homeTeam} ${hGoals} - ${aGoals} ${m.awayTeam}\n`;
                } else if (found && isCancelled) {
                    rawScores += `Match ID: ${m.id} | ${m.homeTeam} vs ${m.awayTeam} | Status: Postponed/Cancelled\n`;
                } else {
                    missingIds.push({ id: m.id, home: m.homeTeam, away: m.awayTeam });
                }
            }
        } catch (err) {
            console.warn(`[OpenAI Grading] Sportmonks fetch failed: ${err.message}. Using web search for all.`);
            missingIds = matchesToGrade.map(m => ({ id: m.id, home: m.homeTeam, away: m.awayTeam }));
        }

        // Step 2: Use OpenAI web search for missing scores
        if (missingIds.length > 0) {
            console.log(`[OpenAI Grading] Fetching ${missingIds.length} missing scores via web search...`);
            const openai = getOpenAI();
            try {
                const searchText = await tryModels(openai, OPENAI_GRADING_MODELS, async (client, model) => {
                    const resp = await client.responses.create({
                        model,
                        tools: [{ type: 'web_search_preview' }],
                        input: `Find the FINAL full-time scores for these football matches played on ${yesterday}. List each with its exact score:\n${JSON.stringify(missingIds)}`,
                        temperature: 0.1,
                    });
                    return resp.output_text || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text || '';
                }, 'Grading-Search');
                rawScores += '\n[WEB SEARCH SCORES]\n' + searchText;
            } catch (searchErr) {
                console.warn(`[OpenAI Grading] Web search failed: ${searchErr.message}`);
                if (!rawScores) throw new Error('Could not fetch scores from Sportmonks or web search');
            }
        }

        // Step 3: Grade predictions using raw scores
        const gradingPrompt = `Grade these football predictions using the exact final scores below.
You MUST return a result for EVERY prediction in the list, even if the score is unknown (use status "void" in that case).

PREDICTIONS:
${JSON.stringify(matchesToGrade.map(m => ({ id: m.id, home: m.homeTeam, away: m.awayTeam, prediction: m.prediction_en || m.prediction })), null, 2)}

SCORES RETRIEVED:
${rawScores}

GRADING RULES (apply strictly):
- Use FULL-TIME (90 min + stoppage) scores only.
- If postponed/cancelled/no result → status: "void".
- Match by home/away team name if the ID is not found in scores.

MATCH RESULT: "Home Win" → home > away. "Away Win" → away > home. "Draw" → equal.
DOUBLE CHANCE: "Double Chance (1X)" → won if home wins OR draw. "Double Chance (X2)" → won if away wins OR draw. "Double Chance (12)" → won if home OR away wins (not draw).
DRAW NO BET: "Draw No Bet (Home)" → won if home wins; void if draw; lost if away wins.
             "Draw No Bet (Away)" → won if away wins; void if draw; lost if home wins.
GOALS: "Over X.5" → total goals > X. "Under X.5" → total goals < X+1.
BTTS: "Both Teams Score" → both scored >=1. "Both Teams Score - No" → one team scored 0.
"BTTS & Over 2.5" → both scored AND total >= 3. "BTTS & Under 3.5" → both scored AND total <= 3.
WIN TO NIL: "Home Win to Nil" → home wins AND away scored 0. "Away Win to Nil" → away wins AND home scored 0.
CLEAN SHEET: "Home Clean Sheet" → away scored 0. "Away Clean Sheet" → home scored 0.
HANDICAP: Apply handicap to team score then evaluate. E.g. "Home -1" on 2-1 → 1-1 → lost.

Return ONLY a valid JSON array. Each object: { "id": string, "score": "H-A" (or "?" if unknown), "status": "won"|"lost"|"void" }.
Do NOT skip any match — return an entry for all ${matchesToGrade.length} predictions.`;


        const openai = getOpenAI();
        const gradeText = await tryModels(openai, OPENAI_GRADING_MODELS, async (client, model) => {
            const resp = await client.responses.create({
                model,
                input: gradingPrompt,
                temperature: 0,
            });
            return resp.output_text || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text || '';
        }, 'Grading-Parse');

        const gradedResults = safeJSON(gradeText, []);
        if (gradedResults.length === 0) throw new Error('OpenAI returned empty grading results');

        // Step 4: Merge grades back
        // Primary key: ID. Secondary key: homeTeam+awayTeam name, for AI-search matches with custom IDs.
        let updatesCount = 0;
        const gradedMap = new Map(gradedResults.map(g => [String(g.id), g]));

        const updatedMatches = existingMatches.map(m => {
            let grade = gradedMap.get(String(m.id));
            if (!grade) {
                grade = gradedResults.find(g =>
                    g.home?.toLowerCase() === m.homeTeam?.toLowerCase() &&
                    g.away?.toLowerCase() === m.awayTeam?.toLowerCase()
                );
            }
            if (grade) { updatesCount++; return { ...m, score: grade.score || 'N/A', status: grade.status }; }
            return m;
        });

        await db.collection('daily_predictions').doc(yesterday).set({
            matches: updatedMatches,
            gradedAt: new Date().toISOString(),
            gradedBy: 'openai',
            updatedAt: new Date().toISOString()
        }, { merge: true });

        console.log(`[OpenAI Grading] ✅ Graded ${updatesCount}/${existingMatches.length} matches for ${yesterday}.`);
        return { status: 'success', total: existingMatches.length, graded: updatesCount, saved: true, date: yesterday };
    } catch (e) {
        console.error('[OpenAI Grading] Error:', e.message);
        return { status: 'error', error: e.message };
    }
};

// ════════════════════════════════════════════════════════════════════════════
// 4. BASKETBALL PREDICTIONS
// ════════════════════════════════════════════════════════════════════════════
export const generateBasketballPredictionsOpenAI = async () => {
    console.log('[OpenAI] Starting Basketball Predictions...');
    try {
        const todayStr = getDateKey(0);
        const openai = getOpenAI();

        // Slim basketball prompt — logos/fr-translations/avgConceded removed to stay within token budget
        const systemPrompt = `You are the "Quant-Desk Basketball Engine v2.0", an elite global basketball betting model with access to real-time data.

RULES (NON-NEGOTIABLE):
1. EV = (probability × decimal odds) − 1. Only pick if EV ≥ +0.06.
2. CONFIDENCE FLOOR: ≥ 70%. Use team form (last 5), home/away record, injury reports, pace stats.
3. ONE market per match from: "Home Win", "Away Win", "Over [X] Points", "Under [X] Points", "Handicap: Home -[X.5]", "Handicap: Away -[X.5]".
4. 'category': "safe" if confidence ≥ 80, "value" if 70–79, "risky" if < 70.

Output ONLY a compact JSON array (no whitespace/indentation). Each object must have EXACTLY:
id, homeTeam, awayTeam, league, time, prediction_en, prediction, confidence, odds, category, analysis_en,
homeForm, awayForm, homeWinRate, awayWinRate, homeAvgScored, awayAvgScored,
h2hHomeWins, h2hAwayWins, h2hDraws, homeInjured, awayInjured, sport, status

DO NOT include: homeTeamLogo, awayTeamLogo, prediction_fr, analysis_fr, homeAvgConceded, awayAvgConceded, homeCleanSheetRate, awayCleanSheetRate, h2hLast5Goals.
Keeping the output compact is CRITICAL to avoid truncation.`;

        const userPrompt = `DATE: ${todayStr}

LEAGUE PRIORITY (African basketball betting volume):
1. NBA (HIGHEST)
2. EuroLeague / EuroCup
3. WNBA, G-League (when NBA off-season)
4. NBB (Brazil), ACB (Spain), LNB Pro A (France), Bundesliga Basketball
5. BAL (Basketball Africa League), FIBA tournaments (when in season)

Use web search to find basketball games scheduled for ${todayStr} worldwide.
Analyze and identify EXACTLY 12 high-value betting opportunities.
'id' format: "bball-YYYYMMDD-HomeTeamSlug-AwayTeamSlug"
'sport': "basketball", 'status': "pending"
'analysis_en': "EV: +X.X% | Edge: Y% | [max 15 words]"
Output ONLY the raw compact JSON array. No markdown, no preamble.`;

        const responseText = await tryModels(openai, OPENAI_BASKETBALL_MODELS, async (client, model) => {
            const resp = await client.responses.create({
                model,
                tools: [{ type: 'web_search_preview' }],
                input: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.15,
                max_output_tokens: 16384,
            });
            if (resp.incomplete_details?.reason === 'max_tokens' || resp.status === 'incomplete') {
                console.warn(`[OpenAI Basketball] ⚠️ Response truncated (max_tokens hit) with ${model}. Will attempt recovery.`);
            }
            const text = resp.output_text
                || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text
                || resp.output?.find(o => o.type === 'message')?.content?.[0]?.text
                || '';
            if (!text) throw new Error('Empty basketball response');
            return text;
        }, 'Basketball');

        let predictions = safeJSON(responseText, []);

        // ── Fallback: If web search returned empty/truncated, retry with pure AI simulation ──
        if (!Array.isArray(predictions) || predictions.length === 0) {
            console.warn('[OpenAI Basketball] Search returned no predictions. Trying AI simulation fallback...');
            try {
                const simText = await tryModels(openai, OPENAI_BASKETBALL_MODELS, async (client, model) => {
                    const resp = await client.responses.create({
                        model,
                        // No web_search tool — pure model knowledge
                        input: [
                            { role: 'system', content: systemPrompt }, // reuse slim prompt
                            { role: 'user', content: `DATE: ${todayStr}\n\nSEARCH TOOL UNAVAILABLE. Use your training knowledge of NBA/EuroLeague/international schedules to generate EXACTLY 12 basketball match predictions for ${todayStr}.\nApply the same EV safety filter (EV ≥ 6%, confidence ≥ 70%).\n'id' format: "bball-${todayStr}-HomeSlug-AwaySlug"\nOutput ONLY the raw compact JSON array. No markdown.` }
                        ],
                        temperature: 0.7,
                        max_output_tokens: 16384,
                    });
                    if (resp.incomplete_details?.reason === 'max_tokens' || resp.status === 'incomplete') {
                        console.warn(`[OpenAI Basketball Sim] ⚠️ Simulation truncated with ${model}. Will attempt partial recovery.`);
                    }
                    const text = resp.output_text
                        || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text
                        || resp.output?.find(o => o.type === 'message')?.content?.[0]?.text
                        || '';
                    if (!text) throw new Error('Empty simulation response');
                    return text;
                }, 'Basketball-Simulation');
                predictions = safeJSON(simText, []);
                if (Array.isArray(predictions) && predictions.length > 0) {
                    console.log(`[OpenAI Basketball Simulation] ✅ Got ${predictions.length} simulated predictions.`);
                }
            } catch (simErr) {
                console.warn(`[OpenAI Basketball Simulation] Failed: ${simErr.message}`);
            }
        }

        if (!Array.isArray(predictions) || predictions.length === 0) {
            console.warn('[OpenAI Basketball] Basketball predictions array is empty. Returning error to trigger Gemini fallback.');
            return { status: 'error', error: 'no_predictions_returned' };
        }

        const normalised = predictions.map(p => ({
            ...p,
            sport: 'basketball',
            status: p.status || 'pending',
            homeTeamLogo: p.homeTeamLogo || '',
            awayTeamLogo: p.awayTeamLogo || '',
            prediction: p.prediction || p.prediction_en,
            generatedBy: 'openai',
        }));

        // Enrich basketball matches with logos from Firestore team_assets
        // Basketball doesn't use Sportmonks so pass an empty logo map
        const enrichedBasketball = await enrichMatchesWithLogos(normalised, new Map());

        await admin.firestore().collection('basketball_predictions').doc(todayStr).set({
            matches: enrichedBasketball,
            generatedBy: 'openai',
            generatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        console.log(`[OpenAI Basketball] ✅ ${enrichedBasketball.length} predictions saved for ${todayStr}.`);
        return { status: 'success', generated: normalised.length, matches: normalised };
    } catch (e) {
        console.error('[OpenAI Basketball] Error:', e.message);
        return { status: 'error', error: e.message };
    }
};

// ════════════════════════════════════════════════════════════════════════════
// 5. SMART ACCUMULATORS (Auto-runs after football predictions are saved)
// ════════════════════════════════════════════════════════════════════════════
/**
 * Reads today's AI-generated football predictions from Firestore and builds
 * 3 professionally constructed accumulator tickets (safe / medium / high).
 *
 * Designed like an experienced sportsbook quant:
 *   - SAFE  : 2-3 bankers, combined odds 1.60-2.50, Double Chance / DNB priority
 *   - MEDIUM: 3-5 balanced picks, combined odds 3.00-7.00
 *   - HIGH  : 4-6 high-EV, high-variance plays, combined odds 10.00+
 *
 * Each match ID appears in EXACTLY ONE of the three portfolios (mutual exclusivity).
 * Saved to Firestore daily_predictions doc as the `accumulators` field.
 */
export const generateAccumulatorsOpenAI = async () => {
    console.log('[OpenAI Accumulators] Starting Smart Accumulator Generation...');
    try {
        const todayStr = getDateKey(0);
        const db = admin.firestore();

        // Load today's football predictions
        const docSnap = await db.collection('daily_predictions').doc(todayStr).get();
        if (!docSnap.exists) {
            console.warn('[OpenAI Accumulators] No predictions doc found for today. Skipping.');
            return { status: 'skipped', reason: 'no_predictions' };
        }

        const allMatches = docSnap.data()?.matches || [];

        // Filter: only AI-analyzed football matches with real predictions
        const eligible = allMatches
            .filter(m => m.prediction_en && m.confidence >= 68 && m.sport !== 'basketball')
            .filter(m => {
                const analysis = (m.analysis_en || '').toLowerCase();
                return !analysis.startsWith('uncertain') &&
                    !analysis.includes('market mixed') &&
                    !analysis.includes('data confidence insufficient');
            });

        if (eligible.length < 3) {
            console.warn(`[OpenAI Accumulators] Only ${eligible.length} eligible match(es) — need at least 3. Skipping.`);
            return { status: 'skipped', reason: 'insufficient_matches' };
        }

        // Slim down data sent to GPT — only what it needs for portfolio decisions
        const pool = eligible.map(m => ({
            id: m.id,
            match: `${m.homeTeam} vs ${m.awayTeam}`,
            league: m.league,
            prediction: m.prediction_en,
            confidence: m.confidence,
            odds: m.odds,
            category: m.category,
            analysis: m.analysis_en,
        }));

        const systemPrompt = `You are the "Quant-Desk Senior Portfolio Manager" for Vantage AI — an elite sports betting analytics platform.
Your job is to construct 3 mutually exclusive accumulator tickets from a pre-screened pool of AI-analyzed football picks.

You think like a professional sportsbook quantitative analyst:
- You minimize correlation risk (two teams from the same match, same league overrepresentation, etc.)
- You prioritize capital preservation on the SAFE ticket
- You maximize expected value on the HIGH ticket while accepting variance
- You NEVER repeat a match ID across portfolios`;

        const userPrompt = `TODAY: ${todayStr}

PRE-QUALIFIED MATCH POOL (all passed confidence ≥ 68% and EV filter):
${JSON.stringify(pool, null, 2)}

═══════════════════════════════════════════════
BUILD 3 ACCUMULATOR PORTFOLIOS
═══════════════════════════════════════════════

PORTFOLIO 1 — "SAFE" (Capital Preservation / Banker Ticket)
• Purpose: Protect bankroll. Win rate priority over return.
• Selection: The 2–3 HIGHEST confidence picks. Prefer Double Chance, DNB, Over 1.5 Goals markets.
• Target combined odds: 1.60 – 2.80
• Max 1 match per league.
• Do NOT include any "risky" category picks.

PORTFOLIO 2 — "MEDIUM" (Balanced Compounder)
• Purpose: Steady growth. Confidence + EV balanced.
• Selection: The next 3–5 best picks (70–79% confidence range preferred). Include one or two "value" category picks if EV is strong.
• Target combined odds: 3.00 – 8.00
• Max 2 matches per league.

PORTFOLIO 3 — "HIGH" (High Variance / Jackpot Ticket — Smallest Stake)
• Purpose: Maximum payout potential. Accept variance.
• Selection: The remaining 4–6 picks with highest EV (%EV from analysis_en). Risky category allowed here.
• Target combined odds: 10.00+
• Diversify across at least 3 different leagues.

CRITICAL RULES:
1. MUTUAL EXCLUSIVITY: Each match ID may appear in ONLY ONE portfolio. No repeats.
2. If a tier cannot be filled (e.g. not enough matches), return empty array [] for that tier.
3. Return ONLY a valid JSON object — no explanation, no markdown:

{
  "safe": ["id_1", "id_2"],
  "medium": ["id_3", "id_4", "id_5"],
  "high": ["id_6", "id_7", "id_8", "id_9"]
}`;

        const openai = getOpenAI();
        const responseText = await tryModels(openai, OPENAI_ACCUMULATOR_MODELS, async (client, model) => {
            const resp = await client.responses.create({
                model,
                input: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.1, // Strictly deterministic portfolio construction
            });
            const text = resp.output_text
                || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text
                || '';
            if (!text) throw new Error('Empty accumulator response');
            return text;
        }, 'Accumulators');

        const result = safeJSON(responseText, {});

        // Validate result IDs are actually in the pool
        const validIds = new Set(eligible.map(m => m.id));
        const filterIds = (ids) => (Array.isArray(ids) ? ids.filter(id => validIds.has(id)) : []);

        const accumulators = {
            safe: filterIds(result.safe),
            medium: filterIds(result.medium),
            high: filterIds(result.high),
        };

        // Enforce mutual exclusivity (remove duplicates across tiers)
        const seen = new Set();
        for (const tier of ['safe', 'medium', 'high']) {
            accumulators[tier] = accumulators[tier].filter(id => {
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
        }

        // If GPT returned nothing useful, use confidence-sorted fallback
        const totalPicks = accumulators.safe.length + accumulators.medium.length + accumulators.high.length;
        if (totalPicks === 0) {
            console.warn('[OpenAI Accumulators] GPT returned empty result — using confidence-sorted fallback.');
            const sorted = [...eligible].sort((a, b) => b.confidence - a.confidence);
            const usedIds = new Set();
            const take = (n) => sorted.filter(m => !usedIds.has(m.id)).slice(0, n).map(m => { usedIds.add(m.id); return m.id; });
            accumulators.safe = take(2);
            accumulators.medium = take(4);
            accumulators.high = take(5);
        }

        // Save back to the same daily_predictions doc (merged)
        await db.collection('daily_predictions').doc(todayStr).set({
            accumulators,
            accumulatorsGeneratedAt: new Date().toISOString(),
            accumulatorsGeneratedBy: 'openai',
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        const total = accumulators.safe.length + accumulators.medium.length + accumulators.high.length;
        console.log(`[OpenAI Accumulators] ✅ Saved for ${todayStr}: safe=${accumulators.safe.length}, medium=${accumulators.medium.length}, high=${accumulators.high.length}`);
        return { status: 'success', generated: total, accumulators };
    } catch (e) {
        console.error('[OpenAI Accumulators] Error:', e.message);
        return { status: 'error', error: e.message };
    }
};
