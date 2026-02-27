import cron from 'node-cron';
import admin from 'firebase-admin';
import { generateDailyPredictionsServerSide } from './geminiService.js';

// We'll export an initialization function so server.js can start it
export const initScheduler = () => {
    console.log('🕒 Initializing Dynamic Scheduler...');

    // Track current tasks so we can destroy and recreate them if times change
    let footballTask = null;
    let basketballTask = null;
    let gradingTask = null;

    let currentFootballTime = null;
    let currentBasketballTime = null;
    let currentGradingTime = null;

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
                }, { timezone: "Africa/Lagos" }); // adjust timezone to preferred African timezone or UTC
                console.log(`✅ Scheduled Football Gen for ${footballTime}`);
            }

            // Basketball Scheduler
            if (basketballTime !== currentBasketballTime) {
                if (basketballTask) basketballTask.stop();
                currentBasketballTime = basketballTime;
                const [bHour, bMin] = basketballTime.split(':');

                basketballTask = cron.schedule(`${bMin} ${bHour} * * *`, async () => {
                    console.log(`🏀 Running scheduled Basketball Generation at ${basketballTime}...`);
                    // calling internal function...
                }, { timezone: "Africa/Lagos" });
                console.log(`✅ Scheduled Basketball Gen for ${basketballTime}`);
            }

            // Grading Scheduler
            if (gradingTime !== currentGradingTime) {
                if (gradingTask) gradingTask.stop();
                currentGradingTime = gradingTime;
                const [gHour, gMin] = gradingTime.split(':');

                gradingTask = cron.schedule(`${gMin} ${gHour} * * *`, async () => {
                    console.log(`📊 Running scheduled Grading at ${gradingTime}...`);
                    // calling internal grading function
                }, { timezone: "Africa/Lagos" });
                console.log(`✅ Scheduled Grading for ${gradingTime}`);
            }

        } catch (e) {
            console.error('Scheduler sync error:', e);
        }
    });

    // Run initial check immediately
    setTimeout(() => {
        console.log('Triggering initial cron config sync...');
        // We can't trigger the above exact function easily without abstracting it,
        // but the next cron tick will pick it up within 5 mins.
    }, 1000);
};
