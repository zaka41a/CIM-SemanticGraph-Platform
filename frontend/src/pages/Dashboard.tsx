import { useState } from 'react';
import { Activity, Database, Zap, Network, TrendingUp, RefreshCw, Trash2, BarChart3, CheckCircle2, XCircle, X, AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { useStatistics } from '@/hooks/useStatistics';
import { apiService } from '@/services/api';
import GraphVisualization from '@/components/GraphVisualization';

// Success Modal Component
const SuccessModal = ({ isOpen, onClose, title, message }: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative bg-gradient-to-br from-primary-800 via-primary-900 to-primary-950 rounded-2xl border border-primary-600/30 shadow-2xl shadow-primary-500/10 max-w-md w-full mx-4 animate-slide-up overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-accent-500/20 rounded-full blur-3xl" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-white hover:bg-primary-700/50 rounded-lg transition-all duration-200"
        >
          <X size={20} />
        </button>

        <div className="relative p-8 text-center">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-accent-500 to-accent-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-accent-500/30 animate-bounce-subtle">
            <CheckCircle2 size={40} className="text-white" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>
          <p className="text-neutral-300 mb-6 leading-relaxed">{message}</p>

          <div className="w-16 h-1 bg-gradient-to-r from-accent-500 to-primary-500 rounded-full mx-auto mb-6" />

          <button
            onClick={onClose}
            className="px-8 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-400 hover:to-accent-500 text-white font-semibold rounded-xl shadow-lg shadow-accent-500/25 hover:shadow-accent-500/40 transition-all duration-300 transform hover:scale-105"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};

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

// Error Modal Component
const ErrorModal = ({ isOpen, onClose, message }: {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative bg-gradient-to-br from-primary-800 via-primary-900 to-primary-950 rounded-2xl border border-red-500/30 shadow-2xl max-w-md w-full mx-4 animate-slide-up overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-red-500/10 rounded-full blur-3xl" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-white hover:bg-primary-700/50 rounded-lg transition-all duration-200"
        >
          <X size={20} />
        </button>

        <div className="relative p-8 text-center">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-red-500/20 to-red-600/20 border-2 border-red-500/50 rounded-full flex items-center justify-center mb-6">
            <XCircle size={40} className="text-red-400" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">Error</h2>
          <p className="text-neutral-300 mb-6">{message}</p>

          <button
            onClick={onClose}
            className="px-8 py-3 bg-primary-700/50 hover:bg-primary-600/50 text-white font-medium rounded-xl border border-primary-600/50 transition-all duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { stats, loading, error, refresh } = useStatistics(true, 10000);
  const [clearing, setClearing] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleExportStatisticsPDF = async () => {
    setExportingPDF(true);
    try {
      const blob = await apiService.generateNetworkStatisticsReport();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `NetworkStatistics_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export PDF error:', err);
      setErrorMessage('Erreur lors de la g\u00e9n\u00e9ration du rapport PDF');
      setShowErrorModal(true);
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
      setShowSuccessModal(true);
    } catch (err: any) {
      setShowConfirmModal(false);
      setErrorMessage(err.message || 'Unknown error occurred');
      setShowErrorModal(true);
    } finally {
      setClearing(false);
    }
  };

  const statCards = [
    {
      title: 'Total Triples',
      value: stats?.totalTriples || 0,
      icon: Database,
      gradient: 'from-accent-500 to-accent-600',
      iconBg: 'bg-accent-500/20',
    },
    {
      title: 'Substations',
      value: stats?.substations || 0,
      icon: Network,
      gradient: 'from-accent-500 to-accent-600',
      iconBg: 'bg-accent-500/20',
    },
    {
      title: 'Generators',
      value: stats?.generators || 0,
      icon: Zap,
      gradient: 'from-emerald-500 to-emerald-600',
      iconBg: 'bg-emerald-500/20',
    },
    {
      title: 'Transmission Lines',
      value: stats?.transmissionLines || 0,
      icon: TrendingUp,
      gradient: 'from-accent-500 to-accent-600',
      iconBg: 'bg-accent-500/20',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800/50 via-primary-900/50 to-primary-950/50 p-8 border border-primary-700/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl shadow-lg shadow-accent-500/20">
                <BarChart3 size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">Dashboard</h1>
                <p className="text-neutral-300">
                  Real-time overview of your CIM Knowledge Graph
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleExportStatisticsPDF}
                disabled={exportingPDF || loading}
                className="px-4 py-2 bg-primary-700/50 hover:bg-primary-600/50 text-neutral-300 hover:text-white rounded-xl flex items-center gap-2 text-sm font-medium border border-primary-600/50 hover:border-accent-500/30 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportingPDF ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                {exportingPDF ? 'Generating...' : 'Export PDF'}
              </button>
              <button
                onClick={refresh}
                disabled={loading}
                className="px-4 py-2 bg-primary-700/50 hover:bg-primary-600/50 text-neutral-300 hover:text-white rounded-xl flex items-center gap-2 text-sm font-medium border border-primary-600/50 hover:border-accent-500/30 transition-all duration-300 active:scale-[0.98]"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={handleClearGraph}
                disabled={clearing || loading}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-xl flex items-center gap-2 text-sm font-medium border border-red-500/30 hover:border-red-500/50 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={18} />
                Clear Graph
              </button>
            </div>
          </div>
        </div>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      {stats && (
        <div className="card">
          <GraphVisualization />
        </div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmClearGraph}
        loading={clearing}
      />

      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="Graph Cleared Successfully"
        message="The Knowledge Graph has been cleared. All triples, relationships, and imported CIM data have been permanently removed."
      />

      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={errorMessage}
      />
    </div>
  );
};

export default Dashboard;
