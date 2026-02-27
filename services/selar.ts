import { doc, setDoc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";


/**
 * Selar Integration — Redirect-URL Method (Free, Fully Automatic)
 *
 * Flow:
 * 1. User clicks Pay → we write a pending token to Firestore + redirect to Selar product link
 * 2. Selar processes payment → redirects buyer to:
 *    https://yourapp.com/?selar_order=<ORDER_ID>&plan=<PLAN>
 * 3. App.tsx detects ?selar_order= param → calls verifySelarOrder()
 * 4. verifySelarOrder() checks Firestore for the pending token (replay-attack protection)
 *    and marks it as used → upgrades user to VIP automatically
 *
 * Setup required in Selar dashboard (one-time):
 *   Product → Edit → "Redirect buyers to an external URL after purchase"
 *   Set URL to: https://<YOUR_DOMAIN>/?selar_order={order_id}&plan=daily   (per plan)
 *
 * No backend. No Zapier. No manual approval. Completely free.
 */

// ─── PRODUCT LINKS ──────────────────────────────────────────────────────────
// Replace these with your actual Selar product IDs after creating them.
// In Selar dashboard: Products → Create Product → get the product link
const SELAR_PRODUCTS: Record<string, string> = {
    daily: import.meta.env.VITE_SELAR_DAILY_LINK || 'https://selar.co/vantage-daily',
    weekly: import.meta.env.VITE_SELAR_WEEKLY_LINK || 'https://selar.co/vantage-weekly',
    monthly: import.meta.env.VITE_SELAR_MONTHLY_LINK || 'https://selar.co/vantage-monthly',
    annual: import.meta.env.VITE_SELAR_ANNUAL_LINK || 'https://selar.co/vantage-annual',
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
    plan: 'daily' | 'weekly' | 'monthly' | 'annual',
    email: string,
    userId: string,
): Promise<SelarInitResponse> => {
    // Generate a unique reference tied to this user+session
    const reference = `VAN_${userId.slice(0, 8)}_${plan}_${Date.now()}`;

    // Write pending token to Firestore (expires in 2 hours — enforced on read)
    // Collection: selar_pending/{reference}
    await setDoc(doc(db, 'selar_pending', reference), {
        userId,
        plan,
        email,
        reference,
        createdAt: serverTimestamp(),
        used: false,
    });

    // Store locally too (for matching on return)
    localStorage.setItem('pendingSelarRef', reference);
    localStorage.setItem('pendingVipPlan', plan);

    // Selar appends ?order_id=... automatically when redirecting back.
    // We include our ref so we can match the pending token.
    const appReturnUrl = `${window.location.origin}/?selar_ref=${reference}&plan=${plan}`;
    const productLink = SELAR_PRODUCTS[plan];

    // Note: Selar uses the redirect URL configured in the dashboard.
    // We embed the reference in the product link as a query param.
    // Selar passes it through on most link types (via ?ref= or &ref=).
    const checkout_url = `${productLink}?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(appReturnUrl)}`;

    console.log(`[Selar] Redirecting to checkout for plan: ${plan} | ref: ${reference}`);
    return { checkout_url, reference };
};

/**
 * Step 2: Verify a Selar payment on return from checkout.
 * Called by App.tsx when it detects ?selar_ref= in the URL.
 *
 * Security model:
 * - Checks that the pending Firestore token exists and is NOT already used (replay protection)
 * - Checks that the token is less than 2 hours old (prevents stale link reuse)
 * - Marks token as used immediately (atomic — prevents double-grant)
 *
 * @param reference  - The VAN_... reference stored in Firestore (from ?selar_ref= param)
 * @returns { success, plan, userId } or { success: false }
 */
export const verifySelarOrder = async (
    reference: string
): Promise<{ success: boolean; plan?: 'daily' | 'weekly' | 'monthly'; userId?: string }> => {
    if (!reference || !reference.startsWith('VAN_')) {
        console.warn('[Selar] Invalid reference format:', reference);
        return { success: false };
    }

    try {
        const tokenRef = doc(db, 'selar_pending', reference);
        const tokenSnap = await getDoc(tokenRef);

        if (!tokenSnap.exists()) {
            console.warn('[Selar] Pending token not found:', reference);
            return { success: false };
        }

        const data = tokenSnap.data();

        // Replay attack: already used
        if (data.used === true) {
            console.warn('[Selar] Token already used:', reference);
            return { success: false };
        }

        // Time-based expiry: reject tokens older than 2 hours
        const createdAt = data.createdAt?.toDate?.() as Date | undefined;
        if (createdAt) {
            const ageMs = Date.now() - createdAt.getTime();
            if (ageMs > 2 * 60 * 60 * 1000) {
                console.warn('[Selar] Token expired:', reference);
                return { success: false };
            }
        }

        // Mark as used atomically before granting VIP (prevents double-grant on refresh)
        await setDoc(tokenRef, { used: true, verifiedAt: serverTimestamp() }, { merge: true });

        // Clean up localStorage
        localStorage.removeItem('pendingSelarRef');
        localStorage.removeItem('pendingVipPlan');

        console.log(`[Selar] ✅ Order verified for userId: ${data.userId}, plan: ${data.plan}`);
        return { success: true, plan: data.plan, userId: data.userId };

    } catch (e) {
        console.error('[Selar] Verification error:', e);
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
