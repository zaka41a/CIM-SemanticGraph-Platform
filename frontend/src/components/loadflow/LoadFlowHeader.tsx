import { Zap, Activity, Loader2 } from 'lucide-react';
import type { LoadFlowMethodInfo, CalculationMethod } from '@/types';
import PageHeader from '@/components/PageHeader';

interface LoadFlowHeaderProps {
  isCalculating: boolean;
  onCalculate: () => void;
  canCalculate: boolean;
  selectedMethod: CalculationMethod;
  onMethodChange: (method: CalculationMethod) => void;
  availableMethods: LoadFlowMethodInfo[];
}

export const LoadFlowHeader = ({
  isCalculating,
  onCalculate,
  canCalculate,
  selectedMethod,
  onMethodChange,
  availableMethods,
}: LoadFlowHeaderProps) => {
  return (
    <div className="space-y-4">
      <PageHeader
        icon={Zap}
        iconColor="text-yellow-400"
        title="Load Flow Analysis"
        subtitle="Power system load flow calculations and network analysis"
        actions={
          <>
            <button
              onClick={onCalculate}
              disabled={isCalculating || !canCalculate}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all disabled:opacity-50"
            >
              {isCalculating ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</> : <><Activity className="w-4 h-4" /> Calculate Load Flow</>}
            </button>
          </>
        }
      />

      {/* Method Segmented Control */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-neutral-400">Method:</span>
        <div className="inline-flex flex-wrap items-center bg-primary-900/60 rounded-xl p-1 border border-primary-700/30">
          {availableMethods.map((m) => {
            const isActive = selectedMethod === m.id;
            const isDisabled = !m.available || isCalculating;
            return (
              <button
                key={m.id}
                onClick={() => !isDisabled && onMethodChange(m.id)}
                disabled={isDisabled}
                className={`relative px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/30'
                    : isDisabled
                      ? 'text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-300 hover:text-white hover:bg-primary-700/50'
                }`}
                title={m.description}
              >
                {m.name}
                {!m.available && (
                  <span className="ml-1.5 text-[10px] text-neutral-500 font-normal">(offline)</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
