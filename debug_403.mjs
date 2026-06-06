import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const TOKEN_LOCAL = process.env.SPORTMONKS_API_TOKEN;
const TOKEN_LOG = "jFxFL5OlyrkkV9Aa1WcgwNV5kPpMuCCGfvNgmgLx5FGJ21joEHsHG47809Bn";

async function testToken(token, name) {
    console.log(`\n--- Testing Token: ${name} (${token.substring(0, 5)}...) ---`);
    const baseUrl = "https://api.sportmonks.com/v3/football/fixtures/date/2026-03-18";
    
    // Test 1: Basic
    try {
        const resp = await axios.get(`${baseUrl}?api_token=${token}&include=league;participants;scores;odds`);
        console.log(`[Basic] Success! Returned ${resp.data.data.length} fixtures.`);
    } catch (e) {
        console.log(`[Basic] Failed: ${e.response?.status} ${e.response?.statusText}`);
        if (e.response?.data) console.log(JSON.stringify(e.response.data, null, 2));
    }

    // Test 2: With Statistics
    try {
        const resp = await axios.get(`${baseUrl}?api_token=${token}&include=league;participants;scores;odds;statistics`);
        console.log(`[With Stats] Success! Returned ${resp.data.data.length} fixtures.`);
    } catch (e) {
        console.log(`[With Stats] Failed: ${e.response?.status} ${e.response?.statusText}`);
        if (e.response?.data) console.log(JSON.stringify(e.response.data, null, 2));
    }
}

async function run() {
    if (TOKEN_LOCAL) await testToken(TOKEN_LOCAL, "Local (.env.local)");
    await testToken(TOKEN_LOG, "Log (jFx...)");
}

run();
