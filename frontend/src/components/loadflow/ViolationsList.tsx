import { AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import CollapsibleList from '@/components/ui/CollapsibleList';
import EmptyState from '@/components/ui/EmptyState';
import { Panel, PanelHeader, CountBadge } from '@/components/ui/Panel';

interface Violation {
  type: string;
  severity: string;
  elementId: string;
  elementName: string;
  actualValue?: number;
  limitValue?: number;
  violationPercentage?: number;
  description: string;
}

interface ViolationsListProps {
  violations: Violation[];
}

const formatNumber = (value: number | undefined, decimals = 1): string =>
  value === undefined ? 'N/A' : value.toFixed(decimals);

const ViolationRow = ({ violation }: { violation: Violation }) => {
  const isCritical = violation.severity === 'CRITICAL';

  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <div className={`flex-shrink-0 p-2 rounded-lg ${isCritical ? 'bg-red-500/15' : 'bg-accent-500/15'}`}>
        {isCritical
          ? <XCircle className="w-4 h-4 text-red-400" />
          : <AlertTriangle className="w-4 h-4 text-accent-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="font-medium text-sm text-white">{violation.elementName}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${
            isCritical
              ? 'bg-red-500/15 text-red-300 border-red-500/30'
              : 'bg-accent-500/15 text-accent-300 border-accent-500/30'
          }`}>
            {violation.severity}
          </span>
          <span className="text-xs px-2 py-0.5 bg-white/5 rounded text-neutral-400">
            {violation.type}
          </span>
        </div>

        <p className="text-sm text-neutral-300 leading-relaxed">{violation.description}</p>

        {violation.violationPercentage !== undefined && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 max-w-[200px] h-1.5 bg-primary-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${isCritical ? 'bg-red-500' : 'bg-accent-500'}`}
                style={{ width: `${Math.min(100, Math.abs(violation.violationPercentage))}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-neutral-400">
              {formatNumber(violation.violationPercentage)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const ViolationsList = ({ violations }: ViolationsListProps) => {
  if (violations.length === 0) {
    return (
      <Panel className="mb-8">
        <EmptyState
          icon={CheckCircle}
          tone="positive"
          title="No violations"
          hint="All voltages and branch loadings are within limits."
        />
      </Panel>
    );
  }

  const criticalCount = violations.filter(v => v.severity === 'CRITICAL').length;

  return (
    <Panel className="mb-8">
      <PanelHeader
        icon={AlertTriangle}
        title="System violations"
        tone={criticalCount > 0 ? 'critical' : 'warning'}
        badge={<CountBadge value={violations.length} tone={criticalCount > 0 ? 'critical' : 'warning'} />}
      />
      <CollapsibleList
        items={violations}
        itemLabel="violations"
        renderItem={(violation, i) => <ViolationRow key={i} violation={violation} />}
      />
    </Panel>
  );
};
