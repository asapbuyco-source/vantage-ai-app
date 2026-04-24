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

// Self-disable flag: set to true when credentials are revoked/expired
// Prevents flooding logs with repeated invalid_grant errors.
let _gmailDisabled = false;

/**
 * Extract the full body text from a Gmail message payload.
 * Handles both simple and multipart emails.
 */
function extractBodyText(payload) {
    if (!payload) return '';

    // Helper to decode a base64url-encoded part
    const decode = (data) => Buffer.from(data, 'base64').toString('utf8');

    // Prefer plain text, fallback to HTML
    if (payload.parts && payload.parts.length > 0) {
        // Check both top-level parts and nested parts (e.g. multipart/alternative inside multipart/mixed)
        const allParts = [];
        const flatten = (parts) => {
            for (const p of parts) {
                allParts.push(p);
                if (p.parts) flatten(p.parts);
            }
        };
        flatten(payload.parts);

        const textPart = allParts.find(p => p.mimeType === 'text/plain');
        if (textPart?.body?.data) return decode(textPart.body.data);

        const htmlPart = allParts.find(p => p.mimeType === 'text/html');
        if (htmlPart?.body?.data) return decode(htmlPart.body.data);
    }

    if (payload.body?.data) return decode(payload.body.data);
    return '';
}

/**
 * Log an unmatched payment to Firestore so the admin can manually fix it.
 * This solves the case where Selar processes the payment but the customer
 * used a different email than their Vantage account.
 */
async function logUnmatchedPayment(db, { customerEmail, plan, messageId, rawEmails }) {
    try {
        await db.collection('selar_unmatched').add({
            customerEmail: customerEmail || 'NOT_FOUND',
            emailsFoundInReceipt: rawEmails || [],
            plan,
            messageId,
            status: 'pending_manual_match',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[Gmail Listener] ⚠️  Logged unmatched payment to selar_unmatched for manual review. Email: ${customerEmail}, Plan: ${plan}`);
    } catch (e) {
        console.error('[Gmail Listener] Failed to log unmatched payment:', e.message);
    }
}

export const checkRecentSelarEmails = async () => {
    // ── Skip if credentials are known-bad (prevents log spam) ─────────────────
    if (_gmailDisabled) {
        return; // Silently skip — error already logged at disable time
    }

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

        const db = admin.firestore();

        // 2. Loop through each message
        for (const msg of messages) {
            const messageData = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full'
            });

            const payload = messageData.data.payload;
            let bodyText = extractBodyText(payload);

            // Final fallback — use the email snippet
            if (!bodyText) {
                bodyText = messageData.data.snippet || '';
            }

            console.log(`[Gmail Listener] Processing Msg ID: ${msg.id}`);
            console.log(`[Gmail Listener] Email snippet: ${(messageData.data.snippet || '').substring(0, 150)}`);

            // 3. Regex Parsing based on the provided Selar receipt structure

            // Extract ALL emails from the body (we'll filter below)
            const allEmailsInBody = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
            console.log(`[Gmail Listener] All emails found in receipt body: ${JSON.stringify(allEmailsInBody)}`);

            // Find the customer email — skip selar.co and any obvious system emails
            const SYSTEM_EMAIL_PATTERNS = ['selar.co', 'selar.com', 'noreply', 'no-reply', 'notifications', 'receipt'];
            let customerEmail = null;
            for (const em of allEmailsInBody) {
                const lower = em.toLowerCase();
                if (!SYSTEM_EMAIL_PATTERNS.some(pat => lower.includes(pat))) {
                    customerEmail = lower.trim();
                    break;
                }
            }

            // Look for the exact plan name
            const textToLower = bodyText.toLowerCase();
            const isAnnual = textToLower.includes('annual') || textToLower.includes('yearly');
            const isQuarterly = textToLower.includes('quarterly');
            const isMonthly = textToLower.includes('monthly');
            const isWeekly = textToLower.includes('weekly');

            let plan = 'weekly'; // default fallback
            // IMPORTANT: Check most-specific plan FIRST (annual > quarterly > monthly > weekly)
            // Previously this was reversed, causing monthly emails to be granted weekly access.
            if (isAnnual) plan = 'annual';
            else if (isQuarterly) plan = 'quarterly';
            else if (isMonthly) plan = 'monthly';
            else if (isWeekly) plan = 'weekly';

            console.log(`[Gmail Listener] Parsed → Customer email: ${customerEmail || 'NOT FOUND'} | Plan: ${plan}`);

            if (!customerEmail) {
                console.warn(`[Gmail Listener] ⚠️  Could not extract customer email from Msg ID ${msg.id}.`);
                await logUnmatchedPayment(db, {
                    customerEmail: null,
                    plan,
                    messageId: msg.id,
                    rawEmails: allEmailsInBody
                });
                // Mark as read so we don't retry endlessly
                await markAsRead(gmail, msg.id);
                continue;
            }

            // 4. Robust User Lookup — try multiple strategies
            const usersRef = db.collection('users');
            const profilesRef = db.collection('profiles');

            // Strategy A: Exact email match in 'users' collection
            let userDoc = null;
            let q = await usersRef.where('email', '==', customerEmail).limit(1).get();
            if (!q.empty) {
                userDoc = q.docs[0];
                console.log(`[Gmail Listener] ✅ Found user in 'users' collection by email: ${customerEmail}`);
            }

            // Strategy B: Exact email match in 'profiles' collection (Vantage uses this)
            if (!userDoc) {
                const profileQ = await profilesRef.where('email', '==', customerEmail).limit(1).get();
                if (!profileQ.empty) {
                    userDoc = profileQ.docs[0];
                    console.log(`[Gmail Listener] ✅ Found user in 'profiles' collection by email: ${customerEmail}`);
                }
            }

            // Strategy C: Case-insensitive fallback — search with lowercase (already done above since we call toLowerCase())
            // If the account email has uppercase chars, this handles it.
            if (!userDoc) {
                console.warn(`[Gmail Listener] ⚠️  No Firestore user found for email: "${customerEmail}".`);
                console.warn(`[Gmail Listener]    This usually means the customer used a different email in Selar than on Vantage.`);
                console.warn(`[Gmail Listener]    All emails found in receipt: ${JSON.stringify(allEmailsInBody)}`);
                await logUnmatchedPayment(db, {
                    customerEmail,
                    plan,
                    messageId: msg.id,
                    rawEmails: allEmailsInBody
                });
                await markAsRead(gmail, msg.id);
                continue;
            }

            // 5. Update the User in Firebase Firestore
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
            if (plan === 'weekly') newExpiry.setDate(newExpiry.getDate() + 7);
            else if (plan === 'monthly') newExpiry.setMonth(newExpiry.getMonth() + 1);
            else if (plan === 'quarterly') newExpiry.setMonth(newExpiry.getMonth() + 3);
            else if (plan === 'annual') newExpiry.setFullYear(newExpiry.getFullYear() + 1);
            else newExpiry.setDate(newExpiry.getDate() + 7); // fallback to 1 week

            await userDoc.ref.update({
                isVip: true,
                vipPlan: plan,
                vipExpiry: newExpiry.toISOString(),
                updatedAt: new Date().toISOString()
            });

            console.log(`[Gmail Listener] ✅ UPGRADED ${customerEmail} to ${plan} VIP! Expires: ${newExpiry.toISOString()}`);

            // 6. Mark the email as READ so we don't process it again
            await markAsRead(gmail, msg.id);
        }

    } catch (error) {
        // ── Detect expired/revoked OAuth token ────────────────────────────────
        if (error.message?.includes('invalid_grant') || error.code === 'invalid_grant') {
            _gmailDisabled = true;
            console.error('\n[Gmail Listener] ❌ OAUTH TOKEN EXPIRED (invalid_grant)');
            console.error('[Gmail Listener] The Gmail refresh token has been revoked or expired.');
            console.error('[Gmail Listener] TO FIX:');
            console.error('[Gmail Listener]   1. Run: node get-gmail-token.js');
            console.error('[Gmail Listener]   2. Copy the new GMAIL_REFRESH_TOKEN into your .env.local / Railway env vars');
            console.error('[Gmail Listener]   3. Restart the server');
            console.error('[Gmail Listener] Gmail listener DISABLED until server restarts with a valid token.\n');
            
            // Write error flag to Firestore for admin visibility
            try {
                const db = admin.firestore();
                await db.collection('settings').doc('system_health').set({
                    gmail_listener_error: 'invalid_grant',
                    error_message: 'Gmail refresh token expired or revoked',
                    failed_at: admin.firestore.FieldValue.serverTimestamp(),
                    requires_attention: true,
                }, { merge: true });
                console.log('[Gmail Listener] ⚠️ Wrote error flag to settings/system_health');
            } catch (firestoreErr) {
                console.error('[Gmail Listener] Failed to write error flag to Firestore:', firestoreErr.message);
            }
            return;
        }
        console.error('[Gmail Listener] Error:', error.message);
    }
};

/**
 * Helper: mark a Gmail message as read.
 */
async function markAsRead(gmail, messageId) {
    try {
        await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
                removeLabelIds: ['UNREAD']
            }
        });
        console.log(`[Gmail Listener] Marked Msg ID ${messageId} as read.`);
    } catch (e) {
        console.error(`[Gmail Listener] Failed to mark Msg ID ${messageId} as read:`, e.message);
    }
}
