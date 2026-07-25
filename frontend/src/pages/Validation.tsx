import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, AlertTriangle, CheckCircle, XCircle, Loader2, RefreshCw,
  Info, FileWarning, Clock, Hash, ChevronDown, ChevronRight,
  Copy, Check, Download, Search, Filter, MessageSquare,
  BarChart3, History, X, Layers, Wrench,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { apiService } from '@/services/api';
import { storageGet, storageSet } from '@/utils/storage';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Violation {
  path: string;
  message: string;
  severity: string;
  focusNode: string | null;
  value: string | null;
}

interface ValidationResult {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  violations: Violation[];
  triplesValidated: number;
  executionTimeMs: number;
  message: string;
}

interface HistoryEntry {
  timestamp: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  triplesValidated: number;
  score: number;
}

const HISTORY_KEY = 'shacl-validation-history';
const MAX_HISTORY = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────
function severityRank(s: string) {
  const u = s.toUpperCase();
  if (u === 'ERROR' || u === 'VIOLATION') return 0;
  if (u === 'WARNING') return 1;
  return 2;
}

function computeScore(result: ValidationResult): number {
  if (result.errorCount === 0 && result.warningCount === 0) return 100;
  const errorPenalty = result.errorCount * 25;
  const warnPenalty = result.warningCount * 5;
  return Math.max(0, Math.min(99, 100 - errorPenalty - warnPenalty));
}

function shortPath(path: string): string {
  return path.split(/[/#]/).pop() ?? path;
}

function shortNode(node: string | null): string {
  if (!node) return '';
  return node.split(/[/#]/).pop() ?? node;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Compliance Gauge ───────────────────────────────────────────────────────────
const ComplianceGauge = ({ score, onAccent = false }: { score: number; onAccent?: boolean }) => {
  const r = 52;
  const circumference = Math.PI * r; // half circle
  const offset = circumference * (1 - score / 100);
  const color = onAccent ? 'white' : score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';
  const label = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Poor';

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="80" viewBox="0 0 140 80">
        {/* Track */}
        <path
          d="M 14 74 A 56 56 0 0 1 126 74"
          fill="none"
          stroke={onAccent ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)'}
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d="M 14 74 A 56 56 0 0 1 126 74"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease', filter: `drop-shadow(0 0 6px ${color}80)` }}
        />
        {/* Score text */}
        <text x="70" y="62" textAnchor="middle" fill="white" fontSize="22" fontWeight="900" fontFamily="monospace">
          {score}%
        </text>
      </svg>
      <span className="text-xs font-semibold mt-1" style={{ color }}>{label}</span>
      <span className={`text-[10px] mt-0.5 ${onAccent ? 'text-white/70' : 'text-neutral-500'}`}>Compliance Score</span>
    </div>
  );
};

// ── Loading Stepper ────────────────────────────────────────────────────────────
const LOADING_STEPS = [
  'Connecting to Fuseki SPARQL endpoint…',
  'Loading SHACL shapes…',
  'Validating triples against constraints…',
  'Checking cardinality rules…',
  'Aggregating results…',
];

const LoadingStepper = () => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep(s => Math.min(s + 1, LOADING_STEPS.length - 1)), 900);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="card py-16 text-center space-y-6">
      <div className="relative mx-auto w-14 h-14">
        <div className="absolute inset-0 rounded-full border-2 border-accent-500/20" />
        <div className="absolute inset-0 rounded-full border-2 border-t-accent-500 animate-spin" />
        <ShieldCheck size={22} className="absolute inset-0 m-auto text-accent-400" />
      </div>
      <div className="space-y-2">
        {LOADING_STEPS.map((s, i) => (
          <div key={i} className={`flex items-center justify-center gap-2 text-xs transition-all duration-300 ${i <= step ? 'opacity-100' : 'opacity-20'}`}>
            {i < step
              ? <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />
              : i === step
              ? <Loader2 size={12} className="text-accent-400 animate-spin flex-shrink-0" />
              : <div className="w-3 h-3 rounded-full border border-neutral-700 flex-shrink-0" />}
            <span className={i === step ? 'text-white' : i < step ? 'text-emerald-400' : 'text-neutral-600'}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Violation Item ─────────────────────────────────────────────────────────────
const SEV_STYLE: Record<string, { cls: string; icon: React.ReactNode }> = {
  ERROR:     { cls: 'text-red-400 bg-red-500/10 border-red-500/30',      icon: <XCircle size={14} /> },
  VIOLATION: { cls: 'text-red-400 bg-red-500/10 border-red-500/30',      icon: <XCircle size={14} /> },
  WARNING:   { cls: 'text-accent-500 bg-yellow-500/10 border-yellow-500/30', icon: <AlertTriangle size={14} /> },
  INFO:      { cls: 'text-blue-400 bg-blue-500/10 border-blue-500/30',   icon: <Info size={14} /> },
};

const ViolationItem = ({
  violation, onAskClaude,
}: {
  violation: Violation;
  onAskClaude: (msg: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const key = violation.severity.toUpperCase();
  const s = SEV_STYLE[key] ?? SEV_STYLE.INFO;

  const handleCopy = () => {
    const text = `[${violation.severity}] ${violation.path}\n${violation.message}${violation.focusNode ? `\nNode: ${violation.focusNode}` : ''}${violation.value ? `\nValue: ${violation.value}` : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-b border-primary-700/20 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-primary-800/20 transition-colors text-left"
      >
        <div className={`p-1.5 rounded-lg border flex-shrink-0 mt-0.5 ${s.cls}`}>{s.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider border ${s.cls}`}>
              {violation.severity}
            </span>
            <span className="text-xs text-neutral-500 font-mono truncate">{shortPath(violation.path)}</span>
          </div>
          <p className="text-sm text-neutral-200 leading-snug">{violation.message}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <button
            onClick={e => { e.stopPropagation(); handleCopy(); }}
            className="p-1.5 rounded-lg hover:bg-primary-700/60 transition-colors"
            title="Copy violation"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className="text-neutral-500 hover:text-white" />}
          </button>
          <button
            onClick={e => { e.stopPropagation(); onAskClaude(`How do I fix this SHACL violation: [${violation.severity}] path: ${violation.path} - ${violation.message}${violation.focusNode ? ` (node: ${shortNode(violation.focusNode)})` : ''}`); }}
            className="p-1.5 rounded-lg hover:bg-purple-500/20 transition-colors"
            title="Ask Claude"
          >
            <MessageSquare size={13} className="text-purple-400" />
          </button>
          {open ? <ChevronDown size={14} className="text-neutral-500" /> : <ChevronRight size={14} className="text-neutral-600" />}
        </div>
      </button>

      {open && (violation.focusNode || violation.value || violation.path) && (
        <div className="px-5 pb-4 pt-1 ml-10 space-y-1.5 animate-fade-in">
          {violation.path && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-neutral-600 w-16 flex-shrink-0">Path</span>
              <span className="font-mono text-accent-400 break-all">{violation.path}</span>
            </div>
          )}
          {violation.focusNode && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-neutral-600 w-16 flex-shrink-0">Node</span>
              <span className="font-mono text-neutral-300 break-all">{violation.focusNode}</span>
            </div>
          )}
          {violation.value && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-neutral-600 w-16 flex-shrink-0">Value</span>
              <span className="font-mono text-neutral-300 break-all">{violation.value}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main ───────────────────────────────────────────────────────────────────────
const Validation = () => {
  const navigate = useNavigate();
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [search, setSearch] = useState('');
  const [groupByPath, setGroupByPath] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => storageGet<HistoryEntry[]>(HISTORY_KEY) ?? []);

  // DataFixer cross-reference: show banner if DataFixer found issues
  const dataFixerIssues = useMemo(() => {
    const state = storageGet<{ issues: Array<{ category: string; count: number; severity: string }> }>(
      'cim-data-fixer-state',
      3_600_000, // 1 hour TTL
    );
    return state?.issues?.filter(i => i.severity === 'error' || i.severity === 'warning') ?? [];
  }, []);

  const saveHistory = (r: ValidationResult, score: number) => {
    const entry: HistoryEntry = {
      timestamp: new Date().toISOString(),
      valid: r.valid,
      errorCount: r.errorCount,
      warningCount: r.warningCount,
      triplesValidated: r.triplesValidated,
      score,
    };
    setHistory(prev => {
      const updated = [entry, ...prev].slice(0, MAX_HISTORY);
      storageSet(HISTORY_KEY, updated);
      return updated;
    });
  };

  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setError(null);
    setResult(null);
    setSeverityFilter('all');
    setSearch('');
    try {
      const response = await apiService.validateSHACL();
      setResult(response);
      saveHistory(response, computeScore(response));
    } catch (err: any) {
      setError(err.message || 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  }, []);

  // auto-run on mount
  useEffect(() => { handleValidate(); }, []);

  const score = result ? computeScore(result) : null;

  // Filtered violations
  const filtered = useMemo(() => {
    if (!result) return [];
    return result.violations
      .filter(v => {
        const key = v.severity.toUpperCase();
        if (severityFilter === 'error' && key !== 'ERROR' && key !== 'VIOLATION') return false;
        if (severityFilter === 'warning' && key !== 'WARNING') return false;
        if (severityFilter === 'info' && key !== 'INFO') return false;
        if (search) {
          const q = search.toLowerCase();
          return v.message.toLowerCase().includes(q) || v.path.toLowerCase().includes(q) || (v.focusNode ?? '').toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }, [result, severityFilter, search]);

  // Grouped by path
  const byPath = useMemo(() => {
    const map: Record<string, Violation[]> = {};
    for (const v of filtered) {
      const k = shortPath(v.path);
      if (!map[k]) map[k] = [];
      map[k].push(v);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  // Top 5 paths for bar chart
  const topPaths = useMemo(() => {
    if (!result) return [];
    const map: Record<string, number> = {};
    for (const v of result.violations) {
      const k = shortPath(v.path);
      map[k] = (map[k] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [result]);

  const maxPathCount = topPaths[0]?.[1] ?? 1;

  // Export
  const handleExportCSV = () => {
    if (!result) return;
    const rows = [
      ['Severity', 'Path', 'Message', 'FocusNode', 'Value'],
      ...result.violations.map(v => [v.severity, v.path, v.message, v.focusNode ?? '', v.value ?? '']),
    ];
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `shacl-violations-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `shacl-result-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleAskClaude = (msg: string) => {
    navigate('/graphrag', { state: { prefill: msg } });
  };

  const errorCount = result?.violations.filter(v => ['ERROR', 'VIOLATION'].includes(v.severity.toUpperCase())).length ?? 0;
  const warnCount  = result?.violations.filter(v => v.severity.toUpperCase() === 'WARNING').length ?? 0;
  const infoCount  = result?.violations.filter(v => v.severity.toUpperCase() === 'INFO').length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">

      <PageHeader
        icon={ShieldCheck}
        iconColor="text-emerald-400"
        title="SHACL Validation"
        subtitle="Validate your CIM Knowledge Graph against IEC 61970 SHACL constraints"
        actions={
          <>
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(h => !h)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-all ${showHistory ? 'bg-accent-500/20 border-accent-500/40 text-accent-400' : 'bg-primary-800 border-primary-600/50 text-neutral-300 hover:text-white'}`}
              >
                <History size={15} /> History ({history.length})
              </button>
            )}
            {result && (
              <>
                <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-800 hover:bg-primary-700 border border-primary-600/50 text-xs text-neutral-300 hover:text-white transition-all">
                  <Download size={13} /> CSV
                </button>
                <button onClick={handleExportJSON} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-800 hover:bg-primary-700 border border-primary-600/50 text-xs text-neutral-300 hover:text-white transition-all">
                  <Download size={13} /> JSON
                </button>
              </>
            )}
            <button
              onClick={handleValidate}
              disabled={isValidating}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all disabled:opacity-50"
            >
              {isValidating ? <><Loader2 className="animate-spin" size={15} /> Validating…</> : <><RefreshCw size={15} /> Run Validation</>}
            </button>
          </>
        }
      />

      {/* ── DataFixer cross-reference notice ──────────────────────────────── */}
      {dataFixerIssues.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm">
          <Wrench size={15} className="text-amber-400 flex-shrink-0" />
          <span className="text-amber-300 flex-1">
            <strong>DataFixer</strong> found {dataFixerIssues.reduce((s, i) => s + i.count, 0)} issues
            ({dataFixerIssues.map(i => i.category).join(', ')}) not covered by SHACL shapes.
            SHACL validates structural constraints; DataFixer checks domain-specific CIM rules.
          </span>
          <button
            onClick={() => navigate('/data-fixer')}
            className="flex-shrink-0 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors"
          >
            Open DataFixer
          </button>
        </div>
      )}

      {/* ── History panel ─────────────────────────────────────────────────── */}
      {showHistory && history.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-primary-700/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History size={16} className="text-accent-400" />
              <h3 className="font-bold text-white text-sm">Validation History</h3>
            </div>
            <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-primary-700/50 rounded-lg transition-colors">
              <X size={14} className="text-neutral-500" />
            </button>
          </div>
          <div className="divide-y divide-primary-700/20">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${h.valid ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-neutral-400">{relativeTime(h.timestamp)}</span>
                    <span className="text-neutral-600">·</span>
                    <span className="text-neutral-400">{h.triplesValidated.toLocaleString()} triples</span>
                    <span className="text-neutral-600">·</span>
                    <span className="text-red-400">{h.errorCount} errors</span>
                    <span className="text-neutral-600">·</span>
                    <span className="text-accent-500">{h.warningCount} warnings</span>
                  </div>
                </div>
                <span className={`text-sm font-black ${h.score >= 90 ? 'text-emerald-400' : h.score >= 70 ? 'text-accent-500' : 'text-red-400'}`}>
                  {h.score}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg flex-shrink-0"><XCircle size={20} className="text-red-400" /></div>
            <div>
              <h4 className="font-semibold text-red-400 mb-1">Validation Error</h4>
              <p className="text-sm text-red-300/90">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {isValidating && <LoadingStepper />}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {result && !isValidating && score !== null && (
        <div className="space-y-6">

          {/* Summary + gauge */}
          <div className={`card overflow-hidden border ${result.valid ? 'border-accent-500/50' : 'border-red-500/30'}`}>
            <div className={`p-6 border-b ${result.valid ? 'bg-accent-500/15 border-accent-500/30' : 'bg-gradient-to-r from-red-500/8 to-transparent border-red-500/20'}`}>
              <div className="flex items-center justify-between flex-wrap gap-6">
                {/* Status */}
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${result.valid ? 'bg-accent-500/20' : 'bg-red-500/20'}`}>
                    {result.valid ? <CheckCircle size={28} className="text-accent-400" /> : <AlertTriangle size={28} className="text-red-400" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {result.valid ? 'Validation Passed' : 'Validation Failed'}
                    </h3>
                    <p className={`text-sm mt-0.5 ${result.valid ? 'text-accent-400' : 'text-red-400'}`}>{result.message}</p>
                  </div>
                </div>
                {/* Gauge */}
                <ComplianceGauge score={score} onAccent={false} />
              </div>
            </div>

            {/* KPI row */}
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Triples', value: result.triplesValidated.toLocaleString(), icon: Hash, color: 'text-accent-400', bg: 'bg-accent-500/10 border-accent-500/20' },
                { label: 'Errors',  value: result.errorCount,   icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
                { label: 'Warnings', value: result.warningCount, icon: AlertTriangle, color: 'text-accent-500', bg: 'bg-yellow-500/10 border-yellow-500/20' },
                { label: 'Time',    value: formatMs(result.executionTimeMs), icon: Clock, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className={`p-4 rounded-xl border ${bg} text-center`}>
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Icon size={13} className={color} />
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{label}</span>
                  </div>
                  <div className={`text-2xl font-black ${color}`}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Top paths chart */}
          {topPaths.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-primary-700/30 flex items-center gap-2">
                <BarChart3 size={16} className="text-accent-400" />
                <h3 className="font-bold text-white text-sm">Top Violated Constraints</h3>
                <span className="ml-auto text-xs text-neutral-500">{topPaths.length} paths</span>
              </div>
              <div className="p-5 space-y-3">
                {topPaths.map(([path, count]) => (
                  <div key={path}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-mono text-neutral-300 truncate max-w-[70%]">{path}</span>
                      <span className="font-bold text-white ml-2">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-primary-700/50 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent-500 to-red-500 transition-all duration-700"
                        style={{ width: `${(count / maxPathCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Violations */}
          {result.violations.length > 0 && (
            <div className="card overflow-hidden">
              {/* Violations header */}
              <div className="px-5 py-4 border-b border-primary-700/30 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <FileWarning size={16} className="text-accent-500" />
                  <h3 className="font-bold text-white text-sm">Constraint Violations</h3>
                </div>

                {/* Severity filter */}
                <div className="flex gap-1 bg-primary-800/50 p-1 rounded-xl">
                  {[
                    { key: 'all',     label: `All ${result.violations.length}`,  color: '' },
                    { key: 'error',   label: `Errors ${errorCount}`,             color: 'bg-red-500' },
                    { key: 'warning', label: `Warnings ${warnCount}`,            color: 'bg-yellow-500' },
                    { key: 'info',    label: `Info ${infoCount}`,                color: 'bg-blue-500' },
                  ].map(({ key, label, color }) => (
                    <button
                      key={key}
                      onClick={() => setSeverityFilter(key as any)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        severityFilter === key
                          ? 'bg-primary-700 text-white shadow'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {color && <span className={`w-1.5 h-1.5 rounded-full ${color}`} />}
                      {label}
                    </button>
                  ))}
                </div>

                {/* Group toggle */}
                <button
                  onClick={() => setGroupByPath(g => !g)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${groupByPath ? 'bg-accent-500/20 border-accent-500/40 text-accent-400' : 'border-primary-700/40 text-neutral-400 hover:text-white'}`}
                >
                  <Layers size={12} />
                  Group by path
                </button>

                {/* Search */}
                <div className="relative ml-auto">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search violations…"
                    className="pl-8 pr-3 py-1.5 bg-primary-800/60 border border-primary-700/40 rounded-lg text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-accent-500/50 transition-all w-52"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                      <X size={11} className="text-neutral-500 hover:text-white" />
                    </button>
                  )}
                </div>
              </div>

              {/* Result count */}
              <div className="px-5 py-2 border-b border-primary-700/15 bg-primary-900/20">
                <span className="text-xs text-neutral-500">
                  {filtered.length} of {result.violations.length} violations
                  {search && ` matching "${search}"`}
                </span>
              </div>

              {/* Violations list */}
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-neutral-500">No violations match your filters</div>
              ) : groupByPath ? (
                byPath.map(([path, violations]) => (
                  <PathGroup key={path} path={path} violations={violations} onAskClaude={handleAskClaude} />
                ))
              ) : (
                filtered.map((v, i) => (
                  <ViolationItem key={i} violation={v} onAskClaude={handleAskClaude} />
                ))
              )}
            </div>
          )}

          {/* All clear */}
          {result.violations.length === 0 && (
            <div className="card py-14 text-center">
              <div className="w-16 h-16 bg-emerald-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                <CheckCircle size={32} className="text-emerald-400" />
              </div>
              <p className="text-xl font-bold text-white mb-1">No violations detected</p>
              <p className="text-sm text-neutral-400">Your CIM network fully complies with all SHACL constraints.</p>
            </div>
          )}
        </div>
      )}

      {/* ── About panel (always visible when no results yet) ──────────────── */}
      {!result && !isValidating && !error && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* About */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-primary-700/30 flex items-center gap-3">
              <div className="p-2 bg-accent-500/20 rounded-lg"><Info size={16} className="text-accent-400" /></div>
              <div>
                <h3 className="font-bold text-white text-sm">About SHACL</h3>
                <p className="text-[11px] text-neutral-500">Shapes Constraint Language · W3C Standard</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-neutral-300 leading-relaxed">
                SHACL validates RDF graphs against a set of conditions called <span className="text-accent-400 font-medium">shapes</span>.
                It ensures your CIM data conforms to IEC 61970/61968 requirements before running analysis.
              </p>
              <div className="space-y-2">
                {[
                  'Required properties are present',
                  'Property value types are correct',
                  'Cardinality constraints satisfied',
                  'Value ranges and formats valid',
                ].map(item => (
                  <div key={item} className="flex items-center gap-2 text-sm text-neutral-400">
                    <CheckCircle size={13} className="text-emerald-400 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CIM Constraints */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-primary-700/30 flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-lg"><ShieldCheck size={16} className="text-emerald-400" /></div>
              <div>
                <h3 className="font-bold text-white text-sm">CIM Constraints</h3>
                <p className="text-[11px] text-neutral-500">IEC 61970 shapes applied</p>
              </div>
            </div>
            <div className="divide-y divide-primary-700/20">
              {[
                { entity: 'Substation',    constraint: 'has name (IdentifiedObject.name)' },
                { entity: 'VoltageLevel',  constraint: 'has BaseVoltage reference' },
                { entity: 'Terminal',      constraint: 'has ConductingEquipment' },
                { entity: 'BaseVoltage',   constraint: 'nominalVoltage > 0' },
                { entity: 'GeneratingUnit', constraint: 'maxOperatingP defined' },
              ].map(({ entity, constraint }) => (
                <div key={entity} className="flex items-start gap-3 px-5 py-3">
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-accent-500/15 text-accent-400 border border-accent-500/20 flex-shrink-0 mt-0.5 whitespace-nowrap">
                    {entity}
                  </span>
                  <span className="text-xs text-neutral-400">{constraint}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Path Group (grouped view) ──────────────────────────────────────────────────
const PathGroup = ({
  path, violations, onAskClaude,
}: {
  path: string;
  violations: Violation[];
  onAskClaude: (msg: string) => void;
}) => {
  const [open, setOpen] = useState(true);
  const errorCount = violations.filter(v => ['ERROR', 'VIOLATION'].includes(v.severity.toUpperCase())).length;
  const warnCount  = violations.filter(v => v.severity.toUpperCase() === 'WARNING').length;

  return (
    <div className="border-b border-primary-700/20 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-primary-800/20 transition-colors text-left"
      >
        {open ? <ChevronDown size={14} className="text-neutral-500" /> : <ChevronRight size={14} className="text-neutral-600" />}
        <span className="font-mono text-sm font-semibold text-white flex-1 truncate">{path}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {errorCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/25">{errorCount} err</span>}
          {warnCount  > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-500/15 text-accent-500 border border-yellow-500/25">{warnCount} warn</span>}
          <span className="text-xs text-neutral-500">{violations.length} total</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-primary-700/15 bg-primary-900/20">
          {violations.map((v, i) => (
            <ViolationItem key={i} violation={v} onAskClaude={onAskClaude} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Validation;
