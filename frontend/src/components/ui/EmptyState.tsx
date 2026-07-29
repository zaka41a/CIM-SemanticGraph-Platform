import type { ElementType, ReactNode } from 'react';

interface EmptyStateProps {
  icon: ElementType;
  title: string;
  hint?: string;
  /** Optional single call to action. */
  action?: ReactNode;
  /** Use the positive tone when emptiness is a good outcome, e.g. no violations. */
  tone?: 'neutral' | 'positive';
}

export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  tone = 'neutral',
}: EmptyStateProps) {
  const iconColor = tone === 'positive' ? 'text-emerald-400' : 'text-neutral-500';

  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 mb-4">
        <Icon size={28} className={iconColor} />
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      {hint && <p className="text-sm text-neutral-400 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
