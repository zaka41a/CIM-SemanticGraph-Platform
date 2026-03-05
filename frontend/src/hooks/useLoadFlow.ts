import { useState, useEffect } from 'react';
import { apiService } from '@/services/api';
import { storageGet, storageSet, storageRemove } from '@/utils/storage';
import type { LoadFlowMethodInfo, CalculationMethod } from '@/types';

interface LoadFlowResponse {
  converged: boolean;
  iterations: number;
  tolerance: number;
  executionTimeMs: number;
  timestamp: string;
  calculationMethod: string;
  busResults: any[];
  branchResults: any[];
  statistics: any;
  violations: any[];
  targetBusId?: string;
}

const LOAD_FLOW_STORAGE_KEY = 'cim_load_flow_results';
const DATA_IMPORT_EVENT = 'cim_data_imported';

export const useLoadFlow = () => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [results, setResults] = useState<LoadFlowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<CalculationMethod>('DC');
  const [availableMethods, setAvailableMethods] = useState<LoadFlowMethodInfo[]>([
    { id: 'DC', name: 'DC Power Flow', description: 'Fast linear approximation', available: true },
  ]);

  // Fetch available methods on mount
  useEffect(() => {
    apiService.getAvailableMethods()
      .then((methods) => {
        if (methods && methods.length > 0) setAvailableMethods(methods);
      })
      .catch((err) => {
        console.warn('Could not fetch available methods:', err);
      });
  }, []);

  // Restore results from storage on load
  useEffect(() => {
    const saved = storageGet<LoadFlowResponse>(LOAD_FLOW_STORAGE_KEY);
    if (saved) setResults(saved);
  }, []);

  // Listen for data import events to clear results
  useEffect(() => {
    const handleDataImport = () => {
      setResults(null);
      setError(null);
      storageRemove(LOAD_FLOW_STORAGE_KEY);
    };
    window.addEventListener(DATA_IMPORT_EVENT, handleDataImport);
    return () => window.removeEventListener(DATA_IMPORT_EVENT, handleDataImport);
  }, []);

  // Persist results when they change
  useEffect(() => {
    if (results) storageSet(LOAD_FLOW_STORAGE_KEY, results);
  }, [results]);

  const calculateLoadFlow = async (targetBusId?: string, method?: CalculationMethod) => {
    setIsCalculating(true);
    setError(null);
    const calcMethod = method || selectedMethod;
    try {
      const response = targetBusId
        ? await apiService.calculateLoadFlowForBus(targetBusId, calcMethod)
        : await apiService.calculateLoadFlow(calcMethod);
      setResults(response);
    } catch (err: any) {
      setError(err.message || 'Failed to calculate load flow');
      console.error('Load flow calculation error:', err);
    } finally {
      setIsCalculating(false);
    }
  };

  const clearResults = () => {
    setResults(null);
    setError(null);
    storageRemove(LOAD_FLOW_STORAGE_KEY);
  };

  return {
    isCalculating,
    results,
    error,
    calculateLoadFlow,
    clearResults,
    selectedMethod,
    setSelectedMethod,
    availableMethods,
  };
};
