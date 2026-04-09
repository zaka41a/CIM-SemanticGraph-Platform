import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle,
  Database, Zap, Loader2, RefreshCw,
  Cable, Plug, CircleDot, Wrench, ArrowRight, BarChart3
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { apiService } from '@/services/api';

interface DiagnosticResult {
  status: string;
  message: string;
  totalTriples: number;
  busCount: number;
  branchCount: number;
  connectedBranchCount: number;
  generatorCount: number;
  connectedGeneratorCount: number;
  loadCount: number;
  connectedLoadCount: number;
  totalGenerationMw: number;
  totalLoadMw: number;
  busIds: string[];
  lineIds: string[];
  generatorIds: string[];
  loadIds: string[];
  nodeConnections: Record<string, number>;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}

// Compact ratio bar — shows X/total connected
const RatioBar = ({
  label, icon: Icon, connected, total, color,
}: {
  label: string; icon: React.ElementType;
  connected: number; total: number; color: string;
}) => {
  const pct = total > 0 ? Math.round((connected / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-neutral-400">
          <Icon size={13} className={color} /> {label}
        </span>
        <span className="font-mono font-semibold text-white">
          {connected}<span className="text-neutral-500">/{total}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-primary-700/50 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            pct === 100 ? 'bg-emerald-400' : pct >= 70 ? 'bg-yellow-400' : 'bg-red-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-right text-[10px] text-neutral-500">{pct}% connected</div>
    </div>
  );
};

// Power balance visual
const PowerBalance = ({ gen, load }: { gen: number; load: number }) => {
  const imbalance = gen - load;
  const max = Math.max(gen, load, 1);
  const genPct  = Math.min((gen  / max) * 100, 100);
  const loadPct = Math.min((load / max) * 100, 100);
  const balanced = Math.abs(imbalance) < 50;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-emerald-400"><Zap size={12} /> Generation</span>
          <span className="font-mono font-bold text-white">{gen.toFixed(1)} MW</span>
        </div>
        <div className="h-2 rounded-full bg-primary-700/50 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-400 transition-all duration-700" style={{ width: `${genPct}%` }} />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-orange-400"><Plug size={12} /> Load</span>
          <span className="font-mono font-bold text-white">{load.toFixed(1)} MW</span>
        </div>
        <div className="h-2 rounded-full bg-primary-700/50 overflow-hidden">
          <div className="h-full rounded-full bg-orange-400 transition-all duration-700" style={{ width: `${loadPct}%` }} />
        </div>
      </div>
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold border ${
        balanced
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-yellow-500/10 border-yellow-500/20 text-accent-500'
      }`}>
        <span>Imbalance</span>
        <span className="font-mono">{imbalance > 0 ? '+' : ''}{imbalance.toFixed(1)} MW</span>
      </div>
    </div>
  );
};

const Diagnostics = () => {
  const navigate = useNavigate();
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const result = await apiService.runNetworkDiagnostics();
      setDiagnostics(result);
      setLastRun(new Date());
    } catch (error: any) {
      console.error('Error running diagnostics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runDiagnostics(); }, []);

  const statusConfig = {
    OK:      { border: 'border-emerald-500/30', iconBg: 'bg-emerald-500/20', icon: CheckCircle2, color: 'text-emerald-400', label: 'Healthy',  dot: 'bg-emerald-400' },
    WARNING: { border: 'border-yellow-500/30',  iconBg: 'bg-yellow-500/20',  icon: AlertTriangle, color: 'text-accent-500', label: 'Warning',  dot: 'bg-yellow-400' },
    ERROR:   { border: 'border-red-500/30',     iconBg: 'bg-red-500/20',     icon: XCircle,       color: 'text-red-400',    label: 'Critical', dot: 'bg-red-400' },
  };

  const cfg = diagnostics ? (statusConfig[diagnostics.status as keyof typeof statusConfig] ?? statusConfig.WARNING) : null;
  const hasIssues = (diagnostics?.errors?.length ?? 0) + (diagnostics?.warnings?.length ?? 0) > 0;

  return (
    <div className="space-y-6 animate-fade-in">

      <PageHeader
        icon={Activity}
        iconColor="text-purple-400"
        title="Network Diagnostics"
        subtitle={lastRun ? `Last run: ${lastRun.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}` : 'Comprehensive network health check'}
        actions={
          <>
            {hasIssues && (
              <button
                onClick={() => navigate('/data-fixer')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-800 hover:bg-primary-700 border border-primary-600/50 text-sm text-neutral-300 transition-all"
              >
                <Wrench size={15} className="text-accent-400" /> Fix Issues <ArrowRight size={13} className="text-neutral-500" />
              </button>
            )}
            <button
              onClick={runDiagnostics}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all disabled:opacity-50"
            >
              {loading ? <><Loader2 className="animate-spin" size={15} /> Running...</> : <><RefreshCw size={15} /> Run Diagnostics</>}
            </button>
          </>
        }
      />

      {/* Loading */}
      {loading && !diagnostics && (
        <div className="card py-20 text-center">
          <Loader2 size={40} className="text-accent-400 animate-spin mx-auto mb-4" />
          <p className="text-neutral-400">Running network analysis...</p>
        </div>
      )}

      {diagnostics && cfg && (
        <>
          {/* Status Banner */}
          <div className={`card overflow-hidden border ${cfg.border}`}>
            <div className="p-5 flex items-center gap-4">
              <div className={`p-3 rounded-xl ${cfg.iconBg}`}>
                <cfg.icon size={28} className={cfg.color} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-0.5">
                  <span className={`w-2 h-2 rounded-full ${cfg.dot} animate-pulse`} />
                  <h2 className="text-lg font-bold text-white">
                    {cfg.label} — {diagnostics.message}
                  </h2>
                </div>
                <p className="text-xs text-neutral-500">
                  {diagnostics.totalTriples.toLocaleString()} triples ·{' '}
                  {diagnostics.errors.length} error{diagnostics.errors.length !== 1 ? 's' : ''} ·{' '}
                  {diagnostics.warnings.length} warning{diagnostics.warnings.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-3 text-center">
                <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="text-2xl font-black text-red-400">{diagnostics.errors.length}</div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Errors</div>
                </div>
                <div className="px-4 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <div className="text-2xl font-black text-accent-500">{diagnostics.warnings.length}</div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Warnings</div>
                </div>
              </div>
            </div>
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            {/* Left: Stat cards + issues */}
            <div className="xl:col-span-2 space-y-6">

              {/* KPI row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Triples', value: diagnostics.totalTriples.toLocaleString(), icon: Database, color: 'text-accent-400', bg: 'bg-accent-500/10 border-accent-500/20' },
                  { label: 'Buses',   value: diagnostics.busCount,    icon: CircleDot, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
                  { label: 'Branches', value: diagnostics.branchCount, icon: Cable,    color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
                  { label: 'Generators', value: diagnostics.generatorCount, icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className={`p-4 rounded-xl border ${bg} bg-primary-800/20`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={15} className={color} />
                      <span className="text-xs text-neutral-400">{label}</span>
                    </div>
                    <div className={`text-2xl font-black ${color}`}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Errors */}
              {diagnostics.errors.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-red-500/20 bg-red-500/5 flex items-center gap-3">
                    <XCircle size={18} className="text-red-400" />
                    <h2 className="font-bold text-red-400">Critical Errors</h2>
                    <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                      {diagnostics.errors.length}
                    </span>
                  </div>
                  <div className="divide-y divide-primary-700/20">
                    {diagnostics.errors.map((error, i) => (
                      <div key={i} className="flex items-start gap-3 px-5 py-4 hover:bg-red-500/5 transition-colors">
                        <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-black font-mono bg-red-500/20 text-red-400 border border-red-500/30 mt-0.5">
                          {error.code}
                        </span>
                        <p className="text-sm text-neutral-300 leading-relaxed">{error.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {diagnostics.warnings.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-yellow-500/20 bg-yellow-500/5 flex items-center gap-3">
                    <AlertTriangle size={18} className="text-accent-500" />
                    <h2 className="font-bold text-accent-500">Warnings</h2>
                    <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500/20 text-accent-500 border border-yellow-500/30">
                      {diagnostics.warnings.length}
                    </span>
                  </div>
                  <div className="divide-y divide-primary-700/20">
                    {diagnostics.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-3 px-5 py-4 hover:bg-yellow-500/5 transition-colors">
                        <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-black font-mono bg-yellow-500/20 text-accent-500 border border-yellow-500/30 mt-0.5">
                          {w.code}
                        </span>
                        <p className="text-sm text-neutral-300 leading-relaxed">{w.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All clear */}
              {diagnostics.errors.length === 0 && diagnostics.warnings.length === 0 && (
                <div className="card py-12 text-center">
                  <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
                  <p className="text-white font-semibold mb-1">No issues detected</p>
                  <p className="text-sm text-neutral-400">Your CIM network data is consistent and complete.</p>
                </div>
              )}
            </div>

            {/* Right: Connectivity + Power balance */}
            <div className="space-y-6">

              {/* Connectivity ratios */}
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-primary-700/30 flex items-center gap-3">
                  <BarChart3 size={16} className="text-accent-400" />
                  <h3 className="font-bold text-white text-sm">Connectivity</h3>
                </div>
                <div className="p-5 space-y-5">
                  <RatioBar
                    label="Branches"
                    icon={Cable}
                    connected={diagnostics.connectedBranchCount}
                    total={diagnostics.branchCount}
                    color="text-blue-400"
                  />
                  <RatioBar
                    label="Generators"
                    icon={Zap}
                    connected={diagnostics.connectedGeneratorCount}
                    total={diagnostics.generatorCount}
                    color="text-emerald-400"
                  />
                  <RatioBar
                    label="Loads"
                    icon={Plug}
                    connected={diagnostics.connectedLoadCount}
                    total={diagnostics.loadCount}
                    color="text-orange-400"
                  />
                </div>
              </div>

              {/* Power balance */}
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-primary-700/30 flex items-center gap-3">
                  <Activity size={16} className="text-accent-400" />
                  <h3 className="font-bold text-white text-sm">Power Balance</h3>
                </div>
                <div className="p-5">
                  <PowerBalance gen={diagnostics.totalGenerationMw} load={diagnostics.totalLoadMw} />
                </div>
              </div>

              {/* Entity counts */}
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-primary-700/30 flex items-center gap-3">
                  <Database size={16} className="text-accent-400" />
                  <h3 className="font-bold text-white text-sm">Entities</h3>
                </div>
                <div className="divide-y divide-primary-700/20">
                  {[
                    { label: 'Buses',       count: diagnostics.busIds.length,       icon: CircleDot, color: 'text-violet-400' },
                    { label: 'Lines',       count: diagnostics.lineIds.length,       icon: Cable,     color: 'text-blue-400' },
                    { label: 'Generators',  count: diagnostics.generatorIds.length,  icon: Zap,       color: 'text-emerald-400' },
                    { label: 'Loads',       count: diagnostics.loadIds.length,       icon: Plug,      color: 'text-orange-400' },
                  ].map(({ label, count, icon: Icon, color }) => (
                    <div key={label} className="flex items-center justify-between px-5 py-3">
                      <span className="flex items-center gap-2 text-sm text-neutral-400">
                        <Icon size={14} className={color} /> {label}
                      </span>
                      <span className={`text-sm font-bold font-mono ${color}`}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA to Data Fixer */}
              {hasIssues && (
                <button
                  onClick={() => navigate('/data-fixer')}
                  className="w-full flex items-center gap-3 px-5 py-4 rounded-xl bg-accent-500/10 hover:bg-accent-500/20 border border-accent-500/30 hover:border-accent-500/50 transition-all text-left group"
                >
                  <Wrench size={20} className="text-accent-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">Fix detected issues</p>
                    <p className="text-xs text-neutral-400">Run automated SPARQL corrections</p>
                  </div>
                  <ArrowRight size={16} className="text-neutral-500 group-hover:text-accent-400 transition-colors" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Diagnostics;
