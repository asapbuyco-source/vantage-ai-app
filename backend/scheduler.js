import cron from 'node-cron';
import admin from 'firebase-admin';
import {
    runBasketballPipeline,
    runCricketPipeline,
    runLiveMomentumEngine,
    runQuantGrading,
    runQuantPerformance,
    runQuantPipeline,
    runPlayerStatsClient,
} from './quantService.js';

const tasks = new Map();

// ── Trigger Functions ─────────────────────────────────────────────────────────────────────

function assertSuccess(result, label) {
    if (result?.status === 'error') {
        throw new Error(result.error || `${label} failed`);
    }
    return result;
}

export const triggerFootballGeneration = async (dateStr = null, dryRun = false) => {
    console.log('[Scheduler] Triggering football generation...');
    try {
        const result = await runQuantPipeline(dateStr, dryRun);
        console.log('[Scheduler] Football generation complete.');
        return assertSuccess(result, 'Football generation');
    } catch (e) {
        console.error('[Scheduler] Football generation error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerBasketballGeneration = async (dateStr = null, dryRun = false) => {
    console.log('[Scheduler] Triggering basketball generation...');
    try {
        const result = await runBasketballPipeline(dateStr, dryRun);
        console.log('[Scheduler] Basketball generation complete.');
        return assertSuccess(result, 'Basketball generation');
    } catch (e) {
        console.error('[Scheduler] Basketball generation error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerCricketGeneration = async (dateStr = null, dryRun = false) => {
    console.log('[Scheduler] Triggering cricket generation...');
    try {
        const result = await runCricketPipeline(dateStr, dryRun);
        console.log('[Scheduler] Cricket generation complete.');
        return assertSuccess(result, 'Cricket generation');
    } catch (e) {
        console.error('[Scheduler] Cricket generation error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerGrading = async (dateStr = null) => {
    console.log('[Scheduler] Triggering match grading...');
    try {
        const result = await runQuantGrading(dateStr);
        console.log('[Scheduler] Grading complete.');
        return assertSuccess(result, 'Grading');
    } catch (e) {
        console.error('[Scheduler] Grading error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerBlogGen = async () => {
    console.log('[Scheduler] Triggering blog generation...');
    try {
        const { triggerBlogGeneration } = await import('./blogGenerator.js');
        const result = await triggerBlogGeneration();
        console.log('[Scheduler] Blog generation complete.');
        return result || { status: 'success' };
    } catch (e) {
        console.error('[Scheduler] Blog generation error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerAccumulatorGeneration = async () => {
    console.log('[Scheduler] Triggering accumulator generation...');
    try {
        const result = await runQuantPipeline();
        console.log('[Scheduler] Accumulator generation complete.');
        return assertSuccess(result, 'Accumulator generation');
    } catch (e) {
        console.error('[Scheduler] Accumulator generation error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerTelegramBroadcast = async () => {
    console.log('[Scheduler] Triggering Telegram broadcast...');
    try {
        const { sendDailyPredictionsToTelegram } = await import('./telegramService.js');
        const result = await sendDailyPredictionsToTelegram();
        console.log('[Scheduler] Telegram broadcast complete.');
        return result || { status: 'success' };
    } catch (e) {
        console.error('[Scheduler] Telegram broadcast error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerQuantPipeline = async (dateStr = null, dryRun = false) => {
    console.log('[Scheduler] Triggering quant pipeline...');
    try {
        const result = await runQuantPipeline(dateStr, dryRun);
        console.log('[Scheduler] Quant pipeline complete.');
        return assertSuccess(result, 'Quant pipeline');
    } catch (e) {
        console.error('[Scheduler] Quant pipeline error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerQuantGrading = async (dateStr = null) => {
    console.log('[Scheduler] Triggering quant grading...');
    try {
        const result = await runQuantGrading(dateStr);
        console.log('[Scheduler] Quant grading complete.');
        return assertSuccess(result, 'Quant grading');
    } catch (e) {
        console.error('[Scheduler] Quant grading error:', e.message);
        return { status: 'error', error: e.message };
    }
};

export const triggerQuantPerformance = async () => {
    console.log('[Scheduler] Triggering quant performance tracking...');
    try {
        const result = await runQuantPerformance();
        console.log('[Scheduler] Quant performance tracking complete.');
        return assertSuccess(result, 'Quant performance');
    } catch (e) {
        console.error('[Scheduler] Quant performance tracking error:', e.message);
        return { status: 'error', error: e.message };
    }
};

// ── Scheduler Initialization ─────────────────────────────────────────────────────────────────────

export const initScheduler = () => {
    console.log('[Scheduler] Initializing cron jobs...');

    // Daily football predictions at 07:00 Lagos time
    const footballTask = cron.schedule('0 7 * * *', async () => {
        console.log('[Scheduler] Running daily football prediction job...');
        await triggerFootballGeneration();
    }, { timezone: 'Africa/Lagos' });
    tasks.set('football', footballTask);
    console.log('⚽ Football prediction scheduled at 07:00 Lagos');

    // Daily basketball predictions at 07:30 Lagos time
    const basketballTask = cron.schedule('30 7 * * *', async () => {
        console.log('[Scheduler] Running daily basketball prediction job...');
        await triggerBasketballGeneration();
    }, { timezone: 'Africa/Lagos' });
    tasks.set('basketball', basketballTask);
    console.log('🏀 Basketball prediction scheduled at 07:30 Lagos');

    // Daily cricket predictions at 08:00 Lagos time
    const cricketTask = cron.schedule('0 8 * * *', async () => {
        console.log('[Scheduler] Running daily cricket prediction job...');
        await triggerCricketGeneration();
    }, { timezone: 'Africa/Lagos' });
    tasks.set('cricket', cricketTask);
    console.log('🏏 Cricket prediction scheduled at 08:00 Lagos');

    // Quant pipeline at 07:45 Lagos time
    const quantTask = cron.schedule('45 7 * * *', async () => {
        console.log('[Scheduler] Running quant pipeline...');
        await triggerQuantPipeline();
    }, { timezone: 'Africa/Lagos' });
    tasks.set('quant', quantTask);
    console.log('📊 Quant pipeline scheduled at 07:45 Lagos');

    // Quant grading at 22:00 Lagos time
    const quantGradingTask = cron.schedule('0 22 * * *', async () => {
        console.log('[Scheduler] Running quant grading...');
        await triggerQuantGrading();
    }, { timezone: 'Africa/Lagos' });
    tasks.set('quantGrading', quantGradingTask);
    console.log('📊 Quant grading scheduled at 22:00 Lagos');

    // Blog generation at 08:30 Lagos time
    const blogTask = cron.schedule('30 8 * * *', async () => {
        console.log('[Scheduler] Running blog generation...');
        await triggerBlogGen();
    }, { timezone: 'Africa/Lagos' });
    tasks.set('blog', blogTask);
    console.log('📝 Blog generation scheduled at 08:30 Lagos');

    // Telegram broadcast at 09:00 Lagos time
    const telegramTask = cron.schedule('0 9 * * *', async () => {
        console.log('[Scheduler] Running Telegram broadcast...');
        await triggerTelegramBroadcast();
        // Process any pending Telegram alerts
        const { processPendingTelegramAlerts } = await import('./telegramService.js');
        await processPendingTelegramAlerts();
    }, { timezone: 'Africa/Lagos' });
    tasks.set('telegram', telegramTask);
    console.log('📱 Telegram broadcast scheduled at 09:00 Lagos');

    // Live score updates every 2 minutes during match hours
    const liveScoreTask = cron.schedule('*/2 * * * *', async () => {
        console.log('[Scheduler] Running live score update...');
        try {
            await runLiveMomentumEngine();
        } catch (e) {
            console.error('[Scheduler] Live score update error:', e.message);
        }
    }, { timezone: 'Africa/Lagos' });
    tasks.set('liveScore', liveScoreTask);
    console.log('⚡ Live score updates every 2 minutes');

    // Player stats analysis every 5 minutes during match hours
    const statsTask = cron.schedule('*/5 * * * *', async () => {
        console.log('[Scheduler] Running player stats analysis...');
        try {
            await runPlayerStatsClient();
        } catch (e) {
            console.error('[Scheduler] Player stats analysis error:', e.message);
        }
    }, { timezone: 'Africa/Lagos' });
    tasks.set('stats', statsTask);
    console.log('📈 Player stats analysis every 5 minutes');

    // Tomorrow's fixtures at 21:00 Lagos time
    const tomorrowTask = cron.schedule('0 21 * * *', async () => {
        console.log('[Scheduler] Running tomorrow fixtures job...');
        await triggerFootballGeneration();
    }, { timezone: 'Africa/Lagos' });
    tasks.set('tomorrow', tomorrowTask);
    console.log('📅 Tomorrow fixtures scheduled at 21:00 Lagos');

    // Accumulator generation at 10:00 Lagos time
    const accumulatorTask = cron.schedule('0 10 * * *', async () => {
        console.log('[Scheduler] Running accumulator generation...');
        await triggerAccumulatorGeneration();
    }, { timezone: 'Africa/Lagos' });
    tasks.set('accumulator', accumulatorTask);
    console.log('🎯 Accumulator generation scheduled at 10:00 Lagos');

    // Repair corrupted predictions at 23:30 Lagos time
    const repairTask = cron.schedule('30 23 * * *', async () => {
        console.log('[Scheduler] Running prediction repair...');
        try {
            if (admin.apps.length > 0) {
                const db = admin.firestore();
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
                await repairCorruptedPredictions(db, todayStr);
            }
        } catch (e) {
            console.error('[Scheduler] Prediction repair error:', e.message);
        }
    }, { timezone: 'Africa/Lagos' });
    tasks.set('repair', repairTask);
    console.log('🔧 Prediction repair scheduled at 23:30 Lagos');

    console.log('✅ Scheduler initialized. All cron jobs scheduled.');
};

// ── Stop Scheduler ─────────────────────────────────────────────────────────────────────

export const stopScheduler = () => {
    const allTasks = [
        'sync', 'selar', 'liveScore', 'stats', 'tomorrow',
        'basketball', 'cricket', 'blog', 'telegram', 'quant', 'quantGrading', 'repair',
        'lineup', 'football', 'accumulator'
    ];
    for (const name of allTasks) {
        const task = tasks.get(name);
        if (task) { task.stop(); tasks.delete(name); }
    }
    console.log('[Scheduler] All cron tasks stopped.');
};

// ── Repair Corrupted Predictions ─────────────────────────────────────────────────────────────────────

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
}
