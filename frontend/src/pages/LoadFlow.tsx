import { useState } from 'react';
import { AlertTriangle, BarChart3, Database, Loader2, ArrowRight, ArrowUpDown, GitBranch, Map, Table2 } from 'lucide-react';
import { LoadFlowHeader } from '@/components/loadflow/LoadFlowHeader';
import { CalculationInfo } from '@/components/loadflow/CalculationInfo';
import { LoadFlowStats } from '@/components/loadflow/LoadFlowStats';
import { BusTable } from '@/components/loadflow/BusTable';
import { ViolationsList } from '@/components/loadflow/ViolationsList';
import { NetworkTopologyMap } from '@/components/loadflow/NetworkTopologyMap';
import { useLoadFlow } from '@/hooks/useLoadFlow';
import { Link } from 'react-router-dom';
import EmptyState from '@/components/ui/EmptyState';
import type { LoadFlowBranchResult, LoadFlowBusResult } from '@/types';


const BranchTable = ({ branches }: { branches: LoadFlowBranchResult[] }) => {
  const [sortConfig, setSortConfig] = useState<{ key: keyof LoadFlowBranchResult; direction: 'asc' | 'desc' } | null>(null);

  const formatNumber = (value: number | undefined, decimals: number = 2): string => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'number' && isNaN(value)) return 'N/A';
    return (value as number).toFixed(decimals);
  };

  const handleSort = (key: keyof LoadFlowBranchResult) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sorted = sortConfig
    ? [...branches].sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortConfig.direction === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
      })
    : branches;

  const SortableHeader = ({ label, sortKey }: { label: string; sortKey: keyof LoadFlowBranchResult }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-2">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === sortKey ? 'text-accent-400' : ''}`} />
      </div>
    </th>
  );

  const getLoadingColor = (pct: number) => {
    if (pct > 100) return 'text-red-400';
    if (pct > 80) return 'text-yellow-400';
    return 'text-emerald-400';
  };

  const getLoadingBarColor = (pct: number) => {
    if (pct > 100) return 'bg-red-500';
    if (pct > 80) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-primary-700/30 bg-gradient-to-r from-primary-800/30 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-accent-400" />
              Branch Loadings
            </h2>
            <p className="text-sm text-neutral-400 mt-1">Line and transformer power flows</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-accent-500/20 text-accent-400 border border-accent-500/30">
            {branches.length} branches
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-primary-800/60 to-primary-800/30 border-b border-primary-700/30">
            <tr>
              <SortableHeader label="Branch" sortKey="branchName" />
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-neutral-400 uppercase tracking-wider">From → To</th>
              <SortableHeader label="P Flow (MW)" sortKey="fromActivePowerMw" />
              <SortableHeader label="Losses (MW)" sortKey="lossActivePowerMw" />
              <SortableHeader label="Loading %" sortKey="loadingPercentage" />
              <th className="px-4 py-3 text-center text-xs font-medium text-neutral-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-700/20">
            {sorted.map((branch) => (
              <tr key={branch.branchId} className="hover:bg-primary-800/20 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-white">
                  <div className="flex flex-col">
                    <span>{branch.branchName || branch.branchId}</span>
                    {branch.branchId !== branch.branchName && (
                      <span className="text-xs text-neutral-500">{branch.branchId}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    branch.branchType === 'TRANSFORMER'
                      ? 'bg-primary-700/50 text-neutral-300 border border-primary-600/50'
                      : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  }`}>
                    {branch.branchType}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-center">
                  <div className="flex items-center justify-center gap-1 text-neutral-400">
                    <span className="text-xs font-mono truncate max-w-[80px]" title={branch.fromBusId}>{branch.fromBusId.slice(-8)}</span>
                    <ArrowRight className="w-3 h-3 text-accent-400 flex-shrink-0" />
                    <span className="text-xs font-mono truncate max-w-[80px]" title={branch.toBusId}>{branch.toBusId.slice(-8)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-white">
                  {formatNumber(branch.fromActivePowerMw)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono">
                  <span className={branch.lossActivePowerMw > 1 ? 'text-accent-400' : 'text-neutral-400'}>
                    {formatNumber(branch.lossActivePowerMw, 3)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-semibold ${getLoadingColor(branch.loadingPercentage)}`}>
                      {formatNumber(branch.loadingPercentage, 1)}%
                    </span>
                    <div className="w-16 h-1.5 bg-primary-800 rounded-full overflow-hidden flex-shrink-0">
                      <div
                        className={`h-full rounded-full transition-all ${getLoadingBarColor(branch.loadingPercentage)}`}
                        style={{ width: `${Math.min(100, branch.loadingPercentage)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    branch.overloaded
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {branch.overloaded ? 'OVERLOADED' : 'OK'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {branches.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <p>No branch data available</p>
        </div>
      )}
    </div>
  );
};

const LoadFlow = () => {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof LoadFlowBusResult;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'tables' | 'topology'>('topology');

  const {
    isCalculating, results, error, networkStatus, calculateLoadFlow,
    selectedMethod, setSelectedMethod, availableMethods,
  } = useLoadFlow();
  const handleSort = (key: keyof LoadFlowBusResult) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedBuses = () => {
    if (!results || !sortConfig) return results?.busResults || [];
    const sorted = [...results.busResults].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      return sortConfig.direction === 'asc' ? Number(aValue) - Number(bValue) : Number(bValue) - Number(aValue);
    });
    return sorted;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <LoadFlowHeader
        isCalculating={isCalculating}
        onCalculate={() => calculateLoadFlow()}
        canCalculate={networkStatus === 'ready' && availableMethods.some(method => method.id === selectedMethod && method.available)}
        selectedMethod={selectedMethod}
        onMethodChange={setSelectedMethod}
        availableMethods={availableMethods}
      />

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <p className="text-sm text-red-300 font-medium">{error}</p>
            </div>
          </div>
        )}

        {networkStatus === 'checking' && (
          <div className="card px-6 py-12 flex justify-center items-center gap-3 text-sm text-neutral-400" role="status">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking network data…
          </div>
        )}

        {networkStatus === 'empty' && (
          <div className="card">
            <EmptyState
              icon={Database}
              title="No network data"
              hint="Import a CIM or Excel file before calculating power flow."
              action={<Link to="/import" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-500 text-primary-950 text-sm font-medium hover:bg-accent-400">Import network data <ArrowRight size={15} /></Link>}
            />
          </div>
        )}

        {networkStatus === 'ready' && !results && !isCalculating && !error && (
          <div className="card">
            <EmptyState
              icon={BarChart3}
              title="Ready to calculate"
              hint="Choose a method, then calculate power flow for the current network."
            />
          </div>
        )}

        {results && (
          <>
          <CalculationInfo
            converged={results.converged}
            iterations={results.iterations}
            executionTimeMs={results.executionTimeMs}
            calculationMethod={results.calculationMethod}
            timestamp={results.timestamp ?? ''}
          />

          <LoadFlowStats statistics={results.statistics} />

          {results.violations && results.violations.length > 0 && (
            <ViolationsList violations={results.violations} />
          )}

          {/* Tab switcher */}
          <div className="card overflow-hidden">
            <div className="flex border-b border-primary-700/30">
              <button
                onClick={() => setActiveTab('topology')}
                className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-all border-b-2 ${
                  activeTab === 'topology'
                    ? 'border-accent-500 text-accent-400 bg-accent-500/5'
                    : 'border-transparent text-neutral-400 hover:text-white hover:bg-primary-800/30'
                }`}
              >
                <Map size={16} />
                Network Topology Map
              </button>
              <button
                onClick={() => setActiveTab('tables')}
                className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-all border-b-2 ${
                  activeTab === 'tables'
                    ? 'border-accent-500 text-accent-400 bg-accent-500/5'
                    : 'border-transparent text-neutral-400 hover:text-white hover:bg-primary-800/30'
                }`}
              >
                <Table2 size={16} />
                Bus & Branch Tables
              </button>
            </div>

            {activeTab === 'topology' && (
              <div className="p-4">
                <NetworkTopologyMap
                  buses={results.busResults || []}
                  branches={results.branchResults || []}
                />
              </div>
            )}

            {activeTab === 'tables' && (
              <div className="p-4 space-y-6">
                <BusTable
                  buses={getSortedBuses()}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
                {results.branchResults && results.branchResults.length > 0 && (
                  <BranchTable branches={results.branchResults} />
                )}
              </div>
            )}
          </div>
          </>
        )}
    </div>
  );
};

export default LoadFlow;
