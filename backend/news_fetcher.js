import admin from 'firebase-admin';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '96329fba36msh293dfd95c0b7196p102286jsndc9aa594e4c3';
const RAPIDAPI_HOST = 'football-news11.p.rapidapi.com';

// League IDs for football-news11
// We will fetch global news (league_id=0 or general) or a few top ones
const LEAGUE_IDS = [52, 47, 54, 53, 55]; // Generic top leagues

export const fetchAndStoreNews = async () => {
    console.log('[NewsFetcher] Starting daily news fetch...');
    try {
        const db = admin.firestore();
        let allNews = [];

        for (const leagueId of LEAGUE_IDS) {
            const url = `https://${RAPIDAPI_HOST}/api/news-by-league?league_id=${leagueId}&lang=en&page=1`;
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'x-rapidapi-host': RAPIDAPI_HOST,
                        'x-rapidapi-key': RAPIDAPI_KEY,
                        'Accept': 'application/json'
                    }
                });

                if (response.status === 429 || response.status === 403) {
                    console.warn(`[NewsFetcher] Rate limited (${response.status}) for league ${leagueId}. Returning fallback.`);
                    return { status: 'error', fallback: true, message: 'No news available due to rate limiting.' };
                }

                if (response.ok) {
                    const data = await response.json();
                    if (data.result && Array.isArray(data.result)) {
                        allNews.push(...data.result);
                    }
                } else {
                    console.error(`[NewsFetcher] Failed to fetch news for league ${leagueId}. Status: ${response.status}`);
                }
            } catch (err) {
                console.error(`[NewsFetcher] Network error for league ${leagueId}:`, err.message);
            }
        }

        if (allNews.length === 0) {
            console.log('[NewsFetcher] No news fetched today.');
            return { status: 'error', fallback: true, message: 'No news available.' };
        }

        // Deduplicate by ID
        const uniqueNews = [];
        const seenIds = new Set();
        for (const item of allNews) {
            if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                uniqueNews.push(item);
            }
        }

        // Sort by published_at descending
        uniqueNews.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

        // Keep top 50 recent news items
        const topNews = uniqueNews.slice(0, 50);

        const batch = db.batch();
        const newsCollection = db.collection('football_news');

        // Overwrite the single 'latest' document with the top 50 array to save Firestore reads
        // and allow the frontend to easily load the news feed.
        const docRef = newsCollection.doc('latest');
        batch.set(docRef, {
            articles: topNews,
            updatedAt: new Date().toISOString()
        });

        await batch.commit();
        console.log(`[NewsFetcher] ✅ Successfully stored ${topNews.length} latest news articles to Firestore.`);
        return { status: 'success', articlesStored: topNews.length };

    } catch (e) {
        console.error('[NewsFetcher] Fatal Error:', e.message);
        return { status: 'error', error: e.message };
    }
};

// If run directly from terminal
if (process.argv[1] && process.argv[1].endsWith('news_fetcher.js')) {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.applicationDefault()
        });
    }
    fetchAndStoreNews().then(() => process.exit(0));
}
