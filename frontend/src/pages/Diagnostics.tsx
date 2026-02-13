import { useState, useEffect } from 'react';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle,
  Database, Zap, Loader2, RefreshCw, TrendingUp,
  AlertCircle, Info, BarChart3, Network, Cable, Plug, CircleDot
} from 'lucide-react';
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

const Diagnostics = () => {
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

  useEffect(() => {
    runDiagnostics();
  }, []);

  const getStatusBanner = (status: string) => {
    switch (status) {
      case 'OK': return { bg: 'from-emerald-500/10 to-green-500/5', border: 'border-emerald-500/30', icon: CheckCircle2, color: 'text-emerald-400', label: 'Healthy' };
      case 'WARNING': return { bg: 'from-yellow-500/10 to-amber-500/5', border: 'border-yellow-500/30', icon: AlertTriangle, color: 'text-yellow-400', label: 'Warning' };
      case 'ERROR': return { bg: 'from-red-500/10 to-orange-500/5', border: 'border-red-500/30', icon: XCircle, color: 'text-red-400', label: 'Critical' };
      default: return { bg: 'from-primary-500/10 to-primary-500/5', border: 'border-primary-500/30', icon: Info, color: 'text-neutral-400', label: 'Unknown' };
    }
  };

  const banner = diagnostics ? getStatusBanner(diagnostics.status) : null;
  const StatusIcon = banner?.icon || Info;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800/50 via-primary-900/50 to-primary-950/50 p-8 border border-primary-700/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl shadow-lg shadow-accent-500/20">
              <Activity size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">Network Diagnostics</h1>
              <p className="text-neutral-300">
                Comprehensive network health check and issue identification
              </p>
            </div>
          </div>
          <button
            onClick={runDiagnostics}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white rounded-xl font-semibold shadow-lg shadow-accent-500/20 transition-all duration-200 hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>Running...</span>
              </>
            ) : (
              <>
                <RefreshCw size={20} />
                <span>Run Diagnostics</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Card */}
      {diagnostics && banner && (
        <div className={`rounded-2xl border ${banner.border} overflow-hidden bg-white/[0.03] backdrop-blur-xl`}>
          <div className={`p-6 bg-gradient-to-r ${banner.bg} border-b ${banner.border}`}>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${
                diagnostics.status === 'OK' ? 'bg-emerald-500/20' :
                diagnostics.status === 'WARNING' ? 'bg-yellow-500/20' :
                'bg-red-500/20'
              }`}>
                <StatusIcon size={32} className={banner.color} />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-1">
                  Network Status: <span className={banner.color}>{banner.label}</span>
                </h2>
                <p className="text-neutral-300">{diagnostics.message}</p>
                {lastRun && (
                  <p className="text-xs text-neutral-500 mt-2">
                    Last run: {lastRun.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Statistics Grid */}
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-primary-800/30 rounded-xl border border-accent-500/20 hover:border-accent-500/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-accent-500/20 rounded-lg">
                    <Database size={18} className="text-accent-400" />
                  </div>
                  <span className="text-sm text-neutral-400">Total Triples</span>
                </div>
                <div className="text-2xl font-bold text-accent-400">
                  {diagnostics.totalTriples.toLocaleString()}
                </div>
              </div>

              <div className="p-4 bg-primary-800/30 rounded-xl border border-accent-500/20 hover:border-accent-500/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-accent-500/20 rounded-lg">
                    <CircleDot size={18} className="text-accent-400" />
                  </div>
                  <span className="text-sm text-neutral-400">Buses</span>
                </div>
                <div className="text-2xl font-bold text-accent-400">
                  {diagnostics.busCount}
                </div>
              </div>

              <div className="p-4 bg-primary-800/30 rounded-xl border border-accent-500/20 hover:border-accent-500/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-accent-500/20 rounded-lg">
                    <Cable size={18} className="text-accent-400" />
                  </div>
                  <span className="text-sm text-neutral-400">Branches</span>
                </div>
                <div className="text-2xl font-bold text-accent-400">
                  {diagnostics.branchCount}
                  {diagnostics.branchCount > 0 && (
                    <span className="text-sm text-neutral-500 ml-1 font-normal">
                      ({diagnostics.connectedBranchCount} connected)
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 bg-primary-800/30 rounded-xl border border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                    <TrendingUp size={18} className="text-emerald-400" />
                  </div>
                  <span className="text-sm text-neutral-400">Generation</span>
                </div>
                <div className="text-2xl font-bold text-emerald-400">
                  {diagnostics.totalGenerationMw.toFixed(1)} MW
                </div>
              </div>
            </div>

            {/* Detailed Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative overflow-hidden rounded-xl bg-primary-800/30 border border-primary-700/30">
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <BarChart3 size={20} className="text-accent-400" />
                    Network Components
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-primary-700/20">
                      <div className="flex items-center gap-2">
                        <div className="p-1 bg-emerald-500/10 rounded"><Zap size={14} className="text-emerald-400" /></div>
                        <span className="text-neutral-400">Generators</span>
                      </div>
                      <span className="text-white font-medium">
                        {diagnostics.generatorCount}
                        <span className="text-neutral-500 ml-1">({diagnostics.connectedGeneratorCount} connected)</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-primary-700/20">
                      <div className="flex items-center gap-2">
                        <div className="p-1 bg-accent-500/10 rounded"><Plug size={14} className="text-accent-400" /></div>
                        <span className="text-neutral-400">Loads</span>
                      </div>
                      <span className="text-white font-medium">
                        {diagnostics.loadCount}
                        <span className="text-neutral-500 ml-1">({diagnostics.connectedLoadCount} connected)</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1 bg-accent-500/10 rounded"><TrendingUp size={14} className="text-accent-400" /></div>
                        <span className="text-neutral-400">Total Load</span>
                      </div>
                      <span className="text-white font-semibold">
                        {diagnostics.totalLoadMw.toFixed(2)} MW
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl bg-primary-800/30 border border-primary-700/30">
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <AlertCircle size={20} className="text-yellow-400" />
                    Issues
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                      <div className="flex items-center gap-2">
                        <XCircle size={18} className="text-red-400" />
                        <span className="text-sm text-neutral-300">Errors</span>
                      </div>
                      <span className="text-xl font-bold text-red-400">{diagnostics.errors.length}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-yellow-500/5 rounded-lg border border-yellow-500/20">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-yellow-400" />
                        <span className="text-sm text-neutral-300">Warnings</span>
                      </div>
                      <span className="text-xl font-bold text-yellow-400">{diagnostics.warnings.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Errors */}
      {diagnostics && diagnostics.errors.length > 0 && (
        <div className="card relative overflow-hidden">
          <div className="p-6 border-b border-red-500/20 bg-red-500/5">
            <h2 className="text-xl font-bold text-red-400 flex items-center gap-2">
              <XCircle size={24} />
              Critical Errors
              <span className="ml-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                {diagnostics.errors.length}
              </span>
            </h2>
          </div>
          <div className="p-6 space-y-3">
            {diagnostics.errors.map((error, index) => (
              <div
                key={index}
                className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl hover:bg-red-500/10 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-500/20 rounded-lg flex-shrink-0">
                    <XCircle size={18} className="text-red-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-red-300 mb-1">{error.code}</div>
                    <div className="text-sm text-neutral-300 leading-relaxed">{error.message}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {diagnostics && diagnostics.warnings.length > 0 && (
        <div className="card relative overflow-hidden">
          <div className="p-6 border-b border-yellow-500/20 bg-yellow-500/5">
            <h2 className="text-xl font-bold text-yellow-400 flex items-center gap-2">
              <AlertTriangle size={24} />
              Warnings
              <span className="ml-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                {diagnostics.warnings.length}
              </span>
            </h2>
          </div>
          <div className="p-6 space-y-3">
            {diagnostics.warnings.map((warning, index) => (
              <div
                key={index}
                className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl hover:bg-yellow-500/10 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-yellow-500/20 rounded-lg flex-shrink-0">
                    <AlertTriangle size={18} className="text-yellow-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-yellow-300 mb-1">{warning.code}</div>
                    <div className="text-sm text-neutral-300 leading-relaxed">{warning.message}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Network Details */}
      {diagnostics && (
        <div className="card relative overflow-hidden">
          <div className="p-6 border-b border-primary-700/30 bg-gradient-to-r from-primary-800/30 to-transparent">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent-500/20 rounded-lg">
                <Network size={20} className="text-accent-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Network Details</h2>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { title: 'Buses', ids: diagnostics.busIds, icon: CircleDot },
                { title: 'Lines', ids: diagnostics.lineIds, icon: Cable },
                { title: 'Generators', ids: diagnostics.generatorIds, icon: Zap },
                { title: 'Loads', ids: diagnostics.loadIds, icon: Plug },
              ].map(({ title, ids, icon: Icon }) => {
                const c = { badge: 'bg-accent-500/20 text-accent-400 border-accent-500/30', iconBg: 'bg-accent-500/10', iconText: 'text-accent-400' };
                return (
                  <div key={title}>
                    <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                      <div className={`p-1.5 ${c.iconBg} rounded-lg`}>
                        <Icon size={16} className={c.iconText} />
                      </div>
                      {title}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.badge} border`}>
                        {ids.length}
                      </span>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {ids.slice(0, 10).map((id, index) => (
                        <span
                          key={index}
                          className="px-3 py-1.5 bg-primary-800/40 text-neutral-300 rounded-lg text-xs font-mono border border-primary-700/30 hover:border-accent-500/30 transition-colors"
                        >
                          {id}
                        </span>
                      ))}
                      {ids.length > 10 && (
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${c.badge} border`}>
                          +{ids.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Diagnostics;
