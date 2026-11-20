import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  FileCode,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Sparkles,
  Database,
  Search,
  Code2,
  Terminal,
  ShieldCheck,
  Flame,
  Film,
  Tv
} from 'lucide-react';

export default function SwaggerDocsPage() {
  const navigate = useNavigate();
  const [swaggerData, setSwaggerData] = useState(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [activeEndpoint, setActiveEndpoint] = useState(null);

  useEffect(() => {
    fetch('/swagger/moviebox-openapi.json')
      .then(res => res.json())
      .then(data => setSwaggerData(data))
      .catch(err => console.error('Failed to load swagger json:', err));
  }, []);

  const handleCopySwagger = () => {
    if (swaggerData && navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(swaggerData, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2500);
    }
  };

  const paths = swaggerData?.paths || {};
  const endpointsList = [];
  Object.keys(paths).forEach(path => {
    Object.keys(paths[path]).forEach(method => {
      endpointsList.push({
        path,
        method: method.toUpperCase(),
        ...paths[path][method]
      });
    });
  });

  const filteredEndpoints = endpointsList.filter(ep => {
    const matchesTag = selectedTag === 'ALL' || (ep.tags && ep.tags.includes(selectedTag));
    const matchesSearch = !searchFilter ||
      ep.path.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (ep.summary && ep.summary.toLowerCase().includes(searchFilter.toLowerCase()));
    return matchesTag && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#07080c] text-white selection:bg-cyan-500 selection:text-black">
      {/* Top Bar Header */}
      <div className="sticky top-0 z-40 bg-[#07080c]/90 backdrop-blur-2xl border-b border-white/[0.08] px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1) || navigate('/')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Kembali</span>
          </button>

          <div className="flex items-center gap-2 ml-2">
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black bg-cyan-500 text-black uppercase tracking-wider">
              OpenAPI 3.0
            </span>
            <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight hidden sm:inline">
              MovieBox API & Scraper Swagger Docs
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopySwagger}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 text-xs font-semibold transition-all active:scale-95"
            title="Salin Spesifikasi OpenAPI JSON"
          >
            {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedJson ? 'Tersalin' : 'Copy JSON'}</span>
          </button>

          <a
            href="/swagger/moviebox-openapi.json"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-extrabold transition-all active:scale-95 shadow-md shadow-cyan-500/20"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Raw JSON</span>
          </a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-[#12141f] via-[#0d0f17] to-[#07080c] border border-white/[0.08] shadow-2xl relative overflow-hidden mb-8">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

          <div className="relative z-10">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-black uppercase tracking-wider mb-2">
              <Sparkles className="w-4 h-4" />
              <span>Dokumentasi Resmi Integrasi McMovies</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight uppercase">
              MovieBox Pro REST API & Scraper
            </h2>
            <p className="mt-3 text-sm text-zinc-300 max-w-3xl leading-relaxed">
              Spesifikasi Swagger / OpenAPI 3.0 ini merangkum struktur data MovieBox lengkap termasuk
              <b> Trending Drama</b>, <b>Trending Movies</b>, <b>Film & Series Indonesia Terbaru di Netflix</b>,
              dan <b>Sinetron Indonesia</b> beserta resolusi streaming video direct.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <span>Base URL: <b>https://api.sansekai.my.id/api</b></span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>CORS Bypass: <b>Integrated Video Proxy</b></span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10">
                <Film className="w-3.5 h-3.5 text-amber-400" />
                <span>Katalog: <b>100% Real Scraped Data</b></span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
            {['ALL', 'Discovery', 'Indonesian Content', 'Playback & Streaming'].map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  selectedTag === tag
                    ? 'bg-white text-black shadow-md'
                    : 'bg-[#12141c] hover:bg-[#1a1d28] text-zinc-300 border border-white/[0.06]'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Cari endpoint..."
              className="w-full bg-[#12141c] text-white placeholder-zinc-500 text-xs rounded-xl pl-9 pr-3 py-2 border border-white/[0.08] focus:border-cyan-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Endpoints Accordion List */}
        <div className="space-y-3.5">
          {filteredEndpoints.map((ep, idx) => {
            const isExpanded = activeEndpoint === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-[#0f1118] border border-white/[0.08] overflow-hidden transition-all shadow-md"
              >
                {/* Endpoint Header Bar */}
                <div
                  onClick={() => setActiveEndpoint(isExpanded ? null : idx)}
                  className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      {ep.method}
                    </span>
                    <span className="font-mono text-xs sm:text-sm font-bold text-zinc-100 truncate">
                      {ep.path}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400 hidden sm:inline">
                      {ep.summary}
                    </span>
                    <span className="text-xs font-bold text-cyan-400">
                      {isExpanded ? 'Tutup' : 'Lihat Detail'}
                    </span>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-4 sm:p-6 border-t border-white/[0.06] bg-black/40 space-y-4 animate-fadeIn">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        Deskripsi
                      </h4>
                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                        {ep.description || ep.summary}
                      </p>
                    </div>

                    {ep.parameters && ep.parameters.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          Parameter Permintaan (Query Params)
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border border-white/10 rounded-xl overflow-hidden">
                            <thead className="bg-[#141620] text-zinc-300">
                              <tr>
                                <th className="p-2.5 border-b border-white/10">Nama</th>
                                <th className="p-2.5 border-b border-white/10">Tipe</th>
                                <th className="p-2.5 border-b border-white/10">Wajib</th>
                                <th className="p-2.5 border-b border-white/10">Keterangan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-zinc-400">
                              {ep.parameters.map((p, pIdx) => (
                                <tr key={pIdx}>
                                  <td className="p-2.5 font-mono text-cyan-300 font-bold">{p.name}</td>
                                  <td className="p-2.5">{p.schema?.type || 'string'}</td>
                                  <td className="p-2.5">{p.required ? 'Ya' : 'Opsional'}</td>
                                  <td className="p-2.5 text-zinc-300">{p.description || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Responses */}
                    <div>
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                        Respon Berhasil (HTTP 200 OK)
                      </h4>
                      <div className="p-3 rounded-xl bg-[#090a0f] border border-white/10 text-xs font-mono text-emerald-400 overflow-x-auto">
                        <pre>
                          {JSON.stringify(
                            ep.responses?.['200']?.content?.['application/json']?.schema || { status: '200 OK' },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}