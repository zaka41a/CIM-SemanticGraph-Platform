import { CheckCircle, AlertTriangle, Clock, Hash, Cpu, Calendar } from 'lucide-react';

interface CalculationInfoProps {
  converged: boolean;
  iterations: number;
  executionTimeMs: number;
  calculationMethod: string;
  timestamp: string;
}

export const CalculationInfo = ({
  converged,
  iterations,
  executionTimeMs,
  calculationMethod,
  timestamp,
}: CalculationInfoProps) => {
  return (
    <div
      className={`rounded-2xl border overflow-hidden ${
        converged
          ? 'border-emerald-500/30 bg-white/[0.03] backdrop-blur-xl'
          : 'border-red-500/30 bg-white/[0.03] backdrop-blur-xl'
      }`}
    >
      {/* Status Header */}
      <div
        className={`flex items-center gap-3 px-6 py-4 border-b ${
          converged
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : 'bg-red-500/10 border-red-500/20'
        }`}
      >
        {converged ? (
          <CheckCircle className="w-5 h-5 text-emerald-400" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-red-400" />
        )}
        <span className={`text-sm font-semibold ${converged ? 'text-emerald-300' : 'text-red-300'}`}>
          {converged ? 'Load Flow Converged Successfully' : 'Load Flow Did Not Converge'}
        </span>
      </div>

      {/* Metric Chips Grid */}
      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-primary-800/40 rounded-lg p-3 border border-primary-700/30">
          <div className="flex items-center gap-2 mb-1">
            <Hash className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Iterations</span>
          </div>
          <span className="text-lg font-bold text-accent-400">{iterations}</span>
        </div>

        <div className="bg-primary-800/40 rounded-lg p-3 border border-primary-700/30">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Exec. Time</span>
          </div>
          <span className="text-lg font-bold text-accent-400">{executionTimeMs}ms</span>
        </div>

        <div className="bg-primary-800/40 rounded-lg p-3 border border-primary-700/30">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Method</span>
          </div>
          <span className="text-lg font-bold text-accent-400">{calculationMethod}</span>
        </div>

        <div className="bg-primary-800/40 rounded-lg p-3 border border-primary-700/30">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Timestamp</span>
          </div>
          <span className="text-sm font-semibold text-neutral-300">
            {timestamp
              ? new Date(timestamp.includes('Z') || timestamp.includes('+') ? timestamp : timestamp + 'Z').toLocaleTimeString()
              : '-'}
          </span>
        </div>
      </div>
    </div>
  );
};
