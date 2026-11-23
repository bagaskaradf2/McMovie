import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';
import MovieCard from './MovieCard';

function ContentRail({
  title,
  eyebrow = '',
  items = [],
  loading = false,
  top10Style = false,
  cardVariant = 'landscape',
  eager = false,
  headerRight = null,
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
    <section
      className={`relative my-8 sm:my-10 px-4 sm:px-6 lg:px-10 max-w-[1400px] mx-auto ${
        eager ? '' : 'rail-lazy'
      }`}
    >
      {/* Minimal Editorial Header */}
      <div className="flex flex-wrap items-end justify-between mb-3.5 gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-0.5 h-3 bg-white/75 rounded-full" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                {eyebrow}
              </span>
            </div>
          )}
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-white leading-tight">
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-none">
          {headerRight}

          {onExploreMore && (
            <button
              onClick={onExploreMore}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-xs font-semibold text-zinc-200 hover:text-white transition-all"
            >
              <span>Lihat Semua</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Carousel with Floating Edge Scroll Arrows */}
      <div className="relative group/rail">
        <button
          onClick={() => scroll('left')}
          className="hidden md:flex absolute left-1 top-[42%] -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/70 hover:bg-black/95 border border-white/15 text-white items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-all backdrop-blur-md shadow-xl active:scale-95"
          aria-label="Geser ke kiri"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div
          ref={scrollRef}
          className="flex items-stretch gap-3.5 sm:gap-4 overflow-x-auto no-scrollbar scroll-smooth py-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
        >
          {loading
            ? Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={idx}
                  className={
                    cardVariant === 'landscape'
                      ? 'flex-none w-[245px] sm:w-[285px] md:w-[310px]'
                      : 'flex-none w-[150px] sm:w-[175px] md:w-[195px]'
                  }
                >
                  <div
                    className={`${
                      cardVariant === 'landscape' ? 'aspect-[16/9]' : 'aspect-[2/3]'
                    } w-full rounded-xl animate-shimmer bg-zinc-900 border border-white/5`}
                  />
                  <div className="mt-2 space-y-1.5">
                    <div className="h-3 w-3/4 bg-zinc-800 rounded animate-shimmer" />
                    <div className="h-2.5 w-1/2 bg-zinc-800/60 rounded animate-shimmer" />
                  </div>
                </div>
              ))
            : items.map((item, idx) => {
                const showBigNum = top10Style && idx < 10;
                const cardEl = (
                  <MovieCard
                    item={item}
                    variant={cardVariant}
                    onClick={onMovieClick}
                    onPlay={onPlayClick}
                    isWatchlisted={watchlistIds.has(String(item.id))}
                    onToggleWatchlist={onToggleWatchlist}
                  />
                );

                if (showBigNum) {
                  return (
                    <div
                      key={`${item.id}-${item.media_type || 'm'}-${item.isDubIndo ? 'dub' : 'std'}-${idx}`}
                      className="relative flex-none pl-11 sm:pl-14 lg:pl-16 group/rank"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute left-0 bottom-7 text-[104px] sm:text-[124px] lg:text-[148px] font-black leading-none tracking-tighter select-none pointer-events-none top10-stroke-num transition-transform duration-500 group-hover/rank:-translate-x-1.5"
                      >
                        {idx + 1}
                      </span>
                      <div className="relative z-10">{cardEl}</div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${item.id}-${item.media_type || 'm'}-${item.isDubIndo ? 'dub' : 'std'}-${idx}`}
                    className="flex-none"
                  >
                    {cardEl}
                  </div>
                );
              })}
        </div>

        <button
          onClick={() => scroll('right')}
          className="hidden md:flex absolute right-1 top-[42%] -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/70 hover:bg-black/95 border border-white/15 text-white items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-all backdrop-blur-md shadow-xl active:scale-95"
          aria-label="Geser ke kanan"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="hidden md:block pointer-events-none absolute top-0 bottom-0 -right-8 w-14 bg-gradient-to-l from-[#060709] to-transparent" />
      </div>
    </section>
  );
}

export default React.memo(ContentRail);
