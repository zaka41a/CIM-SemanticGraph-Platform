import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowUp, Brain, Check, Database, GitBranch,
  MessageSquare, ShieldCheck, Upload, Zap,
} from 'lucide-react';

const FEATURES = [
  {
    icon: GitBranch, title: 'Knowledge graph', to: '/sparql', label: 'Explore',
    description: 'Explore equipment, trace connections and query your network with SPARQL.',
    color: 'text-sky-400', surface: 'bg-sky-400/10 border-sky-400/20',
    wash: 'from-sky-400/[0.07]', hover: 'hover:border-sky-400/35',
  },
  {
    icon: Zap, title: 'Load flow analysis', to: '/load-flow', label: 'Analyse',
    description: 'Run DC, AC or OPF calculations. Review bus voltages and branch loading.',
    color: 'text-accent-400', surface: 'bg-accent-400/10 border-accent-400/20',
    wash: 'from-accent-400/[0.07]', hover: 'hover:border-accent-400/35',
  },
  {
    icon: MessageSquare, title: 'GraphRAG Chat', to: '/chat', label: 'Ask',
    description: 'Ask questions about your model and follow the sources behind each answer.',
    color: 'text-accent-400', surface: 'bg-accent-400/10 border-accent-400/20',
    wash: 'from-accent-400/[0.07]', hover: 'hover:border-accent-400/35',
  },
  {
    icon: ShieldCheck, title: 'Data quality', to: '/validation', label: 'Validate',
    description: 'Find missing data and inconsistent connections before running your analysis.',
    color: 'text-emerald-400', surface: 'bg-emerald-400/10 border-emerald-400/20',
    wash: 'from-emerald-400/[0.07]', hover: 'hover:border-emerald-400/35',
  },
];

const STEPS = [
  {
    number: '01', icon: Upload, title: 'Import your model',
    description: 'Start with your CIM, RDF or Excel files.',
    color: 'text-emerald-400', surface: 'bg-emerald-400/10 border-emerald-400/20',
  },
  {
    number: '02', icon: GitBranch, title: 'Explore the network',
    description: 'See how equipment and connections fit together.',
    color: 'text-sky-400', surface: 'bg-sky-400/10 border-sky-400/20',
  },
  {
    number: '03', icon: Zap, title: 'Understand the results',
    description: 'Run calculations and ask questions about your data.',
    color: 'text-accent-400', surface: 'bg-accent-400/10 border-accent-400/20',
  },
];

function ChatPreview() {
  return (
    <figure aria-label="Example GraphRAG conversation with sample network data" className="w-full rounded-2xl border border-accent-400/20 bg-primary-900 shadow-2xl shadow-black/30 overflow-hidden">
      <figcaption className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="hidden sm:flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400/60" />
            <span className="w-2 h-2 rounded-full bg-accent-400/60" />
            <span className="w-2 h-2 rounded-full bg-emerald-400/60" />
          </div>
          <span className="text-xs font-medium text-neutral-300">GraphRAG Chat</span>
        </div>
        <span className="text-[10px] font-medium tracking-wide uppercase text-neutral-400">Example conversation</span>
      </figcaption>

      <div className="p-5 sm:p-6 space-y-6">
        <div className="flex justify-end">
          <p className="max-w-[90%] rounded-xl rounded-tr-sm border border-accent-400/20 bg-accent-400/10 px-4 py-3 text-sm leading-relaxed text-accent-200">
            Which buses have voltage violations?
          </p>
        </div>

        <div className="space-y-2.5 pl-1 font-mono text-[11px] sm:text-xs">
          {[
            { tool: 'semantic_search', result: 'Equipment', color: 'text-sky-400' },
            { tool: 'sparql_query', result: 'Connections', color: 'text-emerald-400' },
            { tool: 'load_flow', result: 'Bus voltages', color: 'text-accent-400' },
          ].map(({ tool, result, color }) => <div key={tool} className="flex items-center gap-2.5">
            <span className={`w-1.5 h-1.5 rounded-full bg-current shrink-0 ${color}`} />
            <span className="text-neutral-400">{tool}</span>
            <span className="flex-1 border-t border-dashed border-white/10" />
            <span className={color}>{result}</span>
            <Check size={12} className={color} aria-hidden="true" />
          </div>)}
        </div>

        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-accent-400/10 border border-accent-400/20">
            <Brain size={16} className="text-accent-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed text-neutral-300">One bus is below the voltage limit in this sample network.</p>
            <div className="mt-3 rounded-lg border border-accent-400/15 bg-accent-400/[0.04] px-3 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-neutral-200">Bus 12</span>
              <span className="font-mono text-accent-300">0.88 pu <span className="text-neutral-500">/ min. 0.90</span></span>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-500"><Database size={11} aria-hidden="true" /> Source: power flow results</p>
          </div>
        </div>

        <div aria-hidden="true" className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-primary-950/40 px-3.5 py-2.5">
          <span className="text-xs text-neutral-500">Ask about your network…</span>
          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-accent-400/15 text-accent-400"><ArrowUp size={14} /></span>
        </div>
      </div>
    </figure>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-primary-950 text-neutral-200">
      <header className="border-b border-white/[0.06]">
        <nav aria-label="Main navigation" className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="CIM Platform home">
            <img src="/logo.svg" alt="" className="w-9 h-9" />
            <span className="font-semibold text-white tracking-tight"><span className="text-accent-400">CIM</span> Platform</span>
          </Link>
          <Link to="/dashboard" className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-accent-400/25 bg-accent-400/[0.08] text-sm font-medium text-accent-300 hover:bg-accent-400/15">
            Open App <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main>
        <div className="bg-[radial-gradient(ellipse_at_15%_20%,rgba(245,158,11,0.06),transparent_55%),radial-gradient(ellipse_at_90%_80%,rgba(56,189,248,0.05),transparent_50%)]">
          <section className="max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-12 lg:gap-14 items-center py-14 sm:py-20" aria-labelledby="intro-title">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-accent-400/20 bg-accent-400/[0.06] px-3 py-1.5 text-[11px] sm:text-xs font-medium text-accent-300 mb-6">
                <Zap size={12} aria-hidden="true" /> Power system intelligence
              </p>
              <h1 id="intro-title" className="text-5xl sm:text-6xl xl:text-7xl leading-[1.06] tracking-tight font-bold">
                <span className="text-accent-400">CIM</span><br />
                <span className="text-white">Semantic</span><br />
                <span className="text-primary-300">Graph Platform</span>
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-neutral-400">
                Turn power system data into a connected knowledge graph.
                Explore your model, calculate power flow and ask questions in natural language.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/dashboard" className="group inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-accent-500 text-primary-950 font-semibold text-sm shadow-lg shadow-accent-500/10 hover:bg-accent-400">
                  Launch Platform <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                </Link>
                <Link to="/import" className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-medium text-neutral-300 hover:bg-white/[0.06] hover:text-white">
                  <Upload size={15} aria-hidden="true" /> Import CIM Data
                </Link>
              </div>
              <p className="mt-6 flex items-center gap-2 text-xs text-neutral-500"><Database size={13} className="text-primary-400" aria-hidden="true" /> CIM / RDF <span className="text-neutral-600">·</span> Excel <span className="text-neutral-600">·</span> SPARQL</p>
            </div>
            <ChatPreview />
          </section>
        </div>

        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <section className="py-10 sm:py-12 border-t border-white/[0.06]" aria-labelledby="workflow-title">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-7">
              <h2 id="workflow-title" className="text-2xl font-semibold tracking-tight text-white">From data to insight</h2>
              <p className="text-sm text-neutral-400">One workspace. Three simple steps.</p>
            </div>
            <ol className="grid md:grid-cols-3 gap-4">
              {STEPS.map(({ number, icon: Icon, title, description, color, surface }) => <li key={number} className="relative p-5 sm:p-6 rounded-xl border border-white/[0.07] bg-primary-900/60">
                <div className="flex items-center justify-between mb-5">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${surface} ${color}`}><Icon size={18} aria-hidden="true" /></div>
                  <span className={`font-mono text-sm ${color} opacity-60`}>{number}</span>
                </div>
                <h3 className="font-semibold text-white text-sm">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">{description}</p>
              </li>)}
            </ol>
          </section>

          <section className="pt-3 pb-14 sm:pb-20" aria-labelledby="features-title">
            <div className="mb-7">
              <h2 id="features-title" className="text-2xl font-semibold tracking-tight text-white">A clearer view of your network</h2>
              <p className="mt-2 text-sm text-neutral-400">Explore, analyse and validate your power system model.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {FEATURES.map(({ icon: Icon, title, description, to, label, color, surface, wash, hover }) => <Link key={title} to={to} className={`group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-primary-900/40 p-6 sm:p-7 transition-colors ${hover}`}>
                <div aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${wash} to-transparent to-70%`} />
                <div className="relative">
                  <div className="mb-5 flex items-center justify-between">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${surface} ${color}`}><Icon size={21} aria-hidden="true" /></div>
                    <span className={`inline-flex items-center gap-2 text-xs font-medium ${color}`}>{label}<ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" /></span>
                  </div>
                  <h3 className="text-base font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400 max-w-sm">{description}</p>
                </div>
              </Link>)}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
          <span>CIM Semantic Graph Platform</span>
          <Link to="/settings" className="hover:text-neutral-300">Platform status <span aria-hidden="true">↗</span></Link>
        </div>
      </footer>
    </div>
  );
}
