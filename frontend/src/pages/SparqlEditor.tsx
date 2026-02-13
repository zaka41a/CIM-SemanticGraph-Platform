import { useState } from 'react';
import {
  Play, Copy, Download, Book, AlertCircle, Code2, Zap, Database,
  CheckCircle2, Clock, Hash, Table2, FileJson, FileSpreadsheet,
  Trash2, Loader2, Terminal, ArrowRight, Layers, Cable, BarChart3
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { apiService } from '@/services/api';
import { SparqlQueryResponse } from '@/types';

const HISTORY_KEY = 'cim-sparql-history';
const MAX_HISTORY = 8;

interface QueryHistoryEntry {
  query: string;
  timestamp: string;
  resultCount: number;
  executionTimeMs?: number;
}

const SparqlEditor = () => {
  const [query, setQuery] = useState(`PREFIX cim: <http://iec.ch/TC57/CIM100#>

SELECT ?name ?description
WHERE {
    ?s a cim:Substation .
    ?s cim:IdentifiedObject.name ?name .
    OPTIONAL { ?s cim:IdentifiedObject.description ?description }
}
LIMIT 10`);

  const [results, setResults] = useState<SparqlQueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'templates' | 'history'>('templates');
  const [history, setHistory] = useState<QueryHistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const sampleQueries = [
    {
      name: 'All Substations',
      description: 'Get all substations with their descriptions',
      icon: Database,
      color: 'accent',
      query: `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT ?name ?description
WHERE {
    ?s a cim:Substation .
    ?s cim:IdentifiedObject.name ?name .
    OPTIONAL { ?s cim:IdentifiedObject.description ?description }
}`,
    },
    {
      name: 'All Generators',
      description: 'List generating units with power capacity',
      icon: Zap,
      color: 'emerald',
      query: `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT ?name ?maxPower
WHERE {
    ?g a cim:GeneratingUnit .
    ?g cim:IdentifiedObject.name ?name .
    ?g cim:GeneratingUnit.maxOperatingP ?maxPower .
}`,
    },
    {
      name: 'Total Capacity',
      description: 'Aggregate generation capacity and count',
      icon: BarChart3,
      color: 'blue',
      query: `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT (SUM(?power) as ?totalCapacity) (COUNT(?g) as ?count)
WHERE {
    ?g a cim:GeneratingUnit .
    ?g cim:GeneratingUnit.maxOperatingP ?power .
}`,
    },
    {
      name: 'Transmission Lines',
      description: 'List AC line segments with impedance data',
      icon: Cable,
      color: 'purple',
      query: `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT ?name ?r ?x ?length
WHERE {
    ?line a cim:ACLineSegment .
    ?line cim:IdentifiedObject.name ?name .
    OPTIONAL { ?line cim:ACLineSegment.r ?r }
    OPTIONAL { ?line cim:ACLineSegment.x ?x }
    OPTIONAL { ?line cim:Conductor.length ?length }
}
LIMIT 50`,
    },
    {
      name: 'Network Topology',
      description: 'Equipment terminal connectivity',
      icon: Layers,
      color: 'cyan',
      query: `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT ?equipment ?terminal ?node
WHERE {
    ?equipment a cim:ConductingEquipment .
    ?terminal cim:Terminal.ConductingEquipment ?equipment .
    ?terminal cim:Terminal.ConnectivityNode ?node .
}
LIMIT 50`,
    },
    {
      name: 'Voltage Levels',
      description: 'Base voltages and associated levels',
      icon: Layers,
      color: 'yellow',
      query: `PREFIX cim: <http://iec.ch/TC57/CIM100#>
SELECT ?vlName ?nominalVoltage
WHERE {
    ?vl a cim:VoltageLevel .
    ?vl cim:IdentifiedObject.name ?vlName .
    ?vl cim:VoltageLevel.BaseVoltage ?bv .
    ?bv cim:BaseVoltage.nominalVoltage ?nominalVoltage .
}
ORDER BY DESC(?nominalVoltage)`,
    },
  ];

  const colorMap: Record<string, { iconBg: string; iconText: string; border: string }> = {
    accent: { iconBg: 'bg-accent-500/20', iconText: 'text-accent-400', border: 'hover:border-accent-500/30' },
    emerald: { iconBg: 'bg-emerald-500/20', iconText: 'text-emerald-400', border: 'hover:border-emerald-500/30' },
    blue: { iconBg: 'bg-accent-500/20', iconText: 'text-accent-400', border: 'hover:border-accent-500/30' },
    purple: { iconBg: 'bg-accent-500/20', iconText: 'text-accent-400', border: 'hover:border-accent-500/30' },
    cyan: { iconBg: 'bg-accent-500/20', iconText: 'text-accent-400', border: 'hover:border-accent-500/30' },
    yellow: { iconBg: 'bg-yellow-500/20', iconText: 'text-yellow-400', border: 'hover:border-yellow-500/30' },
  };

  const handleExecute = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiService.executeSparqlQuery(query);
      setResults(response);

      // Save to history
      const entry: QueryHistoryEntry = {
        query: query.trim(),
        timestamp: new Date().toISOString(),
        resultCount: response.count,
        executionTimeMs: response.executionTimeMs,
      };
      setHistory(prev => {
        const filtered = prev.filter(h => h.query !== entry.query);
        const updated = [entry, ...filtered].slice(0, MAX_HISTORY);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      setError(err.message || 'Failed to execute query');
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJSON = () => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sparql-results-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = () => {
    if (!results || !results.results.length) return;
    const headers = Object.keys(results.results[0]);
    const csv = [
      headers.join(','),
      ...results.results.map(row =>
        headers.map(h => {
          const val = String(row[h] ?? '');
          return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
        }).join(',')
      )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sparql-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  const isUri = (value: string) => {
    return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
  };

  const formatUri = (value: string) => {
    // Show the last meaningful part of a URI
    const parts = value.split(/[/#]/);
    return parts[parts.length - 1] || value;
  };

  const lineCount = query.split('\n').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800/50 via-primary-900/50 to-primary-950/50 p-8 border border-primary-700/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl shadow-lg shadow-accent-500/20">
              <Code2 size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">SPARQL Query Editor</h1>
              <p className="text-neutral-300">
                Execute powerful queries against your CIM Knowledge Graph
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="space-y-4">
          {/* Tab Switcher */}
          <div className="flex bg-primary-900/60 rounded-xl p-1 border border-primary-700/30">
            <button
              onClick={() => setActiveTab('templates')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'templates'
                  ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/30'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Book size={15} />
              Templates
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'history'
                  ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/30'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Clock size={15} />
              History
              {history.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary-700 text-neutral-300">
                  {history.length}
                </span>
              )}
            </button>
          </div>

          {/* Templates Panel */}
          {activeTab === 'templates' && (
            <div className="card p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent-500/5 rounded-full blur-2xl"></div>
              <div className="relative space-y-2.5">
                {sampleQueries.map((sample, index) => {
                  const Icon = sample.icon;
                  const c = colorMap[sample.color] || colorMap.accent;
                  return (
                    <button
                      key={index}
                      onClick={() => setQuery(sample.query)}
                      className={`group w-full text-left p-3.5 rounded-xl bg-primary-800/30 hover:bg-primary-700/40 border border-primary-700/30 ${c.border} transition-all duration-200 active:scale-[0.98]`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${c.iconBg} flex-shrink-0`}>
                          <Icon size={16} className={c.iconText} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm mb-0.5 group-hover:text-accent-400 transition-colors">
                            {sample.name}
                          </p>
                          <p className="text-[11px] text-neutral-500 leading-relaxed">
                            {sample.description}
                          </p>
                        </div>
                        <ArrowRight size={14} className="text-neutral-600 group-hover:text-accent-400 transition-colors flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* History Panel */}
          {activeTab === 'history' && (
            <div className="card p-5 relative overflow-hidden">
              {history.length === 0 ? (
                <div className="text-center py-8">
                  <Clock size={28} className="text-neutral-700 mx-auto mb-3" />
                  <p className="text-sm text-neutral-500">No query history yet</p>
                  <p className="text-xs text-neutral-600 mt-1">Executed queries appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Recent Queries</span>
                    <button
                      onClick={clearHistory}
                      className="flex items-center gap-1 text-xs text-neutral-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                      Clear
                    </button>
                  </div>
                  {history.map((entry, idx) => (
                    <button
                      key={idx}
                      onClick={() => setQuery(entry.query)}
                      className="group w-full text-left p-3 rounded-xl bg-primary-800/30 hover:bg-primary-700/40 border border-primary-700/30 hover:border-accent-500/30 transition-all duration-200 active:scale-[0.98]"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-neutral-500">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                            {entry.resultCount}
                          </span>
                          {entry.executionTimeMs && (
                            <span className="text-[10px] text-neutral-600 font-mono">{entry.executionTimeMs}ms</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-neutral-400 font-mono truncate group-hover:text-neutral-300 transition-colors">
                        {entry.query.split('\n').find(l => l.trim().toUpperCase().startsWith('SELECT')) || entry.query.split('\n')[0]}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Reference */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Terminal size={16} className="text-accent-400" />
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Quick Reference</span>
            </div>
            <div className="space-y-1.5 text-[11px] font-mono">
              <div className="flex items-center justify-between py-1 text-neutral-500">
                <span>PREFIX</span>
                <span className="text-neutral-600">Namespace alias</span>
              </div>
              <div className="flex items-center justify-between py-1 text-neutral-500">
                <span>SELECT</span>
                <span className="text-neutral-600">Return variables</span>
              </div>
              <div className="flex items-center justify-between py-1 text-neutral-500">
                <span>WHERE</span>
                <span className="text-neutral-600">Triple patterns</span>
              </div>
              <div className="flex items-center justify-between py-1 text-neutral-500">
                <span>OPTIONAL</span>
                <span className="text-neutral-600">Optional match</span>
              </div>
              <div className="flex items-center justify-between py-1 text-neutral-500">
                <span>FILTER</span>
                <span className="text-neutral-600">Conditions</span>
              </div>
              <div className="flex items-center justify-between py-1 text-neutral-500">
                <span>ORDER BY</span>
                <span className="text-neutral-600">Sort results</span>
              </div>
            </div>
          </div>
        </div>

        {/* Editor and Results */}
        <div className="lg:col-span-3 space-y-6">
          {/* Editor Card */}
          <div className="card relative overflow-hidden">
            {/* Toolbar */}
            <div className="px-5 py-3.5 border-b border-primary-700/30 flex items-center justify-between bg-gradient-to-r from-primary-800/40 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent-500/20 rounded-lg">
                  <Code2 size={18} className="text-accent-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Query Editor</h3>
                  <p className="text-[11px] text-neutral-500 mt-0.5">SPARQL 1.1 compatible</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className={`px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-medium transition-all duration-200 active:scale-[0.97] ${
                    copied
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-primary-700/50 text-neutral-400 border border-primary-600/50 hover:bg-primary-600/50 hover:text-white hover:border-primary-500/50'
                  }`}
                >
                  {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={handleExecute}
                  disabled={isLoading || !query.trim()}
                  className="px-5 py-2 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white rounded-xl flex items-center gap-2 text-xs font-semibold shadow-lg shadow-accent-500/20 transition-all duration-200 hover:shadow-xl active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play size={14} className="fill-white" />
                      Execute
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Monaco Editor */}
            <div className="overflow-hidden">
              <Editor
                height="320px"
                defaultLanguage="sparql"
                value={query}
                onChange={(value) => setQuery(value || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 16, bottom: 16 },
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontLigatures: true,
                  cursorBlinking: 'smooth',
                  smoothScrolling: true,
                  renderLineHighlight: 'line',
                  lineHeight: 22,
                }}
              />
            </div>

            {/* Status Bar */}
            <div className="px-5 py-2 border-t border-primary-700/20 flex items-center justify-between bg-primary-900/40">
              <div className="flex items-center gap-4 text-[11px] text-neutral-600">
                <span className="flex items-center gap-1.5">
                  <Hash size={11} />
                  {lineCount} lines
                </span>
                <span className="flex items-center gap-1.5">
                  <Code2 size={11} />
                  SPARQL
                </span>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-red-500/10 to-red-900/10 border border-red-500/30 p-5 animate-slide-up">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl"></div>
              <div className="relative flex items-start gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg flex-shrink-0">
                  <AlertCircle size={20} className="text-red-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-red-400 text-sm mb-1">Query Execution Error</h4>
                  <p className="text-sm text-red-300/80 font-mono leading-relaxed">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {results && results.results.length > 0 && (
            <div className="card relative overflow-hidden animate-slide-up">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/3 rounded-full blur-3xl"></div>

              {/* Results Header */}
              <div className="relative px-5 py-4 border-b border-primary-700/30 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Table2 size={18} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">Query Results</h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-neutral-400">
                        <Hash size={11} />
                        {results.count} {results.count === 1 ? 'row' : 'rows'}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-neutral-400">
                        <Layers size={11} />
                        {Object.keys(results.results[0]).length} columns
                      </span>
                      {results.executionTimeMs && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400/70 font-mono">
                          <Clock size={11} />
                          {results.executionTimeMs}ms
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadCSV}
                    className="px-3 py-1.5 bg-primary-700/50 hover:bg-primary-600/50 text-neutral-400 hover:text-white rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primary-600/50 hover:border-primary-500/50 transition-all duration-200"
                  >
                    <FileSpreadsheet size={13} />
                    CSV
                  </button>
                  <button
                    onClick={handleDownloadJSON}
                    className="px-3 py-1.5 bg-primary-700/50 hover:bg-primary-600/50 text-neutral-400 hover:text-white rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primary-600/50 hover:border-primary-500/50 transition-all duration-200"
                  >
                    <FileJson size={13} />
                    JSON
                  </button>
                </div>
              </div>

              {/* Results Table */}
              <div className="overflow-x-auto custom-scrollbar" style={{ maxHeight: '480px' }}>
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-primary-800/60 to-primary-800/30 border-b border-primary-700/30 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-neutral-600 uppercase tracking-wider w-12">
                        #
                      </th>
                      {Object.keys(results.results[0]).map((key) => (
                        <th
                          key={key}
                          className="px-5 py-3 text-left text-[11px] font-bold text-accent-400 uppercase tracking-wider"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="w-1 h-3.5 bg-accent-500 rounded-full"></span>
                            ?{key}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-700/15">
                    {results.results.map((row, index) => (
                      <tr
                        key={index}
                        className="hover:bg-primary-800/20 transition-colors group"
                      >
                        <td className="px-4 py-3 text-center text-[11px] text-neutral-600 font-mono">
                          {index + 1}
                        </td>
                        {Object.values(row).map((value: any, i) => {
                          const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
                          const uri = isUri(strVal);
                          return (
                            <td
                              key={i}
                              className="px-5 py-3 text-sm group-hover:text-white transition-colors"
                            >
                              {uri ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-accent-400 text-xs" title={strVal}>
                                    {formatUri(strVal)}
                                  </span>
                                  <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-accent-500/10 text-accent-500/60 border border-accent-500/20">
                                    URI
                                  </span>
                                </div>
                              ) : (
                                <span className={`font-mono text-neutral-300 ${
                                  !isNaN(Number(strVal)) && strVal.length > 0
                                    ? 'text-accent-400'
                                    : ''
                                }`}>
                                  {strVal || <span className="text-neutral-700 italic">null</span>}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Results Footer */}
              <div className="px-5 py-2.5 border-t border-primary-700/20 bg-primary-900/30 flex items-center justify-between">
                <span className="text-[11px] text-neutral-600">
                  Showing {results.results.length} of {results.count} results
                </span>
                <span className="text-[11px] text-neutral-600">
                  {Object.keys(results.results[0]).length} columns
                </span>
              </div>
            </div>
          )}

          {/* Empty results state */}
          {results && results.results.length === 0 && (
            <div className="card p-12 text-center animate-slide-up">
              <div className="w-14 h-14 bg-yellow-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Table2 size={24} className="text-yellow-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">No Results</h3>
              <p className="text-sm text-neutral-400">The query executed successfully but returned no matching data.</p>
            </div>
          )}

          {/* Initial empty state */}
          {!results && !error && !isLoading && (
            <div className="card p-12 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-accent-500/3 rounded-full blur-3xl"></div>
              <div className="relative">
                <div className="w-16 h-16 bg-primary-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary-700/30">
                  <Play size={24} className="text-neutral-600" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">Ready to Query</h3>
                <p className="text-sm text-neutral-500 max-w-md mx-auto">
                  Write a SPARQL query in the editor above and click Execute to run it.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SparqlEditor;
