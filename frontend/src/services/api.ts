import axios, { AxiosInstance } from 'axios';
import type {
  ApiResponse,
  GraphStatistics,
  SparqlQueryResponse,
  GraphRAGResponse,
  CimImportResponse,
} from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 300000, // 5 minutes for GraphRAG queries (Mistral can be slow)
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Request interceptor - no authentication required
        return config;
      },
      (error) => Promise.reject(error)
    );

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

  async validateCim(file: File): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.client.post<ApiResponse>('/cim/validate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async clearGraph(): Promise<ApiResponse> {
    const response = await this.client.delete<ApiResponse>('/cim/clear');
    return response.data;
  }

  async getSupportedFormats(): Promise<string[]> {
    const response = await this.client.get<string[]>('/cim/formats');
    return response.data;
  }

  // SPARQL Query APIs
  async executeSparqlQuery(query: string): Promise<SparqlQueryResponse> {
    const response = await this.client.post<SparqlQueryResponse>('/sparql/query', { query });
    return response.data;
  }

  async executeSparqlUpdate(query: string): Promise<ApiResponse> {
    const response = await this.client.post<ApiResponse>('/sparql/update', { query });
    return response.data;
  }

  async executeSparqlAsk(query: string): Promise<boolean> {
    const response = await this.client.post<boolean>('/sparql/ask', { query });
    return response.data;
  }

  async getSampleQueries(): Promise<any[]> {
    const response = await this.client.get<any[]>('/sparql/samples');
    return response.data;
  }

  async validateSparqlQuery(query: string): Promise<ApiResponse> {
    const response = await this.client.post<ApiResponse>('/sparql/validate', { query });
    return response.data;
  }

  // GraphRAG APIs
  async askGraphRAG(question: string, sessionId?: string): Promise<GraphRAGResponse> {
    const response = await this.client.post<GraphRAGResponse>('/graphrag/ask', {
      question,
      sessionId
    });
    return response.data;
  }

  async analyzeImpact(equipmentId: string): Promise<GraphRAGResponse> {
    const response = await this.client.post<GraphRAGResponse>('/graphrag/impact', { equipmentId });
    return response.data;
  }

  async verifyConsistency(): Promise<GraphRAGResponse> {
    const response = await this.client.post<GraphRAGResponse>('/graphrag/verify');
    return response.data;
  }

  // Chat History APIs
  async getChatHistory(sessionId: string): Promise<any[]> {
    const response = await this.client.get(`/graphrag/history/${sessionId}`);
    return response.data;
  }

  async getAllChatHistory(): Promise<any[]> {
    const response = await this.client.get('/graphrag/history');
    return response.data;
  }

  async deleteChatHistory(id: string): Promise<ApiResponse> {
    const response = await this.client.delete(`/graphrag/history/${id}`);
    return response.data;
  }

  // Health Check
  async healthCheck(): Promise<any> {
    const response = await this.client.get('/actuator/health');
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

  async getImportStatistics(): Promise<any> {
    const response = await this.client.get('/history/statistics');
    return response.data;
  }

  // System Metrics APIs
  async getSystemMetrics(): Promise<any> {
    const response = await this.client.get('/system/metrics');
    return response.data;
  }

  async getSystemHealth(): Promise<any> {
    const response = await this.client.get('/system/health');
    return response.data;
  }

  // Load Flow APIs
  async calculateLoadFlow(method: string = 'DC'): Promise<any> {
    const response = await this.client.post(`/loadflow/calculate?method=${method}`);
    return response.data;
  }

  async calculateLoadFlowForBus(busId: string, method: string = 'DC'): Promise<any> {
    const response = await this.client.post(`/loadflow/calculate/${busId}?method=${method}`);
    return response.data;
  }

  async getAvailableMethods(): Promise<any[]> {
    const response = await this.client.get('/loadflow/methods');
    return response.data;
  }

  async getBusVoltage(busId: string): Promise<any> {
    const response = await this.client.get(`/loadflow/voltage/${busId}`);
    return response.data;
  }

  async getLoadFlowStatistics(): Promise<any> {
    const response = await this.client.get('/loadflow/statistics');
    return response.data;
  }

  async getLoadFlowViolations(): Promise<any> {
    const response = await this.client.get('/loadflow/violations');
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

  async getExcelFormat(): Promise<any> {
    const response = await this.client.get('/excel/format');
    return response.data;
  }

  // SHACL Validation APIs
  async validateSHACL(): Promise<any> {
    const response = await this.client.get('/shacl/validate');
    return response.data;
  }

  async getSHACLShapes(): Promise<any> {
    const response = await this.client.get('/shacl/shapes');
    return response.data;
  }

  async validateSHACLDetailed(): Promise<any> {
    const response = await this.client.post('/shacl/validate/detailed');
    return response.data;
  }

  // Diagnostic APIs
  async runNetworkDiagnostics(): Promise<any> {
    const response = await this.client.get('/diagnostic/network');
    return response.data;
  }

  // Report Generation APIs
  async generateLoadFlowReport(): Promise<Blob> {
    const response = await this.client.get('/reports/loadflow', {
      responseType: 'blob',
    });
    return response.data;
  }

  async generateDataQualityReport(issues: any[]): Promise<Blob> {
    const response = await this.client.post('/reports/data-quality',
      { issues },
      { responseType: 'blob' }
    );
    return response.data;
  }

  async generateNetworkStatisticsReport(): Promise<Blob> {
    const response = await this.client.get('/reports/statistics', {
      responseType: 'blob',
    });
    return response.data;
  }

  // Qdrant / Vector DB APIs
  async getIndexingStatus(): Promise<{
    qdrantAvailable: boolean;
    indexedEntities: number;
    collectionName: string;
    status: string;
  }> {
    const response = await this.client.get('/cim/indexing-status');
    return response.data;
  }

  async reindexEntities(): Promise<{ status: string; message: string }> {
    const response = await this.client.post('/cim/reindex');
    return response.data;
  }

  // Powerflow health check
  async getPowerflowHealth(): Promise<{ status: string; [key: string]: any }> {
    const response = await this.client.get('/loadflow/health');
    return response.data;
  }
}

export const apiService = new ApiService();
export default apiService;
