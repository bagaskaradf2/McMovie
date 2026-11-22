import React, { useState } from 'react';
import { Play, Star, Plus, Check, Film } from 'lucide-react';
import { TmdbService } from '../services/tmdbService';
import { StorageService } from '../services/storageService';

function getProviderDotColor(badgeText) {
  const b = (badgeText || '').toLowerCase();
  if (b.includes('klikxxi')) return 'bg-rose-400';
  if (b.includes('idlix')) return 'bg-emerald-400';
  if (b.includes('lk21') || b.includes('layarkaca')) return 'bg-blue-400';
  if (b.includes('ngefilm')) return 'bg-indigo-400';
  if (b.includes('pusatfilm') || b.includes('savefilm')) return 'bg-violet-400';
  if (b.includes('moviebox')) return 'bg-amber-400';
  if (b.includes('sflix')) return 'bg-sky-400';
  return 'bg-zinc-300';
}

export default function MovieCard({
  item,
  rank,
  onClick,
  onPlay,
  isWatchlisted,
  onToggleWatchlist,
  className = 'flex-none w-[150px] sm:w-[180px] md:w-[200px]',
}) {
  if (!item) return null;

  const [imageError, setImageError] = useState(false);

  const title = item.title || item.name || 'Untitled';
  const rawPoster = item.poster_path || item.poster || item.tmdbPoster || item.thumbnail || item.cover || item.image;

  let posterUrl = '';
  if (rawPoster) {
    if (rawPoster.startsWith('http')) {
      if (rawPoster.includes('stream.dubbindo.site') || rawPoster.includes('ik.imagekit.io')) {
        posterUrl = '';
      } else {
        posterUrl = rawPoster;
      }
    } else if (rawPoster.startsWith('/images/') || rawPoster.startsWith('./images/')) {
      posterUrl = rawPoster;
    } else {
      posterUrl = TmdbService.getImageUrl(rawPoster, 'w500');
    }
  }

  const releaseDate = item.release_date || item.first_air_date || '';
  const year = releaseDate ? releaseDate.slice(0, 4) : (item.year || '');
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

  const badgeText = item.badge || (item.isDubIndo ? 'Dub Indo' : '');
  const isNetflixBadge = /netflix/i.test(badgeText);
  const isDubBadge = item.isDubIndo || /dub\s*indo/i.test(badgeText);

  return (
    <div
      onClick={() => onClick && onClick(item)}
      className={`group relative cursor-pointer transition-all duration-300 ${className}`}
    >
      {/* Poster Container */}
      <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#12141c] border border-white/[0.08] group-hover:border-white/25 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl group-hover:shadow-black/80">
        {imageError || !posterUrl ? (
          <div className="h-full w-full flex flex-col justify-between p-3.5 bg-gradient-to-br from-[#1c202e] via-[#10121a] to-[#08090d] relative overflow-hidden select-none">
            <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none">
              <Film className="w-36 h-36 text-white" />
            </div>

            <div className="flex items-center justify-between z-10">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-white/10 text-white border border-white/15 backdrop-blur-md">
                {isSeries ? 'Series' : 'Film'}
              </span>
              {rating && (
                <div className="flex items-center gap-1 text-amber-400 text-xs font-bold">
                  <Star className="w-3 h-3 fill-amber-400" />
                  <span>{rating}</span>
                </div>
              )}
            </div>

            <div className="my-auto text-center py-2 z-10">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/80">
                <Film className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-white line-clamp-3 leading-snug px-1">{title}</p>
              {year && <span className="text-[10px] text-zinc-400 mt-1 inline-block">{year}</span>}
            </div>

            <div className="z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-400">
              <span className="truncate max-w-[85px]">{badgeText || 'McMovies'}</span>
              <span className="text-emerald-400 font-bold">HD</span>
            </div>
          </div>
        ) : (
          <img
            src={posterUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25 opacity-45 group-hover:opacity-75 transition-opacity duration-300" />

        {/* Clean Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 pointer-events-none z-10">
          {isNetflixBadge ? (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide bg-red-600/95 text-white shadow-md">
              {badgeText}
            </span>
          ) : isDubBadge ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 backdrop-blur-md">
              Dub Indo
            </span>
          ) : badgeText ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-black/75 text-zinc-100 border border-white/15 backdrop-blur-md max-w-[110px] truncate">
              <span className={`w-1.5 h-1.5 rounded-full flex-none ${getProviderDotColor(badgeText)}`} />
              <span className="truncate">{badgeText.replace(/^[^\w\s]+\s*/, '')}</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide bg-black/55 text-zinc-300 border border-white/10 backdrop-blur-md">
              {isSeries ? 'Series' : 'Film'}
            </span>
          )}

          {rating && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md text-amber-400 border border-white/10 text-[10px] font-semibold flex-none">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              <span>{rating}</span>
            </div>
          )}
        </div>

        {/* Optional Top-10 Rank Pill (bottom-left) */}
        {rank !== undefined && (
          <div className="absolute bottom-2.5 left-2.5 z-10 px-2 py-0.5 rounded-lg bg-black/80 border border-white/15 backdrop-blur-md text-[11px] font-black text-white pointer-events-none">
            #{rank}
          </div>
        )}

        {/* Center Hover Play */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
          <button
            onClick={handlePlayClick}
            className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-2xl pointer-events-auto transform scale-90 group-hover:scale-100 hover:scale-110 active:scale-95 transition-all duration-200"
            title="Putar Sekarang"
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>
        </div>

        {/* Bottom-Right Watchlist Button */}
        <div className="absolute bottom-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={handleWatchlistClick}
            className={`p-2 rounded-full backdrop-blur-md transition-all active:scale-95 ${
              isWatchlisted
                ? 'bg-white text-black shadow-lg'
                : 'bg-black/65 text-white hover:bg-black/85 border border-white/20'
            }`}
            title={isWatchlisted ? 'Hapus dari Watchlist' : 'Simpan ke Watchlist'}
          >
            {isWatchlisted ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Title & Metadata Footer */}
      <div className="mt-2.5 px-0.5">
        <h3
          className="text-xs sm:text-sm font-semibold text-zinc-100 group-hover:text-white line-clamp-1 transition-colors tracking-tight"
          title={title}
        >
          {title}
        </h3>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400 font-normal">
          {year && <span>{year}</span>}
          {year && <span>•</span>}
          <span>{item.isDubIndo ? (item.duration || 'Full Movie') : isSeries ? 'Series' : 'Film'}</span>
        </div>
      </div>
    </div>
  );
}
