import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Zap, Brain, Database, GitBranch, Activity, Shield,
  ChevronRight, Upload, BarChart3, MessageSquare, Search, Network,
  CheckCircle2, Code2, Cpu, Layers,
} from 'lucide-react';

// ── Data ───────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Brain,
    title: 'GraphRAG AI Chat',
    desc: 'Ask natural language questions. Claude AI reasons over the knowledge graph using 5 native tools — SPARQL, vector search, load flow, entity details, graph traversal.',
    accent: '#8b5cf6',
    glow: 'rgba(139,92,246,0.12)',
    route: '/chat',
    tag: 'Claude claude-sonnet-4-6',
  },
  {
    icon: Zap,
    title: 'Load Flow Analysis',
    desc: 'DC, AC Newton-Raphson and OPF calculations on your CIM network with real-time topology map, voltage-colored buses and branch loading visualization.',
    accent: '#f59e0b',
    glow: 'rgba(245,158,11,0.12)',
    route: '/load-flow',
    tag: 'pandapower',
  },
  {
    icon: Database,
    title: 'Semantic Knowledge Graph',
    desc: 'CIM IEC 61970/61968 compliant RDF triple store powered by Apache Jena 5 with embedded Fuseki/TDB2, full SPARQL 1.1 support and OWL reasoning.',
    accent: '#10b981',
    glow: 'rgba(16,185,129,0.12)',
    route: '/sparql',
    tag: 'Apache Jena 5',
  },
  {
    icon: Search,
    title: 'Vector Search (Qdrant)',
    desc: 'Semantic entity retrieval with OpenAI text-embedding-3-small. 1536-dimension vectors indexed automatically after every import. Finds equipment by meaning.',
    accent: '#38bdf8',
    glow: 'rgba(56,189,248,0.12)',
    route: '/dashboard',
    tag: 'Qdrant',
  },
  {
    icon: Code2,
    title: 'SPARQL Editor',
    desc: 'Monaco-based query editor with syntax highlighting, 6 pre-built templates, execution history and CSV/JSON export for deep data exploration.',
    accent: '#f43f5e',
    glow: 'rgba(244,63,94,0.12)',
    route: '/sparql',
    tag: 'SPARQL 1.1',
  },
  {
    icon: Shield,
    title: 'SHACL Validation',
    desc: 'Validate CIM data against SHACL shapes and IEC 61970 profiles. Detect data quality issues before they impact your analysis.',
    accent: '#fb923c',
    glow: 'rgba(251,146,60,0.12)',
    route: '/validation',
    tag: 'IEC 61970',
  },
];

const STEPS = [
  {
    num: '01',
    icon: Upload,
    title: 'Import your CIM data',
    desc: 'Upload CIM/XML, RDF or Excel files. Entities are automatically indexed into Qdrant as semantic vectors.',
    color: '#10b981',
  },
  {
    num: '02',
    icon: Network,
    title: 'Explore the Knowledge Graph',
    desc: 'Query with SPARQL, run load flow, visualize the network topology, or ask the AI agent in natural language.',
    color: '#8b5cf6',
  },
  {
    num: '03',
    icon: Brain,
    title: 'Get AI-powered answers',
    desc: 'Claude AI reasons autonomously using tools: semantic search, SPARQL queries, power flow calculations and streams back precise answers.',
    color: '#f59e0b',
  },
];


const STATS = [
  { value: '5', label: 'AI Agent Tools', icon: Cpu },
  { value: 'IEC 61970', label: 'CIM Standard', icon: CheckCircle2 },
  { value: '1536-dim', label: 'Vector Embeddings', icon: Layers },
  { value: 'SSE', label: 'Real-time Streaming', icon: Activity },
];

// ── Demo Terminal ──────────────────────────────────────────────────────────────
const DemoTerminal = () => (
  <div
    className="relative rounded-2xl overflow-hidden"
    style={{
      background: 'linear-gradient(135deg, rgba(10,18,30,0.95) 0%, rgba(6,12,20,0.98) 100%)',
      border: '1px solid rgba(245,158,11,0.2)',
      boxShadow: '0 0 60px rgba(245,158,11,0.08), 0 40px 80px rgba(0,0,0,0.5)',
    }}
  >
    {/* Window chrome */}
    <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
      <div className="w-3 h-3 rounded-full bg-red-500/60" />
      <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
      <div className="w-3 h-3 rounded-full bg-green-500/60" />
      <span className="ml-2 text-xs text-neutral-600 font-mono">Claude Agent — GraphRAG Chat</span>
    </div>

    {/* Chat content */}
    <div className="p-5 space-y-4 text-sm font-mono">
      {/* User message */}
      <div className="flex justify-end">
        <div className="px-3 py-2 rounded-xl text-xs max-w-[75%]" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
          What substations have voltage violations?
        </div>
      </div>

      {/* Tool calls */}
      <div className="space-y-1.5">
        {[
          { tool: 'semantic_search', result: '12 results', color: '#38bdf8' },
          { tool: 'sparql_query', result: '3.2k chars', color: '#10b981' },
          { tool: 'load_flow', result: 'NRW network', color: '#f59e0b' },
        ].map(({ tool, result, color }) => (
          <div key={tool} className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
            <span style={{ color: color }}>[tool]</span>
            <span>{tool}</span>
            <span className="flex-1 border-t border-dashed" style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
            <span style={{ color }}>{result}</span>
            <CheckCircle2 size={10} style={{ color }} />
          </div>
        ))}
      </div>

      {/* Assistant response */}
      <div className="flex gap-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
          <Brain size={12} style={{ color: '#8b5cf6' }} />
        </div>
        <div className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
          <span style={{ color: '#10b981', fontWeight: 'bold' }}>3 voltage violations</span> detected in the NRW network:
          <br />
          <span style={{ color: '#f87171' }}>• Düsseldorf 220kV</span> — 0.87 pu (min 0.90)
          <br />
          <span style={{ color: '#f87171' }}>• Köln 380kV</span> — 1.08 pu (max 1.05)
          <br />
          <span style={{ color: '#fbbf24' }}>• Essen 110kV</span> — 0.91 pu (warning)
          <br />
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Confidence: 94% · 3.2s</span>
        </div>
      </div>

      {/* Blinking cursor */}
      <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
        Ask me anything about your CIM network
        <span className="inline-block w-1.5 h-3 ml-0.5 align-middle animate-pulse" style={{ background: 'rgba(245,158,11,0.7)' }} />
      </div>
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen text-white overflow-x-hidden"
      style={{ background: 'linear-gradient(160deg, #060c14 0%, #08111e 40%, #060c14 100%)' }}
    >
      <style>{`
        @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        @keyframes glow-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.9; } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes slide-right { from { opacity:0; transform:translateX(-20px); } to { opacity:1; transform:translateX(0); } }
        .fade-up   { animation: fadeUp 0.6s ease both; }
        .fade-up-1 { animation: fadeUp 0.6s ease 0.1s both; }
        .fade-up-2 { animation: fadeUp 0.6s ease 0.2s both; }
        .fade-up-3 { animation: fadeUp 0.6s ease 0.3s both; }
        .fade-up-4 { animation: fadeUp 0.6s ease 0.45s both; }
        .shimmer-text {
          background: linear-gradient(90deg, #f59e0b 0%, #fde68a 30%, #ffffff 50%, #fde68a 70%, #f59e0b 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 5s linear infinite;
        }
        .grid-bg {
          background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 64px 64px;
        }
        .card-hover { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .card-hover:hover { transform: translateY(-5px); }
        .step-line::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 100%;
          width: 100%;
          height: 1px;
          background: linear-gradient(90deg, rgba(255,255,255,0.1), transparent);
        }
      `}</style>

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ animation: 'glow-pulse 5s ease-in-out infinite', position: 'absolute', top: '-5%', left: '5%', width: '700px', height: '700px', background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 65%)', borderRadius: '50%' }} />
        <div style={{ animation: 'glow-pulse 6s ease-in-out 1.5s infinite', position: 'absolute', bottom: '5%', right: '0%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(56,189,248,0.05) 0%, transparent 65%)', borderRadius: '50%' }} />
        <div style={{ animation: 'glow-pulse 7s ease-in-out 3s infinite', position: 'absolute', top: '50%', left: '40%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 65%)', borderRadius: '50%' }} />
        <div className="absolute inset-0 grid-bg" />
      </div>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="relative z-20 flex items-center justify-between px-6 lg:px-10 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="CIM" className="h-8 w-8" style={{ filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.5))' }} />
          <div className="flex items-baseline gap-1">
            <span className="text-base font-black" style={{ color: '#f59e0b' }}>CIM</span>
            <span className="text-base font-bold text-white">Platform</span>
          </div>
          <span className="hidden sm:block ml-2 text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
            v2.0
          </span>
        </div>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-6 text-sm text-neutral-400">
          <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Features</button>
          <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">How it works</button>
        </div>

        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl transition-all"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.22)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.12)'; }}
        >
          Open App <ChevronRight size={14} />
        </button>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pt-10 pb-20">
        <div className="flex flex-col lg:flex-row items-center gap-12 xl:gap-20">

          {/* Left */}
          <div className="flex-1 text-center lg:text-left max-w-2xl">
            <div className="fade-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Power System Intelligence · IEC 61970 Compliant
            </div>

            <h1 className="fade-up-1 text-5xl sm:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight mb-6">
              <span className="shimmer-text">CIM</span>
              <br />
              <span className="text-white">Semantic</span>
              <br />
              <span style={{ color: '#64748b' }}>Graph Platform</span>
            </h1>

            <p className="fade-up-2 text-base sm:text-lg text-neutral-400 mb-4 leading-relaxed lg:mx-0 mx-auto max-w-xl">
              Transform power system CIM data into an AI-queryable knowledge graph.
              Import CIM/RDF or Excel, run load flow, and interrogate your network
              with <span style={{ color: '#8b5cf6' }}>Claude AI Agent</span> using natural language.
            </p>

            {/* Mini feature pills */}
            <div className="fade-up-2 flex flex-wrap gap-2 mb-8 justify-center lg:justify-start">
              {['SSE Streaming', 'Vector Search', 'SPARQL 1.1', 'Load Flow', 'Tool Calling'].map(pill => (
                <span key={pill} className="text-xs px-2.5 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                  {pill}
                </span>
              ))}
            </div>

            <div className="fade-up-3 flex flex-col sm:flex-row items-center gap-3 lg:justify-start justify-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="group flex items-center gap-3 px-7 py-3.5 font-bold text-sm rounded-2xl transition-all"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  boxShadow: '0 0 28px rgba(245,158,11,0.35), 0 4px 16px rgba(0,0,0,0.4)',
                  color: '#0a0f1a',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 48px rgba(245,158,11,0.55), 0 4px 16px rgba(0,0,0,0.4)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 28px rgba(245,158,11,0.35), 0 4px 16px rgba(0,0,0,0.4)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              >
                Launch Platform
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => navigate('/import')}
                className="flex items-center gap-2 px-7 py-3.5 font-medium text-sm rounded-2xl transition-all text-neutral-300 hover:text-white"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
              >
                <Upload size={15} />
                Import CIM Data
              </button>
            </div>
          </div>

          {/* Right: Demo terminal */}
          <div className="fade-up-4 flex-shrink-0 w-full max-w-md lg:max-w-lg xl:max-w-xl" style={{ animation: 'float 7s ease-in-out infinite' }}>
            <DemoTerminal />
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pb-20">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map(({ value, label, icon: Icon }) => (
            <div
              key={label}
              className="relative rounded-2xl p-5 text-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <Icon size={18} className="mx-auto mb-2" style={{ color: 'rgba(245,158,11,0.7)' }} />
              <p className="text-xl font-black text-white mb-0.5">{value}</p>
              <p className="text-xs text-neutral-500">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pb-24">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
            Workflow
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">How it works</h2>
          <p className="text-neutral-500 max-w-lg mx-auto text-sm">Three steps from raw CIM data to AI-powered grid intelligence.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 relative">
          {/* connector line (desktop only) */}
          <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }} />

          {STEPS.map(({ num, icon: Icon, title, desc, color }, i) => (
            <div
              key={num}
              className="relative rounded-2xl p-6"
              style={{
                background: `linear-gradient(135deg, ${color}08 0%, rgba(10,18,30,0.7) 100%)`,
                border: `1px solid ${color}20`,
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                  <Icon size={18} style={{ color }} />
                </div>
                <span className="text-3xl font-black" style={{ color: `${color}40` }}>{num}</span>
              </div>
              <h3 className="font-bold text-white text-base mb-2">{title}</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">{desc}</p>
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-10 -right-3 z-10 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <ChevronRight size={12} className="text-neutral-600" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pb-24">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}>
            Capabilities
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">Everything you need</h2>
          <p className="text-neutral-500 max-w-lg mx-auto text-sm">
            A complete platform for CIM power grid data management, analysis, and AI-powered reasoning.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, accent, glow, route, tag }) => (
            <button
              key={title}
              onClick={() => navigate(route)}
              className="card-hover group relative rounded-2xl p-6 text-left overflow-hidden cursor-pointer w-full"
              style={{
                background: `linear-gradient(135deg, ${glow} 0%, rgba(8,17,30,0.9) 100%)`,
                border: `1px solid ${accent}25`,
              }}
            >
              {/* top shine on hover */}
              <div className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

              {/* tag */}
              <div className="absolute top-4 right-4 text-[9px] font-bold px-2 py-0.5 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}25` }}>
                {tag}
              </div>

              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
                <Icon size={18} style={{ color: accent }} />
              </div>

              <h3 className="text-sm font-bold text-white mb-2 group-hover:text-white/90">{title}</h3>
              <p className="text-xs text-neutral-500 leading-relaxed mb-4">{desc}</p>

              <div className="flex items-center gap-1.5 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: accent }}>
                Open <ArrowRight size={11} />
              </div>
            </button>
          ))}
        </div>
      </section>


      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-20">
        <div
          className="relative rounded-3xl p-10 sm:p-14 text-center overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.07) 0%, rgba(139,92,246,0.05) 100%)',
            border: '1px solid rgba(245,158,11,0.18)',
            boxShadow: '0 0 80px rgba(245,158,11,0.07)',
          }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.5), transparent)' }} />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.3), transparent)' }} />

          <img src="/logo.svg" alt="" className="h-12 w-12 mx-auto mb-6 object-contain" style={{ filter: 'drop-shadow(0 0 14px rgba(245,158,11,0.6))' }} />
          <h2 className="text-3xl font-black text-white mb-3">Ready to analyze your grid?</h2>
          <p className="text-neutral-400 mb-8 max-w-sm mx-auto text-sm">
            Import your CIM/RDF or Excel data and start querying in natural language with Claude AI Agent.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="group inline-flex items-center gap-3 px-8 py-3.5 font-bold text-sm rounded-2xl transition-all"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 0 28px rgba(245,158,11,0.4)', color: '#0a0f1a' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            >
              Open Dashboard
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/graphrag')}
              className="inline-flex items-center gap-2 px-8 py-3.5 font-medium text-sm rounded-2xl transition-all text-neutral-300 hover:text-white"
              style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.1)'; }}
            >
              <MessageSquare size={15} />
              Try AI Chat
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t px-6 lg:px-10 py-8" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-5 w-5 object-contain opacity-50" />
            <span className="text-xs text-neutral-600">CIM Semantic Graph Platform</span>
            <span className="text-neutral-800">·</span>
            <span className="text-xs text-neutral-700">v2.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
