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

// ── Model chains ──────────────────────────────────────────────────────────────
const OPENAI_PREDICTION_MODELS = ['gpt-4o', 'gpt-4o-mini'];
const OPENAI_BLOG_MODELS = ['gpt-4o', 'gpt-4o-mini'];
const OPENAI_GRADING_MODELS = ['gpt-4o-mini', 'gpt-4o'];
const OPENAI_BASKETBALL_MODELS = ['gpt-4o', 'gpt-4o-mini'];

// ── SDK instance ──────────────────────────────────────────────────────────────
const getOpenAI = () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Missing OPENAI_API_KEY environment variable on server');
    return new OpenAI({ apiKey: key });
};

// ── Date helpers ──────────────────────────────────────────────────────────────
const getDateKey = (daysAgo = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Helper: JSON parse with fallback ──────────────────────────────────────────
const safeJSON = (text, fallback = []) => {
    if (!text) return fallback;
    try {
        // Strip markdown code fence if present
        const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
        return JSON.parse(cleaned);
    } catch {
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

// ── Sportmonks fixtures (reused from existing geminiService pattern) ───────────
const fetchSportmonksForDate = async (dateStr) => {
    const token = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
    try {
        const url = `https://api.sportmonks.com/v3/football/fixtures/date/${dateStr}?include=league;participants;scores&api_token=${token}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json.data) ? json.data : [];
    } catch {
        return [];
    }
};

// ════════════════════════════════════════════════════════════════════════════
// 1. DAILY FOOTBALL PREDICTIONS
// ════════════════════════════════════════════════════════════════════════════
export const generateDailyPredictionsOpenAI = async () => {
    console.log('[OpenAI] Starting Daily Football Predictions...');
    try {
        const todayStr = getDateKey(0);

        // Fetch fixtures from Sportmonks for context
        const rawData = await fetchSportmonksForDate(todayStr);
        const fixtures = rawData.map(item => {
            const home = item.participants?.find(p => p.meta?.location === 'home') || {};
            const away = item.participants?.find(p => p.meta?.location === 'away') || {};
            return {
                id: String(item.id),
                league: item.league?.name || 'Unknown',
                homeTeam: home.name || 'Home',
                awayTeam: away.name || 'Away',
                time: item.starting_at || todayStr,
            };
        });

        // Save raw fixtures placeholder
        if (fixtures.length > 0) {
            await admin.firestore().collection('daily_predictions').doc(todayStr).set({
                rawFixtures: fixtures,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        const systemPrompt = `You are the "Quant-Desk Decision Engine v6.0", an elite global sports betting model. You have access to real-time sports data via web search.

RULES (NON-NEGOTIABLE):
1. EV = (probability × decimal odds) − 1. Only pick if EV ≥ +0.06 (6% edge minimum).
2. CONFIDENCE FLOOR: ≥ 72%. Use current team form, H2H records, injury reports, xG, market odds.
3. ONE market per match. Choose from: "Home Win", "Away Win", "Draw", "Double Chance (1X)", "Double Chance (X2)", "Double Chance (12)", "Draw No Bet (Home)", "Draw No Bet (Away)", "Over 1.5 Goals", "Over 2.5 Goals", "Both Teams Score", "Both Teams Score - No".
4. 'category': "safe" if confidence ≥ 80, "value" if 70–79, "risky" if < 70.
5. 'analysis_en' format: "EV: +X.X% | Edge: Y% | [max 20 words of reasoning]"

Output ONLY a valid JSON array. No markdown, no preamble. Each object must have exactly these fields:
id, prediction_en, prediction_fr, confidence, odds, category, analysis_en, analysis_fr,
homeForm, awayForm, homeWinRate, awayWinRate, homeAvgScored, awayAvgScored,
homeAvgConceded, awayAvgConceded, homeCleanSheetRate, awayCleanSheetRate,
h2hHomeWins, h2hAwayWins, h2hDraws, h2hLast5Goals, homeInjured, awayInjured`;

        const userPrompt = `DATE: ${todayStr}

LEAGUE PRIORITY (African betting volume):
1. English Premier League + UEFA Champions League (HIGHEST)
2. La Liga, Serie A, Bundesliga, UEFA Europa League
3. Ligue 1, Primeira Liga, Conference League
4. Eredivisie, Championship, Turkish Süper Lig, MLS, Brazilian Série A
5. AFCON, CAF Champions League, big African derbies

TODAY'S FIXTURES FROM SPORTMONKS (supplement with web search for more matches):
${JSON.stringify(fixtures.slice(0, 30), null, 2)}

Search for additional matches today. Identify and analyze 15–20 high-quality betting opportunities using your quantitative model. Use the same 'id' from the fixtures above where possible; for new matches found via search, generate a unique id like "search-home-away-date".`;

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
            });
            // Extract text from response
            const text = resp.output_text || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text || '';
            if (!text) throw new Error('Empty response from OpenAI');
            return text;
        }, 'Predictions');

        const predictions = safeJSON(responseText, []);

        if (!Array.isArray(predictions) || predictions.length === 0) {
            throw new Error('OpenAI returned empty predictions array');
        }

        // Merge predictions with fixture data
        const fixtureMap = new Map(fixtures.map(f => [f.id, f]));
        const finalMatches = predictions.map(pred => {
            const fixture = fixtureMap.get(pred.id) || fixtureMap.get(String(pred.id));
            return {
                sport: 'football',
                status: 'pending',
                homeTeamLogo: '',
                awayTeamLogo: '',
                ...fixture,
                ...pred,
                prediction: pred.prediction_en || pred.prediction,
                generatedBy: 'openai',
            };
        }).filter(m => m.prediction_en || m.prediction);

        console.log(`[OpenAI] Generated ${finalMatches.length} football predictions.`);

        await admin.firestore().collection('daily_predictions').doc(todayStr).set({
            status: 'completed',
            matches: finalMatches,
            generatedBy: 'openai',
            updatedAt: new Date().toISOString()
        }, { merge: true });

        return { status: 'success', generated: finalMatches.length, matches: finalMatches };
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

        const docSnap = await admin.firestore().collection('daily_predictions').doc(todayStr).get();
        if (!docSnap.exists) return { status: 'skipped', reason: 'no_predictions' };

        const matches = docSnap.data()?.matches || [];
        if (matches.length === 0) return { status: 'skipped', reason: 'empty_predictions' };

        const topMatches = matches
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
            .slice(0, 8);

        const blogPrompt = `You are the Chief Editor for Vantage AI, a leading sports betting predictions platform in Africa (targeting Cameroon, Nigeria, Ghana; main platforms: 1xBet and Premier Bet).

Today is ${todayStr}. Our quantitative AI model identified these top fixtures:

${JSON.stringify(topMatches, null, 2)}

Write an engaging, SEO-optimized daily sports betting blog post in French.
REQUIREMENTS:
1. H1 title: catchy, using keywords like "Pronostics", "1xBet", "Cameroun", "Coupon du jour", today's biggest teams.
2. Brief hype introduction (2-3 sentences) about today's football schedule.
3. Top Picks: 3-4 matches with H2 headings (match name). Each: short paragraph explaining WHY (form, injuries, historical edge).
4. Accumulator "Coupon du Jour": combine 3 safe picks with combined odds.
5. Closing: responsible gambling reminder.
6. Format: pure HTML using <h1>, <h2>, <p>, <ul>, <li>, <strong>. NO markdown. NO code fences. Return only valid HTML.`;

        const openai = getOpenAI();
        const blogHtml = await tryModels(openai, OPENAI_BLOG_MODELS, async (client, model) => {
            const resp = await client.responses.create({
                model,
                input: [{ role: 'user', content: blogPrompt }],
                temperature: 0.7,
            });
            const text = resp.output_text || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text || '';
            if (!text) throw new Error('Empty blog response');
            return text;
        }, 'Blog');

        const excerpt = blogHtml.replace(/<[^>]+>/g, '').substring(0, 150).trim() + '...';

        await admin.firestore().collection('daily_blogs').doc(todayStr).set({
            content: blogHtml,
            excerpt,
            generatedBy: 'openai',
            updatedAt: new Date().toISOString()
        });

        console.log(`[OpenAI] ✅ Blog saved for ${todayStr} (${blogHtml.length} chars)`);
        return { status: 'success', generatedLength: blogHtml.length };
    } catch (e) {
        console.error('[OpenAI] Blog generation error:', e.message);
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

PREDICTIONS:
${JSON.stringify(matchesToGrade.map(m => ({ id: m.id, home: m.homeTeam, away: m.awayTeam, prediction: m.prediction_en || m.prediction })), null, 2)}

SCORES RETRIEVED:
${rawScores}

GRADING RULES (apply strictly):
- Use FULL-TIME (90 min + stoppage) scores only.
- If postponed/cancelled/no result → status: "void".

MATCH RESULT: "Home Win" → home > away. "Away Win" → away > home. "Draw" → equal.
DOUBLE CHANCE: "1X" → home wins OR draw. "X2" → away wins OR draw. "12" → not draw.
DRAW NO BET: "Home" → won if home wins; void if draw; lost if away wins.
           "Away" → won if away wins; void if draw; lost if home wins.
GOALS: "Over X.5" → total goals > X. "Under X.5" → total goals < X+1.
BTTS: "Both Teams Score" → both scored ≥1. "Both Teams Score - No" → one team scored 0.

Return ONLY a valid JSON array. Each object: { "id": string, "score": "H-A", "status": "won"|"lost"|"void" }`;

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
        let updatesCount = 0;
        const updatedMatches = existingMatches.map(m => {
            const grade = gradedResults.find(g => g.id === m.id || g.id === String(m.id));
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

        const systemPrompt = `You are the "Quant-Desk Basketball Engine v2.0", an elite global basketball betting model with access to real-time data.

RULES (NON-NEGOTIABLE):
1. EV = (probability × decimal odds) − 1. Only pick if EV ≥ +0.06.
2. CONFIDENCE FLOOR: ≥ 70%. Use team form (last 5), home/away record, injury reports, pace stats.
3. ONE market per match from: "Home Win", "Away Win", "Over [X] Points", "Under [X] Points", "Handicap: Home -[X.5]", "Handicap: Away -[X.5]".
4. 'category': "safe" if confidence ≥ 80, "value" if 70–79, "risky" if < 70.

Output ONLY a valid JSON array with no markdown. Each object must have:
id, homeTeam, awayTeam, league, time, prediction_en, prediction_fr, prediction,
confidence, odds, category, analysis_en, analysis_fr,
homeForm, awayForm, homeWinRate, awayWinRate, homeAvgScored, awayAvgScored,
homeAvgConceded, awayAvgConceded, homeCleanSheetRate, awayCleanSheetRate,
h2hHomeWins, h2hAwayWins, h2hDraws, h2hLast5Goals,
homeInjured, awayInjured, homeTeamLogo, awayTeamLogo, sport, status`;

        const userPrompt = `DATE: ${todayStr}

LEAGUE PRIORITY (African basketball betting volume):
1. NBA (HIGHEST)
2. EuroLeague / EuroCup
3. WNBA, G-League (when NBA off-season)
4. NBB (Brazil), ACB (Spain), LNB Pro A (France), Bundesliga Basketball
5. BAL (Basketball Africa League), FIBA tournaments (when in season)

Use web search to find ALL basketball games scheduled for ${todayStr} worldwide.
Analyze and identify 10–15 high-value betting opportunities.
'id' format: "bball-YYYYMMDD-HomeTeamSlug-AwayTeamSlug"
'sport': "basketball", 'status': "pending", homeTeamLogo/awayTeamLogo: ""
'time': match time HH:MM format
'analysis_en': "EV: +X.X% | Edge: Y% | [max 20 words]"`;

        const responseText = await tryModels(openai, OPENAI_BASKETBALL_MODELS, async (client, model) => {
            const resp = await client.responses.create({
                model,
                tools: [{ type: 'web_search_preview' }],
                input: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.15,
            });
            const text = resp.output_text || resp.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text || '';
            if (!text) throw new Error('Empty basketball response');
            return text;
        }, 'Basketball');

        const predictions = safeJSON(responseText, []);
        if (!Array.isArray(predictions) || predictions.length === 0) {
            return { status: 'skipped', reason: 'no_predictions_returned' };
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

        await admin.firestore().collection('basketball_predictions').doc(todayStr).set({
            matches: normalised,
            generatedBy: 'openai',
            generatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        console.log(`[OpenAI Basketball] ✅ ${normalised.length} predictions saved for ${todayStr}.`);
        return { status: 'success', generated: normalised.length, matches: normalised };
    } catch (e) {
        console.error('[OpenAI Basketball] Error:', e.message);
        return { status: 'error', error: e.message };
    }
};
