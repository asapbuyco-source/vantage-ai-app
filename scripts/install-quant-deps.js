#!/usr/bin/env node

/**
 * Safely installs Python dependencies for the quant pipeline.
 * Runs during `npm install` but never fails the build.
 *
 * Strategy:
 * 1. Check if Python is available
 * 2. Check if requirements are already satisfied
 * 3. Install only if needed, using --user flag (no --break-system-packages)
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reqFile = path.join(__dirname, '..', 'backend', 'quant', 'requirements.txt');

function log(msg) {
    console.log(`[install-quant-deps] ${msg}`);
}

function warn(msg) {
    console.warn(`[install-quant-deps] WARN: ${msg}`);
}

// Check if requirements file exists
if (!fs.existsSync(reqFile)) {
    log('No requirements.txt found — skipping Python dependency install.');
    process.exit(0);
}

// Find Python binary
const pythonCandidates = ['python3', 'python'];
let pythonBin = null;

for (const candidate of pythonCandidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (result.status === 0) {
        pythonBin = candidate;
        log(`Found Python: ${(result.stdout || result.stderr || '').trim()}`);
        break;
    }
}

if (!pythonBin) {
    log('Python not found — skipping quant dependency install (quant pipeline will not run locally).');
    process.exit(0);
}

// Check if dependencies are already installed (pip check)
const checkResult = spawnSync(pythonBin, ['-m', 'pip', 'check', '-r', reqFile], {
    encoding: 'utf8',
    timeout: 15000,
});

if (checkResult.status === 0) {
    log('Python quant dependencies already satisfied.');
    process.exit(0);
}

// Install with --user to avoid system package conflicts
log('Installing Python quant dependencies...');
const installResult = spawnSync(pythonBin, ['-m', 'pip', 'install', '--user', '-r', reqFile], {
    encoding: 'utf8',
    timeout: 120000,
    stdio: 'pipe',
});

if (installResult.status === 0) {
    log('Python quant dependencies installed successfully.');
} else {
    warn(`pip install exited with code ${installResult.status}`);
    warn(installResult.stderr?.slice(-500) || 'No stderr output');
    log('This is non-fatal — quant pipeline will use dependencies from the hosting environment.');
}

process.exit(0);
