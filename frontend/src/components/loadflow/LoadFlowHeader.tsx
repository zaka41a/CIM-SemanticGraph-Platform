import { Zap, Activity, Loader2, FileText } from 'lucide-react';
import type { LoadFlowMethodInfo, CalculationMethod } from '@/types';

interface LoadFlowHeaderProps {
  isCalculating: boolean;
  onCalculate: () => void;
  onExportPDF?: () => void;
  isExporting?: boolean;
  hasResults?: boolean;
  selectedMethod: CalculationMethod;
  onMethodChange: (method: CalculationMethod) => void;
  availableMethods: LoadFlowMethodInfo[];
}

export const LoadFlowHeader = ({
  isCalculating,
  onCalculate,
  onExportPDF,
  isExporting,
  hasResults,
  selectedMethod,
  onMethodChange,
  availableMethods,
}: LoadFlowHeaderProps) => {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800/50 via-primary-900/50 to-primary-950/50 p-8 border border-primary-700/30">
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl"></div>
      <div className="relative z-10 flex flex-col gap-6">
        {/* Title Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-accent-500 mb-1">Load Flow Analysis</h1>
              <p className="text-neutral-300">Power system load flow calculations and network analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasResults && onExportPDF && (
              <button
                onClick={onExportPDF}
                disabled={isExporting}
                className="flex items-center gap-2 px-6 py-3 bg-primary-700 hover:bg-primary-600 text-white rounded-xl transition-all font-medium shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <FileText className="w-5 h-5" />
                )}
                {isExporting ? 'Exporting...' : 'Export PDF'}
              </button>
            )}
            <button
              onClick={onCalculate}
              disabled={isCalculating}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 disabled:from-neutral-600 disabled:to-neutral-700 disabled:cursor-not-allowed text-white rounded-xl transition-all font-medium shadow-lg shadow-accent-500/20 hover:shadow-xl hover:shadow-accent-500/30 active:scale-[0.98]"
            >
              {isCalculating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Activity className="w-5 h-5" />
                  Calculate Load Flow
                </>
              )}
            </button>
          </div>
        </div>

        {/* Method Segmented Control */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-neutral-400">Method:</span>
          <div className="inline-flex items-center bg-primary-900/60 rounded-xl p-1 border border-primary-700/30">
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
    </div>
  );
};
