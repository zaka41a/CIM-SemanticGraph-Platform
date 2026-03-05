import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
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

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<Layout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="chat" element={<GraphRAGChat />} />
        <Route path="load-flow" element={<LoadFlow />} />
        <Route path="data-fixer" element={<DataFixer />} />
        <Route path="sparql" element={<SparqlEditor />} />
        <Route path="import" element={<DataImport />} />
        <Route path="validation" element={<Validation />} />
        <Route path="diagnostics" element={<Diagnostics />} />
        <Route path="history" element={<History />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
