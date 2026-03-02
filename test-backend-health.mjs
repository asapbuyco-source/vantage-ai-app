/**
 * test-backend-health.mjs
 * Tests all backend endpoints: health, Sportmonks proxy, Gemini proxy.
 * Run with: node test-backend-health.mjs
 * Requires BACKEND_URL env var (defaults to http://localhost:8080)
 */
import fetch from 'node-fetch';

const BASE = process.env.BACKEND_URL || 'http://localhost:8080';
let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name} — ${e.message}`);
        failed++;
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg);
}

async function run() {
    console.log(`\n🔍 Backend Health Tests — ${BASE}\n`);

    // ── 1. Health Endpoint ──────────────────────────────────────────────
    await test('GET /health returns 200 with {status:"ok"}', async () => {
        const res = await fetch(`${BASE}/health`);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const json = await res.json();
        assert(json.status === 'ok', `Expected status:"ok", got ${JSON.stringify(json)}`);
        assert(typeof json.timestamp === 'string', 'Expected timestamp string');
    });

    // ── 2. Sportmonks Proxy ─────────────────────────────────────────────
    await test('GET /api/sportmonks/fixtures/date/2026-01-01 proxies correctly', async () => {
        const res = await fetch(`${BASE}/api/sportmonks/fixtures/date/2026-01-01?include=league;participants`);
        // We don't check for data (might be empty date) but response must not be a 500
        assert(res.status !== 500, `Got 500 from Sportmonks proxy: ${await res.text()}`);
        assert(res.status !== 502, `Got 502 Bad Gateway`);
        const json = await res.json();
        // Sportmonks always returns an object with "data" key
        assert(typeof json === 'object', 'Response should be JSON');
        assert('data' in json || 'message' in json, 'Missing expected Sportmonks response fields');
    });

    // ── 3. Gemini Proxy ─────────────────────────────────────────────────
    await test('POST /api/gemini/generate proxies correctly (ping test)', async () => {
        const res = await fetch(`${BASE}/api/gemini/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-2.0-flash',
                contents: 'Respond with exactly the word PONG and nothing else.',
                config: {}
            })
        });
        // Either 200 (success) or 429 (quota) are acceptable; 500 is not
        assert(res.status !== 500, `Gemini proxy returned 500: ${await res.text()}`);
        if (res.status === 200) {
            const json = await res.json();
            assert(json.text !== undefined || json.candidates !== undefined, 'Gemini response missing expected fields');
        }
    });

    // ── 4. Sitemap ──────────────────────────────────────────────────────
    await test('GET /sitemap.xml returns valid XML', async () => {
        const res = await fetch(`${BASE}/sitemap.xml`);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const text = await res.text();
        assert(text.includes('<urlset'), 'sitemap.xml missing <urlset> element');
        assert(text.includes('<url>'), 'sitemap.xml missing <url> elements');
    });

    // ── 5. Admin endpoint protection ────────────────────────────────────
    await test('POST /api/admin/generate requires x-admin-token header', async () => {
        const res = await fetch(`${BASE}/api/admin/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        // Without the token it should return 401 or 403
        assert(res.status === 401 || res.status === 403, `Admin endpoint should be protected, got ${res.status}`);
    });

    // ── Summary ─────────────────────────────────────────────────────────
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} total\n`);
    if (failed > 0) process.exit(1);
}

run().catch(e => {
    console.error('Unhandled error:', e);
    process.exit(1);
});
