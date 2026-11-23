/**
 * Shared security utilities for McMovies Vercel Serverless Functions.
 * Provides HMAC-SHA256 signed proxy URLs, strict SSRF protection (IPv4/IPv6 + DNS + redirect re-validation),
 * Origin-restricted CORS, sliding-window rate limiting, input sanitization, and bounded stream reading.
 */
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

const SIGNING_SECRET =
  process.env.PROXY_SIGNING_SECRET ||
  crypto
    .createHash('sha256')
    .update(
      `${process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'mc-movie-mu'}|mcmovies-hls-guard-2026`
    )
    .digest('hex');

const rateBuckets = new Map();
const RATE_MAP_MAX_KEYS = 2000;

function computeHmac(url, ref = '', emb = '', origin = '', exp = '') {
  const payload = `${url}\n${ref}\n${emb}\n${origin}\n${exp}`;
  return crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex').slice(0, 32);
}

/**
 * Generates an HMAC-SHA256 signed /api/hls-proxy URL with bounded TTL (default 4 hours).
 */
export function signProxyUrl(targetUrl, ref = '', emb = '', origin = '', ttlSeconds = 14400) {
  const exp = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  const cleanRef = ref || '';
  const cleanEmb = emb || '';
  const cleanOrigin = origin || '';
  const sig = computeHmac(targetUrl, cleanRef, cleanEmb, cleanOrigin, exp);

  const params = new URLSearchParams({ url: targetUrl });
  if (cleanRef) params.set('ref', cleanRef);
  if (cleanEmb) params.set('emb', cleanEmb);
  if (cleanOrigin) params.set('origin', cleanOrigin);
  params.set('exp', exp);
  params.set('sig', sig);
  return `/api/hls-proxy?${params.toString()}`;
}

/**
 * Constant-time HMAC verification for /api/hls-proxy requests.
 */
export function verifySignedProxyParams({ url = '', ref = '', emb = '', origin = '', exp = '', sig = '' }) {
  if (!url || !exp || !sig) {
    return { ok: false, reason: 'Missing signature parameters' };
  }
  if (!/^\d{9,12}$/.test(String(exp))) {
    return { ok: false, reason: 'Malformed expiration' };
  }
  if (!/^[0-9a-f]{32}$/i.test(String(sig))) {
    return { ok: false, reason: 'Malformed signature' };
  }

  const expNum = parseInt(String(exp), 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(expNum) || expNum < nowSec || expNum > nowSec + 86400) {
    return { ok: false, reason: 'Expired signature' };
  }

  const expected = computeHmac(url, ref || '', emb || '', origin || '', String(expNum));
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(sig).toLowerCase(), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Invalid signature' };
  }
  return { ok: true };
}

/**
 * Checks whether an IPv4 or IPv6 literal belongs to loopback, private, link-local,
 * CGNAT, multicast, or metadata address space.
 */
export function isPrivateOrReservedIp(rawIp) {
  const ip = String(rawIp || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .split('%')[0];
  if (!ip) return true;

  const ipVer = net.isIP(ip);
  if (ipVer === 4) {
    const parts = ip.split('.').map((n) => parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8 ("this network")
    if (a === 10) return true; // 10.0.0.0/8 RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, TEST-NET-1
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // Multicast & reserved 224.0.0.0/4+
    return false;
  }

  if (ipVer === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('::ffff:')) {
      const mapped = ip.slice(7);
      if (net.isIP(mapped) === 4) {
        return isPrivateOrReservedIp(mapped);
      }
      const hexMatch = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (hexMatch) {
        const hi = parseInt(hexMatch[1], 16);
        const lo = parseInt(hexMatch[2], 16);
        const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
        return isPrivateOrReservedIp(v4);
      }
      return true;
    }
    const firstHextet = ip.split(':')[0] || '0';
    const firstVal = parseInt(firstHextet, 16);
    if (!Number.isFinite(firstVal)) return true;
    // fc00::/7 Unique Local, fe80::/10 Link-Local, ff00::/8 Multicast, fec0::/10 Site-Local
    if ((firstVal & 0xfe00) === 0xfc00) return true;
    if ((firstVal & 0xffc0) === 0xfe80) return true;
    if ((firstVal & 0xffc0) === 0xfec0) return true;
    if ((firstVal & 0xff00) === 0xff00) return true;
    return false;
  }

  return true;
}

/**
 * Synchronous hostname check catching loopback names, internal suffixes, metadata endpoints,
 * integer/octal/hex IP encodings, and literal private IPs.
 */
export function isBlockedHostnameSync(hostname) {
  const h = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');

  if (!h) return true;
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.localdomain') ||
    h.endsWith('.arpa') ||
    h === 'metadata' ||
    h === 'metadata.google.internal' ||
    h === 'metadata.goog' ||
    h === 'instance-data'
  ) {
    return true;
  }

  // Block integer / hex / octal IP representations (e.g., 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return true;
  const dotParts = h.split('.');
  if (
    dotParts.length >= 2 &&
    dotParts.length <= 4 &&
    dotParts.every((p) => /^(0x[0-9a-f]+|\d+)$/i.test(p)) &&
    (dotParts.some((p) => (p.length > 1 && p.startsWith('0')) || /^0x/i.test(p)) || dotParts.length < 4)
  ) {
    return true;
  }

  if (net.isIP(h) !== 0) {
    return isPrivateOrReservedIp(h);
  }
  return false;
}

/**
 * Asynchronous SSRF gate: checks URL protocol, credentials, hostname syntax, and ALL resolved DNS IPs.
 */
export async function assertPublicHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Disallowed protocol');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL credentials not allowed');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostnameSync(host)) {
    throw new Error('Blocked hostname');
  }

  if (net.isIP(host) === 0) {
    let records;
    try {
      records = await dns.lookup(host, { all: true });
    } catch {
      throw new Error('Unresolvable host');
    }
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error('No DNS records');
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new Error('Host resolved to private IP');
      }
    }
  }

  return parsed;
}

/**
 * Fetches an external URL using assertPublicHttpUrl and manually validating every HTTP redirect hop.
 */
export async function safeFetch(rawUrl, options = {}, maxRedirects = 4) {
  let currentUrl = (await assertPublicHttpUrl(rawUrl)).href;
  let currentMethod = (options.method || 'GET').toUpperCase();
  let currentBody = options.body;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(currentUrl, {
      ...options,
      method: currentMethod,
      body: currentBody,
      redirect: 'manual',
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location || hop === maxRedirects) {
        return res;
      }
      if (res.body) {
        res.body.cancel().catch(() => {});
      }
      const nextAbsolute = new URL(location, currentUrl).href;
      currentUrl = (await assertPublicHttpUrl(nextAbsolute)).href;
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === 'POST')) {
        currentMethod = 'GET';
        currentBody = undefined;
      }
      continue;
    }

    return res;
  }

  throw new Error('Too many redirects');
}

/**
 * Strips CR, LF, NUL and ASCII control chars from header strings.
 */
export function sanitizeHeaderValue(val, maxLen = 512) {
  return String(val || '')
    .replace(/[\r\n\0\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Evaluates request Origin against strict allowlist and returns security headers.
 */
export function evaluateCors(request) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow',
    Vary: 'Origin',
  };

  if (!request) {
    return { allowed: true, headers };
  }

  let reqOrigin = '';
  try {
    reqOrigin = new URL(request.url).origin;
  } catch {
    reqOrigin = '';
  }

  const originHeader = request.headers?.get?.('origin') || '';
  if (!originHeader) {
    return { allowed: true, headers };
  }

  const normalizedOrigin = originHeader.trim();
  const isAllowed =
    normalizedOrigin === reqOrigin ||
    normalizedOrigin === 'https://mc-movie-mu.vercel.app' ||
    /^https:\/\/mc-movie(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(normalizedOrigin) ||
    normalizedOrigin === 'http://localhost:5174' ||
    normalizedOrigin === 'http://127.0.0.1:5174';

  if (!isAllowed) {
    return { allowed: false, headers };
  }

  headers['Access-Control-Allow-Origin'] = normalizedOrigin;
  return { allowed: true, headers };
}

/**
 * In-memory per-IP sliding-window rate limiter.
 */
export function checkRateLimit(request, bucket = 'default', maxRequests = 60, windowMs = 60000) {
  const xff = request?.headers?.get?.('x-forwarded-for') || '';
  const clientIp =
    (xff.split(',')[0] || '').trim() ||
    (request?.headers?.get?.('x-real-ip') || '').trim() ||
    'unknown';

  const key = `${bucket}|${clientIp}`;
  const now = Date.now();
  const cutoff = now - windowMs;

  if (!rateBuckets.has(key) && rateBuckets.size >= RATE_MAP_MAX_KEYS) {
    const oldest = rateBuckets.keys().next().value;
    if (oldest) rateBuckets.delete(oldest);
  }

  const prev = rateBuckets.get(key) || [];
  const active = prev.filter((ts) => ts > cutoff);

  if (active.length >= maxRequests) {
    rateBuckets.set(key, active);
    const retryAfterSec = Math.max(1, Math.ceil((active[0] + windowMs - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  active.push(now);
  rateBuckets.set(key, active);
  return { allowed: true, retryAfterSec: 0 };
}

export function sanitizeQueryText(str, maxLen = 150) {
  return String(str || '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeYear(str) {
  const match = String(str || '').trim().match(/^(19|20)\d{2}$/);
  return match ? match[0] : '';
}

export function clampInt(val, min, max, fallback) {
  const n = parseInt(String(val ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Reads an HTTP text body up to maxBytes so oversized upstream responses cannot exhaust memory.
 */
export async function readTextBounded(response, maxBytes = 5 * 1024 * 1024) {
  const clHeader = response.headers.get('content-length');
  if (clHeader) {
    const cl = parseInt(clHeader, 10);
    if (Number.isFinite(cl) && cl > maxBytes) {
      if (response.body) response.body.cancel().catch(() => {});
      throw new Error('Upstream response exceeds size limit');
    }
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const txt = await response.text();
    if (Buffer.byteLength(txt, 'utf8') > maxBytes) {
      throw new Error('Upstream response exceeds size limit');
    }
    return txt;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        throw new Error('Upstream response exceeds size limit');
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}
