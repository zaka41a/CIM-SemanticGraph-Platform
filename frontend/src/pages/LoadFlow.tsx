import { useState } from 'react';
import { AlertTriangle, BarChart3, Activity, ArrowRight, ArrowUpDown, GitBranch } from 'lucide-react';
import { LoadFlowHeader } from '@/components/loadflow/LoadFlowHeader';
import { CalculationInfo } from '@/components/loadflow/CalculationInfo';
import { LoadFlowStats } from '@/components/loadflow/LoadFlowStats';
import { BusTable } from '@/components/loadflow/BusTable';
import { ViolationsList } from '@/components/loadflow/ViolationsList';
import { useLoadFlow } from '@/hooks/useLoadFlow';
import api from '@/services/api';

interface BusResult {
  busId: string;
  busName: string;
  busType: string;
  voltageMagnitude: number;
  voltageAngle: number;
  voltageKv: number;
  activePowerMw: number;
  reactivePowerMvar: number;
  generationMw: number;
  generationMvar: number;
  loadMw: number;
  loadMvar: number;
  withinLimits: boolean;
  voltagePercentage: number;
}

interface BranchResult {
  branchId: string;
  branchName: string;
  branchType: string;
  fromBusId: string;
  toBusId: string;
  fromActivePowerMw: number;
  fromReactivePowerMvar: number;
  toActivePowerMw: number;
  toReactivePowerMvar: number;
  lossActivePowerMw: number;
  lossReactivePowerMvar: number;
  currentMagnitude: number;
  loadingPercentage: number;
  overloaded: boolean;
}

interface LoadFlowResponse {
  converged: boolean;
  iterations: number;
  tolerance: number;
  executionTimeMs: number;
  timestamp: string;
  calculationMethod: string;
  busResults: BusResult[];
  branchResults: BranchResult[];
  statistics: any;
  violations: any[];
  targetBusId?: string;
}

// Inline BranchTable component
const BranchTable = ({ branches }: { branches: BranchResult[] }) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const formatNumber = (value: number | undefined, decimals: number = 2): string => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'number' && isNaN(value)) return 'N/A';
    return (value as number).toFixed(decimals);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sorted = sortConfig
    ? [...branches].sort((a, b) => {
        const aVal = (a as any)[sortConfig.key];
        const bVal = (b as any)[sortConfig.key];
        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      })
    : branches;

  const SortableHeader = ({ label, sortKey }: { label: string; sortKey: string }) => (
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
                      ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30'
                      : 'bg-accent-500/20 text-accent-400 border border-accent-500/30'
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
                  <span className={branch.lossActivePowerMw > 1 ? 'text-orange-400' : 'text-neutral-400'}>
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
                    {branch.overloaded ? 'OVERLOADED' : '✓ OK'}
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
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const {
    isCalculating, results, error, calculateLoadFlow,
    selectedMethod, setSelectedMethod, availableMethods,
  } = useLoadFlow();
  const [exportingPDF, setExportingPDF] = useState(false);

  const handleExportPDF = async () => {
    setExportingPDF(true);
    try {
      const blob = await api.generateLoadFlowReport();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LoadFlow_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export PDF error:', err);
      alert('Erreur lors de la génération du rapport PDF');
    } finally {
      setExportingPDF(false);
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedBuses = () => {
    if (!results || !sortConfig) return results?.busResults || [];
    const sorted = [...results.busResults].sort((a, b) => {
      const aValue = (a as any)[sortConfig.key];
      const bValue = (b as any)[sortConfig.key];
      if (typeof aValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
    });
    return sorted;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <LoadFlowHeader
        isCalculating={isCalculating}
        onCalculate={() => calculateLoadFlow()}
        onExportPDF={handleExportPDF}
        isExporting={exportingPDF}
        hasResults={!!results}
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

        {!results && !isCalculating && !error && (
          <div className="card text-center py-20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl"></div>
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-accent-500/20 to-accent-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-accent-500/10 animate-pulse">
                <BarChart3 className="w-10 h-10 text-accent-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-3">No Load Flow Results Yet</h2>
              <p className="text-neutral-400 mb-2 max-w-lg mx-auto">
                Click "Calculate Load Flow" to perform power system analysis
              </p>
              <div className="flex items-center justify-center gap-4 mt-4 text-sm text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4" /> DC Power Flow
                </span>
                <span className="text-neutral-700">|</span>
                <span className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4" /> AC Newton-Raphson
                </span>
                <span className="text-neutral-700">|</span>
                <span className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4" /> Optimal Power Flow
                </span>
              </div>
            </div>
          </div>
        )}

        {results && (
          <>
          <CalculationInfo
            converged={results.converged}
            iterations={results.iterations}
            executionTimeMs={results.executionTimeMs}
            calculationMethod={results.calculationMethod}
            timestamp={results.timestamp}
          />

          <LoadFlowStats statistics={results.statistics} />

          <ViolationsList violations={results.violations} />

          <BusTable
            buses={getSortedBuses()}
            sortConfig={sortConfig}
            onSort={handleSort}
          />

          {results.branchResults && results.branchResults.length > 0 && (
            <BranchTable branches={results.branchResults} />
          )}
          </>
        )}
    </div>
  );
};

export default LoadFlow;
