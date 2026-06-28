import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// NOTE: VitePWA plugin is intentionally REMOVED.
// We use a hand-crafted /public/sw.js that supports:
//   - Network-first caching with Firestore cache rules
//   - Web Push Notifications (VAPID)
//   - Offline fallback to index.html
// VitePWA would overwrite sw.js on every build and conflict with PWAInstallButton.tsx.

const IS_ANDROID_BUILD = process.env.VITE_TARGET === 'android';

// Strip web-only content from index.html for Android/mobile builds
const androidHtmlPlugin = () => ({
  name: 'android-html-plugin',
  transformIndexHtml(html: string) {
    if (!IS_ANDROID_BUILD) return html;
    console.log('[Android HTML] Stripping web-only content: Facebook Pixel, JSON-LD, SEO-only meta');
    return html
      // Remove Facebook Meta Pixel script block
      .replace(/<!-- Meta Pixel Code -->[\s\S]*?<!-- End Meta Pixel Code -->/g, '')
      // Remove noscript fallback
      .replace(/<noscript>[\s\S]*?<\/noscript>/g, (match) => match.includes('fbq') || match.includes('facebook') ? '' : match)
      // Remove JSON-LD schema (whole script block)
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
      // Remove Twitter card meta (web-only social preview)
      .replace(/<meta property="twitter:.*?\/>/g, '')
      .replace(/<meta property="twitter:.*?">/g, '')
      // Remove geo targeting (web SEO only)
      .replace(/<meta name="geo\..*?\/>/g, '')
      .replace(/<meta name="ICBM.*?\/>/g, '')
      // Remove preconnect to web-only domains
      .replace(/<link rel="preconnect" href="https:\/\/api\.sportmonks\.com">/g, '');
  }
});

// Custom plugin to force Service Worker cache invalidation on every build
const swVersionPlugin = () => ({
  name: 'sw-version-plugin',
  closeBundle() {
    const swPath = path.resolve(__dirname, 'dist', 'sw.js');
    if (fs.existsSync(swPath)) {
      let swContent = fs.readFileSync(swPath, 'utf-8');
      const newVersion = `v3-${Date.now()}`;
      const oldPattern = /const CACHE_VERSION = ['"].*?['"];/;
      if (!oldPattern.test(swContent)) {
        throw new Error(`[SW Version Plugin] CACHE_VERSION pattern not found in dist/sw.js — the version replacement failed. Check that the SW source uses the exact format: const CACHE_VERSION = 'v3-20260520';`);
      }
      swContent = swContent.replace(oldPattern, `const CACHE_VERSION = '${newVersion}';`);
      fs.writeFileSync(swPath, swContent);
      console.log(`[SW Version Plugin] Injected new cache version: ${newVersion}`);
    }
  }
});

export default defineConfig({
  plugins: [
    react(),
    androidHtmlPlugin(),
    swVersionPlugin(),
  ],
  base: './',
  define: {
    'process.env': {}, // Polyfill for libraries that expect process.env
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Code-split large pages so initial load is faster
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'framer': ['framer-motion'],
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'lucide': ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // In dev: proxy /api/* to the local backend
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});