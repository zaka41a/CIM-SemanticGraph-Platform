import { ArrowUpDown, Zap, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

interface BusResult {
  busId: string;
  busName: string;
  busType: string;
  voltageMagnitude: number;
  voltageAngle: number;
  voltageKv: number;
  activePowerMw: number;
  reactivePowerMvar: number;
  generationMw: number;
  generationMvar: number;
  loadMw: number;
  loadMvar: number;
  withinLimits: boolean;
  voltagePercentage: number;
}

interface BusTableProps {
  buses: BusResult[];
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (key: string) => void;
}

export const BusTable = ({ buses, sortConfig, onSort }: BusTableProps) => {
  const formatNumber = (value: number | string | undefined, decimals: number = 2): string => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'number') {
      if (isNaN(value)) return 'N/A';
      return value.toFixed(decimals);
    }
    return parseFloat(value || '0').toFixed(decimals);
  };

  const getVoltageBarColor = (pu: number) => {
    if (pu < 0.95) return 'bg-orange-500';
    if (pu > 1.05) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  // Bar width: map pu value to a visual range (0.85-1.15 mapped to 0-100%)
  const getVoltageBarWidth = (pu: number) => {
    const clamped = Math.max(0.85, Math.min(1.15, pu));
    return ((clamped - 0.85) / 0.3) * 100;
  };

  const SortableHeader = ({ label, sortKey }: { label: string; sortKey: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-2">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${
          sortConfig?.key === sortKey ? 'text-accent-400' : ''
        }`} />
      </div>
    </th>
  );

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-primary-700/30 bg-gradient-to-r from-primary-800/30 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent-400" />
              Bus Voltages
            </h2>
            <p className="text-sm text-neutral-400 mt-1">Voltage magnitudes and power injections</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-accent-500/20 text-accent-400 border border-accent-500/30">
            {buses.length} buses
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-primary-800/60 to-primary-800/30 border-b border-primary-700/30">
            <tr>
              <SortableHeader label="Bus Name" sortKey="busName" />
              <SortableHeader label="Type" sortKey="busType" />
              <SortableHeader label="Voltage (pu)" sortKey="voltageMagnitude" />
              <SortableHeader label="Angle (°)" sortKey="voltageAngle" />
              <SortableHeader label="P (MW)" sortKey="activePowerMw" />
              <SortableHeader label="Q (MVAr)" sortKey="reactivePowerMvar" />
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Gen (MW)
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Load (MW)
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-700/20">
            {buses.map((bus) => {
              const voltageColor = bus.voltageMagnitude < 0.95 ? 'text-orange-400' :
                                   bus.voltageMagnitude > 1.05 ? 'text-yellow-400' :
                                   'text-green-400';
              const angleAbnormal = Math.abs(bus.voltageAngle) > 30;

              return (
                <tr key={bus.busId} className="hover:bg-primary-800/20 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-white">
                    <div className="flex flex-col">
                      <span>{bus.busName || bus.busId}</span>
                      {bus.busId !== bus.busName && (
                        <span className="text-xs text-neutral-500">{bus.busId}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      bus.busType === 'SLACK' ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' :
                      bus.busType === 'PV' ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' :
                      'bg-green-500/20 text-green-400 border border-green-500/30'
                    }`}>
                      {bus.busType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-semibold ${voltageColor}`}>
                        {formatNumber(bus.voltageMagnitude, 4)}
                      </span>
                      <div className="w-16 h-1.5 bg-primary-800 rounded-full overflow-hidden flex-shrink-0" title={`${formatNumber(bus.voltageMagnitude, 4)} pu`}>
                        <div
                          className={`h-full rounded-full transition-all ${getVoltageBarColor(bus.voltageMagnitude)}`}
                          style={{ width: `${getVoltageBarWidth(bus.voltageMagnitude)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-mono ${angleAbnormal ? 'text-red-400 font-bold' : 'text-neutral-300'}`}>
                    <div className="flex items-center justify-end gap-1">
                      {formatNumber(bus.voltageAngle, 2)}
                      {angleAbnormal && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-white">
                    {bus.activePowerMw !== 0 && (
                      <span className={bus.activePowerMw > 0 ? 'text-green-400' : 'text-accent-400'}>
                        {bus.activePowerMw > 0 ? <TrendingUp className="w-3 h-3 inline mr-1" /> : <TrendingDown className="w-3 h-3 inline mr-1" />}
                      </span>
                    )}
                    {formatNumber(bus.activePowerMw)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-neutral-300">
                    {formatNumber(bus.reactivePowerMvar)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono">
                    {bus.generationMw > 0 ? (
                      <span className="text-green-400 font-medium">{formatNumber(bus.generationMw)}</span>
                    ) : (
                      <span className="text-neutral-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono">
                    {bus.loadMw > 0 ? (
                      <span className="text-accent-400 font-medium">{formatNumber(bus.loadMw)}</span>
                    ) : (
                      <span className="text-neutral-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        bus.withinLimits
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                      }`}
                    >
                      {bus.withinLimits ? 'OK' : 'VIOLATION'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {buses.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <p>No bus data available</p>
        </div>
      )}
    </div>
  );
};
