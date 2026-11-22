/**
 * Vercel Serverless Function: /api/cloudx-feed
 * Returns normalized titles currently live on CloudX provider homepages (pages 1 & 2)
 * so McMovies promotes playable releases in Hero Banner & Trending.
 */
import { getCloudXMirrors, parseSearchArticles, normalizeTitleForMatch } from './_cloudxCore.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const FEED_CACHE_TTL_MS = 30 * 60 * 1000;
let feedCache = { payload: null, expiresAt: 0 };

export async function GET() {
  const now = Date.now();
  if (feedCache.payload && now < feedCache.expiresAt) {
    return Response.json(feedCache.payload, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
      },
    });
  }

  try {
    const mirrors = await getCloudXMirrors();
    const providerKeys = ['ngefilm', 'savefilm', 'klikxxi'];
    const urls = [];

    for (const key of providerKeys) {
      const base = mirrors[key];
      if (!base) continue;
      urls.push({ base, url: `${base}/` });
      urls.push({ base, url: `${base}/page/2/` });
    }

    const pageResults = await Promise.all(
      urls.map(async ({ base, url }) => {
        try {
          const res = await fetch(url, {
            headers: {
              'User-Agent': USER_AGENT,
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(3500),
          });
          if (!res.ok) return [];
          const html = await res.text();
          return parseSearchArticles(html, res.url || base);
        } catch {
          return [];
        }
      })
    );

    const normalizedSet = new Set();
    for (const articles of pageResults) {
      for (const art of articles) {
        const clean = normalizeTitleForMatch(art.title);
        if (clean && clean.length >= 2) {
          normalizedSet.add(clean);
        }
      }
    }

    const titles = Array.from(normalizedSet).sort();
    const payload = { ok: titles.length > 0, count: titles.length, titles };

    if (titles.length > 0) {
      feedCache = { payload, expiresAt: now + FEED_CACHE_TTL_MS };
    }

    return Response.json(payload, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error('[/api/cloudx-feed] Error:', err);
    return Response.json(
      { ok: false, count: 0, titles: [], error: err.message || 'Feed error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
