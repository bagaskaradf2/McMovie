import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { CloudXService, CLOUDX_PROVIDERS } from '../services/cloudXService';
import MovieCard from './MovieCard';

function normalizeSeriesTitle(rawTitle) {
  if (!rawTitle) return '';
  return rawTitle
    .toLowerCase()
    .replace(/\b(season|s)\s*\d+\b/gi, '')
    .replace(/\b(episode|ep)\s*\d+\b/gi, '')
    .replace(/\bpart\s*\d+\b/gi, '')
    .replace(/\b(dub\s*indo|dubbing\s*indonesia|indonesian\s*dub)\b/gi, '')
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/[:\-–—]\s*(the\s*)?(final|first|second|third|fourth)?\s*(season|part|arc)?$/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeAndDeduplicateSeries(items) {
  if (!Array.isArray(items)) return [];
  const seenMap = new Map();
  const result = [];

  for (const item of items) {
    if (!item) continue;
    const isSeries =
      item.media_type === 'tv' ||
      item.category === 'Film Series' ||
      (item.episodes && item.episodes.length > 0) ||
      Boolean(item.first_air_date);

    if (isSeries) {
      const normTitle = normalizeSeriesTitle(item.title || item.name || '');
      const groupKey = item.tmdbId ? `tmdb_${item.tmdbId}` : `series_${normTitle}`;
      if (seenMap.has(groupKey)) {
        const existing = seenMap.get(groupKey);
        if (!existing.poster_path && item.poster_path) existing.poster_path = item.poster_path;
        if (!existing.isDubIndo && item.isDubIndo) existing.hasDubIndo = true;
        if (item.episodes && Array.isArray(item.episodes)) {
          existing.episodes = [...(existing.episodes || []), ...item.episodes];
        }
        continue;
      }
      const mergedItem = { ...item, media_type: 'tv' };
      seenMap.set(groupKey, mergedItem);
      result.push(mergedItem);
    } else {
      const rawTitle = (item.title || item.name || '').toLowerCase().trim();
      const movieKey = item.id ? `movie_${item.id}` : `movie_${rawTitle}`;
      if (!seenMap.has(movieKey)) {
        seenMap.set(movieKey, item);
        result.push(item);
      }
    }
  }
  return result;
}

const QUICK_TAGS = [
  'Spider-Man: Brand New Day',
  'The Odyssey',
  'Serangan Balik',
  'Ghost in the Cell',
  'Avengers: Endgame',
  'Abadi Nan Jaya',
  'SpongeBob',
  'Money Heist',
];

export default function SearchModal({
  onClose,
  onMovieClick,
  onPlayClick,
  watchlistIds = new Set(),
  onToggleWatchlist,
}) {
  const [query, setQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setActiveIndex(-1);
    if (!query.trim()) {
      if (selectedProvider !== 'all') {
        setLoading(true);
        CloudXService.getByProvider(selectedProvider)
          .then((items) => setResults(items || []))
          .catch(() => setResults([]))
          .finally(() => setLoading(false));
      } else {
        setResults([]);
        setLoading(false);
      }
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const searchRes = await CloudXService.search(query, selectedProvider);
        setResults(mergeAndDeduplicateSeries(searchRes));
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query, selectedProvider]);

  const handleInputKeyDown = (e) => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(results.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) {
      e.preventDefault();
      onMovieClick(results[activeIndex]);
    }
  };

  const currentProviderObj =
    CLOUDX_PROVIDERS.find((p) => p.id === selectedProvider) || CLOUDX_PROVIDERS[0];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 backdrop-blur-md p-3 sm:p-6 pt-14 sm:pt-20 overflow-hidden"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl rounded-2xl glass-dock animate-modal-pop flex flex-col max-h-[82vh] overflow-hidden"
      >
        {/* Top Command Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08]">
          <Search className="w-4 h-4 text-zinc-400 flex-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Cari film bioskop, series, anime, atau judul dub indo..."
            className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              title="Hapus"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2 py-0.5 rounded-md bg-white/[0.08] hover:bg-white/[0.16] border border-white/10 text-[10px] font-semibold text-zinc-300 transition-colors"
          >
            ESC
          </button>
        </div>

        {/* CloudX Provider Filter Pills */}
        <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {CLOUDX_PROVIDERS.map((provider) => {
            const isSelected = selectedProvider === provider.id;
            const cleanLabel = (provider.name || '').replace(/\s*\(LK21\)/i, '');
            return (
              <button
                key={provider.id}
                onClick={() => setSelectedProvider(provider.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-white text-black shadow-sm'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.06]'
                }`}
              >
                {cleanLabel}
              </button>
            );
          })}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {!query && selectedProvider === 'all' && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
                Pencarian Populer
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="px-3 py-1.5 rounded-full text-xs bg-white/[0.06] hover:bg-white/[0.14] text-zinc-200 border border-white/[0.08] transition-all active:scale-95"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-zinc-400 text-xs flex flex-col items-center gap-3">
              <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              <span>Mencari di katalog {currentProviderObj.name}...</span>
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {results.map((item, idx) => (
                <div
                  key={`${item.id}-${item.provider || 'gen'}-${idx}`}
                  className={
                    activeIndex === idx ? 'ring-2 ring-white rounded-xl p-0.5 transition-all' : ''
                  }
                >
                  <MovieCard
                    item={item}
                    variant="poster"
                    className="w-full"
                    onClick={onMovieClick}
                    onPlay={onPlayClick}
                    isWatchlisted={watchlistIds.has(String(item.id))}
                    onToggleWatchlist={onToggleWatchlist}
                  />
                </div>
              ))}
            </div>
          ) : query ? (
            <div className="py-16 text-center text-zinc-400 text-sm">
              <p className="font-semibold text-white mb-1">Tidak ditemukan hasil untuk "{query}"</p>
              <p className="text-zinc-500 text-xs">
                Coba ubah kata kunci atau pilih "Semua Provider".
              </p>
            </div>
          ) : (
            <div className="py-14 text-center text-zinc-500 text-xs">
              Ketik judul film atau series, atau pilih filter provider di atas.
            </div>
          )}
        </div>

        {/* Footer Keyboard Hints */}
        <div className="px-4 py-2.5 border-t border-white/[0.08] bg-black/25 flex items-center justify-between text-[11px] text-zinc-400">
          <div className="hidden sm:flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-zinc-200">↑↓</kbd> navigasi
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-zinc-200">↵</kbd> buka
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-zinc-200">esc</kbd> tutup
            </span>
          </div>
          <span className="ml-auto text-zinc-300 font-medium">
            {results.length > 0 ? `${results.length} hasil ditemukan` : currentProviderObj.name}
          </span>
        </div>
      </div>
    </div>
  );
}
