/**
 * Logo Enrichment Module (backend/logoEnricher.js)
 * ─────────────────────────────────────────────────
 * Enriches a list of prediction matches with team logo URLs by:
 *   1. Using logos already captured from Sportmonks (passed in as a `name → url` map)
 *   2. Looking up the Firestore `team_assets` collection for any team not covered above
 *   3. Saving any newly discovered logos back to `team_assets` for future runs
 *
 * The Firestore `team_assets` document ID is the team name normalized to
 * lowercase + spaces-to-dashes (matching the frontend `saveTeamAsset` convention).
 */

import admin from 'firebase-admin';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Normalize a team name into a Firestore document ID key. */
const normalizeKey = (name) =>
    (name || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

/**
 * Load the full `team_assets` collection from Firestore as a Map.
 * Returns Map<normalizedKey, logoUrl>.
 */
export const loadTeamAssetsFromFirestore = async () => {
    const assetMap = new Map();
    try {
        const snapshot = await admin.firestore().collection('team_assets').get();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.logoUrl) {
                assetMap.set(doc.id, data.logoUrl);
                // Also index by raw name (normalized) if stored separately
                if (data.name) {
                    assetMap.set(normalizeKey(data.name), data.logoUrl);
                }
            }
        });
        console.log(`[LogoEnricher] Loaded ${assetMap.size} team logos from Firestore.`);
    } catch (e) {
        console.warn('[LogoEnricher] Could not load team_assets:', e.message);
    }
    return assetMap;
};

/**
 * Save a batch of new team logos to Firestore `team_assets`.
 * Only writes entries where a logo URL is a valid non-empty https:// URL.
 * @param {Map<string, {name: string, logoUrl: string}>} newLogos
 */
const saveNewLogosToFirestore = async (newLogos) => {
    if (newLogos.size === 0) return;
    const db = admin.firestore();
    const batch = db.batch();
    let count = 0;
    for (const [key, { name, logoUrl }] of newLogos) {
        if (!logoUrl || !logoUrl.startsWith('http')) continue;
        const ref = db.collection('team_assets').doc(key);
        batch.set(ref, {
            name: name.trim(),
            logoUrl: logoUrl.trim(),
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        count++;
    }
    if (count > 0) {
        try {
            await batch.commit();
            console.log(`[LogoEnricher] ✅ Saved ${count} new team logos to Firestore.`);
        } catch (e) {
            console.warn('[LogoEnricher] Batch save failed:', e.message);
        }
    }
};

/**
 * Main function — enrich a list of prediction matches with logo URLs.
 *
 * @param {Array}  matches          - Array of prediction match objects.
 * @param {Map}    sportmonksLogos  - Map<teamName, logoUrl> built from Sportmonks fixtures for today.
 *                                   Pass `new Map()` if no Sportmonks data is available.
 * @returns {Array} Same matches array with `homeTeamLogo` and `awayTeamLogo` filled in.
 */
export const enrichMatchesWithLogos = async (matches, sportmonksLogos = new Map()) => {
    if (!matches || matches.length === 0) return matches;

    // 1. Load existing logos from Firestore
    const firestoreLogos = await loadTeamAssetsFromFirestore();

    /** Resolve a logo for a team name: Sportmonks → Firestore → '' */
    const getLogo = (teamName) => {
        if (!teamName) return '';
        const key = normalizeKey(teamName);
        // Priority 1: Sportmonks (authoritative live data)
        if (sportmonksLogos.has(teamName)) return sportmonksLogos.get(teamName);
        if (sportmonksLogos.has(key)) return sportmonksLogos.get(key);
        // Priority 2: Firestore cache
        if (firestoreLogos.has(key)) return firestoreLogos.get(key);
        if (firestoreLogos.has(teamName)) return firestoreLogos.get(teamName);
        return '';
    };

    // 2. Enrich each match
    const newLogos = new Map(); // Collect new logos discovered from Sportmonks not yet in Firestore
    const enriched = matches.map(m => {
        const homeLogo = getLogo(m.homeTeam);
        const awayLogo = getLogo(m.awayTeam);

        // Track newly discovered logos from Sportmonks that aren't in Firestore yet
        if (m.homeTeam && homeLogo && !firestoreLogos.has(normalizeKey(m.homeTeam))) {
            newLogos.set(normalizeKey(m.homeTeam), { name: m.homeTeam, logoUrl: homeLogo });
        }
        if (m.awayTeam && awayLogo && !firestoreLogos.has(normalizeKey(m.awayTeam))) {
            newLogos.set(normalizeKey(m.awayTeam), { name: m.awayTeam, logoUrl: awayLogo });
        }

        return {
            ...m,
            homeTeamLogo: homeLogo || m.homeTeamLogo || '',
            awayTeamLogo: awayLogo || m.awayTeamLogo || '',
        };
    });

    // 3. Save newly discovered logos to Firestore in the background (don't await to avoid slowing down generation)
    if (newLogos.size > 0) {
        console.log(`[LogoEnricher] Discovered ${newLogos.size} new logos to persist.`);
        saveNewLogosToFirestore(newLogos).catch(e =>
            console.warn('[LogoEnricher] Background logo save failed:', e.message)
        );
    }

    const covered = enriched.filter(m => m.homeTeamLogo || m.awayTeamLogo).length;
    console.log(`[LogoEnricher] Enriched ${covered}/${enriched.length} matches with at least one logo.`);

    return enriched;
};

/**
 * Build a Sportmonks name→logo map from the raw Sportmonks fixture data array
 * (the raw `item` objects returned by the paginated Sportmonks API).
 * Call this right after fetching Sportmonks fixtures.
 *
 * @param {Array} rawSportmonksData - Raw Sportmonks fixture items (with `participants`).
 * @returns {Map<string, string>} teamName → logoUrl
 */
export const buildSportmonksLogoMap = (rawSportmonksData) => {
    const map = new Map();
    if (!Array.isArray(rawSportmonksData)) return map;
    for (const item of rawSportmonksData) {
        const participants = item.participants || [];
        for (const p of participants) {
            if (p.name && p.image_path) {
                map.set(p.name, p.image_path);
                map.set(normalizeKey(p.name), p.image_path);
            }
        }
    }
    console.log(`[LogoEnricher] Built Sportmonks logo map: ${map.size / 2} teams.`);
    return map;
};
