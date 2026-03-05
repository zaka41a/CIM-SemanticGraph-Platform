import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap, Brain, Database, GitBranch, Activity, Shield, ChevronRight } from 'lucide-react';

const FEATURES = [
  {
    icon: Brain,
    title: 'GraphRAG AI Chat',
    desc: 'Ask natural language questions. Claude AI reasons over the knowledge graph for precise, contextual power system answers.',
    accent: '#8b5cf6',
    glow: 'rgba(139,92,246,0.15)',
  },
  {
    icon: Zap,
    title: 'Load Flow Analysis',
    desc: 'DC, AC Newton-Raphson and OPF calculations on your CIM network with real-time topology visualization.',
    accent: '#f59e0b',
    glow: 'rgba(245,158,11,0.15)',
  },
  {
    icon: Database,
    title: 'Semantic Knowledge Graph',
    desc: 'CIM IEC 61970/61968 compliant RDF triple store powered by Apache Jena/Fuseki with full SPARQL 1.1 support.',
    accent: '#10b981',
    glow: 'rgba(16,185,129,0.15)',
  },
  {
    icon: GitBranch,
    title: 'Vector Search (Qdrant)',
    desc: 'Semantic entity retrieval with OpenAI embeddings. Find related equipment and substations by meaning.',
    accent: '#38bdf8',
    glow: 'rgba(56,189,248,0.15)',
  },
  {
    icon: Activity,
    title: 'SPARQL Editor',
    desc: 'Advanced query interface with syntax highlighting, sample queries and live results for data exploration.',
    accent: '#f43f5e',
    glow: 'rgba(244,63,94,0.15)',
  },
  {
    icon: Shield,
    title: 'SHACL Validation',
    desc: 'Validate CIM data against SHACL shapes and IEC 61970 profiles. Detect data quality issues early.',
    accent: '#fb923c',
    glow: 'rgba(251,146,60,0.15)',
  },
];


export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen text-white overflow-x-hidden"
      style={{ background: 'linear-gradient(135deg, #070c14 0%, #0a1220 50%, #06101a 100%)' }}
    >
      <style>{`
        @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-18px); } }
        @keyframes glow-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        .fade-up { animation: fadeUp 0.7s ease both; }
        .fade-up-1 { animation: fadeUp 0.7s ease 0.1s both; }
        .fade-up-2 { animation: fadeUp 0.7s ease 0.2s both; }
        .fade-up-3 { animation: fadeUp 0.7s ease 0.3s both; }
        .fade-up-4 { animation: fadeUp 0.7s ease 0.4s both; }
        .shimmer-text {
          background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 25%, #ffffff 50%, #fbbf24 75%, #f59e0b 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
        .card-hover { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .card-hover:hover { transform: translateY(-4px); }
        .grid-bg {
          background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }
      `}</style>

      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ animation: 'glow-pulse 4s ease-in-out infinite', position: 'absolute', top: '-10%', left: '10%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ animation: 'glow-pulse 5s ease-in-out 1s infinite', position: 'absolute', bottom: '10%', right: '5%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(56,189,248,0.07) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ animation: 'glow-pulse 6s ease-in-out 2s infinite', position: 'absolute', top: '40%', right: '20%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div className="absolute inset-0 grid-bg" />
      </div>

      {/* ── Navbar ── */}
      <nav className="relative z-20 flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="CIM Platform" className="h-9 w-9 object-contain" style={{ filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.4))' }} />
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-black" style={{ color: '#f59e0b' }}>CIM</span>
            <span className="text-lg font-bold text-white">Platform</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-xs text-neutral-600 font-mono">v2.0 · IEC 61970</span>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl border transition-all"
            style={{ background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)', color: '#fbbf24' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.1)'; }}
          >
            Open App <ChevronRight size={14} />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-10 pb-24">
        <div className="flex flex-col lg:flex-row items-center gap-16">

          {/* Left: Text */}
          <div className="flex-1 text-center lg:text-left">
            {/* Badge */}
            <div className="fade-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Power System Intelligence Platform
            </div>

            <h1 className="fade-up-1 text-5xl sm:text-6xl xl:text-7xl font-black leading-[1.0] tracking-tight mb-6">
              <span className="shimmer-text">CIM</span>
              <br />
              <span className="text-white">Semantic</span>
              <br />
              <span style={{ color: '#94a3b8' }}>Graph Platform</span>
            </h1>

            <p className="fade-up-2 text-base sm:text-lg text-neutral-400 max-w-xl mb-10 leading-relaxed lg:mx-0 mx-auto">
              AI-powered knowledge graph for electrical power systems.
              Import CIM/RDF or Excel data, run load flow calculations,
              and query your network in natural language.
            </p>

            <div className="fade-up-3 flex flex-col sm:flex-row items-center gap-4 lg:justify-start justify-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="group flex items-center gap-3 px-8 py-4 font-bold text-base rounded-2xl transition-all"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  boxShadow: '0 0 30px rgba(245,158,11,0.35), 0 4px 20px rgba(0,0,0,0.4)',
                  color: '#0a0f1a',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 50px rgba(245,158,11,0.5), 0 4px 20px rgba(0,0,0,0.4)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 30px rgba(245,158,11,0.35), 0 4px 20px rgba(0,0,0,0.4)'; }}
              >
                Launch Platform
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => navigate('/import')}
                className="flex items-center gap-2 px-8 py-4 font-medium text-base rounded-2xl transition-all text-neutral-300 hover:text-white"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
              >
                Import CIM Data
              </button>
            </div>
          </div>

          {/* Right: Logo visual */}
          <div className="fade-up-4 flex-shrink-0 flex items-center justify-center">
            <div className="relative">
              {/* Outer glow ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  animation: 'spin-slow 20s linear infinite',
                  background: 'conic-gradient(from 0deg, transparent 0%, rgba(245,158,11,0.4) 25%, transparent 50%, rgba(56,189,248,0.3) 75%, transparent 100%)',
                  borderRadius: '50%',
                  padding: '2px',
                  width: '360px',
                  height: '360px',
                }}
              />
              {/* Middle glow */}
              <div
                className="absolute inset-8 rounded-full"
                style={{
                  animation: 'glow-pulse 3s ease-in-out infinite',
                  background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)',
                }}
              />
              {/* Logo container */}
              <div
                className="relative flex items-center justify-center"
                style={{
                  width: '360px',
                  height: '360px',
                  background: 'radial-gradient(circle at 50% 50%, rgba(245,158,11,0.08) 0%, rgba(10,18,30,0.9) 60%)',
                  borderRadius: '50%',
                  border: '1px solid rgba(245,158,11,0.2)',
                  boxShadow: '0 0 60px rgba(245,158,11,0.15), inset 0 0 60px rgba(0,0,0,0.5)',
                  animation: 'float 6s ease-in-out infinite',
                }}
              >
                <img
                  src="/logo.svg"
                  alt="CIM Platform"
                  style={{ width: '200px', height: '200px', objectFit: 'contain', filter: 'drop-shadow(0 0 20px rgba(245,158,11,0.5))' }}
                />
              </div>
              {/* Orbiting dots */}
              {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: i % 2 === 0 ? '#f59e0b' : '#38bdf8',
                    boxShadow: `0 0 8px ${i % 2 === 0 ? '#f59e0b' : '#38bdf8'}`,
                    top: `calc(50% + ${Math.sin((deg * Math.PI) / 180) * 190}px - 4px)`,
                    left: `calc(50% + ${Math.cos((deg * Math.PI) / 180) * 190}px - 4px)`,
                    animation: `glow-pulse ${2 + i * 0.3}s ease-in-out infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

      </section>

      {/* ── Features ── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-24">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}>
            Capabilities
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">Everything you need</h2>
          <p className="text-neutral-500 max-w-lg mx-auto">
            A complete platform for CIM power grid data management, analysis, and AI-powered reasoning.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, accent, glow }) => (
            <div
              key={title}
              className="card-hover group relative rounded-2xl p-6 cursor-default overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${glow} 0%, rgba(10,18,30,0.8) 100%)`,
                border: `1px solid ${accent}30`,
              }}
            >
              {/* Top glow on hover */}
              <div
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
              />
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 flex-shrink-0"
                style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
              >
                <Icon size={20} style={{ color: accent }} />
              </div>
              <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-20">
        <div
          className="relative rounded-3xl p-12 text-center overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(56,189,248,0.05) 100%)',
            border: '1px solid rgba(245,158,11,0.2)',
            boxShadow: '0 0 80px rgba(245,158,11,0.08)',
          }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.5), transparent)' }} />
          <img src="/logo.svg" alt="" className="h-14 w-14 mx-auto mb-6 object-contain" style={{ filter: 'drop-shadow(0 0 12px rgba(245,158,11,0.5))' }} />
          <h2 className="text-3xl font-black text-white mb-3">Ready to analyze your grid?</h2>
          <p className="text-neutral-400 mb-8 max-w-md mx-auto">
            Import your CIM/RDF or Excel data and start asking questions in natural language with Claude AI.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="group inline-flex items-center gap-3 px-10 py-4 font-bold text-base rounded-2xl transition-all"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              boxShadow: '0 0 30px rgba(245,158,11,0.4)',
              color: '#0a0f1a',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
          >
            Open Dashboard
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="relative z-10 border-t px-6 py-6"
        style={{ borderColor: 'rgba(255,255,255,0.05)' }}
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-5 w-5 object-contain opacity-60" />
            <span className="text-xs text-neutral-600">CIM Semantic Graph Platform</span>
          </div>
          <span className="text-xs text-neutral-700">IEC 61970 · Apache Jena · Qdrant · Powered by Claude AI</span>
        </div>
      </footer>
    </div>
  );
}
