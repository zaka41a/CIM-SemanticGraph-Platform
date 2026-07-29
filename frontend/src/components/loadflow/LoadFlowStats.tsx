import { Database, Zap, TrendingUp, Activity, AlertTriangle } from 'lucide-react';

interface SystemStatistics {
  totalBuses: number;
  totalBranches: number;
  pvBuses: number;
  pqBuses: number;
  slackBuses: number;
  totalGenerationMw: number | string;
  totalGenerationMvar: number | string;
  totalLoadMw: number | string;
  totalLoadMvar: number | string;
  totalLossesMw: number | string;
  totalLossesMvar: number | string;
  lossPercentage: number | string;
  minVoltagePu: number | string;
  maxVoltagePu: number | string;
  avgVoltagePu: number | string;
  minVoltageBus: string;
  maxVoltageBus: string;
}

interface LoadFlowStatsProps {
  statistics: SystemStatistics;
}

export const LoadFlowStats = ({ statistics }: LoadFlowStatsProps) => {
  const formatNumber = (value: number | string, decimals: number = 1): string => {
    if (typeof value === 'number') {
      if (isNaN(value) || !isFinite(value)) {
        return '0.0';
      }
      return value.toFixed(decimals);
    }
    const num = parseFloat(value || '0');
    if (isNaN(num) || !isFinite(num)) {
      return '0.0';
    }
    return num.toFixed(decimals);
  };

  // Calculate power balance
  const totalGen = typeof statistics.totalGenerationMw === 'number'
    ? statistics.totalGenerationMw
    : parseFloat(statistics.totalGenerationMw || '0');
  const totalLoad = typeof statistics.totalLoadMw === 'number'
    ? statistics.totalLoadMw
    : parseFloat(statistics.totalLoadMw || '0');
  const totalLosses = typeof statistics.totalLossesMw === 'number'
    ? statistics.totalLossesMw
    : parseFloat(statistics.totalLossesMw || '0');

  const powerBalance = totalGen - totalLoad - totalLosses;
  const balancePercent = totalLoad > 0 ? Math.abs(powerBalance / totalLoad * 100) : 0;
  const isImbalanced = balancePercent > 2; // 2% threshold
  const isCriticalImbalance = balancePercent > 5; // 5% threshold

  return (
    <div className="space-y-4">
      {/* Power Balance Alert */}
      {isImbalanced && (
        <div className={`card p-6 ${isCriticalImbalance ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${isCriticalImbalance ? 'bg-red-500/20' : 'bg-yellow-500/20'}`}>
              <AlertTriangle className={`w-6 h-6 ${isCriticalImbalance ? 'text-red-400' : 'text-yellow-400'}`} />
            </div>
            <div className="flex-1">
              <h4 className={`text-xl font-semibold mb-4 ${isCriticalImbalance ? 'text-red-300' : 'text-yellow-300'}`}>
                Power Imbalance Detected
              </h4>

              <div className="space-y-3">
                <div className="text-neutral-300">
                  <span className="font-medium text-base">Power Balance:</span>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-primary-800/30 rounded-lg border border-primary-700/50">
                      <div className="text-xs text-neutral-500 mb-1">Generation</div>
                      <div className="font-semibold text-white text-base">{formatNumber(totalGen)} MW</div>
                    </div>
                    <div className="p-3 bg-primary-800/30 rounded-lg border border-primary-700/50">
                      <div className="text-xs text-neutral-500 mb-1">Load</div>
                      <div className="font-semibold text-white text-base">{formatNumber(totalLoad)} MW</div>
                    </div>
                    <div className="p-3 bg-primary-800/30 rounded-lg border border-primary-700/50">
                      <div className="text-xs text-neutral-500 mb-1">Losses</div>
                      <div className="font-semibold text-white text-base">{formatNumber(totalLosses)} MW</div>
                    </div>
                    <div className={`p-3 rounded-lg border ${isCriticalImbalance ? 'bg-red-500/20 border-red-500/50' : 'bg-yellow-500/20 border-yellow-500/50'}`}>
                      <div className="text-xs text-neutral-300 mb-1">Balance</div>
                      <div className={`font-semibold text-base ${isCriticalImbalance ? 'text-red-300' : 'text-yellow-300'}`}>
                        {powerBalance >= 0 ? '+' : ''}{formatNumber(powerBalance)} MW
                      </div>
                    </div>
                  </div>
                </div>
                <div className={`p-4 rounded-lg ${isCriticalImbalance ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
                  <span className="font-medium text-neutral-300">Imbalance: </span>
                  <span className={`font-bold ${isCriticalImbalance ? 'text-red-300' : 'text-yellow-300'}`}>
                    {formatNumber(balancePercent, 2)}%
                  </span>
                  <span className="text-neutral-400 ml-2">
                    • {powerBalance > 0 ? 'Reduce generation or add load' : 'Add generation or reduce load'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Buses */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="w-10 h-10 bg-accent-500/20 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-accent-400" />
          </div>
          <span className="text-xs text-neutral-500">Network</span>
        </div>
        <p className="text-2xl font-bold text-white">{statistics.totalBuses}</p>
        <p className="text-sm text-neutral-400">Buses</p>
        <div className="mt-2 text-xs text-neutral-500">
          {statistics.totalBranches} branches
        </div>
      </div>

      {/* Generation */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-xs text-neutral-500">Generation</span>
        </div>
        <p className="text-2xl font-bold text-white">
          {formatNumber(statistics.totalGenerationMw)}
        </p>
        <p className="text-sm text-neutral-400">MW</p>
        <div className="mt-2 text-xs text-neutral-500">
          {formatNumber(statistics.totalGenerationMvar)} Mvar
        </div>
      </div>

      {/* Load */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary-400" />
          </div>
          <span className="text-xs text-neutral-500">Load</span>
        </div>
        <p className="text-2xl font-bold text-white">
          {formatNumber(statistics.totalLoadMw)}
        </p>
        <p className="text-sm text-neutral-400">MW</p>
        <div className="mt-2 text-xs text-neutral-500">
          {formatNumber(statistics.totalLoadMvar)} Mvar
        </div>
      </div>

      {/* Losses */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-orange-400" />
          </div>
          <span className="text-xs text-neutral-500">Losses</span>
        </div>
        <p className="text-2xl font-bold text-white">
          {formatNumber(statistics.totalLossesMw, 2)}
        </p>
        <p className="text-sm text-neutral-400">MW</p>
        <div className="mt-2 text-xs text-neutral-500">
          {formatNumber(statistics.lossPercentage, 2)}% of load
        </div>
      </div>
    </div>
    </div>
  );
};
