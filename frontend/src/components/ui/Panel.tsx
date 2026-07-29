import type { ElementType, ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
}

/** Standard surface. Every boxed section on every page uses this, nothing else. */
export function Panel({ children, className = '' }: PanelProps) {
  return (
    <div className={`bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  icon?: ElementType;
  title: string;
  /** Short count or status shown at the far right. */
  badge?: ReactNode;
  /** Tone tints the header strip, reserved for genuine error or warning sections. */
  tone?: 'neutral' | 'critical' | 'warning';
}

const TONES = {
  neutral: 'border-primary-700/30',
  critical: 'border-red-500/20 bg-red-500/[0.04]',
  warning: 'border-accent-500/20 bg-accent-500/[0.04]',
} as const;

const TITLE_TONES = {
  neutral: 'text-white',
  critical: 'text-red-300',
  warning: 'text-accent-300',
} as const;

// Sky marks structural sections, matching the Dashboard stat cards.
const ICON_TONES = {
  neutral: 'text-sky-400',
  critical: 'text-red-300',
  warning: 'text-accent-300',
} as const;

export function PanelHeader({ icon: Icon, title, badge, tone = 'neutral' }: PanelHeaderProps) {
  return (
    <div className={`px-5 py-3.5 border-b flex items-center gap-3 ${TONES[tone]}`}>
      {Icon && <Icon size={16} className={ICON_TONES[tone]} />}
      <h3 className={`text-sm font-semibold ${TITLE_TONES[tone]}`}>{title}</h3>
      {badge && <div className="ml-auto">{badge}</div>}
    </div>
  );
}

interface CountBadgeProps {
  value: number;
  tone?: 'neutral' | 'critical' | 'warning';
}

export function CountBadge({ value, tone = 'neutral' }: CountBadgeProps) {
  const styles = {
    neutral: 'bg-white/5 text-neutral-300 border-white/10',
    critical: 'bg-red-500/15 text-red-300 border-red-500/30',
    warning: 'bg-accent-500/15 text-accent-300 border-accent-500/30',
  } as const;

  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums border ${styles[tone]}`}>
      {value}
    </span>
  );
}
