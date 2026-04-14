import fetch from 'node-fetch';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const API_KEY = process.env.VITE_API_BASKETBALL_KEY;

if (!API_KEY) {
    console.error('❌ Missing VITE_API_BASKETBALL_KEY in .env.local');
    process.exit(1);
}

const TODAY = new Date().toISOString().split('T')[0];

const HEADERS = {
    "x-rapidapi-host": "v1.basketball.api-sports.io",
    "x-rapidapi-key": API_KEY
};

async function runTest() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           API-BASKETBALL (API-SPORTS) KEY TEST               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    try {
        console.log(`\n▶ Testing Authentication (Fetching Timezone)`);
        let res = await fetch("https://v1.basketball.api-sports.io/timezone", {
            method: "GET",
            headers: HEADERS
        });
        
        let data = await res.json();
        
        if (data.errors && Object.keys(data.errors).length > 0) {
            console.log(`  ❌ FAILED: ${JSON.stringify(data.errors)}`);
            return;
        }
        
        console.log(`  ✅ SUCCESS Authentication!`);
        
        console.log(`\n▶ Checking Quota & Rate Limits`);
        const remaining = res.headers.get('x-ratelimit-requests-remaining');
        const limit = res.headers.get('x-ratelimit-requests-limit');
        console.log(`  Daily Requests Limit:  ${limit}`);
        console.log(`  Daily Requests Left:   ${remaining}`);
        
        
        console.log(`\n▶ Testing Real Data: Getting Today's Games (${TODAY})`);
        res = await fetch(`https://v1.basketball.api-sports.io/games?date=${TODAY}`, {
            method: "GET",
            headers: HEADERS
        });
        
        data = await res.json();
        if (data.errors && Object.keys(data.errors).length > 0) {
            console.log(`  ❌ DATA CALL FAILED: ${JSON.stringify(data.errors)}`);
        } else {
            console.log(`  ✅ SUCCESS! Found ${data.results} games globally today.`);
            if (data.response && data.response.length > 0) {
                const sample = data.response[0];
                console.log(`  Sample Game: ${sample.teams.home.name} vs ${sample.teams.away.name} (League: ${sample.league.name})`);
            }
        }
        
    } catch (e) {
        console.error(`\n❌ SCRIPT ERROR: ${e.message}`);
    }
}

runTest();
