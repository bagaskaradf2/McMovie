import React, { useState, useEffect, useMemo } from 'react';
import { Play, Info, Bookmark, Check, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { TmdbService, TMDB_GENRE_MAP } from '../services/tmdbService';

export default function HeroBanner({
  items = [],
  trendingLabel = 'TRENDING',
  onPlayClick,
  onInfoClick,
  watchlistIds = new Set(),
  onToggleWatchlist,
  onActiveSlideChange,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [logoMap, setLogoMap] = useState({});

  const heroPool = useMemo(
    () => (items || []).filter((it) => it && (it.backdrop_path || it.thumbnail)).slice(0, 6),
    [items]
  );

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

  // Lazily fetch authentic TMDB PNG title logos for hero items
  useEffect(() => {
    let cancelled = false;
    for (const item of heroPool) {
      if (!item || item.isDubIndo || !/^\d+$/.test(String(item.id))) continue;
      const mType = item.media_type === 'tv' || item.category === 'Film Series' ? 'tv' : 'movie';
      const cacheKey = `${mType}_${item.id}`;
      if (cacheKey in logoMap) continue;

      TmdbService.getTitleLogo(item.id, mType)
        .then((url) => {
          if (cancelled) return;
          setLogoMap((prev) => {
            if (cacheKey in prev) return prev;
            return { ...prev, [cacheKey]: url || null };
          });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [heroPool]);

  const safeIdx = heroPool.length > 0 ? currentIndex % heroPool.length : 0;
  const current = heroPool[safeIdx] || null;

  useEffect(() => {
    if (current && onActiveSlideChange) {
      onActiveSlideChange(current);
    }
  }, [current?.id, onActiveSlideChange]);

  if (!current) return null;

  const title = current.title || current.name || 'Untitled Feature';
  const rawBackdrop = current.backdrop_path || current.thumbnail;
  const backdropUrl = current.isDubIndo
    ? current.thumbnail ||
      'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1280&auto=format&fit=crop&q=80'
    : TmdbService.getBackdropUrl(rawBackdrop, 'w1280');

  const releaseDate = current.release_date || current.first_air_date || '';
  const year = releaseDate ? releaseDate.slice(0, 4) : current.year || String(new Date().getFullYear());
  const rating = current.vote_average ? Number(current.vote_average) : 8.2;
  const pct = Math.min(99, Math.max(10, Math.round(rating * 10)));
  const filledStars = Math.round(rating / 2);

  const rawOverview =
    current.overview ||
    current.description ||
    'Saksikan film dan serial pilihan kualitas HD langsung di McMovies.';
  const overview = rawOverview.replace(/\s*—\s*/g, ' - ');

  const isSaved = watchlistIds.has(String(current.id));
  const isSeries = current.media_type === 'tv' || current.category === 'Film Series';
  const logoKey = `${isSeries ? 'tv' : 'movie'}_${current.id}`;
  const titleLogoUrl = logoMap[logoKey] || null;

  const genres = (Array.isArray(current.genre_ids) ? current.genre_ids : [])
    .map((gid) => TMDB_GENRE_MAP[gid])
    .filter(Boolean)
    .slice(0, 3);

  // Next 3 slides for UP NEXT strip
  const upNextItems = [];
  if (heroPool.length > 1) {
    const count = Math.min(3, heroPool.length - 1);
    for (let offset = 1; offset <= count; offset++) {
      const idx = (safeIdx + offset) % heroPool.length;
      upNextItems.push({ item: heroPool[idx], idx });
    }
  }

  return (
    <div className="group relative w-full h-[80vh] sm:h-[86vh] lg:h-[92vh] max-h-[840px] overflow-hidden bg-[#060709]">
      {/* Background Backdrop with Ken Burns & Seamless Bottom Mask */}
      <div className="absolute inset-0 z-0 hero-bottom-mask pointer-events-none overflow-hidden">
        <img
          key={backdropUrl}
          src={backdropUrl}
          alt={title}
          fetchPriority="high"
          decoding="async"
          className="w-full h-full object-cover object-top brightness-[0.82] animate-kenburns"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src =
              'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1280&auto=format&fit=crop&q=80';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060709]/92 via-[#060709]/50 to-transparent w-full lg:w-3/4" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060709] via-[#060709]/35 to-black/30" />
      </div>

      {/* Hero Foreground Content */}
      <div className="relative z-10 h-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 flex flex-col justify-end pb-14 sm:pb-16">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          {/* Left Metadata Stack */}
          <div key={`hero-meta-${current.id}`} className="max-w-xl animate-tab-enter">
            {/* Micro Eyebrow */}
            <div className="flex flex-wrap items-center gap-2 mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/12 border border-white/15 backdrop-blur-md">
                McMovies<span className="text-red-500">.</span>
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
              <span>
                {trendingLabel} #{safeIdx + 1} · {isSeries ? 'SERIES' : 'FILM'} · {year}
              </span>
            </div>

            {/* Authentic Title Logo Graphic or Bold Display Heading */}
            {titleLogoUrl ? (
              <h1 aria-label={title} className="mb-3">
                <img
                  src={titleLogoUrl}
                  alt={title}
                  className="max-h-16 sm:max-h-24 md:max-h-28 max-w-[260px] sm:max-w-[420px] w-auto object-contain object-left drop-shadow-[0_10px_28px_rgba(0,0,0,0.8)]"
                  onError={() => {
                    setLogoMap((prev) => ({ ...prev, [logoKey]: null }));
                  }}
                />
              </h1>
            ) : (
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.05] drop-shadow-md mb-3">
                {title}
              </h1>
            )}

            {/* 5-Star Rating + Percentage + Genre Pills */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex items-center gap-1.5 mr-1">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }, (_, idx) => (
                    <Star
                      key={idx}
                      className={`w-3.5 h-3.5 ${
                        idx < filledStars
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-zinc-700 text-zinc-700'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs font-bold text-zinc-100">{pct}%</span>
              </div>

              {genres.map((g) => (
                <span
                  key={g}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.08] text-zinc-200 border border-white/10 backdrop-blur-md"
                >
                  {g}
                </span>
              ))}
            </div>

            {/* 3-line Synopsis */}
            <p className="text-xs sm:text-sm text-zinc-300 line-clamp-3 leading-relaxed max-w-lg font-normal">
              {overview}
            </p>

            {/* Action Pills */}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => onPlayClick && onPlayClick(current)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-black font-bold text-sm shadow-xl transition-all duration-200 hover:scale-[1.03] active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Tonton Sekarang</span>
              </button>

              <button
                onClick={() => onInfoClick && onInfoClick(current)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/18 border border-white/15 text-white font-semibold text-sm backdrop-blur-md transition-all active:scale-95"
              >
                <Info className="w-4 h-4 text-zinc-200" />
                <span>Detail</span>
              </button>

              <button
                onClick={() => onToggleWatchlist && onToggleWatchlist(current)}
                className={`w-10 h-10 rounded-full border backdrop-blur-md flex items-center justify-center transition-all active:scale-95 ${
                  isSaved
                    ? 'bg-white text-black border-white shadow-xl'
                    : 'bg-white/10 border-white/15 text-white hover:bg-white/18'
                }`}
                title={isSaved ? 'Hapus dari Watchlist' : 'Tambah ke Watchlist'}
              >
                {isSaved ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
            </div>

            {/* Animated Segmented Progress Bars + Prev/Next Buttons */}
            {heroPool.length > 1 && (
              <div className="mt-6 flex items-center gap-3">
                <div className="flex items-center gap-1.5 flex-1 max-w-[260px]">
                  {heroPool.map((item, idx) => {
                    const isActive = idx === safeIdx;
                    return (
                      <button
                        key={item.id || idx}
                        onClick={() => setCurrentIndex(idx)}
                        className="relative flex-1 h-1 rounded-full bg-white/20 overflow-hidden cursor-pointer hover:bg-white/35 transition-colors"
                        aria-label={`Slide ${idx + 1}`}
                      >
                        {isActive && (
                          <span
                            key={`prog-${safeIdx}-${item.id}`}
                            className="block h-full w-full bg-white rounded-full animate-hero-progress"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      setCurrentIndex((prev) => (prev - 1 + heroPool.length) % heroPool.length)
                    }
                    className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center backdrop-blur-md transition-all active:scale-95"
                    aria-label="Slide sebelumnya"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setCurrentIndex((prev) => (prev + 1) % heroPool.length)}
                    className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center backdrop-blur-md transition-all active:scale-95"
                    aria-label="Slide berikutnya"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right UP NEXT 16:9 Thumbnail Strip */}
          {upNextItems.length > 0 && (
            <div className="hidden lg:block flex-none">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-0.5 h-3 bg-white/70 rounded-full" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300">
                  BERIKUTNYA
                </span>
              </div>
              <div className="flex items-start gap-3">
                {upNextItems.map(({ item, idx }) => {
                  const thumbUrl = item.isDubIndo
                    ? item.thumbnail || ''
                    : TmdbService.getImageUrl(item.backdrop_path || item.poster_path, 'w300');
                  const itemTitle = item.title || item.name || '';
                  return (
                    <button
                      key={`${item.id}-${idx}`}
                      onClick={() => setCurrentIndex(idx)}
                      className="group/up w-36 xl:w-40 text-left transition-transform duration-300 hover:-translate-y-0.5"
                    >
                      <div className="aspect-[16/9] w-full rounded-xl overflow-hidden border border-white/15 group-hover/up:border-white/50 shadow-lg bg-zinc-900">
                        <img
                          src={thumbUrl}
                          alt={itemTitle}
                          loading="lazy"
                          className="w-full h-full object-cover opacity-80 group-hover/up:opacity-100 group-hover/up:scale-105 transition-all duration-500"
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] font-medium text-zinc-300 group-hover/up:text-white truncate">
                        {itemTitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
