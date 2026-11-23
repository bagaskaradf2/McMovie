import React, { useState } from 'react';
import { Play, Star, Plus, Check, Film } from 'lucide-react';
import { TmdbService } from '../services/tmdbService';
import { StorageService } from '../services/storageService';

function formatCompactTag(item, isSeries) {
  if (item.isDubIndo) return 'DUB INDO';
  if (item.isMcu) return 'MCU';
  const badge = (item.badge || '').replace(/^[^\w\s]+\s*/, '').trim();
  if (badge) return badge.toUpperCase();
  return isSeries ? 'SERIES' : 'FILM';
}

function MovieCard({
  item,
  variant = 'landscape', // 'landscape' | 'poster'
  onClick,
  onPlay,
  isWatchlisted,
  onToggleWatchlist,
  className,
}) {
  const [imageError, setImageError] = useState(false);

  if (!item) return null;

  const isLandscape = variant === 'landscape';
  const title = item.title || item.name || 'Untitled';
  const primaryRaw = isLandscape
    ? item.backdrop_path || item.poster_path || item.poster || item.tmdbPoster || item.thumbnail || item.cover || item.image
    : item.poster_path || item.poster || item.tmdbPoster || item.thumbnail || item.backdrop_path || item.cover || item.image;

  const fallbackImg = isLandscape
    ? item.poster_path || item.thumbnail
    : item.backdrop_path || item.thumbnail;

  const resolveSrc = (raw, size) => {
    if (!raw) return '';
    if (raw.startsWith('http')) {
      if (raw.includes('stream.dubbindo.site') || raw.includes('ik.imagekit.io')) return '';
      return raw;
    }
    if (raw.startsWith('/images/') || raw.startsWith('./images/')) return raw;
    return TmdbService.getImageUrl(raw, size);
  };

  let artUrl = resolveSrc(primaryRaw, isLandscape ? 'w780' : 'w342');
  if (!artUrl && fallbackImg) {
    artUrl = resolveSrc(fallbackImg, 'w342');
  }

  const releaseDate = item.release_date || item.first_air_date || '';
  const year = releaseDate ? releaseDate.slice(0, 4) : item.year || '';
  const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : '8.2';
  const isSeries =
    item.media_type === 'tv' ||
    item.type === 'series' ||
    item.category === 'Film Series' ||
    Boolean(item.first_air_date) ||
    (Array.isArray(item.episodes) && item.episodes.length > 0);

  const handleWatchlistClick = (e) => {
    e.stopPropagation();
    if (onToggleWatchlist) onToggleWatchlist(item);
    else StorageService.toggleWatchlist(item);
  };

  const handlePlayClick = (e) => {
    e.stopPropagation();
    if (onPlay) onPlay(item);
    else if (onClick) onClick(item);
  };

  const compactTag = formatCompactTag(item, isSeries);
  const subMeta =
    item.isDubIndo && isSeries && Array.isArray(item.episodes)
      ? `${item.episodes.length} Eps`
      : year;

  const containerSize =
    className ||
    (isLandscape
      ? 'flex-none w-[245px] sm:w-[285px] md:w-[310px]'
      : 'flex-none w-[150px] sm:w-[175px] md:w-[195px]');

  return (
    <div
      onClick={() => onClick && onClick(item)}
      className={`group relative cursor-pointer select-none ${containerSize}`}
    >
      {/* Pure Artwork Container (zero resting badge clutter) */}
      <div
        className={`relative w-full ${
          isLandscape ? 'aspect-[16/9]' : 'aspect-[2/3]'
        } rounded-xl overflow-hidden bg-[#101218] border border-white/10 group-hover:border-white/30 transition-all duration-300 group-hover:shadow-[0_14px_34px_rgba(0,0,0,0.75)]`}
      >
        {imageError || !artUrl ? (
          <div className="h-full w-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-[#191d28] via-[#101218] to-[#08090d] text-center">
            <Film className="w-7 h-7 text-zinc-500 mb-2" />
            <p className="text-xs font-semibold text-zinc-200 line-clamp-2">{title}</p>
          </div>
        ) : (
          <img
            src={artUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            className={`h-full w-full object-cover ${
              isLandscape && !item.backdrop_path ? 'object-top' : 'object-center'
            } transition-transform duration-700 ease-out group-hover:scale-105`}
            onError={() => setImageError(true)}
          />
        )}

        {/* Subtle Hover Vignette */}
        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Hover-Only Center Frosted Play Disc */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
          <button
            onClick={handlePlayClick}
            className="w-11 h-11 rounded-full bg-white/20 hover:bg-white hover:text-black text-white ring-1 ring-white/40 backdrop-blur-md flex items-center justify-center shadow-2xl pointer-events-auto transform scale-90 group-hover:scale-100 active:scale-95 transition-all duration-200"
            title="Putar Sekarang"
          >
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </button>
        </div>

        {/* Hover-Only Top-Right Watchlist Button */}
        <button
          onClick={handleWatchlistClick}
          className={`absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full backdrop-blur-md flex items-center justify-center transition-all duration-200 active:scale-95 ${
            isWatchlisted
              ? 'bg-white text-black opacity-100 shadow-md'
              : 'bg-black/55 text-white hover:bg-black/80 border border-white/20 opacity-0 group-hover:opacity-100'
          }`}
          title={isWatchlisted ? 'Hapus dari Watchlist' : 'Simpan ke Watchlist'}
        >
          {isWatchlisted ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Minimal 2-Line Editorial Footer */}
      <div className="mt-2 px-0.5">
        <h3
          className="text-[13px] font-semibold text-zinc-100 group-hover:text-white truncate leading-tight transition-colors"
          title={title}
        >
          {title}
        </h3>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="px-1.5 py-[1px] rounded bg-white/[0.08] text-[10px] font-semibold uppercase tracking-wider text-zinc-300 truncate max-w-[92px]">
              {compactTag}
            </span>
            {subMeta && <span className="flex-none text-zinc-400">{subMeta}</span>}
          </div>
          {rating && (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-200 flex-none">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{rating}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(MovieCard);
