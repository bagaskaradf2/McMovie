/**
 * Vercel Serverless Function: /api/cloudx-feed
 * Aggregates latest uploads from ALL active CloudX provider APIs (Ngefilm, SaveFilm,
 * PusatMovie, WGFilm21, KlikXXI), filters out adult/JAV uploads, enriches the top
 * latest items with TMDB metadata/posters for the "Update Terbaru" rail, and also
 * returns normalized titles[] for Hero & Trending playability boosting.
 */
import {
  getCloudXMirrors,
  parseSearchArticles,
  normalizeTitleForMatch,
  PROVIDER_LABELS,
} from './_cloudxCore.js';
import { evaluateCors, checkRateLimit, safeFetch } from './_security.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TMDB_KEYS = [
  '4e44d9029b1270a757cddc766a1bcb63',
  '2dca580c2a14b55200e784d157207b4d',
];

const ADULT_FILTER_REGEX =
  /\[[A-Z]{2,6}-\d{2,5}\]|\b(jav|bokep|semi\s*korea|18\+|dewasa|disetubuhi|telanjang|mesum|uncensored|hentai|erotic|xxx)\b/i;

const FEED_CACHE_TTL_MS = 30 * 60 * 1000;
let feedCache = { payload: null, expiresAt: 0 };

function parseCleanQuery(rawTitle, rawUrl = '') {
  const str = String(rawTitle || '').trim();
  const yearMatch = str.match(/\b(19\d\d|20\d\d)\b/);
  const year = yearMatch ? yearMatch[1] : null;
  const isTv =
    /\/(tv|series|serial)\//i.test(rawUrl) ||
    /\b(season|musim|episode|eps\.?)\s*\d*\b/i.test(str) ||
    /\bs0?\d{1,2}\b/i.test(str);

  let clean = str
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(\s*(19\d\d|20\d\d)(?:\s*[-–—]\s*(19\d\d|20\d\d))?\s*\)/g, ' ')
    .replace(
      /\b(sub\s*indo|subtitle\s*indonesia|dub\s*indo|dubbing\s*indonesia|completed|ongoing|batch|imax|extended|uncut|web-dl|bluray|blu-ray|hdrip|hdcam|cam|hd|4k|uhd)\b/gi,
      ' '
    )
    .replace(/\b(season|musim|s)\s*0*\d+\b/gi, ' ')
    .replace(/\b(19\d\d|20\d\d)\b$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/\s+aka\s+/i.test(clean)) {
    clean = clean.split(/\s+aka\s+/i)[0].trim();
  }
  clean = clean.replace(/^[\-–—:\s]+|[\-–—:\s]+$/g, '').trim();

  return { clean, year, isTv };
}

async function enrichCandidateWithTmdb(candidate, keyIndex) {
  if (!candidate?.clean || candidate.clean.length < 2) return null;
  const apiKey = TMDB_KEYS[keyIndex % TMDB_KEYS.length];
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(
    candidate.clean
  )}&language=en-US&include_adult=false&page=1`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2800) });
    if (!res.ok) return null;
    const data = await res.json();
    const results = (data?.results || []).filter(
      (r) =>
        (r.media_type === 'movie' || r.media_type === 'tv') &&
        !r.adult &&
        Boolean(r.poster_path)
    );
    if (results.length === 0) return null;

    const targetNorm = normalizeTitleForMatch(candidate.clean);
    const targetYear = candidate.year ? parseInt(candidate.year, 10) : null;

    let best = null;
    let bestScore = -999;

    for (const r of results.slice(0, 6)) {
      const rTitle = r.title || r.name || '';
      const rOrig = r.original_title || r.original_name || '';
      const rNorm = normalizeTitleForMatch(rTitle);
      const rOrigNorm = normalizeTitleForMatch(rOrig);

      let score = 0;
      if (rNorm === targetNorm || rOrigNorm === targetNorm) {
        score += 65;
      } else if (
        targetNorm &&
        (rNorm.includes(targetNorm) || targetNorm.includes(rNorm))
      ) {
        score += 32;
      }

      const relDate = r.release_date || r.first_air_date || '';
      const relYear = relDate ? parseInt(relDate.slice(0, 4), 10) : null;
      if (targetYear && relYear) {
        const diff = Math.abs(targetYear - relYear);
        if (diff === 0) score += 45;
        else if (diff === 1) score += 25;
        else if (diff > 3) score -= 55;
      }

      if (candidate.isTv && r.media_type === 'tv') score += 16;
      else if (!candidate.isTv && r.media_type === 'movie') score += 12;

      score += Math.min((r.popularity || 0) * 0.25, 10);

      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    if (!best || bestScore < 20) return null;

    return {
      id: best.id,
      tmdbId: best.id,
      media_type: best.media_type,
      title: best.title || best.name,
      original_title: best.original_title || best.original_name || best.title || best.name,
      poster_path: best.poster_path,
      backdrop_path: best.backdrop_path || best.poster_path,
      vote_average: best.vote_average ? Number(best.vote_average.toFixed(1)) : 7.5,
      release_date: best.release_date || '',
      first_air_date: best.first_air_date || '',
      overview: best.overview || '',
      provider: candidate.provider,
      badge: PROVIDER_LABELS[candidate.provider] || candidate.provider,
      isLatestUpload: true,
    };
  } catch {
    return null;
  }
}

export async function OPTIONS(request) {
  const cors = evaluateCors(request);
  if (!cors.allowed) {
    return new Response(null, { status: 403, headers: cors.headers });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...cors.headers,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(request) {
  const cors = evaluateCors(request);
  if (!cors.allowed) {
    return Response.json(
      { ok: false, count: 0, itemsCount: 0, providers: [], titles: [], items: [], error: 'Origin not allowed' },
      { status: 403, headers: cors.headers }
    );
  }

  if (request) {
    const rl = checkRateLimit(request, 'cloudx-feed', 30, 60000);
    if (!rl.allowed) {
      return Response.json(
        { ok: false, count: 0, itemsCount: 0, providers: [], titles: [], items: [], error: 'Too many requests' },
        { status: 429, headers: { ...cors.headers, 'Retry-After': String(rl.retryAfterSec) } }
      );
    }
  }

  const now = Date.now();
  if (feedCache.payload && now < feedCache.expiresAt) {
    return Response.json(feedCache.payload, {
      headers: {
        ...cors.headers,
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
      },
    });
  }

  try {
    const mirrors = await getCloudXMirrors();
    const scrapeTargets = [
      { key: 'ngefilm', paths: ['/', '/page/2/'] },
      { key: 'savefilm', paths: ['/', '/page/2/'] },
      { key: 'pusatmovie', paths: ['/', '/page/2/'] },
      { key: 'wgfilm21', paths: ['/'] },
      { key: 'klikxxi', paths: ['/'] },
    ];

    const jobs = [];
    for (const target of scrapeTargets) {
      const base = mirrors[target.key];
      if (!base) continue;
      for (const p of target.paths) {
        jobs.push({ provider: target.key, base, url: `${base}${p}` });
      }
    }

    const pageResults = await Promise.all(
      jobs.map(async ({ provider, base, url }) => {
        try {
          const res = await safeFetch(
            url,
            {
              headers: {
                'User-Agent': USER_AGENT,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
              },
              signal: AbortSignal.timeout(3000),
            },
            3
          );
          if (!res.ok) return { provider, articles: [] };
          const html = await res.text();
          return { provider, articles: parseSearchArticles(html, res.url || base) };
        } catch {
          return { provider, articles: [] };
        }
      })
    );

    const normalizedSet = new Set();
    const byProvider = new Map();
    const activeProvidersSet = new Set();

    for (const { provider, articles } of pageResults) {
      if (!articles || articles.length === 0) continue;
      activeProvidersSet.add(provider);
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      const list = byProvider.get(provider);

      for (const art of articles) {
        if (!art?.title || ADULT_FILTER_REGEX.test(art.title)) continue;
        const cleanNorm = normalizeTitleForMatch(art.title);
        if (!cleanNorm || cleanNorm.length < 2) continue;

        normalizedSet.add(cleanNorm);
        const parsed = parseCleanQuery(art.title, art.url);
        if (parsed.clean.length >= 2) {
          list.push({
            ...parsed,
            norm: cleanNorm,
            provider,
            rawUrl: art.url,
          });
        }
      }
    }

    // Round-robin interleave across active APIs so Update Terbaru shows latest uploads from every server
    const interleaved = [];
    const seenNormForUpdates = new Set();
    const providerLists = Array.from(byProvider.values());
    let roundIdx = 0;

    while (interleaved.length < 32) {
      let addedInRound = false;
      for (const list of providerLists) {
        while (list.length > 0 && seenNormForUpdates.has(list[0].norm)) {
          list.shift();
        }
        if (list.length > 0) {
          const cand = list.shift();
          seenNormForUpdates.add(cand.norm);
          interleaved.push(cand);
          addedInRound = true;
          if (interleaved.length >= 32) break;
        }
      }
      if (!addedInRound) break;
      roundIdx++;
      if (roundIdx > 40) break;
    }

    // Enrich candidates with TMDB metadata in parallel batches of 8
    const enrichedItems = [];
    const seenTmdbKeys = new Set();

    for (let i = 0; i < interleaved.length && enrichedItems.length < 28; i += 8) {
      const batch = interleaved.slice(i, i + 8);
      const batchResults = await Promise.all(
        batch.map((cand, bIdx) => enrichCandidateWithTmdb(cand, i + bIdx))
      );
      for (const item of batchResults) {
        if (!item) continue;
        const key = `${item.media_type}_${item.id}`;
        if (seenTmdbKeys.has(key)) continue;
        seenTmdbKeys.add(key);
        enrichedItems.push(item);
      }
    }

    const titles = Array.from(normalizedSet).sort();
    const payload = {
      ok: titles.length > 0,
      count: titles.length,
      itemsCount: enrichedItems.length,
      providers: Array.from(activeProvidersSet),
      titles,
      items: enrichedItems,
    };

    if (titles.length > 0) {
      feedCache = { payload, expiresAt: now + FEED_CACHE_TTL_MS };
    }

    return Response.json(payload, {
      headers: {
        ...cors.headers,
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error('[/api/cloudx-feed] Error:', err.message);
    return Response.json(
      { ok: false, count: 0, itemsCount: 0, providers: [], titles: [], items: [], error: 'Feed temporarily unavailable' },
      { status: 500, headers: cors.headers }
    );
  }
}
