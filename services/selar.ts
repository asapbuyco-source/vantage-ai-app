import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { auth } from "../firebaseConfig";

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

async function getFirebaseBearer(): Promise<string> {
  const current = auth.currentUser;
  if (!current) throw new Error("Login required");
  return `Bearer ${await current.getIdToken()}`;
}

const getBackendUrl = (): string => {
  const url = import.meta.env?.VITE_BACKEND_URL;
  if (!url) throw new Error('[Selar] VITE_BACKEND_URL is not configured.');
  return url.replace(/\/$/, '');
};

export const initiateSelarPayment = async (
    plan: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual',
    email: string,
    userId: string,
): Promise<SelarInitResponse> => {
    const backendUrl = getBackendUrl();

    const response = await fetch(`${backendUrl}/api/payments/selar/initiate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: await getFirebaseBearer(),
        },
        body: JSON.stringify({ plan, email }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Selar initiation failed');
    }

    const data = await response.json();
    localStorage.setItem('pendingSelarRef', data.reference);
    localStorage.setItem('pendingVipPlan', plan);

    return { checkout_url: data.checkoutUrl, reference: data.reference };
};

export const verifySelarOrder = async (
    reference: string
): Promise<{ success: boolean; plan?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'; userId?: string }> => {
    if (!reference || !reference.startsWith('VAN_')) {
        console.warn('[Selar] Invalid reference format:', reference);
        return { success: false };
    }

    try {
        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/api/payments/selar/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: await getFirebaseBearer(),
            },
            body: JSON.stringify({ reference }),
        });

        const data = await response.json();

        if (response.status === 202) {
            return { success: false };
        }

        if (!response.ok) {
            console.error('[Selar] Verification error:', data.error);
            return { success: false };
        }

        localStorage.removeItem('pendingSelarRef');
        localStorage.removeItem('pendingVipPlan');

        return { success: true };
    } catch (e) {
        console.error('[Selar] Verification error:', e);
        return { success: false };
    }
};


