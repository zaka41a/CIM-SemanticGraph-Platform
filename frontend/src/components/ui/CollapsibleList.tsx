import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  /** How many rows stay visible when collapsed. */
  previewCount?: number;
  /** Plural noun used in the toggle label, e.g. "errors". */
  itemLabel?: string;
  className?: string;
}

/**
 * Keeps long lists to a short preview with a "Show all" toggle.
 *
 * Applied everywhere a list can grow without bound, so no page can push its
 * later sections below the fold just because the data set got bigger.
 */
export default function CollapsibleList<T>({
  items,
  renderItem,
  previewCount = 3,
  itemLabel = 'items',
  className = '',
}: CollapsibleListProps<T>) {
  const [expanded, setExpanded] = useState(false);

  const overflow = items.length - previewCount;
  const visible = expanded ? items : items.slice(0, previewCount);

  return (
    <div className={className}>
      <div className="divide-y divide-primary-700/20">
        {visible.map((item, i) => renderItem(item, i))}
      </div>

      {overflow > 0 && (
        <button
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold
                     text-neutral-400 hover:text-accent-400 border-t border-primary-700/30
                     hover:bg-white/[0.02] transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 focus-visible:ring-inset"
        >
          {expanded ? (
            <>
              <ChevronUp size={14} /> Show less
            </>
          ) : (
            <>
              <ChevronDown size={14} /> Show all {items.length} {itemLabel}
            </>
          )}
        </button>
      )}
    </div>
  );
}
