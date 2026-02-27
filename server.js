import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import admin from 'firebase-admin';
import { initScheduler } from './backend/scheduler.js';
import { generateDailyPredictionsServerSide } from './backend/geminiService.js';

// Load environment variables from .env.local if available (for local dev)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize Firebase Admin (Required for write access by the backend tasks)
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin UI Initialized successfully');

        // Start the automated cron scheduler now that Admin is ready
        initScheduler();
    } else {
        console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT not found. Auto-generation scheduler will not work.');
    }
} catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
}

// Trust the reverse proxy (Render, Railway, etc.) so express-rate-limit can get the real client IP.
// This resolves the ERR_ERL_UNEXPECTED_X_FORWARDED_FOR error.
app.set('trust proxy', 1);

// Basic health check endpoint for Render/Railway (Needs to be above CORS so it isn't blocked by missing origin)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Enable CORS
// During local dev, allow localhost:5173.
// In production, allow the Netlify frontend URL.
const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://vantageaiafrica.netlify.app',
    process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, "") : null
].filter(Boolean); // Remove undefined values

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin only in local development, not in production
        if (!origin) {
            if (process.env.NODE_ENV === 'development') return callback(null, true);
            const msg = `The CORS policy for this site does not allow access from the specified Origin: no origin provided.`;
            return callback(new Error(msg), false);
        }

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

// ══════════════════════════════════════════════════════════════════════
// SPORTMONKS API PROXY
// ══════════════════════════════════════════════════════════════════════
const SPORTMONKS_API_TOKEN = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;

if (!SPORTMONKS_API_TOKEN) {
    console.error("❌ CRTICAL ERROR: SPORTMONKS_API_TOKEN environment variable is not set!");
}

// 100 requests per 15 minutes per IP for Sportmonks
const sportmonksLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests to Sportmonks API from this IP, please try again after 15 minutes' }
});

app.use('/api/sportmonks', sportmonksLimiter, createProxyMiddleware({
    target: 'https://api.sportmonks.com/v3/football',
    changeOrigin: true,
    pathRewrite: {
        '^/api/sportmonks': '', // remove base path when forwarding
    },
    onProxyReq: (proxyReq, req, res) => {
        // Append the API token to the query string securely on the backend
        const token = SPORTMONKS_API_TOKEN || '';
        const separator = proxyReq.path.includes('?') ? '&' : '?';
        proxyReq.path = `${proxyReq.path}${separator}api_token=${token}`;
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).json({ error: 'Proxy implementation error', details: err.message });
    }
}));

// ══════════════════════════════════════════════════════════════════════
// GEMINI API PROXY
// ══════════════════════════════════════════════════════════════════════
// We need to parse JSON bodies for the Gemini POST requests
app.use(express.json({ limit: '5mb' }));

const GOOGLE_GENAI_API_KEY = process.env.VITE_GOOGLE_GENAI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

if (!GOOGLE_GENAI_API_KEY) {
    console.error("❌ CRTICAL ERROR: GOOGLE_GENAI_API_KEY environment variable is not set!");
}

// 50 requests per 15 minutes per IP for Gemini
const geminiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests to Gemini API from this IP, please try again after 15 minutes' }
});

app.post('/api/gemini/generate', geminiLimiter, async (req, res) => {
    try {
        if (!GOOGLE_GENAI_API_KEY) {
            return res.status(500).json({ error: "API Key missing on server" });
        }

        const { model, contents, config } = req.body;

        if (!model || !contents) {
            return res.status(400).json({ error: "Missing required fields: model or contents" });
        }

        const ai = new GoogleGenAI({ apiKey: GOOGLE_GENAI_API_KEY });

        // Execute the call
        const response = await ai.models.generateContent({
            model,
            contents,
            config
        });

        res.json({ text: response.text });

    } catch (error) {
        console.error('Gemini Proxy Error:', error);

        // Pass through the status code if it exists on the error, otherwise 500
        const status = error.status || 500;
        res.status(status).json({
            error: 'Gemini request failed',
            details: error.message,
            status: status
        });
    }
});

// ══════════════════════════════════════════════════════════════════════
// ADMIN TRIGGER ENDPOINTS
// ══════════════════════════════════════════════════════════════════════

app.post('/api/admin/generate-football', geminiLimiter, async (req, res) => {
    try {
        console.log('[API] Manual Football Generation Triggered via Admin');
        const result = await generateDailyPredictionsServerSide();
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Generation failed', details: e.message });
    }
});

app.post('/api/admin/generate-basketball', geminiLimiter, async (req, res) => {
    res.json({ status: 'success', message: 'Basketball generation not fully implemented on backend yet.' });
});

app.post('/api/admin/grade-yesterday', geminiLimiter, async (req, res) => {
    res.json({ status: 'success', message: 'Grading not fully implemented on backend yet.' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Backend proxy server running on port ${PORT}`);
    console.log(`🌐 Allowing CORS for:`, allowedOrigins);
});
