/**
 * MovieBox API & Scraped Catalog Service
 * Reference: https://api.sansekai.my.id/#/MovieBox
 * Provides comprehensive access to Trending Drama, Trending Movies,
 * Film & Series Indonesia Terbaru di Netflix, and Sinetron Indonesia.
 */

import { StorageService } from './storageService';
import { TmdbService } from './tmdbService';

let cachedCatalog = null;

async function loadLocalCatalog() {
  if (cachedCatalog) return cachedCatalog;
  try {
    const res = await fetch('/data/moviebox_catalog.json');
    if (res.ok) {
      cachedCatalog = await res.json();
      return cachedCatalog;
    }
  } catch (err) {
    console.warn('Could not load local moviebox_catalog.json:', err);
  }
  return null;
}

function getBaseUrl() {
  const settings = StorageService.getSettings();
  return (settings?.movieBoxApiUrl || 'https://api.sansekai.my.id/api').replace(/\/+$/, '');
}

async function apiFetch(endpoint, params = {}) {
  const base = getBaseUrl();
  const url = new URL(`${base}${endpoint}`);
  Object.keys(params).forEach(k => {
    if (params[k] !== undefined && params[k] !== null) {
      url.searchParams.append(k, params[k]);
    }
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      }
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`MovieBox API HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    // Graceful fallback to scraped catalog
    return null;
  }
}

export const MovieBoxService = {
  // Returns the entire organized catalog
  async getFullCatalog() {
    return await loadLocalCatalog();
  },

  // Trending Drama (Exact match to MovieBox reference image)
  async getTrendingDrama() {
    const catalog = await loadLocalCatalog();
    if (catalog?.trending_drama) return catalog.trending_drama;

    const res = await apiFetch('/moviebox/trending-drama');
    return res?.data || res || [];
  },

  // Trending Movies (with Limited Free badges)
  async getTrendingMovies() {
    const catalog = await loadLocalCatalog();
    if (catalog?.trending_movies) return catalog.trending_movies;

    const res = await apiFetch('/moviebox/trending-movies');
    return res?.data || res || [];
  },

  // Dedicated Rail / Filter: Film & Series Indonesia Terbaru di Netflix
  async getIndoNetflix() {
    const catalog = await loadLocalCatalog();
    if (catalog?.indo_netflix) return catalog.indo_netflix;

    // TMDB fallback for Indonesian releases
    try {
      const fallback = await TmdbService.discoverByGenre('movie', null);
      return (fallback || []).map(m => ({
        id: `in_${m.id}`,
        tmdbId: m.id,
        title: m.title,
        poster: m.poster_path ? TmdbService.getImageUrl(m.poster_path, 'w500') : '',
        rating: m.vote_average ? m.vote_average.toFixed(1) : '8.2',
        year: (m.release_date || '').slice(0, 4),
        type: 'movie',
        badge: 'Netflix',
        synopsis: m.overview || '',
      }));
    } catch (e) {
      return [];
    }
  },

  // Dedicated Rail: Sinetron & Series Indonesia Populer
  async getIndoSeries() {
    const catalog = await loadLocalCatalog();
    if (catalog?.sinetron_series) return catalog.sinetron_series;

    return [];
  },

  // Full Feed for Homepage
  async getHomepage() {
    const catalog = await loadLocalCatalog();
    if (catalog) {
      return [
        ...(catalog.trending_drama || []),
        ...(catalog.trending_movies || []),
        ...(catalog.indo_netflix || []),
        ...(catalog.sinetron_series || [])
      ];
    }

    const res = await apiFetch('/moviebox/homepage');
    const items = res?.data || res;
    if (Array.isArray(items) && items.length > 0) return items;

    try {
      const fallback = await TmdbService.getTrending('week');
      return (fallback || []).map(m => ({
        id: m.id,
        tmdbId: m.id,
        title: m.title || m.name,
        poster: m.poster_path ? TmdbService.getImageUrl(m.poster_path, 'w500') : '',
        rating: m.vote_average ? m.vote_average.toFixed(1) : '8.5',
        year: (m.release_date || m.first_air_date || '').slice(0, 4),
        type: m.media_type === 'tv' ? 'series' : 'movie',
        synopsis: m.overview || '',
      }));
    } catch (e) {
      return [];
    }
  },

  async getHollywoodMovies() {
    const res = await apiFetch('/moviebox/hollywood-movies');
    const items = res?.data || res;
    if (Array.isArray(items) && items.length > 0) return items;

    try {
      const fallback = await TmdbService.getPopular('movie');
      return (fallback || []).map(m => ({
        id: m.id,
        tmdbId: m.id,
        title: m.title,
        poster: m.poster_path ? TmdbService.getImageUrl(m.poster_path, 'w500') : '',
        rating: m.vote_average ? m.vote_average.toFixed(1) : '8.0',
        year: (m.release_date || '').slice(0, 4),
        type: 'movie',
        synopsis: m.overview || '',
      }));
    } catch (e) {
      return [];
    }
  },

  // Cross-category search
  async search(query) {
    if (!query) return [];
    const qLower = query.toLowerCase().trim();

    // 1. Search local scraped catalog first
    const catalog = await loadLocalCatalog();
    const localMatches = [];
    if (catalog) {
      const allItems = [
        ...(catalog.trending_drama || []),
        ...(catalog.trending_movies || []),
        ...(catalog.indo_netflix || []),
        ...(catalog.sinetron_series || [])
      ];

      for (const item of allItems) {
        if (
          item.title?.toLowerCase().includes(qLower) ||
          item.original_title?.toLowerCase().includes(qLower) ||
          item.category?.toLowerCase().includes(qLower) ||
          item.synopsis?.toLowerCase().includes(qLower)
        ) {
          localMatches.push(item);
        }
      }
    }

    if (localMatches.length > 0) {
      return localMatches;
    }

    // 2. Try remote API
    const res = await apiFetch('/moviebox/search', { query });
    const items = res?.data || res;
    if (Array.isArray(items) && items.length > 0) return items;

    // 3. Fallback to TMDB
    try {
      const fallback = await TmdbService.searchMulti(query);
      return (fallback || []).map(m => ({
        id: m.id,
        tmdbId: m.id,
        title: m.title || m.name,
        poster: m.poster_path ? TmdbService.getImageUrl(m.poster_path, 'w500') : '',
        rating: m.vote_average ? m.vote_average.toFixed(1) : '8.0',
        year: (m.release_date || m.first_air_date || '').slice(0, 4),
        type: m.media_type === 'tv' ? 'series' : 'movie',
        synopsis: m.overview || '',
      }));
    } catch (e) {
      return [];
    }
  },

  async getDetail(id) {
    if (!id) return null;

    const catalog = await loadLocalCatalog();
    if (catalog) {
      const allItems = [
        ...(catalog.trending_drama || []),
        ...(catalog.trending_movies || []),
        ...(catalog.indo_netflix || []),
        ...(catalog.sinetron_series || [])
      ];
      const found = allItems.find(i => String(i.id) === String(id) || String(i.tmdbId) === String(id));
      if (found) return found;
    }

    const res = await apiFetch('/moviebox/detail', { id });
    return res?.data || res || null;
  },

  async getDownloadUrl(id) {
    if (!id) return null;
    const res = await apiFetch('/moviebox/get-download-url', { id });
    return res?.data || res || null;
  },

  getProxyVideoUrl(rawCdnUrl) {
    if (!rawCdnUrl) return '';
    const base = getBaseUrl();
    return `${base}/moviebox/proxy-video?url=${encodeURIComponent(rawCdnUrl)}`;
  }
};