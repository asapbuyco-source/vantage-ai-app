# Selar Product Creation Guide

To fully connect your Firebase/Railway app to Selar so that payments automatically grant VIP status, you need to create 4 products in Selar exactly as described below.

---

## 1. Create the Products in Selar
Log in to your Selar dashboard, click **Add Product**, and choose **Digital Product** or **Subscription** (Subscription is best if you want Selar to handle recurring billing, but Digital Product is fine if you're doing one-off passes).

Create **4 separate products**, one for each plan. 

**Give them clear names, for example:**
*   Vantage AI - Daily VIP
*   Vantage AI - Weekly VIP
*   Vantage AI - Monthly VIP
*   Vantage AI - Annual VIP

Set your price for each. 

---

## 2. Get the Product Links
After creating them, Selar will give you a short link for each product (e.g., `https://selar.co/m/xyz123`).

You need to add these exact links into your Railway environment variables so the app knows where to send users when they click "Buy" on the VIP page.

Add these 4 variables to Railway (replace the URLs with your actual Selar product links):
*   `VITE_SELAR_DAILY_LINK` = `https://selar.co/your-daily-link`
*   `VITE_SELAR_WEEKLY_LINK` = `https://selar.co/your-weekly-link`
*   `VITE_SELAR_MONTHLY_LINK` = `https://selar.co/your-monthly-link`
*   `VITE_SELAR_ANNUAL_LINK` = `https://selar.co/your-annual-link`

---

## 3. The Most Critical Setting: The Redirect URL
For the system to automatically say "Payment Successful" and upgrade their account, Selar MUST send the user back to your app with their receipt. 

The app actually sends a special dynamic link to Selar during checkout, but you must also configure the fallback redirect setting inside the Selar product settings just in case.

**For each of your 4 products in Selar:**
1. Edit the product.
2. Scroll down to **More Details / Advanced Options**.
3. Look for **"Redirect the buyer to an external URL after a purchase"** (Check this box).
4. Enter your Netlify app's URL (your frontend), exactly like this:
   `https://[YOUR_NETLIFY_DOMAIN].netlify.app/?selar_ref=true`
   *(Be sure to replace `[YOUR_NETLIFY_DOMAIN]` with your actual live `.netlify.app` or custom domain url).*

### Optional: Require Email Checkbox
In your Selar store settings, make sure "Require Customer Email" is turned on. Vantage relies on the email to secure the token and match the user.

---

That's it! 
When a user clicks "Buy Weekly" in the app, the code will dynamically attach their specific user ID to your `VITE_SELAR_WEEKLY_LINK` and send them to Selar. When they pay, Selar will bounce them right back to your app, the app verifies the token, and instantly unlocks VIP!
