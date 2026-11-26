/**
 * Vercel Serverless Function: /api/hls-proxy
 * Signed streaming proxy for CloudX .m3u8 manifests, .ts/.m4s media segments, and .vtt/.srt subtitles.
 * Protected by HMAC-SHA256 signatures, strict IP/DNS/redirect SSRF defense, origin-restricted CORS,
 * sliding-window rate limiting, and non-document media Content-Type enforcement.
 */
import { extractDirectMediaFromHost } from './_cloudxCore.js';
import {
  evaluateCors,
  checkRateLimit,
  verifySignedProxyParams,
  signProxyUrl,
  assertPublicHttpUrl,
  safeFetch,
  sanitizeHeaderValue,
  readTextBounded,
} from './_security.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_CACHE_MAX = 150;
const containerTokenCache = new Map();
const inflightRefresh = new Map();

const DANGEROUS_CONTENT_TYPE_REGEX =
  /(text\/html|application\/xhtml|image\/svg|javascript|ecmascript|text\/xml|application\/xml)/i;

function getCachedToken(embedUrl) {
  const entry = containerTokenCache.get(embedUrl);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    containerTokenCache.delete(embedUrl);
    return null;
  }
  return entry;
}

async function refreshContainerToken(embedUrl, ref, preferStreamPath = false) {
  if (!embedUrl) return null;
  const cacheKey = `${embedUrl}|${preferStreamPath ? 'stream' : 'any'}`;
  if (inflightRefresh.has(cacheKey)) {
    return inflightRefresh.get(cacheKey);
  }

  const job = (async () => {
    try {
      const extracted = await extractDirectMediaFromHost(embedUrl, ref, { skipVerify: true });
      const candidates = extracted?.streams || [];
      const best =
        (preferStreamPath && candidates.find((s) => /\/stream\//i.test(s.url))) ||
        candidates.find((s) => /\/stream\//i.test(s.url)) ||
        candidates.find((s) => s.type === 'hls') ||
        candidates[0];
      if (!best?.url) return null;

      const fresh = await assertPublicHttpUrl(best.url);
      const tokenEntry = {
        origin: fresh.origin,
        search: fresh.search,
        fullUrl: fresh.href,
        expiresAt: Date.now() + TOKEN_TTL_MS,
      };
      if (containerTokenCache.size >= TOKEN_CACHE_MAX) {
        const oldest = containerTokenCache.keys().next().value;
        if (oldest) containerTokenCache.delete(oldest);
      }
      containerTokenCache.set(embedUrl, tokenEntry);
      return tokenEntry;
    } catch {
      return null;
    } finally {
      inflightRefresh.delete(cacheKey);
    }
  })();

  inflightRefresh.set(cacheKey, job);
  return job;
}

function applyContainerToken(targetUrlObj, tokenInfo) {
  if (!tokenInfo) return targetUrlObj;
  try {
    if (
      /\/stream\//i.test(targetUrlObj.pathname) &&
      /\.m3u8$/i.test(targetUrlObj.pathname) &&
      tokenInfo.fullUrl
    ) {
      const freshUrl = new URL(tokenInfo.fullUrl);
      const targetFile = targetUrlObj.pathname.split('/').pop();
      if (targetFile && targetFile !== 'master.m3u8' && /\/stream\//i.test(freshUrl.pathname)) {
        freshUrl.pathname = freshUrl.pathname.replace(/\/[^/]+$/, `/${targetFile}`);
      }
      return freshUrl;
    }
    const rebuilt = new URL(targetUrlObj.href);
    if (tokenInfo.origin && /\/hls2\//i.test(rebuilt.pathname)) {
      const freshOriginUrl = new URL(tokenInfo.origin);
      rebuilt.protocol = freshOriginUrl.protocol;
      rebuilt.host = freshOriginUrl.host;
    }
    if (tokenInfo.search) {
      rebuilt.search = tokenInfo.search;
    }
    return rebuilt;
  } catch {
    return targetUrlObj;
  }
}

function rewriteM3u8Manifest(manifestText, baseUrl, ref, emb) {
  const lines = manifestText.split(/\r?\n/);
  return lines
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return rawLine;

      if (line.startsWith('#')) {
        return rawLine.replace(/URI="([^"]+)"/gi, (_, uriVal) => {
          try {
            const abs = new URL(uriVal, baseUrl).href;
            return `URI="${signProxyUrl(abs, ref, emb)}"`;
          } catch {
            return `URI="${uriVal}"`;
          }
        });
      }

      try {
        const abs = new URL(line, baseUrl).href;
        return signProxyUrl(abs, ref, emb);
      } catch {
        return rawLine;
      }
    })
    .join('\n');
}

function convertSrtToVtt(srtText) {
  const clean = (srtText || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return clean.startsWith('WEBVTT') ? clean : `WEBVTT\n\n${clean}`;
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
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    },
  });
}

export async function GET(request) {
  const cors = evaluateCors(request);
  if (!cors.allowed) {
    return Response.json({ error: 'Origin not allowed' }, { status: 403, headers: cors.headers });
  }

  const rl = checkRateLimit(request, 'hls-proxy', 300, 60000);
  if (!rl.allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...cors.headers, 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  const baseSecHeaders = {
    ...cors.headers,
    'Content-Security-Policy': 'sandbox',
  };

  try {
    const reqUrl = new URL(request.url);
    const targetRaw = reqUrl.searchParams.get('url') || '';
    const refParam = reqUrl.searchParams.get('ref') || '';
    const originParam = reqUrl.searchParams.get('origin') || '';
    const embParam = reqUrl.searchParams.get('emb') || '';
    const expParam = reqUrl.searchParams.get('exp') || '';
    const sigParam = reqUrl.searchParams.get('sig') || '';

    if (!targetRaw) {
      return Response.json({ error: 'Missing required url parameter' }, { status: 400, headers: baseSecHeaders });
    }

    const sigCheck = verifySignedProxyParams({
      url: targetRaw,
      ref: refParam,
      emb: embParam,
      origin: originParam,
      exp: expParam,
      sig: sigParam,
    });
    if (!sigCheck.ok) {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: baseSecHeaders });
    }

    let parsedTarget;
    try {
      parsedTarget = await assertPublicHttpUrl(targetRaw);
    } catch {
      return Response.json({ error: 'Blocked target host' }, { status: 403, headers: baseSecHeaders });
    }

    if (embParam) {
      try {
        await assertPublicHttpUrl(embParam);
      } catch {
        return Response.json({ error: 'Blocked embed host' }, { status: 403, headers: baseSecHeaders });
      }
    }

    const upstreamHeaders = {
      'User-Agent': USER_AGENT,
      Accept: '*/*',
    };

    const looksLikePlaylist = /\.m3u8(\?|$)/i.test(parsedTarget.pathname + parsedTarget.search);
    if (looksLikePlaylist) {
      upstreamHeaders['Accept-Encoding'] = 'identity';
    }

    const safeRef = sanitizeHeaderValue(refParam);
    if (safeRef && /^https?:\/\//i.test(safeRef)) {
      upstreamHeaders.Referer = safeRef;
    }

    const safeOrigin = sanitizeHeaderValue(originParam);
    if (safeOrigin && /^https?:\/\//i.test(safeOrigin)) {
      upstreamHeaders.Origin = safeOrigin;
    }

    const safeRange = sanitizeHeaderValue(request.headers.get('range'), 100);
    if (safeRange && /^bytes=\d*-\d*(,\s*\d*-\d*)*$/i.test(safeRange)) {
      upstreamHeaders.Range = safeRange;
    }

    let activeTarget = parsedTarget;
    if (embParam) {
      const cachedToken = getCachedToken(embParam);
      if (cachedToken) {
        activeTarget = applyContainerToken(parsedTarget, cachedToken);
        try {
          activeTarget = await assertPublicHttpUrl(activeTarget.href);
        } catch {
          activeTarget = parsedTarget;
        }
      }
    }

    const isStreamPath = /\/stream\//i.test(parsedTarget.pathname);
    const fetchOnce = (href, timeoutMs = 8500) =>
      safeFetch(
        href,
        {
          method: 'GET',
          headers: upstreamHeaders,
          signal: AbortSignal.timeout(timeoutMs),
        },
        4
      );

    let upstream = null;
    let firstErr = null;
    try {
      upstream = await fetchOnce(activeTarget.href, embParam && isStreamPath ? 3800 : 8500);
    } catch (err) {
      firstErr = err;
    }

    const shouldRefreshToken =
      Boolean(embParam) &&
      (Boolean(firstErr) ||
        upstream?.status === 403 ||
        upstream?.status === 404 ||
        upstream?.status === 410 ||
        upstream?.status === 502 ||
        upstream?.status === 503);

    if (shouldRefreshToken) {
      if (upstream?.body) upstream.body.cancel().catch(() => {});
      const freshToken = await refreshContainerToken(embParam, safeRef, isStreamPath);
      if (freshToken) {
        const refreshedUrl = applyContainerToken(parsedTarget, freshToken);
        activeTarget = await assertPublicHttpUrl(refreshedUrl.href);
        upstream = await fetchOnce(activeTarget.href, 8500);
        firstErr = null;
      }
    }

    if (firstErr) {
      throw firstErr;
    }

    if (!upstream.ok && upstream.status !== 206) {
      if (upstream.body) upstream.body.cancel().catch(() => {});
      console.error(`[/api/hls-proxy] Upstream HTTP ${upstream.status} for ${activeTarget.hostname}`);
      return new Response(`Upstream error HTTP ${upstream.status}`, {
        status: upstream.status,
        headers: baseSecHeaders,
      });
    }

    const finalUrl = upstream.url || activeTarget.href;
    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();

    // Never proxy active web documents, SVGs, or scripts back to the browser
    if (DANGEROUS_CONTENT_TYPE_REGEX.test(contentType)) {
      if (upstream.body) upstream.body.cancel().catch(() => {});
      return Response.json({ error: 'Unsupported media type' }, { status: 415, headers: baseSecHeaders });
    }

    const isSubtitleUrl =
      /\.(vtt|srt)(\?|$)/i.test(finalUrl) || contentType.includes('text/vtt') || contentType.includes('subrip');

    if (isSubtitleUrl) {
      const subText = await readTextBounded(upstream, 5 * 1024 * 1024);
      const vttBody =
        /\.srt(\?|$)/i.test(finalUrl) || !subText.trim().startsWith('WEBVTT')
          ? convertSrtToVtt(subText)
          : subText;

      return new Response(vttBody, {
        status: 200,
        headers: {
          ...baseSecHeaders,
          'Content-Type': 'text/vtt; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    const isM3u8Header =
      contentType.includes('mpegurl') ||
      contentType.includes('x-mpegurl') ||
      /\.m3u8(\?|$)/i.test(finalUrl);

    if (isM3u8Header) {
      const manifestText = await readTextBounded(upstream, 5 * 1024 * 1024);
      if (manifestText.trimStart().startsWith('#EXTM3U')) {
        const rewritten = rewriteM3u8Manifest(manifestText, finalUrl, safeRef, embParam);
        return new Response(rewritten, {
          status: 200,
          headers: {
            ...baseSecHeaders,
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'public, max-age=30',
          },
        });
      }
      return Response.json({ error: 'Invalid media playlist' }, { status: 415, headers: baseSecHeaders });
    }

    const outHeaders = new Headers({
      ...baseSecHeaders,
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Cache-Control': 'public, max-age=300',
    });

    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const val = upstream.headers.get(h);
      if (val) outHeaders.set(h, val);
    }

    if (!outHeaders.has('content-type')) {
      outHeaders.set('content-type', 'video/mp2t');
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  } catch (err) {
    console.error('[/api/hls-proxy] Proxy failure:', err.message);
    return new Response('Upstream proxy error', {
      status: 502,
      headers: baseSecHeaders,
    });
  }
}
