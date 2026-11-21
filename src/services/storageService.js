/**
 * LocalStorage Service for McMovies
 * No account / login needed. Persists user watchlist, watch history, and progress locally.
 */

const KEYS = {
  WATCHLIST: 'mcmovies_watchlist',
  CONTINUE_WATCHING: 'mcmovies_continue_watching',
  HISTORY: 'mcmovies_history',
  SETTINGS: 'mcmovies_settings',
};

// Safe JSON parser
function safeParse(str, fallback) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch (e) {
    console.error('Storage parse error:', e);
    return fallback;
  }
}

export const StorageService = {
  // Watchlist methods
  getWatchlist() {
    return safeParse(localStorage.getItem(KEYS.WATCHLIST), []);
  },

  isInWatchlist(id) {
    const list = this.getWatchlist();
    return list.some(item => String(item.id) === String(id));
  },

  isWatchlisted(id) {
    return this.isInWatchlist(id);
  },

  addToWatchlist(item) {
    const list = this.getWatchlist();
    if (!list.some(i => String(i.id) === String(item.id))) {
      const updated = [
        {
          id: item.id,
          title: item.title || item.name,
          poster_path: item.poster_path || item.thumbnail,
          backdrop_path: item.backdrop_path || item.thumbnail,
          media_type: item.media_type || (item.category === 'Film Movie' ? 'movie' : 'tv'),
          vote_average: item.vote_average || 8.0,
          release_date: item.release_date || item.first_air_date || '',
          genres: item.genres || [],
          isDubIndo: !!item.isDubIndo,
          savedAt: Date.now(),
        },
        ...list
      ];
      localStorage.setItem(KEYS.WATCHLIST, JSON.stringify(updated));
      return updated;
    }
    return list;
  },

  removeFromWatchlist(id) {
    const list = this.getWatchlist();
    const updated = list.filter(item => String(item.id) !== String(id));
    localStorage.setItem(KEYS.WATCHLIST, JSON.stringify(updated));
    return updated;
  },

  toggleWatchlist(item) {
    if (this.isInWatchlist(item.id)) {
      return { inList: false, items: this.removeFromWatchlist(item.id) };
    } else {
      return { inList: true, items: this.addToWatchlist(item) };
    }
  },

  // Continue Watching methods
  getContinueWatching() {
    const raw = safeParse(localStorage.getItem(KEYS.CONTINUE_WATCHING), []);
    // Filter out unreleased titles, obsolete trailers, and broken items
    const blacklist = ['961214', '338973', '1126357', '1119527', '1181068', '1300968', '1595124', '1551025', '1185344', '1562642', '1092622'];
    const blacklistWords = ['reawakened', 'alas roban', 'kabut berduri', 'siksa kubur', 'ipar adalah maut', 'guarding stars', 'ghost soldier', 'steps', 'the beast'];
    return raw.filter(i => {
      if (blacklist.includes(String(i.id))) return false;
      const t = (i.title || '').toLowerCase();
      if (blacklistWords.some(w => t.includes(w))) return false;
      return true;
    });
  },

  updateProgress(item, { season = 1, episode = 1, currentTime = 0, duration = 0, serverId = 'moviebox_direct' }) {
    if (!item) return;
    const blacklist = ['961214', '338973', '1126357', '1119527', '1181068', '1300968', '1595124', '1551025', '1185344', '1562642', '1092622'];
    const blacklistWords = ['reawakened', 'alas roban', 'kabut berduri', 'siksa kubur', 'ipar adalah maut', 'guarding stars', 'ghost soldier', 'steps', 'the beast'];
    if (blacklist.includes(String(item.id))) return;
    const t = (item.title || item.name || '').toLowerCase();
    if (blacklistWords.some(w => t.includes(w))) return;

    const list = this.getContinueWatching();
    const existingIndex = list.findIndex(i => String(i.id) === String(item.id));
    
    const entry = {
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
      isDubIndo: !!item.isDubIndo,
      streamUrl: item.streamUrl || '',
      updatedAt: Date.now(),
    };

    let updated;
    if (existingIndex >= 0) {
      updated = [...list];
      updated[existingIndex] = { ...updated[existingIndex], ...entry };
    } else {
      updated = [entry, ...list];
    }

    // Limit to latest 30 continue watching items
    updated = updated.slice(0, 30);
    localStorage.setItem(KEYS.CONTINUE_WATCHING, JSON.stringify(updated));
    return updated;
  },

  removeContinueWatching(id) {
    const list = this.getContinueWatching();
    const updated = list.filter(i => String(i.id) !== String(id));
    localStorage.setItem(KEYS.CONTINUE_WATCHING, JSON.stringify(updated));
    return updated;
  },

  // Settings & Preferences
  getSettings() {
    return safeParse(localStorage.getItem(KEYS.SETTINGS), {
      preferredServer: 'vidlink',
      defaultAudio: 'all',
      tmdbApiKey: '',
      movieBoxApiUrl: 'https://api.sansekai.my.id/api',
      autoplay: true,
      autoNext: true,
    });
  },

  saveSettings(newSettings) {
    const current = this.getSettings();
    const merged = { ...current, ...newSettings };
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(merged));
    return merged;
  }
};
