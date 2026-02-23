
import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------
// Replaced hardcoded keys with Environment Variables to allow secure git commits.
// Added optional chaining (?.) to prevent crashes if import.meta.env is undefined.
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase credentials missing in environment variables.");
}

// Custom fetch with retry logic to handle "Failed to fetch" errors
const fetchWithRetry = async (url: string, options?: any, retries = 3, backoff = 300): Promise<Response> => {
  try {
    const res = await fetch(url, options);
    // Retry on 5xx server errors
    if (!res.ok && res.status >= 500 && retries > 0) {
      throw new Error(`Server Error ${res.status}`);
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      console.warn(`[Network] Retry ${4 - retries}/3 for ${url}`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    fetch: fetchWithRetry
  }
});