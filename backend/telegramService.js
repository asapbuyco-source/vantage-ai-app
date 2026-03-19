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

/** Returns today's date key YYYY-MM-DD using Africa/Lagos time (UTC+1, no DST) */
const getDateKey = (offsetDays = 0) => {
    const now = new Date();
    const lagosOffset = 60; // Africa/Lagos is always UTC+1
    const localMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
    const d = new Date(localMs);
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
 * Builds the Telegram HTML message from today's FREE (safe) predictions.
 * Only 'safe' category picks are sent — value and risky are VIP-exclusive.
 * Max 5 picks to keep messages concise and drive app installs.
 */
const buildPredictionsMessage = (matches, dateStr) => {
    const displayDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long'
    });

    // Free tier = safe picks only, ordered by confidence descending, max 3
    const picks = [...matches]
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 3);

    if (picks.length === 0) {
        return null;
    }

    let msg = `🤖 <b>VANTAGE AI — Free Daily Picks</b>\n`;
    msg += `📅 <i>${displayDate}</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    picks.forEach((m, i) => {
        const conf = m.confidence ? `${m.confidence}%` : '';
        const odds = m.odds ? `@ ${m.odds}` : '';
        const pred = m.prediction_en || m.prediction || 'N/A';

        msg += `${i + 1}. 🟢 <b>${m.homeTeam} vs ${m.awayTeam}</b>\n`;
        msg += `   🏆 ${m.league}\n`;
        msg += `   ✅ <b>${pred}</b>`;
        if (odds) msg += ` ${odds}`;
        if (conf) msg += ` · <i>${conf} confidence</i>`;
        msg += `\n`;
        if (m.analysis_en) {
            const shortAnalysis = m.analysis_en.split('|').map(s => s.trim()).slice(0, 2).join(' | ');
            msg += `   📊 <i>${shortAnalysis}</i>\n`;
        }
        msg += `\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔒 <b>More VIP picks & Stats available on the app</b>\n`;
    msg += `👉 <b><a href="https://vantageai.online">vantageai.online</a></b> 👈\n\n`;
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

        // 2. Load today's predictions from BOTH collections:
        //    - quant_predictions  : primary (Python quant_pipeline.py writes here)
        //    - daily_predictions  : legacy / AI-generated picks
        const todayStr = getDateKey(0);
        const db = admin.firestore();

        let allMatches = [];

        // 2a. Read quant_predictions (primary — Python pipeline writes here)
        const quantSnap = await db.collection('quant_predictions').doc(todayStr).get();
        if (quantSnap.exists) {
            const rawPreds = quantSnap.data()?.predictions || [];
            // Normalize snake_case → camelCase so filter logic works uniformly
            const normalized = rawPreds.map(p => ({
                ...p,
                homeTeam: p.homeTeam ?? p.home_team ?? '',
                awayTeam: p.awayTeam ?? p.away_team ?? '',
                league: p.league ?? '',
                // Quant engine stores the market label in 'prediction' and 'bet_type'
                prediction_en: p.prediction_en ?? p.prediction ?? p.bet_type ?? '',
                confidence: p.confidence ?? (p.probability ? Math.round(p.probability * 100) : 0),
                category: p.category ?? 'value',
                odds: p.odds ?? null,
                analysis_en: p.analysis_en ?? (p.ev_pct != null ? `EV: +${p.ev_pct}% | Quant Engine` : null),
            }));
            allMatches = normalized;
        }

        // 2b. Merge daily_predictions (legacy AI picks that may also exist)
        const legacySnap = await db.collection('daily_predictions').doc(todayStr).get();
        if (legacySnap.exists) {
            const legacyMatches = legacySnap.data()?.matches || [];
            const quantFixtureIds = new Set(allMatches.map(m => String(m.fixture_id ?? m.id ?? '')));
            const uniqueLegacy = legacyMatches.filter(m => {
                const fid = String(m.fixture_id ?? m.id ?? '');
                return fid && !quantFixtureIds.has(fid);
            });
            allMatches = [...allMatches, ...uniqueLegacy];
        }

        if (allMatches.length === 0) {
            console.warn('[Telegram] No predictions found for today in either collection. Skipping.');
            return { status: 'skipped', reason: 'no_predictions' };
        }

        // --- PROTECT VIP VALUE ---
        // We only care about 'safe' and 'value' picks for the VIP value calculation.
        // 'lean' picks are now included in allMatches but are not considered high-value.
        const strictPicks = allMatches.filter(m => m.category === 'safe' || m.category === 'value');

        if (strictPicks.length === 0) {
            console.warn('[Telegram] No strict (safe/value) predictions found today. Skipping.');
            return { status: 'skipped', reason: 'no_strict_predictions' };
        }

        if (strictPicks.length <= 3) {
            console.info(`[Telegram] Only ${strictPicks.length} strict predictions today. Skipping free broadcast to protect VIP value.`);
            return { status: 'skipped', reason: 'too_few_strict_predictions_protect_vip' };
        }

        // FREE TIER ONLY: send 'safe' and 'value' category picks on Telegram.
        // 'risky' or 'lean' picks are excluded/VIP-exclusive.
        const ready = strictPicks.filter(m =>
            (m.prediction_en || m.prediction || m.bet_type) &&
            m.confidence >= 55 &&
            m.sport !== 'basketball'
        );

        if (ready.length === 0) {
            console.warn('[Telegram] No ready free (safe) predictions for today. Skipping.');
            return { status: 'skipped', reason: 'no_ready_predictions' };
        }

        // 3. Build and send message
        const message = buildPredictionsMessage(ready, todayStr);
        if (!message) {
            return { status: 'skipped', reason: 'empty_message' };
        }

        await sendMessage(settings.token, settings.chatId, message);
        console.log(`[Telegram] ✅ Free predictions sent to ${settings.chatId} — ${ready.length} safe picks, up to 3 shown.`);

        // 4. Record last send time in Firestore (for admin visibility)
        await db.collection('settings').doc('app').set({
            telegramLastSentAt: new Date().toISOString(),
            telegramLastSentCount: Math.min(ready.length, 3),
        }, { merge: true });

        return { status: 'success', sent: Math.min(ready.length, 3), total: ready.length };

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
