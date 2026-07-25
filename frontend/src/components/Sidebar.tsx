import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Code,
  Database,
  History as HistoryIcon,
  Settings,
  Zap,
  ShieldCheck,
  Activity,
  Wrench,
  BarChart3,
  FileText,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { apiService } from '@/services/api';

type ServiceStatus = 'ok' | 'error' | 'checking';

interface Services {
  backend: ServiceStatus;
  fuseki: ServiceStatus;
  llm: ServiceStatus;
}

interface NavItem {
  path: string;
  icon: LucideIcon;
  label: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    label: 'Import & Quality',
    items: [
      { path: '/import',      icon: Database,    label: 'Data Import' },
      { path: '/validation',  icon: ShieldCheck, label: 'SHACL Validation' },
      { path: '/data-fixer',  icon: Wrench,      label: 'Data Fixer' },
      { path: '/diagnostics', icon: Activity,    label: 'Diagnostics' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { path: '/statistics', icon: BarChart3, label: 'Statistics' },
      { path: '/load-flow',  icon: Zap,       label: 'Load Flow' },
      { path: '/reports',    icon: FileText,  label: 'Reports' },
    ],
  },
  {
    label: 'AI & Query',
    items: [
      { path: '/chat',    icon: MessageSquare, label: 'GraphRAG Chat' },
      { path: '/sparql',  icon: Code,          label: 'SPARQL Editor' },
      { path: '/history', icon: HistoryIcon,   label: 'History' },
    ],
  },
];

const COLLAPSE_KEY = 'cim_sidebar_collapsed';
const SECTIONS_KEY = 'cim_sidebar_open_sections';

const StatusDot = ({ status, label }: { status: ServiceStatus; label: string }) => {
  const color: Record<ServiceStatus, string> = {
    ok:       'bg-emerald-400',
    error:    'bg-red-400',
    checking: 'bg-neutral-500 animate-pulse',
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${color[status]}`} />
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  );
};

const navLinkClass = (isActive: boolean, collapsed: boolean) =>
  `flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2 rounded-md text-sm transition-colors ${
    isActive
      ? 'bg-accent-500/15 text-accent-400 font-medium'
      : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100'
  }`;

const Sidebar = () => {
  const location = useLocation();

  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true'
  );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const stored = localStorage.getItem(SECTIONS_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch { /* fall through */ }
    }
    // Default: only the section holding the current route is open
    const active = SECTIONS.find(s => s.items.some(i => location.pathname.startsWith(i.path)));
    return SECTIONS.reduce<Record<string, boolean>>((acc, s) => {
      acc[s.label] = active ? s.label === active.label : false;
      return acc;
    }, {});
  });

  const [services, setServices] = useState<Services>({
    backend: 'checking',
    fuseki:  'checking',
    llm:     'checking',
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(openSections));
  }, [openSections]);

  useEffect(() => {
    const check = async () => {
      try {
        const health = await apiService.getSystemHealth();
        setServices(prev => ({
          ...prev,
          backend: health?.status === 'healthy' || health?.status === 'degraded' ? 'ok' : 'error',
        }));
      } catch {
        setServices(prev => ({ ...prev, backend: 'error', fuseki: 'error' }));
        return;
      }
      try {
        await apiService.getStatistics();
        setServices(prev => ({ ...prev, fuseki: 'ok' }));
      } catch {
        setServices(prev => ({ ...prev, fuseki: 'error' }));
      }
      try {
        await apiService.getIndexingStatus();
        setServices(prev => ({ ...prev, llm: 'ok' }));
      } catch {
        setServices(prev => ({ ...prev, llm: 'error' }));
      }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  const toggleSection = (label: string) =>
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }));

  const allOpen = SECTIONS.every(s => openSections[s.label]);
  const toggleAll = () => {
    const next = !allOpen;
    setOpenSections(SECTIONS.reduce<Record<string, boolean>>((acc, s) => {
      acc[s.label] = next;
      return acc;
    }, {}));
  };

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 bg-primary-900 border-r border-primary-700/40 flex flex-col h-screen transition-[width] duration-200`}
    >
      {/* Brand + collapse toggle */}
      <div className={`flex items-center h-14 border-b border-primary-700/40 ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/logo.svg" alt="CIM Platform" className="w-8 h-8 object-contain shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white leading-tight truncate">
                CIM <span className="text-accent-500">Platform</span>
              </h1>
              <p className="text-[11px] text-neutral-500 leading-tight">Knowledge Graph</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-100 hover:bg-white/5 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* Dashboard */}
        <NavLink to="/dashboard" title="Dashboard" className={({ isActive }) => navLinkClass(isActive, collapsed)}>
          <LayoutDashboard size={18} className="shrink-0" />
          {!collapsed && <span>Dashboard</span>}
        </NavLink>

        {/* Section groups */}
        {SECTIONS.map(section => {
          const open = collapsed ? true : !!openSections[section.label];
          return (
            <div key={section.label} className="pt-2">
              {!collapsed ? (
                <button
                  onClick={() => toggleSection(section.label)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <span>{section.label}</span>
                  <ChevronDown size={13} className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
                </button>
              ) : (
                <div className="my-1.5 mx-2 border-t border-primary-700/30" />
              )}

              {open && (
                <div className="space-y-0.5">
                  {section.items.map(({ path, icon: Icon, label }) => (
                    <NavLink key={path} to={path} title={label} className={({ isActive }) => navLinkClass(isActive, collapsed)}>
                      <Icon size={18} className="shrink-0" />
                      {!collapsed && <span>{label}</span>}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Show all / collapse all */}
        {!collapsed && (
          <button
            onClick={toggleAll}
            className="w-full mt-2 px-3 py-1.5 text-[11px] font-medium text-neutral-500 hover:text-accent-400 transition-colors text-left"
          >
            {allOpen ? 'Collapse all' : 'Show all'}
          </button>
        )}
      </nav>

      {/* Footer: service status + settings */}
      <div className="border-t border-primary-700/40 p-2 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-4 px-3 py-1">
            <StatusDot status={services.backend} label="API" />
            <StatusDot status={services.fuseki}  label="Fuseki" />
            <StatusDot status={services.llm}     label="LLM" />
          </div>
        )}
        <NavLink to="/settings" title="Settings" className={({ isActive }) => navLinkClass(isActive, collapsed)}>
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
      </div>
    </aside>
  );
};

export default Sidebar;
