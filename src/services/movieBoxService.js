/**
 * MovieBox API Service
 * Reference: https://api.sansekai.my.id/#/MovieBox
 * Supports custom self-hosted proxy with intelligent fallback to curated HD blockbusters
 */

import { StorageService } from './storageService';
import { TmdbService } from './tmdbService';

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
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      }
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`MovieBox API error HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`MovieBox endpoint ${endpoint} failed:`, err.message);
    return null;
  }
}

export const MovieBoxService = {
  async getHomepage() {
    const res = await apiFetch('/moviebox/homepage');
    const items = res?.data || res;
    if (Array.isArray(items) && items.length > 0) {
      return items;
    }

    // High-res curated fallback if upstream demo API is unavailable
    try {
      const fallback = await TmdbService.getTrending('week');
      return (fallback || []).map(m => ({
        id: m.id,
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

  async getIndoMovies() {
    const res = await apiFetch('/moviebox/indo-movies');
    const items = res?.data || res;
    if (Array.isArray(items) && items.length > 0) return items;

    try {
      const fallback = await TmdbService.discoverByGenre('movie', null);
      return (fallback || []).map(m => ({
        id: m.id,
        title: m.title,
        poster: m.poster_path ? TmdbService.getImageUrl(m.poster_path, 'w500') : '',
        rating: m.vote_average ? m.vote_average.toFixed(1) : '8.2',
        year: (m.release_date || '').slice(0, 4),
        type: 'movie',
        synopsis: m.overview || '',
      }));
    } catch (e) {
      return [];
    }
  },

  async getKDrama() {
    const res = await apiFetch('/moviebox/k-drama');
    const items = res?.data || res;
    if (Array.isArray(items) && items.length > 0) return items;

    try {
      const fallback = await TmdbService.getPopular('tv');
      return (fallback || []).map(m => ({
        id: m.id,
        title: m.name,
        poster: m.poster_path ? TmdbService.getImageUrl(m.poster_path, 'w500') : '',
        rating: m.vote_average ? m.vote_average.toFixed(1) : '8.6',
        year: (m.first_air_date || '').slice(0, 4),
        type: 'series',
        synopsis: m.overview || '',
      }));
    } catch (e) {
      return [];
    }
  },

  async search(query) {
    if (!query) return [];
    const res = await apiFetch('/moviebox/search', { query });
    const items = res?.data || res;
    if (Array.isArray(items) && items.length > 0) return items;

    try {
      const fallback = await TmdbService.searchMulti(query);
      return (fallback || []).map(m => ({
        id: m.id,
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
