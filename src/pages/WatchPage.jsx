import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  ChevronLeft,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Bookmark,
  BookmarkCheck,
  Share2,
  AlertCircle,
  Sparkles,
  Layers,
  Star,
  Check,
  SkipBack,
  SkipForward,
  Tv,
  Film,
  RefreshCw,
  Lock,
  Unlock,
  Settings,
  Subtitles,
  AudioLines,
  Users,
  Cast,
  ArrowRight
} from 'lucide-react';

import { STREAM_SERVERS, getEmbedUrl } from '../services/embedService';
import { TmdbService } from '../services/tmdbService';
import { DubIndoService } from '../services/dubIndoService';
import { MovieBoxService } from '../services/movieBoxService';
import { StorageService } from '../services/storageService';
import MovieCard from '../components/MovieCard';

export default function WatchPage({
  type = 'movie', // 'movie', 'tv', 'dub'
  id: propId,
  season: propSeason = 1,
  episode: propEpisode = 1,
  preloadedItem
}) {
  const navigate = useNavigate();

  const hasDirect = Boolean(
    preloadedItem?.streamUrl ||
    (preloadedItem?.parts && preloadedItem.parts.length > 0) ||
    preloadedItem?.isDubIndo
  );

  const initialSeasonData = preloadedItem ? (() => {
    const totalEps = (typeof preloadedItem.episodes === 'number' && preloadedItem.episodes > 0)
      ? preloadedItem.episodes
      : (preloadedItem.parts?.length || 1);
    const genEps = Array.from({ length: totalEps }, (_, i) => {
      const epNum = i + 1;
      return {
        episode_number: epNum,
        name: `Episode ${epNum}`,
        overview: epNum === 1 && preloadedItem.parts?.length > 0
          ? `Episode 1 lengkap durasi penuh (Part 1, Part 2, Part 3) kualitas HD tanpa iklan.`
          : `Episode ${epNum} dari serial ${preloadedItem.title || 'Serial'} durasi penuh.`,
        still_path: preloadedItem.backdrop_path || preloadedItem.poster_path
      };
    });
    return { episodes: genEps, season_number: 1 };
  })() : null;

  const [item, setItem] = useState(preloadedItem || null);
  const [loading, setLoading] = useState(!preloadedItem);
  const [currentSeason, setCurrentSeason] = useState(parseInt(propSeason, 10) || 1);
  const [currentEpisode, setCurrentEpisode] = useState(parseInt(propEpisode, 10) || 1);
  const [selectedPart, setSelectedPart] = useState(1);
  const [seasonData, setSeasonData] = useState(initialSeasonData);
  const [loadingSeason, setLoadingSeason] = useState(false);

  // Streaming Server state: default to moviebox_direct if direct stream exists, or anyembed
  const [activeServer, setActiveServer] = useState(
    hasDirect ? (preloadedItem?.isDubIndo ? 'dub_direct' : 'moviebox_direct') : 'anyembed'
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [useDirectPlayer, setUseDirectPlayer] = useState(hasDirect);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [autoStatusMessage, setAutoStatusMessage] = useState('');

  // CinemaOS Direct Player controls
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscapeMode, setIsLandscapeMode] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [lockNotice, setLockNotice] = useState(false);

  const controlsTimeoutRef = useRef(null);
  const containerRef = useRef(null);
  const videoRef = useRef(null);

  // Auto-clear status message after 6 seconds
  useEffect(() => {
    if (autoStatusMessage) {
      const timer = setTimeout(() => setAutoStatusMessage(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [autoStatusMessage]);

  // Handle direct player mouse move (CinemaOS fade out)
  const handleMouseMove = () => {
    if (isScreenLocked) return;
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSettingsMenu(false);
      }, 2800);
    }
  };

  const togglePlay = () => {
    if (isScreenLocked) {
      triggerLockNotice();
      return;
    }
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const triggerLockNotice = () => {
    setLockNotice(true);
    setTimeout(() => setLockNotice(false), 2000);
  };

  const skipTime = (seconds) => {
    if (isScreenLocked || !videoRef.current) return;
    videoRef.current.currentTime = Math.min(Math.max(videoRef.current.currentTime + seconds, 0), duration || 10000);
  };

  const handleSeek = (e) => {
    if (isScreenLocked || !videoRef.current) return;
    const newTime = parseFloat(e.target.value);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSettingsMenu(false);
  };

  // Format time (elapsed: mm:ss or hh:mm:ss)
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Format remaining time with negative sign (-hh:mm:ss or -mm:ss) as in CinemaOS reference
  const formatRemainingTime = (curr, total) => {
    if (isNaN(total) || total <= 0) return '-00:00';
    const rem = Math.max(0, total - curr);
    return `-${formatTime(rem)}`;
  };

  // Clean raw scraped text of download URLs and technical artifacts
  const cleanSynopsis = (text) => {
    if (!text) return 'Sinopsis belum tersedia untuk film ini.';
    let c = text;
    c = c.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
    c = c.replace(/Download\s*:\s*https?:\/\/\S+/gi, '');
    c = c.replace(/https?:\/\/\S+/gi, '');
    c = c.replace(/Download\s*:\s*$/gi, '');
    c = c.replace(/Download\s*:/gi, '');
    c = c.replace(/\s+/g, ' ').trim();
    return c;
  };

  // Sync params when URL changes
  useEffect(() => {
    if (propSeason) setCurrentSeason(parseInt(propSeason, 10) || 1);
    if (propEpisode) setCurrentEpisode(parseInt(propEpisode, 10) || 1);
  }, [propSeason, propEpisode]);

  // Load details
  useEffect(() => {
    let isMounted = true;
    if (!preloadedItem) {
      setLoading(true);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const settings = StorageService.getSettings();

    async function loadItem() {
      // 1. FAST PATH: Check MovieBox & Local Scraped Catalog FIRST (Instant local cache)
      try {
        const localItem = await MovieBoxService.getDetail(propId);
        if (localItem && isMounted) {
          const finalItem = { ...localItem, media_type: localItem.media_type || (type === 'tv' ? 'tv' : 'movie') };
          setItem(finalItem);
          setIsWatchlisted(StorageService.isWatchlisted(finalItem.id));

          if (finalItem.streamUrl || (finalItem.parts && finalItem.parts.length > 0)) {
            setUseDirectPlayer(true);
            setActiveServer('moviebox_direct');
          } else if (settings.preferredServer) {
            setActiveServer(settings.preferredServer);
          } else {
            setActiveServer('anyembed');
          }

          const totalEps = (typeof finalItem.episodes === 'number' && finalItem.episodes > 0)
            ? finalItem.episodes
            : (finalItem.parts?.length || 1);

          const genEps = Array.from({ length: totalEps }, (_, i) => {
            const epNum = i + 1;
            return {
              episode_number: epNum,
              name: `Episode ${epNum}`,
              overview: epNum === 1 && finalItem.parts?.length > 0
                ? `Episode 1 lengkap durasi penuh (Part 1, Part 2, Part 3) kualitas HD tanpa iklan.`
                : `Episode ${epNum} dari serial ${finalItem.title || 'Serial'} durasi penuh.`,
              still_path: finalItem.backdrop_path || finalItem.poster_path
            };
          });
          setSeasonData({ episodes: genEps, season_number: 1 });

          setLoading(false);

          StorageService.updateProgress(finalItem, {
            season: currentSeason,
            episode: currentEpisode,
            serverId: finalItem.streamUrl ? 'moviebox_direct' : (settings.preferredServer || 'anyembed'),
          });

          // If local item has a TMDB ID, optionally fetch seasons/cast in background
          if (finalItem.tmdbId && finalItem.media_type === 'tv' && (!finalItem.parts || finalItem.parts.length === 0)) {
            fetchSeason(finalItem.tmdbId, currentSeason);
          }
          return;
        }
      } catch (e) {
        console.warn('Fast path local catalog lookup error:', e);
      }

      // 2. DUB INDO PATH
      if (type === 'dub') {
        const rawId = String(propId).replace(/^dub_/, '').replace(/^dub_series_/, '');
        
        // Comprehensive universal lookup across all catalogs & mirrors
        DubIndoService.getMovieOrSeriesById(propId).then(async (found) => {
          if (!isMounted) return;
          
          let targetItem = found;
          if (!targetItem) {
            targetItem = await DubIndoService.findDubIndoByTmdbId(rawId);
          }

          if (targetItem) {
            if (!targetItem.tmdbId) {
              const resolvedTmdb = await DubIndoService.resolveDubTmdbId(targetItem.title, targetItem.year);
              if (resolvedTmdb) {
                targetItem.tmdbId = resolvedTmdb;
              }
            }

            if (targetItem.tmdbId) {
              try {
                const tmdbData = await TmdbService.getDetails(targetItem.tmdbId, targetItem.media_type || 'movie');
                if (tmdbData && isMounted) {
                  targetItem.credits = tmdbData.credits;
                  targetItem.genres = tmdbData.genres;
                  targetItem.runtime = tmdbData.runtime;
                  targetItem.tagline = tmdbData.tagline;
                  targetItem.similar = tmdbData.similar;
                }
              } catch (e) {
                console.warn('Could not fetch TMDB cast for dub item:', e);
              }
            }

            if (targetItem.streamUrl && targetItem.streamUrl.includes('files.indodub.my.id')) {
              try {
                const direct = await DubIndoService.resolveDirectPlayableUrl(targetItem.streamUrl);
                if (direct) {
                  targetItem.directWasabiUrl = direct;
                }
              } catch (e) {
                console.warn('Could not pre-resolve direct Wasabi stream:', e);
              }
            }

            setItem(targetItem);
            setUseDirectPlayer(true);
            setActiveServer('dub_direct');
            setIsWatchlisted(StorageService.isWatchlisted(targetItem.id));
            StorageService.updateProgress(targetItem, { season: 1, episode: 1, serverId: 'dub_direct' });
            setLoading(false);
          } else {
            setLoading(false);
          }
        });
      } else {
        // 3. TMDB PATH
        const mediaType = type === 'tv' ? 'tv' : 'movie';
        try {
          const data = await TmdbService.getDetails(propId, mediaType);
          if (!isMounted) return;

          if (data) {
            const fullItem = { ...data, media_type: mediaType };

            if (mediaType === 'movie') {
              const dubMatch = await DubIndoService.findDubIndoByTmdbId(propId);
              if (dubMatch && dubMatch.streamUrl) {
                fullItem.hasDubIndo = true;
                fullItem.dubStreamUrl = dubMatch.streamUrl;
                fullItem.dubStreamBackupUrl = dubMatch.streamBackupUrl;
                fullItem.dubItem = dubMatch;
              }
            }

            setItem(fullItem);
            setIsWatchlisted(StorageService.isWatchlisted(fullItem.id));
            if (data.runtime) setDuration(data.runtime * 60);
            setLoading(false);

            StorageService.updateProgress(fullItem, {
              season: currentSeason,
              episode: currentEpisode,
              serverId: settings.preferredServer || 'superembed',
            });

            if (mediaType === 'tv') {
              fetchSeason(propId, currentSeason);
            }
            return;
          }
        } catch (err) {
          console.error('Failed to load details from TMDB:', err);
        }

        // 4. Secondary fallback
        try {
          const fallback = await MovieBoxService.getDetail(propId);
          if (fallback && isMounted) {
            setItem(fallback);
            setIsWatchlisted(StorageService.isWatchlisted(fallback.id));
            if (fallback.streamUrl) {
              setUseDirectPlayer(true);
              setActiveServer('moviebox_direct');
            }
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('Fallback catalog search error:', e);
        }

        if (isMounted) setLoading(false);
      }
    }

    loadItem();

    return () => {
      isMounted = false;
    };
  }, [type, propId]);

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
    setCurrentSeason(sNum);
    setCurrentEpisode(1);
    setReloadKey(p => p + 1);
    fetchSeason(propId, sNum);
    if (item) {
      StorageService.updateProgress(item, { season: sNum, episode: 1, serverId: activeServer });
    }
    navigate(`/watch/tv/${propId}/${sNum}/1`, { replace: true });
  };

  const handleEpisodeChange = (epNum) => {
    setCurrentEpisode(epNum);
    setSelectedPart(1);
    setReloadKey(p => p + 1);
    if (item) {
      StorageService.updateProgress(item, { season: currentSeason, episode: epNum, serverId: activeServer });
    }
    navigate(`/watch/tv/${propId}/${currentSeason}/${epNum}`, { replace: true, state: { item } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextEpisode = () => {
    const nextEp = currentEpisode + 1;
    const maxEp = seasonData?.episodes?.length || 24;
    if (nextEp <= maxEp) {
      handleEpisodeChange(nextEp);
    }
  };

  const handlePrevEpisode = () => {
    const prevEp = currentEpisode - 1;
    if (prevEp >= 1) {
      handleEpisodeChange(prevEp);
    }
  };

  const handleServerSelect = async (serverId) => {
    setActiveServer(serverId);
    if (serverId === 'moviebox_direct') {
      setUseDirectPlayer(true);
      if (videoRef.current) {
        videoRef.current.src = currentDirectStream;
        videoRef.current.play().catch(() => {});
      }
    } else if (serverId === 'dub_direct') {
      setUseDirectPlayer(true);
      if (item) {
        if (!item.directWasabiUrl && item.streamUrl) {
          const direct = await DubIndoService.resolveDirectPlayableUrl(item.streamUrl);
          if (direct) item.directWasabiUrl = direct;
        }
        if (videoRef.current) {
          videoRef.current.src = item.directWasabiUrl || item.streamUrl;
          videoRef.current.play().catch(() => {});
        }
      }
    } else if (serverId === 'dub_redirect') {
      setUseDirectPlayer(true);
      if (videoRef.current && item) {
        videoRef.current.src = item.streamUrl;
        videoRef.current.play().catch(() => {});
      }
    } else if (serverId === 'dub_embed') {
      setUseDirectPlayer(false);
    } else if (serverId === 'dub_cf') {
      setUseDirectPlayer(true);
      if (videoRef.current && item) {
        videoRef.current.src = item.streamBackupUrl || item.streamUrl;
        videoRef.current.play().catch(() => {});
      }
    } else if (serverId === 'dub_tmdb') {
      setUseDirectPlayer(true);
      if (videoRef.current && item) {
        videoRef.current.src = item.dubStreamUrl;
        videoRef.current.play().catch(() => {});
      }
    } else {
      setUseDirectPlayer(false);
    }
    setReloadKey(p => p + 1);
    if (item) {
      StorageService.updateProgress(item, { season: currentSeason, episode: currentEpisode, serverId });
    }
  };

  // Comprehensive multi-mirror server list: strictly Indonesian Dubbing for Dub Indo titles!
  const availableServers = item?.isDubIndo
    ? [
        ...(item.streamUrl ? [{
          id: 'dub_direct',
          name: '🇮🇩 Dubbing Indo (Wasabi S3 Direct)',
          badge: 'Ultra HD'
        }] : []),
        ...(item.streamUrl ? [{
          id: 'dub_redirect',
          name: '🇮🇩 Dubbing Indo (LiteSpeed Mirror)',
          badge: '1080p'
        }] : []),
        ...(item.embedToken ? [{
          id: 'dub_embed',
          name: '🇮🇩 Dubbing Indo (Web Player)',
          badge: 'Web Player'
        }] : []),
        ...(item.streamBackupUrl && item.streamBackupUrl !== item.streamUrl ? [{
          id: 'dub_cf',
          name: '🇮🇩 Dubbing Indo (CDN Mirror)',
          badge: 'Mirror CDN'
        }] : [])
      ]
    : [
        ...((item?.streamUrl || item?.parts) ? [{
          id: 'moviebox_direct',
          name: '⚡ MovieBox Direct HD (Tanpa Iklan)',
          badge: 'Direct MP4'
        }] : []),
        ...(item?.hasDubIndo ? [{
          id: 'dub_tmdb',
          name: '🇮🇩 Audio Dubbing Indonesia',
          badge: 'Tersedia!'
        }] : []),
        ...(item?.tmdbId ? STREAM_SERVERS : [])
      ];

  // Smart Server Cycler (Switches across working mirrors)
  const handleAutoCycleServer = () => {
    const serverList = availableServers;
    if (serverList.length <= 1) return;
    const curIdx = serverList.findIndex(s => s.id === activeServer);
    const nextServer = serverList[(curIdx + 1) % serverList.length];
    if (nextServer) {
      handleServerSelect(nextServer.id);
      setAutoStatusMessage(`⚡ Beralih otomatis ke server: ${nextServer.name}...`);
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

  // Handle Fullscreen across Desktop, Android, and iOS iPhone Safari
  const handleToggleFullscreen = () => {
    // 1. If currently fullscreen (either native or CSS viewport fullscreen), exit
    if (isFullscreen) {
      try {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      } catch (e) {}

      if (screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock(); } catch (e) {}
      }

      if (videoRef.current && typeof videoRef.current.webkitExitFullscreen === 'function') {
        try { videoRef.current.webkitExitFullscreen(); } catch (e) {}
      }

      setIsFullscreen(false);
      setIsLandscapeMode(false);
      return;
    }

    // Check if mobile / portrait orientation
    const isPortrait = window.innerHeight > window.innerWidth;
    const isMobile = /iPad|iPhone|iPod|Android/.test(navigator.userAgent) || (window.innerWidth < 768);

    // Request screen orientation lock if supported by browser
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }

    // Automatically enable landscape horizontal rotation mode if entering fullscreen in portrait
    if (isPortrait && isMobile) {
      setIsLandscapeMode(true);
    }

    // 2. Check if iOS device (iPhone / iPad / iPod)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // If on iOS and playing native video, try native webkitEnterFullscreen first
    if (isIOS && videoRef.current && typeof videoRef.current.webkitEnterFullscreen === 'function') {
      try {
        videoRef.current.webkitEnterFullscreen();
        setIsFullscreen(true);
        return;
      } catch (err) {
        console.warn('iOS webkitEnterFullscreen error, fallback to pseudo-fullscreen:', err);
      }
    }

    // 3. For Desktop and Android, try standard HTML5 Fullscreen API
    const elem = containerRef.current;
    if (!isIOS && elem) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen()
          .then(() => setIsFullscreen(true))
          .catch(() => setIsFullscreen(true));
        return;
      } else if (elem.webkitRequestFullscreen) {
        try {
          elem.webkitRequestFullscreen();
          setIsFullscreen(true);
          return;
        } catch (e) {
          console.warn('webkitRequestFullscreen failed:', e);
        }
      }
    }

    // 4. Guaranteed CSS Viewport Fullscreen fallback (always works on iPhone Safari & iframes)
    setIsFullscreen(true);
  };

  // Auto reset landscape CSS rotation when user physically turns device to horizontal
  useEffect(() => {
    const handleOrientationOrResize = () => {
      if (window.innerWidth > window.innerHeight) {
        setIsLandscapeMode(false);
      }
    };
    window.addEventListener('resize', handleOrientationOrResize);
    window.addEventListener('orientationchange', handleOrientationOrResize);
    return () => {
      window.removeEventListener('resize', handleOrientationOrResize);
      window.removeEventListener('orientationchange', handleOrientationOrResize);
    };
  }, []);

  // Lock body scroll when fullscreen is active (critical for iPhone Safari viewport lock)
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isFullscreen]);

  // Listen for native Fullscreen events (including iOS WebKit)
  useEffect(() => {
    const handleFsChange = () => {
      const isFull = Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(isFull);
    };

    const video = videoRef.current;
    const onIosFsBegin = () => setIsFullscreen(true);
    const onIosFsEnd = () => setIsFullscreen(false);

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    if (video) {
      video.addEventListener('webkitbeginfullscreen', onIosFsBegin);
      video.addEventListener('webkitendfullscreen', onIosFsEnd);
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      if (video) {
        video.removeEventListener('webkitbeginfullscreen', onIosFsBegin);
        video.removeEventListener('webkitendfullscreen', onIosFsEnd);
      }
    };
  }, [useDirectPlayer]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-[#060709] flex flex-col items-center justify-center text-zinc-400">
        <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide text-zinc-300 animate-pulse">Menghubungkan ke Pemutar McMovies...</p>
      </div>
    );
  }

  // Graceful Fallback if item is truly not found
  if (!item) {
    return (
      <div className="w-full min-h-screen bg-[#06070a] flex flex-col items-center justify-center text-center px-4 py-12">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
          {type === 'dub' ? 'Audio Dubbing Indonesia Sedang Dalam Pembaruan' : 'Film Tidak Ditemukan'}
        </h2>
        <p className="text-sm text-zinc-400 max-w-lg mb-6 leading-relaxed">
          {type === 'dub'
            ? 'Judul ini belum memiliki berkas audio Dubbing Indonesia aktif di server arsip. Silakan pilih dari 1.100+ koleksi film Dubbing Indonesia terpopuler yang telah terverifikasi dan siap tonton sekarang!'
            : 'Maaf, data film tidak dapat dimuat saat ini. Silakan kembali ke beranda untuk menjelajah koleksi lainnya.'}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            Buka 1.100+ Film Dubbing Indo
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 font-bold text-xs transition-all active:scale-95"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  const isSeries = type === 'tv' || item.media_type === 'tv' || (item.seasons && item.seasons.length > 0) || (item.episodes && item.episodes.length > 0);
  const title = item.title || item.name || 'Untitled';
  const releaseDate = item.release_date || item.first_air_date || '';
  const year = releaseDate ? releaseDate.slice(0, 4) : (item.year || '2026');
  const rating = (item.vote_average || 8.5).toFixed(1);
  const runtime = item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : (item.duration || '2h 25m');
  const genres = item.genres || [];
  const cast = item.credits?.cast?.slice(0, 8) || [];
  const similar = item.similar?.results?.slice(0, 12) || [];
  const rawEpisodes = seasonData?.episodes || (Array.isArray(item.episodes) ? item.episodes : []);
  const episodesList = Array.isArray(rawEpisodes) && rawEpisodes.length > 0
    ? rawEpisodes
    : (typeof item.episodes === 'number' && item.episodes > 0
        ? Array.from({ length: item.episodes }, (_, i) => ({
            episode_number: i + 1,
            name: `Episode ${i + 1}`,
            overview: `Episode ${i + 1} dari ${item.title || 'Serial'} durasi penuh.`,
            still_path: item.backdrop_path || item.poster_path
          }))
        : []);
  const currentEpInfo = episodesList.find(e => (e.episode_number || e.episode) === currentEpisode);
  const currentEpTitle = currentEpInfo?.name || `Episode ${currentEpisode}`;

  const validSeasons = Array.isArray(item?.seasons) && item.seasons.length > 0
    ? item.seasons.filter(s => s.season_number > 0)
    : (typeof item?.seasons === 'number' && item.seasons > 0
        ? Array.from({ length: item.seasons }, (_, i) => ({ id: i + 1, season_number: i + 1, name: `Season ${i + 1}` }))
        : [{ id: 1, season_number: 1, name: 'Season 1' }]);

  const resolvedTargetId = item?.isDubIndo ? (item.tmdbId || item.rawId) : (item?.tmdbId || item?.id || propId);
  const embedUrl = (activeServer === 'dub_embed' && item?.embedToken)
    ? `https://www.dubbindo.site/embed/${item.embedToken}`
    : getEmbedUrl(activeServer, resolvedTargetId, isSeries ? 'tv' : 'movie', currentSeason, currentEpisode, item);

  // Determine current active direct stream URL
  let currentDirectStream = item?.streamUrl || '';
  if (item?.parts && item.parts.length > 0) {
    if (currentEpisode === 1) {
      const matchedPart = item.parts.find(p => p.part === selectedPart) || item.parts[0];
      currentDirectStream = matchedPart?.url || item.streamUrl;
    } else {
      const partIdx = (currentEpisode - 1) % item.parts.length;
      const matchedPart = item.parts[partIdx] || item.parts[0];
      currentDirectStream = matchedPart?.url || item.streamUrl;
    }
  }

  if (activeServer === 'dub_direct') {
    currentDirectStream = item?.directWasabiUrl || item?.streamUrl;
  } else if (activeServer === 'dub_redirect') {
    currentDirectStream = item?.streamUrl;
  } else if (activeServer === 'dub_cf') {
    currentDirectStream = item?.streamBackupUrl || item?.streamUrl;
  } else if (activeServer === 'dub_tmdb') {
    currentDirectStream = item?.dubStreamUrl;
  } else if (activeServer === 'moviebox_direct') {
    if (item?.parts && item.parts.length > 0) {
      if (currentEpisode === 1) {
        const matchedPart = item.parts.find(p => p.part === selectedPart) || item.parts[0];
        currentDirectStream = matchedPart?.url || item?.streamUrl;
      } else {
        const partIdx = (currentEpisode - 1) % item.parts.length;
        const matchedPart = item.parts[partIdx] || item.parts[0];
        currentDirectStream = matchedPart?.url || item?.streamUrl;
      }
    } else {
      currentDirectStream = item?.streamUrl;
    }
  }

  return (
    <div className="min-h-screen bg-[#06070a] text-white selection:bg-white selection:text-black">
      {/* 
        ========================================================================
        1. CINEMAOS TOPBAR: BACK BUTTON + TITLE + ACTION ICONS
        ========================================================================
      */}
      <header className="sticky top-0 z-50 bg-[#06070a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-4 sm:px-6 lg:px-8 py-3 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Back Arrow + Title + Metadata */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(-1) || navigate('/')}
              className="p-2 rounded-full hover:bg-white/10 text-white transition-all active:scale-95 flex-none"
              title="Kembali"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base md:text-lg font-black text-white truncate max-w-xs sm:max-w-md md:max-w-xl">
                {title}
              </h1>
              <p className="text-[11px] sm:text-xs text-zinc-400 font-medium">
                {year} • {isSeries ? `S${currentSeason} : E${currentEpisode} - ${currentEpTitle}` : runtime} • 4K Ultra HD
              </p>
            </div>
          </div>

          {/* Right: Watchlist, Share, Theater Toggle, Fullscreen */}
          <div className="flex items-center gap-2 flex-none">
            <button
              onClick={handleToggleWatchlist}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isWatchlisted
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-white/10'
              }`}
              title={isWatchlisted ? 'Hapus dari Watchlist' : 'Simpan ke Watchlist'}
            >
              {isWatchlisted ? <BookmarkCheck className="w-3.5 h-3.5 fill-current" /> : <Bookmark className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isWatchlisted ? 'Tersimpan' : 'Watchlist'}</span>
            </button>

            <button
              onClick={handleShare}
              className="px-3 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all"
              title="Salin Tautan Film"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copiedLink ? 'Tersalin!' : 'Bagikan'}</span>
            </button>

            <button
              onClick={() => setIsTheaterMode(!isTheaterMode)}
              className={`p-2 rounded-full text-xs font-semibold transition-all hidden md:flex items-center gap-1.5 ${
                isTheaterMode
                  ? 'bg-white text-black'
                  : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-white/10'
              }`}
              title="Mode Teater Lebar"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 
        ========================================================================
        2. VIDEO PLAYER CANVAS (CINEMAOS OVERLAY FOR DUB INDO & CLEAN IFRAME)
        ========================================================================
      */}
      <div className={`w-full transition-all duration-300 ${isTheaterMode ? 'px-0 max-w-none' : 'max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 pt-3'}`}>
        {/* System Auto-Status Notification */}
        {autoStatusMessage && (
          <div className="mb-2.5 px-4 py-2.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between gap-3 backdrop-blur-xl animate-fadeIn shadow-lg">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 flex-none animate-pulse" />
              <span>{autoStatusMessage}</span>
            </div>
            <button
              onClick={() => setAutoStatusMessage('')}
              className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-400/80 hover:text-emerald-200 text-xs font-bold transition-all"
            >
              ✕
            </button>
          </div>
        )}

        <div
          ref={containerRef}
          className={`${
            isFullscreen
              ? isLandscapeMode
                ? 'fixed z-[99999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100dvh] h-[100dvw] rotate-90 origin-center bg-black rounded-none border-0'
                : 'fixed inset-0 z-[99999] w-full h-[100dvh] bg-black rounded-none border-0'
              : 'relative w-full aspect-video sm:h-[65vh] md:h-[78vh] max-h-[85vh] bg-black rounded-2xl md:rounded-3xl border border-white/10'
          } overflow-hidden shadow-2xl transition-all flex items-center justify-center group select-none`}
        >
          {/* Floating Controls When Fullscreen */}
          {isFullscreen && (
            <>
              {/* Rotate Landscape / Portrait Toggle Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLandscapeMode(prev => !prev);
                }}
                className="fixed top-4 left-4 z-[100000] px-3.5 py-2 rounded-full bg-black/85 hover:bg-black text-white text-xs font-bold border border-white/20 backdrop-blur-md shadow-2xl flex items-center gap-1.5 transition-all active:scale-95"
                title="Putar Orientasi Layar (Horizontal/Vertikal)"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isLandscapeMode ? 'Vertikal' : 'Horizontal'}</span>
              </button>

              {/* Floating Exit Fullscreen Button (Always accessible on iOS and Desktop) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFullscreen();
                }}
                className="fixed top-4 right-4 z-[100000] px-4 py-2 rounded-full bg-black/85 hover:bg-black text-white text-xs font-bold border border-white/20 backdrop-blur-md shadow-2xl flex items-center gap-2 transition-all active:scale-95"
                title="Keluar Layar Penuh"
              >
                <Minimize className="w-4 h-4" />
                <span>Keluar Layar Penuh</span>
              </button>
            </>
          )}

          {/* Ambient Glow */}
          <div className="absolute -inset-4 bg-gradient-to-r from-red-600/10 via-purple-600/10 to-blue-600/10 rounded-3xl opacity-30 blur-3xl pointer-events-none -z-10" />

          {/* Underlay Media: Direct MP4 (with CinemaOS Overlay) or Embed Iframe */}
          {useDirectPlayer && currentDirectStream ? (
            <div
              className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden"
              onMouseMove={handleMouseMove}
              onClick={togglePlay}
            >
              <video
                ref={videoRef}
                key={currentDirectStream}
                src={currentDirectStream}
                autoPlay
                playsInline
                webkit-playsinline="true"
                x5-playsinline="true"
                className="w-full h-full object-contain bg-black"
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    setCurrentTime(videoRef.current.currentTime);
                    setDuration(videoRef.current.duration || duration);
                  }
                }}
                onEnded={() => setIsPlaying(false)}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onError={() => {
                  console.warn('Direct stream encounter error, automatically switching to alternative Dub Indo mirror...');
                  if (item?.isDubIndo) {
                    if (activeServer === 'dub_direct') {
                      handleServerSelect('dub_redirect');
                      setAutoStatusMessage('⚡ Mengaktifkan Server Cadangan Dubbing Indonesia (LiteSpeed)...');
                    } else if (activeServer === 'dub_redirect' && item.embedToken) {
                      handleServerSelect('dub_embed');
                      setAutoStatusMessage('⚡ Mengaktifkan Server Web Player Dubbing Indonesia...');
                    } else if (activeServer !== 'dub_cf' && item.streamBackupUrl) {
                      handleServerSelect('dub_cf');
                      setAutoStatusMessage('⚡ Mengaktifkan Server CDN Mirror Dubbing Indonesia...');
                    }
                  } else {
                    handleAutoCycleServer();
                  }
                }}
              />

              {/* Lock Notice Toast */}
              {lockNotice && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs font-bold flex items-center gap-2 pointer-events-none animate-fadeIn">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Layar Terkunci (Sentuh ikon gembok untuk membuka)</span>
                </div>
              )}

              {/* Padlock Screen Lock Button (CinemaOS reference: mid-left) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsScreenLocked(!isScreenLocked);
                }}
                className={`absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full backdrop-blur-xl border transition-all active:scale-95 shadow-xl ${
                  isScreenLocked
                    ? 'bg-amber-500/80 text-black border-amber-400 shadow-amber-500/20'
                    : `bg-black/50 hover:bg-black/80 text-white/80 hover:text-white border-white/20 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
                }`}
                title={isScreenLocked ? 'Buka Kunci Layar' : 'Kunci Layar'}
              >
                {isScreenLocked ? <Lock className="w-5 h-5 fill-current" /> : <Unlock className="w-5 h-5" />}
              </button>

              {/* 
                CINEMAOS PLAYER OVERLAY
              */}
              <div
                className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${
                  isScreenLocked ? 'opacity-0 pointer-events-none' : (showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none')
                }`}
              >
                {/* Top Overlay: Back button + Title + Meta + Action Icons */}
                <div className="p-4 sm:p-6 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between pointer-events-auto">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(-1) || navigate('/');
                      }}
                      className="p-2 rounded-full hover:bg-white/10 text-white transition-all active:scale-95"
                      title="Kembali"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h2 className="text-sm sm:text-base font-bold text-white tracking-wide truncate max-w-xs sm:max-w-md">
                        {title}
                      </h2>
                      <p className="text-[11px] text-zinc-400 font-medium">
                        {year} • {runtime} • 4K Ultra HD
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShare();
                      }}
                      className="p-2 rounded-xl bg-black/40 hover:bg-black/70 text-zinc-300 border border-white/10 backdrop-blur-md transition-all hidden sm:flex"
                      title="Tonton Bersama / Bagikan"
                    >
                      <Users className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFullscreen();
                      }}
                      className="p-2 rounded-xl bg-black/40 hover:bg-black/70 text-zinc-300 border border-white/10 backdrop-blur-md transition-all"
                      title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
                    >
                      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Center Controls: Rewind 10s, Frosted Glass Play/Pause, Fast-Forward 10s */}
                <div className="flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      skipTime(-10);
                    }}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-white transition-all shadow-lg group/btn"
                    title="Mundur 10 detik"
                  >
                    <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
                    <span className="text-[9px] font-black -mt-0.5 opacity-90">10</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay();
                    }}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/25 hover:bg-white/35 active:scale-95 backdrop-blur-xl border border-white/30 flex items-center justify-center text-white transition-all shadow-2xl hover:scale-105"
                    title={isPlaying ? "Jeda" : "Putar"}
                  >
                    {isPlaying ? (
                      <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-white" />
                    ) : (
                      <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white translate-x-0.5" />
                    )}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      skipTime(10);
                    }}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-white transition-all shadow-lg group/btn"
                    title="Maju 10 detik"
                  >
                    <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
                    <span className="text-[9px] font-black -mt-0.5 opacity-90">10</span>
                  </button>
                </div>

                {/* Bottom CinemaOS Bar: Info Overlay + Seekbar + Controls Row */}
                <div className="p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-auto space-y-3">
                  {/* Bottom-Left Information Overlay */}
                  <div className="hidden sm:block max-w-xl">
                    <span className="text-[10px] font-black tracking-[0.2em] text-emerald-400 uppercase">
                      YOU'RE WATCHING • AUDIO DUBBING INDONESIA
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow uppercase tracking-tight">
                      {title}
                    </h3>
                    <p className="text-xs text-zinc-300 font-medium mt-0.5">
                      {year} • ⭐ {rating} • {runtime}
                    </p>
                    <p className="text-xs text-zinc-400 line-clamp-2 mt-1 leading-relaxed font-normal">
                      {cleanSynopsis(item.overview || item.description)}
                    </p>
                  </div>

                  {/* Seekbar: Current Time + Range + Negative Remaining Time */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-zinc-300 min-w-[42px] text-right">
                      {formatTime(currentTime)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      value={currentTime}
                      onChange={handleSeek}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full h-1.5 bg-white/20 hover:h-2 rounded-lg appearance-none cursor-pointer accent-white transition-all"
                    />
                    <span className="text-xs font-mono text-zinc-400 min-w-[50px]">
                      {formatRemainingTime(currentTime, duration)}
                    </span>
                  </div>

                  {/* Bottom Controls Row */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlay();
                        }}
                        className="text-white hover:text-zinc-300 transition-colors"
                      >
                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                      </button>

                      <div className="flex items-center gap-1.5 group/vol">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (videoRef.current) {
                              videoRef.current.muted = !isMuted;
                              setIsMuted(!isMuted);
                            }
                          }}
                          className="text-white hover:text-zinc-300 transition-colors"
                        >
                          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMuted ? 0 : volume}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setVolume(val);
                            if (videoRef.current) {
                              videoRef.current.volume = val;
                              videoRef.current.muted = val === 0;
                            }
                            setIsMuted(val === 0);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-16 h-1 bg-white/20 rounded accent-white hidden group-hover/vol:inline-block transition-all"
                        />
                      </div>

                      <span className="text-xs font-bold text-emerald-400 hidden sm:inline flex items-center gap-1">
                        <span>🇮🇩</span> Audio Dubbing Indonesia
                      </span>
                    </div>

                    <div className="flex items-center gap-2 relative">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-white/10 text-white border border-white/20">
                        4K UHD
                      </span>

                      {/* Settings Popup Menu */}
                      {showSettingsMenu && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 bottom-8 z-50 w-48 rounded-2xl bg-[#111218]/95 backdrop-blur-2xl border border-white/10 p-3 shadow-2xl text-xs space-y-2 animate-fadeIn"
                        >
                          <div className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">
                            Kecepatan Putar
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                              <button
                                key={s}
                                onClick={() => handleSpeedChange(s)}
                                className={`py-1 rounded text-center font-bold transition-all ${
                                  playbackSpeed === s
                                    ? 'bg-white text-black'
                                    : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                                }`}
                              >
                                {s}x
                              </button>
                            ))}
                          </div>
                          <div className="pt-2 border-t border-white/10 text-[11px] text-zinc-400">
                            Audio: <span className="text-emerald-400 font-bold">Indonesia (Stereo HD)</span>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSettingsMenu(!showSettingsMenu);
                        }}
                        className={`text-white hover:text-zinc-300 transition-colors p-1 rounded-lg ${showSettingsMenu ? 'bg-white/20' : ''}`}
                        title="Pengaturan Pemutar"
                      >
                        <Settings className="w-5 h-5" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFullscreen();
                        }}
                        className="text-white hover:text-zinc-300 transition-colors p-1"
                        title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
                      >
                        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <iframe
              key={`${embedUrl}-${reloadKey}`}
              src={embedUrl}
              title={title}
              className="w-full h-full border-0 bg-black"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              referrerPolicy="origin"
              allowFullScreen
            />
          )}
        </div>

        {/* Next / Prev Episode Quick Controls for TV Shows */}
        {isSeries && (
          <div className="mt-3 flex items-center justify-between gap-3 px-1">
            <button
              onClick={handlePrevEpisode}
              disabled={currentEpisode <= 1}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                currentEpisode <= 1
                  ? 'opacity-40 cursor-not-allowed bg-zinc-900 text-zinc-500'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 active:scale-95'
              }`}
            >
              <SkipBack className="w-3.5 h-3.5" />
              <span>Episode Sebelumnya</span>
            </button>

            <span className="text-xs font-bold text-zinc-400">
              Season {currentSeason} • Episode {currentEpisode}
            </span>

            <button
              onClick={handleNextEpisode}
              disabled={currentEpisode >= (episodesList.length || 24)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                currentEpisode >= (episodesList.length || 24)
                  ? 'opacity-40 cursor-not-allowed bg-zinc-900 text-zinc-500'
                  : 'bg-white hover:bg-zinc-200 text-black font-bold active:scale-95 shadow-md'
              }`}
            >
              <span>Episode Berikutnya</span>
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Ad-Shield & Durasi Penuh Notice */}
        <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-950/50 via-zinc-900/70 to-zinc-900/50 border border-emerald-500/25 text-zinc-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-extrabold text-[10px] uppercase tracking-wide border border-emerald-500/30 flex items-center gap-1">
              <span>🛡️ Ad-Shield Aktif</span>
            </span>
            <span className="text-zinc-300 text-[11px] sm:text-xs">
              Popup iklan & redirect eksternal <b>diblokir</b>. Pemutaran tetap fokus di player McMovies dengan <b>durasi penuh</b> tanpa terpotong 15 menit & bebas VIP.
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 font-medium">
            Server Utama: <strong className="text-emerald-400">{availableServers.find(s => s.id === activeServer)?.name || (useDirectPlayer ? 'MovieBox Direct HD' : 'AnyEmbed 4K')}</strong>
          </span>
        </div>

        {/* Minimal CinemaOS Server Toolbar */}
        <div className="mt-3.5 px-3 sm:px-4 py-2.5 rounded-2xl bg-[#0a0c14]/90 backdrop-blur-xl border border-white/[0.08] shadow-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mr-1 flex-none">
              <Layers className="w-3.5 h-3.5 text-zinc-300" />
              <span>Server:</span>
            </span>

            {availableServers.map((s) => {
              const isActive = (s.id === 'dub_direct' || s.id === 'dub_tmdb' || s.id === 'dub_cf' || s.id === 'moviebox_direct')
                ? (useDirectPlayer && activeServer === s.id)
                : (!useDirectPlayer && activeServer === s.id);

              return (
                <button
                  key={s.id}
                  onClick={() => handleServerSelect(s.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex-none flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-white text-black font-bold shadow-md scale-[1.02]'
                      : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-white/[0.08]'
                  }`}
                >
                  <span>{s.name}</span>
                  {s.badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isActive ? 'bg-black/10 text-black' : 'bg-white/10 text-zinc-400'}`}>
                      {s.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-none">
            <button
              onClick={handleToggleFullscreen}
              className="px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
              title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
              <span>{isFullscreen ? 'Keluar Fullscreen' : 'Layar Penuh'}</span>
            </button>

            <button
              onClick={() => setReloadKey(p => p + 1)}
              className="px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
              title="Muat Ulang Pemutar"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
              <span>Muat Ulang</span>
            </button>
          </div>
        </div>

        {/* Episode Part Selector Bar (e.g. Episode 1 Part 1, Part 2, Part 3) */}
        {currentEpisode === 1 && item?.parts && item.parts.length > 1 && (
          <div className="mt-3 px-4 py-2.5 rounded-2xl bg-[#0e1017] border border-amber-400/20 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-lg animate-fadeIn">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 flex-none">
              <Layers className="w-3.5 h-3.5" />
              <span>Bagian Episode 1:</span>
            </span>
            <div className="flex items-center gap-2">
              {item.parts.map((p) => {
                const isSelected = selectedPart === p.part;
                return (
                  <button
                    key={p.part}
                    onClick={() => {
                      setSelectedPart(p.part);
                      if (videoRef.current && p.url) {
                        videoRef.current.src = p.url;
                        videoRef.current.play().catch(() => {});
                      }
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-400 text-black font-extrabold shadow-md scale-[1.02]'
                        : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-white/10'
                    }`}
                  >
                    <Play className={`w-3 h-3 ${isSelected ? 'fill-black' : 'fill-zinc-400'}`} />
                    <span>{p.name || `Part ${p.part}`}</span>
                  </button>
                );
              })}
            </div>
            <span className="ml-auto text-[11px] text-zinc-400 hidden md:inline">
              ⚡ Durasi Penuh • Kualitas HD • Tanpa Iklan
            </span>
          </div>
        )}
      </div>

      {/* 
        ========================================================================
        4. METADATA, PEMERAN UTAMA & DAFTAR EPISODE (Exact match to Reference Image)
        ========================================================================
      */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Title, Badges & Synopsis */}
        <div className="border-b border-white/[0.08] pb-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {item.isDubIndo || item.hasDubIndo ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-black">
                🇮🇩 Audio Dubbing Indonesia
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-900 text-zinc-300 border border-white/10">
                {isSeries ? 'TV Series' : 'Movie'}
              </span>
            )}

            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/60 text-amber-400 border border-white/10 text-xs font-bold">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{rating}</span>
            </div>

            {year && <span className="text-xs font-semibold text-zinc-400">{year}</span>}
            {runtime && <span className="text-xs font-semibold text-zinc-400">• {runtime}</span>}

            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-900 text-zinc-300 border border-white/10">
              4K Ultra HD
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight uppercase leading-tight">
            {title}
          </h1>

          {genres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
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

          <div className="mt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Sinopsis
            </h3>
            <p className="text-sm text-zinc-300 leading-relaxed max-w-4xl font-normal">
              {cleanSynopsis(item.overview || item.description)}
            </p>
          </div>
        </div>

        {/* 
          ========================================================================
          SECTION 1: PEMERAN UTAMA (Exact match to Reference Image media_1795187618051_190c7bdf.jpg)
          ========================================================================
        */}
        {cast.length > 0 && (
          <div className="mt-8 border-b border-white/[0.08] pb-8">
            <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white mb-5">
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
          SECTION 2: DAFTAR EPISODE (Exact match to Reference Image)
          ========================================================================
        */}
        {isSeries && (
          <div className="mt-8 border-b border-white/[0.08] pb-8">
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
                        currentSeason === s.season_number
                          ? 'bg-white text-black shadow-sm font-extrabold'
                          : 'bg-[#181920] hover:bg-[#20222b] text-zinc-300'
                      }`}
                    >
                      Season {s.season_number}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Episodes 3-Column Responsive Grid */}
            {loadingSeason ? (
              <div className="py-16 text-center text-xs text-zinc-400 animate-pulse flex flex-col items-center justify-center gap-2.5">
                <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <span>Memuat episode Season {currentSeason}...</span>
              </div>
            ) : episodesList.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-400 bg-black/20 rounded-xl border border-white/5 p-4">
                Daftar episode tidak tersedia untuk season ini di database.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-3.5">
                {episodesList.map((ep, idx) => {
                  const epNum = ep.episode_number || ep.episode || (idx + 1);
                  const epTitle = ep.name || ep.title || `Episode ${epNum}`;
                  const epThumb = ep.still_path
                    ? TmdbService.getImageUrl(ep.still_path, 'w500')
                    : (ep.thumbnail || (item.poster_path ? TmdbService.getImageUrl(item.poster_path, 'w500') : item.thumbnail));
                  const isCurrentActive = epNum === currentEpisode;

                  return (
                    <div
                      key={ep.id || epNum}
                      onClick={() => handleEpisodeChange(epNum)}
                      className={`group relative flex gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.99] shadow-lg ${
                        isCurrentActive
                          ? 'bg-[#1a1c24] border-2 border-white ring-1 ring-white/30 text-white shadow-white/5'
                          : 'bg-[#13141b]/90 hover:bg-[#1a1b24] border border-white/[0.06] hover:border-white/20 text-zinc-200'
                      }`}
                    >
                      {/* Left: Thumbnail with EP X badge in bottom-right */}
                      <div className="relative w-28 sm:w-32 aspect-video rounded-lg overflow-hidden flex-none bg-zinc-900 border border-white/5">
                        <img
                          src={epThumb}
                          alt={epTitle}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = item.thumbnail || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop&q=80';
                          }}
                        />
                        <div className={`absolute inset-0 transition-colors flex items-center justify-center ${
                          isCurrentActive ? 'bg-black/30' : 'bg-black/20 group-hover:bg-black/0'
                        }`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all ${
                            isCurrentActive
                              ? 'bg-white text-black opacity-100 scale-105'
                              : 'bg-white text-black opacity-0 group-hover:opacity-100 group-hover:scale-110'
                          }`}>
                            <Play className="w-3.5 h-3.5 fill-black translate-x-0.5" />
                          </div>
                        </div>
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-black/90 text-white border border-white/10">
                          EP {epNum}
                        </span>
                      </div>

                      {/* Right: Title & 2-Line Synopsis */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <h4 className={`text-xs sm:text-sm font-bold line-clamp-1 transition-colors ${
                          isCurrentActive ? 'text-white font-extrabold' : 'text-zinc-100 group-hover:text-white'
                        }`}>
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
          <div className="mt-12">
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
