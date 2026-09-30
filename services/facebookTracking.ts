import { Capacitor } from '@capacitor/core';

// Thin, defensive wrapper around the Meta/Facebook App Events SDK
// (@capgo/capacitor-facebook-analytics). All calls are no-ops on web and
// never throw — if the native Meta SDK is not configured yet (missing
// facebook_app_id / facebook_client_token in the Android resources), the
// plugin rejects and we just log a warning.
//
// To activate real tracking, fill in the real values in:
//   android/app/src/main/res/values/strings.xml

let initialized = false;
let enabled = false;

const isNative = (): boolean => {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
};

/** Initialize Meta App Events (native only). Safe to call once at startup. */
export const initFacebookTracking = async (): Promise<void> => {
    if (!isNative() || initialized) return;
    initialized = true;
    try {
        const { FacebookAnalytics } = await import('@capgo/capacitor-facebook-analytics');
        await FacebookAnalytics.enableAdvertiserTracking();
        await FacebookAnalytics.initAppEvents();
        enabled = true;
    } catch (e) {
        console.warn('[FBTrack] Init skipped (Meta SDK not configured yet):', e);
    }
};

type FbParams = Record<string, string | number | boolean | null>;

/** Log a standard or custom Facebook App Event (native only). */
export const logFacebookEvent = async (event: string, params: FbParams = {}): Promise<void> => {
    if (!enabled) return;
    try {
        const { FacebookAnalytics } = await import('@capgo/capacitor-facebook-analytics');
        await FacebookAnalytics.logEvent({ event, params });
    } catch (e) {
        console.warn('[FBTrack] logEvent failed:', e);
    }
};

/** Log a purchase / subscription App Event (native only). */
export const logFacebookPurchase = async (
    amount: number,
    currency = 'USD',
    params: FbParams = {}
): Promise<void> => {
    if (!enabled) return;
    try {
        const { FacebookAnalytics } = await import('@capgo/capacitor-facebook-analytics');
        await FacebookAnalytics.logPurchase({ amount, currency, params });
    } catch (e) {
        console.warn('[FBTrack] logPurchase failed:', e);
    }
};