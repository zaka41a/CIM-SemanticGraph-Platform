import { useState, useEffect } from 'react';
import {
  Database, RefreshCw, FileText, Loader2, BarChart3,
  Zap, Cable, Factory, GitBranch, CircleDot, Activity,
  ToggleRight, Plug, Layers, Network, TrendingUp, Gauge
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useStatistics } from '@/hooks/useStatistics';
import { apiService } from '@/services/api';

const AnimatedNumber = ({ value }: { value: number }) => {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayed(value);
        clearInterval(timer);
      } else {
        setDisplayed(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{displayed.toLocaleString()}</span>;
};

// Restrained palette: amber = headline, blue = structural, emerald = active/energised.
type IconColor = 'accent' | 'blue' | 'emerald';

const iconColorMap: Record<IconColor, { bg: string; bgHover: string; text: string; glow: string }> = {
  accent:  { bg: 'bg-accent-500/20',  bgHover: 'group-hover:bg-accent-500/30',  text: 'text-accent-400',  glow: 'bg-accent-500/5' },
  blue:    { bg: 'bg-sky-500/20',     bgHover: 'group-hover:bg-sky-500/30',     text: 'text-sky-400',     glow: 'bg-sky-500/5' },
  emerald: { bg: 'bg-emerald-500/20', bgHover: 'group-hover:bg-emerald-500/30', text: 'text-emerald-400', glow: 'bg-emerald-500/5' },
};

const StatCard = ({
  title,
  value,
  icon: Icon,
  subtitle,
  color = 'accent',
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  subtitle?: string;
  color?: IconColor;
}) => {
  const c = iconColorMap[color];
  return (
    <div className="group relative overflow-hidden bg-gradient-to-br from-primary-800/60 to-primary-900/60 rounded-2xl p-6 border border-primary-700/30 hover:border-accent-500/30 transition-all duration-300">
      <div className={`absolute top-0 right-0 w-32 h-32 ${c.glow} group-hover:opacity-150 rounded-full blur-3xl transition-all`} />
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-neutral-400 text-sm font-medium uppercase tracking-wider">{title}</p>
          <p className="text-4xl font-bold text-white mt-3 tracking-tight">
            <AnimatedNumber value={value} />
          </p>
          {subtitle && (
            <p className="text-neutral-500 text-sm mt-2">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 ${c.bg} ${c.bgHover} rounded-xl transition-colors`}>
          <Icon className={`w-6 h-6 ${c.text}`} />
        </div>
      </div>
    </div>
  );
};

const StatRow = ({
  label,
  value,
  icon: Icon,
  color = 'accent',
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color?: IconColor;
}) => {
  const c = iconColorMap[color];
  return (
    <div className="flex items-center justify-between py-3 border-b border-primary-700/30 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`p-2 ${c.bg} rounded-lg`}>
          <Icon className={`w-4 h-4 ${c.text}`} />
        </div>
        <span className="text-neutral-300">{label}</span>
      </div>
      <span className="text-white font-semibold text-lg tabular-nums">
        <AnimatedNumber value={value} />
      </span>
    </div>
  );
};

const SectionCard = ({
  title,
  subtitle,
  icon: Icon,
  color = 'accent',
  children
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  color?: IconColor;
  children: React.ReactNode;
}) => {
  const c = iconColorMap[color];
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-primary-800/40 to-primary-900/40 rounded-2xl border border-primary-700/30">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 ${c.bg} rounded-lg`}>
            <Icon className={`w-5 h-5 ${c.text}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {subtitle && <p className="text-neutral-500 text-sm">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
};

const ProgressRing = ({ value, max, label }: {
  value: number;
  max: number;
  label: string;
}) => {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-primary-700"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="text-accent-500 transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">{percentage}%</span>
        </div>
      </div>
      <span className="text-neutral-400 text-sm mt-3 font-medium">{label}</span>
      <span className="text-white text-lg font-semibold">{value}</span>
    </div>
  );
};

const Statistics = () => {
  const { stats, loading, error, refresh } = useStatistics(true, 10000);
  const { success: toastSuccess, error: toastError } = useToast();
  const [exportingPDF, setExportingPDF] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    if (stats) {
      setLastUpdate(new Date());
    }
  }, [stats]);

  const handleExportPDF = async () => {
    setExportingPDF(true);
    try {
      const blob = await apiService.generateNetworkStatisticsReport();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CIM_Statistics_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toastSuccess('Statistics report downloaded');
    } catch {
      toastError('Failed to generate the statistics report');
    } finally {
      setExportingPDF(false);
    }
  };

  const totalEquipment = (stats?.substations || 0) + (stats?.transmissionLines || 0) +
    (stats?.transformers || 0) + (stats?.breakers || 0) + (stats?.generators || 0) +
    (stats?.loads || 0) + (stats?.disconnectors || 0) + (stats?.busbarSections || 0);

  const totalTopology = (stats?.connectivityNodes || 0) + (stats?.terminals || 0) +
    (stats?.voltageLevels || 0) + (stats?.baseVoltages || 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={BarChart3}
        iconColor="text-accent-400"
        title="Network Statistics"
        subtitle="Real-time overview of your CIM Knowledge Graph"
        actions={
          <>
            <button
              onClick={handleExportPDF}
              disabled={exportingPDF || loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all disabled:opacity-50"
            >
              {exportingPDF ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              {exportingPDF ? 'Generating...' : 'Export PDF'}
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 border border-primary-600/50 rounded-lg text-sm text-neutral-300 transition-all disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </>
        }
      />

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-primary-800/60 to-primary-900/60 rounded-xl p-5 border border-primary-700/30 hover:border-accent-500/30 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent-500/20 rounded-xl">
              <Database className="w-6 h-6 text-accent-400" />
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums text-accent-400">{stats?.totalTriples?.toLocaleString() || 0}</p>
              <p className="text-sm text-neutral-400">Total Triples</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-primary-800/60 to-primary-900/60 rounded-xl p-5 border border-primary-700/30 hover:border-sky-500/30 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-sky-500/20 rounded-xl">
              <CircleDot className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <p className="text-3xl font-bold text-white">{stats?.totalSubjects?.toLocaleString() || 0}</p>
              <p className="text-sm text-neutral-400">Unique Entities</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-primary-800/60 to-primary-900/60 rounded-xl p-5 border border-primary-700/30 hover:border-sky-500/30 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-sky-500/20 rounded-xl">
              <GitBranch className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <p className="text-3xl font-bold text-white">{stats?.totalPredicates?.toLocaleString() || 0}</p>
              <p className="text-sm text-neutral-400">Predicates</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-primary-800/60 to-primary-900/60 rounded-xl p-5 border border-primary-700/30 hover:border-emerald-500/30 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-xl">
              <Layers className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-3xl font-bold text-white">{stats?.totalClasses?.toLocaleString() || 0}</p>
              <p className="text-sm text-neutral-400">CIM Classes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="relative overflow-hidden rounded-xl bg-red-500/10 border border-red-500/30 p-5">
          <div className="flex items-center gap-3">
            <Activity className="text-red-400 w-5 h-5" />
            <p className="text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Main Equipment Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Substations"
          value={stats?.substations || 0}
          icon={Factory}
          subtitle="Power stations"
          color="blue"
        />
        <StatCard
          title="Transmission Lines"
          value={stats?.transmissionLines || 0}
          icon={Cable}
          subtitle="AC line segments"
          color="blue"
        />
        <StatCard
          title="Transformers"
          value={stats?.transformers || 0}
          icon={Gauge}
          subtitle="Power transformers"
          color="blue"
        />
        <StatCard
          title="Generators"
          value={stats?.generators || 0}
          icon={Zap}
          subtitle="Generating units"
          color="emerald"
        />
      </div>

      {/* Detailed Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard
          title="Network Equipment"
          subtitle="Power system components"
          icon={Network}
          color="blue"
        >
          <div>
            <StatRow label="Substations" value={stats?.substations || 0} icon={Factory} color="blue" />
            <StatRow label="Transmission Lines" value={stats?.transmissionLines || 0} icon={Cable} color="blue" />
            <StatRow label="Power Transformers" value={stats?.transformers || 0} icon={Gauge} color="blue" />
            <StatRow label="Generators" value={stats?.generators || 0} icon={Zap} color="emerald" />
            <StatRow label="Energy Consumers" value={stats?.loads || 0} icon={Plug} color="accent" />
          </div>
        </SectionCard>

        <SectionCard
          title="Switching Equipment"
          subtitle="Protection & isolation"
          icon={ToggleRight}
          color="blue"
        >
          <div>
            <StatRow label="Circuit Breakers" value={stats?.breakers || 0} icon={ToggleRight} color="blue" />
            <StatRow label="Disconnectors" value={stats?.disconnectors || 0} icon={ToggleRight} color="accent" />
          </div>
          <div className="mt-5 pt-4 border-t border-primary-700/30">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Total Switching</span>
              <span className="text-2xl font-bold text-accent-400">
                {((stats?.breakers || 0) + (stats?.disconnectors || 0)).toLocaleString()}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Topology"
          subtitle="Network connectivity"
          icon={GitBranch}
          color="blue"
        >
          <div>
            <StatRow label="Connectivity Nodes" value={stats?.connectivityNodes || 0} icon={CircleDot} color="blue" />
            <StatRow label="Busbar Sections" value={stats?.busbarSections || 0} icon={TrendingUp} color="blue" />
            <StatRow label="Terminals" value={stats?.terminals || 0} icon={GitBranch} color="blue" />
            <StatRow label="Voltage Levels" value={stats?.voltageLevels || 0} icon={Layers} color="emerald" />
            <StatRow label="Base Voltages" value={stats?.baseVoltages || 0} icon={Activity} color="accent" />
          </div>
        </SectionCard>
      </div>

      {/* Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="relative overflow-hidden bg-gradient-to-br from-primary-800/40 to-primary-900/40 rounded-2xl border border-primary-700/30 p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Distribution</h3>
          <div className="flex items-center justify-around py-4">
            <ProgressRing
              value={totalEquipment}
              max={totalEquipment + totalTopology}
              label="Equipment"
            />
            <ProgressRing
              value={totalTopology}
              max={totalEquipment + totalTopology}
              label="Topology"
            />
          </div>
        </div>

        <div className="lg:col-span-2 relative overflow-hidden bg-gradient-to-br from-primary-800/40 to-primary-900/40 rounded-2xl border border-primary-700/30">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Network Summary</h3>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="bg-accent-500/10 border border-accent-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-accent-300 text-sm">Equipment</span>
                <span className="text-white font-bold">{totalEquipment}</span>
              </div>
              <div className="bg-accent-500/10 border border-accent-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-accent-300 text-sm">Topology</span>
                <span className="text-white font-bold">{totalTopology}</span>
              </div>
              <div className="bg-accent-500/10 border border-accent-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-accent-300 text-sm">Triples</span>
                <span className="text-white font-bold">{(stats?.totalTriples || 0).toLocaleString()}</span>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-emerald-300 text-sm">Classes</span>
                <span className="text-white font-bold">{stats?.totalClasses || 0}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-primary-700/30">
              <div className="text-center p-4">
                <p className="text-4xl font-bold text-accent-400">
                  <AnimatedNumber value={totalEquipment} />
                </p>
                <p className="text-neutral-400 text-sm mt-2">Total Equipment</p>
              </div>
              <div className="text-center p-4 border-x border-primary-700/30">
                <p className="text-4xl font-bold text-accent-400">
                  <AnimatedNumber value={totalTopology} />
                </p>
                <p className="text-neutral-400 text-sm mt-2">Topology Elements</p>
              </div>
              <div className="text-center p-4">
                <p className="text-4xl font-bold text-accent-400">
                  <AnimatedNumber value={stats?.totalTriples || 0} />
                </p>
                <p className="text-neutral-400 text-sm mt-2">Knowledge Graph</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-neutral-500 py-4 border-t border-primary-700/30">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <span>Live</span>
        </div>
        <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

export default Statistics;
