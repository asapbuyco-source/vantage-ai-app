const admin = require('firebase-admin');

// Initialize admin
const serviceAccount = require('./backend/service-account.json');
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function test() {
    // Current UTC date
    const date = new Date().toISOString().split('T')[0];
    const docRef = db.collection('quant_predictions').doc(date);
    const snap = await docRef.get();
    
    if (!snap.exists) {
        console.log(`No quant_predictions found for ${date}`);
        // Let's check yesterday
        const yest = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const ySnap = await db.collection('quant_predictions').doc(yest).get();
        if (ySnap.exists) {
            console.log(`Found yesterday ${yest}`);
            const data = ySnap.data();
            console.log(JSON.stringify(data.predictions.slice(0, 2), null, 2));
        }
    } else {
        const data = snap.data();
        console.log(`Found today ${date}`);
        console.log(JSON.stringify(data.predictions.slice(0, 2), null, 2));
    }
}

test().then(() => process.exit(0)).catch(console.error);
