import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  gradient: string;
  iconBg: string;
  subtitle?: string;
}

export const StatCard = ({ title, value, icon: Icon, gradient, iconBg, subtitle }: StatCardProps) => {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-800/50 to-primary-900/50 p-6 border border-primary-700/30 hover:border-accent-500/30 transition-all group">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity`}></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 ${iconBg} rounded-lg`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-white mb-1">{value}</p>
            <p className="text-sm text-neutral-400">{title}</p>
            {subtitle && (
              <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
