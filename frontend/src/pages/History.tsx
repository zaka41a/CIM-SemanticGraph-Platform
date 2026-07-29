import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, FileSpreadsheet, FileCode2,
  Calendar, CheckCircle2, XCircle, Clock,
  Trash2, Search, Filter, Lightbulb,
  Database, RefreshCw, Upload, ChevronUp, ChevronDown,
  TrendingUp, AlertTriangle, ArrowRight, RotateCcw,
  History as HistoryIcon,
} from 'lucide-react';
import { apiService } from '@/services/api';
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/components/Toast';

interface ImportHistoryItem {
  id: string;
  fileName: string;
  fileSize: number;
  importDate: Date;
  status: 'success' | 'failed' | 'processing' | 'rolled_back';
  triplesCount?: number;
  duration?: number;
  errorMessage?: string;
  rollbackAvailable?: boolean;
  graphUri?: string;
}

type SortField = 'importDate' | 'fileName' | 'triplesCount' | 'fileSize' | 'duration';
type SortDir = 'asc' | 'desc';

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getFileType(name: string): { label: string; icon: React.ComponentType<any>; color: string; bg: string } {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls')
    return { label: 'Excel', icon: FileSpreadsheet, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' };
  if (ext === 'xml')
    return { label: 'CIM/XML', icon: FileCode2, color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/30' };
  if (ext === 'rdf' || ext === 'ttl' || ext === 'n3')
    return { label: 'RDF', icon: FileCode2, color: 'text-purple-400', bg: 'bg-purple-500/15 border-purple-500/30' };
  return { label: 'File', icon: FileText, color: 'text-accent-400', bg: 'bg-accent-500/15 border-accent-500/30' };
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
const StatCard = ({
  icon: Icon, label, value, color, border,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: React.ReactNode;
  color: string;
  border: string;
}) => (
  <div className={`card relative overflow-hidden group hover:${border} transition-all duration-300`}>
    <div className="absolute top-0 right-0 w-32 h-32 opacity-5 rounded-full blur-2xl bg-current" />
    <div className="p-6 relative">
      <div className={`p-3 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform duration-300 ${color.replace('text-', 'bg-').replace('400', '500/20')}`}>
        <Icon size={22} className={color} />
      </div>
      <p className="text-neutral-400 text-xs font-semibold uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────
const History = () => {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [sortField, setSortField] = useState<SortField>('importDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deleteConfirm, setDeleteConfirm]     = useState<string | null>(null);
  const [rollbackConfirm, setRollbackConfirm] = useState<string | null>(null);
  const [rollingBack, setRollingBack]         = useState<string | null>(null);

  const fetchHistory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await apiService.getImportHistory();
      const transformed: ImportHistoryItem[] = (response || []).map((item: any) => ({
        id: item.id,
        fileName: item.fileName,
        fileSize: item.fileSize,
        importDate: new Date(item.importDate),
        status: item.status?.toLowerCase() || 'unknown',
        triplesCount: item.triplesCount || 0,
        duration: item.duration || 0,
        errorMessage: item.errorMessage,
        rollbackAvailable: item.rollbackAvailable || false,
        graphUri: item.graphUri,
      }));
      setHistory(transformed);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load import history');
      setHistory([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Sort
  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sorted = [...history].sort((a, b) => {
    let v = 0;
    if (sortField === 'importDate') v = a.importDate.getTime() - b.importDate.getTime();
    else if (sortField === 'fileName') v = a.fileName.localeCompare(b.fileName);
    else if (sortField === 'triplesCount') v = (a.triplesCount ?? 0) - (b.triplesCount ?? 0);
    else if (sortField === 'fileSize') v = (a.fileSize ?? 0) - (b.fileSize ?? 0);
    else if (sortField === 'duration') v = (a.duration ?? 0) - (b.duration ?? 0);
    return sortDir === 'asc' ? v : -v;
  });

  const filtered = sorted.filter(item => {
    const matchSearch = item.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: history.length,
    success: history.filter(h => h.status === 'success').length,
    failed: history.filter(h => h.status === 'failed').length,
    totalTriples: history.reduce((acc, h) => acc + (h.triplesCount ?? 0), 0),
  };
  const maxTriples = Math.max(...history.map(h => h.triplesCount ?? 0), 1);
  const latest = [...history].sort((a, b) => b.importDate.getTime() - a.importDate.getTime())[0];

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp size={12} className="text-neutral-700" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-accent-400" />
      : <ChevronDown size={12} className="text-accent-400" />;
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.deleteImportHistory(id);
      setDeleteConfirm(null);
      fetchHistory(true);
      toastSuccess('History item deleted');
    } catch {
      toastError('Failed to delete the history item');
    }
  };

  const handleRollback = async (id: string) => {
    setRollingBack(id);
    setRollbackConfirm(null);
    try {
      await apiService.rollbackImport(id);
      fetchHistory(true);
      toastSuccess('Import rolled back');
    } catch (err: any) {
      toastError(err?.response?.data?.error || err?.message || 'Rollback failed');
    } finally {
      setRollingBack(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={HistoryIcon}
        iconColor="text-neutral-400"
        title="Import History"
        subtitle="Track and manage all CIM file imports to your Knowledge Graph"
        actions={
          <>
            <button
              onClick={() => fetchHistory(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all disabled:opacity-50"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={() => navigate('/import')}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all"
            >
              <Upload size={15} /> New Import
            </button>
          </>
        }
      />

      {/* Latest Import Banner */}
      {latest && (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500/10 via-primary-800/30 to-primary-800/10 border border-emerald-500/20 p-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl flex-shrink-0">
              <TrendingUp size={20} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-0.5">Latest Import</p>
              <p className="text-sm font-medium text-white truncate">{latest.fileName}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {formatDate(latest.importDate)} · {relativeTime(latest.importDate)}
                {latest.triplesCount ? ` · ${latest.triplesCount.toLocaleString()} triples` : ''}
              </p>
            </div>
            <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              latest.status === 'success'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : latest.status === 'failed'
                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                : 'bg-yellow-500/15 text-accent-500 border-yellow-500/30'
            }`}>
              {latest.status === 'success' && <CheckCircle2 size={13} />}
              {latest.status === 'failed' && <XCircle size={13} />}
              {latest.status === 'processing' && <Clock size={13} />}
              {latest.status}
            </span>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText}     label="Total Imports"  value={stats.total}                      color="text-accent-400"   border="border-accent-500/30" />
        <StatCard icon={CheckCircle2} label="Successful"     value={stats.success}                    color="text-emerald-400" border="border-emerald-500/30" />
        <StatCard icon={XCircle}      label="Failed"         value={stats.failed}                     color="text-red-400"     border="border-red-500/30" />
        <StatCard icon={Database}     label="Total Triples"  value={stats.totalTriples.toLocaleString()} color="text-purple-400" border="border-purple-500/30" />
      </div>

      {/* Empty / Error state */}
      {!loading && history.length === 0 && (
        <div className="card relative overflow-hidden border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-yellow-500/20 rounded-xl flex-shrink-0">
              {error ? <AlertTriangle size={22} className="text-accent-500" /> : <Lightbulb size={22} className="text-accent-500" />}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-accent-500 mb-1">
                {error ? 'Could not load history' : 'No Import History Yet'}
              </h4>
              <p className="text-sm text-yellow-300/80 mb-3">
                {error
                  ? error
                  : 'Import history is stored in memory and reset when the server restarts. Start by importing a CIM or Excel file.'}
              </p>
              <button
                onClick={() => navigate('/import')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent-500/20 hover:bg-accent-500/30 text-accent-400 border border-accent-500/30 rounded-lg text-sm font-medium transition-all"
              >
                <Upload size={14} />
                Go to Import
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {history.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
              <input
                type="text"
                placeholder="Search by filename…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-primary-700/30 border border-primary-600/50 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-accent-500/50 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-neutral-500 flex-shrink-0" />
              <div className="flex gap-1 bg-primary-800/50 p-1 rounded-xl">
                {(['all', 'success', 'failed'] as const).map(f => {
                  const active = statusFilter === f;
                  const cls = {
                    all: active ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/30' : '',
                    success: active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : '',
                    failed: active ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : '',
                  }[f];
                  return (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${active ? cls : 'text-neutral-400 hover:text-white hover:bg-primary-700/50'}`}
                    >
                      {f === 'all' ? 'All' : f}
                      {f !== 'all' && (
                        <span className="ml-1.5 text-[10px] opacity-70">
                          ({f === 'success' ? stats.success : stats.failed})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {history.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-primary-800/40 border-b border-primary-700/30">
                <tr>
                  {/* File */}
                  <th className="px-5 py-3.5 text-left">
                    <button onClick={() => handleSort('fileName')} className="flex items-center gap-1.5 text-xs font-bold text-accent-400 uppercase tracking-wider hover:text-accent-300 transition-colors">
                      <span className="w-1 h-3.5 bg-accent-500 rounded-full" />
                      File
                      <SortIcon field="fileName" />
                    </button>
                  </th>
                  {/* Date */}
                  <th className="px-5 py-3.5 text-left">
                    <button onClick={() => handleSort('importDate')} className="flex items-center gap-1.5 text-xs font-bold text-accent-400 uppercase tracking-wider hover:text-accent-300 transition-colors">
                      <span className="w-1 h-3.5 bg-accent-500 rounded-full" />
                      Date
                      <SortIcon field="importDate" />
                    </button>
                  </th>
                  {/* Size */}
                  <th className="px-5 py-3.5 text-left">
                    <button onClick={() => handleSort('fileSize')} className="flex items-center gap-1.5 text-xs font-bold text-accent-400 uppercase tracking-wider hover:text-accent-300 transition-colors">
                      <span className="w-1 h-3.5 bg-accent-500 rounded-full" />
                      Size
                      <SortIcon field="fileSize" />
                    </button>
                  </th>
                  {/* Status */}
                  <th className="px-5 py-3.5 text-left">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-accent-400 uppercase tracking-wider">
                      <span className="w-1 h-3.5 bg-accent-500 rounded-full" />
                      Status
                    </span>
                  </th>
                  {/* Triples */}
                  <th className="px-5 py-3.5 text-left">
                    <button onClick={() => handleSort('triplesCount')} className="flex items-center gap-1.5 text-xs font-bold text-accent-400 uppercase tracking-wider hover:text-accent-300 transition-colors">
                      <span className="w-1 h-3.5 bg-accent-500 rounded-full" />
                      Triples
                      <SortIcon field="triplesCount" />
                    </button>
                  </th>
                  {/* Duration */}
                  <th className="px-5 py-3.5 text-left">
                    <button onClick={() => handleSort('duration')} className="flex items-center gap-1.5 text-xs font-bold text-accent-400 uppercase tracking-wider hover:text-accent-300 transition-colors">
                      <span className="w-1 h-3.5 bg-accent-500 rounded-full" />
                      Duration
                      <SortIcon field="duration" />
                    </button>
                  </th>
                  {/* Actions */}
                  <th className="px-5 py-3.5 text-center">
                    <span className="text-xs font-bold text-accent-400 uppercase tracking-wider">Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-primary-700/20">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="spinner mx-auto mb-3" />
                      <p className="text-sm text-neutral-500">Loading history…</p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <Search size={28} className="text-neutral-700 mx-auto mb-3" />
                      <p className="text-sm text-neutral-500">No results match your filters</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(item => {
                    const ft = getFileType(item.fileName);
                    const FileIcon = ft.icon;
                    const triplesRatio = (item.triplesCount ?? 0) / maxTriples;

                    return (
                      <tr key={item.id} className="group hover:bg-primary-800/20 transition-colors">
                        {/* File name */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg border flex-shrink-0 group-hover:scale-105 transition-transform ${ft.bg}`}>
                              <FileIcon size={16} className={ft.color} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white group-hover:text-accent-400 transition-colors truncate max-w-[200px]">
                                {item.fileName}
                              </p>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ft.bg} ${ft.color}`}>
                                {ft.label}
                              </span>
                              {item.errorMessage && (
                                <p className="text-xs text-red-400 mt-1 truncate max-w-[200px]">{item.errorMessage}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-neutral-600 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-neutral-300 whitespace-nowrap">{formatDate(item.importDate)}</p>
                              <p className="text-xs text-neutral-600">{relativeTime(item.importDate)}</p>
                            </div>
                          </div>
                        </td>

                        {/* Size */}
                        <td className="px-5 py-4 text-sm text-neutral-300 font-mono whitespace-nowrap">
                          {formatFileSize(item.fileSize)}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          {item.status === 'success' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-semibold">
                              <CheckCircle2 size={12} />
                              Success
                            </span>
                          )}
                          {item.status === 'failed' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/15 text-red-400 border border-red-500/30 rounded-full text-xs font-semibold">
                              <XCircle size={12} />
                              Failed
                            </span>
                          )}
                          {item.status === 'processing' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/15 text-accent-500 border border-yellow-500/30 rounded-full text-xs font-semibold">
                              <Clock size={12} className="animate-spin" />
                              Processing
                            </span>
                          )}
                          {item.status === 'rolled_back' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/15 text-orange-400 border border-orange-500/30 rounded-full text-xs font-semibold">
                              <RotateCcw size={12} />
                              Rolled Back
                            </span>
                          )}
                        </td>

                        {/* Triples + progress bar */}
                        <td className="px-5 py-4">
                          {item.triplesCount ? (
                            <div>
                              <p className="text-sm font-mono font-semibold text-neutral-200 mb-1">
                                {item.triplesCount.toLocaleString()}
                              </p>
                              <div className="w-24 h-1 bg-primary-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-accent-500 to-accent-400 rounded-full transition-all duration-500"
                                  style={{ width: `${triplesRatio * 100}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-neutral-600 text-sm">-</span>
                          )}
                        </td>

                        {/* Duration */}
                        <td className="px-5 py-4">
                          {item.duration ? (
                            <div className="flex items-center gap-1.5 text-sm text-neutral-300">
                              <Clock size={12} className="text-neutral-600" />
                              {item.duration}s
                            </div>
                          ) : (
                            <span className="text-neutral-600 text-sm">-</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1">
                            {/* Rollback button - only for success imports with rollback available */}
                            {item.status === 'success' && item.rollbackAvailable && (
                              rollbackConfirm === item.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleRollback(item.id)}
                                    className="px-2 py-1 text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 rounded-lg transition-all"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setRollbackConfirm(null)}
                                    className="px-2 py-1 text-xs bg-primary-700/50 text-neutral-400 rounded-lg transition-all hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setRollbackConfirm(item.id)}
                                  disabled={rollingBack === item.id}
                                  className="p-2 hover:bg-orange-500/15 rounded-xl transition-all group/rb disabled:opacity-50"
                                  title="Rollback - remove these triples from the graph"
                                >
                                  {rollingBack === item.id
                                    ? <RotateCcw size={15} className="text-orange-400 animate-spin" />
                                    : <RotateCcw size={15} className="text-neutral-600 group-hover/rb:text-orange-400 transition-colors" />
                                  }
                                </button>
                              )
                            )}

                            {/* Delete button */}
                            {deleteConfirm === item.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  className="px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg transition-all"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="px-2 py-1 text-xs bg-primary-700/50 text-neutral-400 rounded-lg transition-all hover:text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(item.id)}
                                className="p-2 hover:bg-red-500/15 rounded-xl transition-all group/del"
                                title="Delete history record"
                              >
                                <Trash2 size={15} className="text-neutral-600 group-hover/del:text-red-400 transition-colors" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          {filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-primary-700/20 bg-primary-900/30 flex items-center justify-between text-xs text-neutral-600">
              <span>{filtered.length} of {history.length} imports</span>
              <span>Sorted by {sortField} {sortDir === 'desc' ? '↓' : '↑'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default History;
