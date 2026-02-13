interface LoadFlowLegendProps {
  mode: 'voltage' | 'loading';
}

const LoadFlowLegend = ({ mode }: LoadFlowLegendProps) => {
  if (mode === 'voltage') {
    return (
      <div className="px-4 py-3 border-t border-primary-700/30 bg-primary-800/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-neutral-300">Load Flow: Voltage Visualization</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-r from-red-600 to-red-500 border-2 border-red-400" />
            <span className="text-xs text-neutral-400 font-medium">Critical Low (&lt;0.90 pu)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-r from-orange-600 to-orange-500 border-2 border-orange-400" />
            <span className="text-xs text-neutral-400 font-medium">Low (0.90-0.95 pu)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-600 to-green-500 border-2 border-green-400" />
            <span className="text-xs text-neutral-400 font-medium">Normal (0.95-1.05 pu)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-r from-yellow-600 to-yellow-500 border-2 border-yellow-400" />
            <span className="text-xs text-neutral-400 font-medium">High (1.05-1.10 pu)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-r from-red-700 to-red-600 border-2 border-red-500" />
            <span className="text-xs text-neutral-400 font-medium">Critical High (&gt;1.10 pu)</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-primary-700/30 bg-primary-800/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-neutral-300">Load Flow: Branch Loading</span>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-1 bg-green-500 rounded" />
          <span className="text-xs text-neutral-400 font-medium">Light (&lt;50%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-2 bg-accent-500 rounded" />
          <span className="text-xs text-neutral-400 font-medium">Moderate (50-70%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-3 bg-yellow-500 rounded" />
          <span className="text-xs text-neutral-400 font-medium">Heavy (70-90%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-4 bg-orange-500 rounded" />
          <span className="text-xs text-neutral-400 font-medium">Critical (90-100%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-4 bg-red-600 rounded animate-pulse" />
          <span className="text-xs text-neutral-400 font-medium">Overloaded (&gt;100%)</span>
        </div>
      </div>
    </div>
  );
};

export default LoadFlowLegend;
