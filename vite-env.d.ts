// Manually define ImportMetaEnv to ensure type safety for env vars
interface ImportMetaEnv {
  readonly PROD: boolean
  readonly DEV: boolean
  readonly MODE: string
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_FIREBASE_MEASUREMENT_ID: string
  readonly VITE_BACKEND_URL?: string
  readonly VITE_SELAR_DAILY_LINK?: string
  readonly VITE_SELAR_WEEKLY_LINK?: string
  readonly VITE_SELAR_MONTHLY_LINK?: string
  readonly VITE_SELAR_ANNUAL_LINK?: string
  readonly VITE_FIREBASE_VAPID_KEY?: string
  readonly VITE_ADMIN_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}