import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import MovieCard from './MovieCard';

export default function ContentRail({
  title,
  subtitle,
  items = [],
  loading = false,
  showRank = false,
  onMovieClick,
  onPlayClick,
  watchlistIds = new Set(),
  onToggleWatchlist,
  onExploreMore,
}) {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    const scrollAmount = clientWidth * 0.78;
    scrollRef.current.scrollTo({
      left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
      behavior: 'smooth',
    });
  };

  if (!loading && (!items || items.length === 0)) return null;

  return (
    <section className="relative my-8 sm:my-10 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
      {/* Section Header */}
      <div className="flex items-end justify-between mb-4 gap-4">
        <div className="flex items-start gap-3">
          <div className="w-1 h-6 sm:h-7 rounded-full bg-white mt-0.5 flex-none" />
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-white leading-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5 font-normal line-clamp-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-none">
          {onExploreMore && (
            <button
              onClick={onExploreMore}
              className="flex items-center gap-1 text-xs font-semibold text-zinc-300 hover:text-white transition-colors mr-1"
            >
              <span>Lihat Semua</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5">
            <button
              onClick={() => scroll('left')}
              className="w-8 h-8 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-all active:scale-95"
              aria-label="Geser ke kiri"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-8 h-8 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-all active:scale-95"
              aria-label="Geser ke kanan"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Carousel with subtle right edge fade */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto no-scrollbar scroll-smooth py-2.5 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        >
          {loading
            ? Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="flex-none w-[150px] sm:w-[180px] md:w-[200px]">
                  <div className="aspect-[2/3] w-full rounded-2xl animate-shimmer bg-zinc-900 border border-white/5" />
                  <div className="mt-2.5 space-y-1.5">
                    <div className="h-3 w-3/4 bg-zinc-800 rounded animate-shimmer" />
                    <div className="h-2 w-1/2 bg-zinc-800/60 rounded animate-shimmer" />
                  </div>
                </div>
              ))
            : items.map((item, idx) => (
                <MovieCard
                  key={`${item.id}-${item.media_type || 'm'}-${item.isDubIndo ? 'dub' : 'std'}-${idx}`}
                  item={item}
                  rank={showRank && idx < 10 ? idx + 1 : undefined}
                  onClick={onMovieClick}
                  onPlay={onPlayClick}
                  isWatchlisted={watchlistIds.has(String(item.id))}
                  onToggleWatchlist={onToggleWatchlist}
                />
              ))}
        </div>
        <div className="hidden md:block pointer-events-none absolute top-0 bottom-0 -right-8 w-12 bg-gradient-to-l from-[#060709] to-transparent" />
      </div>
    </section>
  );
}
