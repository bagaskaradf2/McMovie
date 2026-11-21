import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import WatchPage from './WatchPage';

export function MovieWatchRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <WatchPage
      type="movie"
      id={id}
      preloadedItem={location.state?.item}
      onBack={() => navigate('/')}
      onMovieClick={(item) => {
        const targetType = item.media_type === 'tv' ? 'tv' : 'movie';
        navigate(`/watch/${targetType}/${item.id}`, { state: { item } });
      }}
    />
  );
}

export function TvWatchRoute() {
  const { id, season = '1', episode = '1' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <WatchPage
      type="tv"
      id={id}
      season={season}
      episode={episode}
      preloadedItem={location.state?.item}
      onBack={() => navigate('/')}
      onMovieClick={(item) => {
        const targetType = item.media_type === 'tv' ? 'tv' : 'movie';
        navigate(`/watch/${targetType}/${item.id}`, { state: { item } });
      }}
    />
  );
}

export function DubWatchRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <WatchPage
      type="dub"
      id={id}
      preloadedItem={location.state?.item}
      onBack={() => navigate('/')}
      onMovieClick={(item) => {
        navigate(`/watch/dub/${item.id}`, { state: { item } });
      }}
    />
  );
}
