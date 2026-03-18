/**
 * backend/quantService.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Node.js wrapper that spawns the Python quant pipeline.
 * Called by scheduler.js for daily automated runs, and by server.js for
 * admin on-demand triggers.
 *
 * The Python process handles all statistical model computation.
 * This module collects stdout, parses the result, and returns a standardized
 * { status, generated, predictions } object.
 */

import { spawn, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUANT_SCRIPT = path.join(__dirname, 'quant', 'quant_pipeline.py');

// Resolve the correct Python binary name (python3 preferred, fall back to python)
// Also tries absolute paths for Nixpacks / nix-store environments (Railway, Render).
function resolvePythonBin() {
    const candidates = [
        'python3',
        'python',
        // Nixpacks (Railway) nix-store paths for python3.11
        '/nix/var/nix/profiles/default/bin/python3',
        '/root/.nix-profile/bin/python3',
        '/usr/bin/python3',
        '/usr/local/bin/python3',
        '/usr/bin/python',
    ];

    for (const candidate of candidates) {
        try {
            const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 3000 });
            if (result.status === 0) {
                const ver = (result.stdout || result.stderr || '').trim();
                console.log(`[QuantService] ✅ Python binary resolved: ${candidate} (${ver})`);
                return candidate;
            }
        } catch (_) { /* binary not available */ }
    }

    // None found — log a detailed diagnostic
    const pathEnv = process.env.PATH || '(not set)';
    console.error(`[QuantService] ❌ CRITICAL: No Python binary found in PATH or absolute locations.`);
    console.error(`[QuantService]   PATH = ${pathEnv}`);
    console.error(`[QuantService]   Tried: ${candidates.join(', ')}`);
    console.error(`[QuantService]   Fix: ensure nixpacks.toml includes python311 and railway.toml runs pip install.`);
    return 'python3'; // will surface a clear ENOENT error at spawn time
}

const PYTHON_BIN = resolvePythonBin();

// ── Env forward to Python process ─────────────────────────────────────────────
function buildPythonEnv() {
    return {
        ...process.env,
        SPORTMONKS_API_TOKEN: process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN || '',
        FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT || '',
        PYTHONUNBUFFERED: '1',         // Ensure real-time stdout
        PYTHONPATH: path.join(__dirname, 'quant'),
    };
}

// ── Spawn Python quant pipeline ───────────────────────────────────────────────
async function spawnPythonPipeline(dateStr = null, dryRun = false) {
    return new Promise((resolve, reject) => {
        const args = ['quant_pipeline.py'];
        if (dateStr) args.push(dateStr);
        if (dryRun) args.push('--dry-run');

        console.log(`[QuantService] Spawning Python pipeline: ${PYTHON_BIN} ${args.join(' ')}`);

        const py = spawn(PYTHON_BIN, args, {
            cwd: path.join(__dirname, 'quant'),
            env: buildPythonEnv(),
        });

        let stdout = '';
        let stderr = '';

        py.stdout.on('data', (data) => {
            const line = data.toString();
            stdout += line;
            // Stream pipeline log lines to main Node log
            line.split('\n').filter(Boolean).forEach(l => console.log(`[Python|Quant] ${l}`));
        });

        py.stderr.on('data', (data) => {
            const line = data.toString();
            stderr += line;
            line.split('\n').filter(Boolean).forEach(l => console.warn(`[Python|Quant|ERR] ${l}`));
        });

        py.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Python process exited with code ${code}: ${stderr.slice(-500)}`));
                return;
            }
            resolve({ stdout, stderr });
        });

        py.on('error', (err) => {
            reject(new Error(`Failed to spawn Python: ${err.message}`));
        });

        // Safety timeout: 10 minutes
        setTimeout(() => {
            py.kill('SIGTERM');
            reject(new Error('Quant pipeline timed out after 10 minutes'));
        }, 10 * 60 * 1000);
    });
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Run the quantitative football pipeline for the given date.
 * If dateStr is null, uses today's date (Lagos UTC+1).
 *
 * @param {string|null} dateStr - YYYY-MM-DD
 * @param {boolean} dryRun      - If true, no API calls, no Firestore writes
 * @returns {Promise<{status, generated, date, matches_analyzed}>}
 */
export const runQuantPipeline = async (dateStr = null, dryRun = false) => {
    const label = dryRun ? 'DRY RUN' : (dateStr || 'today');
    console.log(`[QuantService] Starting Quant Pipeline (${label})...`);

    try {
        const { stdout } = await spawnPythonPipeline(dateStr, dryRun);

        // Try to extract summary from stdout "[QuantPipeline] ✅ Pipeline complete!"
        const matchesMatch = stdout.match(/Matches analyzed:\s*(\d+)/);
        const betsMatch = stdout.match(/Value bets found:\s*(\d+)/);
        const matchesAnalyzed = matchesMatch ? parseInt(matchesMatch[1]) : 0;
        const generated = betsMatch ? parseInt(betsMatch[1]) : 0;

        // Read the actual predictions from Firestore for confirmation
        let predictions = [];
        if (!dryRun) {
            try {
                const db = admin.firestore();
                const effectiveDate = dateStr || getLagosDateKey();
                const doc = await db.collection('quant_predictions').doc(effectiveDate).get();
                if (doc.exists) {
                    predictions = doc.data()?.predictions || [];
                }
            } catch (fsErr) {
                console.warn(`[QuantService] Could not read Firestore confirmation: ${fsErr.message}`);
            }
        }

        console.log(`[QuantService] ✅ Quant Pipeline done: ${generated} value bets from ${matchesAnalyzed} matches.`);
        return {
            status: 'success',
            generated: predictions.length || generated,
            matches_analyzed: matchesAnalyzed,
            date: dateStr || getLagosDateKey(),
        };
    } catch (err) {
        console.error(`[QuantService] ❌ Quant Pipeline failed: ${err.message}`);
        return { status: 'error', error: err.message };
    }
};

/**
 * Run grading for yesterday (or a custom date).
 */
export const runQuantGrading = async (dateStr = null) => {
    console.log(`[QuantService] Starting Quant Grading for ${dateStr || 'yesterday'}...`);
    try {
        const args = ['grading_engine.py'];
        if (dateStr) args.push(dateStr);

        const result = await new Promise((resolve, reject) => {
            const py = spawn(PYTHON_BIN, args, {
                cwd: path.join(__dirname, 'quant'),
                env: buildPythonEnv(),
            });
            let stdout = '';
            py.stdout.on('data', d => { stdout += d; console.log(`[Python|Grading] ${d.toString().trim()}`); });
            py.stderr.on('data', d => console.warn(`[Python|Grading|ERR] ${d.toString().trim()}`));
            py.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`Exit code ${code}`)));
            py.on('error', reject);
            setTimeout(() => { py.kill(); reject(new Error('Grading timeout')); }, 5 * 60 * 1000);
        });

        const gradedMatch = result.match(/Graded (\d+)\/(\d+)/);
        return {
            status: 'success',
            graded: gradedMatch ? parseInt(gradedMatch[1]) : 0,
            total: gradedMatch ? parseInt(gradedMatch[2]) : 0,
        };
    } catch (err) {
        console.error(`[QuantService] Grading error: ${err.message}`);
        return { status: 'error', error: err.message };
    }
};

/**
 * Run performance tracker and save to Firestore.
 */
export const runQuantPerformance = async () => {
    console.log('[QuantService] Computing quant performance metrics...');
    try {
        await new Promise((resolve, reject) => {
            const py = spawn(PYTHON_BIN, ['performance_tracker.py'], {
                cwd: path.join(__dirname, 'quant'),
                env: buildPythonEnv(),
            });
            py.stdout.on('data', d => console.log(`[Python|Perf] ${d.toString().trim()}`));
            py.stderr.on('data', d => console.warn(`[Python|Perf|ERR] ${d.toString().trim()}`));
            py.on('close', code => code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)));
            py.on('error', reject);
            setTimeout(() => { py.kill(); reject(new Error('Performance timeout')); }, 3 * 60 * 1000);
        });
        return { status: 'success' };
    } catch (err) {
        return { status: 'error', error: err.message };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// BASKETBALL PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

const BASKETBALL_SCRIPT = path.join(__dirname, 'quant', 'basketball_pipeline.py');

/**
 * Run the quantitative basketball pipeline for the given date.
 * Uses BallDontLie API (free, no key) for real NBA game data.
 * If no games are found, returns { status: 'no_games' } so the scheduler
 * can fall back to OpenAI automatically.
 *
 * @param {string|null} dateStr - YYYY-MM-DD, defaults to Lagos today
 * @param {boolean} dryRun
 * @returns {Promise<{status, generated, matches_analyzed, date}>}
 */
export const runBasketballPipeline = async (dateStr = null, dryRun = false) => {
    const label = dryRun ? 'DRY RUN' : (dateStr || 'today');
    console.log(`[QuantService] 🏀 Starting Basketball Pipeline (${label})...`);

    return new Promise((resolve, reject) => {
        const args = ['basketball_pipeline.py'];
        if (dateStr) args.push(dateStr);
        if (dryRun) args.push('--dry-run');

        console.log(`[QuantService] Spawning: ${PYTHON_BIN} ${args.join(' ')}`);

        const py = spawn(PYTHON_BIN, args, {
            cwd: path.join(__dirname, 'quant'),
            env: buildPythonEnv(),
        });

        let stdout = '';
        let stderr = '';

        py.stdout.on('data', (data) => {
            const line = data.toString();
            stdout += line;
            line.split('\n').filter(Boolean).forEach(l => console.log(`[Python|Basketball] ${l}`));
        });
        py.stderr.on('data', (data) => {
            const line = data.toString();
            stderr += line;
            line.split('\n').filter(Boolean).forEach(l => console.warn(`[Python|Basketball|ERR] ${l}`));
        });

        py.on('close', (code) => {
            // Check for "no games today" — not an error, just fall back to OpenAI
            if (stdout.includes('NO_GAMES')) {
                console.log('[QuantService] 🏀 Basketball: no NBA games scheduled today — triggering OpenAI fallback.');
                resolve({ status: 'no_games', generated: 0 });
                return;
            }
            if (code !== 0) {
                reject(new Error(`Basketball pipeline exited with code ${code}: ${stderr.slice(-500)}`));
                return;
            }

            // Parse summary stats from stdout
            const gamesMatch  = stdout.match(/Games analyzed:\s*(\d+)/);
            const betsMatch   = stdout.match(/Value bets identified:\s*(\d+)/);
            const gamesAnalyzed = gamesMatch ? parseInt(gamesMatch[1]) : 0;
            const generated     = betsMatch  ? parseInt(betsMatch[1])  : 0;

            console.log(`[QuantService] ✅ Basketball done: ${generated} value bets from ${gamesAnalyzed} games.`);
            resolve({
                status: 'success',
                generated,
                matches_analyzed: gamesAnalyzed,
                date: dateStr || getLagosDateKey(),
            });
        });

        py.on('error', (err) => reject(new Error(`Failed to spawn basketball pipeline: ${err.message}`)));

        // Safety timeout: 5 minutes
        setTimeout(() => {
            py.kill('SIGTERM');
            reject(new Error('Basketball pipeline timed out after 5 minutes'));
        }, 5 * 60 * 1000);
    });
};

// ── Lagos date helper (mirror of scheduler.js) ────────────────────────────────
function getLagosDateKey() {
    const now = new Date();
    const lagosOffset = 60; // UTC+1
    const localMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
    const d = new Date(localMs);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
