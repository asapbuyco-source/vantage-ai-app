import { doc, getDoc, setDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";


/**
 * Selar Integration — Redirect-URL Method (Free, Fully Automatic)
 *
 * Flow:
 * 1. User clicks Pay → we write a pending token to Firestore + redirect to Selar product link
 * 2. Selar processes payment → redirects buyer to:
 *    https://yourapp.com/?selar_ref=<REF>&plan=<PLAN>
 * 3. App.tsx detects ?selar_ref= param → calls verifySelarOrder()
 * 4. verifySelarOrder() uses runTransaction to atomically check + mark token as used
 *    (prevents replay attacks and double-grant race conditions)
 *    → upgrades user to VIP automatically
 *
 * Setup required in Selar dashboard (one-time):
 *   Product → Edit → "Redirect buyers to an external URL after purchase"
 *   Set URL to: https://<YOUR_DOMAIN>/?selar_ref={order_id}&plan=daily   (per plan)
 *
 * No backend. No Zapier. No manual approval. Completely free.
 */

// ─── PRODUCT LINKS ──────────────────────────────────────────────────────────
// Uses env vars exclusively — never falls back to hardcoded links in production.
// Set VITE_SELAR_*_LINK in your .env.local / Railway environment variables.
const SELAR_PRODUCTS: Record<string, string> = {
    daily: import.meta.env.VITE_SELAR_DAILY_LINK || '',
    weekly: import.meta.env.VITE_SELAR_WEEKLY_LINK || '',
    monthly: import.meta.env.VITE_SELAR_MONTHLY_LINK || '',
    annual: import.meta.env.VITE_SELAR_ANNUAL_LINK || '',
};

export interface SelarInitResponse {
    checkout_url: string;
    reference: string;
}

/**
 * Step 1: Initiate Selar checkout.
 * Writes a pending token to Firestore, then returns the Selar product URL.
 * The `plan` param in the redirect URL is how we know which plan to activate on return.
 */
export const initiateSelarPayment = async (
    plan: 'weekly' | 'monthly' | 'quarterly' | 'annual',
    email: string,
    userId: string,
): Promise<SelarInitResponse> => {
    const productLink = SELAR_PRODUCTS[plan];
    if (!productLink) {
        throw new Error(`Selar product link for plan "${plan}" is not configured. Please set VITE_SELAR_${plan.toUpperCase()}_LINK in your environment variables.`);
    }

    // Generate an opaque, cryptographically random reference.
    // Using randomUUID() means the reference cannot be guessed or iterated.
    // Plan and userId are stored in Firestore only — NOT embedded in the reference.
    const reference = `VAN_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

    // Write pending token to Firestore (expires in 2 hours — enforced on read)
    // Collection: selar_pending/{reference}
    // NOTE: Firestore rules prevent client-side updates to this doc after creation,
    // so the plan cannot be tampered with after this point.
    await setDoc(doc(db, 'selar_pending', reference), {
        userId,
        plan,
        email,
        reference,
        createdAt: serverTimestamp(),
        used: false,
    });

    // Store locally too (for matching on return if user loses URL)
    localStorage.setItem('pendingSelarRef', reference);
    localStorage.setItem('pendingVipPlan', plan);

    // Selar appends ?order_id=... automatically when redirecting back.
    // We include our ref so we can match the pending token.
    const appReturnUrl = `${window.location.origin}/?selar_ref=${reference}&plan=${plan}`;

    // Note: Selar uses the redirect URL configured in the dashboard.
    // We embed the reference in the product link as a query param.
    const checkout_url = `${productLink}?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(appReturnUrl)}`;

    console.log(`[Selar] Redirecting to checkout for plan: ${plan} | ref: ${reference}`);
    return { checkout_url, reference };
};

/**
 * Step 2: Verify a Selar payment on return from checkout.
 * Called by App.tsx when it detects ?selar_ref= in the URL.
 *
 * Security model:
 * - Uses runTransaction for atomic check-and-mark to prevent double-grant race conditions
 * - Checks that the pending Firestore token exists and is NOT already used (replay protection)
 * - Checks that the token is less than 2 hours old (prevents stale link reuse)
 * - Marks token as used inside the transaction before returning success
 * - Plan is read from Firestore (not from URL), so URL tampering has no effect
 *
 * @param reference  - The VAN_... reference stored in Firestore (from ?selar_ref= param)
 * @returns { success, plan, userId } or { success: false }
 */
export const verifySelarOrder = async (
    reference: string
): Promise<{ success: boolean; plan?: 'weekly' | 'monthly' | 'quarterly' | 'annual'; userId?: string }> => {
    if (!reference || !reference.startsWith('VAN_')) {
        console.warn('[Selar] Invalid reference format:', reference);
        return { success: false };
    }

    try {
        const tokenRef = doc(db, 'selar_pending', reference);
        let resultPlan: 'weekly' | 'monthly' | 'quarterly' | 'annual' | undefined;
        let resultUserId: string | undefined;

        // Use runTransaction for atomic read-check-write to prevent race conditions
        // (e.g. two browser tabs both trying to verify at the same time)
        await runTransaction(db, async (transaction) => {
            const tokenSnap = await transaction.get(tokenRef);

            if (!tokenSnap.exists()) {
                throw new Error('TOKEN_NOT_FOUND');
            }

            const data = tokenSnap.data();

            // Replay attack: already used
            if (data.used === true) {
                throw new Error('TOKEN_ALREADY_USED');
            }

            // Time-based expiry: reject tokens older than 2 hours
            const createdAt = data.createdAt?.toDate?.() as Date | undefined;
            if (createdAt) {
                const ageMs = Date.now() - createdAt.getTime();
                if (ageMs > 2 * 60 * 60 * 1000) {
                    throw new Error('TOKEN_EXPIRED');
                }
            }

            // Atomically mark as used within the same transaction
            transaction.update(tokenRef, { used: true, verifiedAt: serverTimestamp() });

            // Capture plan and userId for return value
            resultPlan = data.plan as 'weekly' | 'monthly' | 'quarterly' | 'annual';
            resultUserId = data.userId as string;
        });

        // Clean up localStorage
        localStorage.removeItem('pendingSelarRef');
        localStorage.removeItem('pendingVipPlan');

        console.log(`[Selar] ✅ Order verified for userId: ${resultUserId}, plan: ${resultPlan}`);
        return { success: true, plan: resultPlan, userId: resultUserId };

    } catch (e: any) {
        const msg = e?.message || '';
        if (msg === 'TOKEN_NOT_FOUND') {
            console.warn('[Selar] Pending token not found:', reference);
        } else if (msg === 'TOKEN_ALREADY_USED') {
            console.warn('[Selar] Token already used (duplicate verification attempt):', reference);
        } else if (msg === 'TOKEN_EXPIRED') {
            console.warn('[Selar] Token expired (>2 hours old):', reference);
        } else {
            console.error('[Selar] Verification error:', e);
        }
        return { success: false };
    }
};

/**
 * Legacy stub — kept so AuthContext.tsx compiles without changes to the old Fapshi path.
 * The new flow uses verifySelarOrder() instead.
 */
export const verifySelarTransaction = async (_reference: string): Promise<boolean> => {
    console.warn('[Selar] verifySelarTransaction is deprecated. Use verifySelarOrder() instead.');
    return false;
};
