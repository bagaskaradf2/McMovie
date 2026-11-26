import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Play,
  ChevronLeft,
  Bookmark,
  BookmarkCheck,
  Share2,
  Sparkles,
  Star,
  Check,
  Tv
} from 'lucide-react';

import { TmdbService } from '../services/tmdbService';
import { DubIndoService } from '../services/dubIndoService';
import { MovieBoxService } from '../services/movieBoxService';
import { CloudXService } from '../services/cloudXService';
import { StorageService } from '../services/storageService';
import { SkipSegmentsService } from '../services/skipSegmentsService';
import CinemaPlayer from '../components/CinemaPlayer';
import MovieCard from '../components/MovieCard';

function parseCloudXId(rawId) {
  const str = String(rawId || '');
  const m = str.match(/^cx_([a-z0-9]+)_(.+)$/i);
  if (m) return { providerHint: m[1], cleanId: m[2] };
  return { providerHint: '', cleanId: str.replace(/^dub_(?:series_)?/, '') };
}

function cleanSynopsis(text) {
  if (!text) return 'Sinopsis belum tersedia untuk tayangan ini.';
  return text
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .replace(/Download\s*:\s*https?:\/\/\S+/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/Download\s*:\s*$/gi, '')
    .replace(/Download\s*:/gi, '')
    .replace(/\s*—\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function WatchPage({
  type = 'movie', // 'movie', 'tv', 'dub'
  id: propId,
  season: propSeason = 1,
  episode: propEpisode = 1,
  preloadedItem,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const routeInitialEpisode = location.state?.initialEpisode;

  const initialSeasonData = preloadedItem
    ? (() => {
        if (Array.isArray(preloadedItem.episodesList) && preloadedItem.episodesList.length > 0) {
          return { episodes: preloadedItem.episodesList, season_number: 1 };
        }
        if (Array.isArray(preloadedItem.episodes) && preloadedItem.episodes.length > 0) {
          return { episodes: preloadedItem.episodes, season_number: 1 };
        }
        if (typeof preloadedItem.episodes === 'number' && preloadedItem.episodes > 0) {
          const genEps = Array.from({ length: preloadedItem.episodes }, (_, i) => ({
            episode_number: i + 1,
            name: `Episode ${i + 1}`,
            overview: `Episode ${i + 1} dari serial ${preloadedItem.title || 'Serial'} durasi penuh.`,
            still_path: preloadedItem.backdrop_path || preloadedItem.poster_path,
          }));
          return { episodes: genEps, season_number: 1 };
        }
        return null;
      })()
    : null;

  const [item, setItem] = useState(preloadedItem || null);
  const [loading, setLoading] = useState(!preloadedItem);
  const [metadataReady, setMetadataReady] = useState(false);
  const [currentSeason, setCurrentSeason] = useState(parseInt(propSeason, 10) || 1);
  const [currentEpisode, setCurrentEpisode] = useState(parseInt(routeInitialEpisode || propEpisode, 10) || 1);
  const [activeDubEpisodeUrl, setActiveDubEpisodeUrl] = useState('');
  const [selectedPart, setSelectedPart] = useState(1);
  const [seasonData, setSeasonData] = useState(initialSeasonData);
  const [loadingSeason, setLoadingSeason] = useState(false);

  // Pure Native Stream State (Direct MP4 + Extracted CloudX HLS)
  const [cloudXStreams, setCloudXStreams] = useState([]);
  const [cloudXSubtitles, setCloudXSubtitles] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [extractNonce, setExtractNonce] = useState(0);
  const [titleLogoUrl, setTitleLogoUrl] = useState(null);
  const [skipSegments, setSkipSegments] = useState([]);
  const [activeStreamIndex, setActiveStreamIndex] = useState(0);
  const [cloudxFallbackActive, setCloudxFallbackActive] = useState(false);

  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setCloudxFallbackActive(false);
    if (propSeason) setCurrentSeason(parseInt(propSeason, 10) || 1);
    if (routeInitialEpisode) {
      setCurrentEpisode(parseInt(routeInitialEpisode, 10) || 1);
    } else if (propEpisode) {
      setCurrentEpisode(parseInt(propEpisode, 10) || 1);
    }
  }, [propId, propSeason, propEpisode, routeInitialEpisode]);

  const fetchSeason = useCallback(async (tvId, sNum, currentItem = item) => {
    setLoadingSeason(true);
    try {
      const { cleanId } = parseCloudXId(tvId);
      const data = await TmdbService.getSeasonDetails(cleanId, sNum);
      if (data && data.episodes && data.episodes.length > 0) {
        setSeasonData(data);
      } else if (currentItem?.episodes && typeof currentItem.episodes === 'number') {
        const genEps = Array.from({ length: currentItem.episodes }, (_, i) => ({
          episode_number: i + 1,
          name: `Episode ${i + 1}`,
          overview: `Episode ${i + 1} dari ${currentItem.title || currentItem.name || 'Serial'}`,
          still_path: currentItem.backdrop_path || currentItem.poster_path,
        }));
        setSeasonData({ episodes: genEps, season_number: sNum });
      } else {
        setSeasonData(data);
      }
    } catch {
      if (currentItem?.episodes && typeof currentItem.episodes === 'number') {
        const genEps = Array.from({ length: currentItem.episodes }, (_, i) => ({
          episode_number: i + 1,
          name: `Episode ${i + 1}`,
          overview: `Episode ${i + 1} dari ${currentItem.title || currentItem.name || 'Serial'}`,
          still_path: currentItem.backdrop_path || currentItem.poster_path,
        }));
        setSeasonData({ episodes: genEps, season_number: sNum });
      }
    } finally {
      setLoadingSeason(false);
    }
  }, [item]);

  // 1. Load metadata cleanly (MovieBox / CloudX / Dub Indo / TMDB)
  useEffect(() => {
    let isMounted = true;
    setMetadataReady(false);
    if (!preloadedItem) setLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const { providerHint, cleanId } = parseCloudXId(propId);

    async function enrichWithTmdb(baseItem, mediaType) {
      const tmdbKey = baseItem.tmdbId || (/^\d+$/.test(cleanId) ? cleanId : null);
      if (!tmdbKey) return baseItem;
      try {
        const tmdbData = await TmdbService.getDetails(tmdbKey, mediaType);
        if (tmdbData) {
          return {
            ...tmdbData,
            ...baseItem,
            tmdbId: tmdbData.id || baseItem.tmdbId,
            title: baseItem.title || tmdbData.title || tmdbData.name,
            original_title: tmdbData.original_title || tmdbData.original_name || baseItem.original_title || baseItem.title,
            overview: baseItem.overview || tmdbData.overview,
            credits: tmdbData.credits || baseItem.credits,
            genres: tmdbData.genres || baseItem.genres,
            runtime: baseItem.runtime || tmdbData.runtime,
            seasons: tmdbData.seasons || baseItem.seasons,
            similar: tmdbData.similar || baseItem.similar,
          };
        }
      } catch {
        // Keep baseItem if TMDB enrichment fails
      }
      return baseItem;
    }

    async function loadItem() {
      // A. MovieBox Local Catalog (skip for pure numeric TMDB IDs)
      if (!/^\d+$/.test(String(propId))) {
        try {
          const mbItem = await MovieBoxService.getDetail(propId);
          if (mbItem && isMounted) {
            const mediaType = mbItem.media_type === 'tv' || type === 'tv' ? 'tv' : 'movie';
            const enriched = await enrichWithTmdb({ ...mbItem, media_type: mediaType }, mediaType);
            if (!isMounted) return;
            setItem(enriched);
            setIsWatchlisted(StorageService.isWatchlisted(enriched.id));
            StorageService.updateProgress(enriched, {
              season: currentSeason,
              episode: currentEpisode,
              serverId: enriched.streamUrl ? 'moviebox_direct' : 'cloudx_hls',
            });
            if (mediaType === 'tv' && (!enriched.episodesList || enriched.episodesList.length === 0) && enriched.tmdbId) {
              fetchSeason(enriched.tmdbId, currentSeason, enriched);
            }
            setLoading(false);
            setMetadataReady(true);
            return;
          }
        } catch (e) {
          console.warn('MovieBox lookup error:', e);
        }
      }

      // B. CloudX Provider Catalog
      try {
        const cxItem = await CloudXService.getDetail(propId);
        if (cxItem && isMounted) {
          const mediaType = cxItem.media_type === 'tv' || type === 'tv' ? 'tv' : 'movie';
          const enriched = await enrichWithTmdb(
            { ...cxItem, provider: cxItem.provider || providerHint, media_type: mediaType },
            mediaType
          );
          if (!isMounted) return;
          setItem(enriched);
          setIsWatchlisted(StorageService.isWatchlisted(enriched.id));
          StorageService.updateProgress(enriched, { season: currentSeason, episode: currentEpisode, serverId: 'cloudx_hls' });
          if (mediaType === 'tv' && enriched.tmdbId) {
            fetchSeason(enriched.tmdbId, currentSeason, enriched);
          }
          setLoading(false);
          setMetadataReady(true);
          return;
        }
      } catch (e) {
        console.warn('CloudX lookup error:', e);
      }

      // C. Dub Indo Catalog
      if (type === 'dub') {
        try {
          let targetItem = await DubIndoService.getMovieOrSeriesById(propId);
          if (!targetItem) targetItem = await DubIndoService.findDubIndoByTmdbId(cleanId);

          if (targetItem && isMounted) {
            if (!targetItem.tmdbId) {
              const resolvedTmdb = await DubIndoService.resolveDubTmdbId(targetItem.title, targetItem.year);
              if (resolvedTmdb) targetItem.tmdbId = resolvedTmdb;
            }
            const enriched = await enrichWithTmdb(targetItem, targetItem.media_type || 'movie');
            if (enriched.streamUrl && enriched.streamUrl.includes('files.indodub.my.id')) {
              const direct = await DubIndoService.resolveDirectPlayableUrl(enriched.streamUrl);
              if (direct) enriched.directWasabiUrl = direct;
            }
            if (!isMounted) return;
            setItem(enriched);
            setIsWatchlisted(StorageService.isWatchlisted(enriched.id));
            StorageService.updateProgress(enriched, { season: 1, episode: 1, serverId: 'dub_direct' });
            setLoading(false);
            setMetadataReady(true);
            return;
          }
        } catch (e) {
          console.warn('Dub Indo lookup error:', e);
        }
        if (isMounted) {
          setLoading(false);
          setMetadataReady(true);
        }
        return;
      }

      // D. Live TMDB Path
      const mediaType = type === 'tv' ? 'tv' : 'movie';
      try {
        const tmdbData = await TmdbService.getDetails(cleanId, mediaType);
        if (tmdbData && isMounted) {
          const fullItem = {
            ...tmdbData,
            id: preloadedItem?.id || tmdbData.id,
            tmdbId: tmdbData.id,
            provider: preloadedItem?.provider || providerHint,
            media_type: mediaType,
          };

          if (mediaType === 'movie') {
            const dubMatch = await DubIndoService.findDubIndoByTmdbId(cleanId).catch(() => null);
            if (dubMatch?.streamUrl && !DubIndoService.isBrokenUvideoHost(dubMatch.streamUrl)) {
              fullItem.hasDubIndo = true;
              fullItem.dubStreamUrl = dubMatch.streamUrl;
              fullItem.dubStreamBackupUrl = dubMatch.streamBackupUrl;
              fullItem.directWasabiUrl = dubMatch.directWasabiUrl;
            }
          }

          if (!isMounted) return;
          setItem(fullItem);
          setIsWatchlisted(StorageService.isWatchlisted(fullItem.id));
          StorageService.updateProgress(fullItem, { season: currentSeason, episode: currentEpisode, serverId: 'cloudx_hls' });
          if (mediaType === 'tv') {
            fetchSeason(cleanId, currentSeason, fullItem);
          }
          setLoading(false);
          setMetadataReady(true);
          return;
        }
      } catch (e) {
        console.warn('TMDB lookup error:', e);
      }

      if (isMounted) {
        setLoading(false);
        setMetadataReady(true);
      }
    }

    loadItem();
    return () => {
      isMounted = false;
    };
  }, [type, propId]);

  const isSeries = Boolean(
    item &&
      (type === 'tv' ||
        item.media_type === 'tv' ||
        (item.seasons && item.seasons.length > 0) ||
        (Array.isArray(item.episodes) && item.episodes.length > 0))
  );

  // Fetch TMDB PNG Title Logo for paused overlay
  useEffect(() => {
    const logoId = item?.tmdbId || (/^\d+$/.test(String(propId)) ? propId : null);
    if (!logoId) {
      setTitleLogoUrl(null);
      return;
    }
    let cancelled = false;
    TmdbService.getTitleLogo(logoId, isSeries ? 'tv' : 'movie')
      .then((url) => {
        if (!cancelled) setTitleLogoUrl(url || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item?.tmdbId, propId, isSeries]);

  // Fetch verified real intro/recap/credits timestamps non-blockingly
  const resolvedSegTmdbId = item?.tmdbId || (item && /^\d+$/.test(String(propId)) ? propId : null);
  useEffect(() => {
    setSkipSegments([]);
    if (!resolvedSegTmdbId) return;

    let cancelled = false;
    const controller = new AbortController();

    SkipSegmentsService.getSegments({
      tmdbId: resolvedSegTmdbId,
      isSeries,
      season: currentSeason,
      episode: currentEpisode,
      signal: controller.signal,
    })
      .then((segs) => {
        if (!cancelled) setSkipSegments(segs);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [resolvedSegTmdbId, isSeries, currentSeason, currentEpisode]);

  const rawEpisodes = seasonData?.episodes || item?.episodesList || (Array.isArray(item?.episodes) ? item.episodes : []);
  const episodesList = useMemo(() => {
    if (Array.isArray(rawEpisodes) && rawEpisodes.length > 0) return rawEpisodes;
    if (typeof item?.episodes === 'number' && item.episodes > 0) {
      return Array.from({ length: item.episodes }, (_, i) => ({
        episode_number: i + 1,
        name: `Episode ${i + 1}`,
        overview: `Episode ${i + 1} dari ${item?.title || 'Serial'} durasi penuh.`,
        still_path: item?.backdrop_path || item?.poster_path,
      }));
    }
    return [];
  }, [rawEpisodes, item]);

  const activeEpisodeDirectUrl = useMemo(() => {
    if (!item) return '';
    if (isSeries) {
      const epObj = episodesList.find((e) => (e.episode_number || e.episode) === currentEpisode);
      const u = activeDubEpisodeUrl || epObj?.streamUrl || '';
      return DubIndoService.isBrokenUvideoHost(u) ? '' : u;
    }
    const u = item.directWasabiUrl || item.streamUrl || '';
    return DubIndoService.isBrokenUvideoHost(u) ? '' : u;
  }, [item, isSeries, episodesList, currentEpisode, activeDubEpisodeUrl]);

  // 2. Automatically extract direct CloudX .m3u8/.mp4 streams via /api/extract (also rescues unavailable Dub/MovieBox links)
  useEffect(() => {
    const shouldSkipCloudxForDub = Boolean(item?.isDubIndo && activeEpisodeDirectUrl && !cloudxFallbackActive);
    if (!metadataReady || !item || shouldSkipCloudxForDub) {
      setIsExtracting(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function extractDirectStreams() {
      setIsExtracting(true);
      setExtractError(null);
      setCloudXStreams([]);
      setCloudXSubtitles([]);
      setActiveStreamIndex(0);

      const titleText = item.title || item.name || '';
      const origText = item.original_title || item.original_name || titleText;
      const relDate = item.release_date || item.first_air_date || '';
      const yearText = relDate ? relDate.slice(0, 4) : (item.year || '');
      const { providerHint, cleanId } = parseCloudXId(item.id || propId);

      const qs = new URLSearchParams({
        title: titleText,
        originalTitle: origText,
        year: yearText,
        type: isSeries ? 'tv' : 'movie',
        season: String(currentSeason),
        episode: String(currentEpisode),
        tmdbId: String(item.tmdbId || cleanId || ''),
      });
      const hint = item.provider || providerHint;
      if (hint) qs.set('provider', hint);
      if (extractNonce > 0) qs.set('refresh', '1');

      try {
        const res = await fetch(`/api/extract?${qs.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;

        setCloudXStreams(Array.isArray(json.streams) ? json.streams : []);
        setCloudXSubtitles(Array.isArray(json.subtitles) ? json.subtitles : []);
        if (!json.streams || json.streams.length === 0) {
          setExtractError(
            `Belum ditemukan file HLS/MP4 langsung untuk "${titleText}"${isSeries ? ` (S${currentSeason}:E${currentEpisode})` : ''} di mirror CloudX saat ini.`
          );
        }
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') {
          setExtractError(`Gagal menghubungi ekstraktor stream CloudX (${err.message}).`);
        }
      } finally {
        if (!cancelled) setIsExtracting(false);
      }
    }

    extractDirectStreams();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    metadataReady,
    item?.id,
    item?.tmdbId,
    item?.isDubIndo,
    activeEpisodeDirectUrl,
    cloudxFallbackActive,
    isSeries,
    currentSeason,
    currentEpisode,
    extractNonce,
  ]);

  // Resolve distinct per-episode playable stream for grouped Dub Indo Series
  useEffect(() => {
    let cancelled = false;
    if (!item?.isDubIndo || !isSeries) {
      setActiveDubEpisodeUrl('');
      return;
    }
    const matchedEp = episodesList.find((e) => (e.episode_number || e.episode) === currentEpisode);
    const rawEpUrl = matchedEp?.streamUrl || '';
    if (!rawEpUrl || DubIndoService.isBrokenUvideoHost(rawEpUrl)) {
      setActiveDubEpisodeUrl('');
      return;
    }
    setActiveDubEpisodeUrl('');
    DubIndoService.resolveDirectPlayableUrl(rawEpUrl)
      .then((direct) => {
        if (!cancelled) setActiveDubEpisodeUrl(direct || rawEpUrl);
      })
      .catch(() => {
        if (!cancelled) setActiveDubEpisodeUrl(rawEpUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [item?.isDubIndo, item?.id, isSeries, currentEpisode, episodesList]);

  // 3. Build unified PURE direct streams list (Direct MP4 + CloudX HLS — ZERO external iframes)
  const directStreams = useMemo(() => {
    if (!item) return [];
    const list = [];

    const matchedEp = episodesList.find((e) => (e.episode_number || e.episode) === currentEpisode);

    // Dub Indo Direct MP4 mirrors (skip broken uvideoweb or when runtime fallback switched to CloudX)
    if (item.isDubIndo && !cloudxFallbackActive) {
      let baseUrl = matchedEp?.streamUrl || item.streamUrl || '';
      if (!matchedEp?.streamUrl && item.parts?.length > 0) {
        const partObj =
          currentEpisode === 1
            ? item.parts.find((p) => p.part === selectedPart) || item.parts[0]
            : item.parts[(currentEpisode - 1) % item.parts.length] || item.parts[0];
        baseUrl = partObj?.url || item.streamUrl;
      }
      if (DubIndoService.isBrokenUvideoHost(baseUrl)) baseUrl = '';
      const primaryResolved = isSeries ? activeDubEpisodeUrl : item.directWasabiUrl;
      if (primaryResolved && !DubIndoService.isBrokenUvideoHost(primaryResolved)) {
        list.push({
          id: `dub_wasabi_ep_${currentEpisode}`,
          label: '🇮🇩 Dub Indo Direct (HD)',
          url: primaryResolved,
          type: 'mp4',
          provider: 'dubindo',
          providerLabel: 'Dub Indo Direct',
        });
      }
      if (baseUrl && baseUrl !== primaryResolved) {
        list.push({
          id: `dub_primary_ep_${currentEpisode}`,
          label: '🇮🇩 Dub Indo Mirror 1',
          url: baseUrl,
          type: 'mp4',
          provider: 'dubindo',
          providerLabel: 'Dub Indo Mirror',
        });
      }
      if (!isSeries && item.streamBackupUrl && !DubIndoService.isBrokenUvideoHost(item.streamBackupUrl) && item.streamBackupUrl !== baseUrl) {
        list.push({
          id: 'dub_backup',
          label: '🇮🇩 Dub Indo CDN Backup',
          url: item.streamBackupUrl,
          type: 'mp4',
          provider: 'dubindo',
          providerLabel: 'Dub Indo CDN',
        });
      }
      for (const cs of cloudXStreams) {
        list.push(cs);
      }
      return list;
    }

    // Dub Indo fallback after direct MP4 failure
    if (item.isDubIndo && cloudxFallbackActive) {
      for (const cs of cloudXStreams) {
        list.push(cs);
      }
      return list;
    }

    // MovieBox Direct MP4 if item has valid direct URL (skip broken uvideoweb)
    let mbUrl = matchedEp?.streamUrl || item.streamUrl || '';
    if (!matchedEp?.streamUrl && item.parts?.length > 0) {
      const partObj =
        currentEpisode === 1
          ? item.parts.find((p) => p.part === selectedPart) || item.parts[0]
          : item.parts[(currentEpisode - 1) % item.parts.length] || item.parts[0];
      mbUrl = partObj?.url || item.streamUrl;
    }
    if (cloudxFallbackActive || DubIndoService.isBrokenUvideoHost(mbUrl)) {
      mbUrl = '';
    }
    if (mbUrl) {
      list.push({
        id: 'moviebox_direct',
        label: '⚡ MovieBox Direct HD',
        url: mbUrl,
        type: /\.m3u8(\?|$)/i.test(mbUrl) ? 'hls' : 'mp4',
        provider: 'moviebox',
        providerLabel: 'MovieBox Direct',
      });
    }

    // CloudX Extracted HLS (.m3u8) / MP4 Streams (Sub Indo)
    for (const cs of cloudXStreams) {
      list.push(cs);
    }

    // Dub Indo alternate audio track if TMDB movie also has working Dub Indo match
    if (item.hasDubIndo && item.dubStreamUrl && !DubIndoService.isBrokenUvideoHost(item.dubStreamUrl) && item.dubStreamUrl !== mbUrl) {
      list.push({
        id: 'dub_alt',
        label: '🇮🇩 Audio Dubbing Indonesia',
        url: item.directWasabiUrl || item.dubStreamUrl,
        type: 'mp4',
        provider: 'dubindo',
        providerLabel: 'Audio Dub Indo',
      });
    }

    return list;
  }, [item, episodesList, currentEpisode, selectedPart, cloudXStreams, isSeries, activeDubEpisodeUrl, cloudxFallbackActive]);

  useEffect(() => {
    if (activeStreamIndex >= directStreams.length && directStreams.length > 0) {
      setActiveStreamIndex(0);
    }
  }, [directStreams.length, activeStreamIndex]);

  const handleSeasonChange = (sNum) => {
    setCurrentSeason(sNum);
    setCurrentEpisode(1);
    setActiveStreamIndex(0);
    fetchSeason(propId, sNum, item);
    if (item) {
      StorageService.updateProgress(item, { season: sNum, episode: 1, serverId: 'cloudx_hls' });
    }
    navigate(`/watch/tv/${propId}/${sNum}/1`, { replace: true, state: { item } });
  };

  const handleEpisodeChange = (epNum) => {
    setCurrentEpisode(epNum);
    setSelectedPart(1);
    setActiveStreamIndex(0);
    if (item) {
      StorageService.updateProgress(item, {
        season: currentSeason,
        episode: epNum,
        serverId: item.isDubIndo ? 'dub_direct' : 'cloudx_hls',
      });
    }
    if (!item?.isDubIndo && type !== 'dub') {
      navigate(`/watch/tv/${propId}/${currentSeason}/${epNum}`, { replace: true, state: { item } });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextEpisode = () => {
    const nextEp = currentEpisode + 1;
    const maxEp = episodesList.length || 24;
    if (nextEp <= maxEp) handleEpisodeChange(nextEp);
  };

  const handlePrevEpisode = () => {
    if (currentEpisode > 1) handleEpisodeChange(currentEpisode - 1);
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

  if (loading) {
    return (
      <div className="w-full h-screen bg-[#060709] flex flex-col items-center justify-center text-zinc-400">
        <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide text-zinc-300 animate-pulse">
          Memuat tayangan...
        </p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="w-full min-h-screen bg-[#06070a] flex flex-col items-center justify-center text-center px-4 py-12">
        <div className="w-16 h-16 rounded-full bg-white/10 border border-white/15 flex items-center justify-center mb-4 text-white">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Tayangan Tidak Ditemukan</h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
          Maaf, data tayangan ini tidak dapat dimuat. Silakan kembali ke beranda untuk memilih film atau series lainnya.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-black font-extrabold text-xs transition-all active:scale-95"
        >
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  const title = item.title || item.name || 'Untitled';
  const releaseDate = item.release_date || item.first_air_date || '';
  const year = releaseDate ? releaseDate.slice(0, 4) : (item.year || '2026');
  const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : '8.2';
  const runtime = item.runtime
    ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m`
    : (item.duration || 'Full HD');
  const genres = item.genres || [];
  const cast = item.credits?.cast?.slice(0, 8) || [];
  const similar = item.similar?.results?.slice(0, 12) || [];

  const currentEpInfo = episodesList.find((e) => (e.episode_number || e.episode) === currentEpisode);
  const currentEpTitle = currentEpInfo?.name || `Episode ${currentEpisode}`;

  const validSeasons =
    Array.isArray(item.seasons) && item.seasons.length > 0
      ? item.seasons.filter((s) => s.season_number > 0)
      : typeof item.seasons === 'number' && item.seasons > 0
        ? Array.from({ length: item.seasons }, (_, i) => ({ id: i + 1, season_number: i + 1, name: `Season ${i + 1}` }))
        : [{ id: 1, season_number: 1, name: 'Season 1' }];

  const posterBackdrop = item.backdrop_path
    ? TmdbService.getBackdropUrl(item.backdrop_path, 'w1280')
    : (item.poster_path ? TmdbService.getImageUrl(item.poster_path, 'w780') : item.thumbnail || '');

  const currentActiveStream = directStreams[activeStreamIndex];
  const isPlayingDub = Boolean(item.isDubIndo || currentActiveStream?.provider === 'dubindo');

  return (
    <div className="min-h-screen bg-[#06070a] text-white selection:bg-white selection:text-black">
      {/* Full-Viewport Cinema Player (100dvh, zero external clutter) */}
      <div className="w-full h-[64vh] sm:h-[82vh] lg:h-[100dvh] bg-black relative">
        <CinemaPlayer
          streams={directStreams}
          activeStreamIndex={activeStreamIndex}
          onSelectStream={(idx) => setActiveStreamIndex(idx)}
          subtitles={cloudXSubtitles}
          skipSegments={skipSegments}
          isExtracting={isExtracting}
          extractError={extractError}
          onRetryExtract={() => setExtractNonce((n) => n + 1)}
          onFallbackExtract={() => setCloudxFallbackActive(true)}
          onBackToDetail={() =>
            navigate(`/${isSeries ? 'tv' : 'movie'}/${item.tmdbId || propId}`, { state: { item } })
          }
          title={title}
          titleLogoUrl={titleLogoUrl}
          year={year}
          rating={rating}
          runtime={runtime}
          synopsis={cleanSynopsis(item.overview || item.description)}
          posterUrl={posterBackdrop}
          isSeries={isSeries}
          currentSeason={currentSeason}
          currentEpisode={currentEpisode}
          episodesList={episodesList}
          validSeasons={validSeasons}
          onSeasonChange={handleSeasonChange}
          onEpisodeChange={handleEpisodeChange}
          onPrevEpisode={handlePrevEpisode}
          onNextEpisode={handleNextEpisode}
          hasPrevEpisode={currentEpisode > 1}
          hasNextEpisode={currentEpisode < (episodesList.length || 24)}
          parts={currentEpisode === 1 && item?.parts ? item.parts : []}
          selectedPart={selectedPart}
          onSelectPart={(pNum) => setSelectedPart(pNum)}
          onBack={() => navigate(-1)}
          onShare={handleShare}
          isDubAudio={isPlayingDub}
        />
      </div>

      {/* Metadata, Cast, Episode List & Similar Recommendations below full-bleed player */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {isPlayingDub ? (
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
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleWatchlist}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isWatchlisted
                  ? 'bg-white text-black shadow-md'
                  : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-white/10'
              }`}
            >
              {isWatchlisted ? (
                <BookmarkCheck className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Bookmark className="w-3.5 h-3.5" />
              )}
              <span>{isWatchlisted ? 'Tersimpan' : 'Watchlist'}</span>
            </button>

            <button
              onClick={handleShare}
              className="px-3.5 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Tersalin!' : 'Bagikan'}</span>
            </button>
          </div>
        </div>

        <div className="border-b border-white/[0.08] pb-8">
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            {title}
          </h2>

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
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Sinopsis</h3>
            <p className="text-sm text-zinc-300 leading-relaxed max-w-4xl font-normal">
              {cleanSynopsis(item.overview || item.description)}
            </p>
          </div>
        </div>

        {/* Cast */}
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
                  <h4 className="mt-2 text-xs font-bold text-white line-clamp-1">{actor.name}</h4>
                  <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">{actor.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Episodes Grid */}
        {isSeries && (
          <div className="mt-8 border-b border-white/[0.08] pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Tv className="w-4 h-4 text-white" />
                <span>DAFTAR EPISODE</span>
              </h3>

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
                  const epNum = ep.episode_number || ep.episode || idx + 1;
                  const epTitle = ep.name || ep.title || `Episode ${epNum}`;
                  const epThumb = ep.still_path
                    ? TmdbService.getImageUrl(ep.still_path, 'w500')
                    : ep.thumbnail || (item.poster_path ? TmdbService.getImageUrl(item.poster_path, 'w500') : item.thumbnail);
                  const isCurrentActive = epNum === currentEpisode;

                  return (
                    <div
                      key={ep.id || epNum}
                      onClick={() => handleEpisodeChange(epNum)}
                      className={`group relative flex gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.99] shadow-lg ${
                        isCurrentActive
                          ? 'bg-[#1a1c24] border-2 border-white ring-1 ring-white/30 text-white'
                          : 'bg-[#13141b]/90 hover:bg-[#1a1b24] border border-white/[0.06] hover:border-white/20 text-zinc-200'
                      }`}
                    >
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
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all ${
                              isCurrentActive
                                ? 'bg-white text-black opacity-100 scale-105'
                                : 'bg-white text-black opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <Play className="w-3.5 h-3.5 fill-black translate-x-0.5" />
                          </div>
                        </div>
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-black/90 text-white border border-white/10">
                          EP {epNum}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <h4
                          className={`text-xs sm:text-sm font-bold line-clamp-1 ${
                            isCurrentActive ? 'text-white font-extrabold' : 'text-zinc-100 group-hover:text-white'
                          }`}
                        >
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
                  variant="poster"
                  className="w-full"
                  onClick={(m) => navigate(`/${m.media_type === 'tv' ? 'tv' : 'movie'}/${m.id}`, { state: { item: m } })}
                  onPlay={(m) => navigate(`/watch/${m.media_type === 'tv' ? 'tv' : 'movie'}/${m.id}`, { state: { item: m } })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
