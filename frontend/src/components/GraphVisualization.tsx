import { useEffect, useRef, useState, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { AlertCircle, RefreshCw, ZoomIn, ZoomOut, Maximize2, Download, Minimize2, Grid3x3, Layout, Zap, ZapOff } from 'lucide-react';
import api from '../services/api';
import LoadFlowLegend from './LoadFlowLegend';

// Register dagre layout
cytoscape.use(dagre);

interface GraphNode {
  data: {
    id: string;
    label: string;
    type: string;
  };
}

interface GraphEdge {
  data: {
    source: string;
    target: string;
    label?: string;
    loadingPercentage?: number;
    flowDirection?: 'forward' | 'reverse';
    activePowerMw?: number;
  };
}

interface LoadFlowData {
  busResults: {
    busId: string;
    busName: string;
    voltageMagnitude: number;
    voltageAngle: number;
    withinLimits: boolean;
  }[];
  branchResults: {
    branchId: string;
    fromBusId: string;
    toBusId: string;
    fromActivePowerMw: number;
    toActivePowerMw: number;
    loadingPercentage: number;
    overloaded: boolean;
  }[];
}

const GraphVisualization = () => {
  const [elements, setElements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cyRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentLayout, setCurrentLayout] = useState<'dagre' | 'circle' | 'grid' | 'cose'>('dagre');
  const [loadFlowMode, setLoadFlowMode] = useState(false);
  const [loadFlowData, setLoadFlowData] = useState<LoadFlowData | null>(null);

  // Helper function to get voltage color
  const getVoltageColor = (voltagePu: number): string => {
    if (voltagePu < 0.90) return '#dc2626'; // Critical low - red-600
    if (voltagePu < 0.95) return '#f97316'; // Low - orange-500
    if (voltagePu >= 0.95 && voltagePu <= 1.05) return '#22c55e'; // Normal - green-500
    if (voltagePu <= 1.10) return '#eab308'; // High - yellow-500
    return '#b91c1c'; // Critical high - red-700
  };

  // Helper function to get branch color based on loading
  const getBranchColor = (loading: number): string => {
    if (loading < 50) return '#22c55e'; // Green
    if (loading < 70) return '#3b82f6'; // Blue
    if (loading < 90) return '#eab308'; // Yellow
    if (loading < 100) return '#f97316'; // Orange
    return '#dc2626'; // Red
  };

  // Helper function to get branch width based on loading
  const getBranchWidth = (loading: number): number => {
    if (loading < 50) return 2;
    if (loading < 70) return 3;
    if (loading < 90) return 4;
    if (loading < 100) return 5;
    return 6;
  };

  // Fetch Load Flow data from localStorage or API
  const fetchLoadFlowData = useCallback(async () => {
    try {
      // Try to get from localStorage first (from LoadFlow page)
      const storedData = localStorage.getItem('cim_load_flow_results');
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        setLoadFlowData(parsedData);
        console.log('✅ Load Flow data loaded from localStorage');
        console.log(`📊 Buses: ${parsedData.busResults?.length || 0}, Branches: ${parsedData.branchResults?.length || 0}`);

        // Log some bus IDs for debugging
        if (parsedData.busResults && parsedData.busResults.length > 0) {
          console.log('📍 Sample bus IDs:', parsedData.busResults.slice(0, 3).map((b: any) => ({
            id: b.busId,
            name: b.busName,
            voltage: b.voltageMagnitude
          })));
        }
        return;
      }

      // If not in localStorage, prompt user to calculate first
      console.warn('⚠️ No Load Flow data found. Please calculate Load Flow first from the Load Flow page.');
      setError('No Load Flow data available. Please run Load Flow calculation first.');
    } catch (err) {
      console.error('❌ Error fetching load flow data:', err);
      setError('Error loading Load Flow data');
    }
  }, []);

  // Toggle Load Flow mode
  const handleToggleLoadFlow = useCallback(async () => {
    if (!loadFlowMode && !loadFlowData) {
      await fetchLoadFlowData();
    }
    const newMode = !loadFlowMode;
    setLoadFlowMode(newMode);
    console.log(`⚡ Load Flow mode: ${newMode ? 'ENABLED' : 'DISABLED'}`);
  }, [loadFlowMode, loadFlowData, fetchLoadFlowData]);

  // Apply Load Flow visualization to existing graph elements
  const applyLoadFlowVisualization = useCallback((graphElements: any[]) => {
    if (!loadFlowData || !loadFlowMode) return graphElements;

    const updatedElements = graphElements.map((element) => {
      if (element.data.source) {
        // This is an edge
        const edgeId = element.data.id || `${element.data.source}-${element.data.target}`;

        // Try to find matching branch in load flow data
        const branch = loadFlowData.branchResults.find(b =>
          (b.fromBusId.includes(element.data.source) || element.data.source.includes(b.fromBusId)) &&
          (b.toBusId.includes(element.data.target) || element.data.target.includes(b.toBusId))
        );

        if (branch) {
          return {
            ...element,
            data: {
              ...element.data,
              loadingPercentage: branch.loadingPercentage,
              flowDirection: branch.fromActivePowerMw > 0 ? 'forward' : 'reverse',
              activePowerMw: Math.abs(branch.fromActivePowerMw),
            }
          };
        }
      } else {
        // This is a node
        const bus = loadFlowData.busResults.find(b =>
          b.busId.includes(element.data.id) || element.data.id.includes(b.busId)
        );

        if (bus) {
          return {
            ...element,
            data: {
              ...element.data,
              voltageMagnitude: bus.voltageMagnitude,
              voltageAngle: bus.voltageAngle,
              withinLimits: bus.withinLimits,
            }
          };
        }
      }
      return element;
    });

    return updatedElements;
  }, [loadFlowData, loadFlowMode]);

  const fetchGraphData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch triples data from the API - Only CIM Equipment entities
      const query = `
        PREFIX cim: <http://iec.ch/TC57/CIM100#>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

        SELECT DISTINCT ?subject ?subjectLabel ?subjectType ?predicate ?object ?objectLabel ?objectType
        WHERE {
          # Get subject and its type
          ?subject rdf:type ?subjectType .

          # Filter only CIM equipment classes
          FILTER (
            ?subjectType = cim:Substation ||
            ?subjectType = cim:GeneratingUnit ||
            ?subjectType = cim:SynchronousMachine ||
            ?subjectType = cim:ACLineSegment ||
            ?subjectType = cim:PowerTransformer ||
            ?subjectType = cim:Terminal ||
            ?subjectType = cim:VoltageLevel ||
            ?subjectType = cim:Breaker ||
            ?subjectType = cim:ConnectivityNode ||
            ?subjectType = cim:EnergyConsumer ||
            ?subjectType = cim:Line
          )

          # Get relationships to other CIM objects
          ?subject ?predicate ?object .

          # Only include object relationships (URIs), not literal values
          FILTER(isURI(?object))

          # Get object type if it's a CIM object
          OPTIONAL { ?object rdf:type ?objectType }

          # Get names
          OPTIONAL { ?subject cim:IdentifiedObject.name ?subjectLabel }
          OPTIONAL { ?object cim:IdentifiedObject.name ?objectLabel }

          # Filter out rdf:type relationships (already captured)
          FILTER(?predicate != rdf:type)
        }
        LIMIT 200
      `;

      const response = await api.executeSparqlQuery(query);

      if (response && response.results) {
        const nodes = new Map<string, GraphNode>();
        const edges: GraphEdge[] = [];

        response.results.forEach((result: any) => {
          const subjectId = result.subject.split('#').pop() || result.subject;
          const objectId = result.object.split('#').pop() || result.object;
          const predicateLabel = result.predicate.split('#').pop() || 'relates';

          // Add subject node with type information
          if (!nodes.has(subjectId)) {
            nodes.set(subjectId, {
              data: {
                id: subjectId,
                label: result.subjectLabel || subjectId,
                type: getNodeType(subjectId, result.subjectType)
              }
            });
          }

          // Add object node if it's a URI and has a valid type
          if (!nodes.has(objectId) && result.objectType) {
            nodes.set(objectId, {
              data: {
                id: objectId,
                label: result.objectLabel || objectId,
                type: getNodeType(objectId, result.objectType)
              }
            });
          }

          // Only add edge if both nodes exist
          if (nodes.has(subjectId) && nodes.has(objectId)) {
            edges.push({
              data: {
                source: subjectId,
                target: objectId,
                label: predicateLabel
              }
            });
          }
        });

        let graphElements = [...Array.from(nodes.values()), ...edges];
        graphElements = applyLoadFlowVisualization(graphElements);
        setElements(graphElements);
        setLastUpdate(new Date());
      } else {
        // No data - keep empty
        setElements([]);
        setError('No data in Knowledge Graph. Please import CIM data first.');
      }
    } catch (err) {
      console.error('Error fetching graph data:', err);
      setError('Failed to load graph data');
      // Keep empty on error
      setElements([]);
    } finally {
      setLoading(false);
    }
  }, [applyLoadFlowVisualization]);

  // Apply Load Flow styles to Cytoscape when mode changes
  useEffect(() => {
    if (!cyRef.current || elements.length === 0) return;

    console.log('🎨 Applying Load Flow visualization...', { loadFlowMode, hasData: !!loadFlowData });

    if (loadFlowMode && loadFlowData) {
      // Log all node IDs for debugging
      const allNodeIds = cyRef.current.nodes().map((n: any) => ({
        id: n.data('id'),
        label: n.data('label'),
        type: n.data('type')
      }));
      console.log('📍 Graph node IDs:', allNodeIds.slice(0, 5));

      let nodesMatched = 0;
      let edgesMatched = 0;

      cyRef.current.elements().forEach((ele: any) => {
        if (ele.isNode()) {
          // Find matching bus in load flow data
          const nodeId = ele.data('id');
          const nodeLabel = ele.data('label');

          const bus = loadFlowData.busResults.find(b => {
            // More flexible matching
            const idMatch = b.busId.includes(nodeId) || nodeId.includes(b.busId);
            const nameMatch = b.busName === nodeLabel || nodeLabel.includes(b.busName) || b.busName.includes(nodeLabel);
            // Remove _CN suffix and try again
            const cleanNodeId = nodeId.replace(/_CN$/, '');
            const cleanBusId = b.busId.replace(/_CN$/, '');
            const cleanMatch = cleanNodeId === cleanBusId || cleanNodeId.includes(cleanBusId) || cleanBusId.includes(cleanNodeId);

            return idMatch || nameMatch || cleanMatch;
          });

          if (bus) {
            const color = getVoltageColor(bus.voltageMagnitude);
            nodesMatched++;
            console.log(`✅ Node ${nodeId}: ${bus.voltageMagnitude.toFixed(3)} pu → ${color}`);
            ele.style({
              'background-color': color,
              'border-color': color,
              'border-width': 4
            });
            // Store data for tooltip
            ele.data('voltageMagnitude', bus.voltageMagnitude);
            ele.data('voltageAngle', bus.voltageAngle);
            ele.data('withinLimits', bus.withinLimits);
          } else {
            console.warn(`⚠️ No Load Flow data for node: ${nodeId} (label: ${nodeLabel})`);
          }
        } else if (ele.isEdge()) {
          // Find matching branch in load flow data
          const sourceId = ele.data('source');
          const targetId = ele.data('target');

          const branch = loadFlowData.branchResults.find(b => {
            const fromMatch = b.fromBusId.includes(sourceId) || sourceId.includes(b.fromBusId);
            const toMatch = b.toBusId.includes(targetId) || targetId.includes(b.toBusId);
            return fromMatch && toMatch;
          });

          if (branch) {
            const color = getBranchColor(branch.loadingPercentage);
            const width = getBranchWidth(branch.loadingPercentage);
            edgesMatched++;
            console.log(`✅ Branch ${sourceId}→${targetId}: ${branch.loadingPercentage.toFixed(0)}% → width ${width}px`);

            ele.style({
              'line-color': color,
              'target-arrow-color': color,
              'width': width,
              'label': `${Math.abs(branch.fromActivePowerMw).toFixed(1)} MW\n${branch.loadingPercentage.toFixed(0)}%`
            });
            // Store data
            ele.data('loadingPercentage', branch.loadingPercentage);
            ele.data('activePowerMw', branch.fromActivePowerMw);
          } else {
            console.warn(`⚠️ No Load Flow data for edge: ${sourceId}→${targetId}`);
          }
        }
      });

      console.log(`🎯 Matching summary: ${nodesMatched} nodes, ${edgesMatched} edges matched`);
    } else {
      // Reset to default styles when Load Flow mode is off
      console.log('🔄 Resetting to default styles...');
      cyRef.current.elements().forEach((ele: any) => {
        if (ele.isNode()) {
          ele.removeStyle();
          ele.removeData('voltageMagnitude');
          ele.removeData('voltageAngle');
          ele.removeData('withinLimits');
        } else if (ele.isEdge()) {
          ele.removeStyle();
          ele.removeData('loadingPercentage');
          ele.removeData('activePowerMw');
        }
      });
    }
  }, [loadFlowMode, loadFlowData]);

  useEffect(() => {
    fetchGraphData();
    // Auto-refresh every 10 seconds to catch new imports
    const interval = setInterval(fetchGraphData, 10000);
    return () => clearInterval(interval);
  }, [fetchGraphData]);

  // Listen for data import events to refresh the graph immediately
  useEffect(() => {
    const handleDataImport = () => {
      console.log('Data import detected, refreshing graph visualization...');
      fetchGraphData();
    };

    window.addEventListener('cim_data_imported', handleDataImport);
    return () => {
      window.removeEventListener('cim_data_imported', handleDataImport);
    };
  }, [fetchGraphData]);

  const getNodeType = (id: string, typeUri?: string): string => {
    // Use type URI if available
    if (typeUri) {
      if (typeUri.includes('Substation')) return 'substation';
      if (typeUri.includes('GeneratingUnit') || typeUri.includes('SynchronousMachine')) return 'generator';
      if (typeUri.includes('ACLineSegment') || typeUri.includes('#Line')) return 'line';
      if (typeUri.includes('Terminal')) return 'terminal';
      if (typeUri.includes('VoltageLevel')) return 'voltage';
      if (typeUri.includes('PowerTransformer')) return 'transformer';
      if (typeUri.includes('Breaker')) return 'breaker';
    }

    // Fallback to ID-based detection
    if (id.includes('Substation')) return 'substation';
    if (id.includes('GeneratingUnit') || id.includes('Generator') || id.includes('SynchronousMachine')) return 'generator';
    if (id.includes('ACLineSegment') || id.includes('Line')) return 'line';
    if (id.includes('Terminal')) return 'terminal';
    if (id.includes('VoltageLevel')) return 'voltage';
    if (id.includes('PowerTransformer') || id.includes('Transformer')) return 'transformer';
    if (id.includes('Breaker')) return 'breaker';

    return 'equipment';
  };

  const stylesheet = [
    {
      selector: 'node',
      style: {
        'background-color': '#486581',
        'label': 'data(label)',
        'color': '#ffffff',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '11px',
        'font-weight': 'bold',
        'width': '70px',
        'height': '70px',
        'border-width': 3,
        'border-color': '#f39c12',
        'text-wrap': 'wrap',
        'text-max-width': '60px',
      },
    },
    {
      selector: 'node[type="substation"]',
      style: {
        'background-color': '#243447',
        'shape': 'rectangle',
        'width': '80px',
        'height': '60px',
      },
    },
    {
      selector: 'node[type="generator"]',
      style: {
        'background-color': '#f39c12',
        'color': '#1a2332',
        'shape': 'diamond',
        'width': '75px',
        'height': '75px',
      },
    },
    {
      selector: 'node[type="line"]',
      style: {
        'background-color': '#486581',
        'shape': 'ellipse',
      },
    },
    {
      selector: 'node[type="terminal"]',
      style: {
        'background-color': '#627d98',
        'shape': 'circle',
        'width': '50px',
        'height': '50px',
      },
    },
    {
      selector: 'node[type="voltage"]',
      style: {
        'background-color': '#e67e22',
        'shape': 'hexagon',
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 4,
        'border-color': '#ffb966',
        'background-color': '#f39c12',
      },
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#627d98',
        'target-arrow-color': '#f39c12',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '9px',
        'color': '#d9e2ec',
        'text-background-color': '#243447',
        'text-background-opacity': 0.9,
        'text-background-padding': '2px',
        'text-rotation': 'autorotate',
      },
    },
    {
      selector: 'edge:selected',
      style: {
        'width': 3,
        'line-color': '#f39c12',
      },
    },
  ];

  const layout = {
    name: 'dagre',
    rankDir: 'LR',
    nodeSep: 120,
    rankSep: 180,
    animate: true,
    animationDuration: 500,
  };

  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.2);
      cyRef.current.center();
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8);
      cyRef.current.center();
    }
  };

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.fit();
    }
  };

  const handleDownloadPNG = () => {
    if (cyRef.current) {
      const png = cyRef.current.png({
        output: 'blob',
        bg: '#1a2332',
        full: true,
        scale: 3
      });

      const url = URL.createObjectURL(png);
      const link = document.createElement('a');
      link.href = url;
      link.download = `knowledge-graph-${new Date().toISOString().split('T')[0]}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleLayoutChange = (layoutName: 'dagre' | 'circle' | 'grid' | 'cose') => {
    setCurrentLayout(layoutName);
    if (cyRef.current) {
      let layoutConfig: any;
      switch (layoutName) {
        case 'dagre':
          layoutConfig = {
            name: 'dagre',
            rankDir: 'LR',
            nodeSep: 120,
            rankSep: 180,
            animate: true,
            animationDuration: 500,
          };
          break;
        case 'circle':
          layoutConfig = {
            name: 'circle',
            animate: true,
            animationDuration: 500,
          };
          break;
        case 'grid':
          layoutConfig = {
            name: 'grid',
            animate: true,
            animationDuration: 500,
          };
          break;
        case 'cose':
          layoutConfig = {
            name: 'cose',
            animate: true,
            animationDuration: 500,
            nodeRepulsion: 8000,
            idealEdgeLength: 100,
          };
          break;
      }
      cyRef.current.layout(layoutConfig).run();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (loading && elements.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 card">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" />
          <p className="text-neutral-400">Loading graph visualization...</p>
        </div>
      </div>
    );
  }

  if (error && elements.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 card">
        <div className="text-center text-neutral-400">
          <AlertCircle className="mx-auto mb-4 text-accent-400" size={48} />
          <p className="text-neutral-200 font-semibold mb-2">{error}</p>
          <p className="text-sm">Showing sample data instead</p>
          <button onClick={fetchGraphData} className="btn-primary mt-4">
            <RefreshCw size={16} className="inline mr-2" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (elements.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center text-neutral-400">
          <AlertCircle className="mx-auto mb-4" size={48} />
          <p>No graph data available</p>
          <p className="text-sm mt-2">Import CIM data to visualize the network</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`card overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-primary-700/30 bg-primary-800/20">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-neutral-200">Knowledge Graph</h3>
          <span className="badge-primary text-xs">
            {elements.filter((e: any) => !e.data.source).length} nodes
          </span>
          {lastUpdate && (
            <span className="text-xs text-neutral-400">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Load Flow Toggle */}
          <button
            onClick={handleToggleLoadFlow}
            className={`icon-btn ${loadFlowMode ? 'bg-accent-500/20 text-accent-400' : ''}`}
            title={loadFlowMode ? "Disable Load Flow Visualization" : "Enable Load Flow Visualization"}
          >
            {loadFlowMode ? <Zap size={18} /> : <ZapOff size={18} />}
          </button>

          {/* Layout Selector */}
          <div className="relative group">
            <button className="icon-btn" title="Change Layout">
              <Layout size={18} />
            </button>
            <div className="absolute right-0 top-full mt-2 bg-primary-800 border border-primary-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 min-w-[140px]">
              <div className="p-2 space-y-1">
                <button
                  onClick={() => handleLayoutChange('dagre')}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    currentLayout === 'dagre'
                      ? 'bg-accent-500/20 text-accent-400'
                      : 'text-neutral-300 hover:bg-primary-700'
                  }`}
                >
                  Hierarchical
                </button>
                <button
                  onClick={() => handleLayoutChange('circle')}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    currentLayout === 'circle'
                      ? 'bg-accent-500/20 text-accent-400'
                      : 'text-neutral-300 hover:bg-primary-700'
                  }`}
                >
                  Circle
                </button>
                <button
                  onClick={() => handleLayoutChange('grid')}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    currentLayout === 'grid'
                      ? 'bg-accent-500/20 text-accent-400'
                      : 'text-neutral-300 hover:bg-primary-700'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => handleLayoutChange('cose')}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    currentLayout === 'cose'
                      ? 'bg-accent-500/20 text-accent-400'
                      : 'text-neutral-300 hover:bg-primary-700'
                  }`}
                >
                  Force-Directed
                </button>
              </div>
            </div>
          </div>

          <button onClick={handleDownloadPNG} className="icon-btn" title="Save as PNG">
            <Download size={18} />
          </button>
          <button onClick={handleZoomIn} className="icon-btn" title="Zoom In">
            <ZoomIn size={18} />
          </button>
          <button onClick={handleZoomOut} className="icon-btn" title="Zoom Out">
            <ZoomOut size={18} />
          </button>
          <button onClick={handleFit} className="icon-btn" title="Fit to Screen">
            <Maximize2 size={18} />
          </button>
          <button onClick={handleToggleFullscreen} className="icon-btn" title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}>
            {isFullscreen ? <Minimize2 size={18} /> : <Grid3x3 size={18} />}
          </button>
          <button
            onClick={fetchGraphData}
            className="icon-btn-primary"
            title="Refresh Graph"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="relative bg-primary-950/50">
        <CytoscapeComponent
          elements={elements}
          style={{ width: '100%', height: isFullscreen ? 'calc(100vh - 130px)' : '550px', background: 'transparent' }}
          stylesheet={stylesheet as any}
          layout={layout}
          cy={(cy: cytoscape.Core) => {
            cyRef.current = cy;

            // Enhanced tooltip for nodes
            cy.on('mouseover', 'node', (evt: cytoscape.EventObject) => {
              const node = evt.target;
              const data = node.data();

              if (loadFlowMode && data.voltageMagnitude) {
                const tooltip = `${data.label}\n` +
                  `Voltage: ${data.voltageMagnitude.toFixed(3)} pu\n` +
                  `Angle: ${data.voltageAngle?.toFixed(2) || 'N/A'}°\n` +
                  `Status: ${data.withinLimits ? '✓ Normal' : '⚠ Violation'}`;
                node.style('label', tooltip);
              }
            });

            cy.on('mouseout', 'node', (evt: cytoscape.EventObject) => {
              const node = evt.target;
              const data = node.data();
              node.style('label', data.label);
            });

            cy.on('tap', 'node', (evt: cytoscape.EventObject) => {
              const node = evt.target;
              console.log('Node clicked:', node.data());
            });

            cy.on('tap', 'edge', (evt: cytoscape.EventObject) => {
              const edge = evt.target;
              console.log('Edge clicked:', edge.data());
            });
          }}
        />
      </div>

      {/* Legend */}
      {loadFlowMode ? (
        <LoadFlowLegend mode="voltage" />
      ) : (
        <div className="px-4 py-3 border-t border-primary-700/30 bg-primary-800/10 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-4 bg-primary-700 rounded border-2 border-accent-500" />
            <span className="text-xs text-neutral-400 font-medium">Substation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-accent-500 rotate-45 border-2 border-accent-500" />
            <span className="text-xs text-neutral-400 font-medium">Generator</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-primary-600 rounded-full border-2 border-accent-500" />
            <span className="text-xs text-neutral-400 font-medium">Transmission Line</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-primary-500 rounded-full border-2 border-accent-500" />
            <span className="text-xs text-neutral-400 font-medium">Terminal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-accent-600 border-2 border-accent-500" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
            <span className="text-xs text-neutral-400 font-medium">Voltage Level</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphVisualization;
