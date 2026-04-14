import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ path: '.env.local' });

const token = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;

if (!token) {
    console.error('❌ No Sportmonks API token found in .env.local');
    process.exit(1);
}

const TODAY = new Date().toISOString().split('T')[0];

async function testEndpoint(name, url) {
    console.log(`\n▶ Testing: ${name}`);
    console.log(`  URL: ${url}`);
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (response.ok) {
            console.log(`  ✅ SUCCESS (${response.status})`);
            if (data.data) {
                console.log(`     Data length: ${Array.isArray(data.data) ? data.data.length : 'Object'}`);
                if (Array.isArray(data.data) && data.data.length > 0) {
                    console.log(`     Sample: ${JSON.stringify(data.data[0]).substring(0, 100)}...`);
                }
            } else {
                console.log('     Response:', JSON.stringify(data).substring(0, 100));
            }
            return true;
        } else {
            console.log(`  ❌ FAILED (${response.status})`);
            console.log(`     Message: ${data.message || JSON.stringify(data)}`);
            return false;
        }
    } catch (err) {
        console.log(`  ❌ ERROR: ${err.message}`);
        return false;
    }
}

async function run() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       SPORTMONKS BASKETBALL API SUBSCRIPTION TEST            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    const endpoints = [
        {
            name: "Basketball Leagues",
            url: `https://api.sportmonks.com/v3/basketball/leagues?api_token=${token}`
        },
        {
            name: `Basketball Fixtures (Today: ${TODAY})`,
            url: `https://api.sportmonks.com/v3/basketball/fixtures/date/${TODAY}?api_token=${token}`
        },
        {
            name: "Football Leagues (Baseline Check)",
            url: `https://api.sportmonks.com/v3/football/leagues?api_token=${token}`
        }
    ];

    let successCount = 0;
    for (const ep of endpoints) {
        const success = await testEndpoint(ep.name, ep.url);
        if (success) successCount++;
    }

    console.log('\n=============================================================');
    if (successCount >= 2) {
        console.log('✅ Your Sportmonks API key HAS ACCESS to the Basketball API!');
    } else {
        console.log('❌ Your Sportmonks API key DOES NOT have access to Basketball.');
        console.log('   (Sportmonks subscriptions are sold per-sport).');
    }
}

run();
