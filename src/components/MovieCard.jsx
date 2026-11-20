import React from 'react';
import { Play, Star, Plus, Check } from 'lucide-react';
import { TmdbService } from '../services/tmdbService';
import { StorageService } from '../services/storageService';

export default function MovieCard({
  item,
  onClick,
  onPlay,
  isWatchlisted,
  onToggleWatchlist,
  className = "flex-none w-[150px] sm:w-[185px] md:w-[205px]"
}) {
  if (!item) return null;

  const title = item.title || item.name || 'Untitled';
  const rawPoster = item.poster_path || item.thumbnail;
  
  let posterUrl = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=60';
  if (rawPoster) {
    if (rawPoster.startsWith('http')) {
      posterUrl = rawPoster.replace('stream.dubbindo.site', 'ik.imagekit.io/uvideo');
    } else {
      posterUrl = TmdbService.getImageUrl(rawPoster, 'w500');
    }
  }

  const releaseDate = item.release_date || item.first_air_date || '';
  const year = releaseDate ? releaseDate.slice(0, 4) : (item.year || '');
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '8.2';
  const isSeries = item.media_type === 'tv' || item.category === 'Film Series' || (item.episodes && item.episodes.length > 0);

  const handleWatchlistClick = (e) => {
    e.stopPropagation();
    if (onToggleWatchlist) {
      onToggleWatchlist(item);
    } else {
      StorageService.toggleWatchlist(item);
    }
  };

  const handlePlayClick = (e) => {
    e.stopPropagation();
    if (onPlay) {
      onPlay(item);
    } else if (onClick) {
      onClick(item);
    }
  };

  return (
    <div
      onClick={() => onClick && onClick(item)}
      className={`group relative cursor-pointer transition-all duration-300 ${className}`}
    >
      {/* Poster Container with Smooth Shadow & Border */}
      <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-zinc-900 border border-white/[0.08] group-hover:border-white/20 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl group-hover:shadow-black/80">
        <img
          src={posterUrl}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=60';
          }}
        />

        {/* Ambient Dark Gradient on Poster */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-40 group-hover:opacity-75 transition-opacity duration-300" />

        {/* Minimalist Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
          {item.badge ? (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide backdrop-blur-md shadow-md ${
              item.badge === 'Limited Free'
                ? 'bg-emerald-500 text-black font-extrabold'
                : item.badge.includes('Netflix')
                  ? 'bg-red-600/90 text-white'
                  : item.badge.includes('Disney')
                    ? 'bg-blue-600/90 text-white'
                    : 'bg-black/70 text-zinc-200 border border-white/15'
            }`}>
              {item.badge}
            </span>
          ) : item.isDubIndo ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
              Dub Indo
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide bg-black/50 text-zinc-300 border border-white/10 backdrop-blur-md">
              {isSeries ? 'Series' : 'Film'}
            </span>
          )}

          {rating && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-amber-400 border border-white/10 text-[11px] font-semibold">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              <span>{rating}</span>
            </div>
          )}
        </div>

        {/* Center Hover Action (Clean White Play Button) */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
          <button
            onClick={handlePlayClick}
            className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-2xl pointer-events-auto transform scale-90 group-hover:scale-100 hover:scale-110 active:scale-95 transition-all duration-200"
            title="Putar Film"
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>
        </div>

        {/* Bottom Hover Action: Watchlist Bookmark */}
        <div className="absolute bottom-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={handleWatchlistClick}
            className={`p-2 rounded-full backdrop-blur-md transition-all active:scale-95 ${
              isWatchlisted
                ? 'bg-white text-black shadow-lg'
                : 'bg-black/60 text-white hover:bg-black/80 border border-white/20'
            }`}
            title={isWatchlisted ? 'Hapus dari Watchlist' : 'Simpan ke Watchlist'}
          >
            {isWatchlisted ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Typography Under Poster */}
      <div className="mt-2.5 px-0.5">
        <h3 className="text-xs sm:text-sm font-semibold text-zinc-100 group-hover:text-white line-clamp-1 transition-colors tracking-tight" title={title}>
          {title}
        </h3>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400 font-normal">
          {year && <span>{year}</span>}
          <span>•</span>
          <span>{item.isDubIndo ? (item.duration || 'Full Movie') : (isSeries ? 'TV Show' : 'HD Movie')}</span>
        </div>
      </div>
    </div>
  );
}
