const https = require('https');

const TOKEN = 'jFxFL5OlyrkkV9Aa1WcgwNV5kPpMuCCGfvNgmgLx5FGJ21joEHsHG47809Bn';

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).on('error', reject);
    });
}

async function test() {
    console.log('Testing Sportmonks API...');
    
    // Test 1: Subscription info
    console.log('\n=== TEST 1: Subscription ===');
    const t1 = await get(`https://api.sportmonks.com/v3/my/subscription?api_token=${TOKEN}`);
    console.log(`Status: ${t1.status}`);
    console.log(`Response: ${t1.data.slice(0, 300)}`);
    
    // Test 2: Fixtures by date
    console.log('\n=== TEST 2: /fixtures/date/2026-03-16 ===');
    const t2 = await get(`https://api.sportmonks.com/v3/football/fixtures/date/2026-03-16?api_token=${TOKEN}&per_page=3`);
    console.log(`Status: ${t2.status}`);
    console.log(`Response: ${t2.data.slice(0, 300)}`);
    
    // Test 3: Fixtures with filter
    console.log('\n=== TEST 3: /fixtures?filters=fixtureDate:2026-03-16 ===');
    const t3 = await get(`https://api.sportmonks.com/v3/football/fixtures?api_token=${TOKEN}&filters=fixtureDate:2026-03-16&per_page=3`);
    console.log(`Status: ${t3.status}`);
    console.log(`Response: ${t3.data.slice(0, 300)}`);
}

test().catch(console.error);
