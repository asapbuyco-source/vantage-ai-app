/**
 * test-logic.mjs
 * Logic-only tests for payment models, grading rules, and calculations.
 * No server required. Run with: node test-logic.mjs
 */

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name} — ${e.message}`);
        failed++;
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

console.log('\n🔍 Logic Tests — Payment Models & Grading Calculations\n');

// ── PAYMENT PLAN INTEGRITY ──────────────────────────────────────────
console.log('── Section 1: Payment Plan Integrity ──────────────────────');
const plans = { daily: 500, weekly: 1500, monthly: 4500, annual: 25000 };

test('Daily = 500 FCFA', () => assert(plans.daily === 500));

test('Weekly cheaper than daily×7 (≥50% saving)', () => {
    const d7 = plans.daily * 7; // 3500
    assert(plans.weekly < d7, `${plans.weekly} < ${d7}`);
    const saving = Math.round(((d7 - plans.weekly) / d7) * 100);
    assert(saving >= 50, `Expected ≥50% saving, got ${saving}%`);
    console.log(`      Weekly saving: ${saving}% vs daily×7`);
});

test('Monthly cheaper than weekly×4', () => {
    const w4 = plans.weekly * 4; // 6000
    assert(plans.monthly < w4, `${plans.monthly} < ${w4}`);
});

test('Annual cheaper than monthly×12 (≥50% saving)', () => {
    const m12 = plans.monthly * 12; // 54000
    assert(plans.annual < m12, `${plans.annual} < ${m12}`);
    const saving = Math.round(((m12 - plans.annual) / m12) * 100);
    assert(saving >= 50, `Expected ≥50% saving, got ${saving}%`);
    console.log(`      Annual saving: ${saving}% vs monthly×12`);
});

test('All plan prices are positive integers', () => {
    Object.entries(plans).forEach(([p, price]) => {
        assert(Number.isInteger(price) && price > 0, `${p}: invalid price ${price}`);
    });
});

// ── WIN RATE & STATS ─────────────────────────────────────────────────
console.log('\n── Section 2: Win Rate & Stats Calculations ────────────────');

test('Win rate 7/10 = 70%', () => assert(Math.round(7 / 10 * 100) === 70));
test('Win rate 5/5 = 100%', () => assert(Math.round(5 / 5 * 100) === 100));
test('Win rate 0/10 → 0 (guard div-by-zero)', () => {
    const safe = (w, t) => t > 0 ? Math.round(w / t * 100) : 0;
    assert(safe(0, 0) === 0, 'Should return 0 when total=0');
    assert(safe(0, 10) === 0, 'Should return 0 when won=0');
});

test('Category classification (safe≥80, value 70-79, risky<70)', () => {
    const cat = c => c >= 80 ? 'safe' : c >= 70 ? 'value' : 'risky';
    assert(cat(85) === 'safe');
    assert(cat(80) === 'safe', '80% is safe boundary');
    assert(cat(79) === 'value', '79% is value boundary');
    assert(cat(70) === 'value', '70% is value boundary');
    assert(cat(69) === 'risky', '69% is risky');
    assert(cat(0) === 'risky');
});

// ── EV CALCULATION ───────────────────────────────────────────────────
console.log('\n── Section 3: EV Calculation ───────────────────────────────');
const ev = (probPct, odds) => (probPct / 100) * odds - 1;
const EV_THRESHOLD = 0.06;

test('EV(75%, 2.0) = 0.5', () => assert(Math.abs(ev(75, 2.0) - 0.5) < 0.001));
test('EV(75%, 2.0) ≥ 6% threshold', () => assert(ev(75, 2.0) >= EV_THRESHOLD));
test('EV(50%, 1.5) = -0.25 (below threshold)', () => {
    const e = ev(50, 1.5);
    assert(e < EV_THRESHOLD, `EV(50%,1.5) = ${e} should be below threshold`);
});
test('EV(80%, 1.8) passes threshold', () => assert(ev(80, 1.8) >= EV_THRESHOLD));

// ── VIP EXPIRY ───────────────────────────────────────────────────────
console.log('\n── Section 4: VIP Expiry Logic ─────────────────────────────');
const daysLeft = (expiryMs) => Math.max(0, Math.ceil((expiryMs - Date.now()) / 86400000));

test('Tomorrow = 1 day remaining', () => assert(daysLeft(Date.now() + 86400000) === 1));
test('Yesterday = 0 days remaining', () => assert(daysLeft(Date.now() - 86400000) === 0));
test('7 days ahead = 7 days remaining', () => assert(daysLeft(Date.now() + 7 * 86400000) === 7));
test('Expired token: days = 0 (not negative)', () => {
    const expired = daysLeft(Date.now() - 100 * 86400000);
    assert(expired === 0, `Expected 0, got ${expired}`);
});

// ── GRADING RULES ────────────────────────────────────────────────────
console.log('\n── Section 5: Prediction Grading Rules ─────────────────────');

// Match result
const gradeHomeWin = (h, a) => h > a ? 'won' : 'lost';
const gradeAwayWin = (h, a) => a > h ? 'won' : 'lost';
const gradeDraw = (h, a) => h === a ? 'won' : 'lost';

test('Home Win: 2-1 won, 1-1 lost, 0-1 lost', () => {
    assert(gradeHomeWin(2, 1) === 'won');
    assert(gradeHomeWin(1, 1) === 'lost');
    assert(gradeHomeWin(0, 1) === 'lost');
});
test('Away Win: 0-1 won, 1-1 lost, 2-1 lost', () => {
    assert(gradeAwayWin(0, 1) === 'won');
    assert(gradeAwayWin(1, 1) === 'lost');
    assert(gradeAwayWin(2, 1) === 'lost');
});
test('Draw: 1-1 won, 2-1 lost', () => {
    assert(gradeDraw(1, 1) === 'won');
    assert(gradeDraw(2, 1) === 'lost');
});

// Double Chance
const dc1X = (h, a) => h >= a ? 'won' : 'lost';       // Home or Draw
const dcX2 = (h, a) => a >= h ? 'won' : 'lost';       // Away or Draw
const dc12 = (h, a) => h !== a ? 'won' : 'lost';      // Home or Away (not draw)

test('Double Chance 1X: home win or draw wins', () => {
    assert(dc1X(2, 1) === 'won');
    assert(dc1X(1, 1) === 'won');
    assert(dc1X(0, 1) === 'lost');
});
test('Double Chance X2: away win or draw wins', () => {
    assert(dcX2(0, 2) === 'won');
    assert(dcX2(1, 1) === 'won');
    assert(dcX2(2, 0) === 'lost');
});
test('Double Chance 12: home or away win (no draw)', () => {
    assert(dc12(2, 1) === 'won');
    assert(dc12(0, 1) === 'won');
    assert(dc12(1, 1) === 'lost', '1-1 draw should lose 12');
});

// Draw No Bet
const dnbHome = (h, a) => h > a ? 'won' : h < a ? 'lost' : 'void';
const dnbAway = (h, a) => a > h ? 'won' : a < h ? 'lost' : 'void';

test('Draw No Bet Home: 2-1 won, 0-1 lost, 1-1 void', () => {
    assert(dnbHome(2, 1) === 'won');
    assert(dnbHome(0, 1) === 'lost');
    assert(dnbHome(1, 1) === 'void');
});
test('Draw No Bet Away: 0-2 won, 1-0 lost, 1-1 void', () => {
    assert(dnbAway(0, 2) === 'won');
    assert(dnbAway(1, 0) === 'lost');
    assert(dnbAway(1, 1) === 'void');
});

// Goals totals
const over = (h, a, threshold) => (h + a) > threshold ? 'won' : 'lost';

test('Over 2.5: 2+1=3 won, 1+1=2 lost', () => {
    assert(over(2, 1, 2.5) === 'won');
    assert(over(1, 1, 2.5) === 'lost');
    assert(over(2, 0, 2.5) === 'lost');
});
test('Over 1.5: 1+1=2 won, 1+0=1 lost', () => {
    assert(over(1, 1, 1.5) === 'won');
    assert(over(1, 0, 1.5) === 'lost');
});
test('Over 0.5: any goal wins', () => {
    assert(over(1, 0, 0.5) === 'won');
    assert(over(0, 0, 0.5) === 'lost');
});

// BTTS
const btts = (h, a) => h >= 1 && a >= 1 ? 'won' : 'lost';
const bttsNo = (h, a) => (h === 0 || a === 0) ? 'won' : 'lost';

test('Both Teams Score: 1-1 won, 2-0 lost, 0-0 lost', () => {
    assert(btts(1, 1) === 'won');
    assert(btts(2, 0) === 'lost');
    assert(btts(0, 0) === 'lost');
    assert(btts(3, 2) === 'won');
});
test('Both Teams Score - No: 2-0 won, 1-1 lost', () => {
    assert(bttsNo(2, 0) === 'won');
    assert(bttsNo(0, 2) === 'won');
    assert(bttsNo(0, 0) === 'won');
    assert(bttsNo(1, 1) === 'lost');
});

// ── SELAR TOKEN SECURITY ─────────────────────────────────────────────
console.log('\n── Section 6: Selar Token Security ─────────────────────────');

test('Reference must start with VAN_', () => {
    const valid = (ref) => ref && ref.startsWith('VAN_');
    assert(valid('VAN_abc12345_daily_1234567890'));
    assert(!valid('FAKE_ref'));
    assert(!valid(''));
    assert(!valid(null));
    assert(!valid(undefined));
});

test('Token has ≥2 hour expiry window (7200000ms)', () => {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const fresh = Date.now() - 1000;
    const expired = Date.now() - TWO_HOURS - 1000;
    assert((Date.now() - fresh) < TWO_HOURS, 'Fresh token should not be expired');
    assert((Date.now() - expired) > TWO_HOURS, 'Old token should be expired');
});

test('Reference format VAN_{uid8}_{plan}_{timestamp}', () => {
    const makeRef = (uid, plan) => `VAN_${uid.slice(0, 8)}_${plan}_${Date.now()}`;
    const ref = makeRef('user123456789', 'monthly');
    assert(ref.startsWith('VAN_'), 'Should start with VAN_');
    assert(ref.includes('monthly'), 'Should include plan name');
    assert(ref.split('_').length >= 4, 'Should have at least 4 segments');
});

// ── STAT BAR CALCULATION ─────────────────────────────────────────────
console.log('\n── Section 7: Stat Bar Percentage Calculation ───────────────');

test('renderStatBar: avoids division by zero when both 0', () => {
    // Actual component code: `const total = homeVal + awayVal || 1`
    // When both=0: total=(0+0)||1=1, homePct=(0/1)*100=0 (empty bar, NOT 50/50)
    const pct = (home, away) => { const total = home + away || 1; return (home / total) * 100; };
    assert(pct(0, 0) === 0, `0+0 case: expected 0% (empty bar), got ${pct(0, 0)}%`);
    const homeOf21 = pct(2, 1);
    assert(homeOf21 > 66 && homeOf21 < 67.1, `2+1: home should be ~66.7%, got ${homeOf21.toFixed(2)}%`);
    assert(pct(1, 0) === 100, 'All-home should be 100%');
});

// ── RESULTS PAGE CALCULATIONS ────────────────────────────────────────
console.log('\n── Section 8: Results Page Total Calculations ───────────────');

test('Overall win rate across days is correct', () => {
    const history = [
        { wonCount: 7, lostCount: 3, totalGraded: 10 },
        { wonCount: 5, lostCount: 5, totalGraded: 10 },
        { wonCount: 8, lostCount: 2, totalGraded: 10 },
    ];
    const totalWon = history.reduce((s, d) => s + d.wonCount, 0);   // 20
    const totalLost = history.reduce((s, d) => s + d.lostCount, 0); // 10
    const totalGraded = totalWon + totalLost;
    const rate = totalGraded > 0 ? Math.round((totalWon / totalGraded) * 100) : 0;
    assert(totalWon === 20, `Expected 20 won, got ${totalWon}`);
    assert(totalLost === 10, `Expected 10 lost, got ${totalLost}`);
    assert(rate === 67, `Expected 67%, got ${rate}%`);
});

// ── SUMMARY ──────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(55));
console.log(`📊 RESULTS: ${passed} passed, ${failed} failed / ${passed + failed} total`);
console.log('='.repeat(55) + '\n');
if (failed > 0) process.exit(1);
