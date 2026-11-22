import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { FileCode } from 'lucide-react';

import Navbar from './components/Navbar';
import HeroBanner from './components/HeroBanner';
import ContentRail from './components/ContentRail';
import MovieCard from './components/MovieCard';
import SearchModal from './components/SearchModal';
import WatchlistModal from './components/WatchlistModal';
import HistoryModal from './components/HistoryModal';
import SettingsModal from './components/SettingsModal';

import DetailPage from './pages/DetailPage';
import SwaggerDocsPage from './pages/SwaggerDocsPage';
import { MovieWatchRoute, TvWatchRoute, DubWatchRoute } from './pages/WatchRouteWrapper';

import { TmdbService } from './services/tmdbService';
import { DubIndoService } from './services/dubIndoService';
import { MovieBoxService } from './services/movieBoxService';
import { CloudXService } from './services/cloudXService';
import { StorageService } from './services/storageService';

const GENRES = [
  { id: '28', name: 'Action' },
  { id: '12', name: 'Adventure' },
  { id: '16', name: 'Animation' },
  { id: '35', name: 'Comedy' },
  { id: '80', name: 'Crime' },
  { id: '18', name: 'Drama' },
  { id: '14', name: 'Fantasy' },
  { id: '27', name: 'Horror' },
  { id: '878', name: 'Sci-Fi' },
  { id: '53', name: 'Thriller' },
];

function GridSkeleton({ count = 12 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
      {Array.from({ length: count }, (_, idx) => (
        <div key={idx} className="space-y-2.5">
          <div className="aspect-[2/3] w-full rounded-2xl bg-white/[0.06] border border-white/[0.06] animate-pulse" />
          <div className="h-3.5 w-3/4 rounded bg-white/[0.07] animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-white/[0.05] animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function normalizeTitleClient(raw) {
  return (raw || '')
    .toLowerCase()
    .replace(/\b(sub\s*indo|subtitle\s*indonesia|dub\s*indo|dubbing\s*indonesia|completed|ongoing|batch|imax|extended|uncut|web-dl|bluray|hd|4k|uhd)\b/gi, ' ')
    .replace(/\b(season|s)\s*\d+\b/gi, ' ')
    .replace(/\(\s*(19\d\d|20\d\d)(?:\s*[-–]\s*(19\d\d|20\d\d))?\s*\)/g, ' ')
    .replace(/\b(19\d\d|20\d\d)\b$/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInCloudXLive(item, liveSet) {
  if (!item || !liveSet || liveSet.size === 0) return false;
  const t1 = normalizeTitleClient(item.title || item.name);
  const t2 = normalizeTitleClient(item.original_title || item.original_name);
  return Boolean((t1 && liveSet.has(t1)) || (t2 && liveSet.has(t2)));
}

function isReadyToStream(item, liveSet) {
  if (!item) return false;
  if (isInCloudXLive(item, liveSet)) return true;
  if (item.isDubIndo || item.streamUrl) return true;

  const relDate = item.release_date || item.first_air_date || '';
  if (!relDate) return true;
  const ts = Date.parse(relDate);
  if (!Number.isFinite(ts)) return true;
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (item.media_type === 'tv') {
    return ageDays >= 5;
  }
  return ageDays >= 21;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('home');

  // Live Nov 2026 & Curated Catalogs
  const [cloudxLiveTitles, setCloudxLiveTitles] = useState(() => new Set());
  const [trending, setTrending] = useState([]);
  const [indoNetflixLatest, setIndoNetflixLatest] = useState([]);
  const [indoBioskopLatest, setIndoBioskopLatest] = useState([]);
  const [indoSeriesLatest, setIndoSeriesLatest] = useState([]);
  const [nowPlaying2026, setNowPlaying2026] = useState([]);
  const [netflixGlobalSeries, setNetflixGlobalSeries] = useState([]);
  const [popularMovies, setPopularMovies] = useState([]);
  const [topRatedMovies, setTopRatedMovies] = useState([]);
  const [popularTV, setPopularTV] = useState([]);
  const [topRatedTV, setTopRatedTV] = useState([]);
  const [animeList, setAnimeList] = useState([]);
  const [animeMovies, setAnimeMovies] = useState([]);
  const [kdramaList, setKdramaList] = useState([]);
  const [cdramaList, setCdramaList] = useState([]);
  const [dubIndoMovies, setDubIndoMovies] = useState([]);
  const [dubIndoSeries, setDubIndoSeries] = useState([]);
  const [cloudXData, setCloudXData] = useState([]);
  const [loadingHome, setLoadingHome] = useState(true);

  // Category sub-filters
  const [moviesFilter, setMoviesFilter] = useState('latest2026'); // latest2026 | popular | toprated
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [genreResults, setGenreResults] = useState([]);
  const [loadingGenre, setLoadingGenre] = useState(false);

  const [seriesFilter, setSeriesFilter] = useState('netflix'); // netflix | popular | toprated
  const [indoFilter, setIndoFilter] = useState('netflix'); // netflix | bioskop | series | cloudx
  const [asiaFilter, setAsiaFilter] = useState('all'); // all | anime_tv | anime_movie | kdrama | cdrama
  const [dubFilter, setDubFilter] = useState('all'); // all | movies | series

  // User state
  const [watchlist, setWatchlist] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const watchlistIds = new Set(watchlist.map((i) => String(i.id)));

  // Modals state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Fetch all live catalogs on mount
  useEffect(() => {
    setWatchlist(StorageService.getWatchlist());
    setContinueWatching(StorageService.getContinueWatching());
    setLoadingHome(true);

    // Fetch live CloudX playable titles feed in background so Hero & Trending prioritize confirmed playable releases
    fetch('/api/cloudx-feed')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.titles)) {
          setCloudxLiveTitles(new Set(data.titles));
        }
      })
      .catch(() => {});

    // 1. Live Trending Nov 2026 (Day + Week merged cleanly)
    Promise.all([
      TmdbService.getTrending('day').catch(() => []),
      TmdbService.getTrendingWeek().catch(() => []),
    ]).then(([dayList, weekList]) => {
      const seen = new Set();
      const merged = [];
      for (const item of [...dayList, ...weekList]) {
        const k = `${item.media_type}_${item.id}`;
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(item);
        }
      }
      setTrending(merged);
      setLoadingHome(false);
    });

    // 2. Real Latest Netflix Indonesia Releases (2025 - Nov 2026) & Indonesian Cinema
    TmdbService.getIndoNetflixLatest()
      .then((items) => setIndoNetflixLatest(items))
      .catch((e) => console.error('Indo Netflix err:', e));

    TmdbService.getIndoBioskopLatest()
      .then((items) => setIndoBioskopLatest(items))
      .catch((e) => console.error('Indo Bioskop err:', e));

    TmdbService.getIndoSeriesLatest()
      .then((items) => setIndoSeriesLatest(items))
      .catch((e) => console.error('Indo Series err:', e));

    // 3. Global 2026 Cinema & Popular Series
    TmdbService.getNowPlaying2026()
      .then((items) => setNowPlaying2026(items))
      .catch(() => {});

    TmdbService.getNetflixGlobalSeries()
      .then((items) => setNetflixGlobalSeries(items))
      .catch(() => {});

    TmdbService.getPopularMovies()
      .then((items) => setPopularMovies(items))
      .catch(() => {});

    TmdbService.getTopRatedMovies()
      .then((items) => setTopRatedMovies(items))
      .catch(() => {});

    TmdbService.getPopularTV()
      .then((items) => setPopularTV(items))
      .catch(() => {});

    TmdbService.getTopRatedTV()
      .then((items) => setTopRatedTV(items))
      .catch(() => {});

    // 4. Anime & Asian Drama
    TmdbService.getAnime().then(setAnimeList).catch(() => {});
    TmdbService.getAnimeMovies().then(setAnimeMovies).catch(() => {});
    TmdbService.getKDrama().then(setKdramaList).catch(() => {});
    TmdbService.getCDrama().then(setCdramaList).catch(() => {});

    // 5. Dub Indo & CloudX Curated Catalog
    DubIndoService.getTopMovies(60).then(setDubIndoMovies).catch(() => {});
    DubIndoService.getSeries().then(setDubIndoSeries).catch(() => {});
    CloudXService.getCatalog().then((items) => setCloudXData(items || [])).catch(() => {});

    // Warm MovieBox cache silently in background for instant detail lookups
    MovieBoxService.getFullCatalog().catch(() => {});

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setContinueWatching(StorageService.getContinueWatching());
  }, [location.pathname]);

  useEffect(() => {
    if (selectedGenre && activeTab === 'movies') {
      setLoadingGenre(true);
      TmdbService.getByGenre(selectedGenre.id, 'movie')
        .then((items) => setGenreResults(items))
        .catch(() => setGenreResults([]))
        .finally(() => setLoadingGenre(false));
    }
  }, [selectedGenre, activeTab]);

  // Hero Banner prioritizes live confirmed playable Nov 2026 releases
  const heroItems = useMemo(() => {
    const withBackdrop = (trending || []).filter((i) => i && i.backdrop_path);
    const ready = withBackdrop
      .filter((i) => isReadyToStream(i, cloudxLiveTitles))
      .sort((a, b) => (isInCloudXLive(b, cloudxLiveTitles) ? 1 : 0) - (isInCloudXLive(a, cloudxLiveTitles) ? 1 : 0));
    if (ready.length > 0) return ready.slice(0, 5);
    return withBackdrop.slice(0, 5);
  }, [trending, cloudxLiveTitles]);

  // Sequential Cross-Rail Deduplication: guarantees ZERO duplicate titles across all Home rails
  const deduplicatedHomeRails = useMemo(() => {
    const seen = new Set();
    const normalizeKey = (item) => {
      if (!item) return { title: '', id: '' };
      const title = (item.title || item.name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const id = String(item.tmdbId || item.id || '');
      return { title, id };
    };

    const filterUnique = (list) => {
      if (!Array.isArray(list)) return [];
      const result = [];
      for (const item of list) {
        if (!item) continue;
        const { title, id } = normalizeKey(item);
        if (title && seen.has(`t:${title}`)) continue;
        if (id && seen.has(`i:${id}`)) continue;

        if (title) seen.add(`t:${title}`);
        if (id) seen.add(`i:${id}`);
        result.push(item);
      }
      return result;
    };

    const prioritizeReady = (list, dropUnreadyTheatrical = false) => {
      const ready = [];
      const fallback = [];
      for (const item of list || []) {
        if (isReadyToStream(item, cloudxLiveTitles)) {
          ready.push(item);
        } else if (!dropUnreadyTheatrical || item.media_type === 'tv') {
          fallback.push(item);
        }
      }
      ready.sort((a, b) => (isInCloudXLive(b, cloudxLiveTitles) ? 1 : 0) - (isInCloudXLive(a, cloudxLiveTitles) ? 1 : 0));
      return dropUnreadyTheatrical ? (ready.length >= 6 ? ready : [...ready, ...fallback]) : [...ready, ...fallback];
    };

    const cleanTrending = filterUnique(prioritizeReady(trending, true));
    const cleanNetflixIndo = filterUnique(indoNetflixLatest);
    const cleanBioskop2026 = filterUnique([
      ...prioritizeReady(nowPlaying2026, true),
      ...popularMovies,
    ]);
    const cleanSeries = filterUnique([...netflixGlobalSeries, ...popularTV]);
    const cleanDubIndo = filterUnique(dubIndoMovies);

    // Interleave Anime + K-Drama neatly
    const asiaCombined = [];
    const maxLen = Math.max(animeList.length, kdramaList.length);
    for (let i = 0; i < maxLen; i++) {
      if (animeList[i]) asiaCombined.push(animeList[i]);
      if (kdramaList[i]) asiaCombined.push(kdramaList[i]);
    }
    const cleanAsia = filterUnique(asiaCombined);
    const cleanTopRated = filterUnique(topRatedMovies);

    return {
      trending: cleanTrending,
      netflixIndo: cleanNetflixIndo,
      bioskop2026: cleanBioskop2026,
      series: cleanSeries,
      dubIndo: cleanDubIndo,
      asia: cleanAsia,
      topRated: cleanTopRated,
    };
  }, [
    cloudxLiveTitles,
    trending,
    indoNetflixLatest,
    nowPlaying2026,
    popularMovies,
    netflixGlobalSeries,
    popularTV,
    dubIndoMovies,
    animeList,
    kdramaList,
    topRatedMovies,
  ]);

  // Handlers
  const handleToggleWatchlist = (item) => {
    const res = StorageService.toggleWatchlist(item);
    setWatchlist(res.items);
  };

  const handleClearWatchlist = () => {
    if (window.confirm('Kosongkan semua daftar Watchlist?')) {
      localStorage.removeItem('mcmovies_watchlist');
      setWatchlist([]);
    }
  };

  const handleRemoveHistoryItem = (id) => {
    const updated = StorageService.removeContinueWatching(id);
    setContinueWatching(updated);
  };

  const handleClearHistory = () => {
    if (window.confirm('Kosongkan seluruh riwayat nonton?')) {
      localStorage.removeItem('mcmovies_continue_watching');
      setContinueWatching([]);
    }
  };

  const handlePlayMovie = (item) => {
    if (!item) return;
    const playId = item.tmdbId || item.id;
    const isSeries =
      item.media_type === 'tv' ||
      item.type === 'series' ||
      item.category === 'Film Series' ||
      Boolean(item.first_air_date) ||
      (Array.isArray(item.episodes) && item.episodes.length > 0);

    if (item.isDubIndo) {
      navigate(`/watch/dub/${item.id}`, { state: { item } });
    } else if (isSeries) {
      const s = item.selectedSeason || item.season || 1;
      const e = item.selectedEpisode || item.episode || 1;
      navigate(`/watch/tv/${playId}/${s}/${e}`, { state: { item } });
    } else {
      navigate(`/watch/movie/${playId}`, { state: { item } });
    }
  };

  const handleOpenDetail = (item) => {
    if (!item) return;
    const detailId = item.tmdbId || item.id;
    const isSeries =
      item.media_type === 'tv' ||
      item.type === 'series' ||
      item.category === 'Film Series' ||
      Boolean(item.first_air_date) ||
      (Array.isArray(item.episodes) && item.episodes.length > 0);

    if (item.isDubIndo || String(item.id).startsWith('dub_')) {
      navigate(`/dub/${item.id}`, { state: { item } });
    } else if (isSeries) {
      navigate(`/tv/${detailId}`, { state: { item } });
    } else {
      navigate(`/movie/${detailId}`, { state: { item } });
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (location.pathname !== '/') {
      navigate('/');
    }
  };

  // Helper for Category Grid Views
  const moviesGridItems = selectedGenre
    ? genreResults
    : moviesFilter === 'latest2026'
      ? (nowPlaying2026.length > 0 ? nowPlaying2026 : popularMovies)
      : moviesFilter === 'popular'
        ? popularMovies
        : topRatedMovies;

  const seriesGridItems =
    seriesFilter === 'netflix'
      ? (netflixGlobalSeries.length > 0 ? netflixGlobalSeries : popularTV)
      : seriesFilter === 'popular'
        ? popularTV
        : topRatedTV;

  const indonesiaGridItems =
    indoFilter === 'netflix'
      ? indoNetflixLatest
      : indoFilter === 'bioskop'
        ? indoBioskopLatest
        : indoFilter === 'series'
          ? indoSeriesLatest
          : cloudXData.filter((i) => i.isIndo);

  const asiaGridItems = useMemo(() => {
    if (asiaFilter === 'anime_tv') return animeList;
    if (asiaFilter === 'anime_movie') return animeMovies;
    if (asiaFilter === 'kdrama') return kdramaList;
    if (asiaFilter === 'cdrama') return cdramaList;
    const seen = new Set();
    return [...animeList, ...kdramaList, ...animeMovies, ...cdramaList].filter((item) => {
      const k = `${item.media_type || 'x'}_${item.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [asiaFilter, animeList, animeMovies, kdramaList, cdramaList]);

  const dubGridItems =
    dubFilter === 'movies'
      ? dubIndoMovies
      : dubFilter === 'series'
        ? dubIndoSeries
        : [...dubIndoMovies, ...dubIndoSeries];

  const hideNavbar =
    location.pathname.startsWith('/watch') ||
    location.pathname.startsWith('/movie') ||
    location.pathname.startsWith('/tv') ||
    location.pathname.startsWith('/dub') ||
    location.pathname.startsWith('/detail') ||
    location.pathname.startsWith('/swagger') ||
    location.pathname.startsWith('/api-docs');

  return (
    <div className="min-h-screen bg-[#060709] text-zinc-100 flex flex-col selection:bg-white selection:text-black">
      {!hideNavbar && (
        <Navbar
          activeTab={location.pathname === '/' ? activeTab : ''}
          onTabChange={handleTabChange}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenWatchlist={() => setIsWatchlistOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          watchlistCount={watchlist.length}
          historyCount={continueWatching.length}
        />
      )}

      <div className="flex-1">
        <Routes>
          <Route path="/swagger" element={<SwaggerDocsPage />} />
          <Route path="/api-docs" element={<SwaggerDocsPage />} />

          <Route path="/movie/:id" element={<DetailPage type="movie" />} />
          <Route path="/tv/:id" element={<DetailPage type="tv" />} />
          <Route path="/dub/:id" element={<DetailPage type="dub" />} />
          <Route path="/detail/:type/:id" element={<DetailPage />} />

          <Route path="/watch/movie/:id" element={<MovieWatchRoute />} />
          <Route path="/watch/tv/:id" element={<TvWatchRoute />} />
          <Route path="/watch/tv/:id/:season/:episode" element={<TvWatchRoute />} />
          <Route path="/watch/dub/:id" element={<DubWatchRoute />} />

          <Route
            path="*"
            element={
              <main className="pb-20">
                {/* 1. BERANDA (HOME) */}
                {activeTab === 'home' && (
                  <>
                    <HeroBanner
                      items={heroItems}
                      onPlayClick={handlePlayMovie}
                      onInfoClick={handleOpenDetail}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                    />

                    {continueWatching.length > 0 && (
                      <ContentRail
                        title="Lanjutkan Menonton"
                        subtitle="Lanjutkan tayangan terakhir yang Anda tonton"
                        items={continueWatching}
                        onMovieClick={handleOpenDetail}
                        onPlayClick={handlePlayMovie}
                        watchlistIds={watchlistIds}
                        onToggleWatchlist={handleToggleWatchlist}
                        onExploreMore={() => setIsHistoryOpen(true)}
                      />
                    )}

                    <ContentRail
                      title="Trending Sekarang — November 2026"
                      subtitle="Rilisan terpanas dan paling banyak ditonton di dunia minggu ini"
                      items={deduplicatedHomeRails.trending}
                      loading={loadingHome}
                      showRank
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                    />

                    <ContentRail
                      title="Film & Series Indonesia Terbaru di Netflix 🇮🇩"
                      subtitle="Rilisan terbaru Indonesia di Netflix (2025–Nov 2026): Serangan Balik, Alas Roban, Ghost in the Cell, Abadi Nan Jaya"
                      items={deduplicatedHomeRails.netflixIndo}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                      onExploreMore={() => {
                        setIndoFilter('netflix');
                        setActiveTab('indonesia');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />

                    <ContentRail
                      title="Film Bioskop Terbaru 2026"
                      subtitle="Film layar lebar terbaru & box office dunia yang sudah tayang"
                      items={deduplicatedHomeRails.bioskop2026}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                      onExploreMore={() => {
                        setActiveTab('movies');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />

                    <ContentRail
                      title="Serial TV & Netflix Originals Populer"
                      subtitle="Serial TV terbaru & musim lengkap dari Netflix, HBO, Apple TV+, dan Prime"
                      items={deduplicatedHomeRails.series}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                      onExploreMore={() => {
                        setActiveTab('series');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />

                    <ContentRail
                      title="Koleksi Dubbing Indonesia"
                      subtitle="Film layar lebar resmi dengan audio Bahasa Indonesia — durasi penuh bebas iklan"
                      items={deduplicatedHomeRails.dubIndo}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                      onExploreMore={() => {
                        setActiveTab('dubindo');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />

                    <ContentRail
                      title="Anime & Drama Asia Pilihan"
                      subtitle="Anime simulcast Jepang, K-Drama hits, dan C-Drama terpopuler"
                      items={deduplicatedHomeRails.asia}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                      onExploreMore={() => {
                        setActiveTab('asia');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />

                    <ContentRail
                      title="Rating Tertinggi Sepanjang Masa"
                      subtitle="Karya sinema terbaik pilihan penonton global"
                      items={deduplicatedHomeRails.topRated}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                    />
                  </>
                )}

                {/* 2. FILM (MOVIES) */}
                {activeTab === 'movies' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
                    <div className="mb-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Koleksi Film Bioskop</h1>
                        {moviesGridItems.length > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
                            {moviesGridItems.length} Judul
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 mt-1">
                        Rilisan 2026 terbaru, box office populer, dan film rating tertinggi — langsung di CinemaOS Player.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {[
                        { id: 'latest2026', label: 'Terbaru 2026' },
                        { id: 'popular', label: 'Paling Populer' },
                        { id: 'toprated', label: 'Rating Tertinggi' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => {
                            setSelectedGenre(null);
                            setMoviesFilter(f.id);
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            !selectedGenre && moviesFilter === f.id
                              ? 'bg-white text-black shadow-md'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-3 mb-6">
                      <button
                        onClick={() => setSelectedGenre(null)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                          selectedGenre === null
                            ? 'bg-white text-black shadow-sm font-bold'
                            : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08]'
                        }`}
                      >
                        Semua Genre
                      </button>
                      {GENRES.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => setSelectedGenre(g)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                            selectedGenre?.id === g.id
                              ? 'bg-white text-black font-bold shadow-sm'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {g.name}
                        </button>
                      ))}
                    </div>

                    {loadingGenre || (moviesGridItems.length === 0 && loadingHome) ? (
                      <GridSkeleton />
                    ) : moviesGridItems.length === 0 ? (
                      <div className="py-16 text-center text-sm text-zinc-400 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                        Belum ada film ditemukan untuk filter ini.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                        {moviesGridItems.map((item) => (
                          <MovieCard
                            key={item.id}
                            item={item}
                            className="w-full"
                            onClick={handleOpenDetail}
                            onPlay={handlePlayMovie}
                            isWatchlisted={watchlistIds.has(String(item.id))}
                            onToggleWatchlist={handleToggleWatchlist}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. SERIES (TV SHOWS) */}
                {activeTab === 'series' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
                    <div className="mb-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Serial TV & Web Series</h1>
                        {seriesGridItems.length > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
                            {seriesGridItems.length} Judul
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 mt-1">
                        Serial Netflix terbaru 2025–2026 dan TV shows populer dengan episode lengkap.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-6">
                      {[
                        { id: 'netflix', label: 'Netflix Terbaru 2026' },
                        { id: 'popular', label: 'Serial Populer' },
                        { id: 'toprated', label: 'Rating Tertinggi' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setSeriesFilter(f.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            seriesFilter === f.id
                              ? 'bg-white text-black shadow-md'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {seriesGridItems.length === 0 && loadingHome ? (
                      <GridSkeleton />
                    ) : seriesGridItems.length === 0 ? (
                      <div className="py-16 text-center text-sm text-zinc-400 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                        Belum ada serial ditemukan untuk kategori ini.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                        {seriesGridItems.map((item) => (
                          <MovieCard
                            key={item.id}
                            item={item}
                            className="w-full"
                            onClick={handleOpenDetail}
                            onPlay={handlePlayMovie}
                            isWatchlisted={watchlistIds.has(String(item.id))}
                            onToggleWatchlist={handleToggleWatchlist}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. INDONESIA & NETFLIX */}
                {activeTab === 'indonesia' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
                    <div className="mb-6">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 mb-2">
                        🇮🇩 Update Rilis 2025 – November 2026
                      </span>
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                          Film & Series Indonesia Terbaru di Netflix
                        </h1>
                        {indonesiaGridItems.length > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
                            {indonesiaGridItems.length} Judul
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
                        Koleksi resmi rilis terbaru Indonesia di Netflix, bioskop tanah air, series lokal, dan indeks CloudX.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-6">
                      {[
                        { id: 'netflix', label: 'Terbaru di Netflix 2026 🇮🇩' },
                        { id: 'bioskop', label: 'Bioskop Indonesia 2025–2026' },
                        { id: 'series', label: 'Series Indonesia' },
                        { id: 'cloudx', label: 'Katalog CloudX Indonesia' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setIndoFilter(f.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            indoFilter === f.id
                              ? 'bg-white text-black shadow-md'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {indonesiaGridItems.length === 0 && loadingHome ? (
                      <GridSkeleton />
                    ) : indonesiaGridItems.length === 0 ? (
                      <div className="py-16 text-center text-sm text-zinc-400 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                        Belum ada tayangan Indonesia untuk filter ini.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                        {indonesiaGridItems.map((item) => (
                          <MovieCard
                            key={`${item.id}-${item.media_type || 'm'}`}
                            item={item}
                            className="w-full"
                            onClick={handleOpenDetail}
                            onPlay={handlePlayMovie}
                            isWatchlisted={watchlistIds.has(String(item.id))}
                            onToggleWatchlist={handleToggleWatchlist}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 5. ANIME & ASIA */}
                {activeTab === 'asia' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
                    <div className="mb-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Anime & Drama Asia</h1>
                        {asiaGridItems.length > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
                            {asiaGridItems.length} Judul
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 mt-1">
                        Serial anime Jepang, anime movie, K-Drama rating tinggi, dan C-Drama pilihan.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-6">
                      {[
                        { id: 'all', label: 'Semua' },
                        { id: 'anime_tv', label: 'Anime Series' },
                        { id: 'anime_movie', label: 'Anime Movie' },
                        { id: 'kdrama', label: 'K-Drama' },
                        { id: 'cdrama', label: 'C-Drama' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setAsiaFilter(f.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            asiaFilter === f.id
                              ? 'bg-white text-black shadow-md'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {asiaGridItems.length === 0 && loadingHome ? (
                      <GridSkeleton />
                    ) : asiaGridItems.length === 0 ? (
                      <div className="py-16 text-center text-sm text-zinc-400 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                        Belum ada judul Anime atau Drama Asia untuk filter ini.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                        {asiaGridItems.map((item) => (
                          <MovieCard
                            key={`${item.media_type || 'x'}_${item.id}`}
                            item={item}
                            className="w-full"
                            onClick={handleOpenDetail}
                            onPlay={handlePlayMovie}
                            isWatchlisted={watchlistIds.has(String(item.id))}
                            onToggleWatchlist={handleToggleWatchlist}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 6. DUB INDO */}
                {activeTab === 'dubindo' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
                    <div className="mb-6">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2">
                        🇮🇩 Audio Dubbing Bahasa Indonesia
                      </span>
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                          Koleksi Dubbing Indonesia
                        </h1>
                        {dubGridItems.length > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
                            {dubGridItems.length} Judul
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
                        Film layar lebar dan serial pilihan dengan audio dubbing Bahasa Indonesia resmi — durasi penuh langsung di pemutar McMovies.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-6">
                      {[
                        { id: 'all', label: 'Semua Dub Indo' },
                        { id: 'movies', label: 'Film Dub Indo' },
                        { id: 'series', label: 'Series Dub Indo' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setDubFilter(f.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            dubFilter === f.id
                              ? 'bg-white text-black shadow-md'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {dubGridItems.length === 0 && loadingHome ? (
                      <GridSkeleton />
                    ) : dubGridItems.length === 0 ? (
                      <div className="py-16 text-center text-sm text-zinc-400 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                        Belum ada koleksi Dub Indo ditemukan untuk filter ini.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                        {dubGridItems.map((item) => (
                          <MovieCard
                            key={item.id}
                            item={item}
                            className="w-full"
                            onClick={handleOpenDetail}
                            onPlay={handlePlayMovie}
                            isWatchlisted={watchlistIds.has(String(item.id))}
                            onToggleWatchlist={handleToggleWatchlist}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </main>
            }
          />
        </Routes>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.08] bg-[#060709] py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-black text-xs tracking-tighter">
              MC
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white">McMovies</span>
              <p className="text-xs text-zinc-400">Pure CinemaOS Native Player • Global Cinema & Dub Indo</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-zinc-500">
            <button
              onClick={() => navigate('/swagger')}
              className="hover:text-zinc-300 inline-flex items-center gap-1 transition-colors"
            >
              <FileCode className="w-3 h-3" />
              <span>API Docs</span>
            </button>
            <span>•</span>
            <span>McMovies &copy; {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>

      {isSearchOpen && (
        <SearchModal
          onClose={() => setIsSearchOpen(false)}
          onMovieClick={(item) => {
            setIsSearchOpen(false);
            handleOpenDetail(item);
          }}
          onPlayClick={(item) => {
            setIsSearchOpen(false);
            handlePlayMovie(item);
          }}
          watchlistIds={watchlistIds}
          onToggleWatchlist={handleToggleWatchlist}
        />
      )}

      {isWatchlistOpen && (
        <WatchlistModal
          isOpen={isWatchlistOpen}
          onClose={() => setIsWatchlistOpen(false)}
          items={watchlist}
          onMovieClick={(item) => {
            setIsWatchlistOpen(false);
            handleOpenDetail(item);
          }}
          onPlayClick={(item) => {
            setIsWatchlistOpen(false);
            handlePlayMovie(item);
          }}
          onToggleWatchlist={handleToggleWatchlist}
          onClearAll={handleClearWatchlist}
        />
      )}

      {isHistoryOpen && (
        <HistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          items={continueWatching}
          onPlay={(item) => {
            setIsHistoryOpen(false);
            handlePlayMovie(item);
          }}
          onRemoveItem={handleRemoveHistoryItem}
          onClearAll={handleClearHistory}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSettingsUpdated={() => {}}
        />
      )}
    </div>
  );
}
