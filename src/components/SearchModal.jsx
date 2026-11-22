import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Film, Tv, Sparkles, Globe, Filter, Zap, Clapperboard, Video, Disc, Mic } from 'lucide-react';
import { TmdbService } from '../services/tmdbService';
import { DubIndoService } from '../services/dubIndoService';
import { MovieBoxService } from '../services/movieBoxService';
import { CloudXService, CLOUDX_PROVIDERS } from '../services/cloudXService';
import MovieCard from './MovieCard';

// Smart normalizer to group series episodes/seasons under a single unified title
function normalizeSeriesTitle(rawTitle) {
  if (!rawTitle) return '';
  let title = rawTitle.toLowerCase();
  return title
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

// Groups separated episodes/seasons into a single consolidated master series card
function mergeAndDeduplicateSeries(items) {
  if (!Array.isArray(items)) return [];

  const seenMap = new Map();
  const result = [];

  for (const item of items) {
    if (!item) continue;
    const isSeries = item.media_type === 'tv' || item.category === 'Film Series' || (item.episodes && item.episodes.length > 0) || Boolean(item.first_air_date);

    if (isSeries) {
      const rawTitle = item.title || item.name || '';
      const normTitle = normalizeSeriesTitle(rawTitle);
      const groupKey = item.tmdbId ? `tmdb_${item.tmdbId}` : `series_${normTitle}`;

      if (seenMap.has(groupKey)) {
        // Merge into existing series item
        const existing = seenMap.get(groupKey);
        if (!existing.poster_path && item.poster_path) {
          existing.poster_path = item.poster_path;
        }
        if (!existing.isDubIndo && item.isDubIndo) {
          existing.hasDubIndo = true;
        }
        if (item.episodes && Array.isArray(item.episodes)) {
          existing.episodes = [...(existing.episodes || []), ...item.episodes];
        }
        continue;
      } else {
        const mergedItem = { ...item, media_type: 'tv' };
        seenMap.set(groupKey, mergedItem);
        result.push(mergedItem);
      }
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
  'Serangan Balik',
  'The Odyssey',
  'Steps',
  'Ghost in the Cell',
  'Alas Roban',
  'Abadi Nan Jaya',
  'Siksa Kubur',
  'Kabut Berduri',
  'MobLand',
  'Agak Laen',
  'Gadis Kretek',
  'Sajadah Panjang'
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
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // When selectedProvider changes without query, load curated provider items for browsing
  useEffect(() => {
    if (!query.trim()) {
      if (selectedProvider !== 'all') {
        setLoading(true);
        CloudXService.getByProvider(selectedProvider)
          .then((items) => {
            setResults(items || []);
          })
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
        const deduplicated = mergeAndDeduplicateSeries(searchRes);
        setResults(deduplicated);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selectedProvider]);

  const handleQuickTagClick = (tag) => {
    setQuery(tag);
  };

  const currentProviderObj = CLOUDX_PROVIDERS.find(p => p.id === selectedProvider) || CLOUDX_PROVIDERS[0];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-2xl animate-fadeIn p-3 sm:p-6 md:p-8 overflow-hidden">
      <div className="max-w-6xl w-full mx-auto flex flex-col h-full">
        {/* Search Bar Header */}
        <div className="relative flex items-center gap-3 bg-zinc-900/90 border border-white/10 rounded-2xl p-2.5 sm:p-3 shadow-2xl backdrop-blur-md">
          <Search className="w-5 h-5 sm:w-6 sm:h-6 text-white ml-2 flex-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari film bioskop, series Indo, Netflix, anime, atau judul dubbing..."
            className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm sm:text-base outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 sm:px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-200 hover:text-white text-xs font-semibold active:scale-95 transition-all"
          >
            Tutup
          </button>
        </div>

        {/* CloudX Provider Filter Pills (Separation by API Provider) */}
        <div className="my-3">
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-zinc-400" />
              <span>Pilih Sumber API / Provider (CloudX):</span>
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {CLOUDX_PROVIDERS.map((provider) => {
              const isSelected = selectedProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  onClick={() => setSelectedProvider(provider.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-white text-black font-extrabold shadow-lg scale-[1.02]'
                      : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-white/10'
                  }`}
                >
                  <span>{provider.tag || provider.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Suggestion Chips */}
        {!query && selectedProvider === 'all' && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-zinc-400 mb-2 px-1">Paling Sering Dicari:</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleQuickTagClick(tag)}
                  className="px-3 py-1 rounded-lg text-xs bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 transition-all active:scale-95"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status / Provider Info Banner */}
        {selectedProvider !== 'all' && !loading && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/10 flex items-center justify-between text-xs text-zinc-300">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sumber Aktif: <strong>{currentProviderObj.name}</strong> ({currentProviderObj.description || 'Database Film'})</span>
            </span>
            <span className="text-zinc-500 text-[11px] font-medium">{results.length} judul tersedia</span>
          </div>
        )}

        {/* Results Scroll Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2">
          {loading ? (
            <div className="py-24 text-center text-zinc-400 text-sm animate-pulse flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              <span>Mencari film di katalog {currentProviderObj.name}...</span>
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 pb-12">
              {results.map((item) => (
                <MovieCard
                  key={`${item.id}-${item.provider || 'gen'}`}
                  item={item}
                  className="w-full"
                  onClick={onMovieClick}
                  onPlay={onPlayClick}
                  isWatchlisted={watchlistIds.has(String(item.id))}
                  onToggleWatchlist={onToggleWatchlist}
                />
              ))}
            </div>
          ) : query ? (
            <div className="py-24 text-center text-zinc-400 text-sm">
              <p className="font-semibold text-white mb-1">Tidak ditemukan film dengan kata kunci "{query}"</p>
              <p className="text-zinc-500 text-xs">Coba ganti kata kunci atau pilih filter "Semua Provider" di atas.</p>
            </div>
          ) : selectedProvider === 'all' ? (
            <div className="py-24 text-center text-zinc-500 text-sm">
              Ketik judul film bioskop, series Indonesia, atau pilih salah satu provider di atas.
            </div>
          ) : (
            <div className="py-24 text-center text-zinc-500 text-sm">
              Belum ada film untuk ditampilkan dari provider ini. Ketik judul di kolom pencarian.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
