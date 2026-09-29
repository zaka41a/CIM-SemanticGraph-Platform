import axios, { AxiosInstance } from 'axios';
import type {
  ApiResponse,
  GraphStatistics,
  SparqlQueryResponse,
  CimImportResponse,
  LoadFlowResponse,
  LoadFlowMethodInfo,
  CalculationMethod,
} from '@/types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 300000, // Imports and calculations can take several minutes.
    });

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Log errors for debugging
        console.error('API Error:', error.response?.status, error.message);
        return Promise.reject(error);
      }
    );
  }

  // CIM Management APIs
  async getStatistics(): Promise<GraphStatistics> {
    const response = await this.client.get<GraphStatistics>('/cim/statistics');
    return response.data;
  }

  async importCimData(file: File, format: string): Promise<CimImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);

    const response = await this.client.post<CimImportResponse>('/cim/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async exportGraph(format: string): Promise<Blob> {
    const response = await this.client.get('/cim/export', {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  }

  async clearGraph(): Promise<ApiResponse> {
    const response = await this.client.delete<ApiResponse>('/cim/clear');
    return response.data;
  }

  // SPARQL Query APIs
  async executeSparqlQuery(query: string): Promise<SparqlQueryResponse> {
    const response = await this.client.post<SparqlQueryResponse>('/sparql/query', { query });
    return response.data;
  }

  async getLlmProviders(): Promise<
    { id: string; label: string; model: string; available: boolean; isDefault: boolean }[]
  > {
    const res = await this.client.get('/graphrag/providers', { timeout: 5000 });
    return res.data?.providers ?? [];
  }

  streamGraphRAG(
    question: string,
    callbacks: {
      onToolCall: (tool: string, input: Record<string, any>) => void;
      onToolResult: (tool: string, chars: number) => void;
      onText: (text: string) => void;
      onDone: (sources: string[], confidence: number, executionTimeMs: number) => void;
      onError: (message: string) => void;
    },
    sessionId = '',
    provider = '',
    maxRetries = 2,
  ): () => void {
    const url = `${API_BASE_URL}/graphrag/stream?question=${encodeURIComponent(question)}`
      + (sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '')
      + (provider ? `&provider=${encodeURIComponent(provider)}` : '');
    let retries = 0;
    let textReceived = false;
    let stopped = false;
    let es: EventSource;

    const connect = () => {
      es = new EventSource(url);

      es.onmessage = (event) => {
        retries = 0; // reset backoff counter on any successful message
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'tool_call') callbacks.onToolCall(data.tool, data.input ?? {});
          else if (data.type === 'tool_result') callbacks.onToolResult(data.tool, data.chars ?? 0);
          else if (data.type === 'text') {
            textReceived = true;
            callbacks.onText(data.text ?? '');
          } else if (data.type === 'done') {
            callbacks.onDone(data.sources ?? [], data.confidence ?? 0, data.execution_time_ms ?? 0);
            es.close();
          } else if (data.type === 'error') {
            callbacks.onError(data.message ?? 'Unknown error');
            es.close();
          }
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        es.close();
        if (stopped) return;
        // Only retry if no text was received yet (safe to restart the question)
        if (!textReceived && retries < maxRetries) {
          retries++;
          setTimeout(connect, 1000 * retries); // 1s, 2s backoff
        } else {
          callbacks.onError(
            textReceived
              ? 'Connection lost - response may be incomplete'
              : 'Could not connect to server. Is the backend running?',
          );
        }
      };
    };

    connect();
    return () => { stopped = true; es?.close(); };
  }

  async checkBackendHealth(): Promise<boolean> {
    try {
      const response = await this.client.get<{ status: string }>('/actuator/health', { timeout: 3000 });
      return response.data?.status === 'UP';
    } catch {
      return false;
    }
  }

  // Chat History APIs
  async getChatHistory(sessionId: string): Promise<any[]> {
    const response = await this.client.get(`/graphrag/history/${sessionId}`);
    return response.data;
  }

  async deleteChatSession(sessionId: string): Promise<ApiResponse> {
    const response = await this.client.delete(`/graphrag/history/session/${sessionId}`);
    return response.data;
  }

  // Import History APIs
  async getImportHistory(): Promise<any[]> {
    const response = await this.client.get('/history');
    return response.data;
  }

  async deleteImportHistory(id: string): Promise<ApiResponse> {
    const response = await this.client.delete(`/history/${id}`);
    return response.data;
  }

  async getSystemHealth(): Promise<{ status: string; providers?: Record<string, boolean> }> {
    const response = await this.client.get('/system/health', { timeout: 5000 });
    return response.data;
  }

  // Load Flow APIs
  async calculateLoadFlow(method: CalculationMethod = 'DC'): Promise<LoadFlowResponse> {
    const response = await this.client.post(`/loadflow/calculate?method=${method}`);
    return response.data;
  }

  async calculateLoadFlowForBus(busId: string, method: CalculationMethod = 'DC'): Promise<LoadFlowResponse> {
    const response = await this.client.post(`/loadflow/calculate/${busId}?method=${method}`);
    return response.data;
  }

  async getAvailableMethods(): Promise<LoadFlowMethodInfo[]> {
    const response = await this.client.get('/loadflow/methods');
    return response.data;
  }

  // Excel Import APIs
  async importExcel(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.client.post('/excel/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async analyzeExcel(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.client.post('/excel/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async importExcelWithMapping(file: File, mapping: Record<string, Record<string, string>>): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mapping));
    const response = await this.client.post('/excel/import-with-mapping', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  // SHACL Validation APIs
  async validateSHACL(): Promise<any> {
    const response = await this.client.get('/shacl/validate');
    return response.data;
  }

  // Diagnostic APIs
  async runNetworkDiagnostics(): Promise<any> {
    const response = await this.client.get('/diagnostic/network');
    return response.data;
  }

  // Qdrant / Vector DB APIs
  async getIndexingStatus(): Promise<{
    qdrantAvailable: boolean;
    indexedEntities: number;
    collectionName: string;
    status: string;
  }> {
    const response = await this.client.get('/cim/indexing-status', { timeout: 5000 });
    return response.data;
  }

  async reindexEntities(): Promise<{ status: string; message: string }> {
    const response = await this.client.post('/cim/reindex');
    return response.data;
  }

  // Powerflow health check
  async getPowerflowHealth(): Promise<{
    status: string;
    dcSolver: boolean;
    pandapowerAvailable: boolean;
  }> {
    const response = await this.client.get('/loadflow/health', { timeout: 5000 });
    return response.data;
  }

  // Data Fixer APIs
  async applyFixes(fixes: Array<{ id: string; description: string; category: string; sparqlQuery: string }>): Promise<{
    applied: number;
    failed: number;
    blocked: number;
    results: Array<{ id: string; description: string; category: string; status: string; error: string | null; appliedAt: string | null }>;
  }> {
    const response = await this.client.post('/fixer/apply', fixes);
    if (response.data.applied > 0) window.dispatchEvent(new Event('cim_data_imported'));
    return response.data;
  }

  // Import rollback
  async rollbackImport(id: string): Promise<{ status: string; message: string; graphUri?: string }> {
    const response = await this.client.post(`/history/${id}/rollback`);
    window.dispatchEvent(new Event('cim_data_imported'));
    return response.data;
  }
}

export const apiService = new ApiService();
export default apiService;
