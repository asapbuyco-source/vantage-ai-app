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

export const initiateFapshiPayment = async (
  plan: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual',
  email?: string
): Promise<FapshiInitResponse> => {
  const backendUrl = getBackendUrl();
  const redirectUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;

  const response = await fetch(`${backendUrl}/api/payments/fapshi/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await getFirebaseBearer(),
    },
    body: JSON.stringify({ plan, email, redirectUrl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Payment initiation failed: ${response.status}`);
  }

  const data = await response.json();
  return { link: data.link, transId: data.transId };
};

export async function verifyFapshiPayment(transId: string): Promise<{ status: PaymentStatusResponse['status']; alreadyProcessed?: boolean; plan?: string; vipExpiry?: string }> {
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
