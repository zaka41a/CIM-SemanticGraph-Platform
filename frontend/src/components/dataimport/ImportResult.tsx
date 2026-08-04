import { CheckCircle, XCircle, AlertTriangle, Database, Sparkles, Zap, Clock, LayoutDashboard, ShieldCheck, MessageSquare, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ImportResultProps {
  result: any;
  error: string | null;
}

export const ImportResult = ({ result, error }: ImportResultProps) => {
  const navigate = useNavigate();

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

          {/* Next steps */}
          <div className="mt-5 pt-4 border-t border-primary-700/30">
            <p className="text-xs font-semibold text-neutral-400 mb-3 uppercase tracking-wider">Next Steps</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-700/50 hover:bg-primary-700 border border-primary-600/50 hover:border-accent-500/50 text-sm text-neutral-300 hover:text-white transition-all"
              >
                <LayoutDashboard size={15} className="text-accent-400" />
                View Dashboard
                <ArrowRight size={13} className="text-neutral-500" />
              </button>
              <button
                onClick={() => navigate('/validation')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-700/50 hover:bg-primary-700 border border-primary-600/50 hover:border-emerald-500/50 text-sm text-neutral-300 hover:text-white transition-all"
              >
                <ShieldCheck size={15} className="text-emerald-400" />
                Run SHACL Validation
                <ArrowRight size={13} className="text-neutral-500" />
              </button>
              <button
                onClick={() => navigate('/chat')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-700/50 hover:bg-primary-700 border border-primary-600/50 hover:border-sky-500/50 text-sm text-neutral-300 hover:text-white transition-all"
              >
                <MessageSquare size={15} className="text-sky-400" />
                Ask GraphRAG
                <ArrowRight size={13} className="text-neutral-500" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
