import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Forces Google to provide a refresh token
});

console.log('\n\n=============================================================');
console.log('🚨 ACTION REQUIRED 🚨');
console.log('1. Hold CTRL and click the link below to open it in your browser:');
console.log('\n' + authUrl + '\n');
console.log('2. Log in with your Vantage AI Gmail account, and click "Allow".');
console.log('3. The browser will redirect you, and the terminal will print your token!');
console.log('=============================================================\n');
console.log('Waiting for authorization...');

const server = http.createServer(async (req, res) => {
    try {
        if (req.url.startsWith('/oauth2callback')) {
            const qs = new URL(req.url, 'http://localhost:3000').searchParams;
            const code = qs.get('code');

            if (!code) {
                res.end('Error: No code found in callback URL.');
                return;
            }

            console.log('\n⏳ Code received. Exchanging for tokens...');
            const { tokens } = await oauth2Client.getToken(code);

            if (!tokens.refresh_token) {
                console.log('\n❌ ERROR: Google did not return a refresh token.');
                console.log('This usually happens if you already authorized it recently. Please go to https://myaccount.google.com/connections, remove Vantage AI, and run this script again.');
                res.end('Error: No refresh token received.');
                server.close();
                process.exit(1);
            }

            console.log('\n✅ SUCCESS! Here is your permanent Refresh Token:');
            console.log('\n' + tokens.refresh_token + '\n');
            console.log('👉 ACTION: Add this line to your .env.local file:');
            console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);

            res.end('Success! The token has been printed in your terminal. You can close this tab now.');
            server.close();
            process.exit(0);
        }
    } catch (e) {
        console.error(e);
        res.end('Error occurred: ' + e.message);
    }
}).listen(3000, () => {
    // Server is ready to catch the redirect
});
