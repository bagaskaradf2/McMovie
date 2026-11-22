/**
 * Vercel Serverless Function: /api/hls-proxy
 * Streaming proxy for CloudX .m3u8 manifests, .ts/.m4s media segments, and .vtt/.srt subtitles.
 * Preserves CDN Referer/Origin headers (for ASN/token validation) and rewrites nested HLS URLs.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

function wrapProxyUrl(absoluteUrl, ref) {
  const params = new URLSearchParams({ url: absoluteUrl });
  if (ref) params.set('ref', ref);
  return `/api/hls-proxy?${params.toString()}`;
}

function rewriteM3u8Manifest(manifestText, baseUrl, ref) {
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
            return `URI="${wrapProxyUrl(abs, ref)}"`;
          } catch {
            return `URI="${uriVal}"`;
          }
        });
      }

      try {
        const abs = new URL(line, baseUrl).href;
        return wrapProxyUrl(abs, ref);
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
      try {
        upstreamHeaders.Origin = originParam || new URL(refParam).origin;
      } catch {
        // Ignore malformed referer origin
      }
    }

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      upstreamHeaders.Range = rangeHeader;
    }

    const upstream = await fetch(parsedTarget.href, {
      method: 'GET',
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok && upstream.status !== 206) {
      console.error(`[/api/hls-proxy] Upstream HTTP ${upstream.status} for ${parsedTarget.hostname}`);
      return new Response(`Upstream error HTTP ${upstream.status}`, {
        status: upstream.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const finalUrl = upstream.url || parsedTarget.href;
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
        const rewritten = rewriteM3u8Manifest(manifestText, finalUrl, refParam);
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
