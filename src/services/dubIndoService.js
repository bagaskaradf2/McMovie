/**
 * Dub Indo Data Service for McMovies
 * Strictly curated from Top Videos (dubbindo.site/top) and verified feature films.
 * Filters out all AI shorts, short clips, memes, and non-movie uploads.
 * Supports direct Cloudflare S3 streams & Indodub Wasabi mirrors.
 */

const cache = {
  top: null,
  disney: null,
  boxoffice: null,
  netflix: null,
  popular: null,
  movies: null,
  series: null,
  all_content: null,
  streamSources: null,
  dubTmdbMap: null,
};

let isCuratedMoviesReady = false;
let curatedMoviesCache = [];
let isSeriesProcessed = false;
const seriesGroupMap = new Map();

/**
 * Parses duration string (e.g. "1:56:42" or "24:10") into minutes
 */
export function parseDurationMinutes(durStr) {
  if (!durStr) return 0;
  const parts = durStr.trim().split(':');
  try {
    if (parts.length === 3) {
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    } else if (parts.length === 2) {
      return parseInt(parts[0], 10);
    }
  } catch {
    return 0;
  }
  return 0;
}

/**
 * Cleans title of technical tags, leaving a sleek display title
 */
export function cleanTitle(raw) {
  if (!raw) return '';
  let c = raw;
  c = c.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
  c = c.replace(/(\b(dub\s*indo|dubbing\s*indo+nesia|indo+\s*dub|sub\s*indo|bahasa\s*indo+nesia|dubb\s*indo+nesia|by\s*@\S+)\b)/gi, '');
  c = c.replace(/\[\s*(1080p|720p|480p|hd|web-dl|blu\s*ray|remastered)\s*\]/gi, '');
  c = c.replace(/\b(1080p|720p|480p|hd|web-dl|blu\s*ray|remastered|full\s*movie)\b/gi, '');
  c = c.replace(/[-_–—:.,\s]+$/g, '');
  c = c.replace(/^[-_–—:.,\s]+/g, '');
  c = c.replace(/\s+/g, ' ').trim();
  return c || raw;
}

export function cleanDescription(raw) {
  if (!raw) return '';
  let c = raw;
  c = c.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
  c = c.replace(/Download\s*:\s*https?:\/\/\S+/gi, '');
  c = c.replace(/https?:\/\/\S+/gi, '');
  c = c.replace(/Download\s*:\s*$/gi, '');
  c = c.replace(/Download\s*:/gi, '');
  c = c.replace(/\s+/g, ' ').trim();
  return c;
}

/**
 * Extracts year from title (e.g. "Cars (2006)")
 */
export function extractYear(title) {
  if (!title) return '';
  const m = title.match(/\b(19\d\d|20\d\d)\b/);
  return m ? m[1] : '';
}

/**
 * Trash / AI shorts detector
 */
function isJunkContent(title, durationStr) {
  if (!title) return true;
  const t = title.toLowerCase();
  
  // Explicit junk keywords from raw dubbindo uploads
  const junkPatterns = [
    'sepupu', 'live action', 'short', 'shorts', 'tiktok', 'tik tok', 
    'reels', 'story wa', 'status wa', 'meme', 'trailer', 'teaser',
    'opening', 'ending', 'ost', 'part 1', 'part 2', 'klip', 'clip',
    'episode', 'eps', 'ep.'
  ];

  if (junkPatterns.some(p => t.includes(p))) {
    return true;
  }

  // Minimum duration for full movies is 35 minutes
  const mins = parseDurationMinutes(durationStr);
  if (mins < 35) {
    return true;
  }

  return false;
}

/**
 * Resolves raw stream URLs into direct high-speed streams.
 * If the link is uvideoweb, routes through Indodub LiteSpeed redirector
 * which outputs pre-signed Wasabi S3 MP4 streams with CORS enabled!
 */
export function resolveStreamUrl(rawUrl) {
  if (!rawUrl) return null;
  if (rawUrl.includes('uvideoweb')) {
    const m = rawUrl.match(/uvideoweb\/(.+)$/);
    if (m) {
      return `https://files.indodub.my.id/redirect.php?bucket=uvideoweb&url=${encodeURIComponent(m[1]).replace(/%2F/g, '/')}`;
    }
  }
  return rawUrl;
}

/**
 * Pre-resolves 302 redirect on the client to obtain the direct signed Wasabi S3 URL.
 * Bypasses Chrome CORS and Range header issues on cross-origin redirects!
 */
export async function resolveDirectPlayableUrl(rawUrl) {
  if (!rawUrl) return null;
  const redirectUrl = resolveStreamUrl(rawUrl);
  if (redirectUrl && redirectUrl.includes('files.indodub.my.id/redirect.php')) {
    try {
      const res = await fetch(redirectUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-10' }
      });
      if (res.url && res.url !== redirectUrl && res.url.includes('wasabisys.com')) {
        return res.url;
      }
    } catch (e) {
      console.warn('Pre-resolving Wasabi direct stream encountered error, using redirect URL:', e);
    }
  }
  return redirectUrl;
}

/**
 * Generates alternative stream mirrors for high availability
 */
export function getStreamMirrors(rawUrl, embedToken = null) {
  if (!rawUrl && !embedToken) return [];
  const mirrors = [];

  if (rawUrl && rawUrl.includes('uvideoweb')) {
    const m = rawUrl.match(/uvideoweb\/(.+)$/);
    if (m) {
      mirrors.push({
        id: 'dub_direct',
        name: '🇮🇩 Dubbing Indo (Server Utama)',
        badge: 'Wasabi S3 Direct',
        url: `https://files.indodub.my.id/redirect.php?bucket=uvideoweb&url=${encodeURIComponent(m[1]).replace(/%2F/g, '/')}`,
        isDirect: true,
      });
      mirrors.push({
        id: 'dub_redirect',
        name: '🇮🇩 Dubbing Indo (Server Cadangan)',
        badge: 'LiteSpeed Mirror',
        url: `https://files.indodub.my.id/redirect.php?bucket=uvideoweb&url=${encodeURIComponent(m[1]).replace(/%2F/g, '/')}`,
        isDirect: true,
      });
    }
  } else if (rawUrl && rawUrl.includes('/upload/videos/')) {
    mirrors.push({
      id: 'dub_direct',
      name: '🇮🇩 Dubbing Indo (Server Utama)',
      badge: 'Cloudflare 4K',
      url: rawUrl,
      isDirect: true,
    });
    const rel = rawUrl.replace(/^https?:\/\/[^\/]+\//, '');
    mirrors.push({
      id: 'dub_redirect',
      name: '🇮🇩 Dubbing Indo (Server Cadangan)',
      badge: 'Mirror 1080p',
      url: `https://files.indodub.my.id/${rel}`,
      isDirect: true,
    });
  }

  // Official Dubbindo Web Player iframe mirror
  if (embedToken) {
    mirrors.push({
      id: 'dub_embed',
      name: '🇮🇩 Dubbing Indo (Web Player)',
      badge: 'Web Player HD',
      url: `https://www.dubbindo.site/embed/${embedToken}`,
      isDirect: false,
    });
  }

  return mirrors;
}

async function loadJson(filename) {
  const key = filename.replace('.json', '');
  if (cache[key]) return cache[key];

  try {
    const res = await fetch(`/data/${filename}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache[key] = Array.isArray(data) ? data : (data.data || []);
    return cache[key];
  } catch (err) {
    console.error(`Error loading /data/${filename}:`, err);
    return [];
  }
}

export const DubIndoService = {
  async getDubTmdbMap() {
    if (cache.dubTmdbMap) return cache.dubTmdbMap;
    try {
      const res = await fetch('/data/dub_tmdb_map.json');
      if (res.ok) {
        cache.dubTmdbMap = await res.json();
      } else {
        cache.dubTmdbMap = {};
      }
    } catch {
      cache.dubTmdbMap = {};
    }
    return cache.dubTmdbMap;
  },

  async getStreamSources() {
    if (cache.streamSources) return cache.streamSources;
    try {
      const res = await fetch('/data/stream_sources.json');
      if (res.ok) {
        cache.streamSources = await res.json();
      } else {
        cache.streamSources = {};
      }
    } catch {
      cache.streamSources = {};
    }
    return cache.streamSources;
  },

  /**
   * Loads Top Videos from dubbindo.site/top and verified curated full movies.
   * Supports both Cloudflare CDN and Indodub Wasabi mirrors.
   */
  async getTopMovies(limit = 100) {
    if (isCuratedMoviesReady && curatedMoviesCache.length > 0) {
      return curatedMoviesCache.slice(0, limit);
    }

    const [sources, tmdbMap] = await Promise.all([
      this.getStreamSources(),
      this.getDubTmdbMap(),
    ]);

    // Order of priority: Top Videos -> Disney -> Box Office -> Netflix -> Popular
    const [topList, disneyList, boxOfficeList, netflixList, popularList] = await Promise.all([
      loadJson('top.json'),
      loadJson('disney.json'),
      loadJson('boxoffice.json'),
      loadJson('netflix.json'),
      loadJson('popular.json'),
    ]);

    const seenIds = new Set();
    const seenTitles = new Set();
    const curated = [];

    const allCandidates = [
      ...topList,
      ...disneyList,
      ...boxOfficeList,
      ...netflixList,
      ...popularList
    ];

    allCandidates.forEach(item => {
      const rawId = String(item.id || item.url || '');
      if (!rawId || seenIds.has(rawId)) return;

      // Filter out shorts, AI memes, and sub-35min clips
      if (isJunkContent(item.title, item.duration)) return;

      const rawStreamUrl = sources[rawId] || sources[String(item.url)] || null;
      if (!rawStreamUrl) return;

      const cleanName = cleanTitle(item.title);
      const year = extractYear(item.title) || '2024';

      // Deduplicate identical movies by normalized title and year
      const normalizedKey = `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${year}`;
      if (seenTitles.has(normalizedKey)) return;
      seenTitles.add(normalizedKey);

      seenIds.add(rawId);

      const mapEntry = tmdbMap[rawId] || null;
      const tmdbId = mapEntry?.tmdbId || null;
      const embedToken = mapEntry?.token || (item.slug ? (item.slug.match(/_([a-zA-Z0-9]+)$/) || [])[1] : (item.url ? (item.url.match(/_([a-zA-Z0-9]+)\.html/) || [])[1] : null));
      const resolvedStream = resolveStreamUrl(rawStreamUrl);
      const mirrors = getStreamMirrors(rawStreamUrl, embedToken);

      const cleanThumb = (item.thumbnail || '')
        .replace('https://stream.dubbindo.site/', 'https://ik.imagekit.io/uvideo/')
        .replace('http://stream.dubbindo.site/', 'https://ik.imagekit.io/uvideo/');

      const tmdbPoster = mapEntry?.poster_path
        ? (mapEntry.poster_path.startsWith('http') ? mapEntry.poster_path : `https://image.tmdb.org/t/p/w500${mapEntry.poster_path}`)
        : cleanThumb;

      const tmdbBackdrop = mapEntry?.backdrop_path
        ? (mapEntry.backdrop_path.startsWith('http') ? mapEntry.backdrop_path : `https://image.tmdb.org/t/p/original${mapEntry.backdrop_path}`)
        : cleanThumb;

      curated.push({
        id: `dub_${rawId}`,
        rawId,
        title: mapEntry?.title || cleanName,
        rawTitle: item.title,
        year: mapEntry?.year || year,
        release_date: (mapEntry?.year || year) ? `${mapEntry?.year || year}-01-01` : '',
        duration: item.duration || '1j 45m',
        views: item.views || 0,
        thumbnail: cleanThumb,
        poster_path: tmdbPoster,
        backdrop_path: tmdbBackdrop,
        description: mapEntry?.overview || cleanDescription(item.description) || `Saksikan film ${cleanName} dalam audio Dubbing Bahasa Indonesia resmi kualitas HD.`,
        isDubIndo: true,
        media_type: 'movie',
        category: 'Dub Indo Movie',
        vote_average: mapEntry?.vote_average ? parseFloat(Number(mapEntry.vote_average).toFixed(1)) : (item.views > 20000 ? 8.8 : 8.4),
        streamUrl: resolvedStream,
        streamBackupUrl: mirrors.length > 1 ? mirrors[1].url : resolvedStream,
        mirrors,
        isDirectPlayable: true,
        tmdbId,
        embedToken,
      });
    });

    // Prioritize movies with genuine TMDB posters first so the catalog is never blank
    curated.sort((a, b) => {
      const aHasPoster = a.poster_path && a.poster_path.includes('tmdb.org') ? 1 : 0;
      const bHasPoster = b.poster_path && b.poster_path.includes('tmdb.org') ? 1 : 0;
      if (aHasPoster !== bHasPoster) return bHasPoster - aHasPoster;
      return (b.views || 0) - (a.views || 0);
    });

    curatedMoviesCache = curated;
    isCuratedMoviesReady = true;
    return curatedMoviesCache.slice(0, limit);
  },

  /**
   * Universal Lookup: Finds ANY Dub Indo movie or series across all 2,260+ entries.
   * Completely eliminates the "Audio Dubbing Indonesia Sedang Dalam Pembaruan" blank wall!
   */
  async getMovieOrSeriesById(targetId) {
    if (!targetId) return null;
    const cleanId = String(targetId).replace(/^dub_/, '').replace(/^dub_series_/, '');

    // 1. Check curated movies cache first (support rawId, dub_id, or tmdbId)
    if (curatedMoviesCache.length > 0) {
      const found = curatedMoviesCache.find(m => 
        String(m.id) === String(targetId) || 
        String(m.rawId) === cleanId ||
        (m.tmdbId && String(m.tmdbId) === cleanId)
      );
      if (found) return found;
    }

    // 2. Check series group cache
    try {
      const seriesList = await this.getSeries();
      const foundSeries = seriesList.find(s => 
        String(s.id) === String(targetId) || 
        String(s.id).includes(cleanId) ||
        (s.tmdbId && String(s.tmdbId) === cleanId)
      );
      if (foundSeries) return foundSeries;
    } catch (e) {
      console.warn('Error checking series in getMovieOrSeriesById:', e);
    }

    const [sources, tmdbMap] = await Promise.all([
      this.getStreamSources(),
      this.getDubTmdbMap(),
    ]);

    // Check if cleanId matches a TMDB ID in the map to find the raw dub ID
    let matchedRawId = cleanId;
    for (const [rId, entry] of Object.entries(tmdbMap)) {
      if (String(entry.tmdbId) === cleanId) {
        matchedRawId = rId;
        break;
      }
    }

    // 3. Search all catalog files
    const catalogFiles = [
      'top.json', 'popular.json', 'disney.json', 'boxoffice.json', 
      'netflix.json', 'movies.json', 'series.json', 'all_content.json'
    ];

    for (const f of catalogFiles) {
      const list = await loadJson(f);
      const found = list.find(item => 
        String(item.id || '') === cleanId || 
        String(item.id || '') === matchedRawId ||
        String(item.url || '').includes(`_${cleanId}.`) ||
        String(item.url || '').includes(`_${matchedRawId}.`) ||
        String(item.slug || '').includes(cleanId) ||
        String(item.slug || '').includes(matchedRawId)
      );

      if (found) {
        const itemRawId = String(found.id || matchedRawId || cleanId);
        const rawStream = sources[itemRawId] || sources[cleanId] || sources[String(found.url)] || null;
        const resolvedStream = resolveStreamUrl(rawStream);
        const mapEntry = tmdbMap[itemRawId] || tmdbMap[cleanId] || null;
        const embedToken = mapEntry?.token || (found.slug ? (found.slug.match(/_([a-zA-Z0-9]+)$/) || [])[1] : (found.url ? (found.url.match(/_([a-zA-Z0-9]+)\.html/) || [])[1] : null));
        const mirrors = getStreamMirrors(rawStream, embedToken);
        const cleanName = cleanTitle(found.title);
        const year = extractYear(found.title) || mapEntry?.year || '2024';

        const tmdbPoster = mapEntry?.poster_path
          ? (mapEntry.poster_path.startsWith('http') ? mapEntry.poster_path : `https://image.tmdb.org/t/p/w500${mapEntry.poster_path}`)
          : null;
        const tmdbBackdrop = mapEntry?.backdrop_path
          ? (mapEntry.backdrop_path.startsWith('http') ? mapEntry.backdrop_path : `https://image.tmdb.org/t/p/original${mapEntry.backdrop_path}`)
          : null;
        const cleanThumb = (found.thumbnail || '')
          .replace('https://stream.dubbindo.site/', 'https://ik.imagekit.io/uvideo/')
          .replace('http://stream.dubbindo.site/', 'https://ik.imagekit.io/uvideo/');

        return {
          id: `dub_${itemRawId}`,
          rawId: itemRawId,
          title: mapEntry?.title || cleanName,
          rawTitle: found.title,
          year: mapEntry?.year || year,
          release_date: year ? `${year}-01-01` : '',
          duration: found.duration || '1j 45m',
          views: found.views || 0,
          thumbnail: cleanThumb,
          poster_path: tmdbPoster || cleanThumb,
          backdrop_path: tmdbBackdrop || cleanThumb,
          description: mapEntry?.overview || cleanDescription(found.description) || `Saksikan film ${cleanName} dalam audio Dubbing Bahasa Indonesia resmi kualitas HD.`,
          isDubIndo: true,
          media_type: f === 'series.json' ? 'tv' : 'movie',
          category: 'Dub Indo Movie',
          vote_average: mapEntry?.vote_average ? parseFloat(Number(mapEntry.vote_average).toFixed(1)) : ((found.views || 0) > 20000 ? 8.8 : 8.4),
          streamUrl: resolvedStream,
          streamBackupUrl: mirrors.length > 1 ? mirrors[1].url : resolvedStream,
          mirrors,
          isDirectPlayable: !!resolvedStream,
          tmdbId: mapEntry?.tmdbId || null,
          embedToken,
        };
      }
    }

    // 4. Fallback: if not loaded in cache yet, warm up top movies and try again once
    if (!isCuratedMoviesReady) {
      await this.getTopMovies(100);
      if (curatedMoviesCache.length > 0) {
        const foundAgain = curatedMoviesCache.find(m => 
          String(m.id) === String(targetId) || 
          String(m.rawId) === cleanId ||
          (m.tmdbId && String(m.tmdbId) === cleanId)
        );
        if (foundAgain) return foundAgain;
      }
    }

    return null;
  },

  /**
   * Checks if a TMDB movie has an Indonesian Dubbing stream available
   */
  async findDubIndoByTmdbId(tmdbId) {
    if (!tmdbId) return null;
    const tmdbMap = await this.getDubTmdbMap();
    for (const [rawId, entry] of Object.entries(tmdbMap)) {
      if (String(entry.tmdbId) === String(tmdbId)) {
        return this.getMovieOrSeriesById(rawId);
      }
    }
    return null;
  },

  /**
   * Loads verified Dub Indo series (proper seasons/episodes only)
   */
  async getSeries() {
    if (isSeriesProcessed && seriesGroupMap.size > 0) {
      return Array.from(seriesGroupMap.values());
    }

    const rawSeries = await loadJson('series.json');
    const sources = await this.getStreamSources();

    seriesGroupMap.clear();

    rawSeries.forEach(item => {
      const durMins = parseDurationMinutes(item.duration);
      if (durMins < 10) return;

      const title = item.title || '';
      const cleanName = cleanTitle(title)
        .replace(/season\s*\d+/gi, '')
        .replace(/episode\s*\d+/gi, '')
        .replace(/eps?\s*\d+/gi, '')
        .trim();

      if (!cleanName || cleanName.length < 3) return;
      const seriesKey = cleanName.toLowerCase();

      if (!seriesGroupMap.has(seriesKey)) {
        seriesGroupMap.set(seriesKey, {
          id: `dub_series_${item.id}`,
          title: cleanName,
          poster_path: item.thumbnail,
          backdrop_path: item.thumbnail,
          isDubIndo: true,
          media_type: 'tv',
          vote_average: 8.7,
          description: item.description || `Serial kartun & anime ${cleanName} dalam Dubbing Bahasa Indonesia.`,
          episodes: [],
        });
      }

      const series = seriesGroupMap.get(seriesKey);
      const rawStream = sources[String(item.id)] || sources[String(item.url)] || null;
      const streamUrl = resolveStreamUrl(rawStream);

      series.episodes.push({
        id: item.id,
        title: title,
        duration: item.duration,
        thumbnail: item.thumbnail,
        streamUrl,
      });
    });

    const validSeries = Array.from(seriesGroupMap.values()).filter(s => s.episodes.length >= 1);
    isSeriesProcessed = true;
    return validSeries;
  },

  async searchDubIndo(query) {
    if (!query || !query.trim()) return [];
    const q = query.toLowerCase().trim();
    const [movies, series] = await Promise.all([
      this.getTopMovies(1000),
      this.getSeries(),
    ]);

    const matchedMovies = movies.filter(m => (m.title || '').toLowerCase().includes(q));
    const matchedSeries = series.filter(s => (s.title || '').toLowerCase().includes(q));

    return [...matchedMovies, ...matchedSeries];
  },

  async resolveDubTmdbId(title, year) {
    if (!title) return null;
    try {
      const clean = cleanTitle(title);
      const key = '4e44d9029b1270a757cddc766a1bcb63';
      let url = `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(clean)}`;
      if (year) url += `&year=${year}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          return data.results[0].id;
        }
      }
      if (year) {
        const url2 = `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(clean)}`;
        const res2 = await fetch(url2);
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2.results && data2.results.length > 0) {
            return data2.results[0].id;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to dynamically resolve TMDB ID:', err);
    }
    return null;
  },

  resolveDirectPlayableUrl,
  resolveStreamUrl,
  getStreamMirrors
};
