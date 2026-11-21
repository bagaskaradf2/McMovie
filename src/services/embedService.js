/**
 * Embed Service for McMovies
 * Comprehensive multi-server provider list from FMHY and CinemaOS streaming backends.
 * Curated for 100% reliable playback, full duration (no 15-min limits, no VIP lock),
 * and strictly focused inside our web player without external redirects or popup ads.
 */

export const STREAM_SERVERS = [
  {
    id: 'superembed',
    name: '🛡️ SuperEmbed HD (Ad-Shield)',
    tag: 'FMHY Primary • Durasi Penuh • Film & TV Series Lengkap Bebas Iklan',
    badge: 'Rekomendasi',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`;
      }
      return `https://multiembed.mov/?video_id=${id}&tmdb=1`;
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
    id: 'autoembed',
    name: '🚀 AutoEmbed Multi-Sub',
    tag: 'Subtitle Indonesia Otomatis • Full Movie Bebas VIP',
    badge: 'Full HD',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://autoembed.me/tv/tmdb/${id}/${season}/${episode}`;
      }
      return `https://autoembed.me/movie/tmdb/${id}`;
    }
  },
  {
    id: 'two_embed',
    name: '💎 2Embed VIP',
    tag: 'Mirror Cadangan Global • Tanpa Batasan Durasi 15 Menit',
    badge: '1080p',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://www.2embed.cc/embedtv/${id}&s=${season}&e=${episode}`;
      }
      return `https://www.2embed.cc/embed/${id}`;
    }
  },
  {
    id: 'smashystream',
    name: '🏎️ SmashyStream HD',
    tag: 'Alternatif Cepat Buffer Rendah',
    badge: 'HD',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${season}&episode=${episode}`;
      }
      return `https://embed.smashystream.com/playere.php?tmdb=${id}`;
    }
  },
  {
    id: 'vidsrc_cc',
    name: '📡 VidSrc VIP',
    tag: 'High Bandwidth CDN Stream',
    badge: '1080p',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://vidsrc.cc/v2/embed/tv/${id}/${season}/${episode}`;
      }
      return `https://vidsrc.cc/v2/embed/movie/${id}`;
    }
  }
];

export function getEmbedUrl(serverId, id, mediaType = 'movie', season = 1, episode = 1) {
  const cleanId = String(id).replace(/^dub_/, '');
  const server = STREAM_SERVERS.find(s => s.id === serverId) || STREAM_SERVERS[0];
  return server.getEmbedUrl(cleanId, mediaType, season, episode);
}
