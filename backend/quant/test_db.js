import admin from "firebase-admin";
import { readFileSync } from "fs";

const serviceAccount = JSON.parse(readFileSync("../config/serviceAccountKey.json", "utf-8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkMatches() {
    try {
        const snapshot = await db.collection("live_matches").where("date", "==", "2026-03-16").get();
        console.log("Matches Found:", snapshot.size);
        snapshot.forEach(doc => {
            const m = doc.data();
            console.log(`${m.homeTeam} vs ${m.awayTeam} - xG: ${m.predicted_xG}`);
        });
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkMatches();
