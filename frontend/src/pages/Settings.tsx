import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Brain, Database, Download, Loader2, RefreshCw, Search, Server, Settings as SettingsIcon, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { API_BASE_URL, apiService } from '@/services/api';

type Probe<T> = { value: T | null; elapsedMs: number };
type Status = 'checking' | 'available' | 'limited' | 'unavailable' | 'configured' | 'missing' | 'unknown';
interface ServiceRowProps {
  name: string;
  detail: string;
  icon: LucideIcon;
  status: Status;
  elapsedMs?: number;
}

const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  checking: { label: 'Checking', className: 'text-neutral-400 bg-white/5' },
  available: { label: 'Available', className: 'text-emerald-400 bg-emerald-500/10' },
  limited: { label: 'DC only', className: 'text-accent-400 bg-accent-500/10' },
  unavailable: { label: 'Unavailable', className: 'text-red-400 bg-red-500/10' },
  configured: { label: 'Configured', className: 'text-emerald-400 bg-emerald-500/10' },
  missing: { label: 'Not configured', className: 'text-neutral-400 bg-white/5' },
  unknown: { label: 'Unknown', className: 'text-neutral-400 bg-white/5' },
};

async function probe<T>(request: () => Promise<T>): Promise<Probe<T>> {
  const start = performance.now();
  try {
    return { value: await request(), elapsedMs: Math.round(performance.now() - start) };
  } catch {
    return { value: null, elapsedMs: Math.round(performance.now() - start) };
  }
}

async function readStatus() {
  const [backend, graph, index, powerflow, models, system] = await Promise.all([
    probe(() => apiService.checkBackendHealth()),
    probe(() => apiService.getStatistics()),
    probe(() => apiService.getIndexingStatus()),
    probe(() => apiService.getPowerflowHealth()),
    probe(() => apiService.getLlmProviders()),
    probe(() => apiService.getSystemHealth()),
  ]);
  return { backend, graph, index, powerflow, models, system };
}

function ServiceRow({ name, detail, icon: Icon, status, elapsedMs }: ServiceRowProps) {
  const badge = STATUS_STYLE[status];
  return (
    <div className="flex items-start gap-3 py-4 border-b border-primary-700/30 last:border-0">
      <Icon size={18} className="text-neutral-400 mt-1 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-sm font-medium text-white">{name}</h3>
          <span className={`text-[11px] font-medium rounded-md px-2 py-0.5 ${badge.className}`}>{badge.label}</span>
        </div>
        <p className="mt-1.5 text-xs text-neutral-400 leading-relaxed break-words">{detail}</p>
      </div>
      {elapsedMs !== undefined && (
        <span className="text-xs text-neutral-500 tabular-nums whitespace-nowrap mt-1" title="Measured response time through the backend API">
          {elapsedMs} ms
        </span>
      )}
    </div>
  );
}

export default function Settings() {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof readStatus>> | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const { success: toastSuccess, error: toastError } = useToast();

  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setRefreshing(true);
    const next = await readStatus();
    pending.current = false;
    if (!mounted.current) return;
    setSnapshot(next);
    setLastRefresh(new Date());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 15000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [refresh]);

  const graph = snapshot?.graph.value;
  const index = snapshot?.index.value;
  const powerflow = snapshot?.powerflow.value;
  const models = snapshot?.models.value;
  const keys = snapshot?.system.value?.providers;
  const status = (available: boolean | undefined): Status => snapshot === null ? 'checking' : available ? 'available' : 'unavailable';
  const keyStatus = (configured: boolean | undefined): Status => snapshot === null ? 'checking'
    : configured === undefined ? 'unknown' : configured ? 'configured' : 'missing';
  const count = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString('en-US');

  const exportGraph = async () => {
    setExporting(true);
    try {
      const blob = await apiService.exportGraph('RDF/XML');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `knowledge-graph-${new Date().toISOString().slice(0, 10)}.rdf`;
      link.click();
      URL.revokeObjectURL(url);
      toastSuccess('Knowledge graph exported');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={SettingsIcon}
        iconColor="text-neutral-400"
        title="Platform Settings"
        subtitle="Service availability, model configuration and current dataset"
        actions={<button onClick={() => { void refresh(); }} disabled={refreshing} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary-600/50 bg-primary-800 text-sm text-neutral-300 hover:bg-primary-700 disabled:opacity-50">
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 space-y-6">
          <section className="rounded-xl border border-primary-700/40 bg-primary-900/50 px-5 py-2" aria-labelledby="infrastructure-title">
            <div className="py-3 border-b border-primary-700/40 flex flex-wrap items-center justify-between gap-2">
              <h2 id="infrastructure-title" className="font-semibold text-white">Infrastructure</h2>
              {lastRefresh && <span className="text-xs text-neutral-500">Checked {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
            <ServiceRow name="Backend API" icon={Server} status={status(snapshot?.backend.value === true)} detail="Application endpoints and service checks" elapsedMs={snapshot?.backend.value ? snapshot.backend.elapsedMs : undefined} />
            <ServiceRow name="Knowledge graph" icon={Database} status={status(!!graph)} detail={graph ? `${count(graph.totalTriples)} RDF triples in Fuseki` : snapshot ? 'The current graph could not be read from Fuseki.' : 'Reading the current graph through the backend'} elapsedMs={graph ? snapshot?.graph.elapsedMs : undefined} />
            <ServiceRow name="Vector index" icon={Search} status={status(index?.qdrantAvailable)} detail={index?.qdrantAvailable ? `${count(index.indexedEntities)} indexed entities · ${index.collectionName}` : 'Qdrant is required for semantic vector retrieval'} elapsedMs={index ? snapshot?.index.elapsedMs : undefined} />
            <ServiceRow name="Power flow" icon={Zap} status={powerflow?.dcSolver && !powerflow.pandapowerAvailable ? 'limited' : status(powerflow?.pandapowerAvailable)} detail={powerflow?.pandapowerAvailable ? 'DC, AC Newton-Raphson and OPF available' : powerflow?.dcSolver ? 'DC is available. Start the Python service for AC and OPF.' : 'Checking the calculation services'} elapsedMs={powerflow ? snapshot?.powerflow.elapsedMs : undefined} />
          </section>

          <section className="rounded-xl border border-primary-700/40 bg-primary-900/50 px-5 py-2" aria-labelledby="models-title">
            <div className="py-3 border-b border-primary-700/40">
              <h2 id="models-title" className="font-semibold text-white">AI configuration</h2>
              <p className="mt-1 text-xs text-neutral-400">Configured means a key is present. Test model responses in Chat.</p>
            </div>
            {models?.map(model => <ServiceRow key={model.id} name={model.label} icon={Brain} status={keyStatus(model.available)} detail={`${model.model}${model.isDefault ? ' · Default chat provider' : ' · Alternate chat provider'}`} />)}
            {!models?.length && <ServiceRow name="Chat providers" icon={Brain} status={snapshot === null ? 'checking' : models ? 'missing' : 'unknown'} detail={models ? 'No chat providers are configured.' : 'Provider configuration could not be loaded.'} />}
            <ServiceRow name="Claude agent" icon={Sparkles} status={keyStatus(keys?.claude)} detail="Optional agent with graph and calculation tools" />
            <ServiceRow name="OpenAI embeddings" icon={Search} status={keyStatus(keys?.openai)} detail="Creates entity vectors for semantic search" />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-primary-700/40 bg-primary-900/50 p-5">
            <h2 className="font-semibold text-white">Current dataset</h2>
            <p className="text-3xl font-semibold text-white tabular-nums mt-6">{count(graph?.totalTriples)}</p>
            <p className="text-xs text-neutral-400 mt-1">RDF triples</p>
            <dl className="mt-5 divide-y divide-primary-700/30 text-sm">
              {([
                ['Subjects', graph?.totalSubjects],
                ['Classes', graph?.totalClasses],
                ['Indexed entities', index?.qdrantAvailable ? index.indexedEntities : undefined],
              ] as const).map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-3"><dt className="text-neutral-400">{label}</dt><dd className="text-neutral-200 tabular-nums">{count(value)}</dd></div>)}
            </dl>
            {graph?.totalTriples === 0 && <div className="mt-4 pt-4 border-t border-primary-700/30">
              <p className="text-sm text-neutral-400">Your graph is empty. Import a network to begin.</p>
              <Link to="/import" className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-accent-400 hover:text-accent-300">Import network data <ArrowRight size={14} /></Link>
            </div>}
            <button onClick={() => { void exportGraph(); }} disabled={exporting || !graph?.totalTriples} className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-primary-600/50 text-sm text-neutral-300 hover:bg-primary-800 disabled:opacity-40 disabled:cursor-not-allowed">
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Export RDF/XML
            </button>
          </section>
          <details className="rounded-xl border border-primary-700/40 bg-primary-900/50 p-5 text-sm">
            <summary className="cursor-pointer font-medium text-neutral-300">Connection details</summary>
            <p className="mt-4 text-xs text-neutral-500">Backend API</p>
            <p className="mt-1 text-xs text-neutral-300 break-all font-mono">{API_BASE_URL}</p>
            <p className="mt-4 text-xs leading-relaxed text-neutral-400">Provider credentials and service addresses are managed in the backend configuration.</p>
          </details>
        </aside>
      </div>
    </div>
  );
}
