// API Response Types
export interface ApiResponse<T = any> {
  status: string;
  message?: string;
  data?: T;
  error?: string;
}

// Graph Statistics
export interface GraphStatistics {
  totalTriples: number;
  totalSubjects: number;
  totalPredicates: number;
  totalClasses: number;
  substations?: number;
  generators?: number;
  transmissionLines?: number;
  transformers?: number;
  breakers?: number;
  disconnectors?: number;
  loads?: number;
  connectivityNodes?: number;
  terminals?: number;
  busbarSections?: number;
  baseVoltages?: number;
  voltageLevels?: number;
}

// SPARQL Query Types
export interface SparqlQueryRequest {
  query: string;
}

export interface SparqlQueryResponse {
  results: Array<Record<string, any>>;
  count: number;
  executionTimeMs?: number;
}

// GraphRAG Types
export interface GraphRAGRequest {
  question: string;
}

export interface GraphRAGResponse {
  answer: string;
  question: string;
  graphContext?: string;
  sources?: string[];
  confidence?: number;
  triplesRetrieved?: number;
  executionTimeMs?: number;
  llmModel?: string;
}

export interface ImpactAnalysisRequest {
  equipmentId: string;
}

// CIM Import Types
export interface CimImportRequest {
  file: File;
  format: 'CIM/XML' | 'CIM/RDF' | 'RDF/XML' | 'TURTLE';
}

export interface CimImportResponse {
  status: string;
  message: string;
  statistics: {
    originalTriples: number;
    inferredTriples?: number;
    totalTriples: number;
  };
}

// Graph Node/Edge Types for Visualization
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  properties?: Record<string, any>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Chat Message Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: string[];
  confidence?: number;
}

// Sample Query Type
export interface SampleQuery {
  name: string;
  description: string;
  query: string;
  category: 'basic' | 'advanced' | 'graphrag';
}

// Load Flow Types
export type CalculationMethod = 'DC' | 'AC_NEWTON_RAPHSON' | 'OPF';

export interface LoadFlowMethodInfo {
  id: CalculationMethod;
  name: string;
  description: string;
  available: boolean;
}

export interface LoadFlowBusResult {
  busId: string;
  busName: string;
  busType: string;
  voltageMagnitude: number;
  voltageAngle: number;
  voltageKv: number;
  activePowerMw: number;
  reactivePowerMvar: number;
  generationMw: number;
  generationMvar: number;
  loadMw: number;
  loadMvar: number;
  withinLimits: boolean;
  voltagePercentage: number;
}

export interface LoadFlowBranchResult {
  branchId: string;
  branchName: string;
  branchType: string;
  fromBusId: string;
  toBusId: string;
  fromActivePowerMw: number;
  fromReactivePowerMvar: number;
  toActivePowerMw: number;
  toReactivePowerMvar: number;
  lossActivePowerMw: number;
  lossReactivePowerMvar: number;
  currentMagnitude: number;
  loadingPercentage: number;
  overloaded: boolean;
}

export interface LoadFlowStatistics {
  totalBuses: number;
  totalBranches: number;
  pvBuses: number;
  pqBuses: number;
  slackBuses: number;
  totalGenerationMw: number;
  totalGenerationMvar: number;
  totalLoadMw: number;
  totalLoadMvar: number;
  totalLossesMw: number;
  totalLossesMvar: number;
  lossPercentage: number;
  minVoltagePu: number;
  maxVoltagePu: number;
  avgVoltagePu: number;
  minVoltageBus: string;
  maxVoltageBus: string;
}

export interface LoadFlowViolation {
  type: string;
  severity: string;
  elementId: string;
  elementName: string;
  actualValue: number;
  limitValue: number;
  violationPercentage: number;
  description: string;
}

export interface LoadFlowResponse {
  converged: boolean;
  iterations: number;
  tolerance: number;
  executionTimeMs: number;
  timestamp?: string;
  calculationMethod: string;
  busResults: LoadFlowBusResult[];
  branchResults: LoadFlowBranchResult[];
  statistics: LoadFlowStatistics;
  violations: LoadFlowViolation[];
  targetBusId?: string;
  networkId?: string;
}
