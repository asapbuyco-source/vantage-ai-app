import { runQuantPipeline } from './backend/quantService.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    console.log("Starting Quant Pipeline via QuantService...");
    const res = await runQuantPipeline("2026-06-16", false);
    console.log("Result:", res);
}
test();
