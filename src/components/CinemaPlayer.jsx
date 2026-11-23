import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
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
  Lock,
  Unlock,
  Settings,
  Subtitles,
  Users,
  RefreshCw,
  SkipBack,
  SkipForward,
  AlertCircle,
  Loader2,
  Film,
  Check
} from 'lucide-react';

/**
 * McMovies HTML5 + HLS.js Player
 * Plays all direct .m3u8 HLS streams and .mp4 streams inside McMovies with zero external iframes.
 */
export default function CinemaPlayer({
  streams = [],
  activeStreamIndex = 0,
  onSelectStream,
  subtitles = [],
  isExtracting = false,
  extractError = null,
  onRetryExtract,
  onBackToDetail,
  title = 'Untitled',
  subtitleBadge = '',
  year = '',
  rating = '',
  runtime = '',
  synopsis = '',
  posterUrl = '',
  isSeries = false,
  currentSeason = 1,
  currentEpisode = 1,
  onPrevEpisode,
  onNextEpisode,
  hasPrevEpisode = false,
  hasNextEpisode = false,
  onBack,
  onShare,
  isDubAudio = false,
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const mediaRecoveryRef = useRef(0);
  const triedProxyRef = useRef(false);
  const lastTapRef = useRef({ time: 0, side: null });

  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscapeMode, setIsLandscapeMode] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [lockNotice, setLockNotice] = useState(false);
  const [statusToast, setStatusToast] = useState('');
  const [streamFailed, setStreamFailed] = useState(false);
  const [qualityLevels, setQualityLevels] = useState([]);
  const [activeLevel, setActiveLevel] = useState(-1); // -1 = Auto
  const [activeSubIndex, setActiveSubIndex] = useState(() => (subtitles.length > 0 ? 0 : -1));

  const activeStream = streams[activeStreamIndex] || null;

  // Keep activeSubIndex in sync when subtitles arrive
  useEffect(() => {
    if (subtitles.length > 0 && activeSubIndex === -1) {
      setActiveSubIndex(0);
    } else if (subtitles.length === 0) {
      setActiveSubIndex(-1);
    }
  }, [subtitles.length]);

  // Apply text track mode changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = i === activeSubIndex ? 'showing' : 'disabled';
    }
  }, [activeSubIndex, subtitles, activeStreamIndex]);

  // Clear status toast after 4.5s
  useEffect(() => {
    if (!statusToast) return;
    const t = setTimeout(() => setStatusToast(''), 4500);
    return () => clearTimeout(t);
  }, [statusToast]);

  // Initialize / switch HLS.js or direct MP4 playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStream) return;

    setStreamFailed(false);
    setQualityLevels([]);
    setActiveLevel(-1);
    mediaRecoveryRef.current = 0;
    setIsBuffering(true);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const initialSrc =
      activeStream.type === 'hls'
        ? !isLocalhost || activeStream.preferProxy || !activeStream.url
          ? activeStream.proxyUrl || activeStream.url
          : activeStream.url
        : activeStream.url;

    triedProxyRef.current = Boolean(activeStream.proxyUrl && initialSrc === activeStream.proxyUrl);

    let destroyed = false;

    const startHls = (srcUrl) => {
      if (destroyed) return;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startFragPrefetch: true,
        maxBufferLength: 20,
        maxMaxBufferLength: 40,
        backBufferLength: 30,
        maxBufferHole: 0.5,
        startLevel: -1,
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 15000,
      });
      hlsRef.current = hls;
      hls.loadSource(srcUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        if (destroyed) return;
        const parsed = (data?.levels || []).map((lvl, idx) => ({
          index: idx,
          height: lvl.height || 0,
          label: lvl.height ? `${lvl.height}p` : `Kualitas ${idx + 1}`,
        }));
        setQualityLevels(parsed);
        setIsBuffering(false);
        video.playbackRate = playbackSpeed;
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (destroyed || !data?.fatal) return;
        if (
          data.type === Hls.ErrorTypes.NETWORK_ERROR &&
          !triedProxyRef.current &&
          activeStream.proxyUrl
        ) {
          triedProxyRef.current = true;
          startHls(activeStream.proxyUrl);
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveryRef.current < 1) {
          mediaRecoveryRef.current += 1;
          hls.recoverMediaError();
          return;
        }
        if (activeStreamIndex + 1 < streams.length && onSelectStream) {
          setStatusToast('Server sibuk, beralih ke server cadangan...');
          onSelectStream(activeStreamIndex + 1);
        } else {
          setStreamFailed(true);
          setIsBuffering(false);
        }
      });
    };

    if (activeStream.type === 'hls') {
      if (Hls.isSupported()) {
        startHls(initialSrc);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = activeStream.proxyUrl || initialSrc;
        video.playbackRate = playbackSpeed;
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      } else {
        setStreamFailed(true);
        setIsBuffering(false);
      }
    } else {
      video.src = initialSrc;
      video.playbackRate = playbackSpeed;
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }

    return () => {
      destroyed = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeStream?.url, activeStream?.proxyUrl, activeStream?.type, activeStream?.preferProxy]);

  const scheduleHideControls = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying && !showSettingsMenu && !showSubtitleMenu) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2800);
    }
  }, [isPlaying, showSettingsMenu, showSubtitleMenu]);

  const handleMouseMove = () => {
    if (isScreenLocked) return;
    setShowControls(true);
    scheduleHideControls();
  };

  const triggerLockNotice = () => {
    setLockNotice(true);
    setTimeout(() => setLockNotice(false), 2000);
  };

  const togglePlay = useCallback(() => {
    if (isScreenLocked) {
      triggerLockNotice();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    setShowControls(true);
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isScreenLocked]);

  const skipTime = useCallback((seconds) => {
    if (isScreenLocked) {
      triggerLockNotice();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const target = Math.min(Math.max(video.currentTime + seconds, 0), video.duration || duration || 36000);
    video.currentTime = target;
    setCurrentTime(target);
    setShowControls(true);
  }, [isScreenLocked, duration]);

  const handleSeek = (e) => {
    if (isScreenLocked || !videoRef.current) return;
    const newTime = parseFloat(e.target.value);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    setShowSettingsMenu(false);
  };

  const handleQualityChange = (levelIndex) => {
    setActiveLevel(levelIndex);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    setShowSettingsMenu(false);
  };

  const handleToggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setIsMuted(next);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      try {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch {}
      try { screen.orientation?.unlock?.(); } catch {}
      try { videoRef.current?.webkitExitFullscreen?.(); } catch {}
      setIsFullscreen(false);
      setIsLandscapeMode(false);
      return;
    }

    const isPortrait = window.innerHeight > window.innerWidth;
    const isMobile = /iPad|iPhone|iPod|Android/.test(navigator.userAgent) || window.innerWidth < 768;
    try { screen.orientation?.lock?.('landscape')?.catch(() => {}); } catch {}
    if (isPortrait && isMobile) setIsLandscapeMode(true);

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS && videoRef.current && typeof videoRef.current.webkitEnterFullscreen === 'function') {
      try {
        videoRef.current.webkitEnterFullscreen();
        setIsFullscreen(true);
        return;
      } catch {}
    }

    const el = containerRef.current;
    if (el) {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) {
        try { el.webkitRequestFullscreen(); } catch {}
      }
    }
    setIsFullscreen(true);
  }, [isFullscreen]);

  // Sync browser native fullscreen exits (Escape key)
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        setIsFullscreen(false);
        setIsLandscapeMode(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (!activeStream) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
          e.preventDefault();
          skipTime(-10);
          break;
        case 'arrowright':
          e.preventDefault();
          skipTime(10);
          break;
        case 'arrowup':
          e.preventDefault();
          if (videoRef.current) {
            const v = Math.min(1, videoRef.current.volume + 0.1);
            videoRef.current.volume = v;
            videoRef.current.muted = false;
            setVolume(v);
            setIsMuted(false);
          }
          break;
        case 'arrowdown':
          e.preventDefault();
          if (videoRef.current) {
            const v = Math.max(0, videoRef.current.volume - 0.1);
            videoRef.current.volume = v;
            videoRef.current.muted = v === 0;
            setVolume(v);
            setIsMuted(v === 0);
          }
          break;
        case 'm':
          e.preventDefault();
          handleToggleMute();
          break;
        case 'f':
          e.preventDefault();
          handleToggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStream, togglePlay, skipTime, handleToggleMute, handleToggleFullscreen]);

  const handleSurfaceClick = (e) => {
    if (isScreenLocked) {
      triggerLockNotice();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const side = relX < 0.35 ? 'left' : relX > 0.65 ? 'right' : 'center';
    const now = Date.now();

    if (side !== 'center' && lastTapRef.current.side === side && now - lastTapRef.current.time < 280) {
      skipTime(side === 'left' ? -10 : 10);
      lastTapRef.current = { time: 0, side: null };
      return;
    }
    lastTapRef.current = { time: now, side };
    togglePlay();
  };

  const formatTime = (sec) => {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatRemainingTime = (curr, total) => {
    if (!Number.isFinite(total) || total <= 0) return '-00:00';
    return `-${formatTime(Math.max(0, total - curr))}`;
  };

  const playedPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (bufferedTime / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? isLandscapeMode
            ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100vh] h-[100vw] rotate-90 z-[99999] bg-black overflow-hidden flex items-center justify-center'
            : 'fixed inset-0 w-screen h-screen z-[99999] bg-black overflow-hidden flex items-center justify-center'
          : 'relative w-full aspect-video rounded-2xl overflow-hidden bg-[#0a0c12] border border-white/[0.09] shadow-2xl select-none'
      }
      onMouseMove={handleMouseMove}
    >
      {/* STATE 1: Extracting CloudX Direct Stream Overlay */}
      {isExtracting && !activeStream && (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center overflow-hidden">
          {posterUrl && (
            <img
              src={posterUrl}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover opacity-20 blur-xl scale-110 pointer-events-none"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/50 pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center max-w-md space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-xl flex items-center justify-center shadow-2xl">
              <Loader2 className="w-7 h-7 text-white animate-spin" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white leading-snug">
                Memuat Tayangan...
              </h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Menyiapkan video untuk <b className="text-zinc-200">{title}</b>...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STATE 2: No Direct Stream Found or All Direct Mirrors Failed */}
      {!isExtracting && (!activeStream || streamFailed) && (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center overflow-hidden">
          {posterUrl && (
            <img
              src={posterUrl}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover opacity-20 blur-xl scale-110 pointer-events-none"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60 pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center max-w-lg space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              {streamFailed ? <AlertCircle className="w-6 h-6" /> : <Film className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                {streamFailed
                  ? 'Stream Sedang Mengalami Gangguan'
                  : 'Stream Langsung Belum Tersedia di Mirror Aktif'}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 leading-relaxed">
                {extractError ||
                  `Server CloudX untuk "${title}" belum merespons atau judul/episode ini baru saja dirilis. Coba pindai ulang server langsung kami.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              {onRetryExtract && (
                <button
                  onClick={onRetryExtract}
                  className="px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-extrabold flex items-center gap-2 transition-all active:scale-95 shadow-lg"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Scan Ulang Server Langsung</span>
                </button>
              )}
              {onBackToDetail && (
                <button
                  onClick={onBackToDetail}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-all active:scale-95"
                >
                  Kembali ke Detail
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STATE 3: Pure Native HTML5 + HLS.js Video Canvas */}
      {activeStream && !streamFailed && (
        <div
          className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden"
          onClick={handleSurfaceClick}
        >
          <video
            ref={videoRef}
            playsInline
            crossOrigin={activeStream.type === 'hls' || subtitles.length > 0 ? 'anonymous' : undefined}
            className="w-full h-full object-contain bg-black"
            onWaiting={() => setIsBuffering(true)}
            onCanPlay={() => setIsBuffering(false)}
            onLoadedData={() => setIsBuffering(false)}
            onPlaying={() => {
              setIsBuffering(false);
              setIsPlaying(true);
            }}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onTimeUpdate={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.readyState >= 3 || (!v.paused && v.currentTime > 0)) {
                setIsBuffering(false);
              }
              setCurrentTime(v.currentTime);
              if (Number.isFinite(v.duration) && v.duration > 0) {
                setDuration(v.duration);
              }
              if (v.buffered && v.buffered.length > 0) {
                setBufferedTime(v.buffered.end(v.buffered.length - 1));
              }
            }}
            onProgress={() => {
              const v = videoRef.current;
              if (v && v.buffered && v.buffered.length > 0) {
                setBufferedTime(v.buffered.end(v.buffered.length - 1));
              }
            }}
            onError={() => {
              if (activeStream.type !== 'mp4') return;
              if (activeStreamIndex + 1 < streams.length && onSelectStream) {
                setStatusToast('Stream bermasalah, beralih ke server cadangan...');
                onSelectStream(activeStreamIndex + 1);
              } else {
                setStreamFailed(true);
                setIsBuffering(false);
              }
            }}
          >
            {subtitles.map((sub, idx) => (
              <track
                key={sub.url || idx}
                kind="subtitles"
                src={sub.url}
                srcLang={sub.lang || 'id'}
                label={sub.label || `Subtitle ${idx + 1}`}
                default={idx === 0}
              />
            ))}
          </video>

          {/* Standalone Buffering Indicator ONLY when HUD is hidden */}
          {isBuffering && !showControls && isPlaying && !isScreenLocked && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
              <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center shadow-2xl">
                <Loader2 className="w-7 h-7 text-white animate-spin" />
              </div>
            </div>
          )}

          {/* Status Toast inside player */}
          {statusToast && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-full bg-black/85 border border-emerald-500/40 text-emerald-300 text-xs font-semibold backdrop-blur-md pointer-events-none shadow-xl">
              {statusToast}
            </div>
          )}

          {/* Lock Notice Toast */}
          {lockNotice && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 px-4 py-2 rounded-xl bg-black/85 backdrop-blur-md border border-white/20 text-white text-xs font-bold flex items-center gap-2 pointer-events-none">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Layar Terkunci (Sentuh ikon gembok untuk membuka)</span>
            </div>
          )}

          {/* Screen Lock Padlock (Mid-Left) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsScreenLocked((prev) => !prev);
            }}
            className={`absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-30 p-2.5 sm:p-3 rounded-full backdrop-blur-xl border transition-all active:scale-95 shadow-xl ${
              isScreenLocked
                ? 'bg-amber-500/85 text-black border-amber-400'
                : `bg-black/50 hover:bg-black/80 text-white/80 hover:text-white border-white/20 ${
                    showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`
            }`}
            title={isScreenLocked ? 'Buka Kunci Layar' : 'Kunci Layar'}
          >
            {isScreenLocked ? <Lock className="w-4 h-4 sm:w-5 sm:h-5" /> : <Unlock className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {/* CinemaOS Player HUD Overlay */}
          <div
            className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${
              isScreenLocked
                ? 'opacity-0 pointer-events-none'
                : showControls || !isPlaying
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Top Bar */}
            <div className="relative z-30 px-3 sm:px-5 py-3 sm:py-4 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between gap-3 pointer-events-auto">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onBack) onBack();
                  }}
                  className="p-2 rounded-full hover:bg-white/10 text-white transition-all active:scale-95 flex-none"
                  title="Kembali"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                    {title}
                    {isSeries ? ` • S${currentSeason}:E${currentEpisode}` : ''}
                  </h2>
                  <p className="text-[11px] text-zinc-400 font-medium truncate">
                    {year ? `${year} • ` : ''}{runtime ? `${runtime} • ` : ''}{activeStream.providerLabel || 'HD Server'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-none">
                {onShare && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShare();
                    }}
                    className="p-2 rounded-xl bg-black/40 hover:bg-black/70 text-zinc-300 border border-white/10 backdrop-blur-md transition-all hidden sm:flex"
                    title="Bagikan Link"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                )}
                {isFullscreen ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsLandscapeMode((prev) => !prev);
                      }}
                      className="sm:hidden p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/15 backdrop-blur-md transition-all"
                      title={isLandscapeMode ? 'Mode Vertikal' : 'Mode Horizontal'}
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFullscreen();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold border border-white/15 backdrop-blur-md flex items-center gap-1.5 transition-all"
                      title="Keluar Layar Penuh"
                    >
                      <Minimize className="w-3.5 h-3.5" />
                      <span>Keluar</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFullscreen();
                    }}
                    className="p-2 rounded-xl bg-black/40 hover:bg-black/70 text-zinc-300 border border-white/10 backdrop-blur-md transition-all"
                    title="Layar Penuh"
                  >
                    <Maximize className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Center Rewind / Play / Forward (true geometric center) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto z-20">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skipTime(-10);
                }}
                className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-white transition-all shadow-lg"
                title="Mundur 10 detik"
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-[8px] font-black -mt-0.5">10</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="w-14 h-14 sm:w-18 sm:h-18 rounded-full bg-white/25 hover:bg-white/35 active:scale-95 backdrop-blur-xl border border-white/30 flex items-center justify-center text-white transition-all shadow-2xl"
                title={isBuffering ? 'Memuat...' : isPlaying ? 'Jeda' : 'Putar'}
              >
                {isBuffering ? (
                  <Loader2 className="w-7 h-7 sm:w-9 sm:h-9 animate-spin text-white" />
                ) : isPlaying ? (
                  <Pause className="w-7 h-7 sm:w-9 sm:h-9 fill-white" />
                ) : (
                  <Play className="w-7 h-7 sm:w-9 sm:h-9 fill-white translate-x-0.5" />
                )}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skipTime(10);
                }}
                className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-white transition-all shadow-lg"
                title="Maju 10 detik"
              >
                <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-[8px] font-black -mt-0.5">10</span>
              </button>
            </div>

            {/* Bottom Info + Seekbar + Controls */}
            <div className="relative z-30 p-3 sm:p-5 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-auto space-y-2.5 mt-auto">
              {/* Info overlay */}
              <div className="max-w-xl">
                <span className="block text-[10px] font-black tracking-[0.18em] text-emerald-400 uppercase">
                  YOU'RE WATCHING
                </span>
                <h3 className="hidden sm:block text-sm md:text-lg font-black text-white leading-tight uppercase tracking-tight line-clamp-1">
                  {title}
                </h3>
                <p className="hidden md:block text-xs text-zinc-400 line-clamp-1 mt-0.5">
                  {year}{rating ? ` • ★ ${rating}` : ''}{runtime ? ` • ${runtime}` : ''}{synopsis ? ` • ${synopsis}` : ''}
                </p>
              </div>

              {/* Buffered + Played Seekbar */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] tabular-nums text-zinc-300 min-w-[42px] text-right">
                  {formatTime(currentTime)}
                </span>
                <div
                  className="relative flex-1 h-4 flex items-center cursor-pointer group/seek"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-full h-1.5 group-hover/seek:h-2 bg-white/15 rounded-full overflow-hidden relative transition-all">
                    <div
                      className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
                      style={{ width: `${bufferedPct}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 bg-white rounded-full"
                      style={{ width: `${playedPct}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.5}
                    value={currentTime}
                    onChange={handleSeek}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <span className="text-[11px] tabular-nums text-zinc-400 min-w-[48px]">
                  {formatRemainingTime(currentTime, duration)}
                </span>
              </div>

              {/* Bottom Controls Row */}
              <div className="flex items-center justify-between gap-3">
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

                  {isSeries && hasPrevEpisode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrevEpisode?.();
                      }}
                      className="text-zinc-300 hover:text-white transition-colors hidden sm:inline-flex"
                      title="Episode Sebelumnya"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>
                  )}

                  {isSeries && hasNextEpisode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNextEpisode?.();
                      }}
                      className="text-zinc-300 hover:text-white transition-colors hidden sm:inline-flex"
                      title="Episode Berikutnya"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>
                  )}

                  <div className="flex items-center gap-1.5 group/vol">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleMute();
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
                      className="w-16 h-1 bg-white/25 rounded accent-white hidden group-hover/vol:inline-block"
                    />
                  </div>

                  {isDubAudio && (
                    <span className="text-[11px] font-bold text-emerald-400 hidden sm:inline">
                      🇮🇩 Dub Indo
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 relative">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-white/10 text-white border border-white/20">
                    {activeLevel >= 0 && qualityLevels[activeLevel] ? qualityLevels[activeLevel].label : 'HD/4K'}
                  </span>

                  {/* Subtitle selector */}
                  {subtitles.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSubtitleMenu((p) => !p);
                          setShowSettingsMenu(false);
                        }}
                        className={`p-1.5 rounded-lg text-white hover:bg-white/15 transition-colors ${
                          showSubtitleMenu || activeSubIndex >= 0 ? 'text-emerald-400' : ''
                        }`}
                        title="Subtitle (CC)"
                      >
                        <Subtitles className="w-4 h-4" />
                      </button>

                      {showSubtitleMenu && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 bottom-9 z-50 w-44 rounded-xl bg-[#11131a]/95 backdrop-blur-2xl border border-white/15 p-2 shadow-2xl text-xs space-y-1"
                        >
                          <div className="px-2 py-1 font-bold text-zinc-400 uppercase text-[10px]">
                            Subtitle (CC)
                          </div>
                          <button
                            onClick={() => {
                              setActiveSubIndex(-1);
                              setShowSubtitleMenu(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left ${
                              activeSubIndex === -1 ? 'bg-white text-black font-bold' : 'text-zinc-300 hover:bg-white/10'
                            }`}
                          >
                            <span>Nonaktif</span>
                            {activeSubIndex === -1 && <Check className="w-3.5 h-3.5" />}
                          </button>
                          {subtitles.map((sub, idx) => (
                            <button
                              key={sub.url || idx}
                              onClick={() => {
                                setActiveSubIndex(idx);
                                setShowSubtitleMenu(false);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left ${
                                activeSubIndex === idx ? 'bg-white text-black font-bold' : 'text-zinc-300 hover:bg-white/10'
                              }`}
                            >
                              <span>{sub.label}</span>
                              {activeSubIndex === idx && <Check className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Settings selector (Quality + Playback Speed) */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowSettingsMenu((p) => !p);
                        setShowSubtitleMenu(false);
                      }}
                      className={`p-1.5 rounded-lg text-white hover:bg-white/15 transition-colors ${
                        showSettingsMenu ? 'bg-white/20' : ''
                      }`}
                      title="Kualitas & Kecepatan"
                    >
                      <Settings className="w-4 h-4" />
                    </button>

                    {showSettingsMenu && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 bottom-9 z-50 w-52 rounded-xl bg-[#11131a]/95 backdrop-blur-2xl border border-white/15 p-3 shadow-2xl text-xs space-y-3"
                      >
                        {qualityLevels.length > 0 && (
                          <div>
                            <div className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] mb-1.5">
                              Kualitas Video
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <button
                                onClick={() => handleQualityChange(-1)}
                                className={`px-2 py-1 rounded font-bold ${
                                  activeLevel === -1 ? 'bg-white text-black' : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                                }`}
                              >
                                Auto
                              </button>
                              {qualityLevels.map((q) => (
                                <button
                                  key={q.index}
                                  onClick={() => handleQualityChange(q.index)}
                                  className={`px-2 py-1 rounded font-bold ${
                                    activeLevel === q.index ? 'bg-white text-black' : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                                  }`}
                                >
                                  {q.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] mb-1.5">
                            Kecepatan Putar
                          </div>
                          <div className="grid grid-cols-5 gap-1">
                            {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                              <button
                                key={s}
                                onClick={() => handleSpeedChange(s)}
                                className={`py-1 rounded text-center font-bold ${
                                  playbackSpeed === s ? 'bg-white text-black' : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                                }`}
                              >
                                {s}x
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFullscreen();
                    }}
                    className="text-white hover:text-zinc-300 transition-colors p-1"
                    title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
                  >
                    {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
