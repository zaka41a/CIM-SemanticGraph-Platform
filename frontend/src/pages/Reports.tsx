import { useState } from 'react';
import {
  FileText, Download, Loader2, Zap, BarChart3,
  Network, ShieldCheck, CheckCircle2, XCircle,
  AlertTriangle, Sparkles, Clock
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { apiService } from '@/services/api';

// ── Types ──────────────────────────────────────────────────────────────────

type ReportStatus = 'idle' | 'generating' | 'done' | 'error';

interface ReportState {
  status: ReportStatus;
  error?: string;
  generatedAt?: Date;
}

interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: 'accent' | 'blue' | 'emerald' | 'purple';
  aiNarrated: boolean;
  estimatedTime: string;
  generate: () => Promise<Blob>;
  filename: string;
}

// ── Color map ──────────────────────────────────────────────────────────────

const colorMap = {
  accent:  { bg: 'bg-accent-500/10',  border: 'border-accent-500/20',  icon: 'text-accent-400',  btn: 'bg-accent-500 hover:bg-accent-600',  badge: 'bg-accent-500/15 text-accent-300' },
  blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: 'text-blue-400',    btn: 'bg-blue-600 hover:bg-blue-700',      badge: 'bg-blue-500/15 text-blue-300' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'text-emerald-400', btn: 'bg-emerald-600 hover:bg-emerald-700', badge: 'bg-emerald-500/15 text-emerald-300' },
  purple:  { bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  icon: 'text-purple-400',  btn: 'bg-purple-600 hover:bg-purple-700',   badge: 'bg-purple-500/15 text-purple-300' },
};

// ── Report Card ────────────────────────────────────────────────────────────

const ReportCard = ({
  report,
  state,
  onGenerate,
}: {
  report: ReportDefinition;
  state: ReportState;
  onGenerate: () => void;
}) => {
  const c = colorMap[report.color];
  const Icon = report.icon;
  const isGenerating = state.status === 'generating';
  const isDone = state.status === 'done';
  const isError = state.status === 'error';

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-6 flex flex-col gap-5 transition-all duration-200 hover:shadow-lg hover:shadow-black/20`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg bg-primary-800/60`}>
            <Icon size={22} className={c.icon} />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">{report.title}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {report.aiNarrated && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 ${c.badge}`}>
                  <Sparkles size={9} /> AI-narrated
                </span>
              )}
              <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                <Clock size={9} /> ~{report.estimatedTime}
              </span>
            </div>
          </div>
        </div>

        {/* Status badge */}
        {isDone && (
          <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
            <CheckCircle2 size={12} /> Ready
          </span>
        )}
        {isError && (
          <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-full">
            <XCircle size={12} /> Failed
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-neutral-400 leading-relaxed">{report.description}</p>

      {/* Error message */}
      {isError && state.error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
          <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{state.error}</p>
        </div>
      )}

      {/* Success info */}
      {isDone && state.generatedAt && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <CheckCircle2 size={12} className="text-emerald-400" />
          Generated at {state.generatedAt.toLocaleTimeString()}
        </div>
      )}

      {/* Action button */}
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${c.btn}`}
      >
        {isGenerating ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Generating PDF…
          </>
        ) : isDone ? (
          <>
            <Download size={15} />
            Download Again
          </>
        ) : (
          <>
            <FileText size={15} />
            Generate PDF
          </>
        )}
      </button>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────

const Reports = () => {
  const [states, setStates] = useState<Record<string, ReportState>>({
    full:       { status: 'idle' },
    loadflow:   { status: 'idle' },
    statistics: { status: 'idle' },
    quality:    { status: 'idle' },
  });

  const reports: ReportDefinition[] = [
    {
      id: 'full',
      title: 'Full CIM Network Report',
      description:
        'Comprehensive PDF covering the entire knowledge graph: executive summary, network inventory (substations, lines, transformers, generators, loads), power flow analysis, and AI-generated recommendations.',
      icon: Network,
      color: 'accent',
      aiNarrated: true,
      estimatedTime: '30-60 s',
      filename: 'cim-full-report.pdf',
      generate: () => apiService.generateFullCIMReport(),
    },
    {
      id: 'loadflow',
      title: 'Load Flow Report',
      description:
        'Power flow results with convergence status, system statistics, voltage violations, overload branches, and per-bus voltage/angle data.',
      icon: Zap,
      color: 'blue',
      aiNarrated: true,
      estimatedTime: '15-30 s',
      filename: 'loadflow-report.pdf',
      generate: () => apiService.generateLoadFlowReport(),
    },
    {
      id: 'statistics',
      title: 'Network Statistics Report',
      description:
        'Equipment inventory counts, triple statistics, CIM class distribution, and knowledge graph health metrics.',
      icon: BarChart3,
      color: 'emerald',
      aiNarrated: false,
      estimatedTime: '5-10 s',
      filename: 'network-statistics-report.pdf',
      generate: () => apiService.generateNetworkStatisticsReport(),
    },
    {
      id: 'quality',
      title: 'Data Quality Report',
      description:
        'Automated scan for missing impedances, unconnected equipment, power balance issues, and bus injection inconsistencies - with fix recommendations.',
      icon: ShieldCheck,
      color: 'purple',
      aiNarrated: false,
      estimatedTime: '10-20 s',
      filename: 'data-quality-report.pdf',
      generate: () => apiService.generateDataQualityReport([]),
    },
  ];

  const handleGenerate = async (report: ReportDefinition) => {
    setStates(prev => ({ ...prev, [report.id]: { status: 'generating' } }));
    try {
      const blob = await report.generate();
      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = report.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStates(prev => ({
        ...prev,
        [report.id]: { status: 'done', generatedAt: new Date() },
      }));
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        err?.message ||
        'Generation failed. Make sure the backend is running and CIM data is imported.';
      setStates(prev => ({ ...prev, [report.id]: { status: 'error', error: message } }));
    }
  };

  const anyGenerating = Object.values(states).some(s => s.status === 'generating');

  return (
    <div className="space-y-6 animate-fade-in">

      <PageHeader
        icon={FileText}
        iconColor="text-accent-400"
        title="Reports"
        subtitle="Generate PDF reports from your CIM knowledge graph"
        actions={anyGenerating ? (
          <div className="flex items-center gap-2 text-xs text-accent-400 bg-accent-500/10 border border-accent-500/20 px-3 py-2 rounded-lg">
            <Loader2 size={13} className="animate-spin" /> Generating…
          </div>
        ) : undefined}
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-primary-800/50 border border-primary-700/40 rounded-xl px-4 py-3.5">
        <AlertTriangle size={15} className="text-yellow-400 mt-0.5 shrink-0" />
        <p className="text-xs text-neutral-400">
          <span className="text-white font-medium">Prerequisite:</span> CIM data must be imported before generating reports.
          AI-narrated reports require a configured <span className="text-accent-400">GROQ_API_KEY</span> or <span className="text-accent-400">CLAUDE_API_KEY</span> in the backend.
        </p>
      </div>

      {/* Report cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {reports.map(report => (
          <ReportCard
            key={report.id}
            report={report}
            state={states[report.id]}
            onGenerate={() => handleGenerate(report)}
          />
        ))}
      </div>

      {/* Tips */}
      <div className="rounded-xl border border-primary-700/40 bg-primary-800/30 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
          <Sparkles size={14} className="text-accent-400" /> Tips
        </h3>
        <ul className="space-y-1.5 text-xs text-neutral-500 list-disc list-inside">
          <li>The <span className="text-white">Full CIM Report</span> is the most comprehensive - it includes all other sections plus AI narrative.</li>
          <li>The <span className="text-white">Load Flow Report</span> runs a DC power flow automatically if no results are cached.</li>
          <li>The <span className="text-white">Data Quality Report</span> scans for the same issues as the Data Fixer page.</li>
          <li>PDFs download automatically to your browser's default download folder.</li>
        </ul>
      </div>
    </div>
  );
};

export default Reports;
