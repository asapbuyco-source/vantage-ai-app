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

// Custom plugin to force Service Worker cache invalidation on every build
const swVersionPlugin = () => ({
  name: 'sw-version-plugin',
  closeBundle() {
    const swPath = path.resolve(__dirname, 'dist', 'sw.js');
    if (fs.existsSync(swPath)) {
      let swContent = fs.readFileSync(swPath, 'utf-8');
      const newVersion = `v3-${Date.now()}`;
      swContent = swContent.replace(/const CACHE_VERSION = ['"].*?['"];/, `const CACHE_VERSION = '${newVersion}';`);
      fs.writeFileSync(swPath, swContent);
      console.log(`[SW Version Plugin] Injected new cache version: ${newVersion}`);
    }
  }
});

export default defineConfig({
  plugins: [
    react(),
    swVersionPlugin(),
  ],
  base: '/',
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