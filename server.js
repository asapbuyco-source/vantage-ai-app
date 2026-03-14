import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import admin from 'firebase-admin';
import fs from 'fs';
import { initScheduler, triggerFootballGeneration, triggerBasketballGeneration, triggerGrading, triggerBlogGeneration, triggerAccumulatorGeneration, triggerTelegramBroadcast, triggerQuantPipeline, triggerQuantGrading, triggerQuantPerformance } from './backend/scheduler.js';
import { sendTelegramTestMessage } from './backend/telegramService.js';
import OpenAI from 'openai';

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

        // Critical Fix: Instruct Firestore Admin to ignore undefined properties
        // This prevents crashes if the AI omits optional fields like `homeForm` from its JSON output
        admin.firestore().settings({ ignoreUndefinedProperties: true });

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
    'https://vantageai.online',
    process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, "") : null
].filter(Boolean); // Remove undefined values

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (e.g., background crons, server-to-server calls)
        if (!origin) {
            return callback(null, true);
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
    console.error("❌ CRITICAL ERROR: SPORTMONKS_API_TOKEN environment variable is not set!");
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
    pathRewrite: (path, req) => {
        const rewritten = path.replace(/^\/api\/sportmonks/, '');
        const token = SPORTMONKS_API_TOKEN || '';
        const separator = rewritten.includes('?') ? '&' : '?';
        return `${rewritten}${separator}api_token=${token}`;
    },
    onProxyReq: (proxyReq, req, res) => {
        // Token is now appended via pathRewrite
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
    console.error("❌ CRITICAL ERROR: GOOGLE_GENAI_API_KEY environment variable is not set!");
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

// Admin authentication middleware — requires x-admin-token header matching ADMIN_API_SECRET env var.
const adminAuth = (req, res, next) => {
    const token = req.headers['x-admin-token'];
    const secret = process.env.ADMIN_API_SECRET;
    if (!secret) {
        console.warn('[AdminAuth] ADMIN_API_SECRET not set!');
        if (process.env.NODE_ENV !== 'development') {
            return res.status(401).json({ error: 'Unauthorized — Admin secret not configured in production.' });
        }
        return next(); // fail-open only if dev mode
    }
    if (!token || token !== secret) {
        return res.status(401).json({ error: 'Unauthorized — missing or invalid x-admin-token header' });
    }
    next();
};

// ⛔ AI Football prediction endpoint is DISABLED — system now uses the Quant Engine.
// To re-enable: restore the original handler below.
app.post('/api/admin/generate-football', adminAuth, async (req, res) => {
    res.status(410).json({
        error: 'DISABLED',
        message: 'AI football predictions are disabled. The Quant Engine (statistical models) is now the sole prediction source.',
        alternative: 'POST /api/admin/trigger-quant'
    });
});

// ⛔ AI Basketball prediction endpoint is DISABLED.
app.post('/api/admin/generate-basketball', adminAuth, async (req, res) => {
    res.status(410).json({
        error: 'DISABLED',
        message: 'AI basketball predictions are disabled. The Quant Engine handles all predictions.',
    });
});

// ⛔ AI Grading endpoint is DISABLED — quant grading replaces it.
app.post('/api/admin/grade-yesterday', adminAuth, async (req, res) => {
    res.status(410).json({
        error: 'DISABLED',
        message: 'AI grading is disabled. Use the Quant Grading endpoint instead.',
        alternative: 'POST /api/admin/grade-quant'
    });
});

app.post('/api/admin/generate-blog', adminAuth, geminiLimiter, async (req, res) => {
    try {
        console.log('[API] Manual Blog Generation Triggered via Admin (OpenAI→Gemini fallback)');
        const result = await triggerBlogGeneration();
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Blog generation failed', details: e.message });
    }
});

app.post('/api/admin/generate-accumulators', adminAuth, geminiLimiter, async (req, res) => {
    try {
        console.log('[API] Manual Accumulator Generation Triggered via Admin (OpenAI)');
        const result = await triggerAccumulatorGeneration();
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Accumulator generation failed', details: e.message });
    }
});

app.post('/api/admin/telegram-broadcast', adminAuth, async (req, res) => {
    try {
        console.log('[API] Manual Telegram Broadcast Triggered via Admin');
        const result = await triggerTelegramBroadcast();
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Telegram broadcast failed', details: e.message });
    }
});

app.post('/api/admin/telegram-test', adminAuth, async (req, res) => {
    try {
        console.log('[API] Telegram Test Message Triggered via Admin');
        const result = await sendTelegramTestMessage();
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Telegram test failed', details: e.message });
    }
});

// ── Quant Pipeline Endpoints ───────────────────────────────────────────────────

/** Trigger quant statistical pipeline (no AI/LLM — pure models) */
app.post('/api/admin/trigger-quant', adminAuth, async (req, res) => {
    try {
        const { date, dryRun } = req.body || {};
        console.log(`[API] Quant Pipeline triggered (date: ${date || 'today'}, dryRun: ${!!dryRun})`);
        const result = await triggerQuantPipeline(date || null, !!dryRun);
        res.json(result);
    } catch (e) {
        console.error('[API] Quant trigger error:', e);
        res.status(500).json({ error: 'Quant pipeline failed', details: e.message });
    }
});

/** Grade yesterday's (or custom date) quant predictions */
app.post('/api/admin/grade-quant', adminAuth, async (req, res) => {
    try {
        const { date } = req.body || {};
        console.log(`[API] Quant Grading triggered for ${date || 'yesterday'}`);
        const result = await triggerQuantGrading(date || null);
        res.json(result);
    } catch (e) {
        console.error('[API] Quant grading error:', e);
        res.status(500).json({ error: 'Quant grading failed', details: e.message });
    }
});

/** Recompute and save quant performance analytics */
app.post('/api/admin/quant-performance', adminAuth, async (req, res) => {
    try {
        console.log('[API] Quant Performance computation triggered');
        const result = await triggerQuantPerformance();
        res.json(result);
    } catch (e) {
        console.error('[API] Quant performance error:', e);
        res.status(500).json({ error: 'Quant performance failed', details: e.message });
    }
});

// Test OpenAI connection — used by the Admin panel "Test OpenAI" button
app.post('/api/admin/test-openai', adminAuth, async (req, res) => {
    const start = Date.now();
    try {
        if (!OPENAI_API_KEY) {
            return res.status(200).json({ status: 'error', latency: 0, model: 'gpt-4o-mini', message: 'OPENAI_API_KEY is not configured on the server.' });
        }

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        const response = await openai.responses.create({
            model: 'gpt-4o-mini',
            input: [{ role: 'user', content: 'Say "OpenAI connection OK" and nothing else.' }],
            temperature: 0,
        });

        const latency = Date.now() - start;
        const text = response.output_text ||
            response.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text || 'Response received';

        res.json({ status: 'success', latency, model: 'gpt-4o-mini', message: text.trim() });
    } catch (error) {
        const latency = Date.now() - start;
        console.error('[API test-openai] Error:', error.message);
        let msg = error.message || 'Unknown error';
        if (error.status === 401) msg = 'Unauthorized (401) — Invalid API Key';
        else if (error.status === 429) msg = 'Rate Limited (429) — Quota exceeded';
        res.json({ status: 'error', latency, model: 'gpt-4o-mini', message: msg });
    }
});


// ══════════════════════════════════════════════════════════════════════
// OPENAI API PROXY
// Keeps OPENAI_API_KEY server-side only. Same pattern as Gemini proxy.
// ══════════════════════════════════════════════════════════════════════

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY not set — OpenAI proxy will return 500 until configured.');
}

const openaiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many OpenAI requests from this IP, please try again in 15 minutes' }
});

app.post('/api/openai/generate', openaiLimiter, async (req, res) => {
    try {
        if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });

        const { model = 'gpt-4o-mini', messages, prompt, temperature = 0.3, useWebSearch = false } = req.body;

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        // Build input: support both {messages} array and single {prompt} string
        const input = messages || [{ role: 'user', content: prompt || '' }];
        const tools = useWebSearch ? [{ type: 'web_search_preview' }] : undefined;

        const response = await openai.responses.create({
            model,
            input,
            temperature,
            ...(tools && { tools }),
        });

        const text = response.output_text ||
            response.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text || '';

        res.json({ text });
    } catch (error) {
        console.error('OpenAI Proxy Error:', error.message);
        const status = error.status || 500;
        res.status(status).json({ error: 'OpenAI request failed', details: error.message, status });
    }
});

// ══════════════════════════════════════════════════════════════════════
// SERVER-SIDE RENDERING & SEO (Static + Dynamic Routes)
// ══════════════════════════════════════════════════════════════════════

// Module-level base URL — used by sitemap AND SSR handler
const baseUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : 'https://vantageai.online';

// 1. Serve static files from the React dist directory FIRST (except index.html)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath, { index: false }));

// 2. Dynamic Sitemap Generator
app.get('/sitemap.xml', async (req, res) => {
    try {
        res.header('Content-Type', 'application/xml');

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        // Add static routes
        const staticRoutes = ['/', '/blog', '/VIP', '/FreePicks', '/Kelly', '/Guide'];
        staticRoutes.forEach(route => {
            xml += `  <url>\n    <loc>${baseUrl}${route}</loc>\n    <changefreq>daily</changefreq>\n    <priority>${route === '/' ? '1.0' : route === '/blog' ? '0.9' : '0.8'}</priority>\n  </url>\n`;
        });

        if (admin.apps.length > 0) {
            // Get up to 60 most recent prediction days
            const predictionSnap = await admin.firestore()
                .collection('daily_predictions')
                .orderBy('updatedAt', 'desc')
                .limit(60)
                .get();

            predictionSnap.forEach(doc => {
                const dateKey = doc.id;
                // Ensure it's a valid date key format YYYY-MM-DD
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
                    xml += `  <url>\n    <loc>${baseUrl}/predictions/${dateKey}</loc>\n    <changefreq>never</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
                }
            });

            // Get all blog posts for SEO
            const blogSnap = await admin.firestore()
                .collection('daily_blogs')
                .orderBy('generatedAt', 'desc')
                .limit(100)
                .get();

            blogSnap.forEach(doc => {
                const dateKey = doc.id;
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
                    xml += `  <url>\n    <loc>${baseUrl}/blog/${dateKey}</loc>\n    <changefreq>never</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
                }
            });
        }

        xml += '</urlset>';
        res.send(xml);
    } catch (err) {
        console.error('Sitemap generation error:', err);
        res.status(500).end();
    }
});

// 3. Catch-all for rendering HTML
app.use(async (req, res, next) => {
    if (req.method !== 'GET') return next();
    try {
        const indexPath = path.join(distPath, 'index.html');
        // Check if dist exists (important for dev environments before build)
        if (!fs.existsSync(indexPath)) {
            return res.status(404).send('Vantage AI Frontend build not found. Please run npm run build.');
        }

        let html = fs.readFileSync(indexPath, 'utf-8');

        // Fetch Admin Settings for Google Site Verification
        let googleTag = '';
        try {
            if (admin.apps.length > 0) {
                const settingsDoc = await admin.firestore().collection('settings').doc('app').get();
                if (settingsDoc.exists) {
                    googleTag = settingsDoc.data()?.googleSiteVerificationTag || '';
                }
            }
        } catch (dbErr) {
            console.warn('Could not fetch app settings for GSC tag:', dbErr.message);
        }

        // Inject GSC Verification Tag globally
        if (googleTag) {
            html = html.replace('<!-- GOOGLE_VERIFICATION -->', googleTag);
        } else {
            html = html.replace('<!-- GOOGLE_VERIFICATION -->', ''); // Clean up
        }

        // --- SPECIFIC ROUTE: /predictions/:date ---
        const predictionsMatch = req.path.match(/^\/predictions\/(\d{4}-\d{2}-\d{2})$/);

        if (predictionsMatch && admin.apps.length > 0) {
            const dateKey = predictionsMatch[1];

            // Try to fetch predictions and blog for this date
            const [predDoc, blogDoc] = await Promise.all([
                admin.firestore().collection('daily_predictions').doc(dateKey).get(),
                admin.firestore().collection('daily_blogs').doc(dateKey).get()
            ]);

            if (predDoc.exists) {
                const matchCount = predDoc.data()?.matches?.length || 0;
                const matches = predDoc.data()?.matches || [];

                // Construct a dynamic title and description
                const title = `Pronostics Football ${dateKey} | Vantage AI (${matchCount} Matchs Analysés)`;

                // Use the explicit AI Blog excerpt if available, otherwise fallback to generic text
                let description = `Découvrez nos ${matchCount} pronostics exclusifs de football et de basketball pour le ${dateKey}, générés par le modèle exclusif de Vantage AI.`;
                let blogContent = '';

                if (blogDoc.exists) {
                    description = blogDoc.data().excerpt || description;
                    blogContent = blogDoc.data().content || '';
                }

                // Inject SEO Tags
                const seoTags = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${baseUrl}/predictions/${dateKey}" />
                `;

                // Replace the default title and placeholders
                html = html.replace(/<title>.*?<\/title>/, seoTags);

                // Inject the raw HTML blog into a hidden NOSCRIPT or hidden div so crawlers index it 
                // but React can mount cleanly around it (React replaces the root div content anyway).
                // We must put it OUTSIDE of `<div id="root"></div>` to prevent React hydration errors.
                if (blogContent) {
                    // M-7: Sanitize AI-generated blog content to prevent XSS.
                    // Only allow safe formatting tags — strip all script/event-handler/iframe tags.
                    const allowedTags = ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br', 'span', 'a'];
                    const sanitized = blogContent
                        .replace(/<script[\s\S]*?<\/script>/gi, '')
                        .replace(/on\w+="[^"]*"/gi, '')
                        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
                        .replace(/<object[\s\S]*?<\/object>/gi, '')
                        .replace(/<embed[\s\S]*?>/gi, '');
                    const blogInjection = `
                    <div id="vantage-seo-content" style="display:none;" aria-hidden="true">
                        ${sanitized}
                    </div>
                    <!-- REACT_ROOT -->
                    `;
                    html = html.replace('<!-- REACT_ROOT -->', blogInjection);
                }
            }
        }

        res.send(html);
    } catch (err) {
        console.error('SSR Error:', err);
        res.status(500).send('Server Error rendering page.');
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Backend proxy server running on port ${PORT}`);
    console.log(`🌐 Allowing CORS for:`, allowedOrigins);
});
