const INTRODB_BASE = 'https://api.theintrodb.org/v2/media';
const FETCH_TIMEOUT_MS = 3500;
const MAX_CACHE_ENTRIES = 120;

const segmentCache = new Map();

function setCachedSegments(key, segments) {
  if (segmentCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = segmentCache.keys().next().value;
    if (oldestKey !== undefined) {
      segmentCache.delete(oldestKey);
    }
  }
  segmentCache.set(key, segments);
}

function extractTypedSegments(rawList, type) {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  const list = [];

  for (const entry of rawList) {
    if (!entry || typeof entry !== 'object') continue;

    if (type === 'recap' || type === 'intro') {
      const startSec = entry.start_ms == null ? 0 : Number(entry.start_ms) / 1000;
      const endSec = entry.end_ms == null ? null : Number(entry.end_ms) / 1000;
      if (
        Number.isFinite(startSec) &&
        startSec >= 0 &&
        endSec != null &&
        Number.isFinite(endSec) &&
        endSec - startSec >= 5 &&
        endSec - startSec <= 360
      ) {
        list.push({ type, startSec, endSec });
      }
    } else if (type === 'credits') {
      if (entry.start_ms == null) continue;
      const startSec = Number(entry.start_ms) / 1000;
      const endSec = entry.end_ms == null ? null : Number(entry.end_ms) / 1000;
      if (
        Number.isFinite(startSec) &&
        startSec >= 60 &&
        (endSec == null || (Number.isFinite(endSec) && endSec - startSec >= 5))
      ) {
        list.push({ type, startSec, endSec });
      }
    }
  }

  return list;
}

function normalizeRawSegments(data) {
  if (!data || typeof data !== 'object') return [];
  const combined = [
    ...extractTypedSegments(data.recap, 'recap'),
    ...extractTypedSegments(data.intro, 'intro'),
    ...extractTypedSegments(data.credits, 'credits'),
  ];
  combined.sort((a, b) => a.startSec - b.startSec);
  return combined;
}

export const SkipSegmentsService = {
  /**
   * Fetch real intro, recap, and credits timestamps from TheIntroDB v2.
   * Never throws or delays playback; returns [] when unavailable.
   */
  async getSegments({ tmdbId, isSeries = false, season = 1, episode = 1, signal } = {}) {
    const id = Number.parseInt(String(tmdbId || ''), 10);
    if (!Number.isInteger(id) || id < 1 || id > 10000000) {
      return [];
    }

    const s = isSeries ? Number.parseInt(String(season || 1), 10) : 0;
    const e = isSeries ? Number.parseInt(String(episode || 1), 10) : 0;
    if (isSeries && (!Number.isInteger(s) || s < 1 || !Number.isInteger(e) || e < 1)) {
      return [];
    }

    const cacheKey = `${isSeries ? 'tv' : 'movie'}_${id}_${s}_${e}`;
    if (segmentCache.has(cacheKey)) {
      return segmentCache.get(cacheKey);
    }

    const url = isSeries
      ? `${INTRODB_BASE}?tmdb_id=${id}&season=${s}&episode=${e}`
      : `${INTRODB_BASE}?tmdb_id=${id}`;

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    const onCallerAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return [];
      }
      signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!res.ok) {
        setCachedSegments(cacheKey, []);
        return [];
      }

      const json = await res.json();
      const normalized = normalizeRawSegments(json);
      setCachedSegments(cacheKey, normalized);
      return normalized;
    } catch {
      if (!signal?.aborted || timedOut) {
        setCachedSegments(cacheKey, []);
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', onCallerAbort);
      }
    }
  },
};
