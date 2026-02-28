# Vantage AI: Deployment & Environment Variables Guide

This document outlines all the environment variables and manual configurations required to run Vantage AI successfully in production.

## 1. Environment Variables (Railway / Production)

You must add these variables to your **Railway project settings** (under the "Variables" tab). Do not wrap the values in quotes.

| Variable | Description | Required? | Location Used |
| :--- | :--- | :--- | :--- |
| `VITE_SPORTMONKS_API_TOKEN` | Your API key for fetching real-time match fixtures, odds, form, and H2H data. | **Yes** | Frontend & Backend (`sportsData.ts`, `server.js`) |
| `VITE_GOOGLE_GENAI_API_KEY` | Your API key for Gemini AI. Powers the daily predictions, match analysis, and blog generation. | **Yes** | Frontend & Backend (`gemini.ts`, `server.js`) |
| `VITE_GEMINI_AI_API_KEY` | (Legacy alias) Use the same value as `VITE_GOOGLE_GENAI_API_KEY`. Some parts of the codebase might still check for this. | Optional | `gemini.ts` fallback |
| `VITE_BACKEND_URL` | The public URL of your deployed server. Used by the React frontend to communicate with your backend API. | **Yes** | Frontend (API calls) |
| `ADMIN_API_SECRET` | A secret passcode (e.g., a random string) to protect administrative endpoints (like manual AI generation). If omitted, the endpoints fail-open in dev mode. | **Yes** | Backend (`server.js`) |
| `PORT` | The port your server listens on. (Railway usually sets this automatically). | Auto | Backend (`server.js`) |
| `NODE_ENV` | Defines the environment. Set this to `production`. | Recommended | Backend `server.js` |

*Note: For local development, these should be placed in a `.env.local` file at the root of your project.*

---

## 2. Firebase Configuration (Manual Setup)

### A. Firebase Authentication
- **Enable Providers:** Ensure that **Email/Password** and **Google Sign-In** are enabled in the Firebase Authentication console.
- **Authorized Domains:** Important! You must add your Railway deployment URL (e.g., `your-app-name.up.railway.app`) to the **Authorized domains** list in the Firebase Authentication settings. Without this, users will get a "domain not authorized for sign-in" error.

### B. Firestore Database Rules
The critical security rules have already been coded and saved in your `firestore.rules` file locally. **You must deploy these rules to Firebase.**
1. Copy the contents of your local `firestore.rules` file.
2. Go to the Firebase Console -> **Firestore Database** -> **Rules** tab.
3. Paste the contents and click **Publish**.

*(This ensures that `selar_pending` tokens cannot be forged and `settings` cannot be maliciously overwritten).*

---

## 3. Selar Payment Webhook (Manual Setup)

To allow automatic VIP un-locking when users pay via Selar, you must configure your Selar product settings:

1. Log in to your Selar creator dashboard.
2. Edit your subscription/VIP product.
3. Find the **"Redirect URL"** setting.
4. Set the Redirect URL to point to your live app, specifically to the `#vip` tab, adding the reference parameter:
   `https://[YOUR_RAILWAY_URL]/#vip`
   *(Selar automatically appends `?reference=...` to this URL upon successful payment, which the frontend intercepts).*
5. Make sure the plans created in Selar match the plan types expected by the frontend: `'daily'`, `'weekly'`, `'monthly'`, or `'annual'`.

---

## 4. Admin Setup (In-App)

1. **Create an account:** Sign up normally through the live application.
2. **Promote to Admin:** Go to the Firebase Console -> **Firestore Database** -> `profiles` collection.
3. Find your user document (using your email).
4. Add or modify the `isAdmin` boolean field and set it to `true`.
5. Add or modify the `role` string field and set it to `"admin"`.
6. Refresh the app to access the internal Admin panel.
