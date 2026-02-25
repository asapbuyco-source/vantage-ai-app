
const SELAR_API_BASE = "https://api.selar.co/v1";
const SELAR_API_KEY = import.meta.env?.VITE_SELAR_API_KEY || "";

/**
 * Selar Integration - Growth Phase
 * Handles international payments for users outside Cameroon.
 */

export interface SelarInitResponse {
    checkout_url: string;
    reference: string;
}

/**
 * Initiates a Selar checkout session.
 */
export const initiateSelarPayment = async (
    amount: number,
    email: string,
    name: string,
    currency: string = 'NGN'
): Promise<SelarInitResponse> => {
    // In a real implementation, we would call the Selar API.
    // Since Selar checkout is usually a hosted link or a product link,
    // we return a simulation or a direct product link if provided.

    const reference = `VAN_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // For local development/MVP, we'll return a simulated link or a generic Selar store link
    // with query parameters that we can track on return if using their webhooks.

    console.log(`[Selar] Initiating payment for ${email}: ${amount} ${currency}`);

    return {
        checkout_url: `https://selar.co/m/vantage-ai?email=${email}&amount=${amount}&currency=${currency}&ref=${reference}`,
        reference
    };
};

/**
 * Verifies a Selar transaction.
 * Usually done via webhook, but can be polled if the API supports it.
 */
export const verifySelarTransaction = async (reference: string): Promise<boolean> => {
    if (!SELAR_API_KEY) {
        console.warn("Selar API Key missing. Simulation mode enabled.");
        return true; // Simulate success for demo
    }

    try {
        const response = await fetch(`${SELAR_API_BASE}/check-transaction/${reference}`, {
            headers: {
                'Authorization': `Bearer ${SELAR_API_KEY}`
            }
        });

        if (!response.ok) return false;
        const data = await response.json();
        return data.status === 'success';
    } catch (e) {
        console.error("Selar Verification Error:", e);
        return false;
    }
};
