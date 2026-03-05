import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

const PAGE_META: Record<string, { label: string; section?: string; color: string }> = {
  '/dashboard':   { label: 'Dashboard',        color: 'text-accent-400' },
  '/import':      { label: 'Data Import',       section: 'Data Management', color: 'text-accent-400' },
  '/validation':  { label: 'SHACL Validation',  section: 'Data Management', color: 'text-accent-400' },
  '/data-fixer':  { label: 'Data Fixer',         section: 'Data Management', color: 'text-accent-400' },
  '/diagnostics': { label: 'Diagnostics',        section: 'Data Management', color: 'text-accent-400' },
  '/statistics':  { label: 'Statistics',         section: 'Analysis',        color: 'text-accent-400' },
  '/load-flow':   { label: 'Load Flow',          section: 'Analysis',        color: 'text-accent-400' },
  '/chat':        { label: 'GraphRAG Chat',      section: 'AI & Query',      color: 'text-accent-400' },
  '/sparql':      { label: 'SPARQL Editor',      section: 'AI & Query',      color: 'text-accent-400' },
  '/history':     { label: 'History',            section: 'AI & Query',      color: 'text-accent-400' },
  '/settings':    { label: 'Settings',           color: 'text-accent-400' },
};

const Layout = () => {
  const location = useLocation();
  const page = PAGE_META[location.pathname];

  return (
    <div className="flex h-screen overflow-hidden bg-primary-900">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex-shrink-0 h-14 bg-primary-800/80 border-b border-primary-700/40 flex items-center px-6 gap-2">
          {page?.section && (
            <>
              <span className="text-xs text-neutral-500 font-medium">{page.section}</span>
              <span className="text-neutral-600 text-xs">/</span>
            </>
          )}
          <span className={`text-sm font-semibold ${page?.color ?? 'text-accent-400'}`}>
            {page?.label ?? 'CIM Platform'}
          </span>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
