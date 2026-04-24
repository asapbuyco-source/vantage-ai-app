import { db } from '../firebaseConfig';
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

export interface BlogPost {
    date: string;          // YYYY-MM-DD
    title: string;
    excerpt: string;
    content: string;       // HTML string
    tags?: string[];
    generatedAt: string;
}

/**
 * Fetch a single blog post by date key (e.g. "2026-02-28")
 */
export async function getBlogPost(dateKey: string): Promise<BlogPost | null> {
    try {
        const ref = doc(db, 'daily_blogs', dateKey);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return { date: dateKey, ...snap.data() } as BlogPost;
    } catch (e) {
        console.error('[BlogService] Error fetching blog post:', e);
        return null;
    }
}

/**
 * Fetch the N most recent blog posts (metadata only — no heavy content field)
 */
export async function getRecentBlogPosts(count = 10): Promise<Omit<BlogPost, 'content'>[]> {
    try {
        const col = collection(db, 'daily_blogs');
        const q = query(col, orderBy('generatedAt', 'desc'), limit(count));
        const snap = await getDocs(q);
        return snap.docs.map(d => {
            const data = d.data();
            // Fallback to substring if data.date is somehow missing
            const actualDate = data.date || d.id.substring(0, 10);
            return {
                date: actualDate,
                id: d.id,
                title: data.title || `Predictions for ${actualDate}`,
                excerpt: data.excerpt || '',
                tags: data.tags || [],
                generatedAt: data.generatedAt || d.id,
            };
        });
    } catch (e) {
        console.error('[BlogService] Error fetching recent blog posts:', e);
        return [];
    }
}

/** Returns today's date key */
export function getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
}
