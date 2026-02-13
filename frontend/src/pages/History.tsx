import { useState, useEffect } from 'react';
import {
  File,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Search,
  Filter,
  FileCheck,
  Lightbulb,
  Database
} from 'lucide-react';
import { apiService } from '@/services/api';

interface ImportHistoryItem {
  id: string;
  fileName: string;
  fileSize: number;
  importDate: Date;
  status: 'success' | 'failed' | 'processing';
  triplesCount?: number;
  duration?: number;
  errorMessage?: string;
}

const History = () => {
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await apiService.getImportHistory();

      const transformedHistory: ImportHistoryItem[] = (response || []).map((item: any) => ({
        id: item.id,
        fileName: item.fileName,
        fileSize: item.fileSize,
        importDate: new Date(item.importDate),
        status: item.status?.toLowerCase() || 'unknown',
        triplesCount: item.triplesCount || 0,
        duration: item.duration || 0,
        errorMessage: item.errorMessage
      }));

      setHistory(transformedHistory);
      setError(null);
    } catch (error: any) {
      console.error('Error fetching history:', error);
      setError(error.message || 'Failed to load import history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const filteredHistory = history.filter(item => {
    const matchesSearch = item.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: history.length,
    success: history.filter(h => h.status === 'success').length,
    failed: history.filter(h => h.status === 'failed').length,
    totalTriples: history.reduce((acc, h) => acc + (h.triplesCount || 0), 0)
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800/50 via-primary-900/50 to-primary-950/50 p-8 border border-primary-700/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl shadow-lg shadow-accent-500/20">
              <FileCheck size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">Import History</h1>
              <p className="text-neutral-300">
                Track and manage all CIM file imports to your Knowledge Graph
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card relative overflow-hidden group hover:border-accent-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent-500/5 rounded-full blur-2xl group-hover:bg-accent-500/10 transition-all duration-500"></div>
          <div className="p-6 relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-accent-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <File size={24} className="text-accent-400" />
              </div>
            </div>
            <p className="text-neutral-400 text-sm mb-2 font-semibold">Total Imports</p>
            <p className="text-4xl font-bold text-accent-500">{stats.total}</p>
          </div>
        </div>

        <div className="card relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all duration-500"></div>
          <div className="p-6 relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <CheckCircle2 size={24} className="text-emerald-400" />
              </div>
            </div>
            <p className="text-neutral-400 text-sm mb-2 font-semibold">Successful</p>
            <p className="text-4xl font-bold text-emerald-400">{stats.success}</p>
          </div>
        </div>

        <div className="card relative overflow-hidden group hover:border-red-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all duration-500"></div>
          <div className="p-6 relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <XCircle size={24} className="text-red-400" />
              </div>
            </div>
            <p className="text-neutral-400 text-sm mb-2 font-semibold">Failed</p>
            <p className="text-4xl font-bold text-red-400">{stats.failed}</p>
          </div>
        </div>

        <div className="card relative overflow-hidden group hover:border-accent-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent-500/5 rounded-full blur-2xl group-hover:bg-accent-500/10 transition-all duration-500"></div>
          <div className="p-6 relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-accent-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Database size={24} className="text-accent-400" />
              </div>
            </div>
            <p className="text-neutral-400 text-sm mb-2 font-semibold">Total Triples</p>
            <p className="text-4xl font-bold text-accent-400">{stats.totalTriples.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Info Message */}
      {history.length === 0 && !loading && (
        <div className="card relative overflow-hidden border-yellow-500/30 bg-yellow-500/5">
          <div className="p-4 flex items-start gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg flex-shrink-0">
              <Clock size={20} className="text-yellow-400" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-yellow-400 mb-1">No Import History</h4>
              <p className="text-sm text-yellow-300/90">
                Import history is stored in memory and will be lost when the server restarts.
                {error && (
                  <span className="block mt-2 text-red-400">Error: {error}</span>
                )}
              </p>
              <div className="mt-2 flex items-start gap-2 text-xs text-yellow-400/70">
                <Lightbulb size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <span>Import a new file to see the history appear here.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card relative overflow-hidden">
        <div className="p-6 relative">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={20} />
              <input
                type="text"
                placeholder="Search by filename..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-primary-700/30 border border-primary-600/50 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-accent-500/50 focus:bg-primary-700/40 transition-all duration-300"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="p-2 bg-accent-500/20 rounded-lg">
                <Filter size={20} className="text-accent-400" />
              </div>
              <div className="flex gap-1 bg-primary-800/50 p-1 rounded-xl">
                {(['all', 'success', 'failed'] as const).map((filter) => {
                  const isActive = statusFilter === filter;
                  const colorMap = {
                    all: isActive ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/30' : '',
                    success: isActive ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : '',
                    failed: isActive ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : '',
                  };
                  return (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      className={`px-4 py-2 rounded-xl font-medium text-sm transition-all capitalize ${
                        isActive ? colorMap[filter] : 'text-neutral-400 hover:text-white hover:bg-primary-700/50'
                      }`}
                    >
                      {filter === 'all' ? 'All Status' : filter}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="card relative overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-primary-800/30 border-b border-primary-700/30">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-accent-400 uppercase tracking-wider w-1/4">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-4 bg-accent-500 rounded-full"></span>
                    File Name
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-accent-400 uppercase tracking-wider w-1/6">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-4 bg-accent-500 rounded-full"></span>
                    Import Date
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-accent-400 uppercase tracking-wider w-1/12">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-4 bg-accent-500 rounded-full"></span>
                    Size
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-accent-400 uppercase tracking-wider w-1/8">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-4 bg-accent-500 rounded-full"></span>
                    Status
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-xs font-bold text-accent-400 uppercase tracking-wider w-1/12">
                  <div className="flex items-center justify-end gap-2">
                    <span className="w-1 h-4 bg-accent-500 rounded-full"></span>
                    Triples
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-xs font-bold text-accent-400 uppercase tracking-wider w-1/12">
                  <div className="flex items-center justify-end gap-2">
                    <span className="w-1 h-4 bg-accent-500 rounded-full"></span>
                    Duration
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-xs font-bold text-accent-400 uppercase tracking-wider w-1/12">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-1 h-4 bg-accent-500 rounded-full"></span>
                    Actions
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-700/30">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="spinner mx-auto mb-4" />
                    <p className="text-neutral-400">Loading history...</p>
                  </td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-neutral-400">
                    No import history found
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.id} className="group hover:bg-primary-800/20 transition-all duration-200">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-700/50 group-hover:bg-accent-500/20 rounded-lg transition-all duration-300 group-hover:scale-110">
                          <File size={18} className="text-accent-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white text-sm truncate group-hover:text-accent-400 transition-colors">{item.fileName}</p>
                          {item.errorMessage && (
                            <p className="text-xs text-red-400 mt-1 truncate">{item.errorMessage}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-neutral-300 group-hover:text-white transition-colors">
                        <Calendar size={16} className="text-neutral-500 flex-shrink-0" />
                        <span className="text-sm whitespace-nowrap">{formatDate(item.importDate)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-neutral-300 group-hover:text-white text-sm font-medium transition-colors">
                      {formatFileSize(item.fileSize)}
                    </td>
                    <td className="px-6 py-4">
                      {item.status === 'success' && (
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-semibold shadow-sm">
                          <CheckCircle2 size={16} />
                          Success
                        </span>
                      )}
                      {item.status === 'failed' && (
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-xs font-semibold shadow-sm">
                          <XCircle size={16} />
                          Failed
                        </span>
                      )}
                      {item.status === 'processing' && (
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent-500/20 text-accent-400 border border-accent-500/30 rounded-full text-xs font-semibold shadow-sm">
                          <Clock size={16} />
                          Processing
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-neutral-300 group-hover:text-white text-sm font-mono text-right font-semibold transition-colors">
                      {item.triplesCount ? item.triplesCount.toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-neutral-300 group-hover:text-white text-sm text-right font-medium transition-colors">
                      {item.duration ? `${item.duration}s` : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        <button
                          className="p-2 hover:bg-red-500/20 rounded-xl transition-all duration-300 hover:scale-110 group/btn"
                          title="Delete"
                          onClick={async () => {
                            if (confirm(`Are you sure you want to delete "${item.fileName}"?`)) {
                              try {
                                await apiService.deleteImportHistory(item.id);
                                fetchHistory();
                              } catch (error) {
                                console.error('Error deleting history:', error);
                                alert('Failed to delete history item');
                              }
                            }
                          }}
                        >
                          <Trash2 size={16} className="text-neutral-400 group-hover/btn:text-red-400 transition-colors" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default History;
