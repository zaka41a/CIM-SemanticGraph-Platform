import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import GraphRAGChat from './pages/GraphRAGChat';
import SparqlEditor from './pages/SparqlEditor';
import DataImport from './pages/DataImport';
import History from './pages/History';
import Settings from './pages/Settings';
import LoadFlow from './pages/LoadFlow';
import DataFixer from './pages/DataFixer';
import Validation from './pages/Validation';
import Diagnostics from './pages/Diagnostics';
import Statistics from './pages/Statistics';
import Reports from './pages/Reports';

function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<Layout />}>
          <Route path="dashboard"   element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="statistics"  element={<ErrorBoundary><Statistics /></ErrorBoundary>} />
          <Route path="chat"        element={<ErrorBoundary><GraphRAGChat /></ErrorBoundary>} />
          <Route path="load-flow"   element={<ErrorBoundary><LoadFlow /></ErrorBoundary>} />
          <Route path="data-fixer"  element={<ErrorBoundary><DataFixer /></ErrorBoundary>} />
          <Route path="sparql"      element={<ErrorBoundary><SparqlEditor /></ErrorBoundary>} />
          <Route path="import"      element={<ErrorBoundary><DataImport /></ErrorBoundary>} />
          <Route path="validation"  element={<ErrorBoundary><Validation /></ErrorBoundary>} />
          <Route path="diagnostics" element={<ErrorBoundary><Diagnostics /></ErrorBoundary>} />
          <Route path="history"     element={<ErrorBoundary><History /></ErrorBoundary>} />
          <Route path="reports"     element={<ErrorBoundary><Reports /></ErrorBoundary>} />
          <Route path="settings"    element={<ErrorBoundary><Settings /></ErrorBoundary>} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}

export default App;
