/**
 * Hardened LocalStorage Service for McMovies
 * Sanitizes URLs/strings on read & write, validates schemas, bounds list lengths,
 * and prevents localStorage tampering from overriding external API endpoints/keys.
 */

const KEYS = {
  WATCHLIST: 'mcmovies_watchlist',
  CONTINUE_WATCHING: 'mcmovies_continue_watching',
  SETTINGS: 'mcmovies_settings',
};

const MAX_WATCHLIST_ITEMS = 200;
const MAX_CONTINUE_WATCHING_ITEMS = 30;

function safeStorageGet(key) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage restriction errors in strict private modes
  }
}

function safeParse(str, fallback) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
}

export function sanitizeText(raw, maxLen = 200) {
  return String(raw ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeMediaUrl(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 1000) return '';
  if (s.startsWith('/') && !s.startsWith('//')) {
    return s;
  }
  if (/^https:\/\//i.test(s)) {
    try {
      const parsed = new URL(s);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
        return parsed.href;
      }
    } catch {
      return '';
    }
  }
  return '';
}

function sanitizeHttpsOnlyUrl(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 1500) return '';
  if (!/^https:\/\//i.test(s)) return '';
  try {
    const parsed = new URL(s);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
      return parsed.href;
    }
  } catch {
    return '';
  }
  return '';
}

function sanitizeStoredEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = sanitizeText(raw.id, 120);
  const title = sanitizeText(raw.title || raw.name, 160);
  if (!id || !title) return null;

  const mediaType = raw.media_type === 'tv' || raw.type === 'series' ? 'tv' : 'movie';
  const voteAvg = Number(raw.vote_average);
  const cleanVote = Number.isFinite(voteAvg) ? Math.min(10, Math.max(0, Number(voteAvg.toFixed(1)))) : 8.0;

  return {
    id,
    title,
    poster_path: sanitizeMediaUrl(raw.poster_path || raw.thumbnail),
    backdrop_path: sanitizeMediaUrl(raw.backdrop_path || raw.thumbnail),
    media_type: mediaType,
    vote_average: cleanVote,
    release_date: sanitizeText(raw.release_date || raw.first_air_date || '', 20),
    genres: Array.isArray(raw.genres)
      ? raw.genres
          .slice(0, 6)
          .map((g) => (typeof g === 'string' ? sanitizeText(g, 32) : g && typeof g === 'object' ? { id: g.id, name: sanitizeText(g.name, 32) } : null))
          .filter(Boolean)
      : [],
    isDubIndo: Boolean(raw.isDubIndo),
    savedAt: Number.isFinite(Number(raw.savedAt)) ? Number(raw.savedAt) : Date.now(),
    season: Math.max(1, Math.min(100, parseInt(raw.season, 10) || 1)),
    episode: Math.max(1, Math.min(2000, parseInt(raw.episode, 10) || 1)),
    currentTime: Number.isFinite(Number(raw.currentTime)) ? Math.max(0, Number(raw.currentTime)) : 0,
    duration: Number.isFinite(Number(raw.duration)) ? Math.max(0, Number(raw.duration)) : 0,
    progress: Number.isFinite(Number(raw.progress)) ? Math.min(100, Math.max(0, Number(raw.progress))) : 0,
    serverId: sanitizeText(raw.serverId || 'cloudx_hls', 40),
    streamUrl: sanitizeHttpsOnlyUrl(raw.streamUrl),
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
  };
}

const BLACKLIST_IDS = new Set([
  '961214', '338973', '1126357', '1119527', '1181068', '1300968',
  '1595124', '1551025', '1185344', '1562642', '1092622',
]);
const BLACKLIST_WORDS = [
  'reawakened', 'alas roban', 'kabut berduri', 'siksa kubur',
  'ipar adalah maut', 'guarding stars', 'ghost soldier', 'steps', 'the beast',
];

function isBlacklistedEntry(id, title) {
  if (BLACKLIST_IDS.has(String(id))) return true;
  const t = String(title || '').toLowerCase();
  return BLACKLIST_WORDS.some((w) => t.includes(w));
}

export const StorageService = {
  getWatchlist() {
    const raw = safeParse(safeStorageGet(KEYS.WATCHLIST), []);
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitizeStoredEntry).filter(Boolean).slice(0, MAX_WATCHLIST_ITEMS);
  },

  isInWatchlist(id) {
    const list = this.getWatchlist();
    return list.some((item) => String(item.id) === String(id));
  },

  isWatchlisted(id) {
    return this.isInWatchlist(id);
  },

  addToWatchlist(item) {
    if (!item || !item.id) return this.getWatchlist();
    const list = this.getWatchlist();
    if (!list.some((i) => String(i.id) === String(item.id))) {
      const clean = sanitizeStoredEntry({
        id: item.id,
        title: item.title || item.name,
        poster_path: item.poster_path || item.thumbnail,
        backdrop_path: item.backdrop_path || item.thumbnail,
        media_type: item.media_type || (item.category === 'Film Movie' ? 'movie' : 'tv'),
        vote_average: item.vote_average || 8.0,
        release_date: item.release_date || item.first_air_date || '',
        genres: item.genres || [],
        isDubIndo: Boolean(item.isDubIndo),
        savedAt: Date.now(),
      });
      if (!clean) return list;
      const updated = [clean, ...list].slice(0, MAX_WATCHLIST_ITEMS);
      safeStorageSet(KEYS.WATCHLIST, JSON.stringify(updated));
      return updated;
    }
    return list;
  },

  removeFromWatchlist(id) {
    const list = this.getWatchlist();
    const updated = list.filter((item) => String(item.id) !== String(id));
    safeStorageSet(KEYS.WATCHLIST, JSON.stringify(updated));
    return updated;
  },

  clearWatchlist() {
    safeStorageRemove(KEYS.WATCHLIST);
    return [];
  },

  toggleWatchlist(item) {
    if (!item || !item.id) return { inList: false, items: this.getWatchlist() };
    if (this.isInWatchlist(item.id)) {
      return { inList: false, items: this.removeFromWatchlist(item.id) };
    }
    return { inList: true, items: this.addToWatchlist(item) };
  },

  getContinueWatching() {
    const raw = safeParse(safeStorageGet(KEYS.CONTINUE_WATCHING), []);
    if (!Array.isArray(raw)) return [];
    return raw
      .map(sanitizeStoredEntry)
      .filter((i) => i && !isBlacklistedEntry(i.id, i.title))
      .slice(0, MAX_CONTINUE_WATCHING_ITEMS);
  },

  updateProgress(item, { season = 1, episode = 1, currentTime = 0, duration = 0, serverId = 'cloudx_hls' }) {
    if (!item || !item.id) return;
    if (isBlacklistedEntry(item.id, item.title || item.name)) return;

    const cleanEntry = sanitizeStoredEntry({
      id: item.id,
      title: item.title || item.name,
      poster_path: item.poster_path || item.thumbnail,
      backdrop_path: item.backdrop_path || item.thumbnail,
      media_type: item.media_type || 'movie',
      season,
      episode,
      currentTime,
      duration,
      progress: duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0,
      serverId,
      isDubIndo: Boolean(item.isDubIndo),
      streamUrl: item.streamUrl || '',
      updatedAt: Date.now(),
    });
    if (!cleanEntry) return;

    const list = this.getContinueWatching();
    const existingIndex = list.findIndex((i) => String(i.id) === String(cleanEntry.id));

    let updated;
    if (existingIndex >= 0) {
      updated = [...list];
      updated[existingIndex] = { ...updated[existingIndex], ...cleanEntry };
    } else {
      updated = [cleanEntry, ...list];
    }

    updated = updated.slice(0, MAX_CONTINUE_WATCHING_ITEMS);
    safeStorageSet(KEYS.CONTINUE_WATCHING, JSON.stringify(updated));
    return updated;
  },

  removeContinueWatching(id) {
    const list = this.getContinueWatching();
    const updated = list.filter((i) => String(i.id) !== String(id));
    safeStorageSet(KEYS.CONTINUE_WATCHING, JSON.stringify(updated));
    return updated;
  },

  clearContinueWatching() {
    safeStorageRemove(KEYS.CONTINUE_WATCHING);
    return [];
  },

  getSettings() {
    safeStorageRemove(KEYS.SETTINGS);
    return {
      autoplay: true,
      autoNext: true,
    };
  },

  saveSettings() {
    safeStorageRemove(KEYS.SETTINGS);
    return {
      autoplay: true,
      autoNext: true,
    };
  },
};
