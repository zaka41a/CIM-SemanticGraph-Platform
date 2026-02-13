import { AlertTriangle, XCircle, CheckCircle } from 'lucide-react';

interface Violation {
  type: string;
  severity: string;
  elementId: string;
  elementName: string;
  actualValue?: number;
  limitValue?: number;
  violationPercentage?: number;
  description: string;
}

interface ViolationsListProps {
  violations: Violation[];
}

export const ViolationsList = ({ violations }: ViolationsListProps) => {
  const formatNumber = (value: number | undefined, decimals: number = 1): string => {
    if (value === undefined) return 'N/A';
    return value.toFixed(decimals);
  };

  if (violations.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="w-14 h-14 bg-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-7 h-7 text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-1">No Violations</h3>
        <p className="text-sm text-neutral-400">All voltages and branch loadings are within limits.</p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-orange-400" />
        System Violations
        <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
          {violations.length}
        </span>
      </h2>
      <div className="space-y-3">
        {violations.map((violation, idx) => {
          const isCritical = violation.severity === 'CRITICAL';
          return (
            <div
              key={idx}
              className={`p-4 rounded-xl border transition-colors ${
                isCritical
                  ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/[0.15]'
                  : 'bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/[0.15]'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Icon in colored circle */}
                <div className={`flex-shrink-0 p-2 rounded-lg ${
                  isCritical ? 'bg-red-500/20' : 'bg-yellow-500/20'
                }`}>
                  {isCritical ? (
                    <XCircle className="w-5 h-5 text-red-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="font-medium text-sm text-white">{violation.elementName}</span>
                    {/* Severity badge pill */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isCritical
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    }`}>
                      {violation.severity}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-white/10 rounded text-neutral-400">
                      {violation.type}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed">{violation.description}</p>
                  {violation.violationPercentage !== undefined && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 max-w-[200px] h-1.5 bg-primary-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isCritical ? 'bg-red-500' : 'bg-yellow-500'}`}
                          style={{ width: `${Math.min(100, Math.abs(violation.violationPercentage))}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-neutral-400">
                        {formatNumber(violation.violationPercentage)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
