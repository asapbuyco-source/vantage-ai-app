# VANTAGE AI — TECHNICAL AUDIT: ACTIONABLE FIXES & CODE IMPROVEMENTS

---

## PART 1: CRITICAL CODE VULNERABILITIES

### 1. Python Invocation Fragility

**Current (Broken):**

```javascript
// quantService.js — spawns Python with NO retry logic
export const runQuantPipeline = async (dateStr = null, dryRun = false) => {
    try {
        const { stdout } = await spawnPythonPipeline(dateStr, dryRun);
        // stdout parsing with inflexible regex
        const matchesMatch = stdout.match(/Matches analyzed:\s*(\d+)/);
        const betsMatch = stdout.match(/Value bets found:\s*(\d+)/);
        // If regex fails → returns 0, system looks like it worked
    } catch (e) {
        console.error('[QuantService] Quant Pipeline error:', e.message);
        return { status: 'error', error: e.message };
    }
};
```

**Issues:**
- ❌ No exponential backoff
- ❌ 10-min timeout == hang until reap
- ❌ stdout parsing fragile (changes with Python log updates)
- ❌ No distinction between "failed" and "no matches found"

**FIXED VERSION:**

```javascript
// quantService.js — with exponential backoff + structured output

const PYTHON_RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2.5,
};

export const runQuantPipeline = async (dateStr = null, dryRun = false) => {
    let lastError = null;
    
    for (let attempt = 1; attempt <= PYTHON_RETRY_CONFIG.maxAttempts; attempt++) {
        try {
            console.log(`[QuantService] Starting Quant Pipeline (Attempt ${attempt}/${PYTHON_RETRY_CONFIG.maxAttempts})`);
            
            const { stdout, stderr } = await spawnPythonPipeline(dateStr, dryRun);
            
            // Parse JSON structured output from Python (instead of fragile regex)
            const summaryMatch = stdout.match(/\[SUMMARY\](.*?)\[\/SUMMARY\]/s);
            if (!summaryMatch) {
                throw new Error('Python did not produce structured summary');
            }
            
            const summary = JSON.parse(summaryMatch[1]);
            
            // Validate summary schema
            if (typeof summary.matches_analyzed !== 'number' || typeof summary.value_bets !== 'number') {
                throw new Error(`Invalid summary schema: ${JSON.stringify(summary)}`);
            }
            
            console.log(`[QuantService] ✅ Pipeline success: ${summary.value_bets} bets from ${summary.matches_analyzed} matches`);
            
            return {
                status: 'success',
                generated: summary.value_bets,
                matches_analyzed: summary.matches_analyzed,
                date: summary.date,
                details: summary,
            };
        } catch (e) {
            lastError = e;
            console.warn(`[QuantService] ⚠️ Attempt ${attempt} failed: ${e.message}`);
            
            if (attempt < PYTHON_RETRY_CONFIG.maxAttempts) {
                const delayMs = Math.min(
                    PYTHON_RETRY_CONFIG.baseDelayMs * Math.pow(PYTHON_RETRY_CONFIG.backoffMultiplier, attempt - 1),
                    PYTHON_RETRY_CONFIG.maxDelayMs
                );
                console.log(`[QuantService] Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    
    console.error(`[QuantService] ❌ Quant Pipeline failed after ${PYTHON_RETRY_CONFIG.maxAttempts} attempts`);
    return {
        status: 'error',
        error: lastError?.message || 'Unknown error',
        generated: 0,
        matches_analyzed: 0,
    };
};
```

**In quant_pipeline.py, add structured output:**

```python
# At the end of quant_pipeline.py
import json

def main():
    # ... pipeline execution ...
    
    summary = {
        "date": dateKey,
        "matches_analyzed": len(upcoming_matches),
        "value_bets": len(filtered_bets),
        "status": "success",
        "errors": [],  # Any non-fatal errors
    }
    
    # Structured output for Node parsing
    print(f"[SUMMARY]{json.dumps(summary)}[/SUMMARY]")
```

---

### 2. Firestore Write Atomicity Loss

**Current (Broken):**

```javascript
// openaiService.js — writes predictions without transaction
const doc = db.collection('ai_predictions_football').doc(dateKey);
await doc.set({ predictions: generatedPredictions });
// What if this crashes mid-write? Data is stored as null/partial
```

**FIXED VERSION:**

```javascript
// openaiService.js — with transactional write

export const savePredictionsTransactional = async (dateKey, predictions) => {
    const db = admin.firestore();
    const docRef = db.collection('ai_predictions_football').doc(dateKey);
    
    try {
        await db.runTransaction(async (transaction) => {
            // Read current state
            const serverState = await transaction.get(docRef);
            const existing = serverState.data() || {};
            
            // Merge safely
            const merged = {
                ...existing,
                predictions,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
                version: (existing.version || 0) + 1,
            };
            
            // Write atomically
            transaction.set(docRef, merged, { merge: false });
            
            // Verify write
            const verify = await transaction.get(docRef);
            if (!verify.data()?.predictions?.length) {
                throw new Error('Write verification failed');
            }
            
            return merged;
        });
        
        console.log(`[Firestore] ✅ Predictions saved transactionally for ${dateKey}`);
        return { status: 'success', version: (existing.version || 0) + 1 };
    } catch (e) {
        console.error(`[Firestore] ❌ Transaction failed: ${e.message}`);
        // Notify monitoring system
        await notifyError('firestore_write_failed', { dateKey, error: e.message });
        throw e;
    }
};
```

---

### 3. Silent JSON Parse Failures

**Current (Broken):**

```javascript
// openaiService.js
const safeJSON = (text, fallback = []) => {
    try {
        return JSON.parse(text);
    } catch (e) {
        // Silent fallback — user never knows parsing failed
        return fallback;
    }
};
```

**FIXED VERSION:**

```javascript
// openaiService.js — with comprehensive validation

export const safeJSONParse = (text, schema = null, taskName = 'unknown') => {
    try {
        const parsed = JSON.parse(text);
        
        // Schema validation if provided
        if (schema) {
            const validation = validateSchema(parsed, schema);
            if (!validation.valid) {
                throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
            }
        }
        
        return { success: true, data: parsed };
    } catch (e) {
        console.error(`[JSON Parse] Failed on ${taskName}: ${e.message}`);
        
        // Attempt recovery (try to find JSON blocks)
        const recovery = attemptJSONRecovery(text);
        if (recovery) {
            console.warn(`[JSON Parse] Recovered partial JSON for ${taskName}`);
            return { success: true, data: recovery, recovered: true };
        }
        
        // Failed recovery — return explicit failure
        return {
            success: false,
            error: e.message,
            text_sample: text.substring(0, 200),
            taskName,
        };
    }
};

// Schema validator
function validateSchema(obj, schema) {
    const errors = [];
    
    for (const [key, type] of Object.entries(schema)) {
        if (!(key in obj)) {
            errors.push(`Missing key: ${key}`);
        } else if (typeof obj[key] !== type && type !== 'any') {
            errors.push(`Type mismatch: ${key} is ${typeof obj[key]}, expected ${type}`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
    };
}

// Usage in AI generation
export const generateDailyPredictionsOpenAI = async () => {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [ /* ... */ ],
    });
    
    const content = response.choices[0].message.content;
    const schema = {
        predictions: 'object',
        confidence: 'number',
        generated_at: 'string',
    };
    
    const parseResult = safeJSONParse(content, schema, 'generateDailyPredictionsOpenAI');
    
    if (!parseResult.success) {
        // Structured error — can be logged/alerted
        throw new GenerationError('OpenAI JSON parse failed', {
            taskName: parseResult.taskName,
            error: parseResult.error,
            sample: parseResult.text_sample,
        });
    }
    
    return parseResult.data;
};
```

---

### 4. Timezone Hardcoding

**Current (Broken):**

```javascript
// openaiService.js — hardcoded Lagos timezone
const getDateKey = (daysAgo = 0) => {
    const now = new Date();
    const lagosOffset = 60;  // ← HARDCODED
    const localMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
    // ...
};
```

**FIXED VERSION:**

```javascript
// Use proper timezone library
import { DateTime } from 'luxon';

export const getDateKey = (daysAgo = 0, timezone = 'Africa/Lagos') => {
    const now = DateTime.now().setZone(timezone);
    const target = now.minus({ days: daysAgo });
    return target.toISODate();  // YYYY-MM-DD
};

// Usage
const todayDateKey = getDateKey(0, process.env.APP_TIMEZONE || 'Africa/Lagos');
```

---

## PART 2: MODEL IMPROVEMENTS

### 5. Dynamic Model Weights Based on Performance

**Current (Broken):**

```python
# probability_engine.py — weights are hardcoded forever
W_POISSON = 0.65
W_ELO     = 0.25
W_FORM    = 0.10
```

**FIXED VERSION:**

```python
# probability_engine.py — with Bayesian weight update

from dataclasses import dataclass
import json
from datetime import datetime

@dataclass
class ModelWeights:
    poisson: float = 0.65
    elo: float = 0.25
    form: float = 0.10
    last_updated: str = ""
    performance_sample_size: int = 0
    
    def normalize(self):
        total = self.poisson + self.elo + self.form
        self.poisson /= total
        self.elo /= total
        self.form /= total

def load_weights_from_firestore() -> ModelWeights:
    """Load latest model weights from Firestore."""
    try:
        db = _get_firestore()
        doc = db.collection('model_config').document('weights').get()
        if doc.exists:
            data = doc.to_dict()
            return ModelWeights(**data)
    except Exception as e:
        print(f"[Model] Failed to load weights: {e}", file=sys.stderr)
    
    return ModelWeights()  # Return defaults

def update_weights_from_performance(recent_predictions: list[dict]) -> ModelWeights:
    """
    Compute model performance on recent predictions and update weights.
    Uses empirical win rate by model to reweight.
    """
    if len(recent_predictions) < 100:
        print(f"[Model] Insufficient predictions ({len(recent_predictions)} < 100) for reweighting", file=sys.stderr)
        return load_weights_from_firestore()
    
    # Compute win rate for each model
    poisson_wins = 0
    elo_wins = 0
    form_wins = 0
    total = 0
    
    for pred in recent_predictions:
        if pred.get('status') != 'won':
            continue
        
        total += 1
        poisson_wins += 1 if pred.get('poisson_aligned') else 0
        elo_wins += 1 if pred.get('elo_aligned') else 0
        form_wins += 1 if pred.get('form_aligned') else 0
    
    if total == 0:
        return load_weights_from_firestore()
    
    # Empirical win rates (add smoothing to avoid overfitting)
    smoothing = 0.5
    poisson_rate = (poisson_wins + smoothing) / (total + 3 * smoothing)
    elo_rate = (elo_wins + smoothing) / (total + 3 * smoothing)
    form_rate = (form_wins + smoothing) / (total + 3 * smoothing)
    
    # New weights proportional to empirical performance
    new_weights = ModelWeights(
        poisson=poisson_rate,
        elo=elo_rate,
        form=form_rate,
        last_updated=datetime.now().isoformat(),
        performance_sample_size=total,
    )
    new_weights.normalize()
    
    print(f"[Model] Updated weights: Poisson {new_weights.poisson:.2%} | Elo {new_weights.elo:.2%} | Form {new_weights.form:.2%} (n={total})")
    
    # Save to Firestore
    try:
        db = _get_firestore()
        db.collection('model_config').document('weights').set({
            'poisson': new_weights.poisson,
            'elo': new_weights.elo,
            'form': new_weights.form,
            'last_updated': new_weights.last_updated,
            'performance_sample_size': new_weights.performance_sample_size,
        })
    except Exception as e:
        print(f"[Model] Failed to save weights: {e}", file=sys.stderr)
    
    return new_weights

# Usage in quant_pipeline.py
def main():
    # Load dynamically updated weights
    weights = update_weights_from_performance(load_recent_predictions(days=60))
    
    # Use in probability calculation
    combined = compute_combined(
        mu_home, mu_away, ...,
        model_weights=weights  # ← Pass dynamic weights
    )
```

---

### 6. Input Validation Schema

**Current (Broken):**

```python
# data_pipeline.py — raw JSON parsing, no validation
resp = requests.get(url)
data = resp.json()  # ← Could be anything
return data  # ← No schema check
```

**FIXED VERSION:**

```python
# data_pipeline.py — with Pydantic schema validation

from pydantic import BaseModel, validator, ValidationError
from typing import Optional

class SportmonksTeam(BaseModel):
    id: int
    name: str
    country_id: Optional[int] = None
    
    @validator('name')
    def name_not_empty(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError('Team name too short')
        return v.strip()

class SportmonksFixture(BaseModel):
    id: str
    league_id: int
    home_team_id: int
    away_team_id: int
    starting_at: str  # ISO datetime
    
    @validator('starting_at')
    def valid_iso_datetime(cls, v):
        try:
            datetime.fromisoformat(v.replace('Z', '+00:00'))
        except ValueError:
            raise ValueError(f'Invalid ISO datetime: {v}')
        return v

def fetch_fixtures_safe(date: str) -> list[SportmonksFixture]:
    """Fetch fixtures with schema validation."""
    try:
        raw_data = _get(f'/fixtures?filter[date]={date}')
        
        fixtures = []
        for item in raw_data.get('data', []):
            try:
                fixture = SportmonksFixture(**item)
                fixtures.append(fixture)
            except ValidationError as e:
                print(f"[DataPipeline] Skipping invalid fixture: {e}", file=sys.stderr)
                continue
        
        if not fixtures:
            print(f"[DataPipeline] WARNING: No valid fixtures for {date}", file=sys.stderr)
        
        return fixtures
    except Exception as e:
        print(f"[DataPipeline] ERROR fetching fixtures: {e}", file=sys.stderr)
        return []
```

---

## PART 3: OBSERVABILITY & MONITORING

### 7. Add Structured Logging

**Current (Broken):**

```javascript
console.log('[OpenAI] Starting prediction generation...');
console.error('Some error happened');  // ← No context, no timestamp precision
```

**FIXED VERSION:**

```javascript
// logger.js
import pino from 'pino';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
        },
    },
});

export const structuredLog = {
    info: (msg, context = {}) => logger.info({ ...context, task: 'general' }, msg),
    error: (msg, err, context = {}) => logger.error({ ...context, error: err }, msg),
    warn: (msg, context = {}) => logger.warn({ ...context }, msg),
};

// Usage in quantService.js
logger.info({
    task: 'quant_pipeline_start',
    dateStr,
    dryRun,
    pythonBin: PYTHON_BIN,
    timestamp: new Date().toISOString(),
}, 'Starting Quant Pipeline');

// In catch block:
logger.error({
    task: 'quant_pipeline_failed',
    attempt,
    error: e.message,
    stack: e.stack,
    timestamp: new Date().toISOString(),
}, 'Quant Pipeline Failed');
```

**Then integrate with Sentry:**

```javascript
import * as Sentry from '@sentry/node';

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,  // 10% of transactions
});

export const captureError = (err, context = {}) => {
    Sentry.captureException(err, {
        contexts: { task: context },
    });
};
```

---

## PART 4: DATABASE SCHEMA IMPROVEMENTS

### 8. Enhanced Firestore Schema

**Current (Incomplete):**

```javascript
{
    fixture_id: "12345",
    market: "Home Win",
    odds: 1.85,
    status: "pending",
    // Missing: prediction confidence, model components, kelly details
}
```

**IMPROVED SCHEMA:**

```javascript
{
    // Identifiers
    fixture_id: string,
    date: string (YYYY-MM-DD),
    league_id: number,
    league_name: string,
    
    // Match details
    home_team: string,
    away_team: string,
    kickoff_utc: string (ISO),
    
    // Prediction details
    market: string,  // "Home Win", "Over 2.5 Goals", etc.
    odds_decimal: number,
    
    // Model outputs (for audit trail)
    model_probability: number (0-1),
    model_confidence: number (0-1),  // Agreement across models
    inefficiency: number (model_prob - market_prob),
    expected_value: number (fractional EV),
    
    // Model components (transparency)
    poisson_prob: number,
    elo_prob: number,
    form_prob: number,
    model_weights: {
        poisson: 0.65,
        elo: 0.25,
        form: 0.10,
    },
    
    // Kelly sizing
    kelly_fraction: number (e.g., 0.25),
    kelly_stake_pct: number (e.g., 2.5),
    kelly_multiplier: number (staleness adjustment),
    
    // Outcome tracking
    status: "pending" | "won" | "lost" | "void",
    actual_result: string (match outcome),
    actual_odds: number (if different from prediction_odds),
    settled_at: string (ISO),
    
    // Risk classification
    risk_category: "safe" | "value" | "risky",
    risk_filters_passed: boolean,
    filter_failures: string[] (why it was included despite risks),
    
    // Grading
    clv: number (Closing Line Value),
    clv_direction: "positive" | "negative",
    graded_by: string (system or admin),
    grading_notes: string,
    
    // Metadata
    created_at: timestamp,
    updated_at: timestamp,
    version: number,
}
```

**Implementation in openaiService.js:**

```javascript
export const enrichPredictionsForStorage = (predictions, models) => {
    return predictions.map(pred => ({
        // Identifiers
        fixture_id: pred.fixture_id,
        date: pred.date,
        league_id: pred.league_id,
        league_name: pred.league_name,
        home_team: pred.home_team,
        away_team: pred.away_team,
        kickoff_utc: pred.kickoff_utc,
        
        // Market
        market: pred.market,
        odds_decimal: pred.odds,
        
        // Model outputs
        model_probability: pred.probability,
        model_confidence: pred.confidence,
        inefficiency: pred.probability - pred.market_probability,
        expected_value: pred.ev,
        
        // Model components
        poisson_prob: models.poisson_prob,
        elo_prob: models.elo_prob,
        form_prob: models.form_prob,
        model_weights: {
            poisson: 0.65,
            elo: 0.25,
            form: 0.10,
        },
        
        // Kelly
        kelly_fraction: 0.25,
        kelly_stake_pct: pred.kelly_stake,
        kelly_multiplier: pred.staleness_multiplier || 1.0,
        
        // Risk
        risk_category: categorizeRisk(pred),
        risk_filters_passed: pred.filters_passed,
        filter_failures: pred.filter_failures || [],
        
        // Defaults
        status: 'pending',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        version: 1,
    }));
};
```

---

## PART 5: TESTING FRAMEWORK

### 9. Add Integration Test Template

```javascript
// tests/integration/prediction-pipeline.test.js

import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import admin from 'firebase-admin';
import { runQuantPipeline } from '../../backend/quantService.js';

describe('Prediction Pipeline Integration', () => {
    let db;
    
    beforeEach(async () => {
        // Initialize test Firebase instance (emulator)
        process.env.FIREBASE_EMULATOR_HOST = 'localhost:8080';
        db = admin.firestore();
    });
    
    afterEach(async () => {
        // Clean up test data
        await db.collection('quant_predictions').doc('2025-03-19').delete();
    });
    
    it('should generate predictions for a given date', async () => {
        const result = await runQuantPipeline('2025-03-19', false);
        
        expect(result.status).toBe('success');
        expect(result.generated).toBeGreaterThan(0);
        expect(result.matches_analyzed).toBeGreaterThanOrEqual(result.generated);
    });
    
    it('should persist predictions with required fields', async () => {
        await runQuantPipeline('2025-03-20', false);
        
        const doc = await db.collection('quant_predictions').doc('2025-03-20').get();
        expect(doc.exists).toBe(true);
        
        const predictions = doc.data().predictions;
        expect(Array.isArray(predictions)).toBe(true);
        
        predictions.forEach(pred => {
            expect(pred).toHaveProperty('fixture_id');
            expect(pred).toHaveProperty('model_probability');
            expect(pred).toHaveProperty('kelly_stake_pct');
            expect(pred).toHaveProperty('status', 'pending');
        });
    });
    
    it('should validate model weights sum to 1.0', async () => {
        await runQuantPipeline('2025-03-21', false);
        
        const doc = await db.collection('quant_predictions').doc('2025-03-21').get();
        const predictions = doc.data().predictions;
        
        predictions.forEach(pred => {
            const weights = pred.model_weights;
            const sum = weights.poisson + weights.elo + weights.form;
            expect(sum).toBeCloseTo(1.0, 2);
        });
    });
});
```

---

## PART 6: DEPLOYMENT CHECKLIST

### 10. Pre-Production Readiness Checklist

```markdown
## Pre-Production Deployment Checklist

- [ ] **Logging**
  - [ ] Structured logging wired (Pino or similar)
  - [ ] Sentry configured with error tracking
  - [ ] Log retention policy documented
  - [ ] Daily log audit in place

- [ ] **Monitoring**
  - [ ] Health check endpoint responds (< 500ms)
  - [ ] Python process heartbeat logged
  - [ ] Firestore latency tracked
  - [ ] API error rate dashboard visible
  - [ ] Daily predictions count tracked

- [ ] **Testing**
  - [ ] Unit tests: >70% coverage
  - [ ] Integration tests pass
  - [ ] Backtest metrics documented (win rate, ROI, sample size)
  - [ ] E2E test: full pipeline simulated weekly

- [ ] **Data Integrity**
  - [ ] Firestore backup enabled
  - [ ] Transaction atomicity verified
  - [ ] Schema validation in place
  - [ ] Null field handling tested

- [ ] **Security**
  - [ ] API keys rotated and stored in secrets manager
  - [ ] Rate limits tested per-user
  - [ ] CORS origins configured
  - [ ] Firestore rules audited

- [ ] **Deployment**
  - [ ] Staging environment mirrors production
  - [ ] Blue-green deployment process documented
  - [ ] Rollback procedure tested
  - [ ] Disaster recovery procedure written

- [ ] **Documentation**
  - [ ] README updated with troubleshooting
  - [ ] Architecture diagram published
  - [ ] API documentation complete
  - [ ] On-call runbook created

- [ ] **Legal**
  - [ ] Terms of service mention prediction accuracy not guaranteed
  - [ ] Privacy policy covers data usage
  - [ ] Regional betting regulations reviewed
```

---

**These fixes represent ~1-2 weeks of engineering work to bring production to enterprise-grade reliability.**

Apply Phase 1 fixes before accepting real money from users.
