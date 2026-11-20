/**
 * TMDB API Service for McMovies
 * Provides full global catalog of movies, TV series, anime, Asian dramas, and search.
 */

import { StorageService } from './storageService';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

const DEFAULT_KEYS = [
  '4e44d9029b1270a757cddc766a1bcb63',
  '2dca580c2a14b55200e784d157207b4d',
];

let currentKeyIndex = 0;

function getApiKey() {
  const userKey = StorageService.getSettings()?.tmdbApiKey;
  if (userKey && userKey.trim().length > 10) {
    return userKey.trim();
  }
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
      const res = await fetch(url);
      if (res.status === 401 || res.status === 429) {
        // Key might be rate limited or invalid, try next key
        currentKeyIndex = (currentKeyIndex + 1) % DEFAULT_KEYS.length;
        attempts++;
        continue;
      }
      if (!res.ok) {
        throw new Error(`TMDB error HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (attempts >= maxAttempts - 1) {
        console.error('All TMDB API key attempts failed:', err);
        throw err;
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
    const data = await tmdbFetch(`/trending/all/${timeWindow}`, { page });
    return data?.results || [];
  },

  async getPopularMovies(page = 1) {
    const data = await tmdbFetch('/movie/popular', { page });
    return (data?.results || []).map(m => ({ ...m, media_type: 'movie' }));
  },

  async getTopRatedMovies(page = 1) {
    const data = await tmdbFetch('/movie/top_rated', { page });
    return (data?.results || []).map(m => ({ ...m, media_type: 'movie' }));
  },

  async getNowPlayingMovies(page = 1) {
    const data = await tmdbFetch('/movie/now_playing', { page });
    return (data?.results || []).map(m => ({ ...m, media_type: 'movie' }));
  },

  async getPopularTV(page = 1) {
    const data = await tmdbFetch('/tv/popular', { page });
    return (data?.results || []).map(m => ({ ...m, media_type: 'tv' }));
  },

  async getTopRatedTV(page = 1) {
    const data = await tmdbFetch('/tv/top_rated', { page });
    return (data?.results || []).map(m => ({ ...m, media_type: 'tv' }));
  },

  async getAnime(page = 1) {
    const data = await tmdbFetch('/discover/tv', {
      with_genres: '16',
      with_original_language: 'ja',
      sort_by: 'popularity.desc',
      page,
    });
    return (data?.results || []).map(m => ({ ...m, media_type: 'tv', isAnime: true }));
  },

  async getAnimeMovies(page = 1) {
    const data = await tmdbFetch('/discover/movie', {
      with_genres: '16',
      with_original_language: 'ja',
      sort_by: 'popularity.desc',
      page,
    });
    return (data?.results || []).map(m => ({ ...m, media_type: 'movie', isAnime: true }));
  },

  async getKDrama(page = 1) {
    const data = await tmdbFetch('/discover/tv', {
      with_original_language: 'ko',
      sort_by: 'popularity.desc',
      page,
    });
    return (data?.results || []).map(m => ({ ...m, media_type: 'tv', isDrama: true }));
  },

  async getCDrama(page = 1) {
    const data = await tmdbFetch('/discover/tv', {
      with_original_language: 'zh',
      sort_by: 'popularity.desc',
      page,
    });
    return (data?.results || []).map(m => ({ ...m, media_type: 'tv', isDrama: true }));
  },

  async getIndoMovies(page = 1) {
    const data = await tmdbFetch('/discover/movie', {
      with_original_language: 'id',
      sort_by: 'popularity.desc',
      page,
    });
    return (data?.results || []).map(m => ({ ...m, media_type: 'movie' }));
  },

  async getByGenre(genreId, mediaType = 'movie', page = 1) {
    const endpoint = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
    const data = await tmdbFetch(endpoint, {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page,
    });
    return (data?.results || []).map(m => ({ ...m, media_type: mediaType }));
  },

  async searchMulti(query, page = 1) {
    if (!query || !query.trim()) return [];
    const data = await tmdbFetch('/search/multi', {
      query: query.trim(),
      page,
      include_adult: false,
    });
    return (data?.results || []).filter(item => item.media_type === 'movie' || item.media_type === 'tv');
  },

  async getDetails(id, mediaType = 'movie') {
    const data = await tmdbFetch(`/${mediaType}/${id}`, {
      append_to_response: 'credits,videos,similar,recommendations',
    });
    return data;
  },

  async getSeasonDetails(tvId, seasonNumber = 1) {
    const data = await tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`);
    return data;
  }
};
