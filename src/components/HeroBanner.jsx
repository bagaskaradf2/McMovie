import React, { useState, useEffect } from 'react';
import { Play, Info, Plus, Check, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { TmdbService } from '../services/tmdbService';

export default function HeroBanner({
  items = [],
  onPlayClick,
  onInfoClick,
  watchlistIds = new Set(),
  onToggleWatchlist,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const heroPool = (items || []).filter((it) => it && (it.backdrop_path || it.thumbnail)).slice(0, 5);

  useEffect(() => {
    if (heroPool.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % heroPool.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [heroPool.length]);

  useEffect(() => {
    if (currentIndex >= heroPool.length) setCurrentIndex(0);
  }, [heroPool.length, currentIndex]);

  if (heroPool.length === 0) return null;

  const safeIdx = currentIndex % heroPool.length;
  const current = heroPool[safeIdx];
  const title = current.title || current.name || 'Untitled Feature';
  const rawBackdrop = current.backdrop_path || current.thumbnail;
  const backdropUrl = current.isDubIndo
    ? current.thumbnail || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1280&auto=format&fit=crop&q=80'
    : TmdbService.getBackdropUrl(rawBackdrop, 'original');

  const releaseDate = current.release_date || current.first_air_date || '';
  const year = releaseDate ? releaseDate.slice(0, 4) : (current.year || '2026');
  const rating = current.vote_average ? Number(current.vote_average).toFixed(1) : '8.2';
  const overview =
    current.overview ||
    current.description ||
    'Saksikan tayangan streaming terbaik kualitas HD & 4K langsung di pemutar CinemaOS McMovies tanpa iklan.';
  const isSaved = watchlistIds.has(String(current.id));
  const isSeries = current.media_type === 'tv' || current.category === 'Film Series';

  return (
    <div className="group relative w-full h-[70vh] sm:h-[78vh] max-h-[760px] overflow-hidden bg-[#060709]">
      {/* Background Backdrop Image */}
      <div className="absolute inset-0 z-0">
        <img
          key={backdropUrl}
          src={backdropUrl}
          alt={title}
          className="w-full h-full object-cover object-center filter brightness-[0.78] transition-opacity duration-700"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src =
              'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1280&auto=format&fit=crop&q=80';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060709] via-[#060709]/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060709] via-[#060709]/80 to-transparent w-full md:w-2/3" />
      </div>

      {/* Left/Right Slide Arrows (desktop hover) */}
      {heroPool.length > 1 && (
        <>
          <button
            onClick={() => setCurrentIndex((prev) => (prev - 1 + heroPool.length) % heroPool.length)}
            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 border border-white/15 text-white items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md"
            aria-label="Slide sebelumnya"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % heroPool.length)}
            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 border border-white/15 text-white items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md"
            aria-label="Slide berikutnya"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Hero Content */}
      <div className="relative z-10 h-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-12 sm:pb-16">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 mb-3.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-white/15 text-white border border-white/15 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span>TRENDING #{safeIdx + 1} • NOV 2026</span>
            </span>

            {current.isDubIndo ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
                Dub Indo
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-black/45 text-zinc-200 border border-white/10 backdrop-blur-md">
                {isSeries ? 'Serial TV' : 'Film Bioskop'}
              </span>
            )}

            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/50 text-amber-400 border border-white/10 backdrop-blur-md text-xs font-semibold">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{rating}</span>
            </div>

            {year && <span className="text-xs font-medium text-zinc-400 ml-0.5">{year}</span>}
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.05] drop-shadow-md">
            {title}
          </h1>

          <p className="mt-3 text-xs sm:text-sm md:text-base text-zinc-300 line-clamp-2 sm:line-clamp-3 leading-relaxed drop-shadow max-w-xl font-normal">
            {overview}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onPlayClick && onPlayClick(current)}
              className="flex items-center gap-2.5 px-7 py-3 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold text-sm sm:text-base shadow-2xl transition-all duration-200 hover:scale-[1.03] active:scale-95"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>Tonton Sekarang</span>
            </button>

            <button
              onClick={() => onInfoClick && onInfoClick(current)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-sm sm:text-base backdrop-blur-md transition-all active:scale-95"
            >
              <Info className="w-4 h-4 text-zinc-300" />
              <span>Detail Film</span>
            </button>

            <button
              onClick={() => onToggleWatchlist && onToggleWatchlist(current)}
              className={`p-3 rounded-xl border backdrop-blur-md transition-all active:scale-95 ${
                isSaved
                  ? 'bg-white text-black border-white shadow-xl'
                  : 'bg-white/10 border-white/15 text-white hover:bg-white/15'
              }`}
              title={isSaved ? 'Hapus dari Watchlist' : 'Tambah ke Watchlist'}
            >
              {isSaved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Thumbnail Slide Switcher */}
        <div className="hidden lg:flex items-center gap-2.5 absolute bottom-12 right-8 z-20">
          {heroPool.map((item, idx) => {
            const isActive = idx === safeIdx;
            const thumbUrl = item.isDubIndo
              ? item.thumbnail || ''
              : TmdbService.getImageUrl(item.backdrop_path || item.poster_path, 'w500');

            return (
              <button
                key={item.id || idx}
                onClick={() => setCurrentIndex(idx)}
                className={`relative w-16 h-10 rounded-lg overflow-hidden border transition-all ${
                  isActive
                    ? 'border-white scale-110 shadow-xl ring-2 ring-white/30'
                    : 'border-white/10 opacity-45 hover:opacity-100 hover:scale-105'
                }`}
              >
                <img src={thumbUrl} alt={item.title || item.name} className="w-full h-full object-cover" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Dots */}
      <div className="lg:hidden absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-20">
        {heroPool.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`h-1 rounded-full transition-all ${idx === safeIdx ? 'w-6 bg-white' : 'w-2 bg-zinc-600'}`}
          />
        ))}
      </div>
    </div>
  );
}
