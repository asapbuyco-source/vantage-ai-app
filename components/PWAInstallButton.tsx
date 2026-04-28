import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Bell, BellOff, Smartphone, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAppSettings } from '../services/db';

/**
 * PWAInstallButton v2
 * ─────────────────────────────────────────────────────────────
 * Handles:
 *  • Admin-configured Direct App Download Link (priority)
 *  • Chrome/Android/Edge: beforeinstallprompt native dialog
 *  • iOS Safari: manual "Add to Home Screen" guide
 *  • Push notification subscription via VAPID
 * ─────────────────────────────────────────────────────────────
 */
export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | 'loading'>('default');
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [appDownloadUrl, setAppDownloadUrl] = useState<string>('');
  const promptCaptured = useRef(false);

  // ── Fetch Admin App Download URL ─────────────────────────────────────────
  useEffect(() => {
    getAppSettings().then((s) => {
      if (s.appDownloadUrl) setAppDownloadUrl(s.appDownloadUrl);
    });
  }, []);

  // ── Service Worker Registration ──────────────────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        setSwRegistration(reg);
        // Tell existing SW to skip waiting so updates apply quickly
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        console.log('[PWA] SW registered, scope:', reg.scope);
      })
      .catch((err) => console.warn('[PWA] SW registration failed:', err));

    // Check current install state
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }
    // Also check navigator.standalone for iOS
    if ((navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Restore dismissal preference
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (dismissed === 'true') setInstallDismissed(true);

    // iOS detection
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);

    // Notification state
    if ('Notification' in window) {
      setNotifStatus(Notification.permission);
    }
  }, []);

  // ── beforeinstallprompt (Chrome / Android / Edge / Desktop) ─────────────
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (!promptCaptured.current) {
        promptCaptured.current = true;
        setDeferredPrompt(e);
        console.log('[PWA] Install prompt captured');
      }
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setInstallSuccess(true);
      console.log('[PWA] App installed');
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // ── Install Handler ──────────────────────────────────────────────────────
  const handleInstall = async () => {
    if (appDownloadUrl) {
      window.open(appDownloadUrl, '_blank');
      setInstallSuccess(true);
      return;
    }

    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    if (deferredPrompt) {
      // Native Chrome/Android prompt
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setInstallSuccess(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.warn('[PWA] Install prompt error:', err);
      }
    } else {
      // No deferred prompt yet — show the iOS-style manual guide for non-iOS too
      setShowIOSGuide(true);
    }
  };

  const handleDismissInstall = () => {
    setInstallDismissed(true);
    localStorage.setItem('pwa_install_dismissed', 'true');
  };

  // ── Push Notification Subscription ──────────────────────────────────────
  const handleEnableNotifications = async () => {
    if (!('Notification' in window)) return;
    setNotifStatus('loading');

    try {
      const permission = await Notification.requestPermission();
      setNotifStatus(permission);

      if (permission === 'granted' && swRegistration) {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
        const res = await fetch(`${backendUrl}/api/push/vapid-key`);
        if (!res.ok) throw new Error('Could not fetch VAPID key');
        const { publicKey } = await res.json();

        const sub = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        await fetch(`${backendUrl}/api/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        });
        console.log('[PWA] Push subscription saved.');
      }
    } catch (e) {
      console.warn('[PWA] Notification setup failed:', e);
      setNotifStatus('denied');
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
  };

  // ── Visibility Logic ─────────────────────────────────────────────────────
  // Already installed and notifs handled → nothing to show
  if (isInstalled && notifStatus === 'granted') return null;

  const showInstallBlock =
    !isInstalled &&
    !installDismissed &&
    !installSuccess;

  const showNotifBlock =
    !isInstalled
      ? false // Don't push notifications before app is installed — keep focus
      : notifStatus !== 'granted' && notifStatus !== 'loading';

  // After install, show notif block
  const showPostInstallNotif =
    isInstalled &&
    notifStatus !== 'granted' &&
    notifStatus !== 'loading';

  if (!showInstallBlock && !showPostInstallNotif) return null;

  return (
    <div className="space-y-2">
      {/* ── Install Success Flash ──────────────────────────────────────── */}
      <AnimatePresence>
        {installSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-2xl px-4 py-3"
          >
            <CheckCircle2 size={18} className="text-green-500 shrink-0" />
            <span className="text-sm font-bold text-green-500">
              Vantage AI installed successfully! 🎉
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Install App Button ─────────────────────────────────────────── */}
      {showInstallBlock && (
        // @ts-ignore
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative"
        >
          <button
            onClick={handleInstall}
            className="w-full relative overflow-hidden rounded-2xl py-4 px-5 flex items-center justify-between group shadow-lg border border-vantage-cyan/20 bg-gradient-to-r from-vantage-cyan/10 to-vantage-purple/10 hover:from-vantage-cyan/20 hover:to-vantage-purple/20 transition-all"
          >
            {/* Shimmer */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 pointer-events-none" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="p-2 bg-vantage-cyan/20 rounded-xl">
                <Smartphone size={18} className="text-vantage-cyan" />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Install Vantage AI App
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">
                  {appDownloadUrl
                    ? 'Get the official app directly'
                    : isIOS
                    ? 'Tap Share → Add to Home Screen'
                    : deferredPrompt
                    ? 'One-tap install — works offline too'
                    : 'Add to home screen for faster access'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 relative z-10">
              <Download size={16} className="text-vantage-cyan shrink-0 group-hover:translate-y-0.5 transition-transform" />
            </div>
          </button>
          {/* Dismiss X */}
          <button
            onClick={handleDismissInstall}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center text-gray-300 hover:text-white transition-colors"
            aria-label="Dismiss install prompt"
          >
            <X size={10} />
          </button>
        </motion.div>
      )}

      {/* ── iOS Step-by-Step Guide ─────────────────────────────────────── */}
      <AnimatePresence>
        {showIOSGuide && (
          // @ts-ignore
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-3 bg-vantage-cyan/10 border border-vantage-cyan/20 rounded-xl px-4 py-3 text-xs text-vantage-cyan">
              <span className="mt-0.5 text-base">📱</span>
              <div className="flex-1 space-y-1">
                <p className="font-bold text-sm">To install on your device:</p>
                {isIOS ? (
                  <ol className="space-y-1 text-vantage-cyan/80 list-decimal list-inside">
                    <li>Tap the <strong>Share</strong> icon (⎙) at the bottom of Safari</li>
                    <li>Scroll and tap <strong>"Add to Home Screen"</strong></li>
                    <li>Tap <strong>Add</strong> — done!</li>
                  </ol>
                ) : (
                  <ol className="space-y-1 text-vantage-cyan/80 list-decimal list-inside">
                    <li>Tap the <strong>⋮ menu</strong> in your browser</li>
                    <li>Select <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></li>
                    <li>Tap <strong>Add</strong> — done!</li>
                  </ol>
                )}
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="shrink-0 opacity-60 hover:opacity-100 mt-0.5"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Enable Notifications (only after app is installed) ────────── */}
      {showPostInstallNotif && (
        // @ts-ignore
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={handleEnableNotifications}
          className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-vantage-purple/20 bg-vantage-purple/5 hover:bg-vantage-purple/10 transition-all group"
        >
          <div className="p-2 bg-vantage-purple/20 rounded-xl">
            <Bell size={16} className="text-vantage-purple" />
          </div>
          <div className="text-left flex-1">
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {notifStatus === 'denied' ? 'Notifications Blocked' : 'Enable Push Notifications'}
            </div>
            <div className="text-[10px] text-gray-500">
              {notifStatus === 'denied'
                ? 'Allow in browser settings to get daily pick alerts'
                : 'Get notified when daily picks are ready 🎯'}
            </div>
          </div>
          {notifStatus === 'denied' ? (
            <BellOff size={14} className="text-gray-400 shrink-0" />
          ) : (
            <Bell size={14} className="text-vantage-purple shrink-0 group-hover:animate-bounce" />
          )}
        </motion.button>
      )}
    </div>
  );
};
