import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import Navbar from './components/Navbar';
import HeroBanner from './components/HeroBanner';
import ContentRail from './components/ContentRail';
import MovieCard from './components/MovieCard';

import { TmdbService } from './services/tmdbService';
import { DubIndoService } from './services/dubIndoService';
import { StorageService } from './services/storageService';

const DetailPage = lazy(() => import('./pages/DetailPage'));
const MovieWatchRoute = lazy(() =>
  import('./pages/WatchRouteWrapper').then((m) => ({ default: m.MovieWatchRoute }))
);
const TvWatchRoute = lazy(() =>
  import('./pages/WatchRouteWrapper').then((m) => ({ default: m.TvWatchRoute }))
);
const DubWatchRoute = lazy(() =>
  import('./pages/WatchRouteWrapper').then((m) => ({ default: m.DubWatchRoute }))
);

const SearchModal = lazy(() => import('./components/SearchModal'));
const WatchlistModal = lazy(() => import('./components/WatchlistModal'));
const HistoryModal = lazy(() => import('./components/HistoryModal'));

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

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#060709] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
    </div>
  );
}

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
  if (item.isDubIndo || item.streamUrl || item.isLatestUpload) return true;

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

function mergeUniqueById(existing, incoming) {
  const seen = new Set(existing.map((i) => `${i.media_type || 'x'}_${i.id}`));
  const merged = [...existing];
  for (const item of incoming || []) {
    const key = `${item.media_type || 'x'}_${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

function interleaveLists(listA = [], listB = []) {
  const out = [];
  const maxLen = Math.max(listA.length, listB.length);
  for (let i = 0; i < maxLen; i++) {
    if (listA[i]) out.push(listA[i]);
    if (listB[i]) out.push(listB[i]);
  }
  return out;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentYear = new Date().getFullYear();

  const [activeTab, setActiveTab] = useState('home');
  const [trendingWindow, setTrendingWindow] = useState('week'); // 'week' | 'day'

  // Live Catalog States
  const [cloudxLiveTitles, setCloudxLiveTitles] = useState(() => new Set());
  const [latestUpdates, setLatestUpdates] = useState([]);
  const [trendingDay, setTrendingDay] = useState([]);
  const [trendingWeek, setTrendingWeek] = useState([]);
  const [mcuMovies, setMcuMovies] = useState([]);
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

  // Category Sub-Filters
  const [updatesProviderFilter, setUpdatesProviderFilter] = useState('all');
  const [mcuSortOrder, setMcuSortOrder] = useState('newest'); // newest | chrono
  const [moviesFilter, setMoviesFilter] = useState('latest'); // latest | popular | toprated
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [genreResults, setGenreResults] = useState([]);
  const [loadingGenre, setLoadingGenre] = useState(false);

  const [seriesFilter, setSeriesFilter] = useState('netflix'); // netflix | popular | toprated
  const [indoFilter, setIndoFilter] = useState('netflix'); // netflix | bioskop | series | cloudx
  const [asiaFilter, setAsiaFilter] = useState('all'); // all | anime_tv | anime_movie | kdrama | cdrama
  const [dubFilter, setDubFilter] = useState('all'); // all | movies | series

  // User State
  const [watchlist, setWatchlist] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const watchlistIds = useMemo(() => new Set(watchlist.map((i) => String(i.id))), [watchlist]);

  // Modals State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const loadedTabsRef = useRef(new Set());

  // 2-Wave Fast Batched Initial Load (eliminates multi-MB eager JSONs & 18-call render storm)
  useEffect(() => {
    setWatchlist(StorageService.getWatchlist());
    setContinueWatching(StorageService.getContinueWatching());

    let cancelled = false;

    // Wave 1: Above-the-fold Hero + Trending + Live Multi-API Feed + Netflix Indonesia
    Promise.all([
      TmdbService.getTrendingWeek().catch(() => []),
      TmdbService.getTrending('day').catch(() => []),
      fetch('/api/cloudx-feed').then((res) => (res.ok ? res.json() : null)).catch(() => null),
      TmdbService.getIndoNetflixLatest().catch(() => []),
    ]).then(([weekList, dayList, feedData, netflixId]) => {
      if (cancelled) return;
      setTrendingWeek(weekList || []);
      setTrendingDay(dayList || []);
      if (feedData?.ok) {
        if (Array.isArray(feedData.titles)) {
          setCloudxLiveTitles(new Set(feedData.titles));
        }
        if (Array.isArray(feedData.items)) {
          setLatestUpdates(feedData.items);
        }
      }
      setIndoNetflixLatest(netflixId || []);
      setLoadingHome(false);
    });

    // Wave 2: Full Home Rails (MCU, Cinema, Series, Quick Dub Indo, Asia, Top Rated) in ONE batch
    Promise.all([
      TmdbService.getMarvelCinematicUniverse().catch(() => []),
      TmdbService.getNowPlaying2026(1).catch(() => []),
      TmdbService.getPopularMovies(1).catch(() => []),
      TmdbService.getNetflixGlobalSeries(1).catch(() => []),
      TmdbService.getPopularTV(1).catch(() => []),
      TmdbService.getIndoBioskopLatest(1).catch(() => []),
      TmdbService.getIndoSeriesLatest(1).catch(() => []),
      TmdbService.getAnime().catch(() => []),
      TmdbService.getKDrama().catch(() => []),
      TmdbService.getTopRatedMovies().catch(() => []),
      TmdbService.getTopRatedTV().catch(() => []),
      DubIndoService.getQuickHomeMovies(20).catch(() => []),
    ]).then(
      ([
        mcu,
        nowPlaying,
        popMov,
        nfSeries,
        popTv,
        indoMov,
        indoTv,
        anime,
        kdrama,
        topMov,
        topTv,
        quickDub,
      ]) => {
        if (cancelled) return;
        setMcuMovies(mcu || []);
        setNowPlaying2026(nowPlaying || []);
        setPopularMovies(popMov || []);
        setNetflixGlobalSeries(nfSeries || []);
        setPopularTV(popTv || []);
        setIndoBioskopLatest(indoMov || []);
        setIndoSeriesLatest(indoTv || []);
        setAnimeList(anime || []);
        setKdramaList(kdrama || []);
        setTopRatedMovies(topMov || []);
        setTopRatedTV(topTv || []);
        setDubIndoMovies((prev) => (prev.length > 20 ? prev : quickDub || []));
      }
    );

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // On-demand heavy loaders when user opens specific category tabs
  useEffect(() => {
    if (loadedTabsRef.current.has(activeTab)) return;

    if (activeTab === 'dubindo') {
      loadedTabsRef.current.add('dubindo');
      DubIndoService.getTopMovies(500).then((items) => setDubIndoMovies(items || [])).catch(() => {});
      DubIndoService.getSeries().then((items) => setDubIndoSeries(items || [])).catch(() => {});
    } else if (activeTab === 'indonesia') {
      loadedTabsRef.current.add('indonesia');
      import('./services/cloudXService')
        .then(({ CloudXService }) => CloudXService.getCatalog())
        .then((items) => setCloudXData(items || []))
        .catch(() => {});
    } else if (activeTab === 'asia') {
      loadedTabsRef.current.add('asia');
      TmdbService.getAnimeMovies().then((items) => setAnimeMovies(items || [])).catch(() => {});
      TmdbService.getCDrama().then((items) => setCdramaList(items || [])).catch(() => {});
    } else if (activeTab === 'movies') {
      loadedTabsRef.current.add('movies');
      Promise.all([
        TmdbService.getNowPlaying2026(2).catch(() => []),
        TmdbService.getPopularMovies(2).catch(() => []),
      ]).then(([np2, pop2]) => {
        setNowPlaying2026((prev) => mergeUniqueById(prev, np2));
        setPopularMovies((prev) => mergeUniqueById(prev, pop2));
      });
    } else if (activeTab === 'series') {
      loadedTabsRef.current.add('series');
      Promise.all([
        TmdbService.getNetflixGlobalSeries(2).catch(() => []),
        TmdbService.getPopularTV(2).catch(() => []),
      ]).then(([nf2, tv2]) => {
        setNetflixGlobalSeries((prev) => mergeUniqueById(prev, nf2));
        setPopularTV((prev) => mergeUniqueById(prev, tv2));
      });
    }
  }, [activeTab]);

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

  const activeTrending = useMemo(() => {
    if (trendingWindow === 'day') {
      return trendingDay.length > 0 ? trendingDay : trendingWeek;
    }
    return trendingWeek.length > 0 ? trendingWeek : trendingDay;
  }, [trendingWindow, trendingDay, trendingWeek]);

  // Hero Banner prioritizes live confirmed playable releases from active Trending window
  const heroItems = useMemo(() => {
    const withBackdrop = (activeTrending || []).filter((i) => i && i.backdrop_path);
    const ready = withBackdrop
      .filter((i) => isReadyToStream(i, cloudxLiveTitles))
      .sort((a, b) => (isInCloudXLive(b, cloudxLiveTitles) ? 1 : 0) - (isInCloudXLive(a, cloudxLiveTitles) ? 1 : 0));
    if (ready.length > 0) return ready.slice(0, 5);
    return withBackdrop.slice(0, 5);
  }, [activeTrending, cloudxLiveTitles]);

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

    const cleanTrending = filterUnique(prioritizeReady(activeTrending, true));
    const cleanUpdates = filterUnique(latestUpdates);
    const cleanMcu = filterUnique(mcuMovies);
    const cleanNetflixIndo = filterUnique(indoNetflixLatest);
    const cleanBioskop = filterUnique([
      ...prioritizeReady(nowPlaying2026, true),
      ...popularMovies,
    ]);
    const cleanSeries = filterUnique([...netflixGlobalSeries, ...popularTV]);
    const cleanIndoPilihan = filterUnique(interleaveLists(indoBioskopLatest, indoSeriesLatest));
    const cleanDubIndo = filterUnique(dubIndoMovies);
    const cleanAsia = filterUnique(interleaveLists(animeList, kdramaList));
    const cleanTopRated = filterUnique(interleaveLists(topRatedMovies, topRatedTV));

    return {
      trending: cleanTrending,
      updates: cleanUpdates,
      mcu: cleanMcu,
      netflixIndo: cleanNetflixIndo,
      bioskop: cleanBioskop,
      series: cleanSeries,
      indoPilihan: cleanIndoPilihan,
      dubIndo: cleanDubIndo,
      asia: cleanAsia,
      topRated: cleanTopRated,
    };
  }, [
    cloudxLiveTitles,
    activeTrending,
    latestUpdates,
    mcuMovies,
    indoNetflixLatest,
    nowPlaying2026,
    popularMovies,
    netflixGlobalSeries,
    popularTV,
    indoBioskopLatest,
    indoSeriesLatest,
    dubIndoMovies,
    animeList,
    kdramaList,
    topRatedMovies,
    topRatedTV,
  ]);

  // Handlers
  const handleToggleWatchlist = useCallback((item) => {
    const res = StorageService.toggleWatchlist(item);
    setWatchlist(res.items);
  }, []);

  const handleClearWatchlist = useCallback(() => {
    if (window.confirm('Kosongkan semua daftar Watchlist?')) {
      localStorage.removeItem('mcmovies_watchlist');
      setWatchlist([]);
    }
  }, []);

  const handleRemoveHistoryItem = useCallback((id) => {
    const updated = StorageService.removeContinueWatching(id);
    setContinueWatching(updated);
  }, []);

  const handleClearHistory = useCallback(() => {
    if (window.confirm('Kosongkan seluruh riwayat nonton?')) {
      localStorage.removeItem('mcmovies_continue_watching');
      setContinueWatching([]);
    }
  }, []);

  const handlePlayMovie = useCallback(
    (item) => {
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
    },
    [navigate]
  );

  const handleOpenDetail = useCallback(
    (item) => {
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
    },
    [navigate]
  );

  const handleTabChange = useCallback(
    (tabId) => {
      setActiveTab(tabId);
      if (location.pathname !== '/') {
        navigate('/');
      }
    },
    [location.pathname, navigate]
  );

  // Derived Grid Data
  const updatesProviders = useMemo(() => {
    const map = new Map();
    for (const it of latestUpdates) {
      if (it.provider && !map.has(it.provider)) {
        map.set(it.provider, it.badge || it.provider);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [latestUpdates]);

  const updatesGridItems = useMemo(() => {
    if (updatesProviderFilter === 'all') return latestUpdates;
    return latestUpdates.filter((it) => it.provider === updatesProviderFilter);
  }, [latestUpdates, updatesProviderFilter]);

  const mcuGridItems = useMemo(() => {
    const list = [...mcuMovies];
    if (mcuSortOrder === 'chrono') {
      list.sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''));
    } else {
      list.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));
    }
    return list;
  }, [mcuMovies, mcuSortOrder]);

  const moviesGridItems = selectedGenre
    ? genreResults
    : moviesFilter === 'latest'
      ? nowPlaying2026.length > 0
        ? nowPlaying2026
        : popularMovies
      : moviesFilter === 'popular'
        ? popularMovies
        : topRatedMovies;

  const seriesGridItems =
    seriesFilter === 'netflix'
      ? netflixGlobalSeries.length > 0
        ? netflixGlobalSeries
        : popularTV
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
    location.pathname.startsWith('/detail');

  return (
    <div className="min-h-screen bg-[#060709] text-zinc-100 flex flex-col selection:bg-white selection:text-black">
      {!hideNavbar && (
        <Navbar
          activeTab={location.pathname === '/' ? activeTab : ''}
          onTabChange={handleTabChange}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenWatchlist={() => setIsWatchlistOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          watchlistCount={watchlist.length}
          historyCount={continueWatching.length}
        />
      )}

      <div className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Routes>
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
                        trendingLabel={trendingWindow === 'day' ? 'TRENDING HARI INI' : 'TRENDING MINGGU INI'}
                        onPlayClick={handlePlayMovie}
                        onInfoClick={handleOpenDetail}
                        watchlistIds={watchlistIds}
                        onToggleWatchlist={handleToggleWatchlist}
                      />

                      {continueWatching.length > 0 && (
                        <ContentRail
                          title="Lanjutkan Menonton"
                          subtitle="Lanjutkan tayangan terakhir yang Anda tonton"
                          eager
                          items={continueWatching}
                          onMovieClick={handleOpenDetail}
                          onPlayClick={handlePlayMovie}
                          watchlistIds={watchlistIds}
                          onToggleWatchlist={handleToggleWatchlist}
                          onExploreMore={() => setIsHistoryOpen(true)}
                        />
                      )}

                      <ContentRail
                        title="Trending Sekarang"
                        subtitle={
                          trendingWindow === 'day'
                            ? 'Judul paling populer hari ini di seluruh dunia'
                            : 'Rilisan terpanas dan paling banyak ditonton minggu ini'
                        }
                        eager
                        items={deduplicatedHomeRails.trending}
                        loading={loadingHome}
                        showRank
                        headerRight={
                          <div className="inline-flex items-center p-0.5 rounded-full bg-zinc-900/90 border border-white/10">
                            {[
                              { id: 'week', label: 'Minggu Ini' },
                              { id: 'day', label: 'Hari Ini' },
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => setTrendingWindow(opt.id)}
                                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                                  trendingWindow === opt.id
                                    ? 'bg-white text-black shadow-sm'
                                    : 'text-zinc-400 hover:text-white'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        }
                        onMovieClick={handleOpenDetail}
                        onPlayClick={handlePlayMovie}
                        watchlistIds={watchlistIds}
                        onToggleWatchlist={handleToggleWatchlist}
                      />

                      <ContentRail
                        title="Update Terbaru"
                        subtitle="Upload film dan series terbaru dari seluruh server API aktif"
                        items={deduplicatedHomeRails.updates}
                        loading={loadingHome}
                        onMovieClick={handleOpenDetail}
                        onPlayClick={handlePlayMovie}
                        watchlistIds={watchlistIds}
                        onToggleWatchlist={handleToggleWatchlist}
                        onExploreMore={() => {
                          setUpdatesProviderFilter('all');
                          setActiveTab('updates');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      />

                      <ContentRail
                        title="Marvel Cinematic Universe"
                        subtitle="Koleksi lengkap seluruh film layar lebar Marvel Cinematic Universe"
                        items={deduplicatedHomeRails.mcu}
                        onMovieClick={handleOpenDetail}
                        onPlayClick={handlePlayMovie}
                        watchlistIds={watchlistIds}
                        onToggleWatchlist={handleToggleWatchlist}
                        onExploreMore={() => {
                          setActiveTab('mcu');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      />

                      <ContentRail
                        title="Film & Series Indonesia Terbaru di Netflix 🇮🇩"
                        subtitle="Rilisan terbaru Indonesia di Netflix lengkap dengan film dan serial pilihan"
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
                        title={`Film Bioskop Terbaru ${currentYear}`}
                        subtitle="Film layar lebar terbaru & box office dunia yang sudah tayang"
                        items={deduplicatedHomeRails.bioskop}
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
                        title="Serial TV & Web Series Populer"
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
                        title="Film & Series Indonesia Pilihan"
                        subtitle="Bioskop tanah air dan serial populer karya sineas Indonesia"
                        items={deduplicatedHomeRails.indoPilihan}
                        onMovieClick={handleOpenDetail}
                        onPlayClick={handlePlayMovie}
                        watchlistIds={watchlistIds}
                        onToggleWatchlist={handleToggleWatchlist}
                        onExploreMore={() => {
                          setIndoFilter('bioskop');
                          setActiveTab('indonesia');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      />

                      <ContentRail
                        title="Koleksi Dubbing Indonesia"
                        subtitle="Film dan serial pilihan dengan audio dubbing Bahasa Indonesia resmi durasi penuh"
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
                        subtitle="Film dan serial terbaik pilihan penonton global"
                        items={deduplicatedHomeRails.topRated}
                        onMovieClick={handleOpenDetail}
                        onPlayClick={handlePlayMovie}
                        watchlistIds={watchlistIds}
                        onToggleWatchlist={handleToggleWatchlist}
                      />
                    </>
                  )}

                  {/* UPDATE TERBARU (ALL API UPLOADS GRID) */}
                  {activeTab === 'updates' && (
                    <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
                      <button
                        onClick={() => setActiveTab('home')}
                        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Kembali ke Beranda</span>
                      </button>

                      <div className="mb-6">
                        <div className="flex flex-wrap items-center gap-3">
                          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            Update Terbaru
                          </h1>
                          {updatesGridItems.length > 0 && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
                              {updatesGridItems.length} Judul
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 mt-1">
                          Upload terbaru dari seluruh server API streaming aktif.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-6">
                        <button
                          onClick={() => setUpdatesProviderFilter('all')}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            updatesProviderFilter === 'all'
                              ? 'bg-white text-black shadow-md'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          Semua API ({latestUpdates.length})
                        </button>
                        {updatesProviders.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setUpdatesProviderFilter(p.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                              updatesProviderFilter === p.id
                                ? 'bg-white text-black shadow-md'
                                : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08]'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>

                      {updatesGridItems.length === 0 && loadingHome ? (
                        <GridSkeleton />
                      ) : updatesGridItems.length === 0 ? (
                        <div className="py-16 text-center text-sm text-zinc-400 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                          Belum ada update terbaru tersedia saat ini.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                          {updatesGridItems.map((item) => (
                            <MovieCard
                              key={`upd-${item.media_type}-${item.id}`}
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

                  {/* MARVEL CINEMATIC UNIVERSE COMPLETE GRID */}
                  {activeTab === 'mcu' && (
                    <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
                      <button
                        onClick={() => setActiveTab('home')}
                        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Kembali ke Beranda</span>
                      </button>

                      <div className="mb-6">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600/25 text-red-300 border border-red-500/30 mb-2">
                          Marvel Studios
                        </span>
                        <div className="flex flex-wrap items-center gap-3">
                          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            Marvel Cinematic Universe
                          </h1>
                          {mcuGridItems.length > 0 && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
                              {mcuGridItems.length} Film Lengkap
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
                          Koleksi lengkap film Marvel Cinematic Universe dari Iron Man (2008) hingga rilisan terbaru.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-6">
                        {[
                          { id: 'newest', label: 'Terbaru ke Lama' },
                          { id: 'chrono', label: 'Urutan Rilis (Iron Man -> Terbaru)' },
                        ].map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setMcuSortOrder(s.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                              mcuSortOrder === s.id
                                ? 'bg-white text-black shadow-md'
                                : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08]'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>

                      {mcuGridItems.length === 0 ? (
                        <GridSkeleton />
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                          {mcuGridItems.map((item) => (
                            <MovieCard
                              key={`mcu-${item.id}`}
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

                  {/* 2. FILM (MOVIES) */}
                  {activeTab === 'movies' && (
                    <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
                      <div className="mb-6">
                        <div className="flex flex-wrap items-center gap-3">
                          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            Koleksi Film Bioskop
                          </h1>
                          {moviesGridItems.length > 0 && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
                              {moviesGridItems.length} Judul
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 mt-1">
                          Rilisan {currentYear} terbaru, box office populer, dan film rating tertinggi di McMovies.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        {[
                          { id: 'latest', label: `Terbaru ${currentYear}` },
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
                          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            Serial TV & Web Series
                          </h1>
                          {seriesGridItems.length > 0 && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
                              {seriesGridItems.length} Judul
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 mt-1">
                          Serial Netflix terbaru dan TV shows populer dengan episode lengkap.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-6">
                        {[
                          { id: 'netflix', label: `Netflix Terbaru ${currentYear}` },
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
                          🇮🇩 Rilis Terbaru {currentYear - 1} & {currentYear}
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
                          Koleksi resmi rilis terbaru Indonesia di Netflix, bioskop tanah air, dan series lokal.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-6">
                        {[
                          { id: 'netflix', label: `Terbaru di Netflix ${currentYear} 🇮🇩` },
                          { id: 'bioskop', label: 'Bioskop Indonesia' },
                          { id: 'series', label: 'Series Indonesia' },
                          { id: 'cloudx', label: 'Katalog Indonesia Lainnya' },
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
                          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            Anime & Drama Asia
                          </h1>
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
                          Film layar lebar dan serial pilihan dengan audio dubbing Bahasa Indonesia resmi berdurasi penuh.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-6">
                        {[
                          { id: 'all', label: `Semua Dub Indo (${dubIndoMovies.length + dubIndoSeries.length})` },
                          { id: 'movies', label: `Film Dub Indo (${dubIndoMovies.length})` },
                          { id: 'series', label: `Series Dub Indo (${dubIndoSeries.length})` },
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
        </Suspense>
      </div>

      {/* Clean Minimal Footer */}
      <footer className="mt-auto border-t border-white/[0.08] bg-[#060709] py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-black text-xs tracking-tighter">
              MC
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white">McMovies</span>
              <p className="text-xs text-zinc-400">Film, Series & Dub Indo HD Streaming</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-zinc-500">
            <span>McMovies &copy; {currentYear}</span>
          </div>
        </div>
      </footer>

      <Suspense fallback={null}>
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
      </Suspense>
    </div>
  );
}
