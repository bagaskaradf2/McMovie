/**
 * CloudX Multi-Provider Service for McMovies
 * Integrates Indonesian & International streaming providers adapted from CloudX-V2:
 * - MovieBox Pro (Verified 4K Direct Streams & Full Movies)
 * - Idlix (Subtitle Indonesia Box Office & Series)
 * - KlikXXI (Bioskop Indonesia XXI & Hollywood)
 * - LayarKaca / LK21 (Film Bioskop Indonesia & Terpopuler)
 * - Ngefilm (Film Indonesia, Sinetron & Series Asia)
 * - PusatFilm / Savefilm (Pusat Film 21 & Series)
 * - Sflix Global (International Movies & Series)
 * - Dubbing Indonesia (Film Layar Lebar Suara Bahasa Indonesia)
 */

import { MovieBoxService } from './movieBoxService';
import { DubIndoService } from './dubIndoService';
import { TmdbService } from './tmdbService';

export const CLOUDX_PROVIDERS = [
  {
    id: 'all',
    name: 'Semua Provider',
    tag: '⚡ Multi-API CloudX',
    icon: 'Sparkles',
    badge: 'Semua',
    color: 'from-cyan-500 to-blue-600',
    border: 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10'
  },
  {
    id: 'moviebox',
    name: 'MovieBox',
    tag: '⚡ MovieBox',
    icon: 'Zap',
    badge: '⚡ MovieBox',
    description: 'Direct 4K Streams, Box Office & Netflix Original Series',
    color: 'from-amber-500 to-yellow-600',
    border: 'border-amber-500/30 text-amber-300 bg-amber-500/10'
  },
  {
    id: 'idlix',
    name: 'Idlix',
    tag: '🎬 Idlix',
    icon: 'Film',
    badge: '🎬 Idlix',
    description: 'Film Bioskop & Serial Subtitle Indonesia Terlengkap',
    color: 'from-emerald-500 to-teal-600',
    border: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
  },
  {
    id: 'klikxxi',
    name: 'KlikXXI',
    tag: '🍿 KlikXXI',
    icon: 'Clapperboard',
    badge: '🍿 KlikXXI',
    description: 'Streaming Film Bioskop & Series Indonesia XXI',
    color: 'from-rose-500 to-pink-600',
    border: 'border-rose-500/30 text-rose-300 bg-rose-500/10'
  },
  {
    id: 'layarkaca',
    name: 'LayarKaca (LK21)',
    tag: '🎥 LK21',
    icon: 'Tv',
    badge: '🎥 LK21',
    description: 'LayarKaca21 Film Bioskop Indonesia & Hollywood',
    color: 'from-blue-500 to-cyan-600',
    border: 'border-blue-500/30 text-blue-300 bg-blue-500/10'
  },
  {
    id: 'ngefilm',
    name: 'Ngefilm',
    tag: '🎞️ Ngefilm',
    icon: 'Video',
    badge: '🎞️ Ngefilm',
    description: 'Koleksi Film Indonesia, Horror, dan Series Asia',
    color: 'from-indigo-500 to-purple-600',
    border: 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10'
  },
  {
    id: 'pusatfilm',
    name: 'PusatFilm / Savefilm',
    tag: '💿 PusatFilm',
    icon: 'Disc',
    badge: '💿 PusatFilm',
    description: 'Pusat Film Bioskop 21 & Drama Terupdate',
    color: 'from-violet-500 to-fuchsia-600',
    border: 'border-violet-500/30 text-violet-300 bg-violet-500/10'
  },
  {
    id: 'sflix',
    name: 'Sflix Global',
    tag: '🌐 Sflix',
    icon: 'Globe',
    badge: '🌐 Sflix',
    description: 'Streaming Mancanegara Full HD & 4K',
    color: 'from-sky-500 to-blue-600',
    border: 'border-sky-500/30 text-sky-300 bg-sky-500/10'
  },
  {
    id: 'dubindo',
    name: 'Dub Indo',
    tag: '🇮🇩 Dub Indo',
    icon: 'Mic',
    badge: '🇮🇩 Dub Indo',
    description: 'Film Layar Lebar Suara Bahasa Indonesia Resmi',
    color: 'from-emerald-600 to-green-700',
    border: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
  }
];

let cachedCloudXCatalog = null;

export const CloudXService = {
  /**
   * Loads the pre-compiled, 100% verified CloudX provider catalog.
   */
  async getCatalog() {
    if (cachedCloudXCatalog) return cachedCloudXCatalog;
    try {
      const res = await fetch('/data/cloudx_catalog.json');
      if (res.ok) {
        cachedCloudXCatalog = await res.json();
        return cachedCloudXCatalog;
      }
    } catch (err) {
      console.warn('Failed to load /data/cloudx_catalog.json:', err);
    }
    return [];
  },

  /**
   * Retrieves items belonging to a specific provider.
   */
  async getByProvider(providerId) {
    if (providerId === 'moviebox') {
      const catalog = await MovieBoxService.getFullCatalog();
      if (!catalog) return [];
      const combined = [
        ...(catalog.indo_netflix || []),
        ...(catalog.trending_movies || []),
        ...(catalog.sinetron_series || [])
      ];
      return combined.map(i => ({ ...i, provider: 'moviebox', badge: '⚡ MovieBox' }));
    }

    if (providerId === 'dubindo') {
      const dubMovies = await DubIndoService.getTopMovies(60);
      return dubMovies.map(i => ({ ...i, provider: 'dubindo', badge: '🇮🇩 Dub Indo' }));
    }

    const all = await this.getCatalog();
    if (providerId === 'all') return all;
    return all.filter(i => i.provider === providerId);
  },

  /**
   * Searches across CloudX providers with optional provider filter.
   */
  async search(query, providerId = 'all') {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];

    // 1. If searching specifically for MovieBox
    if (providerId === 'moviebox') {
      const mbRes = await MovieBoxService.search(q);
      return (mbRes || []).map(i => ({
        ...i,
        provider: 'moviebox',
        badge: '⚡ MovieBox'
      }));
    }

    // 2. If searching specifically for Dub Indo
    if (providerId === 'dubindo') {
      const dubRes = await DubIndoService.searchDubIndo(q);
      return (dubRes || []).map(i => ({
        ...i,
        provider: 'dubindo',
        badge: '🇮🇩 Dub Indo'
      }));
    }

    // 3. Search in CloudX Catalog
    const cloudxItems = await this.getCatalog();
    let matchingCloudX = cloudxItems.filter(item => {
      const title = (item.title || item.original_title || '').toLowerCase();
      const overview = (item.overview || '').toLowerCase();
      const matchesText = title.includes(q) || overview.includes(q);
      if (providerId !== 'all') {
        return matchesText && item.provider === providerId;
      }
      return matchesText;
    });

    // If a specific provider was requested and we got matches, return immediately
    if (providerId !== 'all') {
      return matchingCloudX;
    }

    // 4. If providerId is 'all', aggregate MovieBox, Dub Indo, and TMDB
    const [mbRes, dubRes, tmdbRes] = await Promise.all([
      MovieBoxService.search(q).catch(() => []),
      DubIndoService.searchDubIndo(q).catch(() => []),
      TmdbService.searchMulti(q).catch(() => [])
    ]);

    const taggedMb = (mbRes || []).map(i => ({ ...i, provider: 'moviebox', badge: '⚡ MovieBox' }));
    const taggedDub = (dubRes || []).map(i => ({ ...i, provider: 'dubindo', badge: '🇮🇩 Dub Indo' }));
    const taggedTmdb = (tmdbRes || []).map(i => ({ ...i, provider: 'sflix', badge: '🌐 Sflix' }));

    // Merge and prioritize CloudX verified provider items and Dub Indo
    const combined = [
      ...matchingCloudX,
      ...taggedDub.slice(0, 8),
      ...taggedMb.slice(0, 8),
      ...taggedTmdb
    ];

    // Deduplicate by title/id
    const seen = new Set();
    const finalResults = [];

    for (const item of combined) {
      if (!item) continue;
      const key = (item.title || item.name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      if (key && !seen.has(key)) {
        seen.add(key);
        finalResults.push(item);
      }
    }

    return finalResults;
  },

  /**
   * Find item detail by ID from CloudX catalog
   */
  async getDetail(id) {
    const all = await this.getCatalog();
    return all.find(i => String(i.id) === String(id) || String(i.tmdbId) === String(id)) || null;
  }
};
