import { auth } from "../firebaseConfig";

export interface PaymentStatusResponse {
  status: 'SUCCESSFUL' | 'FAILED' | 'PENDING' | 'EXPIRED' | 'CREATED' | 'UNKNOWN';
  amount?: number;
}

interface FapshiInitResponse {
  link: string;
  transId: string;
}

const getBackendUrl = (): string => {
  const url = import.meta.env?.VITE_BACKEND_URL;
  if (!url) throw new Error('[Fapshi] VITE_BACKEND_URL is not configured.');
  return url.replace(/\/$/, '');
};

async function getFirebaseBearer(): Promise<string> {
  const current = auth.currentUser;
  if (!current) throw new Error("Login required");
  return `Bearer ${await current.getIdToken()}`;
}

export const initiatePayment = async (
  amount: number,
  email: string,
  userId: string
): Promise<FapshiInitResponse> => {
  const backendUrl = getBackendUrl();
  const redirectUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;

  const response = await fetch(`${backendUrl}/api/fapshi/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await getFirebaseBearer(),
    },
    body: JSON.stringify({ amount, email, userId, redirectUrl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Payment initiation failed: ${response.status}`);
  }

  const data = await response.json();
  return { link: data.link, transId: data.transId };
};

export const checkPaymentStatus = async (transId: string): Promise<PaymentStatusResponse> => {
  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/fapshi/status/${encodeURIComponent(transId)}`, {
      method: 'GET',
    });

    if (!response.ok) {
      console.warn(`[Fapshi] Proxy status HTTP ${response.status} for ${transId}`);
      return { status: 'PENDING' };
    }

    const data = await response.json();
    return {
      status: data.status ?? 'UNKNOWN',
      amount: data.amount !== undefined ? Number(data.amount) : undefined,
    };
  } catch (e) {
    console.error('[Fapshi] Status check network error:', e);
    return { status: 'UNKNOWN' };
  }
};

export async function verifyFapshiPayment(transId: string): Promise<{ success: boolean; alreadyProcessed?: boolean; plan?: string; vipExpiry?: string }> {
  const backendUrl = getBackendUrl();
  const res = await fetch(`${backendUrl}/api/payments/fapshi/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await getFirebaseBearer(),
    },
    body: JSON.stringify({ transId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Payment verification failed');
  }
  return res.json();
}