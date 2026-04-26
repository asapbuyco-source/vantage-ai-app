# Vantage AI — Deep Audit V3
> **Date**: April 26, 2026 | **Target**: Minimax 2.5

---

## SECTION 1: BUGS & ERRORS

### 🔴 BUG-01: `isAdmin` is not defined in `App.tsx`

**File**: `App.tsx`, line 356
**Severity**: 🔴 CRITICAL — causes runtime crash for non-VIP users

```tsx
// Line 53: destructured from useAuth — BUT `isAdmin` is NOT included!
const { theme, language, showToast } = useAppContext();
const { user, userProfile, verifyTransaction, loading: authLoading } = useAuth();

// Line 356: uses `isAdmin` which was NEVER destructured
) : !userProfile?.isVip && !isAdmin ? (
    <SpecialOfferPopup />
) : null}
```

`isAdmin` is used at line 356 but was never extracted from `useAuth()` at line 53. This causes a `ReferenceError: isAdmin is not defined` at runtime for any user who completes onboarding and is not VIP.

**Fix**: Change line 53:
```tsx
const { user, userProfile, verifyTransaction, loading: authLoading, isAdmin } = useAuth();
```

---

### 🟠 BUG-02: TrialOfferPopup shows 1000 FCFA, Conflicts with 2000 FCFA Everywhere Else

**File**: `components/TrialOfferPopup.tsx`, lines 243-251

The TrialOfferPopup displays "1 000 FCFA" with "2 000 FCFA" crossed out (50% discount). But the `SpecialOfferPopup.tsx` and `Home.tsx WEEKLY_TRIAL_PLAN` both use **2000 FCFA** as the actual price. This means:

- User sees "1000 FCFA" in the Trial popup
- Clicks "CLAIM NOW" → PaymentModal opens with **2000 FCFA** (from `Home.tsx:107`)
- User feels bait-and-switched → lost sale, trust damage

**Fix**: Decide on ONE price. If the trial is truly 1000 FCFA discounted:
- Change `Home.tsx` line 107: `price: '1000'`
- Change `SpecialOfferPopup.tsx` line 36: `price: '1000'`
- Change `SpecialOfferBanner.tsx` line 26-27 to say "1000 FCFA"

OR if the trial is 2000 FCFA (no discount):
- Change `TrialOfferPopup.tsx` line 243: `2 000 FCFA` and remove the strikethrough

---

### 🟠 BUG-03: `TrialOfferPopup` Not Localized

**File**: `components/TrialOfferPopup.tsx`

All text is hardcoded in English ("Limited Offer", "1-Week VIP Trial", "CLAIM NOW", etc.). Unlike every other component that uses `language === 'fr'` conditionals, this popup has zero French translations. For a Cameroon-focused app, this is a UX problem — the majority of users see French UI everywhere except this popup.

**Fix**: Add `language` from `useAppContext()` and translate all strings.

---

### 🟡 BUG-04: `normalizeQuantPrediction` Skips Already-Normalized but Missing Fields

**File**: `services/db.ts`, line 66

```typescript
if (p.homeTeam !== undefined) return p;  // skip
```

If a prediction was partially normalized (has `homeTeam` but is missing `status`, `score`, `graded_at`), those fields are never patched in. This can cause the match card to show no status badge even though Firestore has the data.

**Fix**: Instead of returning early, merge missing fields:
```typescript
if (p.homeTeam !== undefined) {
    return { ...p, status: p.status ?? 'pending' };
}
```

---

### 🟡 BUG-05: `getResultsHistory` Calls `toLocaleDateString` Three Times Per Day

**File**: `services/db.ts`, lines 532-535

```typescript
const year = d.toLocaleDateString('en-CA', { timeZone: LagosTimeZone }).split('-')[0];
const month = d.toLocaleDateString('en-CA', { timeZone: LagosTimeZone }).split('-')[1];
const day = d.toLocaleDateString('en-CA', { timeZone: LagosTimeZone }).split('-')[2];
```

This calls `toLocaleDateString` 3× per iteration × 30 days = 90 Intl calls. On low-end devices this causes a visible lag when opening the Results page.

**Fix**: Call once and destructure:
```typescript
const parts = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).split('-');
return `${parts[0]}-${parts[1]}-${parts[2]}`;
```

---

### 🟡 BUG-06: `MatchDetailsModal` Locks Body Scroll but Never Unlocks on Unmount

**File**: `components/MatchDetailsModal.tsx`, line 41

```typescript
document.body.style.overflow = 'hidden';
```

This is set inside the `useEffect` that runs when `match` changes, but the cleanup only runs when `match` changes again. If the user navigates away via tab change while the modal is open, `overflow: hidden` stays permanently — the entire page becomes unscrollable.

**Fix**: Add a cleanup to the effect:
```typescript
return () => { document.body.style.overflow = ''; };
```

---

### 🟡 BUG-07: `importmap` in `index.html` Conflicts with Vite Bundled Build

**File**: `index.html`, lines 137-150

The `<script type="importmap">` block maps `react`, `framer-motion`, etc. to `esm.sh` CDN URLs. In production (built by Vite), these packages are already bundled in `dist/assets/`. The import map is silently ignored in built mode but on some browsers can cause **double-loading** of React, leading to:
- "Invalid hook call" errors
- Bundle size bloat (CDN React + bundled React)

**Fix**: Remove the `<script type="importmap">` block entirely. Vite handles all module resolution at build time.

---

### 🟡 BUG-08: `getResultsHistory` Fires 30 Parallel Firestore Reads

**File**: `services/db.ts`, line 538-541

```typescript
const fetchPromises = Array.from({ length: days }, (_, i) => { ... });
const allDays = await Promise.all(fetchPromises);
```

This fires 30 simultaneous Firestore document reads. On low-end devices and slow connections this:
- Blocks the UI thread with 30 concurrent network requests
- Spikes Firestore read costs unnecessarily (most past days haven't changed)

**Fix**: Batch in groups of 5, or cache past days in localStorage since they're immutable once graded.

---

## SECTION 2: UI/UX IMPROVEMENTS FOR LOW-END DEVICES

### PERF-01: Reduce Framer Motion Usage on Match Cards

Every match card uses `<motion.div>` with `initial`, `animate`, and `exit` props. For 30+ cards this creates 30 animation observers. On low-end Android devices (1-2GB RAM), this causes jank.

**Fix**: Use CSS `@keyframes` for the simple fade-in effect on cards. Reserve Framer Motion for interactive elements (modals, popups, tab transitions).

---

### PERF-02: Lazy-Load Heavy Pages

`MatchDetailsModal.tsx` is 51KB — it's imported eagerly even if the user never opens a match. Same for `VIP.tsx` (62KB), `TicketWizard.tsx` (22KB).

**Fix**: Use `React.lazy()` and `Suspense` for these:
```tsx
const VIP = React.lazy(() => import('./pages/VIP').then(m => ({ default: m.VIP })));
const MatchDetailsModal = React.lazy(() => import('./components/MatchDetailsModal').then(m => ({ default: m.MatchDetailsModal })));
```

---

### PERF-03: Preconnect to Firebase/Sportmonks

**File**: `index.html`

Add `<link rel="preconnect">` for Firebase and Sportmonks domains to reduce DNS/TLS latency on first load:
```html
<link rel="preconnect" href="https://firestore.googleapis.com" />
<link rel="preconnect" href="https://api.sportmonks.com" />
```

---

### PERF-04: Add `will-change: transform` to Bottom Nav

The `BottomNav` uses `layoutId` springs on every tab switch. Adding `will-change: transform` to the nav container promotes it to a GPU layer, preventing layout thrashing.

---

### UI-01: Light Mode Has Invisible Elements

Several components use `bg-white/5` and `border-white/10` which are invisible on light backgrounds. Affected:
- Rolling Results Ticker (`Home.tsx:279`): `bg-white/5 border border-white/5` — invisible in light mode
- Social Proof grid on VIP page: `bg-white/5 border border-white/10` — invisible

**Fix**: Add `bg-slate-100 dark:bg-white/5` pattern consistently.

---

### UI-02: `SpecialOfferPopup` Has No Light Mode Styles

The popup uses hardcoded `bg-[#1a1d26]` (dark only). In light mode it looks like a dark hole in the UI.

**Fix**: Change to `bg-white dark:bg-[#1a1d26]` and adjust text colors.

---

### UI-03: Add Skeleton Loaders to Results Page

The Results page shows a blank white screen during the 30-document fetch. Low-end devices may take 3-5 seconds.

**Fix**: Add pulsing skeleton cards (similar to Home page loading state).

---

## SECTION 3: REVENUE & COMPETITIVE FEATURES — MONEY ON THE TABLE

### 💰 FEAT-01: Push Notifications on Prediction Results (HIGH REVENUE IMPACT)

**What competitors have**: FlashScore, SofaScore, and BetMines all send instant push notifications when a prediction wins or loses.

**What you're missing**: Users have to manually open the app to check results. This means lower engagement, lower retention, and fewer VIP renewals.

**Implementation**: You already have `sw.js` with Web Push support and `PWAInstallButton.tsx`. Add a backend trigger in the scheduler's auto-grading block to send a web push when a prediction is graded:
```javascript
// After auto-grading a batch
const wonCount = gradedPreds.filter(p => p.status === 'won').length;
const lostCount = gradedPreds.filter(p => p.status === 'lost').length;
await sendWebPush({
    title: `✅ ${wonCount}W - ${lostCount}L Today`,
    body: `${wonCount}/${wonCount + lostCount} predictions won! Check your results.`,
    url: '/?tab=results'
});
```

---

### 💰 FEAT-02: Referral Reward Automation (LEAVING MONEY ON TABLE)

**Current state**: Referral system exists but reward is just 40% commission credit. There's no **automated free VIP days** for successful referrals.

**What competitors do**: "Invite 3 friends → get 1 week free VIP"

**Fix**: Add to `AuthContext.processReferral`:
```typescript
// If referrer has 3+ successful referrals, grant 7 days VIP
if (referrerProfile.referralCount >= 3 && !referrerProfile.referralVipGranted) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    tx.update(referrerRef, { isVip: true, vipExpiry: expiry.toISOString(), referralVipGranted: true });
}
```

---

### 💰 FEAT-03: Telegram Mini App (MASSIVE UNTAPPED MARKET)

Cameroon has ~5M Telegram users. You already have a Telegram bot for daily broadcasts. Converting it into a **Telegram Mini App** (WebApp inside Telegram) would:
- Zero friction onboarding (no signup needed — Telegram auth)
- Viral sharing via Telegram groups
- In-app payments via Telegram Stars

**Implementation**: Wrap your existing React app in Telegram WebApp SDK. Add `window.Telegram.WebApp` detection in `AuthContext`.

---

### 💰 FEAT-04: Daily Free Pick Challenge / Gamification

**What top apps do**: Daily prediction challenge where free users pick 3 matches. Correct picks earn points toward free VIP days. This creates:
- Daily habit formation (retention++)
- Social sharing ("I got 3/3 today!")
- Natural conversion funnel (users see VIP picks perform better)

---

### 💰 FEAT-05: Odds Comparison Widget

**What competitors have**: Show odds from multiple bookmakers side-by-side (1xBet, Betway, Premier Bet).

**What you're missing**: You show a single odds number. Users can't compare where to get the best line.

**Implementation**: The Sportmonks API already returns odds from multiple bookmakers. Display them in a collapsible row per match:
```
1xBet   1.85    Premier Bet  1.90  ← BEST
Betway  1.82    Supergoal    1.88
```

---

### 💰 FEAT-06: Cashout Calculator

Show users when to cash out based on live match state. "Your bet is currently worth 85% of potential profit — cash out recommended." This drives VIP upgrades because free users can't access it.

---

### 💰 FEAT-07: WhatsApp Share Cards (Visual Picks)

Generate shareable image cards (using html2canvas or server-side rendering) that users can paste into WhatsApp groups. Each card shows the Vantage AI brand, the prediction, and a QR code linking to the app. This is how prediction apps go viral in Africa.

---

### 💰 FEAT-08: "Yesterday's Results" Banner on Landing Page

Your landing page has no proof of results. Add a dynamic banner showing yesterday's actual win rate:
```
Yesterday: 22/28 Won (78.6%) ✅
```
This single change can increase signup conversion by 30%+.

---

### 💰 FEAT-09: Tiered VIP (Bronze / Silver / Gold)

Currently you have one VIP tier. Adding tiers creates:
- **Bronze** (2000 FCFA/week): Basic predictions
- **Silver** (5000 FCFA/week): + Accumulators + Kelly stakes
- **Gold** (10000 FCFA/week): + Personal Telegram alerts + Priority support + Odds comparison

This increases ARPU (Average Revenue Per User) significantly.

---

### 💰 FEAT-10: SEO Blog Auto-Publishing to Social

You have a daily AI blog generator but no auto-posting to Facebook/Twitter. Each blog post should automatically be shared to social platforms with a link back to the app, driving organic traffic.

---

## SECTION 4: IMPLEMENTATION PRIORITY

| Priority | Task | Impact | Effort |
|----------|------|--------|--------|
| **P0** | Fix BUG-01 (isAdmin crash) | 🔴 App-breaking | 1 line |
| **P0** | Fix BUG-02 (price mismatch) | 🟠 Lost sales | 3 lines |
| **P0** | Fix BUG-06 (scroll lock) | 🟡 Stuck UI | 1 line |
| **P1** | Fix BUG-07 (importmap) | 🟡 Double React | Delete block |
| **P1** | Fix BUG-03 (French localization) | 🟠 UX gap | 20 lines |
| **P1** | PERF-02 (lazy load) | 📱 Low-end fix | 10 lines |
| **P1** | UI-01 (light mode fixes) | 🎨 Visual | 15 lines |
| **P2** | FEAT-01 (push notifications) | 💰 Retention | 2 hours |
| **P2** | FEAT-08 (results on landing) | 💰 Conversion | 1 hour |
| **P2** | FEAT-07 (WhatsApp cards) | 💰 Viral growth | 3 hours |
| **P3** | FEAT-02 (referral rewards) | 💰 Growth | 1 hour |
| **P3** | FEAT-05 (odds comparison) | 💰 Value prop | 4 hours |
| **P3** | FEAT-04 (gamification) | 💰 Retention | 6 hours |
| **P4** | FEAT-03 (Telegram Mini App) | 💰 New market | 2 days |
| **P4** | FEAT-09 (tiered VIP) | 💰 ARPU increase | 1 day |

---

*End of Deep Audit V3*
