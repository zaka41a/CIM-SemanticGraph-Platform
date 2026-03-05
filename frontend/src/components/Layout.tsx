import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

const PAGE_NAMES: Record<string, { label: string; section?: string }> = {
  '/dashboard':   { label: 'Dashboard' },
  '/import':      { label: 'Data Import',         section: 'Data Management' },
  '/validation':  { label: 'SHACL Validation',    section: 'Data Management' },
  '/data-fixer':  { label: 'Data Fixer',           section: 'Data Management' },
  '/diagnostics': { label: 'Diagnostics',          section: 'Data Management' },
  '/statistics':  { label: 'Statistics',           section: 'Analysis' },
  '/load-flow':   { label: 'Load Flow',            section: 'Analysis' },
  '/chat':        { label: 'GraphRAG Chat',        section: 'Query' },
  '/sparql':      { label: 'SPARQL Editor',        section: 'Query' },
  '/history':     { label: 'History',              section: 'Query' },
  '/settings':    { label: 'Settings' },
};

const Layout = () => {
  const location = useLocation();
  const page = PAGE_NAMES[location.pathname];

  return (
    <div className="flex h-screen overflow-hidden bg-primary-900">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex-shrink-0 h-14 bg-primary-800/80 border-b border-primary-700/40 flex items-center px-6 gap-3">
          {page?.section && (
            <>
              <span className="text-xs text-neutral-500 font-medium">{page.section}</span>
              <span className="text-neutral-600">/</span>
            </>
          )}
          <span className="text-sm font-semibold text-white">
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
