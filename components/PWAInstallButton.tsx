import React, { useState, useEffect } from 'react';
import { Download, X, Bell, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * PWAInstallButton — shows a native-style install prompt for Vantage AI
 * Handles beforeinstallprompt, push notification subscription, and permission flow.
 */
export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | 'loading'>('default');
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          setSwRegistration(reg);
          console.log('[PWA] Service worker registered');
        })
        .catch((err) => console.warn('[PWA] SW registration failed:', err));
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // iOS detection
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);

    // Sync notification permission state
    if ('Notification' in window) {
      setNotifStatus(Notification.permission);
    }
  }, []);

  // Capture install prompt event (Chrome/Android/Desktop)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSHint(true);
      setTimeout(() => setShowIOSHint(false), 7000);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
  };

  const handleEnableNotifications = async () => {
    if (!('Notification' in window)) return;
    setNotifStatus('loading');
    const permission = await Notification.requestPermission();
    setNotifStatus(permission);

    if (permission === 'granted' && swRegistration) {
      try {
        // Subscribe to push (VAPID key needed from server)
        const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
        const res = await fetch(`${backendUrl}/api/push/vapid-key`);
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
      } catch (e) {
        console.warn('[PWA] Push subscription failed:', e);
      }
    }
  };

  // Helper: convert VAPID key
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
  };

  // Don't render if already installed and notifications handled
  if (isInstalled && notifStatus === 'granted') return null;

  const canInstall = !isInstalled && (deferredPrompt || isIOS);
  const canNotify = notifStatus === 'default' || notifStatus === 'denied';

  if (!canInstall && !canNotify) return null;

  return (
    <div className="space-y-2">
      {/* Install App Button */}
      {canInstall && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleInstall}
          className="w-full relative overflow-hidden rounded-2xl py-4 px-5 flex items-center justify-between group shadow-lg border border-vantage-cyan/20 bg-gradient-to-r from-vantage-cyan/10 to-vantage-purple/10 hover:from-vantage-cyan/20 hover:to-vantage-purple/20 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-vantage-cyan/20 rounded-xl">
              <Download size={18} className="text-vantage-cyan" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                Install Vantage AI App
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                {isIOS ? 'Tap Share → Add to Home Screen' : 'Install for instant access + notifications'}
              </div>
            </div>
          </div>
          <Download size={16} className="text-vantage-cyan shrink-0 group-hover:translate-y-0.5 transition-transform" />
        </motion.button>
      )}

      {/* iOS hint banner */}
      <AnimatePresence>
        {showIOSHint && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-3 bg-vantage-cyan/10 border border-vantage-cyan/20 rounded-xl px-4 py-3 text-xs text-vantage-cyan"
          >
            <span className="mt-0.5">📱</span>
            <div>
              <span className="font-bold">To install on iOS:</span>
              <br />
              Tap the <strong>Share</strong> icon in Safari, then select <strong>"Add to Home Screen"</strong>
            </div>
            <button onClick={() => setShowIOSHint(false)} className="ml-auto shrink-0 opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enable Notifications Button */}
      {notifStatus !== 'granted' && notifStatus !== 'loading' && (
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
          {notifStatus === 'denied'
            ? <BellOff size={14} className="text-gray-400 shrink-0" />
            : <Bell size={14} className="text-vantage-purple shrink-0 group-hover:animate-bounce" />}
        </motion.button>
      )}
    </div>
  );
};
