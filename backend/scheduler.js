import cron from 'node-cron';
import admin from 'firebase-admin';

// ── OpenAI PRIMARY functions ──────────────────────────────────────────────────
import {
    generateDailyPredictionsOpenAI,
    generateDailyBlogOpenAI,
    gradeYesterdayOpenAI,
    generateBasketballPredictionsOpenAI,
    generateAccumulatorsOpenAI,
} from './openaiService.js';

// ── Gemini FALLBACK functions ─────────────────────────────────────────────────
import {
    generateDailyPredictionsServerSide,
    generateDailyBlogServerSide,
    gradeYesterdayServerSide,
    generateBasketballPredictionsServerSide
} from './geminiService.js';

import { checkRecentSelarEmails } from './gmailListener.js';
import { sendDailyPredictionsToTelegram } from './telegramService.js';

/**
 * Dual-Engine Wrapper
 * Tries OpenAI first. If it fails (any error or non-success status),
 * transparently falls back to Gemini. Zero impact on callers.
 */
async function withOpenAIFallback(openAIFn, geminiFn, taskName) {
    try {
        const result = await openAIFn();
        if (result && result.status === 'success') {
            // Support different result shapes: predictions (generated), grading (graded), blog (generatedLength)
            const itemCount = result.generated ?? result.graded ?? result.generatedLength ?? result.footballPicks ?? 0;
            console.log(`[Scheduler] ✅ ${taskName} completed via OpenAI (${itemCount} items)`);
            return result;
        }
        // skipped is not an error — don't fall back for skipped (e.g. no predictions to blog yet)
        if (result && result.status === 'skipped') {
            console.log(`[Scheduler] ⏭️ ${taskName} skipped: ${result.reason}`);
            return result;
        }
        // Non-success (but no throw) — treat as failure and fall back
        throw new Error(result?.error || `OpenAI returned status: ${result?.status}`);
    } catch (e) {
        console.warn(`[Scheduler] ⚠️ ${taskName} OpenAI failed: "${e.message}". Falling back to Gemini...`);
        try {
            const fallbackResult = await geminiFn();
            const itemCount = fallbackResult?.generated ?? fallbackResult?.graded ?? fallbackResult?.generatedLength ?? 0;
            console.log(`[Scheduler] ✅ ${taskName} completed via Gemini fallback (${itemCount} items)`);
            return fallbackResult;
        } catch (fallbackErr) {
            console.error(`[Scheduler] ❌ ${taskName} both OpenAI and Gemini failed: ${fallbackErr.message}`);
            return { status: 'error', error: fallbackErr.message };
        }
    }
}

// ── Admin trigger helpers (used by server.js admin endpoints) ─────────────────

/** Standalone accumulator trigger (OpenAI only — Gemini fallback via generateAccumulators in geminiService) */
export const triggerAccumulatorGeneration = async () => {
    try {
        const result = await generateAccumulatorsOpenAI();
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

/**
 * Football generation + immediate accumulator chaining.
 * Used by both the scheduled cron and the admin endpoint.
 */
export const triggerFootballGeneration = async () => {
    const result = await withOpenAIFallback(
        generateDailyPredictionsOpenAI,
        generateDailyPredictionsServerSide,
        'Football Generation'
    );
    // Auto-generate accumulators immediately after football predictions succeed and has actual predictions
    if (result && result.status === 'success' && (result.generated ?? 0) > 0) {
        console.log('[Scheduler] ⚽ Football done — auto-triggering Accumulator generation...');
        await triggerAccumulatorGeneration();
    }
    return result;
};

export const triggerBasketballGeneration = () =>
    withOpenAIFallback(generateBasketballPredictionsOpenAI, generateBasketballPredictionsServerSide, 'Basketball Generation');

export const triggerGrading = (customDate, forceRegrade) =>
    withOpenAIFallback(
        () => gradeYesterdayOpenAI(customDate, forceRegrade),
        () => gradeYesterdayServerSide(customDate, forceRegrade),
        'Grading'
    );

export const triggerBlogGeneration = () =>
    withOpenAIFallback(generateDailyBlogOpenAI, generateDailyBlogServerSide, 'Blog Generation');

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

// ── Time-gate guard ──────────────────────────────────────────────────────────
// Checks whether the current Africa/Lagos time is within ±10 minutes of the
// expected schedule time (HH:MM string). This prevents generation from running
// if the cron fires unexpectedly early/late, or if the server restarts close
// to (but not at) the scheduled time.
const isWithinScheduleWindow = (scheduledTime) => {
    if (!scheduledTime) return false;
    const [expectedH, expectedM] = scheduledTime.split(':').map(Number);
    const now = new Date();
    // Africa/Lagos is always UTC+1, no DST
    const lagosMs = now.getTime() + (60 - now.getTimezoneOffset()) * 60000;
    const lagos = new Date(lagosMs);
    const currentMins = lagos.getUTCHours() * 60 + lagos.getUTCMinutes();
    const scheduledMins = expectedH * 60 + expectedM;
    const diff = Math.abs(currentMins - scheduledMins);
    return diff <= 10; // allow ±10 minute window
};

// We'll export an initialization function so server.js can start it
export const initScheduler = () => {
    console.log('🕒 Initializing Dynamic Scheduler (OpenAI Primary / Gemini Fallback)...');

    // Track current tasks so we can destroy and recreate them if times change
    let footballTask = null;
    let basketballTask = null;
    let gradingTask = null;
    let blogTask = null;
    let telegramTask = null;

    let currentFootballTime = null;
    let currentBasketballTime = null;
    let currentGradingTime = null;
    let currentBlogTime = null;
    let currentTelegramTime = null;

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
            const footballTime = safeTime(config.footballGenTime, '08:00');
            const basketballTime = safeTime(config.basketballGenTime, '10:00');
            const gradingTime = safeTime(config.gradingTime, '06:00');
            const blogTime = safeTime(config.blogGenTime, '09:00');
            const telegramTime = safeTime(config.telegramSendTime, '08:30');

            // ── Football Scheduler ────────────────────────────────────────────
            if (footballTime !== currentFootballTime) {
                if (footballTask) footballTask.stop();
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
                console.log(`✅ Scheduled Football Gen for ${footballTime} (OpenAI→Gemini fallback)`);
            }

            // ── Basketball Scheduler ──────────────────────────────────────────
            if (basketballTime !== currentBasketballTime) {
                if (basketballTask) basketballTask.stop();
                currentBasketballTime = basketballTime;
                const [bHour, bMin] = basketballTime.split(':');

                basketballTask = cron.schedule(`${bMin} ${bHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentBasketballTime)) {
                        console.warn(`[Scheduler] ⛔ Basketball time-gate blocked: not within window of ${currentBasketballTime}`);
                        return;
                    }
                    console.log(`🏀 Running scheduled Basketball Generation at ${basketballTime}...`);
                    await triggerBasketballGeneration();
                }, { timezone: "Africa/Lagos" });
                console.log(`✅ Scheduled Basketball Gen for ${basketballTime} (OpenAI→Gemini fallback)`);
            }

            // ── Grading Scheduler ─────────────────────────────────────────────
            if (gradingTime !== currentGradingTime) {
                if (gradingTask) gradingTask.stop();
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
                console.log(`✅ Scheduled Grading for ${gradingTime} (OpenAI→Gemini fallback)`);
            }

            // ── Blog Scheduler ────────────────────────────────────────────────
            if (blogTime !== currentBlogTime) {
                if (blogTask) blogTask.stop();
                currentBlogTime = blogTime;
                const [blogHour, blogMin] = blogTime.split(':');

                blogTask = cron.schedule(`${blogMin} ${blogHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentBlogTime)) {
                        console.warn(`[Scheduler] ⛔ Blog time-gate blocked: not within window of ${currentBlogTime}`);
                        return;
                    }
                    console.log(`✍️ Running scheduled AI Blog Generation at ${blogTime}...`);
                    await triggerBlogGeneration();
                }, { timezone: "Africa/Lagos" });
                console.log(`✅ Scheduled AI Blog Gen for ${blogTime} (OpenAI→Gemini fallback)`);
            }

            // ── Telegram Broadcast Scheduler ─────────────────────────────────
            if (telegramTime !== currentTelegramTime) {
                if (telegramTask) telegramTask.stop();
                currentTelegramTime = telegramTime;
                const [tHour, tMin] = telegramTime.split(':');

                telegramTask = cron.schedule(`${tMin} ${tHour} * * *`, async () => {
                    if (!isWithinScheduleWindow(currentTelegramTime)) {
                        console.warn(`[Scheduler] ⛔ Telegram time-gate blocked: not within window of ${currentTelegramTime}`);
                        return;
                    }
                    console.log(`📨 Running scheduled Telegram Broadcast at ${telegramTime}...`);
                    await triggerTelegramBroadcast();
                }, { timezone: "Africa/Lagos" });
                console.log(`✅ Scheduled Telegram Broadcast for ${telegramTime}`);
            }

        } catch (e) {
            console.error('Scheduler sync error:', e);
        }
    };

    // syncSchedules() only READS settings from Firestore and sets up cron job schedules.
    // It NEVER triggers generation itself — generation only happens when the cron fires
    // at the exact scheduled time AND passes the time-gate check above.
    cron.schedule('*/5 * * * *', syncSchedules);
    syncSchedules(); // On startup: reads schedule times and registers cron jobs — does NOT generate

    // ── Selar Payment Email Listener ──────────────────────────────────────────
    // Runs every 2 minutes to check for new VIP purchases (was: every 30s which risked quota limits)
    cron.schedule('*/2 * * * *', async () => {
        try {
            await checkRecentSelarEmails();
        } catch (e) {
            console.error('[Scheduler] Error in Selar Gmail Listener:', e);
        }
    });

    console.log('⏳ Scheduler initialized. Config sync runs every 5 minutes.');
    console.log('📧 Selar Gmail listener polls every 2 minutes.');
};
