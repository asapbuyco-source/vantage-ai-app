import { Match } from "../types";
import { doc, getDoc, setDoc } from "firebase/firestore"; 
import { db, auth } from "../firebaseConfig";

// Access Vite Env Variables Safely
const API_KEY = import.meta.env?.VITE_JSONBIN_API_KEY || "";
const BASE_URL = "https://api.jsonbin.io/v3/b";

const MASTER_BIN_KEY = "vantage_master_bin_id";
const CONFIG_DOC_PATH = "config/vantage"; 

interface BinData {
  [dateKey: string]: {
    matches: Match[];
    generatedAt: string;
  };
}

const getBinId = async (): Promise<string | null> => {
  const localId = localStorage.getItem(MASTER_BIN_KEY);
  if (localId) return localId;

  try {
      if (auth.currentUser) {
        const docRef = doc(db, CONFIG_DOC_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().masterBinId) {
            const remoteId = docSnap.data().masterBinId;
            localStorage.setItem(MASTER_BIN_KEY, remoteId);
            return remoteId;
        }
      }
  } catch (e: any) {
      console.warn("Firestore Config Read Error (Using local only):", e.code || e.message);
  }

  return null;
};

const saveBinId = async (id: string) => {
    localStorage.setItem(MASTER_BIN_KEY, id);
    try {
        if (auth.currentUser) {
            await setDoc(doc(db, CONFIG_DOC_PATH), { masterBinId: id }, { merge: true });
        }
    } catch (e: any) {
        console.warn("Failed to save Bin ID to Firestore:", e.message);
    }
};

export const fetchBinData = async (): Promise<BinData | null> => {
  if (!API_KEY) {
      // Non-critical warning
      return null;
  }
  
  const binId = await getBinId();
  if (!binId) return null;

  try {
    const res = await fetch(`${BASE_URL}/${binId}/latest`, {
      method: 'GET',
      headers: { 'X-Master-Key': API_KEY }
    });

    if (!res.ok) {
        if (res.status === 404) {
            localStorage.removeItem(MASTER_BIN_KEY);
        }
        return null;
    }

    const data = await res.json();
    return data.record as BinData;
  } catch (e) {
    console.error("JSONBin Read Error:", e);
    return null;
  }
};

export const updateBinData = async (dateKey: string, matches: Match[]): Promise<void> => {
  if (!API_KEY) return;

  try {
    let currentData = await fetchBinData();
    let binId = await getBinId();

    if (!currentData || !binId) {
       // Create fresh if doesn't exist
       return; 
    }

    const updatedData = {
        ...currentData,
        [dateKey]: {
            matches,
            generatedAt: new Date().toISOString()
        }
    };

    await fetch(`${BASE_URL}/${binId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': API_KEY
      },
      body: JSON.stringify(updatedData)
    });

    console.log("JSONBin Updated Successfully");

  } catch (e) {
    console.error("JSONBin Update Failed:", e);
  }
};