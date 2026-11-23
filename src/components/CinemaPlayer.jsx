import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture2,
  Lock,
  Unlock,
  Settings,
  Subtitles,
  Layers,
  Users,
  ListVideo,
  Palette,
  Upload,
  RefreshCw,
  SkipBack,
  SkipForward,
  FastForward,
  AlertCircle,
  Loader2,
  Film,
  Check,
  X,
} from 'lucide-react';
import { StorageService } from '../services/storageService';

const ACCENT_SWATCHES = [
  '#ffffff',
  '#3b82f6',
  '#ef4444',
  '#a855f7',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
];

const SUB_COLOR_SWATCHES = ['#ffffff', '#facc15', '#4ade80', '#38bdf8'];

function convertSrtToVttClient(text) {
  const clean = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return clean.trimStart().startsWith('WEBVTT') ? clean : `WEBVTT\n\n${clean}`;
}

const SEGMENT_PRIORITY = { recap: 0, intro: 1, credits: 2 };

function resolveSkipSegments(skipSegments, duration, isSeries, hasNextEpisode) {
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(skipSegments) || skipSegments.length === 0) {
    return [];
  }

  const introRecaps = [];
  for (const seg of skipSegments) {
    if (!seg || (seg.type !== 'recap' && seg.type !== 'intro')) continue;
    if (seg.endSec == null || !Number.isFinite(seg.endSec)) continue;
    const effectiveEnd = Math.min(seg.endSec, duration);
    if (seg.startSec > duration * 0.55) continue;
    if (effectiveEnd - seg.startSec < 5) continue;
    if (effectiveEnd >= duration - 10) continue;

    introRecaps.push({
      key: `${seg.type}_${Math.round(seg.startSec)}_${Math.round(effectiveEnd)}`,
      type: seg.type,
      startSec: seg.startSec,
      effectiveEnd,
      action: 'seek',
      label: seg.type === 'recap' ? 'Lewati Rekap' : 'Lewati Intro',
      shortLabel: seg.type === 'recap' ? 'Rekap' : 'Intro',
      osd: seg.type === 'recap' ? 'Melewati Rekap' : 'Melewati Intro',
    });
  }

  const creditSegments = [];
  for (const seg of skipSegments) {
    if (!seg || seg.type !== 'credits') continue;
    if (seg.startSec < duration * 0.65) continue;
    const effectiveEnd = seg.endSec != null ? Math.min(seg.endSec, duration) : duration;
    if (effectiveEnd <= seg.startSec + 3) continue;
    const overlapsIntro = introRecaps.some((o) => seg.startSec < o.effectiveEnd && effectiveEnd > o.startSec);
    if (overlapsIntro) continue;

    let action = '';
    let label = '';
    let osd = '';
    if (isSeries && hasNextEpisode) {
      action = 'next_episode';
      label = 'Episode Berikutnya';
      osd = 'Memutar Episode Berikutnya';
    } else if (seg.endSec != null && effectiveEnd < duration - 10 && effectiveEnd - seg.startSec >= 10) {
      action = 'seek';
      label = 'Lewati Credits';
      osd = 'Melewati Credits';
    } else {
      continue;
    }

    creditSegments.push({
      key: `credits_${Math.round(seg.startSec)}_${Math.round(effectiveEnd)}`,
      type: 'credits',
      startSec: seg.startSec,
      effectiveEnd,
      action,
      label,
      shortLabel: 'Credits',
      osd,
    });
  }

  const candidates = [...introRecaps, ...creditSegments].sort((a, b) => {
    if (Math.abs(a.startSec - b.startSec) > 0.5) return a.startSec - b.startSec;
    return SEGMENT_PRIORITY[a.type] - SEGMENT_PRIORITY[b.type];
  });

  const deduped = [];
  for (const seg of candidates) {
    const prev = deduped[deduped.length - 1];
    if (prev && seg.startSec < prev.effectiveEnd) {
      if (SEGMENT_PRIORITY[seg.type] < SEGMENT_PRIORITY[prev.type]) {
        deduped[deduped.length - 1] = seg;
      }
      continue;
    }
    deduped.push(seg);
  }

  return deduped;
}

export default function CinemaPlayer({
  streams = [],
  activeStreamIndex = 0,
  onSelectStream,
  subtitles = [],
  skipSegments = [],
  isExtracting = false,
  extractError = null,
  onRetryExtract,
  onBackToDetail,
  title = 'Untitled',
  titleLogoUrl = null,
  year = '',
  rating = '',
  runtime = '',
  synopsis = '',
  posterUrl = '',
  isSeries = false,
  currentSeason = 1,
  currentEpisode = 1,
  episodesList = [],
  validSeasons = [],
  onSeasonChange,
  onEpisodeChange,
  onPrevEpisode,
  onNextEpisode,
  hasPrevEpisode = false,
  hasNextEpisode = false,
  parts = [],
  selectedPart = 1,
  onSelectPart,
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
  const fileInputRef = useRef(null);
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const uploadedBlobUrlsRef = useRef([]);

  const [prefs, setPrefs] = useState(() => StorageService.getPlayerPrefs());
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [audioBoost, setAudioBoost] = useState(100); // 100 | 150 | 200
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscapeMode, setIsLandscapeMode] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [lockNotice, setLockNotice] = useState(false);
  const [statusToast, setStatusToast] = useState('');
  const [osdMessage, setOsdMessage] = useState('');
  const [streamFailed, setStreamFailed] = useState(false);
  const [qualityLevels, setQualityLevels] = useState([]);
  const [activeLevel, setActiveLevel] = useState(-1); // -1 = Auto
  const [uploadedSubs, setUploadedSubs] = useState([]);
  const [activeSubIndex, setActiveSubIndex] = useState(() => (subtitles.length > 0 ? 0 : -1));
  const [hoverSeek, setHoverSeek] = useState(null); // { pct, time }
  const [dismissedSegKeys, setDismissedSegKeys] = useState(() => new Set());

  // Unified Floating Panel State
  const [panelTab, setPanelTab] = useState(null); // null | 'source' | 'quality' | 'subtitles' | 'playback'
  const [showAppearanceSub, setShowAppearanceSub] = useState(false);
  const [showEpisodesDrawer, setShowEpisodesDrawer] = useState(false);
  const [sourceProtoFilter, setSourceProtoFilter] = useState('all'); // all | hls | mp4

  const activeStream = streams[activeStreamIndex] || null;
  const allSubtitles = useMemo(() => [...subtitles, ...uploadedSubs], [subtitles, uploadedSubs]);

  const updatePref = useCallback((patch) => {
    setPrefs((prev) => {
      const next = StorageService.savePlayerPrefs({ ...prev, ...patch });
      return next;
    });
  }, []);

  const flashOsd = useCallback((msg) => {
    setOsdMessage(msg);
  }, []);

  useEffect(() => {
    if (!osdMessage) return;
    const t = setTimeout(() => setOsdMessage(''), 1300);
    return () => clearTimeout(t);
  }, [osdMessage]);

  useEffect(() => {
    if (!statusToast) return;
    const t = setTimeout(() => setStatusToast(''), 4200);
    return () => clearTimeout(t);
  }, [statusToast]);

  // Revoke any local uploaded subtitle blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const u of uploadedBlobUrlsRef.current) {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      }
      if (audioCtxRef.current && typeof audioCtxRef.current.close === 'function') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Sync activeSubIndex when extracted subtitles arrive
  useEffect(() => {
    if (allSubtitles.length > 0 && activeSubIndex === -1) {
      setActiveSubIndex(0);
    } else if (allSubtitles.length === 0) {
      setActiveSubIndex(-1);
    }
  }, [allSubtitles.length]);

  // Apply text track mode changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = i === activeSubIndex ? 'showing' : 'disabled';
    }
  }, [activeSubIndex, allSubtitles, activeStreamIndex]);

  // Reset dismissed skip segments whenever fetched segment list changes
  useEffect(() => {
    setDismissedSegKeys(new Set());
  }, [skipSegments]);

  // Apply Data Saver (cap HLS auto quality <= 720p)
  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls || qualityLevels.length === 0) return;
    if (prefs.dataSaver) {
      let max720 = -1;
      for (const lvl of qualityLevels) {
        if (lvl.height > 0 && lvl.height <= 720) {
          max720 = lvl.index;
        }
      }
      hls.autoLevelCapping = max720;
    } else {
      hls.autoLevelCapping = -1;
    }
  }, [prefs.dataSaver, qualityLevels]);

  // Initialize / switch HLS.js or direct MP4 playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStream) return;

    setStreamFailed(false);
    setQualityLevels([]);
    setActiveLevel(-1);
    setCurrentTime(0);
    setDuration(0);
    setBufferedTime(0);
    setDismissedSegKeys(new Set());
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
          width: lvl.width || 0,
          bitrate: lvl.bitrate || 0,
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
    if (isPlaying && !panelTab && !showEpisodesDrawer) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2800);
    }
  }, [isPlaying, panelTab, showEpisodesDrawer]);

  const handleMouseMove = () => {
    if (isScreenLocked) return;
    setShowControls(true);
    scheduleHideControls();
  };

  const triggerLockNotice = () => {
    setLockNotice(true);
    setTimeout(() => setLockNotice(false), 1800);
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

  const skipTime = useCallback(
    (seconds, customLabel) => {
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
      flashOsd(customLabel || `${seconds > 0 ? `+${seconds}` : seconds} dtk`);
    },
    [isScreenLocked, duration, flashOsd]
  );

  const handleSeek = (e) => {
    if (isScreenLocked || !videoRef.current) return;
    const newTime = parseFloat(e.target.value);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setDismissedSegKeys(new Set());
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    flashOsd(`Kecepatan ${speed}×`);
  };

  const handleQualityChange = (levelIndex) => {
    setActiveLevel(levelIndex);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    const lvl = qualityLevels.find((q) => q.index === levelIndex);
    flashOsd(levelIndex === -1 ? 'Kualitas Auto' : lvl?.label || 'Kualitas');
  };

  const handleAudioBoostChange = (pct) => {
    setAudioBoost(pct);
    const video = videoRef.current;
    if (!video) return;
    if (pct === 100 && !gainNodeRef.current) {
      flashOsd('Audio 100%');
      return;
    }
    try {
      if (!audioCtxRef.current && pct > 100) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
          flashOsd('Penguat audio tidak didukung browser');
          return;
        }
        const ctx = new AudioCtx();
        const src = ctx.createMediaElementSource(video);
        const gain = ctx.createGain();
        src.connect(gain);
        gain.connect(ctx.destination);
        audioCtxRef.current = ctx;
        gainNodeRef.current = gain;
      }
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = pct / 100;
        flashOsd(`Penguat Audio ${pct}%`);
      }
    } catch {
      flashOsd('Penguat audio tidak tersedia pada server ini');
    }
  };

  const handleTogglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {}
  }, []);

  const handleToggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setIsMuted(next);
    flashOsd(next ? 'Audio Bisu' : 'Audio Aktif');
  }, [flashOsd]);

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
      if (e.key === 'Escape') {
        if (panelTab) {
          setPanelTab(null);
          setShowAppearanceSub(false);
          return;
        }
        if (showEpisodesDrawer) {
          setShowEpisodesDrawer(false);
          return;
        }
      }
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
            flashOsd(`Volume ${Math.round(v * 100)}%`);
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
            flashOsd(`Volume ${Math.round(v * 100)}%`);
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
        case 'p':
          e.preventDefault();
          handleTogglePip();
          break;
        case 'c':
          e.preventDefault();
          if (allSubtitles.length > 0) {
            setActiveSubIndex((prev) => (prev >= 0 ? -1 : 0));
          }
          break;
        case 'l':
          e.preventDefault();
          setIsScreenLocked((p) => !p);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeStream,
    panelTab,
    showEpisodesDrawer,
    togglePlay,
    skipTime,
    handleToggleMute,
    handleToggleFullscreen,
    handleTogglePip,
    allSubtitles.length,
    flashOsd,
  ]);

  const handleSubtitleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const vtt = convertSrtToVttClient(text);
      const blob = new Blob([vtt], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);
      uploadedBlobUrlsRef.current.push(url);
      const cleanName = file.name.replace(/\.(srt|vtt)$/i, '').slice(0, 28);
      setUploadedSubs((prev) => {
        const next = [...prev, { url, lang: 'id', label: cleanName || 'Subtitle Lokal' }];
        setActiveSubIndex(subtitles.length + next.length - 1);
        return next;
      });
      flashOsd('Subtitle berhasil dimuat');
    } catch {
      flashOsd('Gagal membaca file subtitle');
    }
    e.target.value = '';
  };

  const handleSurfaceClick = (e) => {
    if (isScreenLocked) {
      triggerLockNotice();
      return;
    }
    if (panelTab || showEpisodesDrawer) {
      setPanelTab(null);
      setShowAppearanceSub(false);
      setShowEpisodesDrawer(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const side = relX < 0.32 ? 'left' : relX > 0.68 ? 'right' : 'center';
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

  const resolvedSegments = useMemo(
    () => resolveSkipSegments(skipSegments, duration, isSeries, hasNextEpisode),
    [skipSegments, duration, isSeries, hasNextEpisode]
  );

  const activeSkipSegment = useMemo(() => {
    if (
      !prefs.showSkipIntro ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      isScreenLocked ||
      Boolean(panelTab) ||
      showEpisodesDrawer
    ) {
      return null;
    }

    return (
      resolvedSegments.find((seg) => {
        if (dismissedSegKeys.has(seg.key)) return false;
        const exitThreshold = seg.action === 'next_episode' ? duration - 0.5 : seg.effectiveEnd - 1.5;
        return currentTime >= seg.startSec && currentTime < exitThreshold;
      }) || null
    );
  }, [
    prefs.showSkipIntro,
    duration,
    isScreenLocked,
    panelTab,
    showEpisodesDrawer,
    resolvedSegments,
    dismissedSegKeys,
    currentTime,
  ]);

  const hoveredSegment = useMemo(() => {
    if (!hoverSeek || resolvedSegments.length === 0) return null;
    return (
      resolvedSegments.find(
        (seg) => hoverSeek.time >= seg.startSec && hoverSeek.time <= seg.effectiveEnd
      ) || null
    );
  }, [hoverSeek, resolvedSegments]);

  const handleSkipSegment = useCallback(
    (seg) => {
      if (!seg || isScreenLocked) return;

      setDismissedSegKeys((prev) => {
        const next = new Set(prev);
        next.add(seg.key);
        return next;
      });

      if (seg.action === 'next_episode' && onNextEpisode) {
        flashOsd(seg.osd);
        onNextEpisode();
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      const vidDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
      const target = Math.min(seg.effectiveEnd + 0.4, Math.max(0, vidDuration - 1));
      video.currentTime = target;
      setCurrentTime(target);
      flashOsd(seg.osd);
    },
    [isScreenLocked, onNextEpisode, duration, flashOsd]
  );

  const filteredSources = useMemo(() => {
    return streams
      .map((s, idx) => ({ ...s, originalIndex: idx }))
      .filter((s) => (sourceProtoFilter === 'all' ? true : (s.type || 'hls') === sourceProtoFilter));
  }, [streams, sourceProtoFilter]);

  const togglePanel = (tab) => {
    setShowEpisodesDrawer(false);
    setShowAppearanceSub(false);
    setPanelTab((prev) => (prev === tab ? null : tab));
  };

  const activeQualityLabel =
    activeLevel >= 0 && qualityLevels[activeLevel]
      ? qualityLevels[activeLevel].label
      : activeStream?.type === 'mp4'
        ? 'HD'
        : 'Auto';

  const panelSurfaceClass =
    prefs.panelStyle === 'solid'
      ? 'bg-[#11131a] border border-white/15 shadow-2xl'
      : 'glass-dock';

  const progressFillStyle =
    prefs.progressStyle === 'gradient'
      ? {
          width: `${playedPct}%`,
          background: `linear-gradient(90deg, #ffffff 0%, ${prefs.accentColor} 100%)`,
        }
      : prefs.progressStyle === 'glow'
        ? {
            width: `${playedPct}%`,
            backgroundColor: prefs.accentColor,
            boxShadow: `0 0 12px ${prefs.accentColor}`,
          }
        : {
            width: `${playedPct}%`,
            backgroundColor: prefs.accentColor,
          };

  const videoFitClass =
    prefs.pictureFit === 'cover'
      ? 'object-cover'
      : prefs.pictureFit === 'fill'
        ? 'object-fill'
        : 'object-contain';

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? isLandscapeMode
            ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100vh] h-[100vw] rotate-90 z-[99999] bg-black overflow-hidden flex items-center justify-center'
            : 'fixed inset-0 w-screen h-screen z-[99999] bg-black overflow-hidden flex items-center justify-center'
          : 'relative w-full h-full bg-black overflow-hidden select-none'
      }
      onMouseMove={handleMouseMove}
    >
      {/* Dynamic Scoped Subtitle Cue Style */}
      <style>{`
        .mc-player-video::cue {
          font-family: 'Poppins', sans-serif;
          font-size: ${prefs.subSize}%;
          color: ${prefs.subColor};
          background-color: ${prefs.subBg ? 'rgba(0, 0, 0, 0.72)' : 'transparent'};
          text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9);
        }
      `}</style>

      {/* STATE 1: Loading / Preparing Stream */}
      {isExtracting && !activeStream && (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center overflow-hidden">
          {posterUrl && (
            <img
              src={posterUrl}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl scale-110 pointer-events-none"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/60 pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center max-w-md space-y-4">
            <div className="w-14 h-14 rounded-2xl glass-dock flex items-center justify-center shadow-2xl">
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

      {/* STATE 2: No Stream Available */}
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
                  `Server untuk "${title}" belum merespons. Coba pindai ulang server kami.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              {onRetryExtract && (
                <button
                  onClick={onRetryExtract}
                  className="px-5 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Scan Ulang Server</span>
                </button>
              )}
              {onBackToDetail && (
                <button
                  onClick={onBackToDetail}
                  className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-all active:scale-95"
                >
                  Kembali ke Detail
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STATE 3: Full-Viewport HTML5 + HLS Video Canvas */}
      {activeStream && !streamFailed && (
        <div
          className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden"
          onClick={handleSurfaceClick}
        >
          <video
            ref={videoRef}
            playsInline
            crossOrigin={activeStream.type === 'hls' || allSubtitles.length > 0 ? 'anonymous' : undefined}
            className={`mc-player-video w-full h-full ${videoFitClass} bg-black transition-all duration-200`}
            onWaiting={() => setIsBuffering(true)}
            onCanPlay={() => setIsBuffering(false)}
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v && Number.isFinite(v.duration) && v.duration > 0) {
                setDuration(v.duration);
              }
            }}
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
            {allSubtitles.map((sub, idx) => (
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

          {/* Center Buffering Spinner when HUD Hidden */}
          {isBuffering && !showControls && isPlaying && !isScreenLocked && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
              <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center shadow-2xl">
                <Loader2 className="w-7 h-7 text-white animate-spin" />
              </div>
            </div>
          )}

          {/* Transient OSD Pill */}
          {osdMessage && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-full glass-dock text-white text-xs font-semibold pointer-events-none animate-modal-pop">
              {osdMessage}
            </div>
          )}

          {/* Status Toast */}
          {statusToast && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-full bg-black/85 border border-emerald-500/40 text-emerald-300 text-xs font-semibold backdrop-blur-md pointer-events-none shadow-xl">
              {statusToast}
            </div>
          )}

          {/* Lock Notice */}
          {lockNotice && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 px-4 py-2 rounded-full glass-dock text-white text-xs font-semibold flex items-center gap-2 pointer-events-none">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Layar Terkunci</span>
            </div>
          )}

          {/* Mid-Left Padlock */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsScreenLocked((prev) => {
                const next = !prev;
                flashOsd(next ? 'Layar Terkunci' : 'Kunci Dibuka');
                return next;
              });
            }}
            className={`absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full border backdrop-blur-xl flex items-center justify-center transition-all active:scale-95 ${
              isScreenLocked
                ? 'bg-white text-black border-white shadow-xl opacity-100'
                : `bg-black/45 hover:bg-black/75 text-white/80 hover:text-white border-white/15 ${
                    showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`
            }`}
            title={isScreenLocked ? 'Buka Kunci Layar' : 'Kunci Layar'}
          >
            {isScreenLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>

          {/* Main HUD Overlay */}
          <div
            className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${
              isScreenLocked
                ? 'opacity-0 pointer-events-none'
                : showControls || !isPlaying || Boolean(panelTab) || showEpisodesDrawer
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Top Bar */}
            <div className="relative z-30 px-4 sm:px-7 py-4 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between gap-3 pointer-events-auto">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onBack) onBack();
                  }}
                  className="w-9 h-9 rounded-full hover:bg-white/10 text-white flex items-center justify-center transition-all active:scale-95 flex-none"
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
                    {year ? `${year} • ` : ''}
                    {runtime ? `${runtime} • ` : ''}
                    {activeStream.providerLabel || 'HD Server'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-none">
                {isSeries && episodesList.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPanelTab(null);
                      setShowEpisodesDrawer((p) => !p);
                    }}
                    className={`h-9 px-3 rounded-full border backdrop-blur-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      showEpisodesDrawer
                        ? 'bg-white text-black border-white'
                        : 'bg-black/45 hover:bg-white/15 text-zinc-200 border-white/15'
                    }`}
                    title="Daftar Episode"
                  >
                    <ListVideo className="w-4 h-4" />
                    <span className="hidden sm:inline">Episode</span>
                  </button>
                )}

                {onShare && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShare();
                      flashOsd('Link disalin');
                    }}
                    className="w-9 h-9 rounded-full bg-black/45 hover:bg-white/15 text-zinc-200 border border-white/15 backdrop-blur-md hidden sm:flex items-center justify-center transition-all"
                    title="Bagikan Link"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                )}

                {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePip();
                    }}
                    className="w-9 h-9 rounded-full bg-black/45 hover:bg-white/15 text-zinc-200 border border-white/15 backdrop-blur-md hidden sm:flex items-center justify-center transition-all"
                    title="Picture-in-Picture"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>
                )}

                {isFullscreen && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsLandscapeMode((prev) => !prev);
                    }}
                    className="sm:hidden px-2.5 h-8 rounded-full bg-white/15 text-white text-[11px] font-semibold border border-white/15 backdrop-blur-md"
                  >
                    Putar
                  </button>
                )}
              </div>
            </div>

            {/* Center Rewind / Play / Forward */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-7 sm:gap-11 pointer-events-auto z-20">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skipTime(-10);
                }}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/45 hover:bg-white/20 active:scale-90 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-white transition-all shadow-lg"
                title="Mundur 10 detik"
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-[9px] font-bold -mt-0.5">10</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className={
                  prefs.playBtnStyle === 'bare'
                    ? 'w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-transform'
                    : 'w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 hover:bg-white/30 active:scale-95 backdrop-blur-xl border border-white/30 flex items-center justify-center text-white transition-all shadow-2xl'
                }
                title={isBuffering ? 'Memuat...' : isPlaying ? 'Jeda' : 'Putar'}
              >
                {isBuffering ? (
                  <Loader2 className="w-8 h-8 sm:w-9 sm:h-9 animate-spin text-white" />
                ) : isPlaying ? (
                  <Pause className="w-8 h-8 sm:w-9 sm:h-9 fill-white" />
                ) : (
                  <Play className="w-8 h-8 sm:w-9 sm:h-9 fill-white translate-x-0.5" />
                )}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skipTime(10);
                }}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/45 hover:bg-white/20 active:scale-90 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-white transition-all shadow-lg"
                title="Maju 10 detik"
              >
                <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-[9px] font-bold -mt-0.5">10</span>
              </button>
            </div>

            {/* Bottom HUD + Floating Control Popover */}
            <div className="relative z-30 px-4 sm:px-7 pb-4 sm:pb-6 pt-10 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-auto mt-auto">
              {/* Bottom-Left Info Overlay */}
              <div className="flex items-end justify-between gap-4 mb-3">
                <div className="max-w-xl min-w-0">
                  <span className="block text-[10px] font-black tracking-[0.18em] text-emerald-400 uppercase">
                    YOU'RE WATCHING
                  </span>

                  {prefs.pausedInfo !== 'hidden' && (
                    <>
                      {titleLogoUrl ? (
                        <img
                          src={titleLogoUrl}
                          alt={title}
                          className="hidden sm:block max-h-14 md:max-h-20 w-auto object-contain object-left my-1.5 drop-shadow-[0_6px_20px_rgba(0,0,0,0.85)]"
                        />
                      ) : (
                        <h3 className="hidden sm:block text-base md:text-xl font-black text-white leading-tight uppercase tracking-tight line-clamp-1 mt-0.5">
                          {title}
                        </h3>
                      )}

                      {prefs.pausedInfo === 'full' && (
                        <>
                          <p className="hidden md:block text-xs text-zinc-200 font-semibold mt-0.5">
                            {year}
                            {rating ? ` • ★ ${rating}` : ''}
                            {runtime ? ` • ${runtime}` : ''}
                          </p>
                          {synopsis && (
                            <p className="hidden md:block text-xs text-zinc-400 line-clamp-2 mt-1 max-w-lg leading-relaxed">
                              {synopsis}
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Buffered + Played Seekbar with Hover Timestamp Preview */}
              <div className="flex items-center gap-3 mb-2.5">
                <span className="text-[11px] tabular-nums text-zinc-300 min-w-[42px] text-right">
                  {formatTime(currentTime)}
                </span>
                <div
                  className="relative flex-1 h-5 flex items-center cursor-pointer group/seek"
                  onClick={(e) => e.stopPropagation()}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1)));
                    setHoverSeek({ pct: pct * 100, time: pct * (duration || 0) });
                  }}
                  onMouseLeave={() => setHoverSeek(null)}
                >
                  {hoverSeek && duration > 0 && (
                    <div
                      className="hidden sm:block absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/90 border border-white/15 text-[11px] font-semibold tabular-nums text-white pointer-events-none shadow-lg whitespace-nowrap"
                      style={{ left: `${hoverSeek.pct}%` }}
                    >
                      {formatTime(hoverSeek.time)}
                      {hoveredSegment ? ` • ${hoveredSegment.shortLabel}` : ''}
                    </div>
                  )}

                  <div className="w-full h-1.5 group-hover/seek:h-2 bg-white/15 rounded-full overflow-hidden relative transition-all">
                    <div
                      className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
                      style={{ width: `${bufferedPct}%` }}
                    />
                    {duration > 0 &&
                      resolvedSegments.map((seg) => {
                        const leftPct = Math.max(0, Math.min(100, (seg.startSec / duration) * 100));
                        const widthPct = Math.max(
                          0.5,
                          Math.min(100 - leftPct, ((seg.effectiveEnd - seg.startSec) / duration) * 100)
                        );
                        const colorClass = seg.type === 'credits' ? 'bg-amber-400/75' : 'bg-sky-400/80';
                        return (
                          <div
                            key={seg.key}
                            className={`absolute inset-y-0 ${colorClass} pointer-events-none z-[1]`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          />
                        );
                      })}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full z-[2]"
                      style={progressFillStyle}
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
                    title={isPlaying ? 'Jeda' : 'Putar'}
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

                  <div className="flex items-center gap-2 group/vol">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleMute();
                      }}
                      className="text-white hover:text-zinc-300 transition-colors"
                      title="Bisu / Aktifkan Suara"
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
                      className="w-0 group-hover/vol:w-16 focus:w-16 opacity-0 group-hover/vol:opacity-100 focus:opacity-100 h-1 bg-white/30 rounded accent-white transition-all duration-200 cursor-pointer"
                    />
                  </div>

                  {isDubAudio && (
                    <span className="text-[11px] font-bold text-emerald-400 hidden sm:inline">
                      🇮🇩 Dub Indo
                    </span>
                  )}
                </div>

                {/* Right Quick Control Triggers */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePanel('quality');
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                      panelTab === 'quality'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                    }`}
                    title="Kualitas Video"
                  >
                    {activeQualityLabel}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePanel('source');
                    }}
                    className={`p-2 rounded-full transition-colors ${
                      panelTab === 'source'
                        ? 'bg-white text-black'
                        : 'text-zinc-200 hover:text-white hover:bg-white/10'
                    }`}
                    title="Sumber Server"
                  >
                    <Layers className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePanel('subtitles');
                    }}
                    className={`p-2 rounded-full transition-colors ${
                      panelTab === 'subtitles'
                        ? 'bg-white text-black'
                        : activeSubIndex >= 0
                          ? 'text-emerald-400 hover:bg-white/10'
                          : 'text-zinc-200 hover:text-white hover:bg-white/10'
                    }`}
                    title="Subtitle"
                  >
                    <Subtitles className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePanel('playback');
                    }}
                    className={`p-2 rounded-full transition-colors ${
                      panelTab === 'playback'
                        ? 'bg-white text-black'
                        : 'text-zinc-200 hover:text-white hover:bg-white/10'
                    }`}
                    title="Pemutaran & Tampilan"
                  >
                    <Settings className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFullscreen();
                    }}
                    className="p-2 rounded-full text-zinc-200 hover:text-white hover:bg-white/10 transition-colors"
                    title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* FLOATING SKIP INTRO / RECAP / CREDITS PILL (Independent of HUD fade, hidden when panel opens) */}
          {activeSkipSegment && (
            <div
              className={`absolute right-4 sm:right-7 z-40 transition-all duration-300 pointer-events-auto ${
                showControls || !isPlaying ? 'bottom-28 sm:bottom-32' : 'bottom-6 sm:bottom-8'
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSkipSegment(activeSkipSegment);
                }}
                className="px-4 py-2 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold shadow-2xl border border-white/20 flex items-center gap-1.5 transition-all active:scale-95"
              >
                <span>{activeSkipSegment.label}</span>
                {activeSkipSegment.action === 'next_episode' ? (
                  <SkipForward className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <FastForward className="w-3.5 h-3.5 fill-current" />
                )}
              </button>
            </div>
          )}

          {/* UNIFIED FLOATING 4-TAB SETTINGS POPOVER / BOTTOM SHEET */}
          {panelTab && (
            <div
              onClick={(e) => e.stopPropagation()}
              className={`fixed sm:absolute bottom-0 sm:bottom-16 inset-x-0 sm:inset-x-auto sm:right-6 z-50 w-full sm:w-[390px] max-h-[75vh] rounded-t-3xl sm:rounded-2xl ${panelSurfaceClass} text-xs text-zinc-200 flex flex-col overflow-hidden animate-modal-pop`}
            >
              {/* Mobile drag handle */}
              <div className="sm:hidden w-10 h-1 rounded-full bg-white/25 mx-auto mt-2.5" />

              {/* Active Status Header */}
              <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2.5 border-b border-white/[0.08]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-bold text-white uppercase">
                      {activeStream.type === 'mp4' ? 'MP4' : 'HLS'}
                    </span>
                    <span className="font-bold text-white truncate">
                      {activeStream.label}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] text-zinc-300 font-semibold">
                      {activeQualityLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                    {activeSubIndex >= 0 && allSubtitles[activeSubIndex]
                      ? allSubtitles[activeSubIndex].label
                      : 'Tanpa Subtitle'}{' '}
                    • {playbackSpeed}× kecepatan
                  </p>
                </div>

                <button
                  onClick={() => {
                    setPanelTab(null);
                    setShowAppearanceSub(false);
                  }}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white flex items-center justify-center flex-none"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 4-Tab Bar */}
              <div className="grid grid-cols-4 gap-1 p-2 border-b border-white/[0.08] bg-black/20">
                {[
                  { id: 'source', label: 'Sumber', Icon: Layers },
                  { id: 'quality', label: 'Kualitas', Icon: Film },
                  { id: 'subtitles', label: 'Subtitle', Icon: Subtitles },
                  { id: 'playback', label: 'Pemutaran', Icon: Settings },
                ].map(({ id, label, Icon }) => {
                  const active = panelTab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setPanelTab(id);
                        setShowAppearanceSub(false);
                      }}
                      className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                        active
                          ? 'bg-white text-black font-bold shadow-sm'
                          : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[10px]">{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {/* TAB 1: SUMBER */}
                {panelTab === 'source' && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {[
                          { id: 'all', label: `Semua (${streams.length})` },
                          { id: 'hls', label: 'HLS' },
                          { id: 'mp4', label: 'MP4' },
                        ].map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setSourceProtoFilter(p.id)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                              sourceProtoFilter === p.id
                                ? 'bg-white text-black'
                                : 'bg-white/[0.07] text-zinc-300 hover:bg-white/[0.14]'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>

                      {onRetryExtract && !isDubAudio && (
                        <button
                          onClick={onRetryExtract}
                          disabled={isExtracting}
                          className="px-2.5 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.16] text-[11px] font-semibold text-white flex items-center gap-1 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${isExtracting ? 'animate-spin' : ''}`} />
                          <span>Scan Ulang</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {filteredSources.map((s) => {
                        const isSelected = s.originalIndex === activeStreamIndex;
                        return (
                          <button
                            key={s.id || s.originalIndex}
                            onClick={() => onSelectStream?.(s.originalIndex)}
                            className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-left transition-all ${
                              isSelected
                                ? 'bg-white text-black font-bold shadow-md'
                                : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold">{s.label}</p>
                              <p
                                className={`text-[10px] ${
                                  isSelected ? 'text-zinc-600' : 'text-zinc-400'
                                }`}
                              >
                                {s.providerLabel || 'HD Server'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-none">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  isSelected
                                    ? 'bg-black/15 text-black'
                                    : 'bg-white/10 text-zinc-300'
                                }`}
                              >
                                {s.type === 'mp4' ? 'MP4' : 'HLS'}
                              </span>
                              {isSelected && <Check className="w-3.5 h-3.5" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {currentEpisode === 1 && parts.length > 1 && onSelectPart && (
                      <div className="pt-2 border-t border-white/[0.08]">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                          Bagian Episode 1
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {parts.map((p) => (
                            <button
                              key={p.part}
                              onClick={() => onSelectPart(p.part)}
                              className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
                                selectedPart === p.part
                                  ? 'bg-white text-black'
                                  : 'bg-white/[0.07] text-zinc-300 hover:bg-white/[0.14]'
                              }`}
                            >
                              {p.name || `Part ${p.part}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* TAB 2: KUALITAS */}
                {panelTab === 'quality' && (
                  <div className="space-y-1.5">
                    {qualityLevels.length > 0 ? (
                      <>
                        <button
                          onClick={() => handleQualityChange(-1)}
                          className={`w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between text-left transition-all ${
                            activeLevel === -1
                              ? 'bg-white text-black font-bold shadow-md'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-bold">Auto</p>
                            <p
                              className={`text-[10px] ${
                                activeLevel === -1 ? 'text-zinc-600' : 'text-zinc-400'
                              }`}
                            >
                              Menyesuaikan koneksi terbaik secara otomatis
                            </p>
                          </div>
                          {activeLevel === -1 && <Check className="w-4 h-4" />}
                        </button>

                        {[...qualityLevels]
                          .sort((a, b) => (b.height || 0) - (a.height || 0))
                          .map((q) => {
                            const isSelected = activeLevel === q.index;
                            const mbps = q.bitrate ? `${(q.bitrate / 1000000).toFixed(1)} Mbps` : '';
                            const dims = q.width && q.height ? `${q.width}×${q.height}` : '';
                            return (
                              <button
                                key={q.index}
                                onClick={() => handleQualityChange(q.index)}
                                className={`w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between text-left transition-all ${
                                  isSelected
                                    ? 'bg-white text-black font-bold shadow-md'
                                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200'
                                }`}
                              >
                                <div>
                                  <p className="text-xs font-bold">{q.label}</p>
                                  {(mbps || dims) && (
                                    <p
                                      className={`text-[10px] ${
                                        isSelected ? 'text-zinc-600' : 'text-zinc-400'
                                      }`}
                                    >
                                      {[mbps, dims].filter(Boolean).join(' • ')}
                                    </p>
                                  )}
                                </div>
                                {isSelected && <Check className="w-4 h-4" />}
                              </button>
                            );
                          })}
                      </>
                    ) : (
                      <div className="px-3.5 py-4 rounded-xl bg-white/[0.06] text-center text-zinc-300 space-y-1">
                        <p className="font-bold text-white">Kualitas HD Bawaan</p>
                        <p className="text-[11px] text-zinc-400">
                          Stream langsung diputar pada resolusi terbaik dari server aktif.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: SUBTITLE (with Live Preview, Size, Color, Background & Upload) */}
                {panelTab === 'subtitles' && (
                  <>
                    {/* Live Preview Box */}
                    <div className="relative h-24 rounded-xl bg-[#07080c] border border-white/10 flex flex-col justify-end items-center p-3 overflow-hidden">
                      <span className="absolute top-2 left-2.5 text-[10px] text-zinc-500 font-medium">
                        Pratinjau
                      </span>
                      <span
                        className="px-2 py-0.5 rounded font-semibold text-center leading-snug transition-all"
                        style={{
                          fontSize: `${Math.round((prefs.subSize / 100) * 13)}px`,
                          color: prefs.subColor,
                          backgroundColor: prefs.subBg ? 'rgba(0,0,0,0.75)' : 'transparent',
                        }}
                      >
                        Contoh tampilan subtitle.
                      </span>
                    </div>

                    {/* Track List */}
                    <div className="space-y-1">
                      <button
                        onClick={() => setActiveSubIndex(-1)}
                        className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-left ${
                          activeSubIndex === -1
                            ? 'bg-white text-black font-bold'
                            : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300'
                        }`}
                      >
                        <span>Nonaktif</span>
                        {activeSubIndex === -1 && <Check className="w-3.5 h-3.5" />}
                      </button>

                      {allSubtitles.map((sub, idx) => (
                        <button
                          key={sub.url || idx}
                          onClick={() => setActiveSubIndex(idx)}
                          className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-left ${
                            activeSubIndex === idx
                              ? 'bg-white text-black font-bold'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200'
                          }`}
                        >
                          <span className="truncate">{sub.label}</span>
                          {activeSubIndex === idx && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>

                    {/* Font Size, Swatches & Background Toggle */}
                    <div className="p-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updatePref({ subSize: Math.max(75, prefs.subSize - 15) })}
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 font-bold text-white"
                        >
                          A-
                        </button>
                        <span className="w-10 text-center text-[11px] font-semibold tabular-nums">
                          {prefs.subSize}%
                        </span>
                        <button
                          onClick={() => updatePref({ subSize: Math.min(200, prefs.subSize + 15) })}
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 font-bold text-white"
                        >
                          A+
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {SUB_COLOR_SWATCHES.map((col) => (
                          <button
                            key={col}
                            onClick={() => updatePref({ subColor: col })}
                            className={`w-5 h-5 rounded-full border-2 transition-transform ${
                              prefs.subColor === col
                                ? 'border-white scale-110'
                                : 'border-transparent opacity-70 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: col }}
                            title={`Warna subtitle ${col}`}
                          />
                        ))}
                      </div>

                      <button
                        onClick={() => updatePref({ subBg: !prefs.subBg })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                          prefs.subBg
                            ? 'bg-white text-black'
                            : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                        }`}
                      >
                        Latar
                      </button>
                    </div>

                    {/* Upload Local VTT/SRT */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".vtt,.srt"
                      onChange={handleSubtitleUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-zinc-200 font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Subtitle (.VTT / .SRT)</span>
                    </button>
                  </>
                )}

                {/* TAB 4: PEMUTARAN & APPEARANCE SUB-PANEL */}
                {panelTab === 'playback' && !showAppearanceSub && (
                  <div className="space-y-3">
                    {/* Speed Segmented Pill */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
                        <span>Kecepatan Putar</span>
                        <span className="text-white font-semibold">{playbackSpeed}×</span>
                      </div>
                      <div className="grid grid-cols-6 gap-1 p-1 rounded-xl bg-white/[0.06]">
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                          <button
                            key={s}
                            onClick={() => handleSpeedChange(s)}
                            className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                              playbackSpeed === s
                                ? 'bg-white text-black shadow-sm'
                                : 'text-zinc-300 hover:text-white'
                            }`}
                          >
                            {s}×
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Feature Toggles */}
                    <div className="space-y-1.5">
                      <button
                        onClick={() => updatePref({ showSkipIntro: !prefs.showSkipIntro })}
                        className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-between text-left"
                      >
                        <div>
                          <p className="font-semibold text-white">Tombol Lewati Intro</p>
                          <p className="text-[10px] text-zinc-400">
                            Deteksi otomatis intro, rekap & credits asli bila tersedia
                          </p>
                        </div>
                        <span
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                            prefs.showSkipIntro ? 'bg-white justify-end' : 'bg-white/20 justify-start'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full ${
                              prefs.showSkipIntro ? 'bg-black' : 'bg-white'
                            }`}
                          />
                        </span>
                      </button>

                      <button
                        onClick={() => updatePref({ dataSaver: !prefs.dataSaver })}
                        className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-between text-left"
                      >
                        <div>
                          <p className="font-semibold text-white">Hemat Kuota</p>
                          <p className="text-[10px] text-zinc-400">Batasi kualitas Auto maksimal 720p</p>
                        </div>
                        <span
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                            prefs.dataSaver ? 'bg-white justify-end' : 'bg-white/20 justify-start'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full ${
                              prefs.dataSaver ? 'bg-black' : 'bg-white'
                            }`}
                          />
                        </span>
                      </button>
                    </div>

                    {/* Picture Fit & Audio Boost */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-zinc-400 mb-1">Tampilan Video</p>
                        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.06]">
                          {[
                            { id: 'contain', label: 'Fit' },
                            { id: 'cover', label: 'Fill' },
                            { id: 'fill', label: 'Stretch' },
                          ].map((f) => (
                            <button
                              key={f.id}
                              onClick={() => updatePref({ pictureFit: f.id })}
                              className={`py-1 rounded-lg text-[10px] font-bold ${
                                prefs.pictureFit === f.id
                                  ? 'bg-white text-black'
                                  : 'text-zinc-300 hover:text-white'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] text-zinc-400 mb-1">Penguat Audio</p>
                        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.06]">
                          {[100, 150, 200].map((pct) => (
                            <button
                              key={pct}
                              onClick={() => handleAudioBoostChange(pct)}
                              className={`py-1 rounded-lg text-[10px] font-bold ${
                                audioBoost === pct
                                  ? 'bg-white text-black'
                                  : 'text-zinc-300 hover:text-white'
                              }`}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Appearance Personalization Link */}
                    <button
                      onClick={() => setShowAppearanceSub(true)}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 flex items-center justify-between text-left transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <Palette className="w-4 h-4 text-white" />
                        <div>
                          <p className="font-semibold text-white">Tampilan Pemutar</p>
                          <p className="text-[10px] text-zinc-400">
                            Warna aksen, panel, gaya seekbar & info jeda
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </button>
                  </div>
                )}

                {/* SUB-PANEL: TAMPILAN PEMUTAR */}
                {panelTab === 'playback' && showAppearanceSub && (
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowAppearanceSub(false)}
                      className="flex items-center gap-1.5 text-xs font-bold text-white hover:text-zinc-300"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Kembali ke Pemutaran</span>
                    </button>

                    <div>
                      <p className="text-[10px] text-zinc-400 mb-1.5">Warna Aksen Seekbar</p>
                      <div className="flex flex-wrap gap-2">
                        {ACCENT_SWATCHES.map((col) => (
                          <button
                            key={col}
                            onClick={() => updatePref({ accentColor: col })}
                            className={`w-6 h-6 rounded-full border-2 transition-transform ${
                              prefs.accentColor === col
                                ? 'border-white scale-110 ring-2 ring-white/30'
                                : 'border-white/20 opacity-80 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: col }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-zinc-400 mb-1">Panel Kontrol</p>
                        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.06]">
                          {[
                            { id: 'glass', label: 'Glass' },
                            { id: 'solid', label: 'Solid' },
                          ].map((p) => (
                            <button
                              key={p.id}
                              onClick={() => updatePref({ panelStyle: p.id })}
                              className={`py-1 rounded-lg text-[10px] font-bold ${
                                prefs.panelStyle === p.id
                                  ? 'bg-white text-black'
                                  : 'text-zinc-300'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] text-zinc-400 mb-1">Tombol Tengah</p>
                        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.06]">
                          {[
                            { id: 'disc', label: 'Disc' },
                            { id: 'bare', label: 'Polos' },
                          ].map((p) => (
                            <button
                              key={p.id}
                              onClick={() => updatePref({ playBtnStyle: p.id })}
                              className={`py-1 rounded-lg text-[10px] font-bold ${
                                prefs.playBtnStyle === p.id
                                  ? 'bg-white text-black'
                                  : 'text-zinc-300'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] text-zinc-400 mb-1">Gaya Seekbar</p>
                      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.06]">
                        {[
                          { id: 'minimal', label: 'Minimal' },
                          { id: 'glow', label: 'Glow' },
                          { id: 'gradient', label: 'Gradient' },
                        ].map((g) => (
                          <button
                            key={g.id}
                            onClick={() => updatePref({ progressStyle: g.id })}
                            className={`py-1 rounded-lg text-[10px] font-bold ${
                              prefs.progressStyle === g.id ? 'bg-white text-black' : 'text-zinc-300'
                            }`}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] text-zinc-400 mb-1">Info Film di Layar</p>
                      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.06]">
                        {[
                          { id: 'full', label: 'Lengkap' },
                          { id: 'compact', label: 'Ringkas' },
                          { id: 'hidden', label: 'Minimal' },
                        ].map((i) => (
                          <button
                            key={i.id}
                            onClick={() => updatePref({ pausedInfo: i.id })}
                            className={`py-1 rounded-lg text-[10px] font-bold ${
                              prefs.pausedInfo === i.id ? 'bg-white text-black' : 'text-zinc-300'
                            }`}
                          >
                            {i.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SERIES IN-PLAYER EPISODES DRAWER */}
          {showEpisodesDrawer && isSeries && (
            <div
              onClick={(e) => e.stopPropagation()}
              className={`fixed sm:absolute bottom-0 sm:top-16 sm:bottom-16 inset-x-0 sm:inset-x-auto sm:right-6 z-50 w-full sm:w-[370px] max-h-[75vh] rounded-t-3xl sm:rounded-2xl ${panelSurfaceClass} text-xs text-zinc-200 flex flex-col overflow-hidden animate-modal-pop`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2 font-bold text-white">
                  <ListVideo className="w-4 h-4" />
                  <span>Daftar Episode ({episodesList.length})</span>
                </div>
                <button
                  onClick={() => setShowEpisodesDrawer(false)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {validSeasons.length > 1 && onSeasonChange && (
                <div className="px-3 py-2 border-b border-white/[0.08] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {validSeasons.map((s) => (
                    <button
                      key={s.id || s.season_number}
                      onClick={() => onSeasonChange(s.season_number)}
                      className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                        currentSeason === s.season_number
                          ? 'bg-white text-black'
                          : 'bg-white/[0.07] text-zinc-300 hover:text-white'
                      }`}
                    >
                      Season {s.season_number}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {episodesList.map((ep, idx) => {
                  const epNum = ep.episode_number || ep.episode || idx + 1;
                  const epTitle = ep.name || ep.title || `Episode ${epNum}`;
                  const active = epNum === currentEpisode;
                  return (
                    <button
                      key={ep.id || epNum}
                      onClick={() => {
                        onEpisodeChange?.(epNum);
                        setShowEpisodesDrawer(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-left transition-all ${
                        active
                          ? 'bg-white text-black font-bold shadow-md'
                          : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {epNum}. {epTitle}
                        </p>
                      </div>
                      {active ? <Check className="w-3.5 h-3.5 flex-none" /> : <Play className="w-3 h-3 flex-none opacity-60" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
