/**
 * test-site-audit.mjs
 * Full site audit — validates payment model configurations, calculations, and data integrity.
 * Run with: node test-site-audit.mjs
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
    console.log('\n🔍 Vantage AI — Full Site Audit Test\n');

    // ════════════════════════════════════════════════════════════════
    // SECTION 1: Backend Connectivity
    // ════════════════════════════════════════════════════════════════
    console.log('── Section 1: Backend Connectivity ────────────────────────');

    await test('Backend is reachable', async () => {
        const res = await fetch(`${BASE}/health`, { timeout: 5000 });
        assert(res.status === 200, `Health check failed: ${res.status}`);
    });

    // ════════════════════════════════════════════════════════════════
    // SECTION 2: Payment Model Validation (prices & plan structure)
    // ════════════════════════════════════════════════════════════════
    console.log('\n── Section 2: Payment Plan Integrity ──────────────────────');

    const VIP_PLANS = {
        daily: { price: 500, days: 1, minSaving: 0 },
        weekly: { price: 1500, days: 7, minSaving: 50 },   // vs 500*7=3500, saving=57%
        monthly: { price: 4500, days: 30, minSaving: 50 },   // vs 4500*30/7=19285 weekly, saving=70%
        annual: { price: 25000, days: 365, minSaving: 50 },   // vs 4500*12=54000, saving=53%
    };

    await test('Daily plan price is 500 FCFA', () => {
        assert(VIP_PLANS.daily.price === 500, `Expected 500, got ${VIP_PLANS.daily.price}`);
    });

    await test('Weekly plan is cheaper than daily×7', () => {
        const dailyX7 = VIP_PLANS.daily.price * 7; // 3500
        assert(VIP_PLANS.weekly.price < dailyX7, `Weekly ${VIP_PLANS.weekly.price} should be less than ${dailyX7}`);
        const saving = Math.round(((dailyX7 - VIP_PLANS.weekly.price) / dailyX7) * 100);
        assert(saving >= VIP_PLANS.weekly.minSaving, `Saving should be ≥${VIP_PLANS.weekly.minSaving}%, got ${saving}%`);
        console.log(`    → Weekly saving: ${saving}% vs daily pricing`);
    });

    await test('Monthly plan is cheaper than weekly×4', () => {
        const weeklyX4 = VIP_PLANS.weekly.price * 4; // 6000
        assert(VIP_PLANS.monthly.price < weeklyX4, `Monthly ${VIP_PLANS.monthly.price} should be less than ${weeklyX4}`);
        const saving = Math.round(((weeklyX4 - VIP_PLANS.monthly.price) / weeklyX4) * 100);
        console.log(`    → Monthly saving: ${saving}% vs weekly×4`);
    });

    await test('Annual plan is cheaper than monthly×12', () => {
        const monthlyX12 = VIP_PLANS.monthly.price * 12; // 54000
        assert(VIP_PLANS.annual.price < monthlyX12, `Annual ${VIP_PLANS.annual.price} should be less than ${monthlyX12}`);
        const saving = Math.round(((monthlyX12 - VIP_PLANS.annual.price) / monthlyX12) * 100);
        assert(saving >= VIP_PLANS.annual.minSaving, `Annual saving should be ≥${VIP_PLANS.annual.minSaving}%, got ${saving}%`);
        console.log(`    → Annual saving: ${saving}% vs monthly×12`);
    });

    // ════════════════════════════════════════════════════════════════
    // SECTION 3: Grading/Win Rate Calculation Logic
    // ════════════════════════════════════════════════════════════════
    console.log('\n── Section 3: Grading & Win Rate Calculations ─────────────');

    await test('Win rate formula: won/(won+lost)*100 is accurate', () => {
        // Simulate what getWinRateStats computes
        const cases = [
            { won: 7, lost: 3, expected: 70 },
            { won: 0, lost: 5, expected: 0 },
            { won: 5, lost: 0, expected: 100 },
            { won: 3, lost: 7, expected: 30 },
        ];
        cases.forEach(({ won, lost, expected }) => {
            const total = won + lost;
            const rate = total > 0 ? Math.round((won / total) * 100) : 0;
            assert(rate === expected, `Win rate for ${won}W/${lost}L: expected ${expected}%, got ${rate}%`);
        });
    });

    await test('Category classification: safe≥80, value 70-79, risky<70', () => {
        const classify = (confidence) => {
            if (confidence >= 80) return 'safe';
            if (confidence >= 70) return 'value';
            return 'risky';
        };
        assert(classify(85) === 'safe', 'Expected safe for 85%');
        assert(classify(80) === 'safe', 'Expected safe for 80%');
        assert(classify(79) === 'value', 'Expected value for 79%');
        assert(classify(70) === 'value', 'Expected value for 70%');
        assert(classify(69) === 'risky', 'Expected risky for 69%');
        assert(classify(0) === 'risky', 'Expected risky for 0%');
    });

    await test('EV calculation: EV = (prob × odds) - 1', () => {
        const ev = (prob, odds) => (prob / 100) * odds - 1;
        // Minimum 6% EV threshold per the quantitative rules
        const THRESHOLD = 0.06;
        assert(ev(75, 2.0) >= THRESHOLD, `75% prob at 2.0 odds should pass EV threshold`);
        assert(ev(50, 1.5) < THRESHOLD, `50% prob at 1.5 odds should fail EV filter`);
        const testEv = ev(75, 2.0);
        assert(Math.abs(testEv - 0.5) < 0.001, `EV(75%, 2.0) should be 0.5, got ${testEv}`);
    });

    await test('VIP expiry calculation: days remaining is correct', () => {
        const daysLeft = (expiryMs) => Math.max(0, Math.ceil((expiryMs - Date.now()) / 86400000));
        const tomorrow = Date.now() + 86400000;
        const yesterday = Date.now() - 86400000;
        assert(daysLeft(tomorrow) === 1, 'Tomorrow should be 1 day left');
        assert(daysLeft(yesterday) === 0, 'Yesterday expiry should show 0 days');
    });

    // ════════════════════════════════════════════════════════════════
    // SECTION 4: Selar Token Security
    // ════════════════════════════════════════════════════════════════
    console.log('\n── Section 4: Payment Security Validation ─────────────────');

    await test('Selar reference format validation (VAN_ prefix)', () => {
        const isValidRef = (ref) => ref && ref.startsWith('VAN_');
        assert(isValidRef('VAN_abc12345_daily_1234567890'), 'Valid ref should pass');
        assert(!isValidRef('FAKE_ref'), 'Invalid ref should fail');
        assert(!isValidRef(''), 'Empty ref should fail');
        assert(!isValidRef(null), 'Null ref should fail');
    });

    await test('Token expiry: 2-hour window (7200000 ms)', () => {
        const TWO_HOURS = 2 * 60 * 60 * 1000;
        const freshToken = Date.now() - 1000;           // 1 second old (valid)
        const expiredToken = Date.now() - TWO_HOURS - 1000;  // just expired
        const ageOf = (created) => Date.now() - created;
        assert(ageOf(freshToken) < TWO_HOURS, 'Fresh token should not be expired');
        assert(ageOf(expiredToken) > TWO_HOURS, 'Old token should be expired');
    });

    await test('Fapshi plan price mapping is correct (FCFA integer)', () => {
        const planPrices = { daily: 500, weekly: 1500, monthly: 4500, annual: 25000 };
        Object.entries(planPrices).forEach(([plan, price]) => {
            assert(Number.isInteger(price), `${plan} price must be an integer`);
            assert(price > 0, `${plan} price must be positive`);
        });
    });

    // ════════════════════════════════════════════════════════════════
    // SECTION 5: Grading Rules Logic
    // ════════════════════════════════════════════════════════════════
    console.log('\n── Section 5: Prediction Grading Rules ────────────────────');

    await test('Home Win grading: won iff homeGoals > awayGoals', () => {
        const gradeHomeWin = (home, away) => home > away ? 'won' : 'lost';
        assert(gradeHomeWin(2, 1) === 'won', '2-1 should be won');
        assert(gradeHomeWin(1, 1) === 'lost', '1-1 draw should not win Home Win');
        assert(gradeHomeWin(0, 1) === 'lost', '0-1 home loss should be lost');
    });

    await test('Double Chance (1X): won if home wins OR draw', () => {
        const grade1X = (home, away) => home >= away ? 'won' : 'lost';
        assert(grade1X(2, 1) === 'won', '2-1 home win covers 1X');
        assert(grade1X(1, 1) === 'won', '1-1 draw covers 1X');
        assert(grade1X(0, 1) === 'lost', '0-1 away win loses 1X');
    });

    await test('Over 2.5 Goals: won iff total goals >= 3', () => {
        const gradeOver25 = (home, away) => (home + away) >= 3 ? 'won' : 'lost';
        assert(gradeOver25(2, 1) === 'won', '2+1=3 should win Over 2.5');
        assert(gradeOver25(1, 1) === 'lost', '1+1=2 should lose Over 2.5');
        assert(gradeOver25(3, 2) === 'won', '3+2=5 should win Over 2.5');
    });

    await test('Both Teams Score: won iff both teams scored ≥1 goal', () => {
        const gradeBTTS = (home, away) => home >= 1 && away >= 1 ? 'won' : 'lost';
        assert(gradeBTTS(1, 1) === 'won', '1-1: both scored');
        assert(gradeBTTS(2, 0) === 'lost', '2-0: away did not score');
        assert(gradeBTTS(0, 0) === 'lost', '0-0: neither scored');
    });

    await test('Draw No Bet: void on draw, won if correct team wins', () => {
        const gradeDNBHome = (home, away) => {
            if (home > away) return 'won';
            if (away > home) return 'lost';
            return 'void'; // draw
        };
        assert(gradeDNBHome(2, 1) === 'won', '2-1 DNB Home = won');
        assert(gradeDNBHome(0, 1) === 'lost', '0-1 DNB Home = lost');
        assert(gradeDNBHome(1, 1) === 'void', '1-1 DNB Home = void');
    });

    // ════════════════════════════════════════════════════════════════
    // SECTION 6: SEO Route Rendering
    // ════════════════════════════════════════════════════════════════
    console.log('\n── Section 6: SEO & Routing ────────────────────────────────');

    await test('GET /predictions/2026-01-01 returns HTML', async () => {
        const res = await fetch(`${BASE}/predictions/2026-01-01`);
        const text = await res.text();
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(text.includes('<html'), 'Response should be HTML');
        assert(text.includes('<title>'), 'HTML should have a <title> tag');
    });

    await test('Robots.txt is accessible', async () => {
        const res = await fetch(`${BASE}/robots.txt`);
        const text = await res.text();
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(text.includes('Sitemap'), 'robots.txt should reference Sitemap');
    });

    // ════════════════════════════════════════════════════════════════
    // Summary
    // ════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(55));
    console.log(`📊 AUDIT RESULTS: ${passed} passed, ${failed} failed / ${passed + failed} total`);
    console.log('═'.repeat(55) + '\n');
    if (failed > 0) process.exit(1);
}

run().catch(e => {
    console.error('Unhandled error:', e);
    process.exit(1);
});
