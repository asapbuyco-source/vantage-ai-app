# Vantage AI: Deployment & Environment Variables Guide

This document outlines all the environment variables and manual configurations required to run Vantage AI successfully in production.

## 1. Environment Variables (Railway / Production)

You must add these variables to your **Railway project settings** (under the "Variables" tab). Do not wrap the values in quotes.

| Variable | Description | Required? | Location Used |
| :--- | :--- | :--- | :--- |
| `VITE_BACKEND_URL` | The public URL of your deployed server. Used by the React frontend to communicate with your backend API. | **Yes** | Frontend (API calls) |
| `API_FOOTBALL_KEY` | API-Football key. This is the primary football source for fixtures, odds, predictions, injuries, form, and H2H. | **Yes** | Backend Python quant pipeline |
| `FIREBASE_SERVICE_ACCOUNT` | Minified Firebase Admin SDK service-account JSON. Required for scheduler writes, payments, admin token exchange, and push subscriptions. | **Yes** | Backend (`server.js`) |
| `ADMIN_API_SECRET` | Strong random secret used to sign/validate admin JWTs and legacy server-to-server admin calls. | **Yes** | Backend (`server.js`) |
| `ADMIN_JWT_SECRET` | Optional separate JWT signing secret. Use a strong value in production. | Recommended | Backend (`server.js`) |
| `GOOGLE_GENAI_API_KEY` | Gemini key for legacy/admin AI features and blog generation. | Optional | Backend (`server.js`) |
| `OPENAI_API_KEY` | OpenAI key for admin/test generation features if enabled. | Optional | Backend (`server.js`) |
| `SELAR_WEBHOOK_SECRET` | Secret used to verify Selar payment webhooks. | **Yes** | Backend payment webhook |
| `FAPSHI_USER_TOKEN` / `FAPSHI_API_KEY` | Fapshi credentials for Cameroon MoMo payments. | If Fapshi enabled | Backend payment routes |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push notification keys. | If push enabled | Backend push routes |
| `SPORTMONKS_API_TOKEN` | Deprecated legacy token. Do not configure for new deployments unless you restore Sportmonks-specific features. | No | Deprecated |
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
