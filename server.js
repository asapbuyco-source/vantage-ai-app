import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local if available (for local dev)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
// During local dev, allow localhost:5173.
// In production, allow the Netlify frontend URL.
const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://vantageaiafrica.netlify.app',
    process.env.FRONTEND_URL
].filter(Boolean); // Remove undefined values

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

// Basic health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════════════
// SPORTMONKS API PROXY
// ══════════════════════════════════════════════════════════════════════
const SPORTMONKS_API_TOKEN = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;

if (!SPORTMONKS_API_TOKEN) {
    console.error("❌ CRTICAL ERROR: SPORTMONKS_API_TOKEN environment variable is not set!");
}

app.use('/api/sportmonks', createProxyMiddleware({
    target: 'https://api.sportmonks.com/v3/football',
    changeOrigin: true,
    pathRewrite: {
        '^/api/sportmonks': '', // remove base path when forwarding
    },
    onProxyReq: (proxyReq, req, res) => {
        // Append the API token to the query string securely on the backend
        const url = new URL(proxyReq.path, 'http://localhost');
        url.searchParams.append('api_token', SPORTMONKS_API_TOKEN);
        proxyReq.path = url.pathname + url.search;
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).json({ error: 'Proxy implementation error', details: err.message });
    }
}));

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Backend proxy server running on port ${PORT}`);
    console.log(`🌐 Allowing CORS for:`, allowedOrigins);
});
