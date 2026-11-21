/**
 * Embed Service for McMovies
 * Comprehensive multi-server provider list from FMHY and CinemaOS streaming backends.
 * Solves duration limits & VIP restrictions by providing VidLink 4K, AutoEmbed, SuperEmbed,
 * 2Embed, SmashyStream, and MovieBox Official Mirror.
 */

export const STREAM_SERVERS = [
  {
    id: 'vidlink',
    name: 'VidLink 4K (CinemaOS)',
    tag: 'CinemaOS Default • Subtitle Lengkap • Durasi Penuh (Bebas 15 Menit)',
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
    name: 'AutoEmbed Multi-Sub',
    tag: 'Subtitle Indonesia & Multi-Server • Full Video Bebas VIP',
    badge: 'Full HD',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://autoembed.me/tv/tmdb/${id}/${season}/${episode}`;
      }
      return `https://autoembed.me/movie/tmdb/${id}`;
    }
  },
  {
    id: 'superembed',
    name: 'SuperEmbed HD',
    tag: 'Mirror Cadangan Episode Lengkap • Durasi Penuh Tanpa Limit',
    badge: 'HD',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`;
      }
      return `https://multiembed.mov/?video_id=${id}&tmdb=1`;
    }
  },
  {
    id: 'two_embed',
    name: '2Embed VIP',
    tag: 'Global Stream Mirror • Tanpa Potongan 15 Menit',
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
    name: 'SmashyStream',
    tag: 'Alternatif Cepat Tanpa Buffer',
    badge: 'HD',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${season}&episode=${episode}`;
      }
      return `https://embed.smashystream.com/playere.php?tmdb=${id}`;
    }
  },
  {
    id: 'moviebox_mirror',
    name: '⚡ MovieBox Official Mirror',
    tag: 'Live Web Stream moviebox01.com (Direct Embed)',
    badge: 'MovieBox',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1, item = null) => {
      if (item?.movieboxEmbedUrl) return item.movieboxEmbedUrl;
      if (item?.detailPath) {
        return `https://moviebox01.com/movies/${item.detailPath}?id=${item.subjectId || id}&type=/movie/detail`;
      }
      return `https://moviebox01.com/`;
    }
  },
  {
    id: 'vidsrc_cc',
    name: 'VidSrc v2',
    tag: 'Kecepatan Buffering Tinggi',
    badge: '1080p',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://vidsrc.cc/v2/embed/tv/${id}/${season}/${episode}`;
      }
      return `https://vidsrc.cc/v2/embed/movie/${id}`;
    }
  },
  {
    id: 'vidsrc_to',
    name: 'VidSrc.to',
    tag: 'Alternatif Server Utama',
    badge: '1080p',
    getEmbedUrl: (id, mediaType = 'movie', season = 1, episode = 1) => {
      if (mediaType === 'tv') {
        return `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`;
      }
      return `https://vidsrc.to/embed/movie/${id}`;
    }
  }
];

export function getEmbedUrl(serverId, id, mediaType = 'movie', season = 1, episode = 1, item = null) {
  const cleanId = String(id).replace(/^dub_/, '');
  const server = STREAM_SERVERS.find(s => s.id === serverId) || STREAM_SERVERS[0];
  return server.getEmbedUrl(cleanId, mediaType, season, episode, item);
}
