import { google } from 'googleapis';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Setup OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "http://localhost:3000/oauth2callback"
);

// We must set the credentials using the long-lived refresh token
oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

export const checkRecentSelarEmails = async () => {
    try {
        console.log('[Gmail Listener] Checking for new Selar receipts...');

        // 1. Find unread emails from Selar
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: 'from:receipts@selar.co is:unread',
            maxResults: 10
        });

        const messages = res.data.messages;
        if (!messages || messages.length === 0) {
            console.log('[Gmail Listener] No new Selar receipts found.');
            return;
        }

        console.log(`[Gmail Listener] Found ${messages.length} unread receipt(s). Processing...`);

        // 2. Loop through each message
        for (const msg of messages) {
            const messageData = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full'
            });

            // Extract the body content (it might be encoded in Base64)
            const payload = messageData.data.payload;
            let bodyText = '';

            // Gmail usually sends multipart emails. We want the plain text part.
            if (payload.parts) {
                const textPart = payload.parts.find(part => part.mimeType === 'text/plain');
                if (textPart && textPart.body && textPart.body.data) {
                    bodyText = Buffer.from(textPart.body.data, 'base64').toString('utf8');
                } else {
                    // Fallback to HTML if plain text isn't available
                    const htmlPart = payload.parts.find(part => part.mimeType === 'text/html');
                    if (htmlPart && htmlPart.body && htmlPart.body.data) {
                        bodyText = Buffer.from(htmlPart.body.data, 'base64').toString('utf8');
                    }
                }
            } else if (payload.body && payload.body.data) {
                bodyText = Buffer.from(payload.body.data, 'base64').toString('utf8');
            }

            // Fallback decoding if still empty (fallback to raw snippet)
            if (!bodyText) {
                bodyText = messageData.data.snippet || '';
            }

            console.log(`[Gmail Listener] Processing Msg ID: ${msg.id}`);

            // 3. Regex Parsing based on the provided Selar receipt structure

            // Look for the customer email. It usually appears right after the "Bio Data" or "vantage AI" line
            // We use a general email regex to find the first valid email after "Bio Data" or "Customer information".
            const emailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);

            // Note: The first email might be 'receipts@selar.co'. We want the customer's email.
            let customerEmail = null;
            if (emailMatch) {
                for (const em of emailMatch) {
                    if (!em.includes('selar.co')) {
                        customerEmail = em.toLowerCase().trim();
                        break;
                    }
                }
            }

            // Look for the exact plan name
            const textToLower = bodyText.toLowerCase();
            const isAnnual = textToLower.includes('annual pro membership');
            const isMonthly = textToLower.includes('elite monthly access');
            const isWeekly = textToLower.includes('7-day premium plan');
            const isDaily = textToLower.includes('24-hour premium access');

            let plan = 'monthly'; // default fallback
            if (isDaily) plan = 'daily';
            if (isWeekly) plan = 'weekly';
            if (isMonthly) plan = 'monthly';
            if (isAnnual) plan = 'annual';

            if (!customerEmail) {
                console.warn(`[Gmail Listener] Could not extract customer email from Msg ID ${msg.id}. Skipping.`);
                continue;
            }

            console.log(`[Gmail Listener] Parsed Customer: ${customerEmail} | Plan: ${plan}`);

            // 4. Update the User in Firebase Firestore
            const db = admin.firestore();
            const usersRef = db.collection('users');
            const q = await usersRef.where('email', '==', customerEmail).limit(1).get();

            if (q.empty) {
                console.warn(`[Gmail Listener] User ${customerEmail} not found in Firestore. Payment logged, but no account to upgrade.`);
            } else {
                const userDoc = q.docs[0];
                const userData = userDoc.data();

                // Calculate new expiry date
                let newExpiry = new Date();

                // If they are already VIP and it hasn't expired, append the time to their current expiry
                if (userData.isVip && userData.vipExpiry) {
                    const currentExpiry = new Date(userData.vipExpiry);
                    if (currentExpiry > new Date()) {
                        newExpiry = currentExpiry;
                    }
                }

                // Add time based on plan
                if (plan === 'daily') newExpiry.setDate(newExpiry.getDate() + 1);
                else if (plan === 'weekly') newExpiry.setDate(newExpiry.getDate() + 7);
                else if (plan === 'monthly') newExpiry.setMonth(newExpiry.getMonth() + 1);
                else if (plan === 'annual') newExpiry.setFullYear(newExpiry.getFullYear() + 1);
                else newExpiry.setMonth(newExpiry.getMonth() + 1); // fallback to 1 month

                await userDoc.ref.update({
                    isVip: true,
                    vipPlan: plan,
                    vipExpiry: newExpiry.toISOString(),
                    updatedAt: new Date().toISOString()
                });

                console.log(`[Gmail Listener] ✅ UPGRADED ${customerEmail} to ${plan} VIP! Expires: ${newExpiry.toISOString()}`);
            }

            // 5. Mark the email as READ so we don't process it again
            await gmail.users.messages.modify({
                userId: 'me',
                id: msg.id,
                requestBody: {
                    removeLabelIds: ['UNREAD']
                }
            });
            console.log(`[Gmail Listener] Marked Msg ID ${msg.id} as read.`);
        }

    } catch (error) {
        console.error('[Gmail Listener] Error:', error.message);
    }
};
