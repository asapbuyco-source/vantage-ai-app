export interface PaymentStatusResponse {
  status: 'SUCCESSFUL' | 'FAILED' | 'PENDING' | 'EXPIRED' | 'CREATED' | 'UNKNOWN';
  amount?: number;
}

interface FapshiInitResponse {
  link: string;
  transId: string;
}

/**
 * Fapshi Integration — Backend Proxy Version
 *
 * All API calls go through the Express backend (/api/fapshi/*).
 * FAPSHI_USER_TOKEN and FAPSHI_API_KEY are server-side only env vars.
 * No payment credentials ever reach the browser bundle.
 */
const getBackendUrl = (): string => {
  const url = import.meta.env?.VITE_BACKEND_URL;
  if (!url) throw new Error('[Fapshi] VITE_BACKEND_URL is not configured.');
  return url.replace(/\/$/, '');
};

/**
 * Initiates a Fapshi MoMo payment via the backend proxy.
 * Backend calls live.fapshi.com with server-side credentials.
 */
export const initiatePayment = async (
  amount: number,
  email: string,
  userId: string
): Promise<FapshiInitResponse> => {
  const backendUrl = getBackendUrl();
  const redirectUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;

  const response = await fetch(`${backendUrl}/api/fapshi/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, email, userId, redirectUrl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Payment initiation failed: ${response.status}`);
  }

  const data = await response.json();
  return { link: data.link, transId: data.transId };
};

/**
 * Checks Fapshi payment status via the backend proxy.
 * Returns UNKNOWN on any network or configuration error.
 * The backend holds credentials server-side — no tokens in the bundle.
 */
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