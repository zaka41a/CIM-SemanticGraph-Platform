import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle,
  Database, Zap, Loader2, RefreshCw,
  Cable, Plug, CircleDot, Wrench, ArrowRight, BarChart3,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import CollapsibleList from '@/components/ui/CollapsibleList';
import EmptyState from '@/components/ui/EmptyState';
import Metric from '@/components/ui/Metric';
import { Panel, PanelHeader, CountBadge } from '@/components/ui/Panel';
import { apiService } from '@/services/api';

interface DiagnosticIssue {
  code: string;
  message: string;
}

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
  errors: DiagnosticIssue[];
  warnings: DiagnosticIssue[];
}

/** Connected ratio for one equipment class. Colour reports health only. */
const RatioBar = ({
  label, icon: Icon, connected, total,
}: {
  label: string; icon: React.ElementType; connected: number; total: number;
}) => {
  const pct = total > 0 ? Math.round((connected / total) * 100) : 0;
  const bar = pct === 100 ? 'bg-emerald-400' : pct >= 70 ? 'bg-accent-400' : 'bg-red-400';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-neutral-400">
          <Icon size={13} className="text-neutral-500" /> {label}
        </span>
        <span className="tabular-nums font-semibold text-white">
          {connected}<span className="text-neutral-500">/{total}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-primary-800/60 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-[10px] text-neutral-500 tabular-nums">{pct}% connected</div>
    </div>
  );
};

const PowerBalance = ({ gen, load }: { gen: number; load: number }) => {
  const imbalance = gen - load;
  const max = Math.max(gen, load, 1);
  const balanced = Math.abs(imbalance) < 50;

  const Row = ({ label, icon: Icon, value }: { label: string; icon: React.ElementType; value: number }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-neutral-400">
          <Icon size={12} className="text-neutral-500" /> {label}
        </span>
        <span className="tabular-nums font-semibold text-white">{value.toFixed(1)} MW</span>
      </div>
      <div className="h-2 rounded-full bg-primary-800/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-sky-400/70 transition-all duration-500"
          style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Row label="Generation" icon={Zap} value={gen} />
      <Row label="Load" icon={Plug} value={load} />
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold border ${
        balanced
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
          : 'bg-accent-500/10 border-accent-500/20 text-accent-300'
      }`}>
        <span>Imbalance</span>
        <span className="tabular-nums">{imbalance > 0 ? '+' : ''}{imbalance.toFixed(1)} MW</span>
      </div>
    </div>
  );
};

const STATUS_CONFIG = {
  OK:      { icon: CheckCircle2,  color: 'text-emerald-400', ring: 'bg-emerald-500/10 border-emerald-500/25', label: 'Healthy' },
  WARNING: { icon: AlertTriangle, color: 'text-accent-400',  ring: 'bg-accent-500/10 border-accent-500/25',   label: 'Warning' },
  ERROR:   { icon: XCircle,       color: 'text-red-400',     ring: 'bg-red-500/10 border-red-500/25',         label: 'Critical' },
} as const;

const IssueRow = ({ issue, tone }: { issue: DiagnosticIssue; tone: 'critical' | 'warning' }) => (
  <div className="flex items-start gap-3 px-5 py-3.5">
    <span className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold border mt-0.5 ${
      tone === 'critical'
        ? 'bg-red-500/15 text-red-300 border-red-500/30'
        : 'bg-accent-500/15 text-accent-300 border-accent-500/30'
    }`}>
      {issue.code}
    </span>
    <p className="text-sm text-neutral-300 leading-relaxed">{issue.message}</p>
  </div>
);

const Diagnostics = () => {
  const navigate = useNavigate();
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiService.runNetworkDiagnostics();
      setDiagnostics(result);
      setLastRun(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runDiagnostics(); }, [runDiagnostics]);

  const cfg = diagnostics
    ? STATUS_CONFIG[diagnostics.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.WARNING
    : null;
  const errorCount = diagnostics?.errors?.length ?? 0;
  const warningCount = diagnostics?.warnings?.length ?? 0;
  const hasIssues = errorCount + warningCount > 0;

  return (
    <div className="space-y-6 animate-fade-in">

      <PageHeader
        icon={Activity}
        title="Network Diagnostics"
        subtitle={lastRun
          ? `Last run at ${lastRun.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          : 'Comprehensive network health check'}
        actions={
          <>
            {hasIssues && (
              <Button icon={Wrench} iconRight={ArrowRight} onClick={() => navigate('/data-fixer')}>
                Fix issues
              </Button>
            )}
            <Button variant="primary" icon={RefreshCw} loading={loading} onClick={runDiagnostics}>
              {loading ? 'Running' : 'Run diagnostics'}
            </Button>
          </>
        }
      />

      {loading && !diagnostics && (
        <Panel>
          <div className="py-20 text-center">
            <Loader2 size={32} className="text-accent-400 animate-spin mx-auto mb-4" />
            <p className="text-sm text-neutral-400">Running network analysis...</p>
          </div>
        </Panel>
      )}

      {diagnostics && cfg && (
        <>
          {/* Status banner */}
          <Panel>
            <div className="p-5 flex items-center gap-4">
              <div className={`p-3 rounded-xl border ${cfg.ring}`}>
                <cfg.icon size={24} className={cfg.color} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-white truncate">
                  {cfg.label} &middot; {diagnostics.message}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">
                  {diagnostics.totalTriples.toLocaleString('en-GB')} triples
                </p>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                  <div className={`text-xl font-bold tabular-nums ${errorCount > 0 ? 'text-red-400' : 'text-neutral-600'}`}>
                    {errorCount}
                  </div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Errors</div>
                </div>
                <div>
                  <div className={`text-xl font-bold tabular-nums ${warningCount > 0 ? 'text-accent-400' : 'text-neutral-600'}`}>
                    {warningCount}
                  </div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Warnings</div>
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            <div className="xl:col-span-2 space-y-6">

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Metric label="Triples" value={diagnostics.totalTriples.toLocaleString('en-GB')} icon={Database} emphasis="headline" />
                <Metric label="Buses" value={diagnostics.busCount} icon={CircleDot} />
                <Metric label="Branches" value={diagnostics.branchCount} icon={Cable} />
                <Metric label="Generators" value={diagnostics.generatorCount} icon={Zap} />
              </div>

              {errorCount > 0 && (
                <Panel>
                  <PanelHeader
                    icon={XCircle}
                    title="Critical errors"
                    tone="critical"
                    badge={<CountBadge value={errorCount} tone="critical" />}
                  />
                  <CollapsibleList
                    items={diagnostics.errors}
                    itemLabel="errors"
                    renderItem={(issue, i) => <IssueRow key={i} issue={issue} tone="critical" />}
                  />
                </Panel>
              )}

              {warningCount > 0 && (
                <Panel>
                  <PanelHeader
                    icon={AlertTriangle}
                    title="Warnings"
                    tone="warning"
                    badge={<CountBadge value={warningCount} tone="warning" />}
                  />
                  <CollapsibleList
                    items={diagnostics.warnings}
                    itemLabel="warnings"
                    renderItem={(issue, i) => <IssueRow key={i} issue={issue} tone="warning" />}
                  />
                </Panel>
              )}

              {!hasIssues && (
                <Panel>
                  <EmptyState
                    icon={CheckCircle2}
                    tone="positive"
                    title="No issues detected"
                    hint="The CIM network data is consistent and complete."
                  />
                </Panel>
              )}
            </div>

            <div className="space-y-6">

              <Panel>
                <PanelHeader icon={BarChart3} title="Connectivity" />
                <div className="p-5 space-y-5">
                  <RatioBar label="Branches" icon={Cable} connected={diagnostics.connectedBranchCount} total={diagnostics.branchCount} />
                  <RatioBar label="Generators" icon={Zap} connected={diagnostics.connectedGeneratorCount} total={diagnostics.generatorCount} />
                  <RatioBar label="Loads" icon={Plug} connected={diagnostics.connectedLoadCount} total={diagnostics.loadCount} />
                </div>
              </Panel>

              <Panel>
                <PanelHeader icon={Activity} title="Power balance" />
                <div className="p-5">
                  <PowerBalance gen={diagnostics.totalGenerationMw} load={diagnostics.totalLoadMw} />
                </div>
              </Panel>

              <Panel>
                <PanelHeader icon={Database} title="Entities" />
                <div className="divide-y divide-primary-700/20">
                  {[
                    { label: 'Buses', count: diagnostics.busIds.length, icon: CircleDot },
                    { label: 'Lines', count: diagnostics.lineIds.length, icon: Cable },
                    { label: 'Generators', count: diagnostics.generatorIds.length, icon: Zap },
                    { label: 'Loads', count: diagnostics.loadIds.length, icon: Plug },
                  ].map(({ label, count, icon: Icon }) => (
                    <div key={label} className="flex items-center justify-between px-5 py-3">
                      <span className="flex items-center gap-2 text-sm text-neutral-400">
                        <Icon size={14} className="text-neutral-500" /> {label}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-white">{count}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              {hasIssues && (
                <Button
                  variant="primary"
                  fullWidth
                  icon={Wrench}
                  iconRight={ArrowRight}
                  onClick={() => navigate('/data-fixer')}
                  className="py-3"
                >
                  Run automated corrections
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Diagnostics;
