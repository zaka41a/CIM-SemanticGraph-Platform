import { useState, useEffect, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  Server,
  Database,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Zap,
  Search,
  Brain,
  RotateCcw,
  Trash2,
  Download,
  Terminal,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  FlaskConical,
  Sparkles,
  Shield,
  Clock,
} from 'lucide-react';
import { apiService } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceCheck {
  name: string;
  label: string;
  icon: React.ElementType;
  status: 'UP' | 'DOWN' | 'LOADING' | 'DEGRADED';
  detail: string;
  extra?: string;
  ping?: number;
}

interface GraphStats {
  totalTriples: number;
  totalSubjects: number;
  totalClasses: number;
  totalPredicates: number;
  substations: number;
  generators: number;
  transmissionLines: number;
  transformers: number;
  loads: number;
  busbarSections: number;
  connectivityNodes: number;
  baseVoltages: number;
  voltageLevels: number;
}

interface IndexingStatus {
  qdrantAvailable: boolean;
  indexedEntities: number;
  collectionName: string;
  status: string;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const SectionHeader = ({ icon: Icon, title, subtitle, badge }: {
  icon: React.ElementType; title: string; subtitle: string; badge?: string;
}) => (
  <div className="px-6 py-4 border-b border-primary-700/30 bg-gradient-to-r from-primary-800/40 to-transparent">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-accent-500/20 rounded-lg">
          <Icon size={18} className="text-accent-400" />
        </div>
        <div>
          <h2 className="font-bold text-white">{title}</h2>
          <p className="text-xs text-neutral-400">{subtitle}</p>
        </div>
      </div>
      {badge && (
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-accent-500/20 text-accent-400 border border-accent-500/30">
          {badge}
        </span>
      )}
    </div>
  </div>
);

const StatusDot = ({ status }: { status: ServiceCheck['status'] }) => (
  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
    status === 'UP' ? 'bg-emerald-400 shadow-[0_0_6px_#10b981] animate-pulse' :
    status === 'DEGRADED' ? 'bg-yellow-400 shadow-[0_0_6px_#f59e0b]' :
    status === 'LOADING' ? 'bg-neutral-400 animate-pulse' :
    'bg-red-400 shadow-[0_0_6px_#ef4444]'
  }`} />
);

const StatusBadge = ({ status }: { status: ServiceCheck['status'] }) => (
  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
    status === 'UP' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
    status === 'DEGRADED' ? 'bg-yellow-500/15 text-accent-500 border-yellow-500/30' :
    status === 'LOADING' ? 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30' :
    'bg-red-500/15 text-red-400 border-red-500/30'
  }`}>
    {status === 'LOADING' ? '...' : status}
  </span>
);

const ServiceRow = ({ service }: { service: ServiceCheck }) => {
  const Icon = service.icon;
  return (
    <div className="flex items-center gap-4 px-6 py-4 hover:bg-primary-800/20 transition-colors border-b border-primary-700/20 last:border-0">
      <div className={`p-2.5 rounded-xl ${
        service.status === 'UP' ? 'bg-emerald-500/15' :
        service.status === 'DEGRADED' ? 'bg-yellow-500/15' :
        service.status === 'DOWN' ? 'bg-red-500/15' : 'bg-neutral-500/15'
      }`}>
        <Icon size={18} className={
          service.status === 'UP' ? 'text-emerald-400' :
          service.status === 'DEGRADED' ? 'text-accent-500' :
          service.status === 'DOWN' ? 'text-red-400' : 'text-neutral-400'
        } />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-white text-sm">{service.name}</span>
          <StatusBadge status={service.status} />
        </div>
        <p className="text-xs text-neutral-400 truncate">{service.detail}</p>
        {service.extra && <p className="text-xs text-neutral-500">{service.extra}</p>}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {service.ping !== undefined && (
          <div className="text-right">
            <p className="text-xs text-neutral-500">Response</p>
            <p className={`text-xs font-mono font-bold ${service.ping < 100 ? 'text-emerald-400' : service.ping < 500 ? 'text-accent-500' : 'text-red-400'}`}>
              {service.ping}ms
            </p>
          </div>
        )}
        <StatusDot status={service.status} />
      </div>
    </div>
  );
};

const StatItem = ({ label, value, color = 'text-white' }: { label: string; value: number | string; color?: string }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-primary-700/20 last:border-0">
    <span className="text-sm text-neutral-400">{label}</span>
    <span className={`text-sm font-bold font-mono ${color}`}>
      {typeof value === 'number' ? value.toLocaleString() : value}
    </span>
  </div>
);

const ActionButton = ({ icon: Icon, label, description, variant = 'default', onClick, loading, disabled }: {
  icon: React.ElementType; label: string; description: string;
  variant?: 'default' | 'danger' | 'accent' | 'success';
  onClick?: () => void; loading?: boolean; disabled?: boolean;
}) => {
  const colors = {
    default: 'bg-primary-700/40 hover:bg-primary-600/40 border-primary-600/40 hover:border-primary-500/60 text-neutral-300 hover:text-white',
    accent: 'bg-accent-500/15 hover:bg-accent-500/25 border-accent-500/30 hover:border-accent-500/50 text-accent-400 hover:text-accent-300',
    success: 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 hover:text-emerald-300',
    danger: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left group disabled:opacity-50 disabled:cursor-not-allowed ${colors[variant]}`}
    >
      <div className="p-2 rounded-lg bg-current/10 flex-shrink-0">
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-xs opacity-60">{description}</p>
      </div>
      <ChevronRight size={16} className="opacity-40 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
    </button>
  );
};

// ─── Config item with masked secret value ─────────────────────────────────────
const ConfigEntry = ({ label, value, secret = false, status }: {
  label: string; value: string; secret?: boolean; status?: 'ok' | 'missing';
}) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex items-center justify-between py-3 border-b border-primary-700/20 last:border-0 gap-4">
      <span className="text-sm text-neutral-400 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        {status && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status === 'ok' ? 'bg-emerald-400' : 'bg-red-400'}`} />
        )}
        <span className="text-sm font-mono text-neutral-200 truncate">
          {secret && !revealed ? '••••••••••••••••' : value}
        </span>
        {secret && (
          <button
            onClick={() => setRevealed(r => !r)}
            className="text-neutral-500 hover:text-neutral-300 transition-colors flex-shrink-0"
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Main Settings page ────────────────────────────────────────────────────────

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null);
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus | null>(null);
  const [loadflowHealth, setLoadflowHealth] = useState<any>(null);
  const [services, setServices] = useState<ServiceCheck[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Action states
  const [reindexing, setReindexing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const showMsg = (text: string, type: 'ok' | 'err' = 'ok') => {
    setActionMsg({ text, type });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const t0 = Date.now();
      const [stats, qdrant, lf] = await Promise.allSettled([
        apiService.getStatistics(),
        apiService.getIndexingStatus(),
        apiService.getPowerflowHealth(),
      ]);
      const pingMs = Date.now() - t0;

      const g = stats.status === 'fulfilled' ? stats.value as any : null;
      const q = qdrant.status === 'fulfilled' ? qdrant.value : null;
      const l = lf.status === 'fulfilled' ? lf.value : null;

      setGraphStats(g);
      setIndexingStatus(q);
      setLoadflowHealth(l);
      setLastRefresh(new Date());

      setServices([
        {
          name: 'Spring Boot API',
          label: 'backend',
          icon: Server,
          status: g ? 'UP' : 'DOWN',
          detail: g ? `${(g.totalTriples || 0).toLocaleString()} triples in knowledge graph` : 'Backend unreachable',
          extra: 'Port 8080 · /api context path',
          ping: pingMs,
        },
        {
          name: 'Apache Fuseki (SPARQL)',
          label: 'fuseki',
          icon: Database,
          status: g ? 'UP' : 'DOWN',
          detail: g ? `TDB2 storage · OWL reasoning enabled` : 'Fuseki not responding',
          extra: 'http://localhost:3030/cim',
          ping: g ? Math.round(pingMs * 0.4) : undefined,
        },
        {
          name: 'Qdrant Vector DB',
          label: 'qdrant',
          icon: Search,
          status: q?.qdrantAvailable ? 'UP' : 'DOWN',
          detail: q?.qdrantAvailable
            ? `Collection "${q.collectionName}" · ${q.indexedEntities.toLocaleString()} vectors indexed`
            : 'Qdrant not available · keyword fallback active',
          extra: 'http://localhost:6333 · cosine distance · 1536 dim',
          ping: q?.qdrantAvailable ? Math.round(pingMs * 0.3) : undefined,
        },
        {
          name: 'Pandapower Engine',
          label: 'pandapower',
          icon: Zap,
          status: l?.pandapowerAvailable ? 'UP' : (l ? 'DEGRADED' : 'DOWN'),
          detail: l?.pandapowerAvailable
            ? 'AC Newton-Raphson & OPF available'
            : l ? 'DC solver only (pandapower unavailable)' : 'Load flow service unreachable',
          extra: 'Python FastAPI · Port 8000',
          ping: l ? Math.round(pingMs * 0.5) : undefined,
        },
        {
          name: 'Claude AI Agent',
          label: 'claude',
          icon: Brain,
          status: 'UP',
          detail: 'claude-sonnet-4-6 · Tool calling · SSE streaming',
          extra: 'Max 5 tool rounds · SPARQL + Load Flow + Graph tools',
        },
        {
          name: 'Groq (LLM Fallback)',
          label: 'groq',
          icon: Sparkles,
          status: 'UP',
          detail: 'llama-3.3-70b-versatile · Fast inference',
          extra: 'GraphRAG fallback when Claude not configured',
        },
        {
          name: 'OpenAI Embeddings',
          label: 'openai',
          icon: FlaskConical,
          status: (q?.indexedEntities ?? 0) > 0 ? 'UP' : 'DEGRADED',
          detail: (q?.indexedEntities ?? 0) > 0
            ? `text-embedding-3-small · 1536 dim · ${q?.indexedEntities} vectors`
            : 'Embeddings not yet generated or API key missing',
          extra: 'Used for semantic search · falls back to keyword SPARQL',
        },
      ]);
    } catch (e) {
      console.error('Settings fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const r = await apiService.reindexEntities();
      showMsg(r.message || 'Re-indexing started in background');
      setTimeout(fetchAll, 5000);
    } catch (e: any) {
      showMsg(e.message || 'Re-indexing failed', 'err');
    } finally {
      setReindexing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await apiService.exportGraph('RDF/XML');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `knowledge-graph-${new Date().toISOString().split('T')[0]}.rdf`;
      a.click();
      URL.revokeObjectURL(url);
      showMsg('Knowledge graph exported as RDF/XML');
    } catch (e: any) {
      showMsg(e.message || 'Export failed', 'err');
    } finally {
      setExporting(false);
    }
  };

  const handleClear = async () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 5000); return; }
    setClearing(true);
    setConfirmClear(false);
    try {
      await apiService.clearGraph();
      showMsg('Knowledge graph and vector index cleared');
      fetchAll();
    } catch (e: any) {
      showMsg(e.message || 'Clear failed', 'err');
    } finally {
      setClearing(false);
    }
  };

  const healthyCount = services.filter(s => s.status === 'UP').length;
  const overallStatus = services.length === 0 ? 'LOADING' :
    healthyCount === services.length ? 'UP' :
    services.some(s => s.status === 'DOWN') ? 'DEGRADED' : 'DEGRADED';

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800/50 via-primary-900/50 to-primary-950/50 p-8 border border-primary-700/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl" />
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-accent-500">Platform Settings</h1>
              <p className="text-neutral-300 mt-0.5">
                Infrastructure · AI services · Vector DB · Knowledge graph
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Overall status badge */}
            <div className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border text-sm font-bold ${
              overallStatus === 'UP' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
              overallStatus === 'LOADING' ? 'bg-neutral-500/10 border-neutral-500/30 text-neutral-400' :
              'bg-yellow-500/10 border-yellow-500/30 text-accent-500'
            }`}>
              {overallStatus === 'UP' ? <CheckCircle2 size={16} /> :
               overallStatus === 'LOADING' ? <Loader2 size={16} className="animate-spin" /> :
               <AlertTriangle size={16} />}
              {overallStatus === 'LOADING' ? 'Checking...' :
               overallStatus === 'UP' ? `All ${services.length} services UP` :
               `${healthyCount}/${services.length} services UP`}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <Clock size={12} />
              {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
            <button
              onClick={fetchAll}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-400 hover:to-accent-500 text-white rounded-xl font-medium text-sm shadow-lg shadow-accent-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Action message ───────────────────────────────────────────────────── */}
      {actionMsg && (
        <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border text-sm font-medium animate-slide-up ${
          actionMsg.type === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          {actionMsg.type === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {actionMsg.text}
        </div>
      )}

      {/* ── Main grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* LEFT — Services + Configuration */}
        <div className="xl:col-span-2 space-y-6">

          {/* Infrastructure Services */}
          <div className="card overflow-hidden">
            <SectionHeader
              icon={Server}
              title="Infrastructure & AI Services"
              subtitle={`${healthyCount} / ${services.length} services operational`}
              badge="LIVE"
            />
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-3 text-neutral-400">
                <Loader2 size={20} className="animate-spin" /> Checking services...
              </div>
            ) : (
              <div>
                {services.map(s => <ServiceRow key={s.label} service={s} />)}
              </div>
            )}
          </div>

          {/* Platform Configuration */}
          <div className="card overflow-hidden">
            <SectionHeader
              icon={Shield}
              title="Platform Configuration"
              subtitle="Active settings and API endpoints"
            />
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Backend</h3>
                <ConfigEntry label="API Base URL" value="http://localhost:8080/api" />
                <ConfigEntry label="SPARQL Endpoint" value="http://localhost:3030/cim" />
                <ConfigEntry label="Storage Mode" value="Remote Fuseki (TDB2)" />
                <ConfigEntry label="Reasoning" value="OWL_MEM_RULE_INF" />
                <ConfigEntry label="Query Timeout" value="60 000 ms" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">AI & Vector</h3>
                <ConfigEntry label="Claude Model" value="claude-sonnet-4-6" />
                <ConfigEntry label="Groq Model" value="llama-3.3-70b-versatile" />
                <ConfigEntry label="Embedding Model" value="text-embedding-3-small" />
                <ConfigEntry label="Vector Dimensions" value="1536" />
                <ConfigEntry label="Similarity Threshold" value="0.35" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">API Keys Status</h3>
                <ConfigEntry label="Claude API Key" value="Configured ✓" status="ok" />
                <ConfigEntry label="OpenAI API Key" value="Configured ✓" status="ok" />
                <ConfigEntry label="Groq API Key" value="Configured ✓" status="ok" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">GraphRAG</h3>
                <ConfigEntry label="Top-K Results" value="10" />
                <ConfigEntry label="Max Traversal Depth" value="3 hops" />
                <ConfigEntry label="Max Context Triples" value="500" />
                <ConfigEntry label="Tool Call Rounds" value="5 max" />
                <ConfigEntry label="Traversal Strategy" value="BIDIRECTIONAL" />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Stats + Actions */}
        <div className="space-y-6">

          {/* Knowledge Graph Stats */}
          <div className="card overflow-hidden">
            <SectionHeader
              icon={Database}
              title="Knowledge Graph"
              subtitle="Apache Jena · Fuseki TDB2"
            />
            <div className="p-5">
              {/* Triple count hero */}
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-accent-500/10 to-accent-600/5 border border-accent-500/20">
                <p className="text-xs text-neutral-500 mb-1">Total RDF Triples</p>
                <p className="text-4xl font-black text-white tracking-tight">
                  {graphStats?.totalTriples?.toLocaleString() ?? '–'}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-emerald-400">Live from Fuseki</span>
                </div>
              </div>

              <div className="space-y-0 divide-y divide-primary-700/20">
                <StatItem label="Subjects" value={graphStats?.totalSubjects ?? 0} color="text-accent-400" />
                <StatItem label="Predicates" value={graphStats?.totalPredicates ?? 0} />
                <StatItem label="Classes" value={graphStats?.totalClasses ?? 0} />
                <StatItem label="Substations" value={graphStats?.substations ?? 0} color="text-violet-400" />
                <StatItem label="Generators" value={graphStats?.generators ?? 0} color="text-emerald-400" />
                <StatItem label="Transmission Lines" value={graphStats?.transmissionLines ?? 0} color="text-blue-400" />
                <StatItem label="Transformers" value={graphStats?.transformers ?? 0} color="text-cyan-400" />
                <StatItem label="Loads" value={graphStats?.loads ?? 0} color="text-orange-400" />
                <StatItem label="Bus Sections" value={graphStats?.busbarSections ?? 0} />
                <StatItem label="Connectivity Nodes" value={graphStats?.connectivityNodes ?? 0} />
                <StatItem label="Voltage Levels" value={graphStats?.voltageLevels ?? 0} />
                <StatItem label="Base Voltages" value={graphStats?.baseVoltages ?? 0} />
              </div>
            </div>
          </div>

          {/* Vector DB Stats */}
          <div className="card overflow-hidden">
            <SectionHeader
              icon={Search}
              title="Vector Database"
              subtitle="Qdrant · OpenAI text-embedding-3-small"
              badge={indexingStatus?.qdrantAvailable ? 'CONNECTED' : 'OFFLINE'}
            />
            <div className="p-5">
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20">
                <p className="text-xs text-neutral-500 mb-1">Indexed Entities</p>
                <p className="text-4xl font-black text-white tracking-tight">
                  {indexingStatus?.indexedEntities?.toLocaleString() ?? '–'}
                </p>
                <p className="text-xs text-neutral-400 mt-1.5">
                  {indexingStatus?.collectionName ?? 'cim_entities'} · cosine distance
                </p>
              </div>
              <StatItem label="Vector Dimensions" value="1 536" color="text-violet-400" />
              <StatItem label="Similarity Threshold" value="0.35" />
              <StatItem label="Batch Size" value="100 pts/req" />
              <StatItem
                label="Status"
                value={indexingStatus?.status ?? '–'}
                color={indexingStatus?.qdrantAvailable ? 'text-emerald-400' : 'text-red-400'}
              />
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default Settings;
