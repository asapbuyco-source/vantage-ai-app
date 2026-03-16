/**
 * Sportmonks API Endpoint Tester
 * Run: node test-sportmonks.mjs
 */

const TOKEN = 'jFxFL5OlyrkkV9Aa1WcgwNV5kPpMuCCGfvNgmgLx5FGJ21joEHsHG47809Bn';
const BASE = 'https://api.sportmonks.com/v3/football';
const TODAY = '2026-03-16';
const TOMORROW = '2026-03-17';

async function smGet(path, params = {}) {
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set('api_token', TOKEN);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    
    try {
        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
        const json = await res.json();
        return { status: res.status, data: json };
    } catch (e) {
        return { status: 0, error: e.message };
    }
}

console.log('🔍 Testing Sportmonks API...\n');

// Test 1: Fixtures by date (today)
console.log(`=== TEST 1: /fixtures/date/${TODAY} ===`);
const t1 = await smGet(`/fixtures/date/${TODAY}`, { per_page: 3 });
console.log(`Status: ${t1.status}`);
if (t1.data?.data) {
    console.log(`Fixtures found: ${t1.data.data.length}`);
    if (t1.data.data.length > 0) {
        const f = t1.data.data[0];
        console.log(`  First fixture: ${f.id} | League: ${f.league_id} | Date: ${f.starting_at}`);
    }
} else {
    console.log('Response:', JSON.stringify(t1.data).slice(0, 300));
}

// Test 2: Fixtures by date (tomorrow)
console.log(`\n=== TEST 2: /fixtures/date/${TOMORROW} ===`);
const t2 = await smGet(`/fixtures/date/${TOMORROW}`, { per_page: 3 });
console.log(`Status: ${t2.status}`);
if (t2.data?.data) {
    console.log(`Fixtures found: ${t2.data.data.length}`);
    if (t2.data.data.length > 0) {
        const f = t2.data.data[0];
        console.log(`  First fixture: ${f.id} | League: ${f.league_id} | Date: ${f.starting_at}`);
    }
} else {
    console.log('Response:', JSON.stringify(t2.data).slice(0, 300));
}

// Test 3: Fixtures between dates with league filter
console.log(`\n=== TEST 3: /fixtures/between (next 3 days) ===`);
const t3 = await smGet(`/fixtures/between/${TODAY}/2026-03-19`, { per_page: 5, include: 'participants' });
console.log(`Status: ${t3.status}`);
if (t3.data?.data) {
    console.log(`Fixtures found: ${t3.data.data.length}`);
    t3.data.data.slice(0, 3).forEach(f => {
        const home = f.participants?.find(p => p.meta?.location === 'home')?.name || 'Home';
        const away = f.participants?.find(p => p.meta?.location === 'away')?.name || 'Away';
        console.log(`  ${home} vs ${away} | League: ${f.league_id} | Start: ${f.starting_at}`);
    });
} else {
    console.log('Response:', JSON.stringify(t3.data).slice(0, 300));
}

// Test 4: Livescores (shows what's available)
console.log(`\n=== TEST 4: /livescores ===`);
const t4 = await smGet(`/livescores`, { per_page: 3 });
console.log(`Status: ${t4.status}`);
if (t4.data?.data) {
    console.log(`Live fixtures: ${t4.data.data.length}`);
} else {
    console.log('Response:', JSON.stringify(t4.data).slice(0, 200));
}

// Test 5: Subscription info
console.log(`\n=== TEST 5: My subscription ===`);
const t5 = await fetch(`https://api.sportmonks.com/v3/my/subscription?api_token=${TOKEN}`, 
    { signal: AbortSignal.timeout(8000) });
const sub = await t5.json();
console.log(`Status: ${t5.status}`);
if (sub.data) {
    const plans = sub.data.plans || sub.data;
    console.log('Plan:', JSON.stringify(plans).slice(0, 400));
}

console.log('\n✅ Test complete.');
