/**
 * test-gemini-basketball.mjs
 * ──────────────────────────────────────────────────────────────────────────────
 * Tests each Gemini model's ability to generate basketball predictions.
 * Reports: latency, model used, picks generated, JSON validity, quality score.
 * Run: node test-gemini-basketball.mjs
 */
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const API_KEY = process.env.VITE_GOOGLE_GENAI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
if (!API_KEY) {
    console.error('❌ VITE_GOOGLE_GENAI_API_KEY not found in .env.local');
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const TODAY = new Date().toISOString().split('T')[0];

// ── Models to test (ordered by expected quality/speed) ───────────────────────
const MODELS = [
    { id: 'gemini-2.5-flash',   name: 'Gemini 2.5 Flash',        tier: 'Recommended' },
    { id: 'gemini-2.0-flash',   name: 'Gemini 2.0 Flash',        tier: 'Current Primary' },
    { id: 'gemini-2.5-pro',     name: 'Gemini 2.5 Pro',          tier: 'High Accuracy' },
    { id: 'gemini-1.5-pro',     name: 'Gemini 1.5 Pro',          tier: 'Legacy Stable' },
    { id: 'gemini-1.5-flash',   name: 'Gemini 1.5 Flash',        tier: 'Legacy Fast' },
    { id: 'gemini-1.5-flash-8b',name: 'Gemini 1.5 Flash-8B',    tier: 'Lightweight' },
];

// ── Minimal but real basketball prompt (same structure as production) ─────────
const PROMPT = `You are the "Quant-Desk Basketball Engine v2.0", an elite global basketball betting model.

DATE: ${TODAY}

Use Google Search to find basketball games scheduled for ${TODAY} (focus: NBA, EuroLeague, BAL).
Then generate 3–5 high-value betting picks.

RULES:
- EV ≥ +0.06 (6% edge minimum)
- Confidence ≥ 70%
- One market per match (Home Win, Away Win, Over/Under Points, Handicap)
- Use real stats: last 5 form, home/away record, key injuries

OUTPUT: JSON array only. No markdown. Each pick must have these exact keys:
[{
  "id": "bball-${TODAY.replace(/-/g, '')}-HomeSlug-AwaySlug",
  "homeTeam": "Full Team Name",
  "awayTeam": "Full Team Name",
  "league": "NBA",
  "time": "HH:MM",
  "prediction_en": "Home Win",
  "prediction_fr": "Victoire Domicile",
  "confidence": 78,
  "odds": 1.85,
  "category": "value",
  "analysis_en": "EV: +7.3% | Edge: 8% | Lakers 5-1 home, Warriors depleted guards",
  "analysis_fr": "EV: +7,3% | Avantage: 8% | Lakers 5-1 à domicile",
  "homeForm": "W W L W W",
  "awayForm": "L W L W L",
  "homeWinRate": 72,
  "awayWinRate": 48,
  "homeAvgScored": 118.4,
  "awayAvgScored": 111.2,
  "homeAvgConceded": 112.1,
  "awayAvgConceded": 116.8,
  "homeCleanSheetRate": 0,
  "awayCleanSheetRate": 0,
  "h2hHomeWins": 3,
  "h2hAwayWins": 2,
  "h2hDraws": 0,
  "h2hLast5Goals": "118-109, 102-115, 124-118",
  "homeInjured": ["Anthony Davis"],
  "awayInjured": [],
  "homeTeamLogo": "",
  "awayTeamLogo": "",
  "sport": "basketball",
  "status": "pending"
}]`;

// ── JSON Extractor (same as production) ──────────────────────────────────────
function extractJson(text) {
    if (!text) return null;
    let cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    try { return JSON.parse(cleaned); } catch (_) {}

    const firstBracket = cleaned.indexOf('[');
    if (firstBracket !== -1) {
        let depth = 0, inStr = false, esc = false, lastEnd = -1;
        const partial = cleaned.substring(firstBracket);
        for (let i = 0; i < partial.length; i++) {
            const c = partial[i];
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (!inStr) {
                if (c === '[') depth++;
                else if (c === ']') { depth--; if (depth === 0) { lastEnd = i; break; } }
            }
        }
        if (lastEnd !== -1) {
            try { return JSON.parse(partial.substring(0, lastEnd + 1)); } catch (_) {}
        }
        try { return JSON.parse(partial); } catch (_) {}
    }
    return null;
}

// ── Quality Scorer ────────────────────────────────────────────────────────────
function scoreResult(picks) {
    if (!Array.isArray(picks) || picks.length === 0) return 0;
    let score = 0;
    const requiredKeys = ['id','homeTeam','awayTeam','league','prediction_en','confidence','odds','analysis_en','homeForm','awayForm','homeWinRate','homeAvgScored'];
    for (const pick of picks) {
        const present = requiredKeys.filter(k => pick[k] !== undefined && pick[k] !== '' && pick[k] !== null);
        score += (present.length / requiredKeys.length) * 10;
        if (pick.confidence >= 70) score += 2;
        if (pick.odds > 1.3 && pick.odds < 5) score += 2;
        if (pick.analysis_en?.includes('EV:')) score += 3;
        if (pick.homeForm && pick.homeForm.match(/[WLD]/)) score += 2;
        if (Array.isArray(pick.homeInjured)) score += 1;
    }
    return Math.min(100, Math.round(score / picks.length));
}

// ── Main Test Runner ─────────────────────────────────────────────────────────
const results = [];

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log(`║    GEMINI BASKETBALL MODEL TEST — ${TODAY}            ║`);
console.log('╚══════════════════════════════════════════════════════════════╝\n');

for (const model of MODELS) {
    console.log(`\n▶ Testing: ${model.name} (${model.id}) [${model.tier}]`);
    const result = {
        id: model.id,
        name: model.name,
        tier: model.tier,
        status: '❌ Failed',
        latency: null,
        picks: 0,
        quality: 0,
        error: null,
        sample: null,
        tokensUsed: null,
        supportsSearch: false,
    };

    // ── Test WITH Google Search grounding (production mode) ─────────────────
    const t0 = Date.now();
    try {
        const response = await ai.models.generateContent({
            model: model.id,
            contents: PROMPT,
            config: {
                temperature: 0.15,
                tools: [{ googleSearch: {} }],
            }
        });

        result.latency = Date.now() - t0;
        result.supportsSearch = true;

        let text = '';
        if (typeof response.text === 'function') text = response.text();
        else if (typeof response.text === 'string') text = response.text;

        const parsed = extractJson(text);
        if (parsed && Array.isArray(parsed)) {
            result.picks = parsed.length;
            result.quality = scoreResult(parsed);
            result.status = '✅ OK';
            if (parsed[0]) {
                result.sample = `${parsed[0].homeTeam} vs ${parsed[0].awayTeam} → ${parsed[0].prediction_en} (${parsed[0].confidence}% conf, @${parsed[0].odds})`;
            }
        } else {
            result.status = '⚠️ Responded but bad JSON';
            result.sample = text?.substring(0, 120);
        }

        // Token usage (if available)
        const usage = response.usageMetadata;
        if (usage) result.tokensUsed = `${usage.promptTokenCount ?? '?'}in / ${usage.candidatesTokenCount ?? '?'}out`;

    } catch (err) {
        result.latency = Date.now() - t0;

        // If search grounding fails, try without it
        if (err.message?.includes('grounding') || err.message?.includes('tool') || err.message?.includes('not supported')) {
            console.log(`  ⚠️  Google Search not supported on ${model.id}. Retrying without grounding...`);
            try {
                const t1 = Date.now();
                const response2 = await ai.models.generateContent({
                    model: model.id,
                    contents: PROMPT,
                    config: { temperature: 0.15 }
                });
                result.latency = Date.now() - t1;
                result.supportsSearch = false;

                let text = '';
                if (typeof response2.text === 'function') text = response2.text();
                else if (typeof response2.text === 'string') text = response2.text;

                const parsed = extractJson(text);
                if (parsed && Array.isArray(parsed)) {
                    result.picks = parsed.length;
                    result.quality = scoreResult(parsed);
                    result.status = '✅ OK (no grounding)';
                    if (parsed[0]) result.sample = `${parsed[0].homeTeam} vs ${parsed[0].awayTeam} → ${parsed[0].prediction_en}`;
                } else {
                    result.status = '⚠️ No Search + bad JSON';
                    result.sample = text?.substring(0, 120);
                }
            } catch (err2) {
                result.status = '❌ Failed (with/without search)';
                result.error = err2.message?.substring(0, 100);
            }
        } else {
            result.status = '❌ Failed';
            result.error = err.message?.substring(0, 100);
        }
    }

    results.push(result);

    // Print result inline
    console.log(`  Status   : ${result.status}`);
    console.log(`  Latency  : ${result.latency ? result.latency + 'ms' : 'N/A'}`);
    console.log(`  Picks    : ${result.picks}`);
    console.log(`  Quality  : ${result.quality}/100`);
    console.log(`  Search   : ${result.supportsSearch ? '✅ Grounded' : '⚠️ No grounding'}`);
    if (result.sample) console.log(`  Sample   : ${result.sample}`);
    if (result.error)  console.log(`  Error    : ${result.error}`);
    if (result.tokensUsed) console.log(`  Tokens   : ${result.tokensUsed}`);

    // Small delay between models to avoid rate limit clash
    await new Promise(r => setTimeout(r, 2000));
}

// ── Summary Table ─────────────────────────────────────────────────────────────
console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                    SUMMARY — RANKED BY QUALITY              ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const ranked = [...results].sort((a, b) => {
    if (a.status.startsWith('✅') && !b.status.startsWith('✅')) return -1;
    if (!a.status.startsWith('✅') && b.status.startsWith('✅')) return 1;
    return (b.quality - a.quality) || (a.latency - b.latency);
});

console.log('\n  Rank │ Model               │ Status          │ Picks │ Quality │ Latency │ Search');
console.log('  ─────┼─────────────────────┼─────────────────┼───────┼─────────┼─────────┼────────');
ranked.forEach((r, i) => {
    const rank   = String(i + 1).padStart(4);
    const name   = r.name.padEnd(19);
    const status = r.status.padEnd(15);
    const picks  = String(r.picks).padStart(5);
    const qual   = (String(r.quality) + '/100').padStart(7);
    const lat    = (r.latency ? r.latency + 'ms' : 'N/A').padStart(7);
    const search = r.supportsSearch ? '✅ Yes' : '❌ No';
    console.log(`  ${rank} │ ${name} │ ${status} │ ${picks} │ ${qual} │ ${lat} │ ${search}`);
});

// ── Recommendation ────────────────────────────────────────────────────────────
const best = ranked.find(r => r.status.startsWith('✅') && r.supportsSearch);
const bestNoSearch = ranked.find(r => r.status.startsWith('✅'));
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                      RECOMMENDATION                         ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
if (best) {
    console.log(`\n  🏆 BEST GEMINI MODEL FOR BASKETBALL (with Google Search):`);
    console.log(`     → ${best.name} (${best.id})`);
    console.log(`     Quality: ${best.quality}/100 | Picks: ${best.picks} | Latency: ${best.latency}ms`);
    console.log(`\n  📝 Recommendation: Use '${best.id}' as the Gemini fallback for basket.`);
    console.log(`     This provides Google Search grounding for live game schedules.`);
} else if (bestNoSearch) {
    console.log(`\n  ⚠️ No model supports Google Search grounding.`);
    console.log(`     Best without grounding: ${bestNoSearch.name} (${bestNoSearch.id})`);
    console.log(`     Quality: ${bestNoSearch.quality}/100 | Picks: ${bestNoSearch.picks}`);
} else {
    console.log(`\n  ❌ All models failed. Check API key and quota.`);
}

// Save full results to file
const outFile = 'gemini-basketball-test-results.json';
fs.writeFileSync(outFile, JSON.stringify({ testedAt: new Date().toISOString(), results: ranked }, null, 2));
console.log(`\n  📄 Full results saved to: ${outFile}\n`);
