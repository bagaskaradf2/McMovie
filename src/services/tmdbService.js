/**
 * TMDB API Service for McMovies
 * Provides live global trending, Marvel Cinematic Universe collection, real latest
 * Netflix Indonesia releases, movies, TV series, anime, Asian dramas, and multi-search.
 */

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

const DEFAULT_KEYS = [
  '4e44d9029b1270a757cddc766a1bcb63',
  '2dca580c2a14b55200e784d157207b4d',
];

let currentKeyIndex = 0;

export function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

const SPAM_TITLE_REGEX = /\+?\d[\d\-\s]{7,}|1-888|1-800|ticket\s*\+|call\s*now|celebrity roast/i;

export function isCleanMediaItem(item, { allowUnreleased = false } = {}) {
  if (!item || !item.poster_path) return false;
  const title = (item.title || item.name || '').trim();
  if (!title || SPAM_TITLE_REGEX.test(title)) return false;

  if (!allowUnreleased) {
    const relDate = item.release_date || item.first_air_date || '';
    if (relDate && relDate > getTodayISO()) {
      return false;
    }
  }
  return true;
}

function getApiKey() {
  return DEFAULT_KEYS[currentKeyIndex % DEFAULT_KEYS.length];
}

async function tmdbFetch(endpoint, params = {}) {
  let attempts = 0;
  const maxAttempts = DEFAULT_KEYS.length;

  while (attempts < maxAttempts) {
    const key = getApiKey();
    const queryParams = new URLSearchParams({
      api_key: key,
      ...params,
    });

    const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryParams.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 401 || res.status === 429) {
        currentKeyIndex = (currentKeyIndex + 1) % DEFAULT_KEYS.length;
        attempts++;
        continue;
      }
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        throw new Error(`TMDB error HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (attempts >= maxAttempts - 1) {
        console.warn('All TMDB API key attempts failed or timed out:', err.message);
        return null;
      }
      currentKeyIndex = (currentKeyIndex + 1) % DEFAULT_KEYS.length;
      attempts++;
    }
  }
  return null;
}

export const TmdbService = {
  getImageUrl(path, size = 'w500') {
    if (!path) return 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=60';
    if (path.startsWith('http')) return path;
    return `${TMDB_IMAGE_BASE}/${size}${path}`;
  },

  getBackdropUrl(path, size = 'w1280') {
    if (!path) return 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1280&auto=format&fit=crop&q=80';
    if (path.startsWith('http')) return path;
    return `${TMDB_IMAGE_BASE}/${size}${path}`;
  },

  async getTrending(timeWindow = 'day', page = 1) {
    const data = await tmdbFetch(`/trending/all/${timeWindow}`, {
      language: 'en-US',
      page,
    });
    return (data?.results || [])
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .filter((item) => isCleanMediaItem(item, { allowUnreleased: false }));
  },

  async getTrendingWeek(page = 1) {
    return this.getTrending('week', page);
  },

  /**
   * Complete Marvel Cinematic Universe theatrical feature films (Iron Man 2008 to latest)
   */
  async getMarvelCinematicUniverse() {
    const today = getTodayISO();
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        tmdbFetch('/discover/movie', {
          with_keywords: '180547',
          without_genres: '99',
          'with_runtime.gte': '75',
          'primary_release_date.lte': today,
          sort_by: 'release_date.desc',
          'vote_count.gte': '200',
          language: 'en-US',
          page,
        })
      )
    );

    const seen = new Set();
    const mcu = [];

    for (const data of pages) {
      for (const raw of data?.results || []) {
        if (!raw || seen.has(raw.id)) continue;
        if (/assembled|making of|expanding the universe|disney\+ day/i.test(raw.title || '')) {
          continue;
        }
        const item = { ...raw, media_type: 'movie', badge: 'Marvel MCU', isMcu: true };
        if (!isCleanMediaItem(item, { allowUnreleased: false })) continue;
        seen.add(raw.id);
        mcu.push(item);
      }
    }

    return mcu;
  },

  /**
   * Real latest Film & Series Indonesia on Netflix (2025 - current Nov 2026)
   */
  async getIndoNetflixLatest() {
    const today = getTodayISO();
    const commonMovie = {
      with_origin_country: 'ID',
      with_watch_providers: '8',
      watch_region: 'ID',
      'primary_release_date.gte': '2025-01-01',
      'primary_release_date.lte': today,
      language: 'id-ID',
      page: 1,
    };
    const commonTv = {
      with_origin_country: 'ID',
      with_watch_providers: '8',
      watch_region: 'ID',
      'first_air_date.gte': '2025-01-01',
      'first_air_date.lte': today,
      language: 'id-ID',
      page: 1,
    };

    const [movPop, movLatest, tvLatest, tvPop] = await Promise.all([
      tmdbFetch('/discover/movie', { ...commonMovie, sort_by: 'popularity.desc' }),
      tmdbFetch('/discover/movie', { ...commonMovie, sort_by: 'primary_release_date.desc' }),
      tmdbFetch('/discover/tv', { ...commonTv, sort_by: 'first_air_date.desc' }),
      tmdbFetch('/discover/tv', { ...commonTv, sort_by: 'popularity.desc' }),
    ]);

    const seen = new Set();
    const merged = [];

    const ingest = (list, mediaType) => {
      for (const raw of list || []) {
        const item = { ...raw, media_type: mediaType };
        if (!isCleanMediaItem(item, { allowUnreleased: false })) continue;
        const key = `${mediaType}_${item.id}`;
        if (seen.has(key)) continue;

        const relDate = item.release_date || item.first_air_date || '';
        const hasEngagement = (item.vote_count || 0) >= 1 || (item.popularity || 0) >= 1.2;
        if (!hasEngagement && relDate < '2026-08-01') continue;

        seen.add(key);
        const year = relDate.slice(0, 4);
        merged.push({
          ...item,
          tmdbId: item.id,
          title: item.title || item.name,
          badge: year === '2026' ? 'Netflix 2026' : 'Netflix 2025',
          isNetflixIndo: true,
          provider: 'netflix',
        });
      }
    };

    // Prioritize popular & newest in interleaved batches before final sort
    ingest(movPop?.results, 'movie');
    ingest(tvLatest?.results, 'tv');
    ingest(movLatest?.results, 'movie');
    ingest(tvPop?.results, 'tv');

    merged.sort((a, b) => {
      const da = a.release_date || a.first_air_date || '2025-01-01';
      const db = b.release_date || b.first_air_date || '2025-01-01';
      const scoreA = (da.startsWith('2026') ? 100 : 0) + Math.min((a.popularity || 0) * 1.5, 80) + (da >= '2026-07-01' ? 20 : 0);
      const scoreB = (db.startsWith('2026') ? 100 : 0) + Math.min((b.popularity || 0) * 1.5, 80) + (db >= '2026-07-01' ? 20 : 0);
      if (Math.abs(scoreB - scoreA) > 1) return scoreB - scoreA;
      return db.localeCompare(da);
    });

    return merged;
  },

  async getIndoBioskopLatest(page = 1) {
    const today = getTodayISO();
    const data = await tmdbFetch('/discover/movie', {
      with_origin_country: 'ID',
      'primary_release_date.gte': '2025-01-01',
      'primary_release_date.lte': today,
      sort_by: 'popularity.desc',
      language: 'id-ID',
      page,
    });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'movie', badge: 'Bioskop ID' }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getIndoSeriesLatest(page = 1) {
    const today = getTodayISO();
    const data = await tmdbFetch('/discover/tv', {
      with_origin_country: 'ID',
      'first_air_date.gte': '2024-01-01',
      'first_air_date.lte': today,
      sort_by: 'popularity.desc',
      language: 'id-ID',
      page,
    });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'tv', badge: 'Series ID' }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getNowPlaying2026(page = 1) {
    const today = getTodayISO();
    const data = await tmdbFetch('/discover/movie', {
      'primary_release_date.gte': '2026-01-01',
      'primary_release_date.lte': today,
      sort_by: 'popularity.desc',
      'vote_count.gte': '25',
      language: 'en-US',
      page,
    });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'movie' }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getNetflixGlobalSeries(page = 1) {
    const today = getTodayISO();
    const data = await tmdbFetch('/discover/tv', {
      with_watch_providers: '8',
      watch_region: 'ID',
      'first_air_date.gte': '2025-01-01',
      'first_air_date.lte': today,
      sort_by: 'popularity.desc',
      'vote_count.gte': '15',
      language: 'en-US',
      page,
    });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'tv', badge: 'Netflix' }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getPopularMovies(page = 1) {
    const data = await tmdbFetch('/movie/popular', { language: 'en-US', page });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'movie' }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getTopRatedMovies(page = 1) {
    const data = await tmdbFetch('/movie/top_rated', { language: 'en-US', page });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'movie' }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getNowPlayingMovies(page = 1) {
    const data = await tmdbFetch('/movie/now_playing', { language: 'en-US', page });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'movie' }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getPopularTV(page = 1) {
    const data = await tmdbFetch('/tv/popular', { language: 'en-US', page });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'tv' }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getTopRatedTV(page = 1) {
    const data = await tmdbFetch('/tv/top_rated', { language: 'en-US', page });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'tv' }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getAnime(page = 1) {
    const data = await tmdbFetch('/discover/tv', {
      with_genres: '16',
      with_original_language: 'ja',
      sort_by: 'popularity.desc',
      'vote_count.gte': '10',
      language: 'en-US',
      page,
    });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'tv', isAnime: true }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getAnimeMovies(page = 1) {
    const data = await tmdbFetch('/discover/movie', {
      with_genres: '16',
      with_original_language: 'ja',
      sort_by: 'popularity.desc',
      'vote_count.gte': '10',
      language: 'en-US',
      page,
    });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'movie', isAnime: true }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getKDrama(page = 1) {
    const data = await tmdbFetch('/discover/tv', {
      with_original_language: 'ko',
      sort_by: 'popularity.desc',
      'vote_count.gte': '10',
      language: 'en-US',
      page,
    });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'tv', isDrama: true }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getCDrama(page = 1) {
    const data = await tmdbFetch('/discover/tv', {
      with_original_language: 'zh',
      sort_by: 'popularity.desc',
      'vote_count.gte': '5',
      language: 'en-US',
      page,
    });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: 'tv', isDrama: true }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async getIndoMovies(page = 1) {
    return this.getIndoBioskopLatest(page);
  },

  async getByGenre(genreId, mediaType = 'movie', page = 1) {
    const today = getTodayISO();
    const endpoint = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
    const dateKey = mediaType === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte';
    const data = await tmdbFetch(endpoint, {
      with_genres: genreId,
      [dateKey]: today,
      sort_by: 'popularity.desc',
      'vote_count.gte': '10',
      language: 'en-US',
      page,
    });
    return (data?.results || [])
      .map((m) => ({ ...m, media_type: mediaType }))
      .filter((m) => isCleanMediaItem(m, { allowUnreleased: false }));
  },

  async searchMulti(query, page = 1) {
    if (!query || !query.trim()) return [];
    const data = await tmdbFetch('/search/multi', {
      query: query.trim(),
      language: 'en-US',
      page,
      include_adult: false,
    });
    return (data?.results || [])
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .filter((item) => isCleanMediaItem(item, { allowUnreleased: true }));
  },

  async getDetails(id, mediaType = 'movie') {
    const data = await tmdbFetch(`/${mediaType}/${id}`, {
      language: 'en-US',
      append_to_response: 'credits,videos,similar,recommendations',
    });
    return data;
  },

  async getSeasonDetails(tvId, seasonNumber = 1) {
    const data = await tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`, {
      language: 'en-US',
    });
    return data;
  },
};
