/**
 * Vercel Serverless Function: /api/hls-proxy
 * Streaming proxy for CloudX .m3u8 manifests, .ts/.m4s media segments, and .vtt/.srt subtitles.
 * Includes self-healing per-container token refresh so IP-bound CDN tokens stay valid across Vercel instances.
 */
import { extractDirectMediaFromHost } from './_cloudxCore.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_CACHE_MAX = 150;
const containerTokenCache = new Map();
const inflightRefresh = new Map();

function getCachedToken(embedUrl) {
  const entry = containerTokenCache.get(embedUrl);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    containerTokenCache.delete(embedUrl);
    return null;
  }
  return entry;
}

async function refreshContainerToken(embedUrl, ref) {
  if (!embedUrl) return null;
  if (inflightRefresh.has(embedUrl)) {
    return inflightRefresh.get(embedUrl);
  }

  const job = (async () => {
    try {
      const extracted = await extractDirectMediaFromHost(embedUrl, ref, { skipVerify: true });
      const candidates = extracted?.streams || [];
      const best =
        candidates.find((s) => s.type === 'hls' && /\/hls2\//i.test(s.url)) ||
        candidates.find((s) => s.type === 'hls') ||
        candidates[0];
      if (!best?.url) return null;

      const fresh = new URL(best.url);
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
      inflightRefresh.delete(embedUrl);
    }
  })();

  inflightRefresh.set(embedUrl, job);
  return job;
}

function applyContainerToken(targetUrlObj, tokenInfo) {
  if (!tokenInfo) return targetUrlObj;
  try {
    if (/\/stream\//i.test(targetUrlObj.pathname) && /master\.m3u8$/i.test(targetUrlObj.pathname) && tokenInfo.fullUrl) {
      return new URL(tokenInfo.fullUrl);
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

function isBlockedPrivateHost(hostname) {
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0' || h.endsWith('.local')) return true;

  // Reject private IPv4 ranges
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function wrapProxyUrl(absoluteUrl, ref, emb) {
  const params = new URLSearchParams({ url: absoluteUrl });
  if (ref) params.set('ref', ref);
  if (emb) params.set('emb', emb);
  return `/api/hls-proxy?${params.toString()}`;
}

function rewriteM3u8Manifest(manifestText, baseUrl, ref, emb) {
  const lines = manifestText.split(/\r?\n/);
  return lines
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return rawLine;

      if (line.startsWith('#')) {
        // Rewrite URI="..." inside EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA, EXT-X-I-FRAME-STREAM-INF, etc.
        return rawLine.replace(/URI="([^"]+)"/gi, (_, uriVal) => {
          try {
            const abs = new URL(uriVal, baseUrl).href;
            return `URI="${wrapProxyUrl(abs, ref, emb)}"`;
          } catch {
            return `URI="${uriVal}"`;
          }
        });
      }

      try {
        const abs = new URL(line, baseUrl).href;
        return wrapProxyUrl(abs, ref, emb);
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

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    },
  });
}

export async function GET(request) {
  try {
    const reqUrl = new URL(request.url);
    const targetRaw = reqUrl.searchParams.get('url');
    const refParam = reqUrl.searchParams.get('ref') || '';
    const originParam = reqUrl.searchParams.get('origin') || '';
    const embParam = reqUrl.searchParams.get('emb') || '';

    if (!targetRaw) {
      return Response.json({ error: 'Missing required url parameter' }, { status: 400 });
    }

    let parsedTarget;
    try {
      parsedTarget = new URL(targetRaw);
    } catch {
      return Response.json({ error: 'Invalid target URL' }, { status: 400 });
    }

    if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
      return Response.json({ error: 'Disallowed URL protocol' }, { status: 403 });
    }

    if (isBlockedPrivateHost(parsedTarget.hostname)) {
      return Response.json({ error: 'Blocked private or loopback host' }, { status: 403 });
    }

    const upstreamHeaders = {
      'User-Agent': USER_AGENT,
      Accept: '*/*',
    };

    const looksLikePlaylist = /\.m3u8(\?|$)/i.test(parsedTarget.pathname + parsedTarget.search);
    if (looksLikePlaylist) {
      upstreamHeaders['Accept-Encoding'] = 'identity';
    }

    if (refParam) {
      upstreamHeaders.Referer = refParam;
    }
    if (originParam) {
      upstreamHeaders.Origin = originParam;
    }

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      upstreamHeaders.Range = rangeHeader;
    }

    let activeTarget = parsedTarget;
    if (embParam) {
      const cachedToken = getCachedToken(embParam);
      if (cachedToken) {
        activeTarget = applyContainerToken(parsedTarget, cachedToken);
      }
    }

    let upstream = await fetch(activeTarget.href, {
      method: 'GET',
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (upstream.status === 403 && embParam) {
      const freshToken = await refreshContainerToken(embParam, refParam);
      if (freshToken) {
        activeTarget = applyContainerToken(parsedTarget, freshToken);
        upstream = await fetch(activeTarget.href, {
          method: 'GET',
          headers: upstreamHeaders,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });
      }
    }

    if (!upstream.ok && upstream.status !== 206) {
      console.error(`[/api/hls-proxy] Upstream HTTP ${upstream.status} for ${activeTarget.hostname}`);
      return new Response(`Upstream error HTTP ${upstream.status}`, {
        status: upstream.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const finalUrl = upstream.url || activeTarget.href;
    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    const isSubtitleUrl = /\.(vtt|srt)(\?|$)/i.test(finalUrl) || contentType.includes('text/vtt') || contentType.includes('subrip');

    if (isSubtitleUrl) {
      const subText = await upstream.text();
      const vttBody = /\.srt(\?|$)/i.test(finalUrl) || !subText.trim().startsWith('WEBVTT')
        ? convertSrtToVtt(subText)
        : subText;

      return new Response(vttBody, {
        status: 200,
        headers: {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    const isM3u8Header =
      contentType.includes('mpegurl') ||
      contentType.includes('x-mpegurl') ||
      /\.m3u8(\?|$)/i.test(finalUrl);

    if (isM3u8Header) {
      const manifestText = await upstream.text();
      if (manifestText.trimStart().startsWith('#EXTM3U')) {
        const rewritten = rewriteM3u8Manifest(manifestText, finalUrl, refParam, embParam);
        return new Response(rewritten, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=30',
          },
        });
      }
      // Fall through if upstream was actually non-M3U8 text/binary
      return new Response(manifestText, {
        status: upstream.status,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Check first chunk when content-type is ambiguous text/plain or octet-stream on playlist URLs
    const outHeaders = new Headers({
      'Access-Control-Allow-Origin': '*',
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
    console.error('[/api/hls-proxy] Proxy failure:', err);
    return new Response(`Proxy error: ${err.message}`, {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}
