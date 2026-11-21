import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Play,
  Star,
  Bookmark,
  BookmarkCheck,
  Share2,
  Calendar,
  Clock,
  Tv,
  Film,
  Sparkles,
  ChevronLeft,
  Video,
  Check,
  Plus,
  X
} from 'lucide-react';

import { TmdbService } from '../services/tmdbService';
import { DubIndoService } from '../services/dubIndoService';
import { MovieBoxService } from '../services/movieBoxService';
import { StorageService } from '../services/storageService';
import MovieCard from '../components/MovieCard';

export default function DetailPage({ type: propType }) {
  const { id: paramId, type: paramType } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const preloadedItem = location.state?.item;

  const type = propType || paramType || 'movie';
  const id = paramId;

  const [item, setItem] = useState(preloadedItem || null);
  const [details, setDetails] = useState(preloadedItem || null);
  const [loading, setLoading] = useState(!preloadedItem);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonData, setSeasonData] = useState(null);
  const [loadingSeason, setLoadingSeason] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);

  // Instant redirect table for unreleased teaser trailers, broken embeds, and invalid titles
  const BLACKLIST_REDIRECTS = {
    // Reawakened Man -> Avengers: Endgame (3h 01m full film)
    '961214': { type: 'movie', id: '31591' },
    // Alas Roban: The Series -> Sajadah Panjang (13 full episodes)
    '338973': { type: 'tv', id: 'sajadah_panjang' },
    // Kabut Berduri -> The Big 4 (2h 21m direct stream)
    '1126357': { type: 'movie', id: '9762' },
    // Siksa Kubur -> Siksa Neraka (1h 28m direct stream)
    '1119527': { type: 'movie', id: '17139' },
    // Ipar Adalah Maut -> Agak Laen (1h 58m direct stream)
    '1181068': { type: 'movie', id: '19364' },
    // Unreleased teaser trailers -> Full-length blockbusters
    '1595124': { type: 'movie', id: '13616' },
    '1551025': { type: 'movie', id: '19342' },
    '1185344': { type: 'movie', id: '14049' },
    '1562642': { type: 'movie', id: '17530' },
    '1300968': { type: 'movie', id: '31591' },
    '1092622': { type: 'movie', id: '4494' }
  };

  useEffect(() => {
    const rawId = String(id).replace(/^dub_/, '').replace(/^dub_series_/, '');
    const redirectTarget = BLACKLIST_REDIRECTS[rawId] || BLACKLIST_REDIRECTS[String(id)];
    if (redirectTarget) {
      if (redirectTarget.type === 'tv') {
        navigate(`/tv/${redirectTarget.id}`, { replace: true });
      } else {
        navigate(`/movie/${redirectTarget.id}`, { replace: true });
      }
      return;
    }
    const t = (preloadedItem?.title || '').toLowerCase();
    if (t.includes('reawakened') || t.includes('alas roban') || t.includes('kabut berduri') || t.includes('siksa kubur') || t.includes('ipar adalah maut')) {
      if (t.includes('alas roban')) {
        navigate('/tv/sajadah_panjang', { replace: true });
      } else {
        navigate('/movie/31591', { replace: true });
      }
    }
  }, [id, preloadedItem, navigate]);

  useEffect(() => {
    let isMounted = true;
    if (!preloadedItem) {
      setLoading(true);
    }
    setShowTrailer(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    async function loadDetailPage() {
      // 1. FAST PATH: MovieBox & Local Scraped Catalog lookup (0ms instant response)
      try {
        const localItem = await MovieBoxService.getDetail(id);
        if (localItem && isMounted) {
          const fullItem = { ...localItem, media_type: localItem.media_type || (type === 'tv' ? 'tv' : 'movie') };
          setItem(fullItem);
          setDetails(fullItem);
          setIsWatchlisted(StorageService.isWatchlisted(fullItem.id));

          let genEps = [];
          if (Array.isArray(fullItem.episodesList) && fullItem.episodesList.length > 0) {
            genEps = fullItem.episodesList;
          } else if (Array.isArray(fullItem.episodes) && fullItem.episodes.length > 0) {
            genEps = fullItem.episodes;
          } else {
            const totalEps = (typeof fullItem.episodes === 'number' && fullItem.episodes > 0)
              ? fullItem.episodes
              : (fullItem.parts?.length || 1);

            genEps = Array.from({ length: totalEps }, (_, i) => {
              const epNum = i + 1;
              return {
                episode_number: epNum,
                name: `Episode ${epNum}`,
                overview: epNum === 1 && fullItem.parts?.length > 0
                  ? `Episode 1 lengkap durasi penuh (Part 1, Part 2, Part 3) kualitas HD tanpa iklan.`
                  : `Episode ${epNum} dari serial ${fullItem.title || 'Serial'} durasi penuh.`,
                still_path: fullItem.backdrop_path || fullItem.poster_path
              };
            });
          }
          setSeasonData({ episodes: genEps, season_number: 1 });
          setSelectedSeason(1);

          setLoading(false);

          // If item has a TMDB ID and no local episodesList, fetch extra seasons/credits from TMDB
          if (fullItem.tmdbId && fullItem.media_type === 'tv' && (!fullItem.episodesList || fullItem.episodesList.length === 0) && (!fullItem.parts || fullItem.parts.length === 0)) {
            fetchSeason(fullItem.tmdbId, 1);
          }
          return;
        }
      } catch (e) {
        console.warn('Fast path detail catalog lookup error:', e);
      }

      // 2. DUB INDO PATH
      if (type === 'dub') {
        DubIndoService.getMovieOrSeriesById(id).then(async (found) => {
          if (!isMounted) return;
          if (found) {
            if (!found.tmdbId) {
              const resolvedTmdb = await DubIndoService.resolveDubTmdbId(found.title, found.year);
              if (resolvedTmdb) {
                found.tmdbId = resolvedTmdb;
              }
            }

            // If TMDB ID is available, fetch rich cast & crew metadata
            if (found.tmdbId) {
              try {
                const tmdbData = await TmdbService.getDetails(found.tmdbId, found.media_type || 'movie');
                if (tmdbData && isMounted) {
                  setDetails(tmdbData);
                }
              } catch (e) {
                console.warn('Could not fetch TMDB details for dub item:', e);
              }
            }

            setItem(found);
            setIsWatchlisted(StorageService.isWatchlisted(found.id));
          }
          setLoading(false);
        });
      } else {
        // 3. TMDB PATH
        const mediaType = type === 'tv' ? 'tv' : 'movie';
        try {
          const data = await TmdbService.getDetails(id, mediaType);
          if (!isMounted) return;

          if (data) {
            const fullItem = { ...data, media_type: mediaType };
            setItem(fullItem);
            setDetails(fullItem);
            setIsWatchlisted(StorageService.isWatchlisted(fullItem.id));

            if (mediaType === 'tv') {
              const initialSeason = data?.seasons?.find(s => s.season_number > 0)?.season_number || 1;
              setSelectedSeason(initialSeason);
              fetchSeason(id, initialSeason);
            }
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('Failed to load details from TMDB:', err);
        }

        // 4. Secondary fallback
        try {
          const fallback = await MovieBoxService.getDetail(id);
          if (fallback && isMounted) {
            setItem(fallback);
            setDetails(fallback);
            setIsWatchlisted(StorageService.isWatchlisted(fallback.id));
            setLoading(false);
            return;
          }
        } catch (e) {}

        if (isMounted) setLoading(false);
      }
    }

    loadDetailPage();

    return () => {
      isMounted = false;
    };
  }, [type, id]);

  const fetchSeason = async (tvId, sNum) => {
    setLoadingSeason(true);
    try {
      const data = await TmdbService.getSeasonDetails(tvId, sNum);
      if (data && data.episodes && data.episodes.length > 0) {
        setSeasonData(data);
      } else if (item?.episodes && typeof item.episodes === 'number') {
        const genEps = Array.from({ length: item.episodes }, (_, i) => ({
          episode_number: i + 1,
          name: `Episode ${i + 1}`,
          overview: `Episode ${i + 1} dari ${item.title || item.name || 'Serial'}`,
          still_path: item.backdrop_path || item.poster_path
        }));
        setSeasonData({ episodes: genEps, season_number: sNum });
      } else {
        setSeasonData(data);
      }
    } catch (e) {
      console.warn('Could not fetch season from TMDB:', e);
      if (item?.episodes && typeof item.episodes === 'number') {
        const genEps = Array.from({ length: item.episodes }, (_, i) => ({
          episode_number: i + 1,
          name: `Episode ${i + 1}`,
          overview: `Episode ${i + 1} dari ${item.title || item.name || 'Serial'}`,
          still_path: item.backdrop_path || item.poster_path
        }));
        setSeasonData({ episodes: genEps, season_number: sNum });
      }
    } finally {
      setLoadingSeason(false);
    }
  };

  const handleSeasonChange = (sNum) => {
    setSelectedSeason(sNum);
    if (type !== 'dub') {
      fetchSeason(id, sNum);
    }
  };

  const handleToggleWatchlist = () => {
    if (!item) return;
    const res = StorageService.toggleWatchlist(item);
    setIsWatchlisted(res.inList !== undefined ? res.inList : !isWatchlisted);
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handlePlayDirect = (season = 1, episode = 1) => {
    if (!item) return;
    if (item.isDubIndo) {
      navigate(`/watch/dub/${item.id}`, { state: { item } });
    } else if (isSeries) {
      navigate(`/watch/tv/${item.id}/${season}/${episode}`, { state: { item } });
    } else {
      navigate(`/watch/movie/${item.id}`, { state: { item } });
    }
  };

  if (loading) {
    return (
      <div className="w-full h-screen bg-[#060709] flex flex-col items-center justify-center text-zinc-400">
        <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide text-zinc-300 animate-pulse">Memuat Informasi Tayangan...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="w-full min-h-screen bg-[#06070a] flex flex-col items-center justify-center text-center px-4 py-12">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Tayangan Tidak Ditemukan</h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
          Maaf, halaman tayangan ini tidak dapat ditemukan di server kami. Silakan kembali ke beranda.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2.5 rounded-full bg-white text-black font-extrabold text-xs transition-all active:scale-95 shadow-md"
        >
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  const data = details || item;
  const title = item.title || item.name || data.title || data.name || 'Untitled';
  const isSeries = item.media_type === 'tv' || data.media_type === 'tv' || (data.seasons && data.seasons.length > 0) || (item.episodes && item.episodes.length > 0);

  const rawBackdrop = data.backdrop_path || item.backdrop_path || data.thumbnail;
  const backdropUrl = item.isDubIndo
    ? (rawBackdrop || '')
    : TmdbService.getBackdropUrl(rawBackdrop, 'original');

  const rawPoster = data.poster_path || item.poster_path || data.thumbnail;
  const posterUrl = item.isDubIndo
    ? (rawPoster || '')
    : TmdbService.getImageUrl(rawPoster, 'w500');

  const releaseDate = data.release_date || data.first_air_date || item.release_date || '';
  const year = releaseDate ? releaseDate.slice(0, 4) : (item.year || '2026');
  const rating = (data.vote_average || item.vote_average || 8.5).toFixed(1);
  const runtime = data.runtime
    ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m`
    : (item.duration || '2h 25m');
  const genres = data.genres || item.genres || [];
  const cast = data?.credits?.cast?.slice(0, 8) || [];
  const similar = data?.similar?.results?.slice(0, 12) || [];

  // Trailer
  const trailer = data?.videos?.results?.find(
    (v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
  );

  // Episodes List for Series: handle both Array and Number formats safely
  const rawEpisodes = item.isDubIndo
    ? (item.episodes || [])
    : (seasonData?.episodes || (Array.isArray(data.episodes) ? data.episodes : []));

  const episodesList = Array.isArray(rawEpisodes) && rawEpisodes.length > 0
    ? rawEpisodes
    : (typeof data.episodes === 'number' && data.episodes > 0
        ? Array.from({ length: data.episodes }, (_, i) => ({
            episode_number: i + 1,
            name: `Episode ${i + 1}`,
            overview: `Episode ${i + 1} dari ${data.title || 'Serial'} durasi penuh.`,
            still_path: data.backdrop_path || data.poster_path
          }))
        : []);

  const validSeasons = Array.isArray(data?.seasons) && data.seasons.length > 0
    ? data.seasons.filter(s => s.season_number > 0)
    : (typeof data?.seasons === 'number' && data.seasons > 0
        ? Array.from({ length: data.seasons }, (_, i) => ({ id: i + 1, season_number: i + 1, name: `Season ${i + 1}` }))
        : [{ id: 1, season_number: 1, name: 'Season 1' }]);

  return (
    <div className="min-h-screen bg-[#06070a] text-white selection:bg-white selection:text-black">
      {/* Top Bar with Clean Header Actions */}
      <div className="sticky top-0 z-40 bg-[#06070a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate(-1) || navigate('/')}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleWatchlist}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
              isWatchlisted
                ? 'bg-amber-400 text-black shadow-md'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10'
            }`}
          >
            {isWatchlisted ? <BookmarkCheck className="w-3.5 h-3.5 fill-current" /> : <Bookmark className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isWatchlisted ? 'Tersimpan' : 'Watchlist'}</span>
          </button>

          <button
            onClick={handleShare}
            className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10 text-xs transition-all"
            title="Bagikan"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          {/* Close button matching reference image */}
          <button
            onClick={() => navigate(-1) || navigate('/')}
            className="p-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 transition-all active:scale-95 ml-1"
            title="Tutup Halaman"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hero Backdrop Banner */}
      <div className="relative w-full h-[300px] sm:h-[380px] md:h-[460px] overflow-hidden bg-zinc-950">
        {showTrailer && trailer ? (
          <div className="w-full h-full">
            <iframe
              src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`}
              title="Official Trailer"
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <>
            <img
              src={backdropUrl || posterUrl}
              alt={title}
              className="w-full h-full object-cover filter brightness-[0.65]"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1280&auto=format&fit=crop&q=80';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#06070a] via-[#06070a]/50 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#06070a]/90 via-transparent to-transparent hidden sm:block" />

            {/* Banner Quick Actions (Exact match to top of reference image) */}
            <div className="absolute bottom-8 left-4 sm:left-8 md:left-12 flex flex-wrap items-center gap-3.5 z-20">
              <button
                onClick={() => handlePlayDirect(1, 1)}
                className="flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-white hover:bg-zinc-200 text-black font-extrabold text-sm shadow-2xl hover:scale-105 active:scale-95 transition-all"
              >
                <Play className="w-5 h-5 fill-black" />
                <span>Mulai Putar</span>
              </button>

              <button
                onClick={handleToggleWatchlist}
                className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white font-semibold text-sm backdrop-blur-md hover:scale-105 active:scale-95 transition-all"
              >
                {isWatchlisted ? <Check className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4" />}
                <span>{isWatchlisted ? 'Tersimpan di Watchlist' : 'Simpan ke Watchlist'}</span>
              </button>

              {trailer && (
                <button
                  onClick={() => setShowTrailer(true)}
                  className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white font-semibold text-sm backdrop-blur-md hover:scale-105 active:scale-95 transition-all"
                >
                  <Video className="w-4 h-4 text-red-400" />
                  <span>Trailer</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 sm:-mt-8 relative z-20 pb-16">
        {/* Title & Metadata Row */}
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {item.isDubIndo ? (
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-emerald-500 text-black">
                  🇮🇩 DUBBING INDONESIA
                </span>
              ) : (
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-white/10 text-white border border-white/20">
                  {isSeries ? 'TV SERIES' : 'MOVIE'}
                </span>
              )}

              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-black/60 text-amber-400 text-xs font-bold border border-white/10">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                <span>{rating}</span>
              </div>

              {year && (
                <span className="text-xs font-semibold text-zinc-300">
                  {year}
                </span>
              )}

              {runtime && (
                <span className="text-xs font-semibold text-zinc-400">
                  • {runtime}
                </span>
              )}

              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-300 border border-white/10">
                4K Ultra HD
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight uppercase leading-tight">
              {title}
            </h1>

            {data.tagline && (
              <p className="mt-1 text-xs sm:text-sm text-zinc-400 italic">
                "{data.tagline}"
              </p>
            )}

            {/* Genres */}
            {genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <span
                    key={g.id || g.name}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-[#12141c] border border-white/[0.08] text-zinc-300"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {/* Synopsis */}
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Sinopsis
              </h3>
              <p className="text-sm text-zinc-300 leading-relaxed max-w-4xl">
                {data.overview || data.description || 'Sinopsis belum tersedia untuk film ini.'}
              </p>
            </div>
          </div>
        </div>

        {/* 
          ========================================================================
          SECTION 1: PEMERAN UTAMA (Exact match to Reference Image media_1795187618051_190c7bdf.jpg)
          ========================================================================
        */}
        {cast.length > 0 && (
          <div className="mt-10 border-t border-white/[0.08] pt-8">
            <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white mb-6">
              PEMERAN UTAMA
            </h3>
            <div className="flex items-start gap-4 sm:gap-6 overflow-x-auto no-scrollbar py-2">
              {cast.map((actor) => (
                <div key={actor.id} className="flex-none w-20 sm:w-24 text-center group">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 aspect-square mx-auto rounded-full overflow-hidden bg-zinc-900 border-2 border-white/10 group-hover:border-white transition-all shadow-md">
                    <img
                      src={TmdbService.getImageUrl(actor.profile_path, 'w185')}
                      alt={actor.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=185&auto=format&fit=crop&q=80';
                      }}
                    />
                  </div>
                  <h4 className="mt-2 text-xs font-bold text-white line-clamp-1 group-hover:text-zinc-200 transition-colors">
                    {actor.name}
                  </h4>
                  <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                    {actor.character}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 
          ========================================================================
          SECTION 2: DAFTAR EPISODE (Exact match to Reference Image media_1795187618051_190c7bdf.jpg)
          ========================================================================
        */}
        {isSeries && (
          <div className="mt-10 border-t border-white/[0.08] pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Tv className="w-4 h-4 text-white" />
                <span>DAFTAR EPISODE</span>
              </h3>

              {/* Season Selector Tabs */}
              {validSeasons.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {validSeasons.map((s) => (
                    <button
                      key={s.id || s.season_number}
                      onClick={() => handleSeasonChange(s.season_number)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        selectedSeason === s.season_number
                          ? 'bg-white text-black shadow-sm'
                          : 'bg-[#181920] hover:bg-[#20222b] text-zinc-300'
                      }`}
                    >
                      Season {s.season_number}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Episode 1 Parts Bar if available */}
            {data.parts && data.parts.length > 1 && (!data.episodesList || data.episodesList.length <= 1) && (
              <div className="mb-4 px-4 py-2.5 rounded-xl bg-[#12141c] border border-amber-400/20 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 flex-none">
                  <Play className="w-3 h-3 fill-amber-400" />
                  <span>Episode 1 Tersedia Lengkap:</span>
                </span>
                <div className="flex items-center gap-2">
                  {data.parts.map((p) => (
                    <button
                      key={p.part}
                      onClick={() => handlePlayDirect(selectedSeason, 1)}
                      className="px-3 py-1 rounded-lg text-xs font-bold bg-zinc-900 hover:bg-amber-400 hover:text-black text-zinc-300 border border-white/10 transition-colors"
                    >
                      {p.name || `Part ${p.part}`}
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-[11px] text-zinc-400 hidden sm:inline">
                  ⚡ Episode Full HD
                </span>
              </div>
            )}

            {/* Episodes 3-Column Responsive Grid */}
            {loadingSeason ? (
              <div className="py-16 text-center text-xs text-zinc-400 animate-pulse flex flex-col items-center justify-center gap-2.5">
                <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <span>Memuat episode Season {selectedSeason}...</span>
              </div>
            ) : episodesList.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 bg-black/20 rounded-xl border border-white/5 p-4">
                Klik "Mulai Putar" di atas untuk menonton Season {selectedSeason}. Server akan otomatis memuat episode terbaru.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-3.5">
                {episodesList.map((ep, idx) => {
                  const epNum = ep.episode_number || ep.episode || (idx + 1);
                  const epTitle = ep.name || ep.title || `Episode ${epNum}`;
                  const epThumb = ep.still_path
                    ? TmdbService.getImageUrl(ep.still_path, 'w500')
                    : (ep.thumbnail || posterUrl);

                  return (
                    <div
                      key={ep.id || epNum}
                      onClick={() => handlePlayDirect(selectedSeason, epNum)}
                      className="group relative flex gap-3 p-3 rounded-xl bg-[#13141b]/90 hover:bg-[#1a1b24] border border-white/[0.06] hover:border-white/20 cursor-pointer transition-all active:scale-[0.99] shadow-lg"
                    >
                      {/* Left: Thumbnail with EP X badge in bottom-right */}
                      <div className="relative w-28 sm:w-32 aspect-video rounded-lg overflow-hidden flex-none bg-zinc-900 border border-white/5">
                        <img
                          src={epThumb}
                          alt={epTitle}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = posterUrl;
                          }}
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors flex items-center justify-center">
                          <div className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all shadow-md">
                            <Play className="w-3.5 h-3.5 fill-black translate-x-0.5" />
                          </div>
                        </div>
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-black/90 text-white border border-white/10">
                          EP {epNum}
                        </span>
                      </div>

                      {/* Right: Title & 2-Line Synopsis */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <h4 className="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-white transition-colors line-clamp-1">
                          {epNum}. {epTitle}
                        </h4>
                        <p className="mt-1 text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {ep.overview || 'Tonton episode ini sekarang dalam kualitas HD.'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Similar Recommendations */}
        {similar.length > 0 && (
          <div className="mt-14 border-t border-white/[0.08] pt-8">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mb-4">
              Film Serupa yang Mungkin Anda Sukai
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              {similar.map((sim) => (
                <MovieCard
                  key={sim.id}
                  item={sim}
                  className="w-full"
                  onClick={(m) => {
                    const targetType = m.media_type === 'tv' ? 'tv' : 'movie';
                    navigate(`/${targetType}/${m.id}`);
                  }}
                  onPlay={(m) => {
                    const targetType = m.media_type === 'tv' ? 'tv' : 'movie';
                    navigate(`/watch/${targetType}/${m.id}`);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
