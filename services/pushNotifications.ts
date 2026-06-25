/**
 * Push Notification Service — Firebase Cloud Messaging (FCM)
 *
 * Usage:
 *  1. In Profile.tsx or App.tsx: call `requestPushPermission()` after login.
 *  2. Admin sends notifications from the Admin page using `sendPushToTopic()`.
 *  3. FCM topics: `all_users`, `vip_users`
 *
 * Setup required:
 *  - Add your VITE_FIREBASE_VAPID_KEY to .env.local
 *    (found in Firebase Console → Project Settings → Cloud Messaging → Web Push Certificates)
 */

import { getMessaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const VAPID_KEY = import.meta.env?.VITE_FIREBASE_VAPID_KEY;

/** Request push permission and save the FCM token to the user's Firestore profile. */
export const requestPushPermission = async (uid: string): Promise<boolean> => {
    try {
        if (Capacitor.isNativePlatform()) {
            let permStatus = await PushNotifications.checkPermissions();
            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }
            if (permStatus.receive !== 'granted') {
                console.log('[Native Push] Notification permission denied.');
                return false;
            }

            await PushNotifications.register();
            
            // Note: In a real app, you would add this listener only once. 
            // For simplicity here, we add it during request and save the token.
            PushNotifications.addListener('registration', async (token) => {
                await setDoc(doc(db, 'profiles', uid), {
                    fcmToken: token.value,
                    fcmUpdatedAt: new Date().toISOString(),
                }, { merge: true });
                console.log('[Native Push] ✅ Push token saved for user:', uid);
            });
            
            PushNotifications.addListener('registrationError', (error: any) => {
                console.error('[Native Push] Error on registration:', error);
            });
            return true;
        } else {
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                console.warn('[FCM] Push notifications not supported in this browser.');
                return false;
            }

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.log('[FCM] Notification permission denied.');
                return false;
            }

            if (!VAPID_KEY) {
                console.warn('[FCM] VITE_FIREBASE_VAPID_KEY not set. Push notifications disabled.');
                return false;
            }

            const messaging = getMessaging();
            const token = await getToken(messaging, { vapidKey: VAPID_KEY });

            if (token) {
                // Save token to Firestore profile so admin/Cloud Functions can target this device
                await setDoc(doc(db, 'profiles', uid), {
                    fcmToken: token,
                    fcmUpdatedAt: new Date().toISOString(),
                }, { merge: true });

                console.log('[FCM] ✅ Push token saved for user:', uid);
                return true;
            } else {
                console.warn('[FCM] No token received. Check VAPID key and service worker.');
                return false;
            }
        }
    } catch (e) {
        console.error('[FCM] Error requesting push permission:', e);
        return false;
    }
};

/**
 * Listen for foreground push notifications (app is open).
 * Call this once after the user logs in.
 * Returns an unsubscribe function.
 */
export const onForegroundMessage = (
    callback: (payload: MessagePayload) => void
): (() => void) => {
    try {
        const messaging = getMessaging();
        return onMessage(messaging, callback);
    } catch {
        return () => { };
    }
};

/**
 * Example notification titles/bodies for admin use.
 * These are sent from the Firebase Console or a Cloud Function.
 *
 * Recommended push templates:
 *  - Daily picks ready: { title: "🔥 VIP Tips du Jour", body: "Vos pronostics exclusifs sont prêts !" }
 *  - VIP expiry: { title: "⚠️ VIP expire bientôt", body: "Renouvelez your accès avant minuit." }
 *  - Match result: { title: "✅ Pronostic Gagné !", body: "Bayern 2-0 Arsenal — Résultat confirmé." }
 */
export const PUSH_TEMPLATES = {
    dailyPicks: {
        title: '🔥 VIP Tips du Jour',
        body: 'Vos pronostics exclusifs sont prêts sur Vantage AI !',
        icon: '/icons/icon-192.png',
        click_action: '/?tab=vip',
    },
    vipExpiry: {
        title: '⚠️ VIP expire bientôt',
        body: 'Renouvelez votre accès VIP avant minuit pour ne pas perdre vos avantages.',
        icon: '/icons/icon-192.png',
        click_action: '/?tab=vip',
    },
    matchResult: (homeTeam: string, awayTeam: string, result: 'WON' | 'LOST') => ({
        title: result === 'WON' ? '✅ Pronostic Gagné !' : '❌ Pronostic Perdu',
        body: `${homeTeam} vs ${awayTeam} — Résultat confirmé.`,
        icon: '/icons/icon-192.png',
        click_action: '/?tab=results',
    }),
};
