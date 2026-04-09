import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench, AlertTriangle, CheckCircle, Zap,
  PlayCircle, XCircle, Activity, FileText, Loader2,
  Search, Cable, Gauge, Network, ArrowRight, RotateCcw,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import api from '@/services/api';
import { storageGet, storageSet, storageRemove } from '@/utils/storage';

interface ValidationIssue {
  category: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  count: number;
  affectedItems: string[];
  suggestedFix?: string;
}

interface FixAction {
  id: string;
  category: string;
  description: string;
  status: 'pending' | 'applying' | 'done' | 'error';
  details?: string;
  sparqlQuery: string;
  affectedCount: number;
}

const STORAGE_KEY = 'cim-data-fixer-state';

const ANALYSIS_STEPS = [
  { label: 'Line impedances',  icon: Cable },
  { label: 'Thermal ratings',  icon: Gauge },
  { label: 'Connectivity',     icon: Network },
  { label: 'Power balance',    icon: Activity },
  { label: 'Bus injections',   icon: Search },
];

const SEV_CONFIG = {
  error:   { label: 'ERROR',   text: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    badge: 'bg-red-500/20 text-red-300 border-red-500/30' },
  warning: { label: 'WARNING', text: 'text-accent-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  info:    { label: 'INFO',    text: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
};

const FIX_STATUS = {
  pending:  { bg: 'bg-primary-800/30', border: 'border-primary-700/40' },
  applying: { bg: 'bg-accent-500/5',   border: 'border-accent-500/30' },
  done:     { bg: 'bg-emerald-500/5',  border: 'border-emerald-500/30' },
  error:    { bg: 'bg-red-500/5',      border: 'border-red-500/30' },
};

const DataFixer = () => {
  const navigate = useNavigate();

  const saved = storageGet<{ issues: ValidationIssue[]; fixes: FixAction[]; analysisComplete: boolean }>(
    STORAGE_KEY, 3_600_000,
  );
  const [issues, setIssues]                     = useState<ValidationIssue[]>(saved?.issues || []);
  const [fixes, setFixes]                       = useState<FixAction[]>(saved?.fixes || []);
  const [analyzing, setAnalyzing]               = useState(false);
  const [applying, setApplying]                 = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState<boolean>(saved?.analysisComplete || false);
  const [analysisStep, setAnalysisStep]         = useState(0);

  useEffect(() => {
    if (analysisComplete) {
      storageSet(STORAGE_KEY, { issues, fixes, analysisComplete });
    }
  }, [issues, fixes, analysisComplete]);

  const analyzeNetwork = async () => {
    setAnalyzing(true);
    setIssues([]);
    setFixes([]);
    setAnalysisComplete(false);
    setAnalysisStep(0);

    try {
      setAnalysisStep(0); const impedanceResult   = await checkMissingImpedances();
      setAnalysisStep(1); const ratingResult       = await checkMissingRatings();
      setAnalysisStep(2); const connectionResult   = await checkUnconnectedLines();
      setAnalysisStep(3); const balanceResult      = await checkPowerBalance();
      setAnalysisStep(4); const busInjectionResult = await checkBusInjections();

      const detectedIssues: ValidationIssue[] = [];
      const proposedFixes: FixAction[] = [];

      if (impedanceResult.count > 0) {
        detectedIssues.push({
          category: 'Line Impedances', severity: 'error',
          message: `${impedanceResult.count} lines missing impedance values (r, x)`,
          count: impedanceResult.count, affectedItems: impedanceResult.items,
          suggestedFix: 'Add typical impedance values based on voltage level',
        });
        proposedFixes.push({
          id: 'fix-impedances', category: 'Line Impedances', status: 'pending',
          description: `Add impedance values to ${impedanceResult.count} lines`,
          details: 'r = 0.02 Ω/km · x = 0.06 Ω/km · bch = 0.0001 · gch = 0',
          affectedCount: impedanceResult.count, sparqlQuery: generateImpedanceFix(),
        });
      }

      if (ratingResult.count > 0) {
        detectedIssues.push({
          category: 'Thermal Ratings', severity: 'error',
          message: `${ratingResult.count} lines missing thermal ratings`,
          count: ratingResult.count, affectedItems: ratingResult.items,
          suggestedFix: '380 kV → 2500 MVA · 220 kV → 800 MVA · 110 kV → 300 MVA',
        });
        proposedFixes.push({
          id: 'fix-ratings', category: 'Thermal Ratings', status: 'pending',
          description: `Add thermal ratings to ${ratingResult.count} lines`,
          details: 'Ratings inferred from voltage level in line name',
          affectedCount: ratingResult.count, sparqlQuery: generateRatingFix(),
        });
      }

      if (connectionResult.count > 0) {
        detectedIssues.push({
          category: 'Connectivity', severity: 'warning',
          message: `${connectionResult.count} lines not fully connected`,
          count: connectionResult.count, affectedItems: connectionResult.items,
          suggestedFix: 'Each line needs exactly 2 terminals',
        });
      }

      if (balanceResult.imbalance > 50) {
        detectedIssues.push({
          category: 'Power Balance', severity: balanceResult.imbalance > 100 ? 'error' : 'warning',
          message: `Power imbalance: ${balanceResult.imbalance.toFixed(1)} MW`,
          count: 1, affectedItems: ['System-wide'],
          suggestedFix: `${balanceResult.imbalance > 0 ? 'Reduce generation' : 'Add generation'} by ${Math.abs(balanceResult.imbalance).toFixed(1)} MW`,
        });
      }

      if (busInjectionResult.count > 5) {
        detectedIssues.push({
          category: 'Bus Injections', severity: 'info',
          message: `${busInjectionResult.count} buses without generation or load`,
          count: busInjectionResult.count, affectedItems: busInjectionResult.items,
          suggestedFix: 'These are likely transit buses — verify topology',
        });
      }

      setIssues(detectedIssues);
      setFixes(proposedFixes);
      setAnalysisComplete(true);
    } catch (error) {
      console.error('Analysis error:', error);
      setIssues([{ category: 'Analysis Error', severity: 'error', message: 'Failed to analyze network data', count: 0, affectedItems: [] }]);
    } finally {
      setAnalyzing(false);
    }
  };

  const checkMissingImpedances = async () => {
    const q = `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT ?line ?name WHERE {
  ?line a cim:ACLineSegment .
  ?line cim:IdentifiedObject.name ?name .
  FILTER NOT EXISTS { ?line cim:ACLineSegment.r ?r }
}`;
    const r = await api.executeSparqlQuery(q);
    return { count: r?.results?.length || 0, items: r?.results?.map((x: any) => x.name).slice(0, 5) || [] };
  };

  const checkMissingRatings = async () => {
    const q = `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT ?line ?name WHERE {
  ?line a cim:ACLineSegment .
  ?line cim:IdentifiedObject.name ?name .
  FILTER NOT EXISTS { ?line cim:Conductor.normalRating ?rating }
}`;
    const r = await api.executeSparqlQuery(q);
    return { count: r?.results?.length || 0, items: r?.results?.map((x: any) => x.name).slice(0, 5) || [] };
  };

  const checkUnconnectedLines = async () => {
    const q = `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT ?line ?name (COUNT(?terminal) as ?terminalCount) WHERE {
  ?line a cim:ACLineSegment .
  ?line cim:IdentifiedObject.name ?name .
  OPTIONAL { ?terminal cim:Terminal.ConductingEquipment ?line }
}
GROUP BY ?line ?name
HAVING (COUNT(?terminal) < 2)`;
    const r = await api.executeSparqlQuery(q);
    return { count: r?.results?.length || 0, items: r?.results?.map((x: any) => x.name).slice(0, 5) || [] };
  };

  const checkPowerBalance = async () => {
    const q = `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT (SUM(?genP) as ?totalGen) (SUM(?loadP) as ?totalLoad) WHERE {
  { ?gen a cim:GeneratingUnit . ?gen cim:GeneratingUnit.maxOperatingP ?genP . }
  UNION
  { ?load a cim:EnergyConsumer . ?load cim:EnergyConsumer.p ?loadP . }
}`;
    const r = await api.executeSparqlQuery(q);
    if (r?.results?.[0]) {
      const gen  = parseFloat(r.results[0].totalGen  || 0);
      const load = parseFloat(r.results[0].totalLoad || 0);
      return { imbalance: gen - load };
    }
    return { imbalance: 0 };
  };

  const checkBusInjections = async () => {
    const q = `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT ?bus ?name WHERE {
  ?bus a cim:ConnectivityNode .
  ?bus cim:IdentifiedObject.name ?name .
  FILTER NOT EXISTS {
    ?terminal cim:Terminal.ConnectivityNode ?bus .
    {
      ?terminal cim:Terminal.ConductingEquipment ?eq .
      { ?eq a cim:GeneratingUnit . } UNION { ?eq a cim:EnergyConsumer . }
    }
  }
}`;
    const r = await api.executeSparqlQuery(q);
    return { count: r?.results?.length || 0, items: r?.results?.map((x: any) => x.name).slice(0, 5) || [] };
  };

  const generateImpedanceFix = () => `PREFIX cim: <http://iec.ch/TC57/CIM100#>

INSERT {
  ?line cim:ACLineSegment.r 0.02 .
  ?line cim:ACLineSegment.x 0.06 .
  ?line cim:ACLineSegment.bch 0.0001 .
  ?line cim:ACLineSegment.gch 0.0 .
}
WHERE {
  ?line a cim:ACLineSegment .
  FILTER NOT EXISTS { ?line cim:ACLineSegment.r ?r }
}`;

  const generateRatingFix = () => `PREFIX cim: <http://iec.ch/TC57/CIM100#>

INSERT { ?line cim:Conductor.normalRating ?rating . }
WHERE {
  ?line a cim:ACLineSegment .
  ?line cim:IdentifiedObject.name ?name .
  FILTER NOT EXISTS { ?line cim:Conductor.normalRating ?r }
  BIND(
    IF(CONTAINS(?name, "380"), 2500.0,
      IF(CONTAINS(?name, "220"), 800.0,
        IF(CONTAINS(?name, "110"), 300.0, 500.0)
      )
    ) AS ?rating
  )
}`;

  const applyFix = async (fixId: string) => {
    const fix = fixes.find(f => f.id === fixId);
    if (!fix) return;
    setFixes(prev => prev.map(f => f.id === fixId ? { ...f, status: 'applying' } : f));
    try {
      const resp = await api.applyFixes([{
        id: fix.id,
        description: fix.description,
        category: fix.category,
        sparqlQuery: fix.sparqlQuery,
      }]);
      const result = resp.results[0];
      if (result?.status === 'applied') {
        setFixes(prev => prev.map(f => f.id === fixId ? { ...f, status: 'done' } : f));
      } else {
        const errMsg = result?.error || (result?.status === 'blocked' ? 'Operation blocked by safety rules' : 'Fix failed');
        setFixes(prev => prev.map(f => f.id === fixId ? { ...f, status: 'error', details: errMsg } : f));
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || err?.message || 'Fix failed';
      setFixes(prev => prev.map(f => f.id === fixId ? { ...f, status: 'error', details: errMsg } : f));
    }
  };

  const applyAllFixes = async () => {
    const pending = fixes.filter(f => f.status === 'pending');
    if (pending.length === 0) return;
    setApplying(true);

    // Mark all as applying
    setFixes(prev => prev.map(f => f.status === 'pending' ? { ...f, status: 'applying' } : f));

    try {
      const resp = await api.applyFixes(pending.map(f => ({
        id: f.id,
        description: f.description,
        category: f.category,
        sparqlQuery: f.sparqlQuery,
      })));

      setFixes(prev => prev.map(f => {
        const result = resp.results.find(r => r.id === f.id);
        if (!result) return f;
        if (result.status === 'applied') return { ...f, status: 'done' };
        const errMsg = result.error || (result.status === 'blocked' ? 'Blocked by safety rules' : 'Failed');
        return { ...f, status: 'error', details: errMsg };
      }));
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || err?.message || 'Batch apply failed';
      setFixes(prev => prev.map(f =>
        f.status === 'applying' ? { ...f, status: 'error', details: errMsg } : f
      ));
    } finally {
      setApplying(false);
    }
  };

  const clearAnalysis = () => {
    setIssues([]);
    setFixes([]);
    setAnalysisComplete(false);
    storageRemove(STORAGE_KEY);
  };

  const errorCount   = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const fixedCount   = fixes.filter(f => f.status === 'done').length;
  const pendingFixes = fixes.filter(f => f.status === 'pending');

  // Data quality score (0–100)
  const score = analysisComplete
    ? Math.max(0, 100 - errorCount * 20 - warningCount * 10)
    : null;

  const scoreColor = score === null ? '' : score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-accent-500' : 'text-red-400';

  return (
    <div className="space-y-6 animate-fade-in">

      <PageHeader
        icon={Wrench}
        iconColor="text-yellow-400"
        title="CIM Data Fixer"
        subtitle="Network data quality analysis and automatic correction"
        actions={
          <>
            {score !== null && (
              <div className="text-center px-4 py-1.5 rounded-lg bg-primary-800 border border-primary-600/50">
                <div className={`text-xl font-black ${scoreColor}`}>{score}</div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Quality Score</div>
              </div>
            )}
            {analysisComplete && (
              <button
                onClick={clearAnalysis}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-800 hover:bg-red-500/10 border border-primary-600/50 hover:border-red-500/30 text-neutral-300 hover:text-red-300 text-sm transition-all"
              >
                <RotateCcw size={15} /> Reset
              </button>
            )}
            {pendingFixes.length > 0 && (
              <button
                onClick={applyAllFixes}
                disabled={applying}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
              >
                <PlayCircle size={15} className={applying ? 'animate-pulse' : ''} />
                {applying ? 'Applying…' : `Apply All (${pendingFixes.length})`}
              </button>
            )}
            <button
              onClick={analyzeNetwork}
              disabled={analyzing}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all disabled:opacity-50"
            >
              <Zap size={15} className={analyzing ? 'animate-spin' : ''} />
              {analyzing ? 'Analyzing…' : analysisComplete ? 'Re-analyze' : 'Analyze Network'}
            </button>
          </>
        }
      />

      {/* Analysis progress */}
      {analyzing && (
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <Loader2 size={18} className="text-accent-400 animate-spin" />
            <span className="text-sm font-semibold text-white">Running validation queries…</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ANALYSIS_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isActive = idx === analysisStep;
              const isDone   = idx < analysisStep;
              return (
                <div
                  key={idx}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    isActive ? 'bg-accent-500/10 border-accent-500/30' :
                    isDone   ? 'bg-emerald-500/10 border-emerald-500/20' :
                    'bg-primary-800/20 border-primary-700/20'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-accent-500/20' : isDone ? 'bg-emerald-500/20' : 'bg-primary-700/30'}`}>
                    {isDone   ? <CheckCircle size={16} className="text-emerald-400" /> :
                     isActive ? <Loader2 size={16} className="text-accent-400 animate-spin" /> :
                     <StepIcon size={16} className="text-neutral-600" />}
                  </div>
                  <span className={`text-[10px] text-center font-medium leading-tight ${
                    isActive ? 'text-accent-300' : isDone ? 'text-emerald-300' : 'text-neutral-600'
                  }`}>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!analyzing && !analysisComplete && (
        <div className="card py-20 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl" />
          <div className="relative">
            <div className="w-20 h-20 bg-gradient-to-br from-accent-500/20 to-accent-600/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Wrench size={36} className="text-accent-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Ready for Analysis</h2>
            <p className="text-sm text-neutral-400 mb-6 max-w-md mx-auto">
              Scan your CIM knowledge graph for missing values, connectivity problems, and power imbalances.
            </p>
            <button
              onClick={analyzeNetwork}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white rounded-xl font-semibold shadow-lg shadow-accent-500/20 transition-all active:scale-[0.98]"
            >
              <Zap size={18} /> Start Analysis
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {analysisComplete && !analyzing && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Errors',         value: errorCount,              color: 'text-red-400',     border: 'border-red-500/30',     icon: XCircle },
              { label: 'Warnings',       value: warningCount,            color: 'text-accent-500',  border: 'border-yellow-500/30',  icon: AlertTriangle },
              { label: 'Fixes Available',value: pendingFixes.length,     color: 'text-accent-400',  border: 'border-accent-500/30',  icon: Wrench },
              { label: 'Applied',        value: fixedCount,              color: 'text-emerald-400', border: 'border-emerald-500/30', icon: CheckCircle },
            ].map(({ label, value, color, border, icon: Icon }) => (
              <div key={label} className={`p-5 rounded-xl border ${border} bg-primary-800/20`}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={16} className={color} />
                  <span className="text-xs text-neutral-400">{label}</span>
                </div>
                <div className={`text-3xl font-black ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Issues + Fixes side by side */}
          {(issues.length > 0 || fixes.length > 0) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

              {/* Issues */}
              <div className="space-y-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2 px-1">
                  <AlertTriangle size={16} className="text-accent-500" />
                  Detected Issues <span className="text-neutral-500 font-normal">({issues.length})</span>
                </h2>
                {issues.length === 0 ? (
                  <div className="card py-10 text-center">
                    <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm text-neutral-400">No issues found</p>
                  </div>
                ) : (
                  issues.map((issue, idx) => {
                    const cfg = SEV_CONFIG[issue.severity];
                    return (
                      <div key={idx} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 space-y-3`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white text-sm">{issue.category}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${cfg.badge}`}>{cfg.label}</span>
                        </div>
                        <p className="text-sm text-neutral-300">{issue.message}</p>
                        {issue.affectedItems.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {issue.affectedItems.map((item, i) => (
                              <span key={i} className="px-2 py-0.5 bg-primary-800/60 rounded text-xs text-neutral-300 font-mono border border-primary-700/40">{item}</span>
                            ))}
                            {issue.count > issue.affectedItems.length && (
                              <span className="px-2 py-0.5 bg-accent-500/10 rounded text-xs text-accent-400 border border-accent-500/30">+{issue.count - issue.affectedItems.length} more</span>
                            )}
                          </div>
                        )}
                        {issue.suggestedFix && (
                          <p className="text-xs text-neutral-400 border-t border-primary-700/30 pt-2 mt-1">
                            <span className="text-accent-400 font-semibold">Suggestion: </span>
                            {issue.suggestedFix}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Fixes */}
              <div className="space-y-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2 px-1">
                  <Wrench size={16} className="text-accent-400" />
                  Automated Corrections <span className="text-neutral-500 font-normal">({fixes.length})</span>
                </h2>
                {fixes.length === 0 ? (
                  <div className="card py-10 text-center">
                    <p className="text-sm text-neutral-400">No automated fixes available</p>
                  </div>
                ) : (
                  fixes.map((fix, idx) => {
                    const st = FIX_STATUS[fix.status];
                    return (
                      <div key={idx} className={`rounded-xl border ${st.border} ${st.bg} p-4 space-y-3`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white text-sm">{fix.description}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                            fix.status === 'done'     ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                            fix.status === 'applying' ? 'bg-accent-500/20 text-accent-300 border-accent-500/30' :
                            fix.status === 'error'    ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                            'bg-primary-600/40 text-neutral-300 border-primary-600/50'
                          }`}>{fix.status.toUpperCase()}</span>
                        </div>
                        {fix.details && (
                          <p className="text-xs text-neutral-400 font-mono">{fix.details}</p>
                        )}

                        {/* Status feedback */}
                        {fix.status === 'done' && (
                          <div className="flex items-center gap-2 text-xs text-emerald-400">
                            <CheckCircle size={14} /> Applied to {fix.affectedCount} items
                          </div>
                        )}
                        {fix.status === 'error' && (
                          <div className="flex items-center gap-2 text-xs text-red-400">
                            <XCircle size={14} /> Failed — check backend logs
                          </div>
                        )}
                        {fix.status === 'applying' && (
                          <div className="flex items-center gap-2 text-xs text-accent-400">
                            <Loader2 size={14} className="animate-spin" /> Applying…
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-1">
                          {fix.status === 'pending' && (
                            <button
                              onClick={() => applyFix(fix.id)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-accent-500 hover:bg-accent-400 text-white rounded-lg text-xs font-semibold transition-colors"
                            >
                              <PlayCircle size={14} /> Apply Fix
                            </button>
                          )}
                          {/* SPARQL preview */}
                          <details className="ml-auto group">
                            <summary className="cursor-pointer flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors list-none select-none">
                              <FileText size={12} /> View SPARQL
                            </summary>
                            <div className="mt-2 rounded-lg overflow-hidden border border-primary-700/30">
                              <div className="flex items-center justify-between px-3 py-1.5 bg-primary-900/80 border-b border-primary-700/30">
                                <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">SPARQL UPDATE</span>
                                <button
                                  onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(fix.sparqlQuery); }}
                                  className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
                                >
                                  Copy
                                </button>
                              </div>
                              <pre className="p-3 text-[11px] font-mono text-neutral-300 whitespace-pre-wrap leading-relaxed bg-primary-900/50 overflow-x-auto">
                                {fix.sparqlQuery}
                              </pre>
                            </div>
                          </details>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* All good */}
          {issues.length === 0 && fixes.length === 0 && (
            <div className="card py-16 text-center">
              <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
              <p className="text-white font-bold text-lg mb-1">Network data is clean</p>
              <p className="text-sm text-neutral-400 mb-6">No missing values, connectivity issues, or power imbalances detected.</p>
              <button
                onClick={() => navigate('/diagnostics')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-700/50 hover:bg-primary-700 border border-primary-600/50 text-sm text-neutral-300 hover:text-white transition-all"
              >
                View Diagnostics <ArrowRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DataFixer;
