import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  Flame,
  Clapperboard,
  Tv,
  Sparkles,
  Globe,
  Film,
  Play,
  Bookmark,
  History,
  TrendingUp,
  Award,
  Layers,
  Heart,
  ChevronRight,
  Filter,
  FileCode
} from 'lucide-react';

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

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('home');

  // Catalogs
  const [heroItems, setHeroItems] = useState([]);
  const [trending, setTrending] = useState([]);
  const [popularMovies, setPopularMovies] = useState([]);
  const [topRatedMovies, setTopRatedMovies] = useState([]);
  const [popularTV, setPopularTV] = useState([]);
  const [animeList, setAnimeList] = useState([]);
  const [animeMovies, setAnimeMovies] = useState([]);
  const [kdramaList, setKdramaList] = useState([]);
  const [cdramaList, setCdramaList] = useState([]);
  const [dubIndoMovies, setDubIndoMovies] = useState([]);
  const [dubIndoSeries, setDubIndoSeries] = useState([]);
  const [movieBoxData, setMovieBoxData] = useState([]);
  const [movieBoxCatalog, setMovieBoxCatalog] = useState(null);
  const [movieBoxSubFilter, setMovieBoxSubFilter] = useState('all');
  const [movieBoxLoading, setMovieBoxLoading] = useState(false);

  // Tab specific data
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [genreResults, setGenreResults] = useState([]);
  const [loadingGenre, setLoadingGenre] = useState(false);

  // Local storage state
  const [watchlist, setWatchlist] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const watchlistIds = new Set(watchlist.map(i => String(i.id)));

  // Modals state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initial Data Fetch
  useEffect(() => {
    // 1. Load local saved state
    setWatchlist(StorageService.getWatchlist());
    setContinueWatching(StorageService.getContinueWatching());

    // 2. Fetch TMDB content
    TmdbService.getTrending('day')
      .then((items) => {
        setTrending(items);
        setHeroItems(items.slice(0, 6));
      })
      .catch((e) => console.error('Trending fetch err:', e));

    TmdbService.getPopularMovies()
      .then((items) => setPopularMovies(items))
      .catch((e) => console.error('Popular movies err:', e));

    TmdbService.getTopRatedMovies()
      .then((items) => setTopRatedMovies(items))
      .catch((e) => console.error('Top rated err:', e));

    TmdbService.getPopularTV()
      .then((items) => setPopularTV(items))
      .catch((e) => console.error('Popular TV err:', e));

    TmdbService.getAnime()
      .then((items) => setAnimeList(items))
      .catch((e) => console.error('Anime err:', e));

    TmdbService.getAnimeMovies()
      .then((items) => setAnimeMovies(items))
      .catch((e) => console.error('Anime movies err:', e));

    TmdbService.getKDrama()
      .then((items) => setKdramaList(items))
      .catch((e) => console.error('KDrama err:', e));

    TmdbService.getCDrama()
      .then((items) => setCdramaList(items))
      .catch((e) => console.error('CDrama err:', e));

    // 3. Fetch Curated Top Dub Indo Movies
    DubIndoService.getTopMovies(60)
      .then((items) => setDubIndoMovies(items))
      .catch((e) => console.error('Dub Indo movies err:', e));

    DubIndoService.getSeries()
      .then((items) => setDubIndoSeries(items))
      .catch((e) => console.error('Dub Indo series err:', e));

    // Global keyboard listener for search (Ctrl+K or Cmd+K)
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update continue watching on route change
  useEffect(() => {
    setContinueWatching(StorageService.getContinueWatching());
  }, [location.pathname]);

  // Fetch Genre results
  useEffect(() => {
    if (selectedGenre && activeTab === 'movies') {
      setLoadingGenre(true);
      TmdbService.getByGenre(selectedGenre.id, 'movie')
        .then((items) => setGenreResults(items))
        .catch((e) => console.error('Genre err:', e))
        .finally(() => setLoadingGenre(false));
    }
  }, [selectedGenre, activeTab]);

  // Load MovieBox & Scraped Datasets immediately on mount
  useEffect(() => {
    if (!movieBoxCatalog) {
      setMovieBoxLoading(true);
      Promise.all([
        MovieBoxService.getFullCatalog(),
        MovieBoxService.getHomepage()
      ]).then(([catalog, homepageData]) => {
        setMovieBoxCatalog(catalog);
        setMovieBoxData(homepageData || []);
      }).catch(err => {
        console.error('Moviebox load error:', err);
      }).finally(() => {
        setMovieBoxLoading(false);
      });
    }
  }, [movieBoxCatalog]);

  // Watchlist handlers
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

  // Continue Watching handlers
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

  // Navigates to CinemaOS-style Watch Page
  const handlePlayMovie = (item) => {
    if (!item) return;
    const playId = item.tmdbId || item.id;
    if (item.isDubIndo) {
      navigate(`/watch/dub/${item.id}`, { state: { item } });
    } else if (item.media_type === 'tv' || item.type === 'series' || item.category === 'Film Series' || (item.episodes && item.episodes.length > 0)) {
      const s = item.selectedSeason || item.season || 1;
      const e = item.selectedEpisode || item.episode || 1;
      navigate(`/watch/tv/${playId}/${s}/${e}`, { state: { item } });
    } else {
      navigate(`/watch/movie/${playId}`, { state: { item } });
    }
  };

  // Navigates to dedicated Detail Page (Full Page, no popup modal)
  const handleOpenDetail = (item) => {
    if (!item) return;
    const detailId = item.tmdbId || item.id;
    if (item.isDubIndo || String(item.id).startsWith('dub_')) {
      navigate(`/dub/${item.id}`, { state: { item } });
    } else if (item.media_type === 'tv' || item.type === 'series' || item.category === 'Film Series' || item.first_air_date || (item.episodes && item.episodes.length > 0)) {
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

  return (
    <div className="min-h-screen bg-[#060709] text-zinc-100 flex flex-col selection:bg-white selection:text-black">
      {/* Navbar (Hidden on Watch, Detail, and Swagger Pages for pure immersive CinemaOS experience) */}
      {!location.pathname.startsWith('/watch') &&
       !location.pathname.startsWith('/movie') &&
       !location.pathname.startsWith('/tv') &&
       !location.pathname.startsWith('/dub') &&
       !location.pathname.startsWith('/detail') &&
       !location.pathname.startsWith('/swagger') &&
       !location.pathname.startsWith('/api-docs') && (
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

      {/* Main Routes */}
      <div className="flex-1">
        <Routes>
          {/* Swagger / OpenAPI Interactive Documentation Route */}
          <Route path="/swagger" element={<SwaggerDocsPage />} />
          <Route path="/api-docs" element={<SwaggerDocsPage />} />

          {/* Dedicated Detail Pages (Full Page, CinemaOS standard) */}
          <Route path="/movie/:id" element={<DetailPage type="movie" />} />
          <Route path="/tv/:id" element={<DetailPage type="tv" />} />
          <Route path="/dub/:id" element={<DetailPage type="dub" />} />
          <Route path="/detail/:type/:id" element={<DetailPage />} />

          {/* CinemaOS Dedicated Watch Routes */}
          <Route path="/watch/movie/:id" element={<MovieWatchRoute />} />
          <Route path="/watch/tv/:id" element={<TvWatchRoute />} />
          <Route path="/watch/tv/:id/:season/:episode" element={<TvWatchRoute />} />
          <Route path="/watch/dub/:id" element={<DubWatchRoute />} />

          {/* Main Catalog / Home Routes */}
          <Route
            path="*"
            element={
              <main className="pb-20">
                {/* TAB 1: HOME VIEW */}
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
                        subtitle="Lanjutkan dari menit terakhir Anda"
                        items={continueWatching}
                        onMovieClick={handleOpenDetail}
                        onPlayClick={handlePlayMovie}
                        watchlistIds={watchlistIds}
                        onToggleWatchlist={handleToggleWatchlist}
                        onExploreMore={() => setIsHistoryOpen(true)}
                      />
                    )}

                    <ContentRail
                      title="Trending Hari Ini"
                      subtitle="Paling banyak ditonton di seluruh dunia 24 jam terakhir"
                      items={trending}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                    />

                    <ContentRail
                      title="Top Videos Dubbing Indonesia"
                      subtitle="Koleksi film bioskop terpopuler dubbing Bahasa Indonesia resmi (Full Duration)"
                      items={dubIndoMovies}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                      onExploreMore={() => setActiveTab('dubindo')}
                    />

                    {/* Film & Series Indonesia Terbaru di Netflix 🇮🇩 */}
                    {movieBoxCatalog?.indo_netflix?.length > 0 && (
                      <ContentRail
                        title="Film & Series Indonesia Terbaru di Netflix 🇮🇩"
                        subtitle="Rilis film bioskop Indonesia resmi di Netflix (The Shadow Strays, Kabut Berduri, Agak Laen, Siksa Kubur)"
                        items={movieBoxCatalog.indo_netflix}
                        onMovieClick={handleOpenDetail}
                        onPlayClick={handlePlayMovie}
                        watchlistIds={watchlistIds}
                        onToggleWatchlist={handleToggleWatchlist}
                        onExploreMore={() => {
                          setActiveTab('moviebox');
                          setMovieBoxSubFilter('netflix');
                        }}
                      />
                    )}

                    <ContentRail
                      title="Film Bioskop Terpopuler"
                      subtitle="Film layar lebar terlaris & rilis bioskop global minggu ini"
                      items={popularMovies}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                      onExploreMore={() => setActiveTab('movies')}
                    />

                    <ContentRail
                      title="Serial TV & Web Series"
                      subtitle="Musim lengkap dari Netflix, HBO, Disney+, dan AMC"
                      items={popularTV}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                      onExploreMore={() => setActiveTab('series')}
                    />

                    <ContentRail
                      title="Anime Hits & Simulcast Jepang"
                      subtitle="Serial anime terpopuler dan episode terbaru dengan Sub & Dub"
                      items={animeList}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                      onExploreMore={() => setActiveTab('anime')}
                    />

                    <ContentRail
                      title="Drama Korea & Drama Asia"
                      subtitle="K-Drama romantis, thriller misteri, dan serial Mandarin terpopuler"
                      items={kdramaList}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                      onExploreMore={() => setActiveTab('kdrama')}
                    />

                    <ContentRail
                      title="Film Rating Tertinggi"
                      subtitle="Karya sinema terbaik sepanjang masa pilihan penonton dunia"
                      items={topRatedMovies}
                      onMovieClick={handleOpenDetail}
                      onPlayClick={handlePlayMovie}
                      watchlistIds={watchlistIds}
                      onToggleWatchlist={handleToggleWatchlist}
                    />
                  </>
                )}

                {/* TAB 2: MOVIES VIEW */}
                {activeTab === 'movies' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                    <div className="mb-6">
                      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        Koleksi Film Layar Lebar
                      </h1>
                      <p className="text-sm text-zinc-400 mt-1">
                        Jelajahi ribuan film bioskop Hollywood, internasional, dan box office dengan multi-server stream HD & 4K.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-3 mb-6">
                      <button
                        onClick={() => setSelectedGenre(null)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                          selectedGenre === null
                            ? 'bg-white text-black font-semibold shadow-sm'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-white/[0.08]'
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
                              ? 'bg-white text-black font-semibold shadow-sm'
                              : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {g.name}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
                      {(selectedGenre ? genreResults : popularMovies).map((item) => (
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
                  </div>
                )}

                {/* TAB 3: TV SERIES VIEW */}
                {activeTab === 'series' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                    <div className="mb-6">
                      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        Serial TV & Web Series
                      </h1>
                      <p className="text-sm text-zinc-400 mt-1">
                        Koleksi serial barat, serial populer, dan web series dengan musim dan episode lengkap.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
                      {popularTV.map((item) => (
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
                  </div>
                )}

                {/* TAB 4: ANIME VIEW */}
                {activeTab === 'anime' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                    <div className="mb-6">
                      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        Anime Hits & Movies
                      </h1>
                      <p className="text-sm text-zinc-400 mt-1">
                        Daftar anime series terkini, Shounen, Isekai, Romance, dan film anime movie kualitas Full HD.
                      </p>
                    </div>

                    <div className="mb-8">
                      <h2 className="text-base font-bold text-zinc-200 mb-3">Serial Anime Terpopuler</h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
                        {animeList.map((item) => (
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
                    </div>

                    {animeMovies.length > 0 && (
                      <div>
                        <h2 className="text-base font-bold text-zinc-200 mb-3">Film Layar Lebar Anime (Anime Movies)</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
                          {animeMovies.map((item) => (
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
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 5: ASIAN DRAMA VIEW */}
                {activeTab === 'kdrama' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                    <div className="mb-6">
                      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        Drama Korea & Drama Asia
                      </h1>
                      <p className="text-sm text-zinc-400 mt-1">
                        Koleksi K-Drama rating tertinggi, Chinese Drama sejarah & romantis, dan serial Asia lainnya.
                      </p>
                    </div>

                    <div className="mb-8">
                      <h2 className="text-base font-bold text-zinc-200 mb-3">Korean Drama Terpopuler</h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
                        {kdramaList.map((item) => (
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
                    </div>

                    {cdramaList.length > 0 && (
                      <div>
                        <h2 className="text-base font-bold text-zinc-200 mb-3">Chinese Drama Pilihan</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
                          {cdramaList.map((item) => (
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
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 6: DUB INDO DEDICATED VIEW */}
                {activeTab === 'dubindo' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                    <div className="mb-6">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Audio Dubbing Bahasa Indonesia
                        </span>
                      </div>
                      <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2 tracking-tight">
                        Top Videos Dubbing Indonesia
                      </h1>
                      <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
                        Koleksi teratas dari Top Videos dubbindo.site: Film layar lebar animasi Disney, Pixar, Box Office, dan serial pilihan dengan audio bahasa Indonesia resmi (Durasi penuh tanpa AI shorts/meme).
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
                      {dubIndoMovies.map((item) => (
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
                  </div>
                )}

                {/* TAB 7: MOVIEBOX API & SCRAPED CATALOG VIEW */}
                {activeTab === 'moviebox' && (
                  <div className="pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-16">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ⚡ MovieBox Scraper & Swagger API
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            OpenAPI 3.0
                          </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black text-white mt-2 tracking-tight">
                          Katalog Resmi MovieBox Pro
                        </h1>
                        <p className="text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                          Katalog lengkap gabungan <b>Trending Drama</b>, <b>Trending Movies</b>, <b>Film Indonesia Terbaru di Netflix</b>, dan <b>Sinetron Indonesia</b> lengkap dengan dokumentasi Swagger.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                        <button
                          onClick={() => navigate('/swagger')}
                          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-cyan-500/20"
                        >
                          <FileCode className="w-3.5 h-3.5" />
                          <span>Swagger Docs</span>
                        </button>
                        <button
                          onClick={() => setIsSettingsOpen(true)}
                          className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-300"
                        >
                          Atur Host API
                        </button>
                      </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-8 pb-1">
                      {[
                        { id: 'all', label: 'Semua Koleksi (All Rails)' },
                        { id: 'drama', label: 'Trending Drama 🔥' },
                        { id: 'movies', label: 'Trending Movies' },
                        { id: 'netflix', label: 'Film & Series Indonesia (Netflix) 🇮🇩' },
                        { id: 'sinetron', label: 'Sinetron & Series Indonesia' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setMovieBoxSubFilter(tab.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                            movieBoxSubFilter === tab.id
                              ? 'bg-white text-black shadow-md font-extrabold'
                              : 'bg-[#12141c] hover:bg-[#1a1d28] text-zinc-300 border border-white/[0.06]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {movieBoxLoading ? (
                      <div className="py-24 text-center text-zinc-400 animate-pulse text-sm flex flex-col items-center justify-center gap-3">
                        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                        <span>Memuat Katalog MovieBox & Scraped Datasets...</span>
                      </div>
                    ) : movieBoxSubFilter === 'all' ? (
                      /* Display Rails matching the user's reference image */
                      <div className="space-y-10">
                        {/* Rail 1: Trending Drama 🔥 */}
                        {movieBoxCatalog?.trending_drama?.length > 0 && (
                          <ContentRail
                            title="Trending Drama 🔥"
                            subtitle="Serial drama terpopuler di Asia, WeTV, Netflix, dan Disney+"
                            items={movieBoxCatalog.trending_drama}
                            onMovieClick={handleOpenDetail}
                            onPlayClick={handlePlayMovie}
                            watchlistIds={watchlistIds}
                            onToggleWatchlist={handleToggleWatchlist}
                          />
                        )}

                        {/* Rail 2: Trending Movies */}
                        {movieBoxCatalog?.trending_movies?.length > 0 && (
                          <ContentRail
                            title="Trending Movies"
                            subtitle="Film bioskop blockbuster dengan lencana Limited Free & 4K UHD"
                            items={movieBoxCatalog.trending_movies}
                            onMovieClick={handleOpenDetail}
                            onPlayClick={handlePlayMovie}
                            watchlistIds={watchlistIds}
                            onToggleWatchlist={handleToggleWatchlist}
                          />
                        )}

                        {/* Rail 3: Film & Series Indonesia Terbaru di Netflix 🇮🇩 */}
                        {movieBoxCatalog?.indo_netflix?.length > 0 && (
                          <ContentRail
                            title="Film & Series Indonesia Terbaru di Netflix 🇮🇩"
                            subtitle="Rilis film bioskop Indonesia resmi di Netflix (The Shadow Strays, Kabut Berduri, Agak Laen, dll)"
                            items={movieBoxCatalog.indo_netflix}
                            onMovieClick={handleOpenDetail}
                            onPlayClick={handlePlayMovie}
                            watchlistIds={watchlistIds}
                            onToggleWatchlist={handleToggleWatchlist}
                          />
                        )}

                        {/* Rail 4: Sinetron & Series Indonesia Populer */}
                        {movieBoxCatalog?.sinetron_series?.length > 0 && (
                          <ContentRail
                            title="Sinetron & Series Indonesia Populer"
                            subtitle="Sinetron hits harian (Terikat Janji, Terbaik Itu Kamu, Cinta Yasmin, Naik Ranjang)"
                            items={movieBoxCatalog.sinetron_series}
                            onMovieClick={handleOpenDetail}
                            onPlayClick={handlePlayMovie}
                            watchlistIds={watchlistIds}
                            onToggleWatchlist={handleToggleWatchlist}
                          />
                        )}
                      </div>
                    ) : (
                      /* Filter Grid View */
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
                        {(movieBoxSubFilter === 'drama'
                          ? movieBoxCatalog?.trending_drama || []
                          : movieBoxSubFilter === 'movies'
                            ? movieBoxCatalog?.trending_movies || []
                            : movieBoxSubFilter === 'netflix'
                              ? movieBoxCatalog?.indo_netflix || []
                              : movieBoxSubFilter === 'sinetron'
                                ? movieBoxCatalog?.sinetron_series || []
                                : movieBoxData
                        ).map((item, idx) => (
                          <MovieCard
                            key={item.id || idx}
                            item={{
                              ...item,
                              id: item.id || idx,
                              tmdbId: item.tmdbId,
                              title: item.title || item.name || 'MovieBox Title',
                              poster_path: item.poster || item.poster_path || item.thumbnail || item.cover,
                              vote_average: item.rating ? parseFloat(item.rating) : 8.0,
                              release_date: item.year || '',
                              media_type: (item.type === 'series' || item.media_type === 'tv') ? 'tv' : 'movie',
                              overview: item.synopsis || item.description || '',
                              badge: item.badge,
                              category: item.category,
                              streamUrl: item.streamUrl,
                              parts: item.parts,
                              subjectId: item.subjectId,
                              episodes: item.episodes
                            }}
                            className="w-full"
                            onClick={handleOpenDetail}
                            onPlay={handlePlayMovie}
                            isWatchlisted={watchlistIds.has(String(item.id || idx))}
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
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-black text-xs tracking-tighter">
              MC
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white">
                McMovies
              </span>
              <p className="text-xs text-zinc-400">
                All-in-One Global Cinema & Top Videos Dubbing Indonesia
              </p>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 text-center sm:text-right">
            McMovies &copy; {new Date().getFullYear()}. All media stream embeds provided by third-party services.
          </p>
        </div>
      </footer>

      {/* GLOBAL MODALS (Dedicated Page replaces detail modal for fluid modern UX) */}
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
