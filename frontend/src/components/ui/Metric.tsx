import type { ElementType } from 'react';

interface MetricProps {
  label: string;
  value: string | number;
  icon?: ElementType;
  /** Only the single most important metric of a view should be 'headline'. */
  emphasis?: 'headline' | 'normal';
  /** Reserved for genuine health states, never for decoration. */
  tone?: 'neutral' | 'positive' | 'critical';
  unit?: string;
}

const TONE_VALUE = {
  neutral: 'text-white',
  positive: 'text-emerald-400',
  critical: 'text-red-400',
} as const;

/**
 * One metric tile for the whole platform.
 *
 * The surface is always the same neutral panel: colour carries meaning (health),
 * never identity. Values use tabular figures so columns of numbers stay aligned
 * and do not jitter while polling.
 */
export default function Metric({
  label,
  value,
  icon: Icon,
  emphasis = 'normal',
  tone = 'neutral',
  unit,
}: MetricProps) {
  const headline = emphasis === 'headline' && tone === 'neutral';
  const valueColor = headline ? 'text-accent-400' : TONE_VALUE[tone];
  // Amber marks the headline metric, sky the structural ones: same rule as the Dashboard.
  const iconColor = headline ? 'text-accent-300' : 'text-sky-400';
  const iconBg = headline ? 'bg-accent-500/15' : 'bg-sky-500/15';

  return (
    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        {Icon && (
          <span className={`p-1.5 rounded-md ${iconBg}`}>
            <Icon size={13} className={iconColor} />
          </span>
        )}
        <span className="text-xs text-neutral-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${valueColor}`}>
        {value}
        {unit && <span className="text-sm font-medium text-neutral-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}
