import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  RotateCcw,
  Maximize2,
  Tv,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Server,
  Play,
  Volume2,
  VolumeX,
  ExternalLink,
  Info
} from 'lucide-react';
import { STREAM_SERVERS, getEmbedUrl } from '../services/embedService';
import { StorageService } from '../services/storageService';

export default function VideoPlayerModal({
  item,
  initialSeason = 1,
  initialEpisode = 1,
  onClose,
  onNextEpisode,
  onPrevEpisode,
}) {
  const [currentSeason, setCurrentSeason] = useState(initialSeason);
  const [currentEpisode, setCurrentEpisode] = useState(initialEpisode);
  const [activeServer, setActiveServer] = useState('anyembed');
  const [reloadKey, setReloadKey] = useState(0);
  const [useDirectPlayer, setUseDirectPlayer] = useState(false);
  const iframeRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!item) return;

    setCurrentSeason(item.selectedSeason || initialSeason || 1);
    setCurrentEpisode(item.selectedEpisode || initialEpisode || 1);

    // If item is Dub Indo and has direct stream URL, start with direct player
    if (item.isDubIndo && item.streamUrl) {
      setUseDirectPlayer(true);
    } else {
      setUseDirectPlayer(false);
    }

    // Load preferred server
    const settings = StorageService.getSettings();
    if (settings.preferredServer) {
      setActiveServer(settings.preferredServer);
    }

    // Save to Continue Watching
    StorageService.updateProgress(item, {
      season: item.selectedSeason || initialSeason || 1,
      episode: item.selectedEpisode || initialEpisode || 1,
      serverId: settings.preferredServer || 'vidlink',
    });

    // Keyboard shortcuts
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item]);

  if (!item) return null;

  const isSeries = item.media_type === 'tv' || item.category === 'Film Series' || (item.episodes && item.episodes.length > 0);
  const title = item.title || item.name || 'Now Playing';

  // Calculate current embed URL
  const embedUrl = getEmbedUrl(activeServer, item.id, item.media_type || (isSeries ? 'tv' : 'movie'), currentSeason, currentEpisode);

  const handleServerChange = (serverId) => {
    setActiveServer(serverId);
    setUseDirectPlayer(false);
    setReloadKey((prev) => prev + 1);
  };

  const handleReload = () => {
    setReloadKey((prev) => prev + 1);
  };

  const handlePrevEp = () => {
    if (currentEpisode > 1) {
      const newEp = currentEpisode - 1;
      setCurrentEpisode(newEp);
      setReloadKey((prev) => prev + 1);
      StorageService.updateProgress(item, { season: currentSeason, episode: newEp, serverId: activeServer });
      if (onPrevEpisode) onPrevEpisode(currentSeason, newEp);
    }
  };

  const handleNextEp = () => {
    const newEp = currentEpisode + 1;
    setCurrentEpisode(newEp);
    setReloadKey((prev) => prev + 1);
    StorageService.updateProgress(item, { season: currentSeason, episode: newEp, serverId: activeServer });
    if (onNextEpisode) onNextEpisode(currentSeason, newEp);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl animate-fadeIn overflow-hidden">
      {/* Top Navigation & Controls Bar */}
      <header className="flex-none px-4 py-3 bg-cinema-surface/90 border-b border-cinema-border/70 flex flex-wrap items-center justify-between gap-3">
        {/* Title & Episode indicator */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-cinema-cyan/15 text-cinema-cyan">
            <Play className="w-5 h-5 fill-current" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-md">
              {title}
            </h2>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              {isSeries ? (
                <span className="text-cinema-cyan font-semibold">
                  Season {currentSeason} • Episode {currentEpisode}
                </span>
              ) : (
                <span>Full Movie</span>
              )}
              {item.isDubIndo && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                  🇮🇩 Audio Dub Indo
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Server Switchers */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-xl py-1">
          {item.isDubIndo && item.streamUrl && (
            <button
              onClick={() => {
                setUseDirectPlayer(true);
                setReloadKey((p) => p + 1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                useDirectPlayer
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-cinema-card hover:bg-cinema-card-hover text-slate-300 border border-cinema-border/60'
              }`}
            >
              <span>🇮🇩 Server Dub Indo (MP4)</span>
            </button>
          )}

          {STREAM_SERVERS.map((server) => {
            const isActive = !useDirectPlayer && activeServer === server.id;
            return (
              <button
                key={server.id}
                onClick={() => handleServerChange(server.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-cinema-cyan text-cinema-bg shadow-lg shadow-cinema-cyan/20'
                    : 'bg-cinema-card hover:bg-cinema-card-hover text-slate-300 border border-cinema-border/60'
                }`}
                title={server.tag}
              >
                <Server className="w-3.5 h-3.5" />
                <span>{server.name}</span>
              </button>
            );
          })}
        </div>

        {/* Right Tools (Reload, Next/Prev Ep, Close) */}
        <div className="flex items-center gap-2">
          {isSeries && (
            <div className="flex items-center gap-1 bg-cinema-card border border-cinema-border/60 rounded-lg p-0.5">
              <button
                onClick={handlePrevEp}
                disabled={currentEpisode <= 1}
                className="p-1.5 rounded text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                title="Episode Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs px-1 font-semibold text-cinema-cyan">
                EP {currentEpisode}
              </span>
              <button
                onClick={handleNextEp}
                className="p-1.5 rounded text-slate-300 hover:text-white"
                title="Episode Selanjutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={handleReload}
            className="p-2 rounded-lg bg-cinema-card hover:bg-cinema-card-hover border border-cinema-border/60 text-slate-300 hover:text-white transition-all"
            title="Muat Ulang Server"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 hover:text-red-300 transition-all"
            title="Tutup Player (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Video Viewport (16:9 or Full Height) */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {useDirectPlayer && item.streamUrl ? (
          // Direct HTML5 Video Player for Dub Indo streams
          <div className="w-full h-full max-w-6xl flex items-center justify-center p-2 sm:p-4">
            <video
              ref={videoRef}
              key={item.streamUrl}
              src={item.streamUrl}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[82vh] rounded-xl shadow-2xl bg-black"
              onTimeUpdate={() => {
                if (videoRef.current) {
                  StorageService.updateProgress(item, {
                    currentTime: videoRef.current.currentTime,
                    duration: videoRef.current.duration,
                    serverId: 'direct_mp4',
                  });
                }
              }}
            >
              Browser Anda tidak mendukung pemutar video HTML5.
            </video>
          </div>
        ) : (
          // Multi-Server iframe embed (VidLink, VidSrc, AutoEmbed, Embed.su, etc.)
          <iframe
            key={`${embedUrl}-${reloadKey}`}
            ref={iframeRef}
            src={embedUrl}
            title={title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}
      </div>

      {/* Bottom Status & Server Hints Bar */}
      <footer className="flex-none px-4 py-2.5 bg-cinema-surface/90 border-t border-cinema-border/60 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>
            {useDirectPlayer
              ? 'Memutar direct high-speed stream Dub Indo tanpa iklan.'
              : `Terhubung ke ${STREAM_SERVERS.find(s => s.id === activeServer)?.name}. Siap ditonton dalam Full HD.`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-slate-500">
            💡 Tips: Jika video macet / tidak jalan, ganti ke <b>VidLink</b> atau <b>AutoEmbed</b> di atas.
          </span>
          {isSeries && (
            <button
              onClick={handleNextEp}
              className="flex items-center gap-1 text-cinema-cyan hover:underline font-bold"
            >
              <span>Next Episode</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
