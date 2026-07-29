import { useState } from 'react';
import {
  FileText, Download, Loader2, Zap, BarChart3,
  Network, ShieldCheck, CheckCircle2, XCircle,
  AlertTriangle, Sparkles, Clock, History as HistoryIcon,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import CollapsibleList from '@/components/ui/CollapsibleList';
import EmptyState from '@/components/ui/EmptyState';
import { Panel, PanelHeader, CountBadge } from '@/components/ui/Panel';
import { apiService } from '@/services/api';
import { logActivity } from '@/utils/activityLog';
import { useActivityLog } from '@/hooks/useActivityLog';

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
  aiNarrated: boolean;
  estimatedTime: string;
  generate: () => Promise<Blob>;
  filename: string;
}

/**
 * One report card.
 *
 * Every card shares the same surface: reports are peers, so none of them earns a
 * colour of its own. Colour appears only to report the outcome of a generation.
 */
const ReportCard = ({
  report, state, onGenerate,
}: {
  report: ReportDefinition;
  state: ReportState;
  onGenerate: () => void;
}) => {
  const Icon = report.icon;
  const isGenerating = state.status === 'generating';
  const isDone = state.status === 'done';
  const isError = state.status === 'error';

  return (
    <Panel className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-lg bg-white/[0.04] border border-white/5 shrink-0">
            <Icon size={20} className="text-neutral-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-white text-sm">{report.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              {report.aiNarrated && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-accent-500/30 bg-accent-500/10 text-accent-300 flex items-center gap-1">
                  <Sparkles size={9} /> AI-narrated
                </span>
              )}
              <span className="text-[10px] text-neutral-500 flex items-center gap-1 tabular-nums">
                <Clock size={9} /> ~{report.estimatedTime}
              </span>
            </div>
          </div>
        </div>

        {isDone && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2 py-1 rounded shrink-0">
            <CheckCircle2 size={11} /> Ready
          </span>
        )}
        {isError && (
          <span className="flex items-center gap-1 text-[11px] text-red-300 bg-red-500/10 border border-red-500/25 px-2 py-1 rounded shrink-0">
            <XCircle size={11} /> Failed
          </span>
        )}
      </div>

      <p className="text-xs text-neutral-400 leading-relaxed flex-1">{report.description}</p>

      {isError && state.error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
          <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{state.error}</p>
        </div>
      )}

      {isDone && state.generatedAt && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <CheckCircle2 size={12} className="text-emerald-400" />
          Generated at {state.generatedAt.toLocaleTimeString('en-GB')}
        </div>
      )}

      <Button
        variant="secondary"
        fullWidth
        loading={isGenerating}
        icon={isDone ? Download : FileText}
        onClick={onGenerate}
        className="py-2.5"
      >
        {isGenerating ? 'Generating PDF' : isDone ? 'Download again' : 'Generate PDF'}
      </Button>
    </Panel>
  );
};

const Reports = () => {
  const [states, setStates] = useState<Record<string, ReportState>>({
    full: { status: 'idle' },
    loadflow: { status: 'idle' },
    statistics: { status: 'idle' },
    quality: { status: 'idle' },
  });

  const history = useActivityLog('report');

  const reports: ReportDefinition[] = [
    {
      id: 'full',
      title: 'Full CIM Network Report',
      description:
        'Comprehensive PDF covering the entire knowledge graph: executive summary, network inventory (substations, lines, transformers, generators, loads), power flow analysis, and AI-generated recommendations.',
      icon: Network,
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
      aiNarrated: false,
      estimatedTime: '5-10 s',
      filename: 'network-statistics-report.pdf',
      generate: () => apiService.generateNetworkStatisticsReport(),
    },
    {
      id: 'quality',
      title: 'Data Quality Report',
      description:
        'Automated scan for missing impedances, unconnected equipment, power balance issues, and bus injection inconsistencies, with fix recommendations.',
      icon: ShieldCheck,
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = report.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStates(prev => ({ ...prev, [report.id]: { status: 'done', generatedAt: new Date() } }));
      logActivity({
        service: 'report',
        action: report.title,
        status: 'success',
        detail: report.filename,
        meta: { size: `${Math.round(blob.size / 1024)} kB` },
      });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : '') ||
        'Generation failed. Make sure the backend is running and CIM data is imported.';

      setStates(prev => ({ ...prev, [report.id]: { status: 'error', error: message } }));
      logActivity({ service: 'report', action: report.title, status: 'error', detail: message });
    }
  };

  const anyGenerating = Object.values(states).some(s => s.status === 'generating');

  return (
    <div className="space-y-6 animate-fade-in">

      <PageHeader
        icon={FileText}
        title="Reports"
        subtitle="Generate PDF reports from the CIM knowledge graph"
        actions={anyGenerating ? (
          <div className="flex items-center gap-2 text-xs text-accent-300 bg-accent-500/10 border border-accent-500/20 px-3 py-2 rounded-lg">
            <Loader2 size={13} className="animate-spin" /> Generating
          </div>
        ) : undefined}
      />

      <div className="flex items-start gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3.5">
        <AlertTriangle size={15} className="text-accent-400 mt-0.5 shrink-0" />
        <p className="text-xs text-neutral-400">
          <span className="text-white font-medium">Prerequisite:</span> CIM data must be imported before generating reports.
          AI-narrated reports need a configured LLM key in the backend.
        </p>
      </div>

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

      <Panel>
        <PanelHeader
          icon={HistoryIcon}
          title="Generated reports"
          badge={history.length > 0 ? <CountBadge value={history.length} /> : undefined}
        />
        {history.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="No report generated yet"
            hint="Every generation is recorded locally so the session is not lost on reload."
          />
        ) : (
          <CollapsibleList
            items={history}
            itemLabel="entries"
            renderItem={entry => (
              <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                {entry.status === 'success'
                  ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  : <XCircle size={14} className="text-red-400 shrink-0" />}
                <span className="text-sm text-neutral-300 truncate flex-1">{entry.action}</span>
                {entry.meta?.size && (
                  <span className="text-[11px] text-neutral-500 tabular-nums">{entry.meta.size}</span>
                )}
                <span className="text-[11px] text-neutral-500 tabular-nums shrink-0">
                  {new Date(entry.timestamp).toLocaleString('en-GB', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            )}
          />
        )}
      </Panel>
    </div>
  );
};

export default Reports;
