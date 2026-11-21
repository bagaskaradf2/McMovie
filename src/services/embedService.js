/**
 * Embed Service for McMovies
 * Comprehensive multi-server provider list from FMHY and CinemaOS streaming backends.
 * Curated for 100% reliable playback, full duration (no 15-min limits, no VIP lock),
 * and strictly focused inside our web player without external redirects or popup ads.
 */

export const STREAM_SERVERS = [
  {
    id: 'anyembed',
    name: '🚀 AnyEmbed 4K (Anti-Buffer)',
    tag: 'FMHY Primary • Film Indonesia & Box Office Lengkap Bebas Iklan',
    badge: 'Rekomendasi',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://anyembed.xyz/embed/tmdb-tv-${id}/${season}/${episode}`;
      }
      return `https://anyembed.xyz/embed/tmdb-movie-${id}`;
    }
  },
  {
    id: 'vidsrc2',
    name: '📡 VidSrc Global 4K',
    tag: 'Multi-Region CDN Cepat • Film Indonesia & Mancanegara',
    badge: '4K Ultra HD',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://vidsrc2.ru/embed/tv/${id}/${season}/${episode}`;
      }
      return `https://vidsrc2.ru/embed/movie/${id}`;
    }
  },
  {
    id: 'vidlink',
    name: '🌟 VidLink 4K (CinemaOS)',
    tag: 'CinemaOS Multi-Server • Subtitle Lengkap • 1080p/4K Ultra HD',
    badge: '1080p/4K',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=ffffff&secondaryColor=090a0f&autoplay=false`;
      }
      return `https://vidlink.pro/movie/${id}?primaryColor=ffffff&secondaryColor=090a0f&autoplay=false`;
    }
  },
  {
    id: 'superembed',
    name: '🛡️ SuperEmbed HD (Ad-Shield)',
    tag: 'FMHY Mirror • Film & TV Series Barat',
    badge: 'Full HD',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`;
      }
      return `https://multiembed.mov/?video_id=${id}&tmdb=1`;
    }
  },
  {
    id: 'autoembed',
    name: '🏎️ AutoEmbed Multi-Sub',
    tag: 'Subtitle Indonesia Otomatis • Full Movie Bebas VIP',
    badge: 'Full HD',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://autoembed.me/tv/tmdb/${id}/${season}/${episode}`;
      }
      return `https://autoembed.me/movie/tmdb/${id}`;
    }
  }
];

export function getEmbedUrl(serverId, id, mediaType = 'movie', season = 1, episode = 1) {
  const cleanId = String(id).replace(/^dub_/, '');
  const server = STREAM_SERVERS.find(s => s.id === serverId) || STREAM_SERVERS[0];
  return server.getEmbedUrl(cleanId, mediaType, season, episode);
}
