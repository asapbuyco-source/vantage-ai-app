
import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const initNativeConfig = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#0f172a' }); // matches Tailwind slate-900 / vantage-bg
    } catch (e) {
      console.warn("StatusBar config failed:", e);
    }
  }
};

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Hide splash screen after React has mounted and painted
if (Capacitor.isNativePlatform()) {
  setTimeout(() => {
    SplashScreen.hide().catch(console.warn);
  }, 100);
}
initNativeConfig();

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  let hasController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hasController) {
      hasController = true;
      return;
    }
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') {
      console.log('New version detected:', event.data.version);
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        const activateWaitingWorker = () => {
          if (registration.waiting && navigator.serviceWorker.controller) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        };

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        activateWaitingWorker();
        registration.update().catch((err) => console.warn('[PWA] SW update check failed:', err));

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch((err) => console.warn('[PWA] SW update check failed:', err));
          }
        });

        window.setInterval(() => {
          registration.update().catch((err) => console.warn('[PWA] SW update check failed:', err));
        }, 30 * 60 * 1000);
      })
      .catch((err) => console.warn('[PWA] SW registration failed:', err));
  });
};

registerServiceWorker();
