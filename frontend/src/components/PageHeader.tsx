import type { ReactNode, ElementType } from 'react';

interface PageHeaderProps {
  icon: ElementType;
  iconColor?: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}

export default function PageHeader({
  icon: Icon,
  iconColor = 'text-accent-400',
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Icon size={26} className={iconColor} />
          {title}
        </h1>
        <p className="text-sm text-neutral-400 mt-1">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
