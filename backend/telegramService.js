/**
 * backend/telegramService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends today's AI-generated football predictions to a Telegram group/channel.
 *
 * Configuration (stored in Firestore settings/app):
 *   telegramBotToken  : Bot API token from @BotFather
 *   telegramChannelId : Group/Channel ID (e.g. -1001234567890 or @channelname)
 *   telegramEnabled   : boolean master switch
 *   telegramSendTime  : HH:MM time the scheduler triggers this (e.g. "08:30")
 *
 * The message is sent using the Telegram Bot API via plain `fetch` —
 * no additional npm dependency required.
 */

import admin from 'firebase-admin';

const TELEGRAM_API = 'https://api.telegram.org/bot';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns today's date key YYYY-MM-DD using server local time */
const getDateKey = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Reads Telegram settings from Firestore settings/app */
const getTelegramSettings = async () => {
    const db = admin.firestore();
    const snap = await db.collection('settings').doc('app').get();
    if (!snap.exists) return null;
    const data = snap.data();
    return {
        token: data?.telegramBotToken || '',
        chatId: data?.telegramChannelId || '',
        enabled: data?.telegramEnabled === true,
    };
};

/** Calls the Telegram sendMessage API */
const sendMessage = async (token, chatId, text, parseMode = 'HTML') => {
    const url = `${TELEGRAM_API}${token}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: parseMode,
            disable_web_page_preview: true,
        }),
    });
    const result = await response.json();
    if (!result.ok) {
        throw new Error(`Telegram API error: ${result.description || JSON.stringify(result)}`);
    }
    return result;
};

/** Category → emoji labelling */
const categoryEmoji = (category) => {
    if (category === 'safe') return '🟢';
    if (category === 'value') return '🟡';
    if (category === 'risky') return '🔴';
    return '⚪';
};

// ── Message Formatter ─────────────────────────────────────────────────────────

/**
 * Builds the Telegram HTML message from today's predictions.
 * Sends safe + value picks in the main message (max 10).
 * Telegram has a 4096 character limit for one message — we keep safe/value only.
 */
const buildPredictionsMessage = (matches, dateStr) => {
    const displayDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long'
    });

    // Top picks: safe first, then value — max 10
    const priority = ['safe', 'value', 'risky'];
    const sorted = [...matches].sort((a, b) => {
        const ca = priority.indexOf(a.category ?? 'risky');
        const cb = priority.indexOf(b.category ?? 'risky');
        if (ca !== cb) return ca - cb;
        return (b.confidence ?? 0) - (a.confidence ?? 0);
    });
    const picks = sorted.slice(0, 10);

    if (picks.length === 0) {
        return null;
    }

    let msg = `🤖 <b>VANTAGE AI — Daily Predictions</b>\n`;
    msg += `📅 <i>${displayDate}</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    picks.forEach((m, i) => {
        const cat = categoryEmoji(m.category);
        const conf = m.confidence ? `${m.confidence}%` : '';
        const odds = m.odds ? `@ ${m.odds}` : '';
        const pred = m.prediction_en || m.prediction || 'N/A';

        msg += `${i + 1}. ${cat} <b>${m.homeTeam} vs ${m.awayTeam}</b>\n`;
        msg += `   🏆 ${m.league}\n`;
        msg += `   ✅ <b>${pred}</b>`;
        if (odds) msg += ` ${odds}`;
        if (conf) msg += ` · <i>${conf} confidence</i>`;
        msg += `\n`;
        if (m.analysis_en) {
            // Keep analysis short for Telegram
            const shortAnalysis = m.analysis_en.split('|').map(s => s.trim()).slice(0, 2).join(' | ');
            msg += `   📊 <i>${shortAnalysis}</i>\n`;
        }
        msg += `\n`;
    });

    const safeCount = picks.filter(m => m.category === 'safe').length;
    const totalCount = matches.length;

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📌 Showing ${picks.length} of ${totalCount} picks · ${safeCount} banker(s)\n`;
    msg += `⚡ <b>Powered by Vantage AI</b> — Smart Betting Intelligence\n`;
    msg += `\n💡 <i>Bet responsibly. Past performance ≠ future results.</i>`;

    return msg;
};

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Reads today's football predictions from Firestore and sends them
 * to the configured Telegram group/channel.
 *
 * Returns: { status, sent, error? }
 */
export const sendDailyPredictionsToTelegram = async () => {
    console.log('[Telegram] Starting daily predictions broadcast...');
    try {
        // 1. Load settings
        const settings = await getTelegramSettings();
        if (!settings) {
            console.warn('[Telegram] No settings found in Firestore. Skipping.');
            return { status: 'skipped', reason: 'no_settings' };
        }
        if (!settings.enabled) {
            console.info('[Telegram] Telegram is disabled in settings. Skipping.');
            return { status: 'skipped', reason: 'disabled' };
        }
        if (!settings.token) {
            console.warn('[Telegram] Bot token is empty. Skipping.');
            return { status: 'skipped', reason: 'no_token' };
        }
        if (!settings.chatId) {
            console.warn('[Telegram] Channel ID is empty. Skipping.');
            return { status: 'skipped', reason: 'no_chat_id' };
        }

        // 2. Load today's predictions
        const todayStr = getDateKey(0);
        const db = admin.firestore();
        const docSnap = await db.collection('daily_predictions').doc(todayStr).get();
        if (!docSnap.exists) {
            console.warn('[Telegram] No predictions doc found for today. Skipping.');
            return { status: 'skipped', reason: 'no_predictions' };
        }

        const allMatches = docSnap.data()?.matches || [];
        // Only send AI-analyzed football predictions (not raw fixtures)
        const ready = allMatches.filter(m =>
            m.prediction_en &&
            m.confidence >= 68 &&
            m.sport !== 'basketball'
        );

        if (ready.length === 0) {
            console.warn('[Telegram] No ready football predictions for today. Skipping.');
            return { status: 'skipped', reason: 'no_ready_predictions' };
        }

        // 3. Build and send message
        const message = buildPredictionsMessage(ready, todayStr);
        if (!message) {
            return { status: 'skipped', reason: 'empty_message' };
        }

        await sendMessage(settings.token, settings.chatId, message);
        console.log(`[Telegram] ✅ Predictions sent to ${settings.chatId} — ${ready.length} matches, top 10 shown.`);

        // 4. Record last send time in Firestore (for admin visibility)
        await db.collection('settings').doc('app').set({
            telegramLastSentAt: new Date().toISOString(),
            telegramLastSentCount: Math.min(ready.length, 10),
        }, { merge: true });

        return { status: 'success', sent: Math.min(ready.length, 10), total: ready.length };

    } catch (e) {
        console.error('[Telegram] Error sending predictions:', e.message);
        return { status: 'error', error: e.message };
    }
};

/**
 * Sends a custom test message to verify the bot configuration.
 * Called by the admin "Test Telegram" button via server.js.
 */
export const sendTelegramTestMessage = async () => {
    try {
        const settings = await getTelegramSettings();
        if (!settings?.token || !settings?.chatId) {
            return { status: 'error', error: 'Bot token or channel ID is not configured.' };
        }
        await sendMessage(
            settings.token,
            settings.chatId,
            `🤖 <b>Vantage AI Bot — Connection Test</b>\n\n✅ Your Telegram bot is correctly configured and working!\n\n<i>Sent at ${new Date().toISOString()}</i>`
        );
        return { status: 'success', message: 'Test message sent successfully.' };
    } catch (e) {
        return { status: 'error', error: e.message };
    }
};
