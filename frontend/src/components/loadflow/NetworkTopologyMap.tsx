import { useEffect, useRef, useMemo } from 'react';
import cytoscape from 'cytoscape';

interface BusResult {
  busId: string;
  busName: string;
  busType: string;
  voltageMagnitude: number;
  voltageKv: number;
  activePowerMw: number;
  generationMw: number;
  loadMw: number;
  withinLimits: boolean;
  voltagePercentage: number;
}

interface BranchResult {
  branchId: string;
  branchName: string;
  branchType: string;
  fromBusId: string;
  toBusId: string;
  fromActivePowerMw: number;
  loadingPercentage: number;
  overloaded: boolean;
}

interface Props {
  buses: BusResult[];
  branches: BranchResult[];
}

function getBusColor(bus: BusResult): string {
  if (!bus.withinLimits) return '#ef4444'; // red - violation
  if (bus.voltagePercentage !== undefined) {
    if (bus.voltagePercentage > 105 || bus.voltagePercentage < 95) return '#f59e0b'; // yellow - warning
  }
  if (bus.busType === 'SLACK') return '#8b5cf6'; // purple - slack bus
  if (bus.generationMw > 0) return '#10b981'; // emerald - generator
  if (bus.loadMw > 0) return '#3b82f6'; // blue - load
  return '#6b7280'; // gray - neutral
}

function getBranchColor(branch: BranchResult): string {
  if (branch.overloaded) return '#ef4444';
  if (branch.loadingPercentage > 80) return '#f59e0b';
  return '#34d399';
}

function getBranchWidth(pct: number): number {
  if (pct > 100) return 4;
  if (pct > 80) return 3;
  if (pct > 50) return 2;
  return 1.5;
}

export const NetworkTopologyMap = ({ buses, branches }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const elements = useMemo(() => {
    const nodes: cytoscape.ElementDefinition[] = buses.map((bus) => ({
      data: {
        id: bus.busId,
        label: bus.busName || bus.busId.split('/').pop() || bus.busId,
        busType: bus.busType,
        voltage: bus.voltageKv?.toFixed(1),
        voltagePct: bus.voltagePercentage?.toFixed(1),
        genMw: bus.generationMw?.toFixed(1),
        loadMw: bus.loadMw?.toFixed(1),
        color: getBusColor(bus),
        size: bus.busType === 'SLACK' ? 40 : bus.generationMw > 0 ? 32 : 26,
      },
    }));

    const edges: cytoscape.ElementDefinition[] = branches
      .filter((b) => buses.some((n) => n.busId === b.fromBusId) && buses.some((n) => n.busId === b.toBusId))
      .map((b) => ({
        data: {
          id: b.branchId,
          source: b.fromBusId,
          target: b.toBusId,
          label: `${b.loadingPercentage?.toFixed(0)}%`,
          color: getBranchColor(b),
          width: getBranchWidth(b.loadingPercentage),
          type: b.branchType,
        },
      }));

    return [...nodes, ...edges];
  }, [buses, branches]);

  useEffect(() => {
    if (!containerRef.current || elements.length === 0) return;

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'border-color': '#334e68',
            'border-width': 2,
            'width': 'data(size)',
            'height': 'data(size)',
            'label': 'data(label)',
            'color': '#e5e7eb',
            'font-size': '9px',
            'font-family': 'Inter, system-ui, sans-serif',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            'text-outline-width': 2,
            'text-outline-color': '#0f1419',
            'text-max-width': '80px',
            'text-wrap': 'ellipsis',
            'overlay-padding': '6px',
            'z-index': 10,
          } as any,
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#f39c12',
            'border-width': 3,
            'overlay-color': '#f39c12',
            'overlay-opacity': 0.1,
          } as any,
        },
        {
          selector: 'edge',
          style: {
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'none',
            'curve-style': 'bezier',
            'width': 'data(width)',
            'opacity': 0.8,
            'label': 'data(label)',
            'font-size': '8px',
            'color': '#9ca3af',
            'text-outline-width': 1.5,
            'text-outline-color': '#0f1419',
            'text-rotation': 'autorotate',
          } as any,
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#f39c12',
            'width': 4,
          } as any,
        },
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 800,
        fit: true,
        padding: 40,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 100,
        edgeElasticity: () => 32,
        gravity: 1,
        numIter: 1000,
        coolingFactor: 0.95,
        minTemp: 1.0,
      } as any,
      wheelSensitivity: 0.3,
      minZoom: 0.2,
      maxZoom: 4,
    });

    // Tooltip on hover
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
      position: fixed; z-index: 9999; pointer-events: none;
      background: rgba(15,20,25,0.95); border: 1px solid rgba(51,78,104,0.6);
      border-radius: 10px; padding: 10px 14px; font-size: 12px;
      color: #e5e7eb; display: none; max-width: 220px;
      backdrop-filter: blur(8px); box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      font-family: Inter, system-ui, sans-serif;
    `;
    document.body.appendChild(tooltip);

    cyRef.current.on('mouseover', 'node', (e) => {
      const d = e.target.data();
      tooltip.innerHTML = `
        <div style="font-weight:700;color:#f39c12;margin-bottom:6px">${d.label}</div>
        <div style="color:#9ca3af;font-size:11px;margin-bottom:4px">${d.busType || ''}</div>
        ${d.voltage ? `<div>Voltage: <b style="color:#10b981">${d.voltage} kV</b></div>` : ''}
        ${d.voltagePct ? `<div>V%: <b style="color:${parseFloat(d.voltagePct) > 105 || parseFloat(d.voltagePct) < 95 ? '#f59e0b' : '#10b981'}">${d.voltagePct}%</b></div>` : ''}
        ${d.genMw && parseFloat(d.genMw) > 0 ? `<div>Generation: <b style="color:#8b5cf6">${d.genMw} MW</b></div>` : ''}
        ${d.loadMw && parseFloat(d.loadMw) > 0 ? `<div>Load: <b style="color:#3b82f6">${d.loadMw} MW</b></div>` : ''}
      `;
      tooltip.style.display = 'block';
    });

    cyRef.current.on('mousemove', (e: any) => {
      tooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
      tooltip.style.top = (e.originalEvent.clientY - 10) + 'px';
    });

    cyRef.current.on('mouseout', 'node', () => {
      tooltip.style.display = 'none';
    });

    cyRef.current.on('mouseover', 'edge', (e) => {
      const d = e.target.data();
      tooltip.innerHTML = `
        <div style="font-weight:700;color:#f39c12;margin-bottom:6px">${d.type || 'Line'}</div>
        <div style="font-size:11px;color:#9ca3af">From → To</div>
        <div style="margin-top:4px">Loading: <b style="color:${parseFloat(d.label) > 100 ? '#ef4444' : parseFloat(d.label) > 80 ? '#f59e0b' : '#10b981'}">${d.label}</b></div>
      `;
      tooltip.style.display = 'block';
    });

    cyRef.current.on('mouseout', 'edge', () => {
      tooltip.style.display = 'none';
    });

    return () => {
      tooltip.remove();
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [elements]);

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full h-[520px] bg-primary-950/50 rounded-xl" />
      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 bg-primary-950/90 backdrop-blur-sm border border-primary-700/40 rounded-xl px-4 py-3">
        <span className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mr-1">Buses:</span>
        {[
          { color: '#8b5cf6', label: 'Slack' },
          { color: '#10b981', label: 'Generator' },
          { color: '#3b82f6', label: 'Load' },
          { color: '#f59e0b', label: 'Warning' },
          { color: '#ef4444', label: 'Violation' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-neutral-300">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mx-1">Lines:</span>
        {[
          { color: '#34d399', label: 'Normal' },
          { color: '#f59e0b', label: '>80%' },
          { color: '#ef4444', label: 'Overloaded' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-neutral-300">
            <span className="w-6 h-0.5 flex-shrink-0" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
      <div className="absolute top-4 right-4 text-xs text-neutral-500 bg-primary-950/80 px-3 py-1.5 rounded-lg border border-primary-700/30">
        Scroll to zoom · Drag to pan · Click to select
      </div>
    </div>
  );
};
