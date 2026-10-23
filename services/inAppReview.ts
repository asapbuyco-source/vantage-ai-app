import { Capacitor } from '@capacitor/core';

/**
 * In-app review prompt (native Google Play review sheet).
 *
 * Rules (tunable):
 *  - Never before the user has had the app for 7 days
 *  - At least 5 app opens
 *  - At most once every 30 days
 *
 * Google's In-App Review API decides whether the sheet is actually shown,
 * so calling it is always safe (it may silently do nothing).
 */

const DAY = 24 * 60 * 60 * 1000;
const MIN_DAYS_BEFORE_PROMPT = 7;
const MIN_OPENS = 5;
const COOLDOWN_DAYS = 30;

const KEY_FIRST_SEEN = 'vantage_first_seen';
const KEY_OPEN_COUNT = 'vantage_open_count';
const KEY_LAST_PROMPT = 'vantage_last_review_prompt';

export const maybeRequestReview = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const now = Date.now();

    // First ever launch: record the install/first-use date and stop.
    const firstRaw = localStorage.getItem(KEY_FIRST_SEEN);
    if (!firstRaw) {
      localStorage.setItem(KEY_FIRST_SEEN, String(now));
      localStorage.setItem(KEY_OPEN_COUNT, '1');
      return;
    }

    // Count sessions (one call per app session)
    const opens = Number(localStorage.getItem(KEY_OPEN_COUNT) || 0) + 1;
    localStorage.setItem(KEY_OPEN_COUNT, String(opens));

    const firstSeen = Number(firstRaw) || now;
    const lastPrompt = Number(localStorage.getItem(KEY_LAST_PROMPT) || 0);

    if (now - firstSeen < MIN_DAYS_BEFORE_PROMPT * DAY) return;
    if (opens < MIN_OPENS) return;
    if (lastPrompt && now - lastPrompt < COOLDOWN_DAYS * DAY) return;

    // Mark before calling so a failed/skipped sheet doesn't loop
    localStorage.setItem(KEY_LAST_PROMPT, String(now));

    const { InAppReview } = await import('@capacitor-community/in-app-review');
    await InAppReview.requestReview();
  } catch (e) {
    // Never let the review prompt break the app
    console.warn('[Review] In-app review skipped:', e);
  }
};
