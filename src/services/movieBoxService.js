/**
 * MovieBox API & Scraped Catalog Service
 * Connects directly to the live MovieBox backend API (https://h5-api.aoneroom.com/wefeed-h5api-bff)
 * and falls back seamlessly to the verified local scraped catalog (public/data/moviebox_catalog.json).
 *
 * Covers:
 * - Trending Drama 🔥 (Korean, Chinese, Indonesian, Western dramas)
 * - Trending Movies (Blockbusters with Limited Free badges)
 * - Film & Series Indonesia Terbaru di Netflix 🇮🇩 (The Shadow Strays, Kabut Berduri, Sekawan Limo, dll)
 * - Sinetron & Series Indonesia Populer (Terbaik Itu Kamu, Bound by Promise, Main Belakang, Serigala Terakhir, dll)
 */

import { TmdbService } from './tmdbService';

let cachedCatalog = null;
let guestToken = null;
let tokenExpiresAt = 0;

const AONEROOM_BASE = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';

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

// Fetches a guest token from the live MovieBox home endpoint
async function getGuestToken() {
  const now = Date.now();
  if (guestToken && now < tokenExpiresAt) {
    return guestToken;
  }

  try {
    const res = await fetch(`${AONEROOM_BASE}/home?host=moviebox01.com`, {
      headers: {
        'Origin': 'https://moviebox01.com',
        'Referer': 'https://moviebox01.com/'
      }
    });

    if (res.ok) {
      // In browser, cookies are handled by browser, but if an auth token is in response or headers:
      const authHeader = res.headers.get('authorization') || res.headers.get('x-token');
      if (authHeader) {
        guestToken = authHeader.replace(/^Bearer\s+/i, '');
        tokenExpiresAt = now + 3600000;
        return guestToken;
      }
    }
  } catch (err) {
    console.warn('Could not refresh MovieBox guest token:', err);
  }

  return guestToken;
}

export const MovieBoxService = {
  // Returns the entire organized catalog
  async getFullCatalog() {
    return await loadLocalCatalog();
  },

  // Trending Drama (Exact match to MovieBox reference image)
  async getTrendingDrama() {
    const catalog = await loadLocalCatalog();
    if (catalog?.trending_drama?.length > 0) return catalog.trending_drama;
    return [];
  },

  // Trending Movies (with Limited Free badges)
  async getTrendingMovies() {
    const catalog = await loadLocalCatalog();
    if (catalog?.trending_movies?.length > 0) return catalog.trending_movies;
    return [];
  },

  // Dedicated Rail / Filter: Film & Series Indonesia Terbaru di Netflix
  async getIndoNetflix() {
    const catalog = await loadLocalCatalog();
    if (catalog?.indo_netflix) return catalog.indo_netflix;

    try {
      const fallback = await TmdbService.discoverByGenre('movie', null);
      return (fallback || []).map(m => ({
        id: m.id,
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

  // Cross-category search connecting directly to MovieBox live search + local catalog
  async search(query) {
    if (!query) return [];
    const qLower = query.toLowerCase().trim();

    // 1. Search local scraped catalog first for instant response
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

    // 2. Query live MovieBox API search
    try {
      const token = await getGuestToken();
      const headers = {
        'Content-Type': 'application/json',
        'Origin': 'https://moviebox01.com',
        'Referer': 'https://moviebox01.com/'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${AONEROOM_BASE}/subject/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          keyword: query,
          page: 1,
          perPage: 12,
          subjectType: 0
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data?.items)) {
          const liveResults = json.data.items.map(i => ({
            id: i.tmdbId || i.subjectId,
            subjectId: i.subjectId,
            tmdbId: i.tmdbId,
            title: i.title,
            original_title: i.title,
            poster: i.cover?.url || '',
            rating: i.imdbRatingValue || 7.5,
            year: (i.releaseDate || '').slice(0, 4),
            type: i.subjectType === 2 ? 'series' : 'movie',
            media_type: i.subjectType === 2 ? 'tv' : 'movie',
            badge: 'MovieBox Live',
            synopsis: i.description || '',
            detailPath: i.detailPath,
            movieboxEmbedUrl: `https://moviebox01.com/movies/${i.detailPath}?id=${i.subjectId}&type=/movie/detail`
          }));

          // Merge local and live results without duplicates
          const seenIds = new Set(localMatches.map(m => String(m.id || m.subjectId)));
          for (const item of liveResults) {
            const key = String(item.id || item.subjectId);
            if (!seenIds.has(key)) {
              seenIds.add(key);
              localMatches.push(item);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Live MovieBox search error:', e);
    }

    if (localMatches.length > 0) {
      return localMatches;
    }

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
    const cleanId = String(id).replace(/^moviebox_/, '').trim();

    const catalog = await loadLocalCatalog();
    if (catalog) {
      const allItems = [
        ...(catalog.trending_drama || []),
        ...(catalog.trending_movies || []),
        ...(catalog.indo_netflix || []),
        ...(catalog.sinetron_series || [])
      ];
      const found = allItems.find(i => 
        String(i.id) === cleanId || 
        String(i.tmdbId) === cleanId || 
        String(i.subjectId) === cleanId ||
        (i.detailPath && i.detailPath.toLowerCase() === cleanId.toLowerCase()) ||
        (i.title && i.title.toLowerCase() === cleanId.toLowerCase())
      );
      if (found) return found;
    }

    return null;
  }
};
