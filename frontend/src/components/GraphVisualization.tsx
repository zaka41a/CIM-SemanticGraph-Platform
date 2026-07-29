import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import {
  AlertCircle, RefreshCw, ZoomIn, ZoomOut, Maximize2, Download,
  Minimize2, Layout, Zap, ZapOff, Search, X, Filter, SlidersHorizontal,
} from 'lucide-react';
import api from '../services/api';
import LoadFlowLegend from './LoadFlowLegend';

cytoscape.use(dagre);

interface GraphNode {
  data: { id: string; label: string; type: string };
}
interface GraphEdge {
  data: { source: string; target: string; label?: string; loadingPercentage?: number; activePowerMw?: number };
}
interface LoadFlowData {
  busResults: { busId: string; busName: string; voltageMagnitude: number; voltageAngle: number; withinLimits: boolean }[];
  branchResults: { branchId: string; fromBusId: string; toBusId: string; fromActivePowerMw: number; toActivePowerMw: number; loadingPercentage: number; overloaded: boolean }[];
}

// ── Node type config ────────────────────────────────────────────────────────
const NODE_TYPES: Record<string, { label: string; color: string; shape: string; size: number }> = {
  substation:  { label: 'Substation',       color: '#334e68', shape: 'rectangle', size: 72 },
  generator:   { label: 'Generator',        color: '#f39c12', shape: 'diamond',   size: 72 },
  line:        { label: 'Transmission Line',color: '#486581', shape: 'ellipse',   size: 64 },
  terminal:    { label: 'Terminal',         color: '#627d98', shape: 'ellipse',   size: 48 },
  voltage:     { label: 'Voltage Level',    color: '#e67e22', shape: 'hexagon',   size: 64 },
  transformer: { label: 'Transformer',      color: '#8b5cf6', shape: 'pentagon',  size: 64 },
  breaker:     { label: 'Breaker',          color: '#06b6d4', shape: 'ellipse',   size: 52 },
  equipment:   { label: 'Equipment',        color: '#475569', shape: 'ellipse',   size: 56 },
};

const getVoltageColor = (pu: number) =>
  pu < 0.90 ? '#dc2626' : pu < 0.95 ? '#f97316' : pu <= 1.05 ? '#22c55e' : pu <= 1.10 ? '#eab308' : '#b91c1c';

const getBranchColor  = (l: number) => l < 50 ? '#22c55e' : l < 70 ? '#3b82f6' : l < 90 ? '#eab308' : l < 100 ? '#f97316' : '#dc2626';
const getBranchWidth  = (l: number) => l < 50 ? 2 : l < 70 ? 3 : l < 90 ? 4 : l < 100 ? 5 : 6;

const getNodeType = (id: string, typeUri?: string): string => {
  const src = typeUri || id;
  if (src.includes('Substation')) return 'substation';
  if (src.includes('GeneratingUnit') || src.includes('SynchronousMachine') || src.includes('Generator')) return 'generator';
  if (src.includes('ACLineSegment') || src.includes('#Line')) return 'line';
  if (src.includes('Terminal')) return 'terminal';
  if (src.includes('VoltageLevel')) return 'voltage';
  if (src.includes('PowerTransformer') || src.includes('Transformer')) return 'transformer';
  if (src.includes('Breaker')) return 'breaker';
  return 'equipment';
};

// ── Stylesheet ───────────────────────────────────────────────────────────────
const buildStylesheet = () => [
  {
    selector: 'node',
    style: {
      'background-color': '#486581',
      'label': 'data(label)',
      'color': '#ffffff',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '10px',
      'font-weight': '600',
      'width': '64px',
      'height': '64px',
      'border-width': 2,
      'border-color': 'rgba(243,156,18,0.5)',
      'text-wrap': 'wrap',
      'text-max-width': '56px',
      'transition-property': 'background-color, border-color, border-width',
      'transition-duration': '0.2s',
    },
  },
  ...Object.entries(NODE_TYPES).map(([type, cfg]) => ({
    selector: `node[type="${type}"]`,
    style: {
      'background-color': cfg.color,
      'shape': cfg.shape as any,
      'width': `${cfg.size}px`,
      'height': `${cfg.size}px`,
      'color': type === 'generator' ? '#1a2332' : '#ffffff',
    },
  })),
  {
    selector: 'node:selected',
    style: {
      'border-width': 4,
      'border-color': '#ffb966',
      'background-color': '#f39c12',
      'color': '#1a2332',
    },
  },
  {
    selector: 'node.highlighted',
    style: { 'border-width': 3, 'border-color': '#60a5fa', 'opacity': 1 },
  },
  {
    selector: 'node.dimmed',
    style: { 'opacity': 0.2 },
  },
  {
    selector: 'edge',
    style: {
      'width': 1.5,
      'line-color': '#486581',
      'target-arrow-color': '#f39c12',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'font-size': '8px',
      'color': '#9fb3c8',
      'text-background-color': '#1a2332',
      'text-background-opacity': 0.85,
      'text-background-padding': '2px',
      'text-rotation': 'autorotate',
    },
  },
  {
    selector: 'edge:selected',
    style: { 'width': 3, 'line-color': '#f39c12', 'target-arrow-color': '#f39c12' },
  },
  {
    selector: 'edge.dimmed',
    style: { 'opacity': 0.1 },
  },
];

// ── Node Info Panel ──────────────────────────────────────────────────────────
const NodeInfoPanel = ({ node, onClose, loadFlowMode }: {
  node: any; onClose: () => void; loadFlowMode: boolean;
}) => {
  const typeCfg = NODE_TYPES[node.type] || NODE_TYPES.equipment;
  return (
    <div className="absolute top-3 right-3 w-60 bg-primary-900/95 border border-primary-600/50 rounded-xl shadow-2xl backdrop-blur-sm z-20 overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-primary-700/40" style={{ borderLeftColor: typeCfg.color, borderLeftWidth: 3 }}>
        <div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">{typeCfg.label}</p>
          <p className="text-sm font-semibold text-white truncate mt-0.5">{node.label}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded text-neutral-500 hover:text-white hover:bg-primary-700/50 transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="p-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-neutral-500">ID</span>
          <span className="text-neutral-300 font-mono truncate max-w-[130px]">{node.id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Type</span>
          <span className="text-neutral-300">{typeCfg.label}</span>
        </div>
        {loadFlowMode && node.voltageMagnitude !== undefined && (
          <>
            <div className="border-t border-primary-700/30 pt-1.5 mt-1.5" />
            <div className="flex justify-between">
              <span className="text-neutral-500">Voltage</span>
              <span className="font-mono font-bold" style={{ color: getVoltageColor(node.voltageMagnitude) }}>
                {node.voltageMagnitude.toFixed(4)} pu
              </span>
            </div>
            {node.voltageAngle !== undefined && (
              <div className="flex justify-between">
                <span className="text-neutral-500">Angle</span>
                <span className="font-mono text-neutral-300">{node.voltageAngle.toFixed(2)}°</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-neutral-500">Status</span>
              <span className={node.withinLimits ? 'text-emerald-400' : 'text-red-400'}>
                {node.withinLimits ? 'Normal' : 'Violation'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
const GraphVisualization = () => {
  const [elements, setElements]         = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const cyRef                           = useRef<any>(null);
  const containerRef                    = useRef<HTMLDivElement>(null);
  const [lastUpdate, setLastUpdate]     = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentLayout, setCurrentLayout] = useState<'dagre' | 'circle' | 'grid' | 'cose'>('cose');
  const [loadFlowMode, setLoadFlowMode] = useState(false);
  const [loadFlowData, setLoadFlowData] = useState<LoadFlowData | null>(null);

  // UI state
  const [selectedNode, setSelectedNode]   = useState<any>(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [showFilters, setShowFilters]     = useState(false);
  const [hiddenTypes, setHiddenTypes]     = useState<Set<string>>(new Set());
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);

  // Derived stats
  const nodeCount = useMemo(() => elements.filter((e: any) => !e.data.source).length, [elements]);
  const edgeCount = useMemo(() => elements.filter((e: any) => e.data.source).length, [elements]);
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    elements.filter((e: any) => !e.data.source).forEach((e: any) => {
      const t = e.data.type || 'equipment';
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [elements]);

  // ── Search & filter effects ────────────────────────────────────────────────
  useEffect(() => {
    if (!cyRef.current || elements.length === 0) return;
    const cy = cyRef.current;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      cy.nodes().forEach((n: any) => {
        const matches = n.data('label')?.toLowerCase().includes(q) || n.data('id')?.toLowerCase().includes(q);
        n.toggleClass('highlighted', matches);
        n.toggleClass('dimmed', !matches);
      });
      cy.edges().addClass('dimmed');
    } else {
      cy.nodes().removeClass('highlighted dimmed');
      cy.edges().removeClass('dimmed');
    }
  }, [searchQuery, elements]);

  useEffect(() => {
    if (!cyRef.current || elements.length === 0) return;
    const cy = cyRef.current;
    cy.nodes().forEach((n: any) => {
      const t = n.data('type') || 'equipment';
      if (hiddenTypes.has(t)) {
        n.hide();
        n.connectedEdges().hide();
      } else {
        n.show();
        n.connectedEdges().show();
      }
    });
  }, [hiddenTypes, elements]);

  // ── Load Flow ──────────────────────────────────────────────────────────────
  const [loadFlowLoading, setLoadFlowLoading] = useState(false);

  const fetchLoadFlowData = useCallback(async () => {
    try {
      const stored = localStorage.getItem('cim_load_flow_results');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Discard cached data if it has no valid busResults (e.g. error response)
        if (Array.isArray(parsed?.busResults) && parsed.busResults.length > 0) {
          setLoadFlowData(parsed);
          return;
        }
        localStorage.removeItem('cim_load_flow_results');
      }
      // Auto-calculate if no valid cached data
      setLoadFlowLoading(true);
      const response = await api.calculateLoadFlow('DC');
      if (Array.isArray(response?.busResults)) {
        localStorage.setItem('cim_load_flow_results', JSON.stringify(response));
        setLoadFlowData(response);
      } else {
        setError('Load Flow returned no bus data.');
      }
    } catch {
      setError('Load Flow calculation failed. Please check the backend.');
    } finally {
      setLoadFlowLoading(false);
    }
  }, []);

  const handleToggleLoadFlow = useCallback(async () => {
    if (!loadFlowMode && !loadFlowData) await fetchLoadFlowData();
    setLoadFlowMode(m => !m);
  }, [loadFlowMode, loadFlowData, fetchLoadFlowData]);

  useEffect(() => {
    if (!cyRef.current || elements.length === 0) return;
    const cy = cyRef.current;
    const busResults = loadFlowData?.busResults;
    const branchResults = loadFlowData?.branchResults;
    if (loadFlowMode && Array.isArray(busResults) && Array.isArray(branchResults)) {
      cy.elements().forEach((ele: any) => {
        if (ele.isNode()) {
          const nodeId = ele.data('id');
          const bus = busResults.find((b: any) =>
            b.busId.includes(nodeId) || nodeId.includes(b.busId) ||
            nodeId.replace(/_CN$/, '') === b.busId.replace(/_CN$/, '')
          );
          if (bus) {
            ele.style({ 'background-color': getVoltageColor(bus.voltageMagnitude), 'border-color': getVoltageColor(bus.voltageMagnitude), 'border-width': 3 });
            ele.data('voltageMagnitude', bus.voltageMagnitude);
            ele.data('voltageAngle', bus.voltageAngle);
            ele.data('withinLimits', bus.withinLimits);
          }
        } else if (ele.isEdge()) {
          const branch = branchResults.find((b: any) =>
            (b.fromBusId.includes(ele.data('source')) || ele.data('source').includes(b.fromBusId)) &&
            (b.toBusId.includes(ele.data('target'))   || ele.data('target').includes(b.toBusId))
          );
          if (branch) {
            ele.style({
              'line-color': getBranchColor(branch.loadingPercentage),
              'target-arrow-color': getBranchColor(branch.loadingPercentage),
              'width': getBranchWidth(branch.loadingPercentage),
              'label': `${Math.abs(branch.fromActivePowerMw).toFixed(1)} MW\n${branch.loadingPercentage.toFixed(0)}%`,
            });
          }
        }
      });
    } else {
      cy.elements().forEach((ele: any) => {
        ele.removeStyle();
        ['voltageMagnitude', 'voltageAngle', 'withinLimits', 'loadingPercentage', 'activePowerMw'].forEach(k => ele.removeData(k));
      });
    }
  }, [loadFlowMode, loadFlowData, elements.length]);

  // ── Fetch graph data ───────────────────────────────────────────────────────
  const fetchGraphData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const query = `
        PREFIX cim: <http://iec.ch/TC57/CIM100#>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        SELECT DISTINCT ?subject ?subjectLabel ?subjectType ?predicate ?object ?objectLabel ?objectType
        WHERE {
          ?subject rdf:type ?subjectType .
          FILTER (
            ?subjectType = cim:Substation || ?subjectType = cim:GeneratingUnit ||
            ?subjectType = cim:SynchronousMachine || ?subjectType = cim:ACLineSegment ||
            ?subjectType = cim:PowerTransformer || ?subjectType = cim:Terminal ||
            ?subjectType = cim:VoltageLevel || ?subjectType = cim:Breaker ||
            ?subjectType = cim:ConnectivityNode || ?subjectType = cim:EnergyConsumer ||
            ?subjectType = cim:Line
          )
          ?subject ?predicate ?object .
          FILTER(isURI(?object))
          OPTIONAL { ?object rdf:type ?objectType }
          OPTIONAL { ?subject cim:IdentifiedObject.name ?subjectLabel }
          OPTIONAL { ?object cim:IdentifiedObject.name ?objectLabel }
          FILTER(?predicate != rdf:type)
        }
        LIMIT 200
      `;

      const response = await api.executeSparqlQuery(query);
      if (response?.results) {
        const nodes = new Map<string, GraphNode>();
        const edges: GraphEdge[] = [];

        response.results.forEach((r: any) => {
          const subjectId = r.subject.split('#').pop() || r.subject;
          const objectId  = r.object.split('#').pop()  || r.object;
          const predLabel = r.predicate.split('#').pop() || 'relates';

          if (!nodes.has(subjectId)) {
            nodes.set(subjectId, { data: { id: subjectId, label: r.subjectLabel || subjectId.slice(0, 20), type: getNodeType(subjectId, r.subjectType) } });
          }
          if (!nodes.has(objectId) && r.objectType) {
            nodes.set(objectId, { data: { id: objectId, label: r.objectLabel || objectId.slice(0, 20), type: getNodeType(objectId, r.objectType) } });
          }
          if (nodes.has(subjectId) && nodes.has(objectId)) {
            edges.push({ data: { source: subjectId, target: objectId, label: predLabel } });
          }
        });

        const graphElements = [...Array.from(nodes.values()), ...edges];
        setElements(graphElements);
        setLastUpdate(new Date());
      } else {
        setElements([]);
        setError('No data in Knowledge Graph. Please import CIM data first.');
      }
    } catch {
      setError('Failed to load graph data');
      setElements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraphData();
    const interval = setInterval(fetchGraphData, 30_000);
    return () => clearInterval(interval);
  }, [fetchGraphData]);

  useEffect(() => {
    const handler = () => fetchGraphData();
    window.addEventListener('cim_data_imported', handler);
    return () => window.removeEventListener('cim_data_imported', handler);
  }, [fetchGraphData]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Destroy cytoscape instance on unmount to prevent null-ref errors from
  // running layout callbacks after the component is gone.
  useEffect(() => {
    return () => {
      if (cyRef.current) {
        try {
          cyRef.current.stop();
        } catch {
          // The instance may already be torn down; nothing to clean up.
        }
        cyRef.current = null;
      }
    };
  }, []);

  // ── Layout helpers ─────────────────────────────────────────────────────────
  const LAYOUT_CFG: Record<string, any> = {
    dagre:  { name: 'dagre', rankDir: 'LR', nodeSep: 100, rankSep: 160, animate: false },
    circle: { name: 'circle', animate: false },
    grid:   { name: 'grid',   animate: false },
    cose:   { name: 'cose',   animate: false, nodeRepulsion: 8000, idealEdgeLength: 100, numIter: 1000 },
  };

  const LAYOUT_LABELS: Record<string, string> = { dagre: 'Hierarchical', circle: 'Circle', grid: 'Grid', cose: 'Force-Directed' };

  const handleLayoutChange = (name: 'dagre' | 'circle' | 'grid' | 'cose') => {
    setCurrentLayout(name);
    setShowLayoutMenu(false);
    cyRef.current?.layout(LAYOUT_CFG[name]).run();
  };

  const handleZoomIn  = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleFit     = () => cyRef.current?.fit(undefined, 20);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) { containerRef.current.requestFullscreen(); setIsFullscreen(true); }
    else { document.exitFullscreen(); setIsFullscreen(false); }
  };

  const handleDownloadPNG = () => {
    if (!cyRef.current) return;
    const png = cyRef.current.png({ output: 'blob', bg: '#0f1419', full: true, scale: 2 });
    const url = URL.createObjectURL(png);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${new Date().toISOString().split('T')[0]}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleTypeFilter = (type: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading && elements.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 card">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-400 text-sm">Loading graph visualization…</p>
        </div>
      </div>
    );
  }

  if (error && elements.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 card">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 text-accent-500/60" size={40} />
          <p className="text-neutral-300 font-semibold mb-1 text-sm">{error}</p>
          <button onClick={fetchGraphData} className="mt-4 flex items-center gap-2 px-4 py-2 bg-accent-500/20 hover:bg-accent-500/30 text-accent-400 border border-accent-500/30 rounded-xl text-sm transition-colors mx-auto">
            <RefreshCw size={15} /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (elements.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 card">
        <div className="text-center text-neutral-400">
          <AlertCircle className="mx-auto mb-3" size={36} />
          <p className="text-sm">No graph data</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={`card overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-primary-700/30 bg-primary-800/30 flex-wrap">

        {/* Left: stats */}
        <div className="flex items-center gap-3 mr-2">
          <span className="text-sm font-semibold text-white">Knowledge Graph</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-accent-500/20 text-accent-400 border border-accent-500/30">
            {nodeCount} nodes
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary-600/40 text-neutral-400 border border-primary-600/30">
            {edgeCount} edges
          </span>
          {lastUpdate && (
            <span className="text-xs text-neutral-500">
              {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search node…"
            className="pl-7 pr-7 py-1.5 rounded-lg bg-primary-900/60 border border-primary-600/40 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-accent-500/50 w-36"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Filter by type */}
        <div className="relative">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
              hiddenTypes.size > 0
                ? 'bg-accent-500/20 border-accent-500/30 text-accent-400'
                : 'bg-primary-800/40 border-primary-600/30 text-neutral-400 hover:text-white hover:bg-primary-700/40'
            }`}
          >
            <Filter size={13} />
            Filter
            {hiddenTypes.size > 0 && <span className="w-4 h-4 rounded-full bg-accent-500 text-white text-[9px] flex items-center justify-center font-bold">{hiddenTypes.size}</span>}
          </button>
          {showFilters && (
            <div className="absolute right-0 top-full mt-1 bg-primary-900 border border-primary-700/50 rounded-xl shadow-xl z-50 p-3 min-w-[180px] space-y-1.5">
              {Object.entries(typeCounts).map(([type, count]) => {
                const cfg = NODE_TYPES[type] || NODE_TYPES.equipment;
                const hidden = hiddenTypes.has(type);
                return (
                  <label key={type} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={() => toggleTypeFilter(type)}
                      className="rounded accent-accent-500"
                    />
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                    <span className={`text-xs flex-1 ${hidden ? 'text-neutral-600 line-through' : 'text-neutral-300'}`}>{cfg.label}</span>
                    <span className="text-[10px] text-neutral-500 font-mono">{count}</span>
                  </label>
                );
              })}
              {hiddenTypes.size > 0 && (
                <button onClick={() => setHiddenTypes(new Set())} className="w-full text-left text-xs text-accent-400 hover:text-accent-300 pt-1 border-t border-primary-700/30">
                  Show all
                </button>
              )}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-primary-700/40" />

        {/* Load Flow */}
        <button
          onClick={handleToggleLoadFlow}
          disabled={loadFlowLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors disabled:opacity-60 ${
            loadFlowMode
              ? 'bg-accent-500/20 border-accent-500/30 text-accent-400'
              : 'bg-primary-800/40 border-primary-600/30 text-neutral-400 hover:text-white hover:bg-primary-700/40'
          }`}
          title={loadFlowMode ? 'Disable Load Flow' : 'Enable Load Flow overlay'}
        >
          {loadFlowLoading
            ? <RefreshCw size={13} className="animate-spin" />
            : loadFlowMode ? <Zap size={13} /> : <ZapOff size={13} />
          }
          {loadFlowLoading ? 'Calculating…' : 'Load Flow'}
        </button>

        {/* Layout */}
        <div className="relative">
          <button
            onClick={() => setShowLayoutMenu(m => !m)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-800/40 border border-primary-600/30 text-neutral-400 hover:text-white hover:bg-primary-700/40 text-xs transition-colors"
          >
            <Layout size={13} />
            {LAYOUT_LABELS[currentLayout]}
          </button>
          {showLayoutMenu && (
            <div className="absolute right-0 top-full mt-1 bg-primary-900 border border-primary-700/50 rounded-xl shadow-xl z-50 p-1.5 min-w-[150px]">
              {(['dagre', 'circle', 'grid', 'cose'] as const).map(name => (
                <button
                  key={name}
                  onClick={() => handleLayoutChange(name)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    currentLayout === name ? 'bg-accent-500/20 text-accent-400' : 'text-neutral-300 hover:bg-primary-700/50'
                  }`}
                >
                  {LAYOUT_LABELS[name]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-primary-700/40" />

        {/* Icon actions */}
        {[
          { icon: Download,    title: 'Export PNG',  action: handleDownloadPNG },
          { icon: ZoomIn,      title: 'Zoom In',     action: handleZoomIn },
          { icon: ZoomOut,     title: 'Zoom Out',    action: handleZoomOut },
          { icon: Maximize2,   title: 'Fit',         action: handleFit },
          { icon: isFullscreen ? Minimize2 : SlidersHorizontal, title: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen', action: handleToggleFullscreen },
        ].map(({ icon: Icon, title, action }) => (
          <button key={title} onClick={action} title={title} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-primary-700/50 transition-colors">
            <Icon size={15} />
          </button>
        ))}

        <button
          onClick={fetchGraphData}
          disabled={loading}
          title="Refresh"
          className="p-1.5 rounded-lg bg-accent-500/20 text-accent-400 hover:bg-accent-500/30 border border-accent-500/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Graph Canvas ── */}
      <div className="relative bg-primary-950/60">
        <CytoscapeComponent
          elements={elements}
          style={{ width: '100%', height: isFullscreen ? 'calc(100vh - 110px)' : '520px', background: 'transparent' }}
          stylesheet={buildStylesheet() as any}
          layout={LAYOUT_CFG.cose}
          cy={(cy: cytoscape.Core) => {
            cyRef.current = cy;

            cy.on('tap', 'node', (evt: cytoscape.EventObject) => {
              setSelectedNode(evt.target.data());
            });

            cy.on('tap', (evt: cytoscape.EventObject) => {
              if (evt.target === cy) setSelectedNode(null);
            });
          }}
        />

        {/* Node info panel */}
        {selectedNode && (
          <NodeInfoPanel node={selectedNode} onClose={() => setSelectedNode(null)} loadFlowMode={loadFlowMode} />
        )}

        {/* Close filter/layout menus on outside click */}
        {(showFilters || showLayoutMenu) && (
          <div className="fixed inset-0 z-40" onClick={() => { setShowFilters(false); setShowLayoutMenu(false); }} />
        )}
      </div>

      {/* ── Legend ── */}
      {loadFlowMode ? (
        <LoadFlowLegend mode="voltage" />
      ) : (
        <div className="px-4 py-3 border-t border-primary-700/30 bg-primary-800/10 flex flex-wrap items-center gap-x-5 gap-y-2">
          {Object.entries(NODE_TYPES)
            .filter(([type]) => typeCounts[type])
            .map(([type, cfg]) => (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                className={`flex items-center gap-2 transition-opacity ${hiddenTypes.has(type) ? 'opacity-30' : 'opacity-100'}`}
                title={`${hiddenTypes.has(type) ? 'Show' : 'Hide'} ${cfg.label}`}
              >
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="text-xs text-neutral-400">{cfg.label}</span>
                <span className="text-[10px] text-neutral-600 font-mono">({typeCounts[type]})</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

export default GraphVisualization;
