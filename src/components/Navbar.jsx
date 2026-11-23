import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import {
  Search,
  Bookmark,
  History,
  Home,
  Film,
  Tv,
  Flame,
  Sparkles,
  Mic,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'home', label: 'Beranda', shortLabel: 'Home', Icon: Home },
  { id: 'movies', label: 'Film', shortLabel: 'Film', Icon: Film },
  { id: 'series', label: 'Series', shortLabel: 'Series', Icon: Tv },
  { id: 'indonesia', label: 'Indonesia', shortLabel: 'Indo', Icon: Flame },
  { id: 'asia', label: 'Asia', shortLabel: 'Asia', Icon: Sparkles },
  { id: 'dubindo', label: 'Dub Indo', shortLabel: 'Dub', Icon: Mic },
];

export default function Navbar({
  activeTab = 'home',
  onTabChange,
  onOpenSearch,
  onOpenWatchlist,
  onOpenHistory,
  watchlistCount = 0,
  historyCount = 0,
}) {
  const navContainerRef = useRef(null);
  const tabRefs = useRef(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false });

  const updateIndicator = useCallback(() => {
    const container = navContainerRef.current;
    const activeEl = tabRefs.current.get(activeTab);
    if (!container || !activeEl) {
      setIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const left = activeEl.offsetLeft;
    const width = activeEl.offsetWidth;
    setIndicator({ left, width, visible: true });
  }, [activeTab]);

  useLayoutEffect(() => {
    updateIndicator();
    const raf = requestAnimationFrame(updateIndicator);
    return () => cancelAnimationFrame(raf);
  }, [updateIndicator]);

  useEffect(() => {
    const onResize = () => updateIndicator();
    window.addEventListener('resize', onResize);

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(updateIndicator).catch(() => {});
    }

    let ro;
    if (typeof ResizeObserver !== 'undefined' && navContainerRef.current) {
      ro = new ResizeObserver(updateIndicator);
      ro.observe(navContainerRef.current);
      tabRefs.current.forEach((el) => el && ro.observe(el));
    }

    return () => {
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
    };
  }, [updateIndicator]);

  const handleNavClick = (tabId) => {
    onTabChange(tabId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {/* Desktop Centered Floating Glass Pill Capsule */}
      <header className="hidden lg:flex fixed left-1/2 top-3.5 -translate-x-1/2 z-50 items-center gap-1.5 rounded-full glass-dock px-2.5 py-1.5 max-w-[96vw]">
        <button
          onClick={() => handleNavClick('home')}
          className="flex items-center px-3 py-1.5 rounded-full group text-left flex-none"
        >
          <span className="text-lg font-extrabold tracking-tight text-white group-hover:text-zinc-200 transition-colors">
            McMovies<span className="text-red-500">.</span>
          </span>
        </button>

        <div className="w-px h-5 bg-white/10 flex-none" />

        {/* Sliding Active Pill Navigation */}
        <nav
          ref={navContainerRef}
          className="relative flex items-center gap-0.5 p-0.5"
          aria-label="Navigasi utama"
        >
          <div
            aria-hidden="true"
            className="absolute top-0.5 bottom-0.5 left-0 rounded-full bg-white text-black shadow-md pointer-events-none transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              width: `${indicator.width}px`,
              transform: `translate3d(${indicator.left}px, 0, 0)`,
              opacity: indicator.visible ? 1 : 0,
            }}
          />

          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                ref={(el) => {
                  if (el) tabRefs.current.set(id, el);
                  else tabRefs.current.delete(id);
                }}
                onClick={() => handleNavClick(id)}
                className={`relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors duration-200 ${
                  isActive
                    ? 'text-black font-semibold'
                    : 'text-zinc-300 hover:text-white font-medium'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-none" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="w-px h-5 bg-white/10 flex-none" />

        {/* Utility Icons */}
        <div className="flex items-center gap-1 pr-0.5 flex-none">
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] text-zinc-300 hover:text-white transition-all text-xs"
            title="Cari film & series (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5" />
            <kbd className="hidden xl:inline text-[10px] text-zinc-400 font-medium">Ctrl K</kbd>
          </button>

          <button
            onClick={onOpenWatchlist}
            className="relative w-8 h-8 rounded-full hover:bg-white/[0.12] text-zinc-300 hover:text-white transition-all flex items-center justify-center"
            title="Watchlist Saya"
          >
            <Bookmark className="w-4 h-4" />
            {watchlistCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-white text-black text-[9px] font-bold flex items-center justify-center">
                {watchlistCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenHistory}
            className="relative w-8 h-8 rounded-full hover:bg-white/[0.12] text-zinc-300 hover:text-white transition-all flex items-center justify-center"
            title="Riwayat Nonton"
          >
            <History className="w-4 h-4" />
            {historyCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-zinc-700 text-white text-[9px] font-bold flex items-center justify-center">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Mobile Floating Top Bar */}
      <header className="lg:hidden fixed top-2.5 left-3 right-3 z-50 rounded-2xl glass-dock px-3.5 h-13 flex items-center justify-between gap-2">
        <button
          onClick={() => handleNavClick('home')}
          className="flex items-center text-left flex-none"
        >
          <span className="text-lg font-extrabold tracking-tight text-white">
            McMovies<span className="text-red-500">.</span>
          </span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenSearch}
            className="w-8 h-8 rounded-full bg-white/[0.08] text-zinc-200 hover:text-white flex items-center justify-center transition-colors"
            title="Cari film & series"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenWatchlist}
            className="relative w-8 h-8 rounded-full bg-white/[0.08] text-zinc-200 hover:text-white flex items-center justify-center transition-colors"
            title="Watchlist Saya"
          >
            <Bookmark className="w-4 h-4" />
            {watchlistCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-3.5 px-1 rounded-full bg-white text-black text-[9px] font-bold flex items-center justify-center">
                {watchlistCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenHistory}
            className="relative w-8 h-8 rounded-full bg-white/[0.08] text-zinc-200 hover:text-white flex items-center justify-center transition-colors"
            title="Riwayat Nonton"
          >
            <History className="w-4 h-4" />
            {historyCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-3.5 px-1 rounded-full bg-zinc-700 text-white text-[9px] font-bold flex items-center justify-center">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Mobile Fixed Bottom Floating Glass Dock */}
      <nav
        className="lg:hidden fixed bottom-2.5 left-3 right-3 z-50 rounded-2xl glass-dock p-1 grid grid-cols-6 gap-1"
        aria-label="Navigasi seluler"
      >
        {NAV_ITEMS.map(({ id, shortLabel, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => handleNavClick(id)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'bg-white text-black shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="text-[9px] font-semibold tracking-tight leading-none">
                {shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
