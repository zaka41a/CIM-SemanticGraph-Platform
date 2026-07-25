import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Database, Zap, Network, TrendingUp, RefreshCw, Trash2, AlertTriangle, FileText, Loader2, Search, Cpu, GitBranch, Layers, RotateCcw, Home, LayoutDashboard } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { StatCard } from '@/components/dashboard/StatCard';
import { useStatistics } from '@/hooks/useStatistics';
import { apiService } from '@/services/api';
import GraphVisualization from '@/components/GraphVisualization';
import PageHeader from '@/components/PageHeader';

// Confirmation Modal Component
const ConfirmModal = ({ isOpen, onClose, onConfirm, loading }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative bg-gradient-to-br from-primary-800 via-primary-900 to-primary-950 rounded-2xl border border-red-500/30 shadow-2xl shadow-red-500/10 max-w-lg w-full mx-4 animate-slide-up overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-red-500/10 rounded-full blur-3xl" />

        <div className="relative p-8">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-red-500/20 to-orange-500/20 border-2 border-red-500/50 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle size={40} className="text-red-400" />
          </div>

          <h2 className="text-2xl font-bold text-white text-center mb-4">Clear Knowledge Graph</h2>

          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
            <p className="text-red-300 text-sm leading-relaxed">
              <strong className="text-red-400">Warning:</strong> This action will permanently delete all data from the CIM Knowledge Graph:
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-neutral-300">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                All triples and relationships
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                Imported CIM data
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                Graph statistics
              </li>
            </ul>
          </div>

          <p className="text-neutral-400 text-center text-sm mb-6">
            This action is <span className="text-red-400 font-semibold">irreversible</span> and cannot be undone.
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-primary-700/50 hover:bg-primary-600/50 text-neutral-300 hover:text-white font-medium rounded-xl border border-primary-600/50 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-semibold rounded-xl shadow-lg shadow-red-500/25 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 size={18} />
                  Yes, Clear All
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ServiceStatus {
  qdrantAvailable: boolean;
  indexedEntities: number;
  collectionName: string;
  status: string;
}

interface ExternalServicesHealth {
  pandapower: 'UP' | 'DOWN' | 'LOADING';
  pandapowerDetail: string;
  llm: 'UP' | 'DOWN' | 'LOADING';
  llmDetail: string;
}

const ServiceStatusCard = ({
  label, icon: Icon, status, detail, onAction, actionLabel, actionLoading
}: {
  label: string;
  icon: React.ElementType;
  status: 'UP' | 'DOWN' | 'LOADING';
  detail?: string;
  onAction?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
}) => (
  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary-800/40 border border-primary-700/30">
    <div className={`p-2 rounded-lg ${status === 'UP' ? 'bg-emerald-500/20' : status === 'DOWN' ? 'bg-red-500/20' : 'bg-neutral-500/20'}`}>
      <Icon size={16} className={status === 'UP' ? 'text-emerald-400' : status === 'DOWN' ? 'text-red-400' : 'text-neutral-400'} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-neutral-300">{label}</p>
      {detail && <p className="text-xs text-neutral-500 truncate">{detail}</p>}
    </div>
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status === 'UP' ? 'bg-emerald-400 animate-pulse' : status === 'DOWN' ? 'bg-red-400' : 'bg-neutral-400 animate-pulse'}`} />
      {onAction && (
        <button
          onClick={onAction}
          disabled={actionLoading}
          className="text-xs px-2 py-1 rounded-lg bg-accent-500/20 hover:bg-accent-500/30 text-accent-400 border border-accent-500/30 transition-all disabled:opacity-50"
        >
          {actionLoading ? <RotateCcw size={10} className="animate-spin" /> : actionLabel}
        </button>
      )}
    </div>
  </div>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const { stats, loading, error, refresh } = useStatistics(true, 10000);
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [clearing, setClearing] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [externalHealth, setExternalHealth] = useState<ExternalServicesHealth>({
    pandapower: 'LOADING',
    pandapowerDetail: 'Checking...',
    llm: 'LOADING',
    llmDetail: 'Checking...',
  });

  const fetchServiceStatus = useCallback(async () => {
    try {
      const data = await apiService.getIndexingStatus();
      setServiceStatus(data);
    } catch {
      setServiceStatus({ qdrantAvailable: false, indexedEntities: 0, collectionName: 'cim_entities', status: 'ERROR' });
    }
  }, []);

  const fetchExternalHealth = useCallback(async () => {
    // Pandapower
    try {
      const pf = await apiService.getPowerflowHealth();
      setExternalHealth(prev => ({
        ...prev,
        pandapower: pf.pandapowerAvailable ? 'UP' : 'DOWN',
        pandapowerDetail: pf.pandapowerAvailable
          ? 'Python power flow engine ready'
          : 'Pandapower unavailable - DC solver only',
      }));
    } catch {
      setExternalHealth(prev => ({ ...prev, pandapower: 'DOWN', pandapowerDetail: 'Service unreachable' }));
    }

    // LLM - proxy via system health
    try {
      const sys = await apiService.getSystemHealth();
      const llmUp = sys?.status === 'healthy' || sys?.status === 'degraded';
      setExternalHealth(prev => ({
        ...prev,
        llm: llmUp ? 'UP' : 'DOWN',
        llmDetail: llmUp ? 'GraphRAG & Agent ready' : 'LLM service unavailable',
      }));
    } catch {
      setExternalHealth(prev => ({ ...prev, llm: 'DOWN', llmDetail: 'Service unreachable' }));
    }
  }, []);

  useEffect(() => {
    fetchServiceStatus();
    fetchExternalHealth();
    const interval = setInterval(() => {
      fetchServiceStatus();
      fetchExternalHealth();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchServiceStatus, fetchExternalHealth]);

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const result = await apiService.reindexEntities();
      toastSuccess(result.message || 'Re-indexing started successfully');
      setTimeout(fetchServiceStatus, 3000);
    } catch (e: any) {
      toastError('Re-indexing failed: ' + (e.message || 'Unknown error'));
    } finally {
      setReindexing(false);
    }
  };

  const handleExportStatisticsPDF = async () => {
    setExportingPDF(true);
    toastInfo('Generating PDF report...');
    try {
      const blob = await apiService.generateFullCIMReport();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CIM_Full_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toastSuccess('PDF report downloaded successfully');
    } catch {
      toastError('Failed to generate the PDF report');
    } finally {
      setExportingPDF(false);
    }
  };

  const handleClearGraph = () => {
    setShowConfirmModal(true);
  };

  const confirmClearGraph = async () => {
    try {
      setClearing(true);
      await apiService.clearGraph();
      await refresh();

      window.dispatchEvent(new CustomEvent('cim_data_imported', {
        detail: { importType: 'clear', format: 'clear' }
      }));

      setShowConfirmModal(false);
      toastSuccess('Knowledge Graph cleared successfully');
    } catch (err: any) {
      setShowConfirmModal(false);
      toastError(err.message || 'Unknown error occurred');
    } finally {
      setClearing(false);
    }
  };

  // Restrained, semantic palette: amber = headline, sky = structural elements,
  // emerald = active/energised elements. No decorative rainbow.
  const AMBER   = { gradient: 'from-accent-500 to-accent-600',  iconBg: 'bg-accent-500/20',  iconColor: 'text-accent-300' };
  const SKY     = { gradient: 'from-sky-500 to-sky-600',        iconBg: 'bg-sky-500/20',      iconColor: 'text-sky-300' };
  const EMERALD = { gradient: 'from-emerald-500 to-emerald-600', iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-300' };
  const MUTED   = { gradient: 'from-neutral-500 to-neutral-600', iconBg: 'bg-neutral-500/20', iconColor: 'text-neutral-300' };

  const statCards = [
    { title: 'Total Triples',      value: stats?.totalTriples || 0,      icon: Database,   ...AMBER },
    { title: 'Substations',        value: stats?.substations || 0,       icon: Network,    ...SKY },
    { title: 'Generators',         value: stats?.generators || 0,        icon: Zap,        ...EMERALD },
    { title: 'Transmission Lines', value: stats?.transmissionLines || 0, icon: TrendingUp, ...SKY },
    { title: 'Transformers',       value: stats?.transformers || 0,      icon: GitBranch,  ...SKY },
    { title: 'Loads',              value: stats?.loads || 0,             icon: Cpu,        ...EMERALD },
    { title: 'Buses (Nodes)',      value: stats?.busbarSections || 0,    icon: Layers,     ...SKY },
    {
      title: 'Vector Indexed',
      value: serviceStatus?.indexedEntities || 0,
      icon: Search,
      ...(serviceStatus?.qdrantAvailable ? EMERALD : MUTED),
    },
  ];

  const isEmpty = !loading && !error && !!stats && (stats.totalTriples || 0) === 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={LayoutDashboard}
        iconColor="text-accent-400"
        title="Dashboard"
        subtitle="Real-time overview of your CIM Knowledge Graph"
        actions={
          <>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all"
            >
              <Home size={15} /> Home
            </button>
            <button
              onClick={handleExportStatisticsPDF}
              disabled={exportingPDF || loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all disabled:opacity-50"
            >
              {exportingPDF ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              {exportingPDF ? 'Generating...' : 'Export PDF'}
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={handleClearGraph}
              disabled={clearing || loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400 transition-all disabled:opacity-50"
            >
              <Trash2 size={15} /> Clear Graph
            </button>
          </>
        }
      />

      {error && (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 p-5 animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg flex-shrink-0">
              <Activity size={20} className="text-red-400" />
            </div>
            <div>
              <h4 className="font-semibold text-red-400 mb-1">Error Loading Dashboard</h4>
              <p className="text-sm text-red-300/90">{error}</p>
            </div>
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="relative overflow-hidden rounded-2xl border border-accent-500/20 bg-gradient-to-br from-primary-800/60 to-primary-900/60 p-6 animate-slide-up">
          <div className="absolute top-0 right-0 w-48 h-48 bg-accent-500/10 rounded-full blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="p-3 bg-accent-500/15 rounded-xl w-fit">
              <Database size={26} className="text-accent-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">Your Knowledge Graph is empty</h3>
              <p className="text-sm text-neutral-400 mt-1 max-w-xl">
                Import a CIM dataset (CIM/XML, RDF or an Excel network model) to populate the graph.
                Statistics, load-flow analysis and the GraphRAG assistant become available once data is loaded.
              </p>
            </div>
            <button
              onClick={() => navigate('/import')}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent-500 hover:bg-accent-400 text-primary-950 font-semibold rounded-xl transition-all whitespace-nowrap"
            >
              <FileText size={16} /> Import Data
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <StatCard key={card.title} {...card} loading={loading} />
        ))}
      </div>

      {/* Platform Services Status */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-primary-700/30 bg-gradient-to-r from-primary-800/50 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent-500/20 rounded-lg">
                <Activity size={18} className="text-accent-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Platform Services</h3>
                <p className="text-xs text-neutral-400">Real-time service health monitoring</p>
              </div>
            </div>
            <button
              onClick={fetchServiceStatus}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary-700/50 hover:bg-primary-600/50 text-neutral-400 hover:text-white border border-primary-600/40 transition-all flex items-center gap-1.5"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ServiceStatusCard
            label="Apache Fuseki (RDF Store)"
            icon={Database}
            status={stats ? 'UP' : loading ? 'LOADING' : 'DOWN'}
            detail={stats ? `${(stats.totalTriples || 0).toLocaleString()} triples stored` : 'Connecting...'}
          />
          <ServiceStatusCard
            label="Qdrant (Vector DB)"
            icon={Search}
            status={serviceStatus === null ? 'LOADING' : serviceStatus.qdrantAvailable ? 'UP' : 'DOWN'}
            detail={serviceStatus?.qdrantAvailable
              ? `${serviceStatus.indexedEntities.toLocaleString()} entities indexed`
              : 'Vector search unavailable'}
            onAction={serviceStatus?.qdrantAvailable ? handleReindex : undefined}
            actionLabel="Re-index"
            actionLoading={reindexing}
          />
          <ServiceStatusCard
            label="Pandapower (Load Flow)"
            icon={Zap}
            status={externalHealth.pandapower}
            detail={externalHealth.pandapowerDetail}
          />
          <ServiceStatusCard
            label="Claude / Groq (LLM)"
            icon={Cpu}
            status={externalHealth.llm}
            detail={externalHealth.llmDetail}
          />
        </div>
      </div>

      {stats && (stats.totalTriples || 0) > 0 && (
        <div className="card">
          <GraphVisualization />
        </div>
      )}

      {/* Confirm modal (destructive action - kept as modal intentionally) */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmClearGraph}
        loading={clearing}
      />
    </div>
  );
};

export default Dashboard;
