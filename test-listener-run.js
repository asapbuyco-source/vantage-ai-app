import { checkRecentSelarEmails } from './backend/gmailListener.js';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize Firebase manually for the test script
try {
    const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (e) {
    console.log("Firebase not initialized in test script, simulating db if needed. Error:", e.message);
}

// Override the actual gmail call to not crash if Firebase isn't fully set up in this isolated script
console.log("Starting forced Selar check...");
checkRecentSelarEmails().then(() => {
    console.log("Done checking.");
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
