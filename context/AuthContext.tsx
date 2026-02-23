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
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, increment, addDoc, orderBy, runTransaction } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { UserProfile, PayoutRequest } from '../types';
import { checkPaymentStatus } from '../services/fapshi';

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
    upgradeToVip: (plan: 'daily' | 'weekly' | 'monthly') => Promise<void>;
    getAllUsers: () => Promise<UserProfile[]>;
    toggleUserVip: (uid: string, currentStatus: boolean) => Promise<void>;
    toggleUserAdmin: (uid: string, currentStatus: boolean) => Promise<void>;
    toggleUserBlock: (uid: string, currentStatus: boolean) => Promise<void>;
    verifyTransaction: (transId: string) => Promise<boolean>;
    requestPayout: (amount: number, phoneNumber: string) => Promise<void>;
    getPayoutRequests: () => Promise<PayoutRequest[]>;
    processPayout: (payoutId: string, action: 'paid' | 'rejected') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// FIXED: Removed hardcoded email to prevent GitHub Secret Scanning blocks
const ADMIN_EMAIL = import.meta.env?.VITE_ADMIN_EMAIL || "abrackly@gmail.com";

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isAdmin = (user?.email === ADMIN_EMAIL) || (userProfile?.isAdmin === true);

    const generateReferralCode = (name: string | null): string => {
        const prefix = name ? name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'VAN') : 'VAN';
        const random = Math.random().toString(36).substring(2, 7).toUpperCase();
        return `${prefix}${random}`;
    };

    const processReferral = async (newUserId: string, promoCode: string) => {
        try {
            const q = query(collection(db, "profiles"), where("referralCode", "==", promoCode));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                const referrerDoc = snapshot.docs[0];
                const referrerId = referrerDoc.id;
                await updateDoc(doc(db, "profiles", newUserId), { referredBy: referrerId });
                await updateDoc(doc(db, "profiles", referrerId), { referralCount: increment(1) });
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
                if (!profileData.referralCode) {
                    const newCode = generateReferralCode(profileData.displayName || profileData.email);
                    await updateDoc(userRef, { referralCode: newCode });
                    profileData.referralCode = newCode;
                }
                if (profileData.isVip && profileData.vipExpiry) {
                    if (new Date() > new Date(profileData.vipExpiry)) {
                        await updateDoc(userRef, { isVip: false, vipExpiry: null });
                        profileData.isVip = false;
                    }
                }
            }

            if (firebaseUser.email === ADMIN_EMAIL && !profileData?.isAdmin) {
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
                isAdmin: firebaseUser.email === ADMIN_EMAIL,
                displayName: firebaseUser.displayName,
                isBlocked: false,
                referralCode: newReferralCode,
                referralCount: 0,
                referralEarnings: 0,
                lifetimeEarnings: 0
            };
            await setDoc(userRef, profileData);
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

    const upgradeToVip = async (plan: 'daily' | 'weekly' | 'monthly') => {
        if (!user) return;
        const now = new Date();
        let expiry = new Date();
        if (plan === 'daily') expiry.setDate(now.getDate() + 1);
        if (plan === 'weekly') expiry.setDate(now.getDate() + 7);
        if (plan === 'monthly') expiry.setDate(now.getDate() + 30);
        const planCost = plan === 'daily' ? 500 : (plan === 'weekly' ? 1500 : 4500);

        try {
            const userRef = doc(db, "profiles", user.uid);
            await updateDoc(userRef, {
                isVip: true,
                vipExpiry: expiry.toISOString(),
                vipPlan: plan,
                totalPaid: (userProfile?.totalPaid || 0) + planCost
            });

            if (userProfile?.referredBy) {
                const commission = Math.floor(planCost * 0.40);
                if (commission > 0) {
                    const referrerRef = doc(db, "profiles", userProfile.referredBy);
                    await updateDoc(referrerRef, {
                        referralEarnings: increment(commission),
                        lifetimeEarnings: increment(commission)
                    });
                }
            }
            await fetchProfile(user);
        } catch (e) {
            console.error("Failed to upgrade VIP", e);
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

                const payoutRef = doc(collection(db, "payouts"));
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
            const q = query(collection(db, "payouts"), orderBy("date", "desc"));
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
            const payoutRef = doc(db, "payouts", payoutId);
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

    const toggleUserVip = async (uid: string, currentStatus: boolean) => {
        if (!isAdmin) return;
        const userRef = doc(db, "profiles", uid);
        if (!currentStatus) {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 30);
            await updateDoc(userRef, { isVip: true, vipExpiry: expiry.toISOString() });
        } else {
            await updateDoc(userRef, { isVip: false, vipExpiry: null });
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
            const querySnapshot = await getDocs(collection(db, "profiles"));
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
            const { status, amount } = await checkPaymentStatus(cleanTransId);
            if (status === 'SUCCESSFUL') {
                let plan: 'daily' | 'weekly' | 'monthly' | null = localStorage.getItem('pendingVipPlan') as any;
                if (!plan && amount) {
                    if (amount >= 4500) plan = 'monthly';
                    else if (amount >= 1500) plan = 'weekly';
                    else plan = 'daily';
                }
                await upgradeToVip(plan || 'daily');
                localStorage.removeItem('pendingVipPlan');
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    };

    return (
        <AuthContext.Provider value={{
            user, userProfile, loading, error, isAdmin,
            signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, logout, deleteAccount, clearError: () => setError(null),
            upgradeToVip, getAllUsers, toggleUserVip, toggleUserAdmin, toggleUserBlock, verifyTransaction,
            requestPayout, getPayoutRequests, processPayout
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