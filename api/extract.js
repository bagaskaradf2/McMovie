/**
 * Vercel Serverless Function: /api/extract
 * Extracts direct .m3u8 / .mp4 streams and .vtt/.srt subtitles across CloudX providers.
 * Enforces Origin-restricted CORS, per-IP rate limiting, strict query sanitization,
 * and signs every generated /api/hls-proxy URL with HMAC-SHA256.
 */
import { getCloudXMirrors, PROVIDER_PRIORITY, extractFromProvider } from './_cloudxCore.js';
import {
  evaluateCors,
  checkRateLimit,
  signProxyUrl,
  sanitizeQueryText,
  sanitizeYear,
  clampInt,
} from './_security.js';

const EXTRACT_CACHE_TTL_MS = 15 * 60 * 1000;
const EXTRACT_CACHE_MAX = 200;
const extractCache = new Map();

function getCachedExtraction(key) {
  const hit = extractCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    extractCache.delete(key);
    return null;
  }
  return hit.payload;
}

function setCachedExtraction(key, payload) {
  if (extractCache.size >= EXTRACT_CACHE_MAX) {
    const oldestKey = extractCache.keys().next().value;
    if (oldestKey) extractCache.delete(oldestKey);
  }
  extractCache.set(key, { payload, expiresAt: Date.now() + EXTRACT_CACHE_TTL_MS });
}

function streamScore(s) {
  let score = s.type === 'hls' ? 100 : 10;
  if (/\/hls2\/|acek-cdn|dramiyos-cdn|premilkyway|radiantgroveproduction/i.test(s.url)) {
    score += 50;
  } else if (/\/stream\//i.test(s.url)) {
    score -= 10;
  }
  return score;
}

async function raceProvidersWithGrace(providerKeys, mirrors, params, graceMs = 1200, hardCapMs = 8000) {
  return new Promise((resolve) => {
    const results = [];
    let settled = 0;
    let done = false;
    let graceTimer = null;
    const total = providerKeys.length;
    if (total === 0) {
      resolve([]);
      return;
    }

    const finish = () => {
      if (done) return;
      done = true;
      if (graceTimer) clearTimeout(graceTimer);
      clearTimeout(hardTimer);
      resolve(results);
    };

    const hardTimer = setTimeout(finish, hardCapMs);

    for (const key of providerKeys) {
      extractFromProvider(key, mirrors[key], params)
        .then((res) => {
          if (done) return;
          if (res) results.push(res);
          settled += 1;
          if (res?.streams?.length > 0 && !graceTimer) {
            graceTimer = setTimeout(finish, graceMs);
          }
          if (settled >= total) {
            finish();
          }
        })
        .catch(() => {
          if (done) return;
          settled += 1;
          if (settled >= total) {
            finish();
          }
        });
    }
  });
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
      { ok: false, error: 'Origin not allowed', streams: [], subtitles: [] },
      { status: 403, headers: cors.headers }
    );
  }

  const rl = checkRateLimit(request, 'extract', 30, 60000);
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: 'Too many requests', streams: [], subtitles: [] },
      { status: 429, headers: { ...cors.headers, 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    const reqUrl = new URL(request.url);
    const title = sanitizeQueryText(reqUrl.searchParams.get('title'), 150);
    const originalTitle = sanitizeQueryText(reqUrl.searchParams.get('originalTitle'), 150);
    const year = sanitizeYear(reqUrl.searchParams.get('year'));
    const type = reqUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie';
    const season = clampInt(reqUrl.searchParams.get('season'), 1, 100, 1);
    const episode = clampInt(reqUrl.searchParams.get('episode'), 1, 2000, 1);
    const rawTmdb = (reqUrl.searchParams.get('tmdbId') || '').trim();
    const tmdbId = /^\d{1,10}$/.test(rawTmdb) ? rawTmdb : '';
    const rawHint = (reqUrl.searchParams.get('provider') || '').toLowerCase().trim();
    const hintProvider = /^[a-z0-9]{1,20}$/.test(rawHint) ? rawHint : '';
    const forceRefresh = reqUrl.searchParams.get('refresh') === '1';

    if (!title && !originalTitle) {
      return Response.json(
        { ok: false, error: 'Missing required query parameter: title', streams: [], subtitles: [] },
        { status: 400, headers: cors.headers }
      );
    }

    const mappedHint = hintProvider === 'layarkaca' ? 'filmkita' : hintProvider;
    const cacheKey = `${type}|${title.toLowerCase()}|${originalTitle.toLowerCase()}|${year}|${season}|${episode}|${mappedHint}`;

    if (!forceRefresh) {
      const cached = getCachedExtraction(cacheKey);
      if (cached) {
        return Response.json(cached, {
          headers: {
            ...cors.headers,
            'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
          },
        });
      }
    }

    const mirrors = await getCloudXMirrors();

    const orderedKeys = [];
    if (mappedHint && mirrors[mappedHint]) {
      orderedKeys.push(mappedHint);
    }
    for (const k of PROVIDER_PRIORITY) {
      if (!orderedKeys.includes(k) && mirrors[k]) {
        orderedKeys.push(k);
      }
    }

    const selectedProviders = orderedKeys.slice(0, 6);
    const params = { title, originalTitle, year, type, season, episode, tmdbId };

    const providerResults = await raceProvidersWithGrace(selectedProviders, mirrors, params, 2600, 9000);

    const seenStreamUrls = new Set();
    const seenSubUrls = new Set();
    const rawStreams = [];
    const subtitles = [];
    let matchedTitle = null;

    for (const res of providerResults) {
      if (!matchedTitle && res.matchedTitle && res.streams.length > 0) {
        matchedTitle = res.matchedTitle;
      }
      for (const s of res.streams || []) {
        if (!s.url || seenStreamUrls.has(s.url)) continue;
        seenStreamUrls.add(s.url);
        rawStreams.push(s);
      }
      for (const sub of res.subtitles || []) {
        if (!sub.url || seenSubUrls.has(sub.url)) continue;
        seenSubUrls.add(sub.url);
        const proxiedSub = signProxyUrl(sub.url, sub.referer || '');
        subtitles.push({
          url: proxiedSub,
          rawUrl: sub.url,
          label: sub.label || 'Subtitle',
          lang: sub.lang || 'id',
        });
      }
    }

    rawStreams.sort((a, b) => streamScore(b) - streamScore(a));

    const seenProviderHost = new Set();
    const providerMirrorCount = Object.create(null);
    const streams = [];

    for (const s of rawStreams) {
      const phKey = `${s.provider}|${s.host}`;
      if (seenProviderHost.has(phKey)) continue;
      seenProviderHost.add(phKey);

      const pLabel = s.providerLabel || s.provider;
      const num = (providerMirrorCount[s.provider] || 0) + 1;
      providerMirrorCount[s.provider] = num;

      streams.push({
        id: `${s.provider}_${s.host}_${streams.length}`,
        label: `${pLabel} HD ${num}`,
        url: s.url,
        proxyUrl: signProxyUrl(s.url, s.referer || '', s.embedUrl || ''),
        embedUrl: s.embedUrl || '',
        preferProxy: /tnmr\.org|\/stream\//i.test(s.url),
        type: s.type || 'hls',
        provider: s.provider,
        providerLabel: pLabel,
        host: s.host,
      });
    }

    subtitles.sort((a, b) => {
      const rank = (l) => (l.lang === 'id' ? 0 : l.lang === 'en' ? 1 : 2);
      return rank(a) - rank(b);
    });

    const payload = {
      ok: streams.length > 0,
      matchedTitle: matchedTitle || title || originalTitle,
      streams,
      subtitles,
      providersChecked: selectedProviders,
    };

    if (streams.length > 0) {
      setCachedExtraction(cacheKey, payload);
    }

    return Response.json(payload, {
      headers: {
        ...cors.headers,
        'Cache-Control': streams.length > 0 ? 's-maxage=120, stale-while-revalidate=300' : 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/extract] Unhandled error:', err.message);
    return Response.json(
      { ok: false, error: 'Extraction temporarily unavailable', streams: [], subtitles: [] },
      { status: 500, headers: cors.headers }
    );
  }
}
