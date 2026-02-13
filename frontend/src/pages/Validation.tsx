import { useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle, Loader2, RefreshCw, Info, FileWarning, Clock, Hash, Layers, Zap } from 'lucide-react';
import { apiService } from '@/services/api';

interface Violation {
  path: string;
  message: string;
  severity: string;
  focusNode: string | null;
  value: string | null;
}

interface ValidationResult {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  violations: Violation[];
  triplesValidated: number;
  executionTimeMs: number;
  message: string;
}

const Validation = () => {
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    setIsValidating(true);
    setError(null);
    setResult(null);

    try {
      const response = await apiService.validateSHACL();
      setResult(response);
    } catch (err: any) {
      setError(err.message || 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'ERROR':
      case 'VIOLATION':
        return 'text-red-400 bg-red-500/10 border-red-500/30';
      case 'WARNING':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'INFO':
        return 'text-accent-400 bg-accent-500/10 border-accent-500/30';
      default:
        return 'text-neutral-400 bg-neutral-500/10 border-neutral-500/30';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'ERROR':
      case 'VIOLATION':
        return <XCircle size={16} />;
      case 'WARNING':
        return <AlertTriangle size={16} />;
      case 'INFO':
        return <Info size={16} />;
      default:
        return <FileWarning size={16} />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800/50 via-primary-900/50 to-primary-950/50 p-8 border border-primary-700/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl shadow-lg shadow-accent-500/20">
              <ShieldCheck size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">SHACL Validation</h1>
              <p className="text-neutral-300">
                Validate your CIM Knowledge Graph against SHACL constraints
              </p>
            </div>
          </div>
          <button
            onClick={handleValidate}
            disabled={isValidating}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white rounded-xl font-semibold shadow-lg shadow-accent-500/20 transition-all duration-200 hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>Validating...</span>
              </>
            ) : (
              <>
                <RefreshCw size={20} />
                <span>Run Validation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 p-5 animate-slide-up">
          <div className="relative flex items-start gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg flex-shrink-0">
              <XCircle size={20} className="text-red-400" />
            </div>
            <div>
              <h4 className="font-semibold text-red-400 mb-1">Validation Error</h4>
              <p className="text-sm text-red-300/90">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6 animate-slide-up">
          {/* Summary Card */}
          <div className={`rounded-2xl border overflow-hidden bg-white/[0.03] backdrop-blur-xl ${
            result.valid ? 'border-emerald-500/30' : 'border-red-500/30'
          }`}>
            <div className={`p-6 border-b ${
              result.valid
                ? 'bg-gradient-to-r from-emerald-500/10 to-green-500/5 border-emerald-500/20'
                : 'bg-gradient-to-r from-red-500/10 to-orange-500/5 border-red-500/20'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  result.valid ? 'bg-emerald-500/20' : 'bg-red-500/20'
                }`}>
                  {result.valid ? (
                    <CheckCircle size={28} className="text-emerald-400" />
                  ) : (
                    <AlertTriangle size={28} className="text-red-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {result.valid ? 'Validation Passed' : 'Validation Failed'}
                  </h3>
                  <p className={`text-sm mt-0.5 ${result.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.message}
                  </p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-primary-800/30 rounded-xl border border-accent-500/20 hover:border-accent-500/40 transition-colors text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Hash size={14} className="text-accent-400" />
                  <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Triples</span>
                </div>
                <div className="text-3xl font-bold text-accent-400">
                  {result.triplesValidated.toLocaleString()}
                </div>
              </div>
              <div className="p-4 bg-primary-800/30 rounded-xl border border-red-500/20 hover:border-red-500/40 transition-colors text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <XCircle size={14} className="text-red-400" />
                  <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Errors</span>
                </div>
                <div className="text-3xl font-bold text-red-400">
                  {result.errorCount}
                </div>
              </div>
              <div className="p-4 bg-primary-800/30 rounded-xl border border-yellow-500/20 hover:border-yellow-500/40 transition-colors text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <AlertTriangle size={14} className="text-yellow-400" />
                  <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Warnings</span>
                </div>
                <div className="text-3xl font-bold text-yellow-400">
                  {result.warningCount}
                </div>
              </div>
              <div className="p-4 bg-primary-800/30 rounded-xl border border-accent-500/20 hover:border-accent-500/40 transition-colors text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Clock size={14} className="text-accent-400" />
                  <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Time</span>
                </div>
                <div className="text-3xl font-bold text-accent-400">
                  {result.executionTimeMs}<span className="text-lg text-neutral-500 ml-0.5">ms</span>
                </div>
              </div>
            </div>
          </div>

          {/* Violations List */}
          {result.violations.length > 0 && (
            <div className="card relative overflow-hidden">
              <div className="p-5 border-b border-primary-700/30 bg-gradient-to-r from-primary-800/30 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <AlertTriangle size={18} className="text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Constraint Violations</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {result.violations.length} issues detected
                    </p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-primary-700/20">
                {result.violations.map((violation, index) => (
                  <div key={index} className="p-4 hover:bg-primary-800/20 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${getSeverityColor(violation.severity)} border flex-shrink-0`}>
                        {getSeverityIcon(violation.severity)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${getSeverityColor(violation.severity)} border`}>
                            {violation.severity}
                          </span>
                          <span className="text-xs text-neutral-500 truncate font-mono">
                            {violation.path}
                          </span>
                        </div>
                        <p className="text-sm text-white mb-2 leading-relaxed">{violation.message}</p>
                        {violation.focusNode && (
                          <p className="text-xs text-neutral-400 truncate">
                            <span className="text-neutral-600">Node:</span> <span className="font-mono text-accent-400">{violation.focusNode}</span>
                          </p>
                        )}
                        {violation.value && (
                          <p className="text-xs text-neutral-400 truncate mt-0.5">
                            <span className="text-neutral-600">Value:</span> <span className="font-mono text-accent-400">{violation.value}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      {!result && !error && !isValidating && (
        <div className="card relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-500/5 rounded-full blur-3xl"></div>
          <div className="p-6 border-b border-primary-700/30 bg-gradient-to-r from-primary-800/30 to-transparent">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent-500/20 rounded-lg">
                <Info size={18} className="text-accent-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">About SHACL Validation</h3>
                <p className="text-xs text-neutral-400 mt-0.5">Shapes Constraint Language for RDF</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-neutral-300 leading-relaxed">
              SHACL (Shapes Constraint Language) is a W3C standard for validating RDF graphs against a set of conditions called "shapes".
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative overflow-hidden rounded-xl bg-primary-800/30 border border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                <div className="p-4 pl-5">
                  <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400" />
                    What it validates
                  </h4>
                  <ul className="text-sm text-neutral-400 space-y-2">
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>Required properties present</li>
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>Property value types correct</li>
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>Cardinality constraints</li>
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>Value ranges and formats</li>
                  </ul>
                </div>
              </div>
              <div className="relative overflow-hidden rounded-xl bg-primary-800/30 border border-accent-500/20 hover:border-accent-500/40 transition-colors">
                <div className="absolute top-0 left-0 w-1 h-full bg-accent-500" />
                <div className="p-4 pl-5">
                  <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-accent-400" />
                    CIM Constraints
                  </h4>
                  <ul className="text-sm text-neutral-400 space-y-2">
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-accent-400 rounded-full"></span>Substation has name</li>
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-accent-400 rounded-full"></span>VoltageLevel has BaseVoltage</li>
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-accent-400 rounded-full"></span>Terminal has ConductingEquipment</li>
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-accent-400 rounded-full"></span>BaseVoltage has positive value</li>
                  </ul>
                </div>
              </div>
            </div>
            <p className="text-sm text-neutral-500 mt-4">
              Click "Run Validation" to validate your Knowledge Graph against the CIM SHACL shapes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Validation;
