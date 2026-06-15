import cron from 'node-cron';
import admin from 'firebase-admin';

// ── Quant Engine (pure statistical — no AI/LLM) ───────────────────────────────
import { runQuantPipeline, runQuantGrading, runQuantPerformance, runBasketballPipeline, runCricketPipeline } from './quantService.js';

// ── Blog Generator (programmatic — no AI) ───────────────────────────────
import { triggerBlogGeneration } from './blogGenerator.js';

import { checkRecentSelarEmails } from './gmailListener.js';
import { sendDailyPredictionsToTelegram } from './telegramService.js';
import { seedStaticData } from './staticDataSeeder.js';

/**
 * Standalone accumulator trigger (Quant Engine based)
 */
export const triggerAccumulatorGeneration = async () => {
    try {
        // BUG-6 FIX: runQuantPipeline only accepts 2 params. The 3rd arg was silently ignored.
        // Accumulators are already generated as part of the full pipeline, so just call it normally.
        const result = await runQuantPipeline(null, false);
        if (result && result.status === 'success') {
            console.log(`[Scheduler] ✅ Accumulators generated: safe=${result.accumulators?.safe?.length}, medium=${result.accumulators?.medium?.length}, high=${result.accumulators?.high?.length}`);
        } else {
            console.warn(`[Scheduler] ⏭️ Accumulators skipped: ${result?.reason || result?.error}`);
        }
        return result;
    } catch (e) {
        console.error('[Scheduler] Accumulator generation error:', e.message);
        return { status: 'error', error: e.message };
    }
};

// ── Admin trigger helpers (used by server.js admin endpoints) ─────────────────

// ── Quant Engine Triggers ─────────────────────────────────────────────────────

/**
 * Run the quantitative statistical pipeline (Poisson + Elo + Form).
 * No AI/LLM involved — pure math models.
 */
export const triggerQuantPipeline = async (dateStr = null, dryRun = false) => {
    try {
        const result = await runQuantPipeline(dateStr, dryRun);
        if (result && result.status === 'success') {
            console.log(`[Scheduler] ✅ Quant Pipeline done: ${result.generated} bets from ${result.matches_analyzed} matches.`);
        } else {
            console.warn(`[Scheduler] ⚠️ Quant Pipeline: ${result?.status} — ${result?.reason || result?.error}`);
        }
        return result;
    } catch (e) {
        console.error('[Scheduler] Quant Pipeline error:', e.message);
        return { status: 'error', error: e.message };
    }
};

/** Grade yesterday's quant predictions using Sportmonks results. */
export const triggerQuantGrading = async (dateStr = null) => {
    try {
        const result = await runQuantGrading(dateStr);
        const emoji = (result?.graded ?? 0) > 0 ? '✅' : '⚠️';
        console.log(`[Scheduler] ${emoji} Quant Grading: ${result?.graded ?? 0} bets graded.`);
        return result;
    } catch (e) {
        console.error('[Scheduler] Quant Grading error:', e.message);
        return { status: 'error', error: e.message };
    }
};

/** Recompute quant performance analytics (ROI, win rate, CLV). */
export const triggerQuantPerformance = async () => {
    try {
        const result = await runQuantPerformance();
        console.log('[Scheduler] ✅ Quant Performance updated.');
        return result;
    } catch (e) {
        console.error('[Scheduler] Quant Performance error:', e.message);
        return { status: 'error', error: e.message };
    }
};

/**
 * Football generation — Quant Engine only (no AI/LLM)
 */
export const triggerFootballGeneration = async () => {
    console.log('[Scheduler] ⚽ Running Football Generation via Quant Engine...');
    try {
        const result = await runQuantPipeline();
        if (result && result.status === 'success') {
            // SCH-1 FIX: Accumulators are already generated inside runQuantPipeline — do NOT call
            // triggerAccumulatorGeneration() here as that would run the full pipeline a SECOND
            // time, doubling Sportmonks API usage and potentially overwriting good results.
            console.log(`[Scheduler] ✅ Quant Pipeline done (accumulators included): ${result.generated} bets from ${result.matches_analyzed} matches.`);
        } else {
            console.warn(`[Scheduler] ⚠️ Quant Pipeline: ${result?.status} — ${result?.reason || result?.error}`);
        }
        return result;
    } catch (e) {
        console.error('[Scheduler] Football generation error:', e.message);
        return { status: 'error', error: e.message };
    }
};

/**
 * Basketball: Quant Pipeline only (no AI/LLM fallback)
 */
export const triggerBasketballGeneration = async () => {
    console.log('[Scheduler] 🏀 Running Basketball Quant Pipeline...');
    try {
        const result = await runBasketballPipeline();
        if (result && result.status === 'success') {
            console.log(`[Scheduler] ✅ Basketball Quant done: ${result.generated} bets from ${result.matches_analyzed} games.`);
            return result;
        }
        console.warn(`[Scheduler] ⚠️ Basketball Quant: ${result?.status} — ${result?.reason || result?.error}`);
        return { status: 'skipped', reason: result?.status };
    } catch (e) {
        console.error('[Scheduler] Basketball Pipeline error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerCricketGeneration = async () => {
    console.log('[Scheduler] Running Cricket Quant Pipeline...');
    try {
        const result = await runCricketPipeline();
        if (result && result.status === 'success') {
            console.log(`[Scheduler] Cricket Quant done: ${result.generated} picks from ${result.matches_analyzed} fixtures.`);
            return result;
        }
        console.warn(`[Scheduler] Cricket Quant: ${result?.status} - ${result?.reason || result?.error}`);
        return { status: 'skipped', reason: result?.status };
    } catch (e) {
        console.error('[Scheduler] Cricket Pipeline error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerGrading = async (customDate, forceRegrade) => {
    return triggerQuantGrading(customDate);
};

export const triggerBlogGen = async () => {
    return triggerBlogGeneration(); // from blogGenerator.js
};

/** Sends today's predictions to the configured Telegram group/channel */
export const triggerTelegramBroadcast = async () => {
    try {
        const result = await sendDailyPredictionsToTelegram();
        if (result.status === 'success') {
            console.log(`[Scheduler] ✅ Telegram broadcast sent (${result.sent} picks shown, ${result.total} total)`);
        } else if (result.status === 'skipped') {
            console.log(`[Scheduler] ⏭️ Telegram broadcast skipped: ${result.reason}`);
        } else {
            console.error(`[Scheduler] ❌ Telegram broadcast error: ${result.error}`);
        }
        return result;
    } catch (e) {
        console.error('[Scheduler] Telegram broadcast error:', e.message);
        return { status: 'error', error: e.message };
    }
};

// BUG-7 FIX: The old implementation used toLocaleString which returns "24:00" for midnight
// in some environments (not "00:00"), breaking the window calculation.
// Now using Intl.DateTimeFormat with individual hour/minute parts for robustness.
const isWithinScheduleWindow = (scheduledTime) => {
    if (!scheduledTime) return false;
    const [expectedH, expectedM] = scheduledTime.split(':').map(Number);
    const now = new Date();
    const lagosFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Lagos',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
    });
    const parts = lagosFormatter.formatToParts(now);
    const lagosH = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10) % 24;
    const lagosM = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const currentMins = lagosH * 60 + lagosM;
    const scheduledMins = expectedH * 60 + expectedM;
    const diff = Math.abs(currentMins - scheduledMins);
    return diff <= 10; // allow ±10 minute window
};

// Module-level task registry so stopScheduler can access it
const tasks = new Map();
let currentFootballTime = null;
let currentBasketballTime = null;
let currentCricketTime = null;
let currentGradingTime = null;
let currentBlogTime = null;
let currentTelegramTime = null;
let currentQuantTime = null;
let currentQuantGradingTime = null;

// We'll export an initialization function so server.js can start it
export const initScheduler = () => {
    console.log('🕒 Initializing Scheduler (Quant Engine ACTIVE | AI Predictions DISABLED | Blog + Telegram active)...');

    // Function to check for updated times in Firestore
    const syncSchedules = async () => {
        try {
            const db = admin.firestore();
            const settingsDoc = await db.collection('settings').doc('app').get();

            if (!settingsDoc.exists) return;

            const config = settingsDoc.data();

            // Helper to validate HH:MM format — falls back to default if malformed
            const safeTime = (val, fallback) => (typeof val === 'string' && /^\d{1,2}:\d{2}$/.test(val) ? val : fallback);

            // Look for times in HH:MM format (safe defaults if Firestore value is missing/malformed)
            const footballTime = safeTime(config.quantGenTime || config.footballGenTime, '19:00');
            const basketballTime = safeTime(config.basketballGenTime, '10:00');
            const cricketTime = safeTime(config.cricketGenTime, '10:30');
            const gradingTime = safeTime(config.gradingTime, '06:00');
            const blogTime = safeTime(config.blogGenTime, '09:00');
            const telegramTime = safeTime(config.telegramSendTime, '08:30');

            // ══════════════════════════════════════════════════════════════════
            // ⛔ AI FOOTBALL PREDICTION PIPELINE — DISABLED
            // Replaced by the Quant Engine (pure statistical models).
            // To re-enable: remove the block comment below.
            // ══════════════════════════════════════════════════════════════════
            /*
            if (footballTime !== currentFootballTime) {
                if (tasks.get('football')) tasks.get('football').stop();
                currentFootballTime = footballTime;
                const [fHour, fMin] = footballTime.split(':');

                footballTask = cron.schedule(`${fMin} ${fHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentFootballTime)) {
                        console.warn(`[Scheduler] ⛔ Football time-gate blocked: not within window of ${currentFootballTime}`);
                        return;
                    }
                    console.log(`⚽ Running scheduled Football Generation at ${footballTime}...`);
                    await triggerFootballGeneration();
                }, { timezone: "Africa/Lagos" });
                tasks.set('football', footballTask);
                console.log(`✅ Scheduled Football Gen for ${footballTime} (OpenAI→Gemini fallback)`);
            }
            */

            // ── Basketball Quant Scheduler (Quant Pipeline → OpenAI → Gemini) ────
            if (basketballTime !== currentBasketballTime) {
                if (tasks.get('basketball')) tasks.get('basketball').stop();
                currentBasketballTime = basketballTime;
                const [bHour, bMin] = basketballTime.split(':');

                const basketballTask = cron.schedule(`${bMin} ${bHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentBasketballTime)) {
                        console.warn(`[Scheduler] ⛔ Basketball time-gate blocked: not within window of ${currentBasketballTime}`);
                        return;
                    }
                    console.log(`🏀 Running Basketball Quant Pipeline at ${basketballTime}...`);
                    await triggerBasketballGeneration();
                }, { timezone: "Africa/Lagos" });
                tasks.set('basketball', basketballTask);
                console.log(`✅ Scheduled Basketball Quant for ${basketballTime} (Quant→OpenAI→Gemini)`);
            }

            if (cricketTime !== currentCricketTime) {
                if (tasks.get('cricket')) tasks.get('cricket').stop();
                currentCricketTime = cricketTime;
                const [cHour, cMin] = cricketTime.split(':');

                const cricketTask = cron.schedule(`${cMin} ${cHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentCricketTime)) {
                        console.warn(`[Scheduler] Cricket time-gate blocked: not within window of ${currentCricketTime}`);
                        return;
                    }
                    console.log(`Running Cricket Quant Pipeline at ${cricketTime}...`);
                    await triggerCricketGeneration();
                }, { timezone: "Africa/Lagos" });
                tasks.set('cricket', cricketTask);
                console.log(`Scheduled Cricket Quant for ${cricketTime}`);
            }

            // ══════════════════════════════════════════════════════════════════
            // ⛔ AI GRADING — DISABLED (replaced by Quant Grading @ 06:30)
            // To re-enable: remove the block comment below.
            // ══════════════════════════════════════════════════════════════════
            /*
            if (gradingTime !== currentGradingTime) {
                if (tasks.get('grading')) tasks.get('grading').stop();
                currentGradingTime = gradingTime;
                const [gHour, gMin] = gradingTime.split(':');

                gradingTask = cron.schedule(`${gMin} ${gHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentGradingTime)) {
                        console.warn(`[Scheduler] ⛔ Grading time-gate blocked: not within window of ${currentGradingTime}`);
                        return;
                    }
                    console.log(`📊 Running scheduled Grading at ${gradingTime}...`);
                    await triggerGrading(null, false);
                }, { timezone: "Africa/Lagos" });
                tasks.set('grading', gradingTask);
                console.log(`✅ Scheduled Grading for ${gradingTime} (OpenAI→Gemini fallback)`);
            }
            */

            // ── Blog Scheduler ────────────────────────────────────────────────
            if (blogTime !== currentBlogTime) {
                if (tasks.get('blog')) tasks.get('blog').stop();
                currentBlogTime = blogTime;
                const [blogHour, blogMin] = blogTime.split(':');

                const blogTask = cron.schedule(`${blogMin} ${blogHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentBlogTime)) {
                        console.warn(`[Scheduler] ⛔ Blog time-gate blocked: not within window of ${currentBlogTime}`);
                        return;
                    }
                    console.log(`✍️ Running scheduled Programmatic Blog Generation at ${blogTime}...`);
                    await triggerBlogGen();
                }, { timezone: "Africa/Lagos" });
                tasks.set('blog', blogTask);
                console.log(`✅ Scheduled Programmatic Blog Gen for ${blogTime}`);
            }

            // ── Telegram Broadcast Scheduler ─────────────────────────────────
            if (telegramTime !== currentTelegramTime) {
                if (tasks.get('telegram')) tasks.get('telegram').stop();
                currentTelegramTime = telegramTime;
                const [tHour, tMin] = telegramTime.split(':');

                const telegramTask = cron.schedule(`${tMin} ${tHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentTelegramTime)) {
                        console.warn(`[Scheduler] ⛔ Telegram time-gate blocked: not within window of ${currentTelegramTime}`);
                        return;
                    }
                    console.log(`📨 Running scheduled Telegram Broadcast at ${telegramTime}...`);
                    await triggerTelegramBroadcast();
                }, { timezone: "Africa/Lagos" });
                tasks.set('telegram', telegramTask);
                console.log(`✅ Scheduled Telegram Broadcast for ${telegramTime}`);
            }

            // ── Quant Pipeline Scheduler ───────────────────────────────────────────
            const quantTime = safeTime(config.quantGenTime, '19:00');
            if (quantTime !== currentQuantTime) {
                if (tasks.get('quant')) tasks.get('quant').stop();
                currentQuantTime = quantTime;
                const [qHour, qMin] = quantTime.split(':');

                const quantTask = cron.schedule(`${qMin} ${qHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentQuantTime)) {
                        console.warn(`[Scheduler] ⛔ Quant time-gate blocked: not within window of ${currentQuantTime}`);
                        return;
                    }
                    console.log(`📊 Running scheduled Quant Pipeline at ${quantTime}...`);
                    await triggerQuantPipeline();
                }, { timezone: 'Africa/Lagos' });
                tasks.set('quant', quantTask);
                console.log(`✅ Scheduled Quant Pipeline for ${quantTime} (pure statistical models)`);
            }

            // ── Quant Grading Scheduler (runs after main grading) ─────────────────
            const quantGradingTime = safeTime(config.quantGradingTime, '06:30');
            if (quantGradingTime !== currentQuantGradingTime) {
                if (tasks.get('quantGrading')) tasks.get('quantGrading').stop();
                currentQuantGradingTime = quantGradingTime;
                const [qgHour, qgMin] = quantGradingTime.split(':');

                const quantGradingTask = cron.schedule(`${qgMin} ${qgHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentQuantGradingTime)) return;
                    console.log(`📊 Running scheduled Quant Grading at ${quantGradingTime}...`);
                    await triggerQuantGrading();
                    await triggerQuantPerformance();
                }, { timezone: 'Africa/Lagos' });
                tasks.set('quantGrading', quantGradingTask);
                console.log(`✅ Scheduled Quant Grading for ${quantGradingTime}`);
            }

        } catch (e) {
            console.error('Scheduler sync error:', e);
        }
    };

    // syncSchedules() only READS settings from Firestore and sets up cron job schedules.
    // It NEVER triggers generation itself — generation only happens when the cron fires
    // at the exact scheduled time AND passes the time-gate check above.
    const syncTask = cron.schedule('*/5 * * * *', syncSchedules);
    tasks.set('sync', syncTask);
    syncSchedules(); // On startup: reads schedule times and registers cron jobs — does NOT generate

    // ── Selar Payment Email Listener ──────────────────────────────────────────
    // Runs every 2 minutes to check for new VIP purchases (was: every 30s which risked quota limits)
    const selarTask = cron.schedule('*/2 * * * *', async () => {
        try {
            await checkRecentSelarEmails();
        } catch (e) {
            console.error('[Scheduler] Error in Selar Gmail Listener:', e);
        }
    });
    tasks.set('selar', selarTask);

    // ── Free Live Score Fetcher (football-data.org) ───────────────────────────────
const fetchLiveScoresFree = async () => {
    const fdKey = process.env.FOOTBALL_DATA_KEY;
    if (!fdKey) return [];

    try {
        const res = await fetch(
            'https://api.football-data.org/v4/matches?status=LIVE,IN_PLAY,PAUSED',
            { headers: { 'X-Auth-Token': fdKey }, signal: AbortSignal.timeout(15000) }
        );
        if (!res.ok) return [];
        const json = await res.json();
        return (json.matches || []).map(m => {
            const score = m.score || {};
            const fullTime = score.fullTime || {};
            const halfTime = score.halfTime || {};
            const home = m.homeTeam || {};
            const away = m.awayTeam || {};
            return {
                id: String(m.id),
                homeTeam: home.name || 'Unknown',
                awayTeam: away.name || 'Unknown',
                homeTeamLogo: home.crest || '',
                awayTeamLogo: away.crest || '',
                homeTeamId: home.id,
                awayTeamId: away.id,
                homeScore: fullTime.home ?? halfTime.home ?? 0,
                awayScore: fullTime.away ?? halfTime.away ?? 0,
                league: (m.competition || {}).name || 'Unknown League',
                leagueId: (m.competition || {}).id || 0,
                stateShort: m.status || 'LIVE',
                stateLong: m.status || 'Live',
                minute: m.minute || 0,
                events: [],
                source: 'football-data.org',
            };
        });
    } catch (e) {
        console.warn('[LiveScore-Free] Fetch error:', e.message);
        return [];
    }
};

    // ── Live Scores Poller (every 90 seconds → saves ~480 API calls/day vs 60s) ──
    // We store the whole list in ONE Firestore document so frontend reads 1 doc.
    // Uses ~960 SportMonks API calls/day during matchdays; zero on quiet days.
    const liveScoreTask = cron.schedule('*/2 * * * *', async () => {
        // ── Concurrency guard: skip if previous run still active (max 3 min TTL) ──
        const lockKey = `live_grading_${new Date().toISOString().split('T')[0]}`;
        const db = admin.firestore();
        const lockRef = db.collection('generation_locks').doc(lockKey);
        const lockSnap = await lockRef.get();
        const isStale = lockSnap.exists && lockSnap.data()?.lockedAt &&
            (Date.now() - lockSnap.data().lockedAt.toDate().getTime()) > 3 * 60 * 1000;
        if (lockSnap.exists && !isStale) return;
        await lockRef.set({ lockedAt: new Date() }, { merge: true });

        try {
            // ── Time-gate: only poll during match hours (13:00–23:59 Lagos UTC+1) ──
            // Previously 11:00–01:00 which burned API quota before any matches started.
        // LIVE-2 FIX: Old formula was fragile (dependent on server timezone offset).
        // Use Intl.DateTimeFormat for reliable Africa/Lagos hour extraction.
        const lagosFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Lagos', hour: 'numeric', hour12: false });
        const lagosHour = parseInt(lagosFormatter.format(new Date()), 10) % 24;
        // LIVE-3 FIX: Allow 11:00–23:59 AND 00:00 Lagos to track matches that finish past midnight
        const inMatchHours = (lagosHour >= 11 && lagosHour <= 23) || lagosHour === 0;
        if (!inMatchHours) return;

            const smToken = process.env.SPORTMONKS_API_TOKEN;
            let matches = [];

            // Try Sportmonks first if token exists
            if (smToken) {
                const url = `https://api.sportmonks.com/v3/football/livescores/latest?include=league;participants;scores;events.type;events.player;state&api_token=${smToken}`;
                const res = await fetch(url);
                if (res.ok) {
                    const json = await res.json();
                    const raw = json.data || [];

                    matches = raw.map(item => {
                        const home = item.participants?.find(p => p.meta?.location === 'home') || {};
                        const away = item.participants?.find(p => p.meta?.location === 'away') || {};
                        const homeScore = item.scores?.find(s => s.participant_id === home.id && s.description === 'CURRENT')?.score?.goals ?? 0;
                        const awayScore = item.scores?.find(s => s.participant_id === away.id && s.description === 'CURRENT')?.score?.goals ?? 0;
                        const EVENT_TYPE_MAP = {
                            'GOAL': 'goal', 'OWN-GOAL': 'own_goal', 'PENALTY': 'penalty',
                            'MISSED-PENALTY': 'penalty_miss', 'YELLOW-CARD': 'yellow_card',
                            'YELLOWRED-CARD': 'red_card', 'RED-CARD': 'red_card',
                            'SUBST': 'substitution', 'VAR': 'var',
                        };
                        const events = (item.events || []).map(ev => {
                            const rawName = ev.type?.name || ev.type?.code || ev.type?.developer_name || 'Event';
                            let mappedType = EVENT_TYPE_MAP[ev.type?.developer_name] || EVENT_TYPE_MAP[ev.type?.code] || 'event';
                            if (mappedType === 'event') {
                                const str = rawName.toLowerCase();
                                if (str.includes('goal') && !str.includes('own')) mappedType = 'goal';
                                else if (str.includes('own') && str.includes('goal')) mappedType = 'own_goal';
                                else if (str.includes('penalty') && !str.includes('miss')) mappedType = 'penalty';
                                else if (str.includes('penalty') && str.includes('miss')) mappedType = 'penalty_miss';
                                else if (str.includes('yellow')) mappedType = 'yellow_card';
                                else if (str.includes('red')) mappedType = 'red_card';
                                else if (str.includes('subst')) mappedType = 'substitution';
                                else if (str.includes('var')) mappedType = 'var';
                            }
                            return {
                                id: ev.id,
                                type: mappedType,
                                name: rawName,
                                playerName: ev.player_name || ev.player?.name || ev.related_player?.name || '',
                                playerNameOut: ev.related_player_name || ev.related_player?.name || '',
                                minute: ev.minute || 0,
                                extraMinute: ev.extra_minute || 0,
                                teamId: ev.participant_id,
                                isHome: ev.participant_id === home.id,
                                result: ev.result || ev.score_name || '',
                            };
                        });
                        return {
                            id: String(item.id),
                            homeTeam: home.name || 'Unknown',
                            awayTeam: away.name || 'Unknown',
                            homeTeamLogo: home.image_path || '',
                            awayTeamLogo: away.image_path || '',
                            homeTeamId: home.id,
                            awayTeamId: away.id,
                            homeScore,
                            awayScore,
                            league: item.league?.name || 'Unknown League',
                            leagueId: item.league_id,
                            stateShort: item.state?.short_name || item.state?.state || 'LIVE',
                            stateLong: item.state?.name || 'Live',
                            minute: item.minute || 0,
                            events,
                        };
                    });
                }
            }

            // Fallback to football-data.org if Sportmonks returned nothing
            if (matches.length === 0) {
                console.log('[Live] Sportmonks unavailable — using football-data.org');
                matches = await fetchLiveScoresFree();
            }

            const db = admin.firestore();
            // FIX: Only write to Firestore when we have actual live matches.
            // Previously an API error or quiet period would overwrite with an empty
            // array and wipe all live data from the dashboard immediately.
            if (matches.length > 0) {
                await db.collection('live_scores').doc('current').set({
                    matches,
                    count: matches.length,
                    updatedAt: new Date().toISOString(),
                });
                console.log(`[Live] ⚡ Wrote ${matches.length} live matches to Firestore`);
                
// ── AUTO-UPDATE PREDICTIONS SCORE ──
                try {
                    // Match the quant_predictions date key (Lagos time)
                    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
                    const qDocRef = db.collection('quant_predictions').doc(todayStr);
                    const qDoc = await qDocRef.get();
                    if (qDoc.exists) {
                        const data = qDoc.data();
                        let updated = false;
                        const preds = data.predictions || [];
                        for (const pred of preds) {
                            const liveMatch = matches.find(m =>
                                String(m.id) === String(pred.fixture_id) ||
                                (pred.home_team_id && m.homeTeamId &&
                                 Number(m.homeTeamId) === Number(pred.home_team_id))
                            );
                            if (liveMatch) {
                                // Only write scores for matches that are actually in play or finished
                                const activeStates = ['1H', '2H', 'HT', 'ET', 'PEN', 'FT', 'AET', 'LIVE', 'BREAK'];
                                const matchState = (liveMatch.stateShort || '').toUpperCase();
                                if (!activeStates.includes(matchState)) continue;  // Skip NS, WAIT, POSTP, etc.
                                
                                const newScore = `${liveMatch.homeScore} - ${liveMatch.awayScore}`;
                                if (pred.score !== newScore) {
                                    pred.score = newScore;
                                    pred.live_state = matchState;
                                    pred.live_minute = liveMatch.minute || 0;
                                    updated = true;
                                }
                            }
                        }
                        if (updated) {
                            await qDocRef.update({ predictions: preds });
                            console.log(`[Live] 🔄 Auto-updated prediction scores for ${todayStr}`);
                        }

                        // ── AUTO-GRADE FINISHED MATCHES ──
                        const ftMatches = matches.filter(m =>
                            ['FT', 'AET', 'PEN'].includes((m.stateShort || '').toUpperCase())
                        );

                        let gradingUpdated = false;
                        if (ftMatches.length > 0) {
                            for (const pred of preds) {
                                // BUG-5 FIX: Only skip predictions already graded as won or lost.
                                // Previously skipped 'void' and any non-pending status, preventing
                                // re-grading of rescheduled/postponed matches.
                                if (pred.status === 'won' || pred.status === 'lost') continue;

                                // STRICT: Match by fixture_id (SportMonks) with team-name fallback (Gemini).
                                // Gemini-generated predictions have no fixture_id and must be graded by name.
                                const ftMatch = ftMatches.find(m =>
                                    String(m.id) === String(pred.fixture_id) ||
                                    (
                                        pred.fixture_id == null &&
                                        m.homeTeam && m.awayTeam &&
                                        (
                                            (pred.homeTeam || pred.home_team || '').toLowerCase().trim() === m.homeTeam.toLowerCase().trim() ||
                                            (pred.homeTeam || pred.home_team || '').toLowerCase().trim() === m.awayTeam.toLowerCase().trim()
                                        ) &&
                                        (
                                            (pred.awayTeam || pred.away_team || '').toLowerCase().trim() === m.awayTeam.toLowerCase().trim() ||
                                            (pred.awayTeam || pred.away_team || '').toLowerCase().trim() === m.homeTeam.toLowerCase().trim()
                                        )
                                    )
                                );

                                if (!ftMatch) continue;

                                if (pred.fixture_id == null) {
                                    console.log(`[AutoGrade] Gemini fallback matched: ${pred.homeTeam || pred.home_team} vs ${pred.awayTeam || pred.away_team} → ${ftMatch.homeTeam} vs ${ftMatch.awayTeam} (${ftMatch.homeScore}-${ftMatch.awayScore})`);
                                }

                                const hg = ftMatch.homeScore;
                                const ag = ftMatch.awayScore;
                                const total = hg + ag;
                                const market = (pred.bet_type || '').toLowerCase();
                                let status = 'void';

                                if (market.includes('home win') && !market.includes('draw no bet') && !market.includes('double'))
                                    status = hg > ag ? 'won' : 'lost';
                                else if (market.includes('away win') && !market.includes('draw no bet') && !market.includes('double'))
                                    status = ag > hg ? 'won' : 'lost';
                                else if (market === 'draw')
                                    status = hg === ag ? 'won' : 'lost';
                                else if (market.includes('double chance (1x)'))
                                    status = hg >= ag ? 'won' : 'lost';
                                else if (market.includes('double chance (x2)'))
                                    status = ag >= hg ? 'won' : 'lost';
                                else if (market.includes('double chance (12)'))
                                    status = hg !== ag ? 'won' : 'lost';
                                else if (market.includes('draw no bet (home)'))
                                    status = hg === ag ? 'void' : (hg > ag ? 'won' : 'lost');
                                else if (market.includes('draw no bet (away)'))
                                    status = hg === ag ? 'void' : (ag > hg ? 'won' : 'lost');
                                else if (market.includes('over 1.5'))
                                    status = total > 1 ? 'won' : 'lost';
                                else if (market.includes('under 1.5'))
                                    status = total < 2 ? 'won' : 'lost';
                                else if (market.includes('over 2.5'))
                                    status = total > 2 ? 'won' : 'lost';
                                else if (market.includes('under 2.5'))
                                    status = total < 3 ? 'won' : 'lost';
                                else if (market.includes('over 3.5'))
                                    status = total > 3 ? 'won' : 'lost';
                                else if (market.includes('under 3.5'))
                                    status = total < 4 ? 'won' : 'lost';
                                else if (market.includes('btts') && market.includes('over 2.5'))
                                    status = (hg > 0 && ag > 0 && total > 2) ? 'won' : 'lost';
                                else if (market.includes('btts') && !market.includes('no'))
                                    status = (hg > 0 && ag > 0) ? 'won' : 'lost';
                                else if (market.includes('btts') && market.includes('no'))
                                    status = (hg === 0 || ag === 0) ? 'won' : 'lost';

                                if ((status !== 'void' || ftMatch.time) && status !== 'void') {
                                    pred.status = status;
                                    pred.graded_at = new Date().toISOString();
                                    pred.graded_by = 'live_auto';
                                    pred.live_state = 'FT';
                                    gradingUpdated = true;
                                    console.log(`[Live] ✅ Auto-graded: ${pred.home_team} vs ${pred.away_team} → ${status} (${hg}-${ag})`);
                                }
                            }
                        }

                        // Persist graded statuses back to Firestore (this was missing)
                        if (gradingUpdated) {
                            await qDocRef.update({ predictions: preds });
                            console.log(`[Live] 💾 Persisted auto-graded results for ${todayStr}`);
                        }
                    }
                } catch (e) {
                    console.warn('[Live] Error auto-updating prediction scores:', e.message);
                }

            } else {
                // No live matches — update timestamp only so the UI knows the poller ran
                await db.collection('live_scores').doc('current').set({
                    count: 0,
                    updatedAt: new Date().toISOString(),
                }, { merge: true });
            }
        } catch (e) {
            console.warn('[Scheduler] Live scores poll error:', e.message);
        } finally {
            // Release concurrency lock so next poll can acquire it
            try { await lockRef.delete(); } catch (_) {}
        }
    });
    tasks.set('liveScore', liveScoreTask);
    console.log('⚡ Live scores poller started (every 2 minutes → Firestore)'); // BUG-12 FIX: was incorrectly saying 60s

    // ── Lineup Fetcher (once daily at 11:00 Lagos — ~1h before most matches) ──
    // Fetches expected starting XIs for today's fixtures and stores in Firestore
    // lineups/{fixtureId} — powers the Lineup tab in MatchDetailsModal.
    // ~1 SportMonks API call per day
    const lineupTask = cron.schedule('0 11 * * *', async () => {
        try {
            const token = process.env.SPORTMONKS_API_TOKEN;
            if (!token) return;
            const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
            const url = `https://api.sportmonks.com/v3/football/fixtures/date/${dateKey}?include=lineups.player;participants&api_token=${token}`;
            const res = await fetch(url);
            if (!res.ok) { console.warn('[Lineup] API error:', res.status); return; }
            const json = await res.json();
            const raw = json.data || [];

            const db = admin.firestore();
            let saved = 0;
            for (const item of raw) {
                const lineups = item.lineups || [];
                if (!Array.isArray(lineups) || lineups.length === 0) continue;
                const home = item.participants?.find(p => p.meta?.location === 'home') || {};
                const away = item.participants?.find(p => p.meta?.location === 'away') || {};
                const homePlayers = lineups.filter(l => l.team_id === home.id).map(l => ({
                    name: l.player?.display_name || l.player?.name || 'Unknown',
                    number: l.jersey_number || null,
                    position: l.position?.name || '',
                    teamId: home.id,
                    teamName: home.name || '',
                    isHome: true,
                }));
                const awayPlayers = lineups.filter(l => l.team_id === away.id).map(l => ({
                    name: l.player?.display_name || l.player?.name || 'Unknown',
                    number: l.jersey_number || null,
                    position: l.position?.name || '',
                    teamId: away.id,
                    teamName: away.name || '',
                    isHome: false,
                }));
                if (homePlayers.length + awayPlayers.length === 0) continue;
                await db.collection('lineups').doc(String(item.id)).set({
                    home: homePlayers,
                    away: awayPlayers,
                    fetchedAt: new Date().toISOString(),
                });
                saved++;
            }
            if (saved > 0) console.log(`[Lineup] 👥 Stored lineups for ${saved} fixtures on ${dateKey}`);
            else console.log(`[Lineup] No lineups announced yet for ${dateKey}`);
        } catch (e) {
            console.warn('[Scheduler] Lineup fetch error:', e.message);
        }
    }, { timezone: 'Africa/Lagos' });
    tasks.set('lineup', lineupTask);
    console.log('👥 Lineup fetcher scheduled at 11:00 Lagos');

    // ── Daily Match Statistics Fetcher (07:45 Lagos) ─────────────────────────
    // Fetches ball possession, shots on target, corners, fouls for today's fixtures.
    // Stored in Firestore match_stats/{dateKey} for quant engine and MatchDetailsModal.
    // Cost: ~1 SportMonks API call per day
    const statsTask = cron.schedule('30 23 * * *', async () => {
        try {
            const token = process.env.SPORTMONKS_API_TOKEN;
            if (!token) return;
            const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
            const url = `https://api.sportmonks.com/v3/football/fixtures/date/${dateKey}?include=statistics;participants&api_token=${token}`;
            const res = await fetch(url);
            if (!res.ok) { console.warn('[Stats] API error:', res.status); return; }
            const json = await res.json();
            const raw = json.data || [];

            // STAT TYPE IDs in SportMonks v3:
            // 45 = ball_possession, 41 = shots_total, 42 = shots_on_target,
            // 34 = corners, 56 = fouls, 58 = yellow_cards, 16 = offsides
            const STAT_TYPES = { 45: 'possession', 41: 'shots', 42: 'shots_on_target', 34: 'corners', 56: 'fouls', 58: 'yellow_cards', 16: 'offsides' };

            const fixtureStats = {};
            for (const item of raw) {
                const home = item.participants?.find(p => p.meta?.location === 'home') || {};
                const away = item.participants?.find(p => p.meta?.location === 'away') || {};
                const stats = {};
                for (const stat of (item.statistics || [])) {
                    const key = STAT_TYPES[stat.type_id];
                    if (!key) continue;
                    if (!stats[key]) stats[key] = { home: null, away: null };
                    if (stat.participant_id === home.id) stats[key].home = stat.data?.value ?? null;
                    if (stat.participant_id === away.id) stats[key].away = stat.data?.value ?? null;
                }
                if (Object.keys(stats).length > 0) {
                    fixtureStats[String(item.id)] = {
                        fixtureId: item.id,
                        homeTeam: home.name || 'Unknown',
                        awayTeam: away.name || 'Unknown',
                        stats,
                    };
                }
            }

            const db = admin.firestore();
            if (Object.keys(fixtureStats).length > 0) {
                await db.collection('match_stats').doc(dateKey).set({
                    fixtures: fixtureStats,
                    fetchedAt: new Date().toISOString(),
                    count: Object.keys(fixtureStats).length,
                });
                console.log(`[Stats] 📊 Stored stats for ${Object.keys(fixtureStats).length} fixtures on ${dateKey}`);
            } else {
                console.log(`[Stats] No statistics available yet for ${dateKey} (pre-match)`);
            }
        } catch (e) {
            console.warn('[Scheduler] Match stats fetch error:', e.message);
        }
    }, { timezone: 'Africa/Lagos' });
    tasks.set('stats', statsTask);
    console.log('📊 Match statistics fetcher scheduled at 23:30 Lagos');

    // ── Tomorrow's Fixture Pre-Fetch (daily at 23:00 Lagos) ─────────────────
    // Fetches tomorrow's fixtures and stores odds for VIP tomorrow preview.
    // ~1 API call per day
const tomorrowTask = cron.schedule('0 23 * * *', async () => {
        try {
            const smToken = process.env.SPORTMONKS_API_TOKEN;
            const fdKey = process.env.FOOTBALL_DATA_KEY;
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

            let fixtures = [];

            // Try Sportmonks first
            if (smToken) {
                const url = `https://api.sportmonks.com/v3/football/fixtures/date/${dateKey}?include=league;participants&api_token=${smToken}`;
                const res = await fetch(url);
                if (res.ok) {
                    const json = await res.json();
                    const raw = json.data || [];
                    fixtures = raw.map(item => {
                        const home = item.participants?.find(p => p.meta?.location === 'home') || {};
                        const away = item.participants?.find(p => p.meta?.location === 'away') || {};
                        const kickoff = item.starting_at ? new Date(item.starting_at) : null;
                        const timeStr = kickoff ? kickoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : 'TBD';
                        return {
                            id: String(item.id),
                            fixtureId: item.id,
                            homeTeam: home.name || 'Unknown',
                            awayTeam: away.name || 'Unknown',
                            homeTeamLogo: home.image_path || '',
                            awayTeamLogo: away.image_path || '',
                            league: item.league?.name || 'Unknown League',
                            time: timeStr,
                            category: 'no_edge',
                            confidence: 0,
                            odds: 0,
                            prediction: 'Preview — Analysis runs at 19:00',
                            prediction_en: 'Preview — Vantage AI analysis runs at 19:00 Lagos',
                            prediction_fr: 'Aperçu — L\'analyse IA est disponible à 19h00',
                        };
                    });
                }
            }

            // Fallback to football-data.org
            if (fixtures.length === 0 && fdKey) {
                const freeComps = ['PL', 'BL1', 'PD', 'SA', 'FL1', 'CL', 'EL'];
                for (const comp of freeComps) {
                    try {
                        const res = await fetch(
                            `https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${dateKey}&dateTo=${dateKey}`,
                            { headers: { 'X-Auth-Token': fdKey } }
                        );
                        if (!res.ok) continue;
                        const json = await res.json();
                        for (const m of (json.matches || [])) {
                            const kickoff = m.utcDate ? new Date(m.utcDate) : null;
                            const timeStr = kickoff ? kickoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : 'TBD';
                            fixtures.push({
                                id: String(m.id),
                                fixtureId: m.id,
                                homeTeam: (m.homeTeam || {}).name || 'Unknown',
                                awayTeam: (m.awayTeam || {}).name || 'Unknown',
                                homeTeamLogo: (m.homeTeam || {}).crest || '',
                                awayTeamLogo: (m.awayTeam || {}).crest || '',
                                league: (m.competition || {}).name || 'Unknown League',
                                time: timeStr,
                                category: 'no_edge',
                                confidence: 0,
                                odds: 0,
                                prediction: 'Preview — Analysis runs at 19:00',
                                prediction_en: 'Preview — Vantage AI analysis runs at 19:00 Lagos',
                                prediction_fr: 'Aperçu — L\'analyse IA est disponible à 19h00',
                            });
                        }
                    } catch (_) {}
                }
            }

            if (fixtures.length > 0) {
                const db = admin.firestore();
                await db.collection('daily_predictions').doc(dateKey).set({
                    rawFixtures: fixtures,
                    updatedAt: new Date().toISOString(),
                }, { merge: true });
                console.log(`[Tomorrow] 📅 Stored ${fixtures.length} fixtures for ${dateKey}`);
            } else {
                console.log(`[Tomorrow] No fixtures available for ${dateKey}`);
            }
        } catch (e) {
            console.warn('[Scheduler] Tomorrow fixtures fetch error:', e.message);
        }
    }, { timezone: 'Africa/Lagos' });
    tasks.set('tomorrow', tomorrowTask);
    console.log('📅 Tomorrow fixture pre-fetch scheduled at 23:00 Lagos');

    // ── Daily Prediction Repair (03:00 Lagos) ────────────────────────────────
    // Resets any predictions that were prematurely graded (e.g., postponed match
    // auto-graded as lost by the live score engine before kickoff).
    const repairTask = cron.schedule('0 3 * * *', async () => {
        try {
            const db = admin.firestore();
            const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
            const fixed = await repairCorruptedPredictions(db, dateKey);
            if (fixed > 0) console.log(`[Repair] 🔧 Fixed ${fixed} corrupted predictions for ${dateKey}`);
        } catch (e) {
            console.warn('[Scheduler] Repair task error:', e.message);
        }
    }, { timezone: 'Africa/Lagos' });
    tasks.set('repair', repairTask);
    console.log('🔧 Prediction repair task scheduled at 03:00 Lagos');

    // ── Weekly Static Data Seeder (Sunday 02:00 Lagos) ────────────────────────
    // Re-seeds Firestore with semi-permanent Sportmonks data: leagues, seasons,
    // team metadata, standings, top scorers. Saves ~200+ API calls/week.
    const seederTask = cron.schedule('0 2 * * 0', async () => {
        try {
            const token = process.env.SPORTMONKS_API_TOKEN;
            const db = admin.firestore();
            await seedStaticData(db, token);
        } catch (e) {
            console.warn('[Scheduler] Static data seed error:', e.message);
        }
    }, { timezone: 'Africa/Lagos' });
    tasks.set('seeder', seederTask);
    console.log('🌱 Static data seeder scheduled at 02:00 every Sunday Lagos');
};

/**
 * Stop all scheduled cron tasks. Call this during graceful shutdown.
 */
export const stopScheduler = () => {
    const allTasks = [
        'sync', 'selar', 'liveScore', 'stats', 'tomorrow',
        'basketball', 'cricket', 'blog', 'telegram', 'quant', 'quantGrading', 'repair', 'seeder',
        'lineup'
    ];
    for (const name of allTasks) {
        const task = tasks.get(name);
        if (task) { task.stop(); tasks.delete(name); }
    }
    console.log('[Scheduler] All cron tasks stopped.');
};

export async function repairCorruptedPredictions(db, dateStr) {
    const docRef = db.collection('quant_predictions').doc(dateStr);
    const doc = await docRef.get();
    if (!doc.exists) {
        console.log(`[Repair] No predictions found for ${dateStr}`);
        return 0;
    }
    
    const data = doc.data();
    const preds = data.predictions || [];
    let fixed = 0;
    const now = new Date();
    
    for (const pred of preds) {
        if (pred.graded_by === 'live_auto') {
            const kickoff = new Date(pred.kickoff_utc);
            if (kickoff > now) {
                pred.status = 'pending';
                pred.score = null;
                pred.live_state = null;
                pred.live_minute = null;
                delete pred.graded_at;
                delete pred.graded_by;
                fixed++;
            }
        }
    }
    
    if (fixed > 0) {
        await docRef.update({ predictions: preds });
        console.log(`[Repair] ✅ Fixed ${fixed} corrupted predictions for ${dateStr}`);
    }
    return fixed;
};

console.log('⏳ Scheduler initialized. Config sync runs every 5 minutes.');
console.log('📧 Selar Gmail listener polls every 2 minutes.');

