import admin from "firebase-admin";

export async function requireFirebaseUser(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Missing Firebase ID token" });
    if (!admin.apps.length) return res.status(503).json({ error: "Firebase Admin not initialized" });

    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired Firebase ID token" });
  }
}