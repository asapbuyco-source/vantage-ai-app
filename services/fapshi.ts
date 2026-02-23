interface FapshiInitResponse {
  link: string;
  transId: string;
}

export interface PaymentStatusResponse {
  status: 'SUCCESSFUL' | 'FAILED' | 'PENDING' | 'EXPIRED' | 'CREATED' | 'UNKNOWN';
  amount?: number;
}

const API_BASE = "https://live.fapshi.com";

/**
 * Get Fapshi credentials from environment variables only.
 * Throws a descriptive error if variables are missing.
 */
const getCredentials = () => {
  const userToken = import.meta.env?.VITE_FAPSHI_USER_TOKEN;
  const apiKey = import.meta.env?.VITE_FAPSHI_API_KEY;
  if (!userToken || !apiKey) {
    throw new Error(
      "Missing Fapshi credentials. Set VITE_FAPSHI_USER_TOKEN and " +
      "VITE_FAPSHI_API_KEY in your .env.local file."
    );
  }
  return { userToken, apiKey };
};

/**
 * Initiates a payment with Fapshi.
 */
export const initiatePayment = async (
  amount: number,
  email: string,
  userId: string
): Promise<FapshiInitResponse> => {
  const { userToken, apiKey } = getCredentials();

  const externalId = `${userId}_${Date.now()}`;
  const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;

  try {
    const response = await fetch(`${API_BASE}/initiate-pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiuser': userToken,
        'apikey': apiKey
      },
      body: JSON.stringify({
        amount: amount,
        email: email,
        externalId: externalId,
        redirectUrl: baseUrl
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Fapshi Init Error:", response.status, errorData);
      throw new Error(errorData.message || `Payment initiation failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      link: data.link,
      transId: data.transId
    };
  } catch (error) {
    console.error("Fapshi Payment Error:", error);
    throw error;
  }
};

/**
 * Checks the status of a payment
 */
export const checkPaymentStatus = async (transId: string): Promise<PaymentStatusResponse> => {
  let credentials: { userToken: string; apiKey: string };
  try {
    credentials = getCredentials();
  } catch {
    return { status: 'UNKNOWN' };
  }

  try {
    const response = await fetch(`${API_BASE}/payment-status/${transId}`, {
      method: 'GET',
      headers: {
        'apiuser': credentials.userToken,
        'apikey': credentials.apiKey
      }
    });

    if (!response.ok) {
      console.warn(`Fapshi Status Check HTTP ${response.status} for ${transId}`);
      return { status: 'PENDING' };
    }

    const data = await response.json();
    console.log(`Fapshi Status Response for ${transId}:`, data.status);

    return {
      status: data.status,
      amount: data.amount ? Number(data.amount) : undefined
    };
  } catch (e) {
    console.error("Fapshi Status Check Network Error:", e);
    return { status: 'UNKNOWN' };
  }
};