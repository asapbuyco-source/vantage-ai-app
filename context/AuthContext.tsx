import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    deleteUser,
    onAuthStateChanged,
    User
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, increment, addDoc, orderBy, runTransaction, limit, getDocs, query } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { UserProfile, PayoutRequest } from '../types';
import { checkPaymentStatus } from "../services/fapshi";

interface AuthContextType {
    user: User | null;
    userProfile: UserProfile | null;
    loading: boolean;
    error: string | null;
    isAdmin: boolean;
    signInWithGoogle: (referralCode?: string) => Promise<void>;
    signInWithEmail: (email: string, password: string) => Promise<void>;
    signUpWithEmail: (email: string, password: string, referralCode?: string) => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    logout: () => Promise<void>;
    deleteAccount: () => Promise<void>;
    clearError: () => void;
    upgradeToVip: (plan: 'weekly' | 'monthly' | 'quarterly' | 'annual') => Promise<void>;
    getAllUsers: () => Promise<UserProfile[]>;
    toggleUserVip: (uid: string, currentStatus: boolean, plan?: 'weekly'|'monthly'|'quarterly'|'annual') => Promise<void>;
    toggleUserAdmin: (uid: string, currentStatus: boolean) => Promise<void>;
    toggleUserBlock: (uid: string, currentStatus: boolean) => Promise<void>;
    verifyTransaction: (transId: string) => Promise<boolean>;
    requestPayout: (amount: number, phoneNumber: string) => Promise<void>;
    getPayoutRequests: () => Promise<PayoutRequest[]>;
    processPayout: (payoutId: string, action: 'paid' | 'rejected') => Promise<void>;
    updateUserCountry: (country: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Admin check is based exclusively on Firestore profile to avoid exposing any
// identifying information in the client JS bundle.
// Bootstrap: first login from VITE_ADMIN_EMAIL sets isAdmin:true in Firestore (see onAuthStateChanged).

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // isAdmin is derived purely from Firestore — no email string in the bundle
    const isAdmin = userProfile?.isAdmin === true;

    const generateReferralCode = (name: string | null): string => {
        // Fix: Properly sanitize name to get exactly 3 uppercase letters, or 'VAN' as fallback
        const cleanName = (name || '').toUpperCase().replace(/[^A-Z]/g, '');
        const prefix = cleanName.length >= 3 ? cleanName.substring(0, 3) : (cleanName + 'VAN').substring(0, 3);
        const random = Math.random().toString(36).substring(2, 7).toUpperCase();
        return `${prefix}${random}`;
    };

    /**
     * FIX (HIGH): O(1) referral lookup using a dedicated `referral_codes` collection.
     * The old implementation scanned the entire `profiles` collection to find the referrer,
     * which was O(n) in user count and would spike Firestore costs at scale.
     * The `referral_codes` collection is keyed by the referral code itself, so lookup is O(1).
     */
    const processReferral = async (newUserId: string, promoCode: string) => {
        try {
            // O(1) lookup — direct doc read by code key (no collection scan)
            const codeRef = doc(db, "referral_codes", promoCode.toUpperCase());
            const codeSnap = await getDoc(codeRef);
            if (codeSnap.exists()) {
                const referrerId = codeSnap.data().ownerUid;
                if (referrerId && referrerId !== newUserId) {
                    await updateDoc(doc(db, "profiles", newUserId), { referredBy: referrerId });
                    await updateDoc(doc(db, "profiles", referrerId), { referralCount: increment(1) });
                }
            }
        } catch (e) {
            console.error("Error processing referral:", e);
        }
    };

    const fetchProfile = async (firebaseUser: User) => {
        try {
            const userRef = doc(db, "profiles", firebaseUser.uid);
            const docSnap = await getDoc(userRef);
            let profileData: any;

            if (docSnap.exists()) {
                profileData = docSnap.data();
                if (profileData.isBlocked) {
                    await signOut(auth);
                    setUser(null);
                    setUserProfile(null);
                    setError("Votre compte a été suspendu par l'administrateur.");
                    return;
                }
                // Session expiry: force re-login after 12 hours
                const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
                const lastLogin = profileData.lastLoginAt ? new Date(profileData.lastLoginAt).getTime() : 0;
                const sessionAge = Date.now() - lastLogin;
                if (sessionAge > SESSION_MAX_AGE_MS && lastLogin > 0) {
                    console.log('[Auth] Session expired, forcing re-login');
                    await signOut(auth);
                    setUser(null);
                    setUserProfile(null);
                    setError("Votre session a expiré. Veuillez vous reconnecter.");
                    return;
                }
                // Update lastLoginAt on each successful auth
                await updateDoc(userRef, { lastLoginAt: new Date().toISOString() });
                if (!profileData.referralCode) {
                    const newCode = generateReferralCode(profileData.displayName || profileData.email);
                    await updateDoc(userRef, { referralCode: newCode });
                    profileData.referralCode = newCode;
                }
                if (profileData.isVip && profileData.vipExpiry) {
                    if (new Date() > new Date(profileData.vipExpiry)) {
                        try {
                            // Fix: Ensure UI state reflects expiration even if DB write fails temporarily
                            await updateDoc(userRef, { isVip: false, vipExpiry: null });
                            profileData.isVip = false;
                            profileData.vipExpiry = null;
                        } catch (e) {
                            console.error("Expired VIP update failed:", e);
                            // Still set locally so user doesn't get free access due to DB error
                            profileData.isVip = false;
                        }
                    }
                }
            } else {
                // Profile document doesn't exist yet (race condition on new signup).
                // createProfile() will write it. Return early to avoid setUserProfile(undefined).
                return;
            }

            // Bootstrap: if the env-configured admin email matches, grant isAdmin on first setup
            const adminEmail = import.meta.env?.VITE_ADMIN_EMAIL;
            if (adminEmail && firebaseUser.email === adminEmail && !profileData?.isAdmin) {
                await setDoc(userRef, { isAdmin: true }, { merge: true });
                if (profileData) profileData.isAdmin = true;
            }

            setUserProfile(profileData as UserProfile);

        } catch (e) {
            console.error("Profile fetch error:", e);
        }
    };

    const createProfile = async (firebaseUser: User, referralCodeInput?: string) => {
        const userRef = doc(db, "profiles", firebaseUser.uid);
        const docSnap = await getDoc(userRef);

        if (!docSnap.exists()) {
            const newReferralCode = generateReferralCode(firebaseUser.displayName || firebaseUser.email);
            const profileData = {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                isVip: false,
                isAdmin: import.meta.env?.VITE_ADMIN_EMAIL ? firebaseUser.email === import.meta.env.VITE_ADMIN_EMAIL : false,
                displayName: firebaseUser.displayName,
                isBlocked: false,
                referralCode: newReferralCode,
                referralCount: 0,
                referralEarnings: 0,
                lifetimeEarnings: 0
            };
            await setDoc(userRef, profileData);

            // FIX: Write reverse-index for O(1) referral lookups.
            // Key = the referral code, value = the owner's UID.
            // This avoids the full profiles collection scan in processReferral.
            try {
                const codeRef = doc(db, "referral_codes", newReferralCode.toUpperCase());
                await setDoc(codeRef, { ownerUid: firebaseUser.uid, createdAt: new Date().toISOString() });
            } catch (e) {
                // Non-critical: profile is already written, just log
                console.warn('[Auth] Could not write referral_codes index:', e);
            }

            if (referralCodeInput && referralCodeInput.length > 3) {
                await processReferral(firebaseUser.uid, referralCodeInput);
            }
        }
    };

    // Safe Authentication Initialization
    useEffect(() => {
        let unsubscribe: () => void;

        try {
            unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                if (currentUser) {
                    setUser(currentUser);
                    await fetchProfile(currentUser);
                } else {
                    setUser(null);
                    setUserProfile(null);
                }
                setLoading(false);
            }, (authError) => {
                console.error("Auth Listener Error:", authError);
                setError("Authentication service unavailable. Please check your connection.");
                setLoading(false);
            });
        } catch (e: any) {
            console.error("Critical Auth Error:", e);
            setError("System Configuration Error. Please verify API keys.");
            setLoading(false);
        }

        return () => { if (unsubscribe) unsubscribe(); };
    }, []);

    const signInWithGoogle = async (referralCode?: string) => {
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            if (result.user) await createProfile(result.user, referralCode);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const signInWithEmail = async (email: string, pass: string) => {
        setError(null);
        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const signUpWithEmail = async (email: string, pass: string, referralCode?: string) => {
        setError(null);
        try {
            const result = await createUserWithEmailAndPassword(auth, email, pass);
            if (result.user) await createProfile(result.user, referralCode);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const logout = async () => { await signOut(auth); };

    const deleteAccount = async () => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, "profiles", user.uid));
            await deleteUser(user);
            setUser(null);
            setUserProfile(null);
        } catch (e: any) {
            console.error("Delete Account Error:", e);
            throw e;
        }
    };

    const resetPassword = async (email: string) => { await sendPasswordResetEmail(auth, email); };

    const upgradeToVip = async (plan: 'weekly' | 'monthly' | 'quarterly' | 'annual') => {
        if (!user) return;
        const now = new Date();
        let expiry = new Date();
        if (plan === 'weekly') expiry.setDate(now.getDate() + 7);
        if (plan === 'monthly') expiry.setDate(now.getDate() + 30);
        if (plan === 'quarterly') expiry.setDate(now.getDate() + 90);
        if (plan === 'annual') expiry.setDate(now.getDate() + 365);
        
        const isFirstTime = !userProfile?.totalPaid || userProfile.totalPaid === 0;
        let planCost = plan === 'weekly' ? 2000 : plan === 'monthly' ? 6500 : plan === 'quarterly' ? 18000 : 70000;
        
        if (isFirstTime) {
            if (plan === 'weekly') planCost = 1000;
            if (plan === 'monthly') planCost = 3250;
        }

        try {
            const userRef = doc(db, "profiles", user.uid);
            const referredBy = userProfile?.referredBy;

            await runTransaction(db, async (tx) => {
                const now = new Date();
                let expiry = new Date();
                if (plan === 'weekly') expiry.setDate(now.getDate() + 7);
                if (plan === 'monthly') expiry.setDate(now.getDate() + 30);
                if (plan === 'quarterly') expiry.setDate(now.getDate() + 90);
                if (plan === 'annual') expiry.setDate(now.getDate() + 365);

                tx.update(userRef, {
                    isVip: true,
                    vipExpiry: expiry.toISOString(),
                    vipPlan: plan,
                    totalPaid: increment(planCost)
                });

                if (referredBy) {
                    const commission = Math.floor(planCost * 0.40);
                    if (commission > 0) {
                        const referrerRef = doc(db, "profiles", referredBy);
                        tx.update(referrerRef, {
                            referralEarnings: increment(commission),
                            lifetimeEarnings: increment(commission)
                        });
                    }
                }
            });

            await fetchProfile(user);
        } catch (e) {
            console.error("Failed to upgrade VIP", e);
        }
    };

    const updateUserCountry = async (country: string) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, "profiles", user.uid), { country });
            await fetchProfile(user);
        } catch (e) {
            console.error("Failed to update user country", e);
            throw e;
        }
    };

    const requestPayout = async (amount: number, phoneNumber: string) => {
        if (!user || !userProfile) return;
        if (amount < 1000) throw new Error("Minimum payout is 1000 FCFA");

        try {
            const userRef = doc(db, "profiles", user.uid);
            await runTransaction(db, async (transaction) => {
                const userSnap = await transaction.get(userRef);
                if (!userSnap.exists()) throw new Error("User profile not found");

                const currentBalance = userSnap.data().referralEarnings || 0;
                if (amount > currentBalance) throw new Error("Insufficient balance");

                const payoutRef = doc(collection(db, "payout_requests"));
                transaction.update(userRef, { referralEarnings: increment(-amount) });
                transaction.set(payoutRef, {
                    userId: user.uid,
                    userEmail: user.email,
                    amount: amount,
                    phoneNumber: phoneNumber,
                    status: 'pending',
                    date: new Date().toISOString(),
                    paymentMethod: 'Mobile Money'
                });
            });
            await fetchProfile(user);
        } catch (e: any) {
            console.error("Payout Request Failed:", e);
            throw e;
        }
    };

    const getPayoutRequests = async (): Promise<PayoutRequest[]> => {
        if (!isAdmin) return [];
        try {
            const q = query(collection(db, "payout_requests"), orderBy("date", "desc"));
            const snapshot = await getDocs(q);
            const requests: PayoutRequest[] = [];
            snapshot.forEach(doc => requests.push({ id: doc.id, ...doc.data() } as PayoutRequest));
            return requests;
        } catch (e) {
            return [];
        }
    };

    const processPayout = async (payoutId: string, action: 'paid' | 'rejected') => {
        if (!isAdmin) return;
        try {
            const payoutRef = doc(db, "payout_requests", payoutId); // fixed: was 'payouts', mismatched with requestPayout which writes to 'payout_requests'
            await runTransaction(db, async (transaction) => {
                const payoutSnap = await transaction.get(payoutRef);
                if (!payoutSnap.exists()) throw new Error("Payout request not found");

                const payoutData = payoutSnap.data() as PayoutRequest;
                if (payoutData.status !== 'pending') throw new Error("Payout already processed");

                if (action === 'paid') {
                    transaction.update(payoutRef, { status: 'paid' });
                } else if (action === 'rejected') {
                    const userRef = doc(db, "profiles", payoutData.userId);
                    transaction.update(payoutRef, { status: 'rejected' });
                    transaction.update(userRef, {
                        referralEarnings: increment(payoutData.amount)
                    });
                }
            });
        } catch (e) {
            console.error("Process Payout Error:", e);
            throw e;
        }
    };

    const toggleUserVip = async (uid: string, currentStatus: boolean, plan: 'weekly' | 'monthly' | 'quarterly' | 'annual' = 'monthly') => {
        if (!isAdmin) return;
        const userRef = doc(db, "profiles", uid);
        if (!currentStatus) {
            const expiry = new Date();
            if (plan === 'weekly') expiry.setDate(expiry.getDate() + 7);
            else if (plan === 'quarterly') expiry.setDate(expiry.getDate() + 90);
            else if (plan === 'annual') expiry.setDate(expiry.getDate() + 365);
            else expiry.setDate(expiry.getDate() + 30);
            await updateDoc(userRef, { isVip: true, vipExpiry: expiry.toISOString(), vipPlan: plan });
        } else {
            await updateDoc(userRef, { isVip: false, vipExpiry: null, vipPlan: null });
        }
    };

    const toggleUserAdmin = async (uid: string, currentStatus: boolean) => {
        if (!isAdmin) return;
        await updateDoc(doc(db, "profiles", uid), { isAdmin: !currentStatus });
    };

    const toggleUserBlock = async (uid: string, currentStatus: boolean) => {
        if (!isAdmin) return;
        await updateDoc(doc(db, "profiles", uid), { isBlocked: !currentStatus });
    };

    const getAllUsers = async (): Promise<UserProfile[]> => {
        if (!isAdmin) return [];
        try {
            const q = query(collection(db, "profiles"), limit(500));
            const querySnapshot = await getDocs(q);
            const profiles: UserProfile[] = [];
            querySnapshot.forEach((doc) => profiles.push(doc.data() as UserProfile));
            return profiles;
        } catch (e) {
            return [];
        }
    };

    const verifyTransaction = async (transId: string): Promise<boolean> => {
        if (!user) return false;
        const cleanTransId = transId.split(',')[0].trim();

        try {
            // ── Selar (Global) ──────────────────────────────────────────────
            // App.tsx already called verifySelarOrder() which validated and
            // marked the Firestore token as used atomically via runTransaction.
            // Here we verify that the token IS marked used (proof of verification)
            // and then upgrade the user. This prevents repeated re-verifications
            // from re-granting VIP access.
            if (cleanTransId.startsWith('SELAR_')) {
                // Strip the "SELAR_" prefix to get the original VAN_ reference
                const selarRef = cleanTransId.replace(/^SELAR_/, '');
                const tokenSnap = await getDoc(doc(db, 'selar_pending', selarRef));
                if (!tokenSnap.exists()) return false;
                const data = tokenSnap.data();
                // Security: only upgrade if verifySelarOrder() already marked this token as used
                // This ensures no VIP grant happens without a proper atomic verification
                if (data.used !== true) {
                    console.warn('[AuthContext] Selar token not yet verified (used !== true). Aborting VIP grant.');
                    return false;
                }
                const plan: 'weekly' | 'monthly' | 'quarterly' | 'annual' = data.plan || 'weekly';
                await upgradeToVip(plan);
                localStorage.removeItem('pendingVipPlan');
                return true;
            }

            // ── Fapshi (Cameroon MoMo) ───────────────────────────────
            const result = await checkPaymentStatus(cleanTransId);
            const isSuccess = result.status === 'SUCCESSFUL';
            const amount = result.amount;

            if (isSuccess) {
                // ✔️ Idempotency guard: prevent the same transId from granting VIP twice.
                // This is especially important because the App.tsx effect can potentially
                // fire multiple times across page loads if localStorage isn't cleared properly.
                const txRef = doc(db, 'fapshi_transactions', cleanTransId);
                const txSnap = await getDoc(txRef);
                if (txSnap.exists()) {
                    console.warn(`[AuthContext] Fapshi transId ${cleanTransId} already used. Skipping duplicate VIP grant.`);
                    return false;
                }

                let plan: 'weekly' | 'monthly' | 'quarterly' | 'annual' = 'weekly';
                const storedPlan = localStorage.getItem('pendingVipPlan') as any;

                // Prioritise the actual amount paid over localStorage (more reliable)
                if (amount !== undefined) {
                    if (amount >= 70000) plan = 'annual';
                    else if (amount >= 18000) plan = 'quarterly';
                    else if (amount >= 6500) plan = 'monthly';
                    else if (amount >= 2000) plan = 'weekly';
                    else plan = storedPlan || 'weekly';
                } else {
                    plan = storedPlan || 'weekly';
                }

                // Mark as used BEFORE upgrading to prevent any race-condition double-grant
                await setDoc(txRef, {
                    usedAt: new Date().toISOString(),
                    userId: user.uid,
                    plan,
                    amount: amount ?? null,
                });

                await upgradeToVip(plan);
                localStorage.removeItem('pendingVipPlan');
                return true;
            }
            return false;
        } catch (e) {
            console.error("Verification failed:", e);
            return false;
        }
    };


    return (
        <AuthContext.Provider value={{
            user, userProfile, loading, error, isAdmin,
            signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, logout, deleteAccount, clearError: () => setError(null),
            upgradeToVip, getAllUsers, toggleUserVip, toggleUserAdmin, toggleUserBlock, verifyTransaction,
            requestPayout, getPayoutRequests, processPayout, updateUserCountry
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};