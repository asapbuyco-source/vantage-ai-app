import fs from 'fs';
import path from 'path';

const root = process.cwd();
const envRef = /\b(?:import\.meta\.env|process\.env)\.(VITE_[A-Z0-9_]+)\b/g;
const envLine = /^\s*(VITE_[A-Z0-9_]+)=/gm;
const allowedPrefixes = [
  'VITE_FIREBASE_',
  'VITE_BACKEND_URL',
  'VITE_SELAR_',
  'VITE_SUPABASE_',
  'VITE_ADMIN_EMAIL',
  'VITE_FIREBASE_VAPID_KEY',
];
const sensitive = /(SECRET|TOKEN|API_KEY|USER_TOKEN|SPORTMONKS|FAPSHI|GOOGLE|OPENAI|FOOTBALL|BASKETBALL|JSONBIN)/;
const skipDirs = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const scanExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.env', '.local', '.example']);
const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const ext = path.extname(entry.name);
    if (!scanExt.has(ext) && !entry.name.startsWith('.env')) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const match of text.matchAll(envRef)) {
      const name = match[1];
      if (sensitive.test(name) && !allowedPrefixes.some((prefix) => name.startsWith(prefix))) {
        findings.push(`${path.relative(root, full)}: ${name}`);
      }
    }
    if (entry.name.startsWith('.env')) {
      for (const match of text.matchAll(envLine)) {
        const name = match[1];
        if (sensitive.test(name) && !allowedPrefixes.some((prefix) => name.startsWith(prefix))) {
          findings.push(`${path.relative(root, full)}: ${name}`);
        }
      }
    }
  }
}

walk(root);

if (findings.length) {
  console.error('Forbidden frontend-prefixed secret variables found:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log('No forbidden VITE_* secret variables found.');
