import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  gradient: string;
  iconBg: string;
  iconColor?: string;
  subtitle?: string;
  loading?: boolean;
}

export const StatCardSkeleton = () => (
  <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-800/50 to-primary-900/50 p-6 border border-primary-700/30">
    <div className="flex items-center justify-between mb-4">
      <div className="w-12 h-12 rounded-lg bg-primary-700/50 animate-pulse" />
      <div className="text-right space-y-2">
        <div className="h-8 w-16 rounded-lg bg-primary-700/50 animate-pulse ml-auto" />
        <div className="h-4 w-24 rounded-md bg-primary-700/30 animate-pulse ml-auto" />
      </div>
    </div>
  </div>
);

export const StatCard = ({ title, value, icon: Icon, gradient, iconBg, iconColor = 'text-white', subtitle, loading }: StatCardProps) => {
  if (loading) return <StatCardSkeleton />;

  const display = typeof value === 'number' ? value.toLocaleString('en-US') : value;

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-800/50 to-primary-900/50 p-6 border border-primary-700/30 hover:border-accent-500/30 transition-all group">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity`}></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 ${iconBg} rounded-lg`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-white mb-1 tabular-nums tracking-tight">{display}</p>
            <p className="text-sm text-neutral-400">{title}</p>
            {subtitle && (
              <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
      <div className={`absolute bottom-0 left-0 h-0.5 w-full bg-gradient-to-r ${gradient} opacity-40 group-hover:opacity-70 transition-opacity`} />
    </div>
  );
};
