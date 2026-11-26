/**
 * CloudX Direct Stream Extractor Core (Node.js ESM, zero external dependencies)
 * Scrapes active CloudX WordPress/DooPlay providers and unpacks direct .m3u8 / .mp4 / .vtt streams.
 */
import { isBlockedHostnameSync, safeFetch } from './_security.js';

const WEBSITE_JSON_URL = 'https://raw.githubusercontent.com/Asm0d3usX/CloudX/builds/Website.json';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const FALLBACK_MIRRORS = {
  ngefilm: 'https://new39.ngefilm.site',
  savefilm: 'https://new13.savefilm21info.com',
  indomax: 'https://akses16.indomax21.xyz',
  klikxxi: 'https://klikxxi.shop',
  wgfilm21: 'https://alternatif3.wgfilm21.net',
  pusatmovie: 'https://refugepdx.com',
  pusatfilm: 'https://pf21.net',
  filmkita: 'https://s9.iix.llc',
  dutamovie: 'https://itoshii-movie.com',
  kawanfilm: 'https://tv2.kawanfilm21.co',
  nomat: 'https://nomat.shop',
  sarangfilm: 'https://sarangfilm.diy',
};

export const PROVIDER_PRIORITY = [
  'ngefilm',
  'savefilm',
  'klikxxi',
  'indomax',
  'wgfilm21',
  'pusatfilm',
  'filmkita',
  'pusatmovie',
];

const ADULT_TITLE_REGEX =
  /\[[A-Z]{2,6}-\d{2,5}\]|\b(jav|bokep|semi\s*korea|18\+|dewasa|disetubuhi|telanjang|mesum|uncensored|hentai|erotic|xxx)\b/i;

const MIRROR_BRAND_TOKENS = ['ngefilm', 'savefilm', 'indomax', 'klikxxi', 'wgfilm21', 'pusatfilm', 'pencurimovie'];

export const PROVIDER_LABELS = {
  ngefilm: 'Ngefilm',
  savefilm: 'SaveFilm',
  indomax: 'Indomax',
  klikxxi: 'KlikXXI',
  wgfilm21: 'WGFilm21',
  pusatmovie: 'PusatMovie',
  pusatfilm: 'PusatFilm',
  filmkita: 'LK21 / FilmKita',
};

const BLOCKED_EMBED_HOSTS = [
  'youtube.com',
  'youtu.be',
  'googletagmanager.com',
  'boosterx.stream',
  'bestx.stream',
  'abyssplayer.com',
  'gigaduckgo.com',
  'parklogic.com',
  'dood.li',
  'ds2play.com',
  'rpmlive.online',
  'upns.one',
  'upns.blog',
  'p2pplay.pro',
  'playerp2p.online',
  'dhcplay.com',
  'telegra.ph',
  'multiup.io',
  'mirrored.to',
  '1fichier.com',
  'dailyuploads.net',
  'krakenfiles.com',
  'racaty.io',
  'mediafire.com',
  'mega.nz',
  'ouo.io',
  'ouo.press',
  'sfl.gl',
  'bit.ly',
  'gdriveplayer.to',
  'helvid.net',
];

const KNOWN_DIRECT_VIDEO_HOSTS = [
  'morencius',
  'movearnpre',
  'vidhide',
  'callistanise',
  'dingtezuni',
  'mivalyo',
  'bingezove',
  'dinisglows',
  'smoothpre',
  'dhtpre',
  'dintezuvio',
  'ryderjet',
  'playerwish',
  'wishonly',
  'streamwish',
  'imaxstreams',
  'gradehgplus',
  'lplaygo',
  'filemoon',
  'filelions',
  'hlswish',
  'hglink',
  'hgcloud',
];

const STREAMHG_LEGACY_HOSTS = [
  'hglink.to',
  'hgcloud.to',
  'gradehgplus.com',
  'short.icu',
  'dumbalag.com',
  'haxloppd.com',
  'vibuxer.com',
  'streamhg.com',
];

const EARNVIDS_LEGACY_HOSTS = [
  'movearnpre.com',
  'mivalyo.com',
  'dingtezuni.com',
  'bingezove.com',
  'dhtpre.com',
  'callistanise.com',
  'dinisglows.com',
  'smoothpre.com',
  'dintezuvio.com',
  'ryderjet.com',
  'vidhidepre.com',
  'vidhidevip.com',
  'vidhidepro.com',
  'vidhideplus.com',
  'vidhidefast.com',
  'vidhideload.com',
  'fviplions.com',
];

let mirrorsCache = { data: null, expiresAt: 0 };

/**
 * Fetches dynamic CloudX mirror domains from GitHub with 10-minute module cache.
 */
export async function getCloudXMirrors() {
  const now = Date.now();
  if (mirrorsCache.data && now < mirrorsCache.expiresAt) {
    return mirrorsCache.data;
  }

  const merged = { ...FALLBACK_MIRRORS };
  try {
    const res = await fetch(WEBSITE_JSON_URL, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = await res.json();
      for (const [key, arr] of Object.entries(json || {})) {
        const candidate = Array.isArray(arr) ? arr[0] : null;
        if (typeof candidate === 'string' && candidate.startsWith('https://')) {
          try {
            const parsed = new URL(candidate);
            if (!parsed.username && !parsed.password && !isBlockedHostnameSync(parsed.hostname)) {
              merged[key] = candidate.replace(/\/+$/, '');
            }
          } catch {
            // Skip malformed mirror URLs
          }
        }
      }
    }
  } catch (err) {
    console.warn('[cloudx] Website.json fetch failed, using fallback mirrors:', err.message);
  }

  if (!merged.indomax || merged.indomax.includes('idmxl.ink')) {
    merged.indomax = 'https://akses16.indomax21.xyz';
  }

  mirrorsCache = { data: merged, expiresAt: now + 10 * 60 * 1000 };
  return merged;
}

/**
 * Pure JavaScript Dean Edwards P.A.C.K.E.R unpacker (zero eval()).
 */
export function unpackPacker(html) {
  if (!html || !html.includes('eval(function(p,a,c,k,e,')) return '';
  const regex =
    /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g;
  const outputs = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const p = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      const radix = parseInt(match[2], 10);
      let count = parseInt(match[3], 10);
      const keywords = match[4].split('|');

      const encodeBase = (n) => {
        const prefix = n < radix ? '' : encodeBase(parseInt(n / radix, 10));
        const rem = n % radix;
        const char = rem > 35 ? String.fromCharCode(rem + 29) : rem.toString(36);
        return prefix + char;
      };

      const dict = Object.create(null);
      while (count--) {
        const token = encodeBase(count);
        dict[token] = keywords[count] || token;
      }

      outputs.push(p.replace(/\b\w+\b/g, (word) => dict[word] ?? word));
    } catch {
      // Ignore malformed packer block
    }
  }
  return outputs.join('\n');
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return decodeHtmlEntities((html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

async function fetchText(url, { referer, method = 'GET', body, headers = {}, timeoutMs = 6500 } = {}) {
  const reqHeaders = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    ...(referer ? { Referer: referer } : {}),
    ...headers,
  };

  const res = await safeFetch(
    url,
    {
      method,
      headers: reqHeaders,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    },
    3
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, url: res.url || url, text };
}

function normalizeEmbedHostUrl(rawUrl) {
  let u = rawUrl.trim();
  if (u.startsWith('//')) u = `https:${u}`;
  if (!u.startsWith('http')) return null;

  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (isBlockedHostnameSync(host)) {
      return null;
    }
    if (BLOCKED_EMBED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
      return null;
    }

    if (STREAMHG_LEGACY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) {
      parsed.hostname = 'imaxstreams.net';
      parsed.pathname = parsed.pathname.replace(/^\/(d|download|file|f|v|embed)\//, '/e/');
      return parsed.toString();
    }

    if (EARNVIDS_LEGACY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) {
      parsed.hostname = 'morencius.com';
      parsed.pathname = parsed.pathname.replace(/^\/(d|download|file|f|embed)\//, '/v/');
      return parsed.toString();
    }

    const isImaxOrWish =
      host.includes('imaxstreams') ||
      host.includes('streamwish') ||
      host.includes('playerwish') ||
      host.includes('hglink') ||
      host.includes('hgcloud') ||
      host.includes('short.icu');

    const pathToken = isImaxOrWish ? '/e/' : '/v/';
    if (/\/(d|download|file|f)\//.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/(d|download|file|f)\//, pathToken);
      u = parsed.toString();
    }
    return u;
  } catch {
    return null;
  }
}

function inferSubtitleMeta(url) {
  const lower = url.toLowerCase();
  if (lower.includes('_ind') || lower.includes('indo') || lower.includes('.id.')) {
    return { label: 'Indonesia', lang: 'id' };
  }
  if (lower.includes('_eng') || lower.includes('english') || lower.includes('.en.')) {
    return { label: 'English', lang: 'en' };
  }
  return { label: 'Subtitle', lang: 'und' };
}

async function verifyHlsPlayable(stream) {
  const origin = stream.origin || (stream.referer ? new URL(stream.referer).origin : '');
  const hdr = { 'User-Agent': USER_AGENT, Referer: stream.referer, ...(origin ? { Origin: origin } : {}) };
  const pr = await fetch(stream.url, {
    headers: hdr,
    signal: AbortSignal.timeout(1800),
  });
  if (!pr.ok) return null;

  const masterText = await pr.text();
  if (!masterText.trimStart().startsWith('#EXTM3U')) return null;
  if (/cdnsync\.cloud/i.test(masterText)) return null;

  const lines = masterText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length === 0) return null;

  let mediaText = masterText;
  let mediaBaseUrl = pr.url || stream.url;
  const firstEntry = lines[0];

  if (/\.m3u8(\?|$)/i.test(firstEntry) || /#EXT-X-STREAM-INF/i.test(masterText)) {
    const childUrl = new URL(firstEntry, mediaBaseUrl).href;
    const cr = await fetch(childUrl, {
      headers: hdr,
      signal: AbortSignal.timeout(1800),
    });
    if (!cr.ok) return null;
    mediaText = await cr.text();
    if (!mediaText.trimStart().startsWith('#EXTM3U')) return null;
    if (/cdnsync\.cloud/i.test(mediaText)) return null;
    mediaBaseUrl = cr.url || childUrl;
  }

  const segLine = mediaText.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
  if (!segLine) return null;

  const segUrl = new URL(segLine, mediaBaseUrl).href;
  let sr = await fetch(segUrl, {
    method: 'HEAD',
    headers: hdr,
    signal: AbortSignal.timeout(1600),
  });
  if (sr.status === 405 || sr.status === 501) {
    sr = await fetch(segUrl, {
      method: 'GET',
      headers: { ...hdr, Range: 'bytes=0-63' },
      signal: AbortSignal.timeout(1600),
    });
  }
  return sr.ok || sr.status === 206 ? stream : null;
}

/**
 * Fetches an embed/host page, unpacks Dean Edwards P.A.C.K.E.R scripts, and extracts .m3u8 / .mp4 / .vtt.
 */
export async function extractDirectMediaFromHost(rawEmbedUrl, referer, { skipVerify = false } = {}) {
  const normalizedUrl = normalizeEmbedHostUrl(rawEmbedUrl);
  if (!normalizedUrl) return { streams: [], subtitles: [] };

  try {
    const res = await fetchText(normalizedUrl, { referer, timeoutMs: 4000 });
    if (!res.text || res.status >= 400) {
      return { streams: [], subtitles: [] };
    }

    const finalUrl = res.url || normalizedUrl;
    const finalOrigin = new URL(finalUrl).origin;
    const hostName = new URL(normalizedUrl).hostname.replace(/^www\./, '');
    const unpacked = unpackPacker(res.text);
    const corpus = `${res.text}\n${unpacked}`;

    const streamCandidates = [];
    const addStream = (rawUrl, type) => {
      if (!rawUrl || typeof rawUrl !== 'string') return;
      try {
        const resolved = new URL(rawUrl.replace(/\\\//g, '/'), finalUrl).href;
        if (!resolved.startsWith('http')) return;
        streamCandidates.push({
          url: resolved,
          type,
          host: hostName,
          referer: `${finalOrigin}/`,
          origin: finalOrigin,
          embedUrl: normalizedUrl,
        });
      } catch {
        // Ignore malformed URL
      }
    };

    // 1. Parse `var links = {...}` JSON used by Earnvids / VidHide / Morencius / ImaxStreams
    const linksMatch = corpus.match(/var\s+links\s*=\s*(\{[\s\S]*?\});/);
    if (linksMatch) {
      try {
        const linksObj = JSON.parse(linksMatch[1]);
        for (const key of ['hls2', 'hls4', 'hls']) {
          if (linksObj[key] && !String(linksObj[key]).endsWith('.txt')) {
            addStream(linksObj[key], 'hls');
          }
        }
      } catch {
        // Fall through to regex extraction
      }
    }

    // 2. Fallback regex for quoted .m3u8 URLs
    for (const m of corpus.matchAll(/["']((?:https?:\/\/|\/)[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*)["']/gi)) {
      addStream(m[1], 'hls');
    }

    // 3. Fallback regex for quoted direct .mp4 URLs (ignore ad/preview/thumb/locker assets)
    for (const m of corpus.matchAll(/["'](https?:\/\/[^"'\s<>\\]+\.mp4[^"'\s<>\\]*)["']/gi)) {
      const candidate = m[1];
      if (!/google|doubleclick|ads|preview|thumb|blank|sample|multiup\.io|mirrored\.to|1fichier|dailyuploads|mediafire|mega\.nz|krakenfiles|pixeldrain|\/download\//i.test(candidate)) {
        addStream(candidate, 'mp4');
      }
    }

    // 4. Extract .vtt / .srt subtitle URLs
    const subtitlesMap = new Map();
    for (const m of corpus.matchAll(/["']((?:https?:\/\/|\/)[^"'\s<>\\]+\.(?:vtt|srt)[^"'\s<>\\]*)["']/gi)) {
      try {
        const subUrl = new URL(m[1].replace(/\\\//g, '/'), finalUrl).href;
        if (subUrl.startsWith('http') && !subtitlesMap.has(subUrl)) {
          const meta = inferSubtitleMeta(subUrl);
          subtitlesMap.set(subUrl, { url: subUrl, ...meta, referer: `${finalOrigin}/` });
        }
      } catch {
        // Ignore malformed subtitle URL
      }
    }

    // Deduplicate streams inside host, preferring real HLS (.m3u8) first
    const uniqueStreams = [];
    const seenUrls = new Set();
    for (const s of streamCandidates) {
      if (!seenUrls.has(s.url)) {
        seenUrls.add(s.url);
        uniqueStreams.push(s);
      }
    }

    if (skipVerify) {
      return {
        streams: uniqueStreams,
        subtitles: Array.from(subtitlesMap.values()),
      };
    }

    // Check HLS variant + first segment health (or direct MP4) so zombie 522/502 streams are filtered out
    const verifiedChecks = await Promise.all(
      uniqueStreams.slice(0, 4).map(async (s) => {
        try {
          if (s.type === 'hls') {
            return await verifyHlsPlayable(s);
          }
          const mr = await fetch(s.url, {
            method: 'HEAD',
            headers: { 'User-Agent': USER_AGENT, Referer: s.referer },
            signal: AbortSignal.timeout(2500),
          });
          return mr.ok || mr.status === 206 ? s : null;
        } catch {
          return null;
        }
      })
    );
    const verifiedStreams = verifiedChecks.filter(Boolean);

    return {
      streams: verifiedStreams,
      subtitles: Array.from(subtitlesMap.values()),
    };
  } catch {
    return { streams: [], subtitles: [] };
  }
}

export function normalizeTitleForMatch(raw) {
  return (raw || '')
    .toLowerCase()
    .replace(/\b(sub\s*indo|subtitle\s*indonesia|subs?\s*indo|dub\s*indo|dubbing\s*indonesia|completed|ongoing|batch|imax|extended|uncut|web-dl|bluray|blu-ray|hd|4k|uhd)\b/gi, ' ')
    .replace(/\b(?:season|s)\s*-?\s*0*\d+(?:\s*(?:episode|eps?\.?|e)\s*-?\s*0*\d+)?\b/gi, ' ')
    .replace(/\b(?:episode|eps?\.?)\s*-?\s*0*\d+\b/gi, ' ')
    .replace(/\(\s*(19\d\d|20\d\d)(?:\s*[-–]\s*(19\d\d|20\d\d))?\s*\)/g, ' ')
    .replace(/\b(19\d\d|20\d\d)\b$/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYears(str) {
  const years = new Set();
  for (const m of (str || '').matchAll(/\b(19\d\d|20\d\d)\b/g)) {
    const y = parseInt(m[1], 10);
    if (y >= 1950 && y <= 2030) years.add(y);
  }
  return Array.from(years);
}

function isDirectEpisodeMatch(candidateTitle, candidateUrl, season = 1, episode = 1) {
  const corpus = `${candidateTitle || ''} ${candidateUrl || ''}`;
  const fullMatch = corpus.match(/\b(?:season|s)\s*-?\s*0*(\d+)\s*[-./]?\s*(?:episode|eps?\.?|e)\s*-?\s*0*(\d+)\b/i);
  if (fullMatch) {
    return parseInt(fullMatch[1], 10) === parseInt(season, 10) && parseInt(fullMatch[2], 10) === parseInt(episode, 10);
  }
  const epOnlyMatch = corpus.match(/\b(?:episode|eps?\.?)\s*-?\s*0*(\d+)\b/i);
  if (epOnlyMatch) {
    return parseInt(epOnlyMatch[1], 10) === parseInt(episode, 10);
  }
  return false;
}

/**
 * Strict anti-mismatch scorer (0-100+). Hard-rejects adult spam, year mismatches, and wrong TV seasons/episodes.
 */
export function scoreTitleMatch(candidateTitle, candidateUrl, targetTitles, targetYear, targetType = 'movie', targetSeason = 1, targetEpisode = null) {
  if (ADULT_TITLE_REGEX.test(candidateTitle || '')) {
    return 0;
  }

  const candYears = extractYears(`${candidateTitle} ${candidateUrl}`);
  const tgtYearNum = targetYear ? parseInt(String(targetYear).slice(0, 4), 10) : null;

  if (tgtYearNum && candYears.length > 0) {
    const minY = Math.min(...candYears);
    const maxY = Math.max(...candYears);
    if (targetType === 'tv') {
      const looksLikeSeriesPost =
        /\/(tv|series|eps)\//i.test(candidateUrl || '') ||
        /\b(?:season|s|episode|eps)\s*\d+/i.test(`${candidateTitle} ${candidateUrl}`);
      if (maxY < tgtYearNum - 1 || (!looksLikeSeriesPost && minY > tgtYearNum + 1)) {
        return 0;
      }
    } else {
      const yearClose = tgtYearNum >= minY - 1 && tgtYearNum <= maxY + 1;
      if (!yearClose) {
        return 0;
      }
    }
  }

  // Handle "Main Title aka Alt Title" cleanly by scoring each part
  const candSegments = (candidateTitle || '')
    .split(/\s+aka\s+/i)
    .map(normalizeTitleForMatch)
    .filter(Boolean);
  if (candSegments.length === 0) return 0;

  const normalizedTargets = targetTitles.map(normalizeTitleForMatch).filter(Boolean);
  let bestScore = 0;

  for (const cand of candSegments) {
    const candWords = cand.split(' ').filter(Boolean);
    if (candWords.length === 0) continue;

    for (const tgt of normalizedTargets) {
      const tgtWords = tgt.split(' ').filter(Boolean);
      if (tgtWords.length === 0) continue;

      let score = 0;
      if (cand === tgt) {
        score = 100;
      } else {
        const union = new Set([...candWords, ...tgtWords]);
        const overlapCount = tgtWords.filter((w) => candWords.includes(w)).length;
        const jaccard = overlapCount / union.size;
        const targetCoverage = overlapCount / tgtWords.length;

        if (candWords.length === 1 && tgtWords.length === 1) {
          score = cand === tgt ? 100 : 0;
        } else if (jaccard >= 0.72) {
          score = Math.round(70 + jaccard * 25);
        } else if (
          tgtWords.length >= 2 &&
          targetCoverage === 1 &&
          (cand.startsWith(`${tgt} `) || cand.endsWith(` ${tgt}`)) &&
          candWords.length <= tgtWords.length + 2
        ) {
          score = 82;
        }
      }

      if (score > bestScore) bestScore = score;
    }
  }

  if (bestScore < 65) return 0;

  const isUrlTv = /\/(tv|series|eps)\//i.test(candidateUrl || '') || /\bseason\s*\d+/i.test(candidateTitle || '');
  if (targetType === 'movie' && isUrlTv) {
    bestScore -= 50;
  } else if (targetType === 'tv' && isUrlTv) {
    bestScore += 8;
  }

  if (targetType === 'tv') {
    const sNum = parseInt(targetSeason, 10) || 1;
    const candSeasonMatch = `${candidateTitle} ${candidateUrl}`.match(/\b(?:season|s)\s*-?\s*0*(\d{1,2})\b/i);
    if (candSeasonMatch) {
      const candSeason = parseInt(candSeasonMatch[1], 10);
      if (candSeason !== sNum) {
        return 0;
      }
      bestScore += 15;
    } else if (sNum === 1) {
      bestScore += 10;
    }

    if (targetEpisode != null) {
      const epNum = parseInt(targetEpisode, 10) || 1;
      const candEpMatch = `${candidateTitle} ${candidateUrl}`.match(/\b(?:episode|eps?\.?)\s*-?\s*0*(\d+)\b/i);
      if (candEpMatch) {
        const candEp = parseInt(candEpMatch[1], 10);
        if (candEp !== epNum) {
          return 0;
        }
        bestScore += 12;
      }
    }
  }

  return bestScore >= 65 ? bestScore : 0;
}

function rewriteStaleMirrorHost(rawHrefUrl, baseUrl) {
  try {
    const parsed = new URL(rawHrefUrl);
    const base = new URL(baseUrl);
    if (parsed.host !== base.host) {
      const brand = MIRROR_BRAND_TOKENS.find((token) => base.hostname.includes(token));
      if (brand && parsed.hostname.includes(brand)) {
        parsed.protocol = base.protocol;
        parsed.host = base.host;
      }
    }
    return parsed.href;
  } catch {
    return rawHrefUrl;
  }
}

export function parseSearchArticles(html, baseUrl) {
  const results = [];
  const articleRegex = /<article[\s\S]*?<\/article>/gi;
  let match;

  while ((match = articleRegex.exec(html || '')) !== null) {
    const block = match[0];
    const titleAnchor =
      block.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<div[^>]*class="[^"]*content-thumbnail[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*title="([^"]+)"/i);

    if (!titleAnchor) continue;
    try {
      const resolved = new URL(decodeHtmlEntities(titleAnchor[1]), baseUrl).href;
      const url = rewriteStaleMirrorHost(resolved, baseUrl);
      const title = stripTags(titleAnchor[2]).replace(/^Permalink\s*(?:to|ke)\s*:\s*/i, '');
      if (title && url.startsWith('http')) {
        results.push({ title, url });
      }
    } catch {
      // Ignore invalid anchor URLs
    }
  }
  return results;
}

function collectIframesFromHtml(html, baseUrl) {
  const urls = [];
  const iframeRegex = /<iframe[^>]+(?:data-litespeed-src|data-src|src)="([^"]+)"/gi;
  let m;
  while ((m = iframeRegex.exec(html || '')) !== null) {
    try {
      const raw = decodeHtmlEntities(m[1]).trim();
      const full = raw.startsWith('//') ? `https:${raw}` : new URL(raw, baseUrl).href;
      if (normalizeEmbedHostUrl(full)) {
        urls.push(full);
      }
    } catch {
      // Skip invalid iframe src
    }
  }
  return urls;
}

function selectEpisodeUrl(html, baseUrl, season = 1, episode = 1) {
  const sNum = parseInt(season, 10) || 1;
  const eNum = parseInt(episode, 10) || 1;
  const normBaseUrl = String(baseUrl || '').replace(/\/+$/, '');

  const scanHtmlForEpisode = (chunkHtml) => {
    const epAnchorRegex = /<a([^>]*)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi;
    const epCandidates = [];
    let m;
    while ((m = epAnchorRegex.exec(chunkHtml || '')) !== null) {
      const attrs = `${m[1]} ${m[3]}`;
      if (/class="[^"]*gmr-all-serie[^"]*"/i.test(attrs)) continue;

      const href = decodeHtmlEntities(m[2]);
      const text = stripTags(m[4]);
      if (!href || /pilih\s*episodes?|lihat\s*semua|view\s*all|batch/i.test(text) || /player=\d+/i.test(href)) continue;

      let resolvedUrl = '';
      try {
        resolvedUrl = rewriteStaleMirrorHost(new URL(href, baseUrl).href, baseUrl);
      } catch {
        continue;
      }
      if (resolvedUrl.replace(/\/+$/, '') === normBaseUrl) continue;

      if (!/eps|episode|nonton|-\d+/i.test(href + ' ' + text)) continue;

      const epMatch =
        text.match(/(?:episode|eps)\s*0*(\d+)/i) ||
        text.match(/\bE0*(\d+)\b/i) ||
        href.match(/(?:episode|eps)-?0*(\d+)/i) ||
        text.match(/^\s*0*(\d+)\s*$/);
      if (!epMatch) continue;

      const parsedEp = parseInt(epMatch[1], 10);
      if (parsedEp !== eNum) continue;

      const sMatch = (text + ' ' + href).match(/(?:season|s)\s*-?\s*0*(\d+)/i);
      if (sMatch && parseInt(sMatch[1], 10) !== sNum) continue;

      epCandidates.push({
        url: resolvedUrl,
        hasSeasonMatch: Boolean(sMatch && parseInt(sMatch[1], 10) === sNum),
      });
    }
    return epCandidates;
  };

  // 1. Prefer KlikXXI-style gmr-season-block matching the exact season
  const seasonBlocks = [...(html || '').matchAll(/<div[^>]*class="[^"]*gmr-season-block[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
  if (seasonBlocks.length > 0) {
    const matchingSeasonBlock = seasonBlocks.find((blk) => {
      const sTitle = blk[0].match(/class="[^"]*(?:gmr-season-block-title|season-title)[^"]*"[^>]*>([\s\S]*?)<\/(?:strong|span|div|h\d)>/i);
      const num = sTitle && sTitle[1].match(/(\d+)/);
      return num && parseInt(num[1], 10) === sNum;
    });
    if (matchingSeasonBlock) {
      const hits = scanHtmlForEpisode(matchingSeasonBlock[0]);
      if (hits.length > 0) {
        const exactSeason = hits.find((c) => c.hasSeasonMatch);
        return (exactSeason || hits[0]).url;
      }
    }
  }

  // 2. Narrow to episode container divs first (gmr-listseries, vid-episodes, gmr-season-episodes)
  const containerMatches = [...(html || '').matchAll(/<div[^>]*class="[^"]*(?:gmr-listseries|vid-episodes|gmr-season-episodes)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
  if (containerMatches.length > 0) {
    for (const cm of containerMatches) {
      const hits = scanHtmlForEpisode(cm[0]);
      if (hits.length > 0) {
        const exactSeason = hits.find((c) => c.hasSeasonMatch);
        return (exactSeason || hits[0]).url;
      }
    }
  }

  // 3. Fallback scan across full HTML only if container divs didn't yield a match
  const fallbackHits = scanHtmlForEpisode(html);
  if (fallbackHits.length === 0) return null;
  const exactSeason = fallbackHits.find((c) => c.hasSeasonMatch);
  return (exactSeason || fallbackHits[0]).url;
}

function isKnownDirectHostUrl(rawUrl) {
  try {
    const h = new URL(rawUrl).hostname.toLowerCase();
    return KNOWN_DIRECT_VIDEO_HOSTS.some((known) => h.includes(known));
  } catch {
    return false;
  }
}

/**
 * Extracts direct HLS/MP4 streams from one CloudX WordPress/DooPlay provider.
 */
export async function extractFromProvider(providerKey, baseUrl, params) {
  const { title = '', originalTitle = '', year = '', type = 'movie', season = 1, episode = 1 } = params;

  const cleanVariant = (s) =>
    (s || '')
      .replace(/\s*\(\d{4}\)\s*/g, ' ')
      .replace(/:\s*The Series$/i, '')
      .trim();

  const targetTitles = [...new Set([originalTitle, title, cleanVariant(originalTitle), cleanVariant(title)].filter(Boolean))];
  if (targetTitles.length === 0) {
    return { provider: providerKey, matchedTitle: null, streams: [], subtitles: [] };
  }

  const cleanSearchQuery = (s) =>
    (s || '')
      .replace(/[:!]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const subtitleAfterColon = (s) => {
    const parts = (s || '').split(':');
    if (parts.length < 2) return '';
    const sub = cleanSearchQuery(parts.slice(1).join(' '));
    return sub.split(' ').filter(Boolean).length >= 2 ? sub : '';
  };

  const baseSearchTitle = cleanSearchQuery(cleanVariant(originalTitle) || cleanVariant(title) || title || originalTitle);
  const queryPool = [];
  if (type === 'tv' && season > 1 && baseSearchTitle) {
    queryPool.push(`${baseSearchTitle} Season ${season}`);
  }
  if (baseSearchTitle) queryPool.push(baseSearchTitle);
  if (type === 'tv' && baseSearchTitle) {
    queryPool.push(`${baseSearchTitle} Season ${season} Episode ${episode}`);
    queryPool.push(`${baseSearchTitle} Episode ${episode}`);
  }
  for (const alt of targetTitles) {
    const cleaned = cleanSearchQuery(alt);
    if (cleaned) queryPool.push(cleaned);
    const sub = subtitleAfterColon(alt);
    if (sub) queryPool.push(sub);
  }
  const searchQueries = [...new Set(queryPool.filter(Boolean))];

  const candidateMap = new Map();
  const maxQueries = type === 'tv' ? 4 : 3;
  for (const q of searchQueries.slice(0, maxQueries)) {
    try {
      const searchUrl = `${baseUrl}/?s=${encodeURIComponent(q)}&post_type[]=post&post_type[]=tv`;
      const searchRes = await fetchText(searchUrl, { timeoutMs: 3800 });
      if (!searchRes.text || searchRes.status >= 400) continue;

      const articles = parseSearchArticles(searchRes.text, searchRes.url || baseUrl);
      for (const art of articles) {
        const score = scoreTitleMatch(art.title, art.url, targetTitles, year, type, season, episode);
        if (score > 0) {
          const prev = candidateMap.get(art.url);
          if (!prev || score > prev.score) {
            candidateMap.set(art.url, { ...art, score });
          }
        }
      }
      const bestSoFar = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score)[0];
      const earlyThreshold = type === 'tv' ? 112 : 95;
      if (bestSoFar && bestSoFar.score >= earlyThreshold) break;
    } catch {
      // Provider timed out or unreachable
    }
  }

  const topCandidates = Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (topCandidates.length === 0) {
    return { provider: providerKey, matchedTitle: null, streams: [], subtitles: [] };
  }

  for (const candidate of topCandidates) {
    try {
      let targetPageUrl = candidate.url;
      let pageRes = await fetchText(targetPageUrl, { referer: baseUrl, timeoutMs: 4000 });
      if (!pageRes.text || pageRes.status >= 400) continue;

      // If TV Series, resolve exact season & episode page (or accept direct single-episode post matches)
      if (type === 'tv') {
        const epUrl = selectEpisodeUrl(pageRes.text, pageRes.url || targetPageUrl, season, episode);
        if (epUrl) {
          if (epUrl !== targetPageUrl) {
            targetPageUrl = epUrl;
            pageRes = await fetchText(targetPageUrl, { referer: candidate.url, timeoutMs: 4000 });
            if (!pageRes.text || pageRes.status >= 400) continue;
          }
        } else if (!isDirectEpisodeMatch(candidate.title, candidate.url, season, episode)) {
          continue;
        }
      }

      const activeBaseUrl = pageRes.url || targetPageUrl;
      const activeOrigin = new URL(activeBaseUrl).origin;
      const initialIframes = collectIframesFromHtml(pageRes.text, activeBaseUrl);
      const rawEmbedUrls = new Set(initialIframes);
      const hasKnownDirectOnPage = initialIframes.some(isKnownDirectHostUrl);

      // 1. Collect player tabs FIRST so direct video embeds take top priority
      const ajaxPostMatch = pageRes.text.match(/id="muvipro_player_content_id"[^>]*data-id="(\d+)"/i);
      if (ajaxPostMatch) {
        const postId = ajaxPostMatch[1];
        const tabIds = [...pageRes.text.matchAll(/<div[^>]*\btab-content-ajax\b[^>]*>/gi)]
          .map((m) => m[0].match(/\bid="([^"]+)"/i)?.[1])
          .filter(Boolean)
          .slice(0, hasKnownDirectOnPage ? 6 : 8);

        await Promise.all(
          tabIds.map(async (tabId) => {
            try {
              const ajaxRes = await fetchText(`${activeOrigin}/wp-admin/admin-ajax.php`, {
                method: 'POST',
                referer: activeBaseUrl,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `action=muvipro_player_content&tab=${encodeURIComponent(tabId)}&post_id=${encodeURIComponent(postId)}`,
                timeoutMs: 3200,
              });
              for (const u of collectIframesFromHtml(ajaxRes.text, activeBaseUrl)) {
                rawEmbedUrls.add(u);
              }
            } catch {
              // Ignore failing AJAX tab
            }
          })
        );
      } else {
        const playerTabs = new Set();
        for (const m of pageRes.text.matchAll(/href="([^"]*\?player=\d+[^"]*)"/gi)) {
          try {
            const tabUrl = new URL(decodeHtmlEntities(m[1]), activeBaseUrl).href;
            if (tabUrl !== activeBaseUrl) playerTabs.add(tabUrl);
          } catch {
            // Ignore malformed tab link
          }
        }

        const tabLimit = hasKnownDirectOnPage ? 3 : 6;
        await Promise.all(
          Array.from(playerTabs)
            .slice(0, tabLimit)
            .map(async (tabUrl) => {
              try {
                const tabRes = await fetchText(tabUrl, { referer: activeBaseUrl, timeoutMs: 3200 });
                for (const u of collectIframesFromHtml(tabRes.text, tabUrl)) {
                  rawEmbedUrls.add(u);
                }
              } catch {
                // Ignore failing tab
              }
            })
        );
      }

      // 2. Append download-list links ONLY if they point to known direct video host domains
      for (const dm of (pageRes.text || '').matchAll(/<ul[^>]*class="[^"]*gmr-download-list[^"]*"[\s\S]*?<\/ul>/gi)) {
        for (const am of dm[0].matchAll(/<a[^>]+href="([^"]+)"/gi)) {
          const norm = normalizeEmbedHostUrl(decodeHtmlEntities(am[1]));
          if (norm && isKnownDirectHostUrl(norm)) {
            rawEmbedUrls.add(norm);
          }
        }
      }

      // Sort embed URLs so known direct HLS hosts come FIRST, then extract top 5
      const hostList = Array.from(rawEmbedUrls)
        .sort((a, b) => (isKnownDirectHostUrl(b) ? 1 : 0) - (isKnownDirectHostUrl(a) ? 1 : 0))
        .slice(0, 5);

      const extractedList = await Promise.all(
        hostList.map((embedUrl) => extractDirectMediaFromHost(embedUrl, `${activeOrigin}/`))
      );

      const streams = [];
      const subtitles = [];
      for (const entry of extractedList) {
        for (const s of entry.streams) {
          streams.push({
            ...s,
            provider: providerKey,
            providerLabel: PROVIDER_LABELS[providerKey] || providerKey,
            matchedTitle: candidate.title,
          });
        }
        for (const sub of entry.subtitles) {
          subtitles.push(sub);
        }
      }

      if (streams.length > 0) {
        return {
          provider: providerKey,
          matchedTitle: candidate.title,
          matchedUrl: targetPageUrl,
          streams,
          subtitles,
        };
      }
    } catch (err) {
      console.warn(`[cloudx:${providerKey}] extraction error:`, err.message);
    }
  }

  return {
    provider: providerKey,
    matchedTitle: topCandidates[0]?.title || null,
    streams: [],
    subtitles: [],
  };
}
