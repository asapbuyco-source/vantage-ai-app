import cron from 'node-cron';
import admin from 'firebase-admin';
import { generateDailyPredictionsServerSide, generateDailyBlogServerSide } from './geminiService.js';

// We'll export an initialization function so server.js can start it
export const initScheduler = () => {
    console.log('🕒 Initializing Dynamic Scheduler...');

    // Track current tasks so we can destroy and recreate them if times change
    let footballTask = null;
    let basketballTask = null;
    let gradingTask = null;
    let blogTask = null;

    let currentFootballTime = null;
    let currentBasketballTime = null;
    let currentGradingTime = null;
    let currentBlogTime = null;

    // Function to run every 5 minutes and check for updated times in Firestore
    cron.schedule('*/5 * * * *', async () => {
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

            // Football Scheduler
            if (footballTime !== currentFootballTime) {
                if (footballTask) footballTask.stop();
                currentFootballTime = footballTime;
                const [fHour, fMin] = footballTime.split(':');

                footballTask = cron.schedule(`${fMin} ${fHour} * * *`, async () => {
                    console.log(`⚽ Running scheduled Football Generation at ${footballTime}...`);
                    try {
                        await generateDailyPredictionsServerSide();
                        console.log('[Scheduler] Football generation completed.');
                    } catch (e) {
                        console.error('[Scheduler] Error in Football gen:', e);
                    }
                }, { timezone: "Africa/Lagos" });
                console.log(`✅ Scheduled Football Gen for ${footballTime}`);
            }

            // Basketball Scheduler — H-5: wired to actual generation function
            if (basketballTime !== currentBasketballTime) {
                if (basketballTask) basketballTask.stop();
                currentBasketballTime = basketballTime;
                const [bHour, bMin] = basketballTime.split(':');

                basketballTask = cron.schedule(`${bMin} ${bHour} * * *`, async () => {
                    console.log(`🏀 Running scheduled Basketball Generation at ${basketballTime}...`);
                    try {
                        // Dynamically import basketball generation if available in geminiService
                        const geminiModule = await import('./geminiService.js');
                        if (typeof geminiModule.generateBasketballPredictionsServerSide === 'function') {
                            const result = await geminiModule.generateBasketballPredictionsServerSide();
                            console.log('[Scheduler] Basketball generation completed:', result?.status || 'done');
                        } else {
                            console.warn('[Scheduler] ⚠️ generateBasketballPredictionsServerSide not yet exported from geminiService.js');
                        }
                    } catch (e) {
                        console.error('[Scheduler] Error in Basketball gen:', e);
                    }
                }, { timezone: "Africa/Lagos" });
                console.log(`✅ Scheduled Basketball Gen for ${basketballTime}`);
            }

            // Grading Scheduler — H-5: TODO placeholder with explicit warning
            if (gradingTime !== currentGradingTime) {
                if (gradingTask) gradingTask.stop();
                currentGradingTime = gradingTime;
                const [gHour, gMin] = gradingTime.split(':');

                gradingTask = cron.schedule(`${gMin} ${gHour} * * *`, async () => {
                    console.log(`📊 Running scheduled Grading at ${gradingTime}...`);
                    // TODO: Implement gradeYesterdayServerSide() in geminiService.js and call it here.
                    console.warn('[Scheduler] ⚠️ Grading task not yet implemented. Add gradeYesterdayServerSide() to geminiService.js.');
                }, { timezone: "Africa/Lagos" });
                console.log(`✅ Scheduled Grading for ${gradingTime}`);
            }

            // Blog Scheduler
            if (blogTime !== currentBlogTime) {
                if (blogTask) blogTask.stop();
                currentBlogTime = blogTime;
                const [blogHour, blogMin] = blogTime.split(':');

                blogTask = cron.schedule(`${blogMin} ${blogHour} * * *`, async () => {
                    console.log(`✍️ Running scheduled AI Blog Generation at ${blogTime}...`);
                    try {
                        const res = await generateDailyBlogServerSide();
                        console.log(`[Scheduler] Blog generation result: ${res.status}`);
                    } catch (e) {
                        console.error('[Scheduler] Error in Blog gen:', e);
                    }
                }, { timezone: "Africa/Lagos" });
                console.log(`✅ Scheduled AI Blog Gen for ${blogTime}`);
            }

        } catch (e) {
            console.error('Scheduler sync error:', e);
        }
    });

    console.log('⏳ Scheduler initialized. Config sync runs every 5 minutes (first sync in <5 min).');
};
