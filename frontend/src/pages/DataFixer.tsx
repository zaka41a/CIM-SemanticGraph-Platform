import { useState, useEffect } from 'react';
import {
  Wrench, AlertTriangle, CheckCircle, Zap, Info,
  PlayCircle, XCircle, TrendingUp, Activity, Database, FileText, Loader2,
  Search, Cable, Gauge, Network
} from 'lucide-react';
import api from '@/services/api';

interface ValidationIssue {
  category: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  count: number;
  affectedItems: string[];
  suggestedFix?: string;
  sparqlUpdate?: string;
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
  { label: 'Checking line impedances...', icon: Cable },
  { label: 'Checking thermal ratings...', icon: Gauge },
  { label: 'Checking connectivity...', icon: Network },
  { label: 'Checking power balance...', icon: Activity },
  { label: 'Checking bus injections...', icon: Search },
];

const DataFixer = () => {
  // Load state from localStorage on mount
  const loadSavedState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore if saved within last hour
        const savedTime = new Date(parsed.timestamp).getTime();
        const now = new Date().getTime();
        if (now - savedTime < 3600000) { // 1 hour
          return parsed;
        }
      }
    } catch (error) {
      console.error('Error loading saved state:', error);
    }
    return null;
  };

  const savedState = loadSavedState();

  const [issues, setIssues] = useState<ValidationIssue[]>(savedState?.issues || []);
  const [fixes, setFixes] = useState<FixAction[]>(savedState?.fixes || []);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(savedState?.analysisComplete || false);
  const [analysisStep, setAnalysisStep] = useState(0);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (analysisComplete) {
      const stateToSave = {
        issues,
        fixes,
        analysisComplete,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }
  }, [issues, fixes, analysisComplete]);

  const analyzeNetwork = async () => {
    setAnalyzing(true);
    setIssues([]);
    setFixes([]);
    setAnalysisComplete(false);
    setAnalysisStep(0);

    try {
      // Run multiple validation queries with step tracking
      setAnalysisStep(0);
      const impedanceResult = await checkMissingImpedances();
      setAnalysisStep(1);
      const ratingResult = await checkMissingRatings();
      setAnalysisStep(2);
      const connectionResult = await checkUnconnectedLines();
      setAnalysisStep(3);
      const balanceResult = await checkPowerBalance();
      setAnalysisStep(4);
      const busInjectionResult = await checkBusInjections();

      const detectedIssues: ValidationIssue[] = [];
      const proposedFixes: FixAction[] = [];

      // Process impedance issues
      if (impedanceResult.count > 0) {
        detectedIssues.push({
          category: 'Line Impedances',
          severity: 'error',
          message: `${impedanceResult.count} lines missing impedance values (r, x)`,
          count: impedanceResult.count,
          affectedItems: impedanceResult.items,
          suggestedFix: 'Add typical impedance values based on voltage level'
        });

        proposedFixes.push({
          id: 'fix-impedances',
          category: 'Line Impedances',
          description: `Add impedance values to ${impedanceResult.count} lines`,
          status: 'pending',
          details: 'Set r=0.02 Ω/km, x=0.06 Ω/km for 220kV lines',
          affectedCount: impedanceResult.count,
          sparqlQuery: generateImpedanceFix()
        });
      }

      // Process rating issues
      if (ratingResult.count > 0) {
        detectedIssues.push({
          category: 'Line Ratings',
          severity: 'error',
          message: `${ratingResult.count} lines missing thermal ratings`,
          count: ratingResult.count,
          affectedItems: ratingResult.items,
          suggestedFix: 'Add ratings based on voltage level: 380kV=2500MVA, 220kV=800MVA, 110kV=300MVA'
        });

        proposedFixes.push({
          id: 'fix-ratings',
          category: 'Line Ratings',
          description: `Add thermal ratings to ${ratingResult.count} lines`,
          status: 'pending',
          details: 'Ratings based on voltage level and typical conductor sizes',
          affectedCount: ratingResult.count,
          sparqlQuery: generateRatingFix()
        });
      }

      // Process connection issues
      if (connectionResult.count > 0) {
        detectedIssues.push({
          category: 'Connectivity',
          severity: 'warning',
          message: `${connectionResult.count} lines not fully connected`,
          count: connectionResult.count,
          affectedItems: connectionResult.items,
          suggestedFix: 'Verify topology - lines should have 2 terminals'
        });
      }

      // Process power balance
      if (balanceResult.imbalance > 50) {
        detectedIssues.push({
          category: 'Power Balance',
          severity: balanceResult.imbalance > 100 ? 'error' : 'warning',
          message: `Power imbalance: ${balanceResult.imbalance.toFixed(1)} MW`,
          count: 1,
          affectedItems: ['System-wide'],
          suggestedFix: `${balanceResult.imbalance > 0 ? 'Reduce generation' : 'Add generation'} by ${Math.abs(balanceResult.imbalance).toFixed(1)} MW`
        });
      }

      // Process bus injections
      if (busInjectionResult.count > 5) {
        detectedIssues.push({
          category: 'Bus Injections',
          severity: 'info',
          message: `${busInjectionResult.count} buses without generation or load`,
          count: busInjectionResult.count,
          affectedItems: busInjectionResult.items,
          suggestedFix: 'These are likely transit buses - verify topology'
        });
      }

      setIssues(detectedIssues);
      setFixes(proposedFixes);
      setAnalysisComplete(true);

    } catch (error) {
      console.error('Analysis error:', error);
      setIssues([{
        category: 'Analysis Error',
        severity: 'error',
        message: 'Failed to analyze network data',
        count: 0,
        affectedItems: [],
      }]);
    } finally {
      setAnalyzing(false);
    }
  };

  const checkMissingImpedances = async () => {
    const query = `
      PREFIX cim: <http://iec.ch/TC57/CIM100#>

      SELECT ?line ?name WHERE {
        ?line a cim:ACLineSegment .
        ?line cim:IdentifiedObject.name ?name .
        FILTER NOT EXISTS { ?line cim:ACLineSegment.r ?r }
      }
    `;

    const result = await api.executeSparqlQuery(query);
    return {
      count: result?.results?.length || 0,
      items: result?.results?.map((r: any) => r.name).slice(0, 5) || []
    };
  };

  const checkMissingRatings = async () => {
    const query = `
      PREFIX cim: <http://iec.ch/TC57/CIM100#>

      SELECT ?line ?name WHERE {
        ?line a cim:ACLineSegment .
        ?line cim:IdentifiedObject.name ?name .
        FILTER NOT EXISTS { ?line cim:Conductor.normalRating ?rating }
      }
    `;

    const result = await api.executeSparqlQuery(query);
    return {
      count: result?.results?.length || 0,
      items: result?.results?.map((r: any) => r.name).slice(0, 5) || []
    };
  };

  const checkUnconnectedLines = async () => {
    const query = `
      PREFIX cim: <http://iec.ch/TC57/CIM100#>

      SELECT ?line ?name (COUNT(?terminal) as ?terminalCount) WHERE {
        ?line a cim:ACLineSegment .
        ?line cim:IdentifiedObject.name ?name .
        OPTIONAL { ?terminal cim:Terminal.ConductingEquipment ?line }
      }
      GROUP BY ?line ?name
      HAVING (COUNT(?terminal) < 2)
    `;

    const result = await api.executeSparqlQuery(query);
    return {
      count: result?.results?.length || 0,
      items: result?.results?.map((r: any) => r.name).slice(0, 5) || []
    };
  };

  const checkPowerBalance = async () => {
    const query = `
      PREFIX cim: <http://iec.ch/TC57/CIM100#>

      SELECT (SUM(?genP) as ?totalGen) (SUM(?loadP) as ?totalLoad) WHERE {
        {
          ?gen a cim:GeneratingUnit .
          ?gen cim:GeneratingUnit.maxOperatingP ?genP .
        } UNION {
          ?load a cim:EnergyConsumer .
          ?load cim:EnergyConsumer.p ?loadP .
        }
      }
    `;

    const result = await api.executeSparqlQuery(query);
    if (result?.results?.[0]) {
      const gen = parseFloat(result.results[0].totalGen || 0);
      const load = parseFloat(result.results[0].totalLoad || 0);
      return { imbalance: gen - load };
    }
    return { imbalance: 0 };
  };

  const checkBusInjections = async () => {
    const query = `
      PREFIX cim: <http://iec.ch/TC57/CIM100#>

      SELECT ?bus ?name WHERE {
        ?bus a cim:ConnectivityNode .
        ?bus cim:IdentifiedObject.name ?name .
        FILTER NOT EXISTS {
          ?terminal cim:Terminal.ConnectivityNode ?bus .
          {
            ?gen a cim:GeneratingUnit .
            ?genTerm cim:Terminal.ConductingEquipment ?gen .
          } UNION {
            ?load a cim:EnergyConsumer .
            ?loadTerm cim:Terminal.ConductingEquipment ?load .
          }
        }
      }
    `;

    const result = await api.executeSparqlQuery(query);
    return {
      count: result?.results?.length || 0,
      items: result?.results?.map((r: any) => r.name).slice(0, 5) || []
    };
  };

  const generateImpedanceFix = () => `
PREFIX cim: <http://iec.ch/TC57/CIM100#>

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

  const generateRatingFix = () => `
PREFIX cim: <http://iec.ch/TC57/CIM100#>

INSERT {
  ?line cim:Conductor.normalRating ?rating .
}
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

    setFixes(prev => prev.map(f =>
      f.id === fixId ? { ...f, status: 'applying' } : f
    ));

    try {
      // Execute SPARQL UPDATE query
      await api.executeSparqlUpdate(fix.sparqlQuery);

      setFixes(prev => prev.map(f =>
        f.id === fixId ? { ...f, status: 'done' } : f
      ));
    } catch (error) {
      console.error('Fix application error:', error);
      setFixes(prev => prev.map(f =>
        f.id === fixId ? { ...f, status: 'error' } : f
      ));
    }
  };

  const applyAllFixes = async () => {
    setApplying(true);
    for (const fix of fixes.filter(f => f.status === 'pending')) {
      await applyFix(fix.id);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setApplying(false);
  };

  const clearAnalysis = () => {
    setIssues([]);
    setFixes([]);
    setAnalysisComplete(false);
    localStorage.removeItem(STORAGE_KEY);
  };


  const getSeverityColor = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error': return 'text-red-400 bg-red-500/10 border-red-500/30';
      case 'warning': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'info': return 'text-primary-300 bg-primary-500/10 border-primary-500/30';
    }
  };

  const getSeverityIcon = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error': return XCircle;
      case 'warning': return AlertTriangle;
      case 'info': return Info;
    }
  };

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const fixedCount = fixes.filter(f => f.status === 'done').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800/50 via-primary-900/50 to-primary-950/50 p-8 border border-primary-700/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl shadow-lg shadow-accent-500/20">
              <Wrench size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">CIM Data Fixer</h1>
              <p className="text-neutral-300">
                Intelligent network data quality analysis and automatic correction
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            {analysisComplete && (
              <button
                onClick={clearAnalysis}
                className="flex items-center gap-2 px-6 py-3 bg-primary-700 hover:bg-red-500/20 hover:border-red-500/30 text-white rounded-xl font-semibold transition-all duration-200 hover:shadow-lg active:scale-[0.98] border border-transparent"
              >
                <XCircle size={18} />
                <span>Clear Analysis</span>
              </button>
            )}
            {fixes.length > 0 && fixes.some(f => f.status === 'pending') && (
              <button
                onClick={applyAllFixes}
                disabled={applying}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white rounded-xl font-semibold shadow-lg shadow-accent-500/20 transition-all duration-200 hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PlayCircle size={18} className={applying ? 'animate-pulse' : ''} />
                <span>{applying ? 'Applying...' : 'Apply All Fixes'}</span>
              </button>
            )}
            {!analysisComplete && (
              <button
                onClick={analyzeNetwork}
                disabled={analyzing}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white rounded-xl font-semibold shadow-lg shadow-accent-500/20 transition-all duration-200 hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap size={18} className={analyzing ? 'animate-spin' : ''} />
                <span>{analyzing ? 'Analyzing...' : 'Analyze Network'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="card bg-primary-700/20 border-primary-600/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-accent-500/5 rounded-full blur-2xl"></div>
        <div className="relative flex items-start gap-4 p-6">
          <div className="p-3 bg-accent-500/20 rounded-xl">
            <Info className="w-6 h-6 text-accent-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-3">Automated Data Quality Management</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-2">
                <Database className="w-4 h-4 text-accent-400 flex-shrink-0 mt-0.5" />
                <span className="text-neutral-300">Analyzes your CIM data using SPARQL queries</span>
              </div>
              <div className="flex items-start gap-2">
                <Activity className="w-4 h-4 text-accent-400 flex-shrink-0 mt-0.5" />
                <span className="text-neutral-300">Detects missing impedances, ratings, and connectivity issues</span>
              </div>
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-accent-400 flex-shrink-0 mt-0.5" />
                <span className="text-neutral-300">Generates SPARQL UPDATE queries for automatic correction</span>
              </div>
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-accent-400 flex-shrink-0 mt-0.5" />
                <span className="text-neutral-300">Exports corrections for review and application</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis State */}
      {analyzing ? (
        <div className="card text-center py-16">
          <Loader2 className="w-12 h-12 text-accent-400 animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-white mb-2">Analyzing Network Data...</h2>
          <p className="text-neutral-400 mb-8">Running validation queries on your CIM Knowledge Graph</p>

          {/* Step indicators */}
          <div className="max-w-md mx-auto space-y-2">
            {ANALYSIS_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isActive = idx === analysisStep;
              const isDone = idx < analysisStep;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-accent-500/10 border border-accent-500/30'
                      : isDone
                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                        : 'bg-primary-800/20 border border-transparent'
                  }`}
                >
                  <div className={`p-1.5 rounded-md ${
                    isActive ? 'bg-accent-500/20' : isDone ? 'bg-emerald-500/20' : 'bg-primary-700/30'
                  }`}>
                    {isDone ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : isActive ? (
                      <Loader2 className="w-4 h-4 text-accent-400 animate-spin" />
                    ) : (
                      <StepIcon className="w-4 h-4 text-neutral-600" />
                    )}
                  </div>
                  <span className={`text-sm font-medium ${
                    isActive ? 'text-accent-300' : isDone ? 'text-emerald-300' : 'text-neutral-600'
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : !analysisComplete ? (
        <div className="card text-center py-20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl"></div>
          <div className="relative">
            <div className="w-20 h-20 bg-gradient-to-br from-accent-500/20 to-accent-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-accent-500/10">
              <Wrench className="w-10 h-10 text-accent-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-3">Ready for Analysis</h2>
            <p className="text-sm text-neutral-400 mb-6 max-w-lg mx-auto">
              Click "Analyze Network" to scan your CIM data for quality issues, missing values, and connectivity problems
            </p>
            <button
              onClick={analyzeNetwork}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white rounded-xl font-semibold shadow-lg shadow-accent-500/20 transition-all duration-200 hover:shadow-xl active:scale-[0.98]"
            >
              <Zap size={18} />
              Start Analysis
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-6 bg-primary-800/30 rounded-xl border border-red-500/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl"></div>
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <XCircle className="w-5 h-5 text-red-400" />
                  </div>
                  <span className="text-neutral-400 text-sm font-medium">Errors</span>
                </div>
                <div className="text-3xl font-bold text-red-400 mb-1">{errorCount}</div>
                <div className="text-xs text-neutral-500">Critical issues found</div>
              </div>
            </div>

            <div className="p-6 bg-primary-800/30 rounded-xl border border-yellow-500/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full blur-2xl"></div>
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  </div>
                  <span className="text-neutral-400 text-sm font-medium">Warnings</span>
                </div>
                <div className="text-3xl font-bold text-yellow-400 mb-1">{warningCount}</div>
                <div className="text-xs text-neutral-500">Items to review</div>
              </div>
            </div>

            <div className="p-6 bg-primary-800/30 rounded-xl border border-accent-500/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent-500/5 rounded-full blur-2xl"></div>
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-accent-500/20 rounded-lg">
                    <Wrench className="w-5 h-5 text-accent-400" />
                  </div>
                  <span className="text-neutral-400 text-sm font-medium">Fixes Available</span>
                </div>
                <div className="text-3xl font-bold text-accent-400 mb-1">{fixes.length}</div>
                <div className="text-xs text-neutral-500">Auto-correction ready</div>
              </div>
            </div>

            <div className="p-6 bg-primary-800/30 rounded-xl border border-green-500/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-2xl"></div>
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>
                  <span className="text-neutral-400 text-sm font-medium">Applied</span>
                </div>
                <div className="text-3xl font-bold text-green-400 mb-1">{fixedCount}</div>
                <div className="text-xs text-neutral-500">Corrections applied</div>
              </div>
            </div>
          </div>

          {/* Issues List */}
          {issues.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-yellow-400" />
                Detected Issues ({issues.length})
              </h2>

              {issues.map((issue, idx) => {
                const Icon = getSeverityIcon(issue.severity);
                return (
                  <div
                    key={idx}
                    className={`card p-6 ${getSeverityColor(issue.severity)}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl shadow-lg ${
                        issue.severity === 'error' ? 'bg-red-500/20' :
                        issue.severity === 'warning' ? 'bg-yellow-500/20' :
                        'bg-accent-500/20'
                      }`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1 space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-semibold text-white">{issue.category}</h4>
                          <span className={`px-4 py-2 rounded-full text-xs font-bold ${
                            issue.severity === 'error' ? 'bg-red-500/20 text-red-300 border-2 border-red-500/40' :
                            issue.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-300 border-2 border-yellow-500/40' :
                            'bg-primary-600/20 text-primary-300 border-2 border-primary-500/40'
                          }`}>
                            {issue.severity.toUpperCase()}
                          </span>
                        </div>

                        {/* Message */}
                        <div className={`p-4 bg-primary-900/50 rounded-lg border-l-4 shadow-inner ${
                          issue.severity === 'error' ? 'border-red-500' :
                          issue.severity === 'warning' ? 'border-yellow-500' :
                          'border-primary-500'
                        }`}>
                          <p className="text-neutral-100 font-medium text-sm leading-relaxed">{issue.message}</p>
                        </div>

                        {/* Affected Items */}
                        {issue.affectedItems.length > 0 && (
                          <div className="p-4 bg-primary-800/40 rounded-lg border border-primary-700/50">
                            <div className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-3">
                              Affected Items ({issue.count})
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {issue.affectedItems.map((item, i) => (
                                <span key={i} className="px-3 py-1 bg-primary-700/60 rounded-lg text-sm text-neutral-200 font-medium border border-primary-600/40">
                                  {item}
                                </span>
                              ))}
                              {issue.count > issue.affectedItems.length && (
                                <span className="px-3 py-1 bg-accent-500/20 rounded-lg text-sm text-accent-300 font-semibold border border-accent-500/40">
                                  +{issue.count - issue.affectedItems.length} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Suggested Fix */}
                        {issue.suggestedFix && (
                          <div className="p-4 bg-gradient-to-r from-accent-500/10 to-accent-600/10 rounded-lg border border-accent-500/40">
                            <div className="flex items-start gap-3">
                              <div className="p-2 bg-accent-500/20 rounded-lg">
                                <TrendingUp className="w-5 h-5 text-accent-400" />
                              </div>
                              <div className="flex-1">
                                <div className="font-semibold text-accent-300 mb-1 text-sm">Suggested Fix</div>
                                <p className="text-neutral-200 text-sm leading-relaxed">{issue.suggestedFix}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Automated Fixes */}
          {fixes.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Wrench className="w-6 h-6 text-accent-400" />
                Automated Corrections ({fixes.length})
              </h2>

              {fixes.map((fix, idx) => (
                <div
                  key={idx}
                  className={`card p-6 ${
                    fix.status === 'done' ? 'bg-green-500/10 border-green-500/30' :
                    fix.status === 'applying' ? 'bg-accent-500/10 border-accent-500/30' :
                    fix.status === 'error' ? 'bg-red-500/10 border-red-500/30' :
                    'bg-primary-800/30 border-primary-700/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl shadow-lg ${
                      fix.status === 'done' ? 'bg-green-500/20' :
                      fix.status === 'applying' ? 'bg-accent-500/20' :
                      fix.status === 'error' ? 'bg-red-500/20' :
                      'bg-accent-500/20'
                    }`}>
                      {fix.status === 'done' ? <CheckCircle className="w-6 h-6 text-green-400" /> :
                       fix.status === 'applying' ? <Zap className="w-6 h-6 text-accent-400 animate-pulse" /> :
                       fix.status === 'error' ? <XCircle className="w-6 h-6 text-red-400" /> :
                       <Wrench className="w-6 h-6 text-accent-400" />}
                    </div>
                    <div className="flex-1 space-y-4">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-white">{fix.description}</h4>
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 bg-primary-700/60 rounded-lg text-xs font-semibold text-neutral-200 border border-primary-600/40">
                            {fix.affectedCount} items
                          </span>
                          <span className={`px-4 py-2 rounded-full text-xs font-bold ${
                            fix.status === 'done' ? 'bg-green-500/20 text-green-300 border-2 border-green-500/40' :
                            fix.status === 'applying' ? 'bg-accent-500/20 text-accent-300 border-2 border-accent-500/40' :
                            fix.status === 'error' ? 'bg-red-500/20 text-red-300 border-2 border-red-500/40' :
                            'bg-accent-500/20 text-accent-300 border-2 border-accent-500/40'
                          }`}>
                            {fix.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Details */}
                      {fix.details && (
                        <div className="p-4 bg-primary-900/50 rounded-lg border-l-4 border-accent-500 shadow-inner">
                          <p className="text-neutral-100 font-medium text-sm leading-relaxed">{fix.details}</p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div>
                        {fix.status === 'pending' && (
                          <button
                            onClick={() => applyFix(fix.id)}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white rounded-xl font-semibold text-sm shadow-lg shadow-accent-500/20 transition-all duration-200 hover:shadow-xl active:scale-[0.98]"
                          >
                            <PlayCircle size={18} />
                            Apply Fix
                          </button>
                        )}

                        {fix.status === 'done' && (
                          <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-xl border border-green-500/30">
                            <CheckCircle size={20} className="text-green-400" />
                            <span className="font-semibold text-green-300 text-sm">Successfully applied to {fix.affectedCount} items</span>
                          </div>
                        )}

                        {fix.status === 'applying' && (
                          <div className="flex items-center gap-3 p-4 bg-accent-500/10 rounded-xl border border-accent-500/30">
                            <Zap size={20} className="text-accent-400 animate-pulse" />
                            <span className="font-semibold text-accent-300 text-sm">Applying correction...</span>
                          </div>
                        )}

                        {fix.status === 'error' && (
                          <div className="flex items-center gap-3 p-4 bg-red-500/10 rounded-xl border border-red-500/30">
                            <XCircle size={20} className="text-red-400" />
                            <span className="font-semibold text-red-300 text-sm">Failed to apply - check logs for details</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SPARQL Preview */}
                  <details className="mt-6 group">
                    <summary className="cursor-pointer px-4 py-3 bg-primary-800/50 hover:bg-primary-800/70 rounded-xl border border-primary-700/30 transition-all duration-200 list-none">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-accent-400" />
                          <span className="font-semibold text-white text-sm">View SPARQL Query</span>
                        </div>
                        <span className="text-xs text-neutral-400 group-open:rotate-180 transition-transform duration-200">▼</span>
                      </div>
                    </summary>
                    <div className="mt-3 overflow-hidden rounded-xl">
                      <div className="flex items-center justify-between px-4 py-2 bg-primary-900/80 border-b border-primary-700/30">
                        <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">SPARQL UPDATE Query</div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(fix.sparqlQuery);
                          }}
                          className="px-3 py-1 bg-primary-700 hover:bg-primary-600 text-neutral-300 rounded-lg text-xs font-medium transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="code-block !rounded-t-none">
                        <pre className="text-sm text-neutral-200 font-mono whitespace-pre-wrap leading-relaxed">
{fix.sparqlQuery}
                        </pre>
                      </div>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}

        </>
      )}
    </div>
  );
};

export default DataFixer;
