import { NavLink } from 'react-router-dom';
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
  BarChart3
} from 'lucide-react';
import { apiService } from '@/services/api';

// Section separator component
const SectionLabel = ({ label }: { label: string }) => (
  <div className="px-4 pt-4 pb-2">
    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{label}</span>
  </div>
);

type ServiceStatus = 'ok' | 'error' | 'checking';

interface Services {
  backend: ServiceStatus;
  fuseki: ServiceStatus;
  llm: ServiceStatus;
}

const StatusDot = ({ status, label }: { status: ServiceStatus; label: string }) => {
  const colors: Record<ServiceStatus, string> = {
    ok:       'bg-emerald-400',
    error:    'bg-red-400',
    checking: 'bg-yellow-400 animate-pulse',
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${colors[status]}`} />
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  );
};

const Sidebar = () => {
  const [services, setServices] = useState<Services>({
    backend: 'checking',
    fuseki:  'checking',
    llm:     'checking',
  });

  useEffect(() => {
    const check = async () => {
      // Backend health
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

      // Fuseki/Jena — statistics endpoint requires Jena to be up
      try {
        await apiService.getStatistics();
        setServices(prev => ({ ...prev, fuseki: 'ok' }));
      } catch {
        setServices(prev => ({ ...prev, fuseki: 'error' }));
      }

      // LLM (Groq/Claude) — powerflow or indexing status as proxy
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

  const sections = [
    {
      label: 'Data Management',
      items: [
        { path: '/import',      icon: Database,    label: 'Data Import' },
        { path: '/validation',  icon: ShieldCheck, label: 'SHACL Validation' },
        { path: '/data-fixer',  icon: Wrench,      label: 'Data Fixer' },
        { path: '/diagnostics', icon: Activity,    label: 'Diagnostics' },
      ]
    },
    {
      label: 'Analysis',
      items: [
        { path: '/statistics', icon: BarChart3, label: 'Statistics' },
        { path: '/load-flow',  icon: Zap,       label: 'Load Flow' },
      ]
    },
    {
      label: 'Query',
      items: [
        { path: '/chat',    icon: MessageSquare,  label: 'GraphRAG Chat' },
        { path: '/sparql',  icon: Code,           label: 'SPARQL Editor' },
        { path: '/history', icon: HistoryIcon,    label: 'History' },
      ]
    },
  ];

  return (
    <aside className="w-64 bg-primary-800 border-r border-primary-700/50 flex flex-col h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-primary-700/50">
        <div className="flex items-center gap-3">
          <img
            src="/logo.svg"
            alt="CIM Platform Logo"
            className="w-10 h-10 object-contain"
          />
          <div>
            <h1 className="text-lg font-bold text-white">CIM <span className="text-accent-500">Platform</span></h1>
            <p className="text-xs text-neutral-400">Knowledge Graph</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {/* Dashboard - standalone at top */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group ${
              isActive
                ? 'bg-accent-500/15 border-l-2 border-accent-400 text-accent-400'
                : 'text-neutral-400 hover:bg-primary-700/50 hover:text-white border-l-2 border-transparent'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <LayoutDashboard size={18} className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
              <span className="font-medium text-sm">Dashboard</span>
            </>
          )}
        </NavLink>

        {sections.map((section, sectionIndex) => (
          <div key={section.label}>
            <SectionLabel label={section.label} />
            <div className="space-y-1">
              {section.items.map(({ path, icon: Icon, label }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group ${
                      isActive
                        ? 'bg-accent-500/15 border-l-2 border-accent-400 text-accent-400'
                        : 'text-neutral-400 hover:bg-primary-700/50 hover:text-white border-l-2 border-transparent'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {Icon && (
                        <Icon size={18} className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                      )}
                      <span className="font-medium text-sm">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
            {sectionIndex < sections.length - 1 && (
              <div className="my-2 mx-4 border-t border-primary-700/30" />
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-primary-700/50 space-y-3">
        {/* Service status */}
        <div className="px-1 flex items-center gap-4">
          <StatusDot status={services.backend} label="API" />
          <StatusDot status={services.fuseki}  label="Fuseki" />
          <StatusDot status={services.llm}     label="LLM" />
        </div>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-all duration-200 border-l-2 ${
              isActive
                ? 'bg-accent-500/15 border-accent-400 text-accent-400'
                : 'border-transparent text-neutral-400 hover:bg-primary-700/50 hover:text-white'
            }`
          }
        >
          <Settings size={20} />
          <span className="font-medium">Settings</span>
        </NavLink>
      </div>
    </aside>
  );
};

export default Sidebar;
