import cron from 'node-cron';
import admin from 'firebase-admin';

// ── OpenAI PRIMARY functions ──────────────────────────────────────────────────
import {
    generateDailyPredictionsOpenAI,
    generateDailyBlogOpenAI,
    gradeYesterdayOpenAI,
    generateBasketballPredictionsOpenAI
} from './openaiService.js';

// ── Gemini FALLBACK functions ─────────────────────────────────────────────────
import {
    generateDailyPredictionsServerSide,
    generateDailyBlogServerSide,
    gradeYesterdayServerSide,
    generateBasketballPredictionsServerSide
} from './geminiService.js';

import { checkRecentSelarEmails } from './gmailListener.js';

/**
 * Dual-Engine Wrapper
 * Tries OpenAI first. If it fails (any error or non-success status),
 * transparently falls back to Gemini. Zero impact on callers.
 */
async function withOpenAIFallback(openAIFn, geminiFn, taskName) {
    try {
        const result = await openAIFn();
        if (result && result.status === 'success') {
            console.log(`[Scheduler] ✅ ${taskName} completed via OpenAI (${result.generated ?? result.graded ?? 0} items)`);
            return result;
        }
        // Non-success (but no throw) — treat as failure and fall back
        throw new Error(result?.error || `OpenAI returned status: ${result?.status}`);
    } catch (e) {
        console.warn(`[Scheduler] ⚠️ ${taskName} OpenAI failed: "${e.message}". Falling back to Gemini...`);
        try {
            const fallbackResult = await geminiFn();
            console.log(`[Scheduler] ✅ ${taskName} completed via Gemini fallback (${fallbackResult?.generated ?? fallbackResult?.graded ?? 0} items)`);
            return fallbackResult;
        } catch (fallbackErr) {
            console.error(`[Scheduler] ❌ ${taskName} both OpenAI and Gemini failed: ${fallbackErr.message}`);
            return { status: 'error', error: fallbackErr.message };
        }
    }
}

// ── Admin trigger helpers (used by server.js admin endpoints) ─────────────────
export const triggerFootballGeneration = () =>
    withOpenAIFallback(generateDailyPredictionsOpenAI, generateDailyPredictionsServerSide, 'Football Generation');

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

// We'll export an initialization function so server.js can start it
export const initScheduler = () => {
    console.log('🕒 Initializing Dynamic Scheduler (OpenAI Primary / Gemini Fallback)...');

    // Track current tasks so we can destroy and recreate them if times change
    let footballTask = null;
    let basketballTask = null;
    let gradingTask = null;
    let blogTask = null;

    let currentFootballTime = null;
    let currentBasketballTime = null;
    let currentGradingTime = null;
    let currentBlogTime = null;

    // Function to check for updated times in Firestore
    const syncSchedules = async () => {
        try {
            const db = admin.firestore();
            const settingsDoc = await db.collection('settings').doc('app').get();

            if (!settingsDoc.exists) return;

            const config = settingsDoc.data();

            // Look for times in HH:MM format
            const footballTime = config.footballGenTime || '08:00';
            const basketballTime = config.basketballGenTime || '10:00';
            const gradingTime = config.gradingTime || '06:00';
            const blogTime = config.blogGenTime || '09:00';

            // ── Football Scheduler ────────────────────────────────────────────
            if (footballTime !== currentFootballTime) {
                if (footballTask) footballTask.stop();
                currentFootballTime = footballTime;
                const [fHour, fMin] = footballTime.split(':');

                footballTask = cron.schedule(`${fMin} ${fHour} * * *`, async () => {
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
                    console.log(`✍️ Running scheduled AI Blog Generation at ${blogTime}...`);
                    await triggerBlogGeneration();
                }, { timezone: "Africa/Lagos" });
                console.log(`✅ Scheduled AI Blog Gen for ${blogTime} (OpenAI→Gemini fallback)`);
            }

        } catch (e) {
            console.error('Scheduler sync error:', e);
        }
    };

    // Run every 5 minutes and also immediately on startup
    cron.schedule('*/5 * * * *', syncSchedules);
    syncSchedules();

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
