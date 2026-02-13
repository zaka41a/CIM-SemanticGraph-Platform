import { CheckCircle, XCircle, AlertTriangle, Database, Sparkles, Zap, Clock } from 'lucide-react';

interface ImportResultProps {
  result: any;
  error: string | null;
}

export const ImportResult = ({ result, error }: ImportResultProps) => {
  if (error) {
    return (
      <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
        <div className="flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-300 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  // Debug: log the result structure
  console.log('Import result structure:', result);

  // Extract values with proper fallback
  const originalTriples = result.statistics?.originalTriples ??
                          result.originalTriples ??
                          (result.triplesCreated !== undefined ? result.triplesCreated : 0);

  const inferredTriples = result.statistics?.inferredTriples ??
                          result.inferredTriples ??
                          (result.triplesCreated !== undefined ? 0 : 0);

  const totalTriples = result.statistics?.totalTriples ??
                       result.totalTriples ??
                       (result.triplesCreated !== undefined ? result.triplesCreated : 0);

  return (
    <div className="mt-6 space-y-4">
      <div className="card relative overflow-hidden">
        <div className="p-5 border-b border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-green-500/5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Import Successful</h3>
              <p className="text-sm text-neutral-300 mt-0.5">
                Your CIM data has been imported to the Knowledge Graph
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          {/* Warning if no triples were created */}
          {totalTriples === 0 && (
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-300">
                  <strong>Warning:</strong> No triples were created. This might indicate:
                  <ul className="list-disc list-inside mt-2 ml-4 text-xs">
                    <li>Sheet names don't match expected format (Substations, Buses, Lines, etc.)</li>
                    <li>Column headers are missing or incorrect</li>
                    <li>Data rows are empty</li>
                  </ul>
                  <div className="mt-2 text-xs">
                    Check the browser console and backend logs for details.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-primary-800/50 rounded-xl border border-accent-500/20 hover:border-accent-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Database size={14} className="text-accent-400" />
                <span className="text-xs text-neutral-400">Original Triples</span>
              </div>
              <div className="text-lg font-bold text-accent-400">
                {originalTriples}
              </div>
            </div>
            <div className="p-3 bg-primary-800/50 rounded-xl border border-accent-500/20 hover:border-accent-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-accent-400" />
                <span className="text-xs text-neutral-400">Inferred Triples</span>
              </div>
              <div className="text-lg font-bold text-accent-400">
                {inferredTriples}
              </div>
            </div>
            <div className="p-3 bg-primary-800/50 rounded-xl border border-accent-500/20 hover:border-accent-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-accent-400" />
                <span className="text-xs text-neutral-400">Total Triples</span>
              </div>
              <div className="text-lg font-bold text-accent-400">
                {totalTriples}
              </div>
            </div>
            <div className="p-3 bg-primary-800/50 rounded-xl border border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={14} className="text-emerald-400" />
                <span className="text-xs text-neutral-400">Status</span>
              </div>
              <div className="text-lg font-bold">
                {result.success === false ? (
                  <span className="text-yellow-400 flex items-center gap-1">
                    <AlertTriangle size={16} /> Partial
                  </span>
                ) : (
                  <span className="text-emerald-400">Success</span>
                )}
              </div>
            </div>
          </div>

          {/* Show additional info for Excel imports */}
          {result.entitiesImported !== undefined && (
            <div className="mt-4 p-3 bg-primary-800/30 rounded-xl border border-accent-500/20">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} className="text-accent-400" />
                <span className="text-xs text-neutral-400">Entities Imported</span>
              </div>
              <div className="text-sm font-medium text-white">{result.entitiesImported} entities</div>
              {result.sheetsProcessed && result.sheetsProcessed.length > 0 && (
                <div className="text-xs text-neutral-500 mt-1">
                  Sheets: {result.sheetsProcessed.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
