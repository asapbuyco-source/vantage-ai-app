import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: VitePWA plugin is intentionally REMOVED.
// We use a hand-crafted /public/sw.js that supports:
//   - Network-first caching with Firestore cache rules
//   - Web Push Notifications (VAPID)
//   - Offline fallback to index.html
// VitePWA would overwrite sw.js on every build and conflict with PWAInstallButton.tsx.

export default defineConfig({
  plugins: [
    react(),
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