import { useState, useEffect, useRef } from 'react';
import { apiService } from '@/services/api';
import { storageRemove } from '@/utils/storage';
import type { LoadFlowResponse, LoadFlowMethodInfo, CalculationMethod } from '@/types';

type NetworkStatus = 'checking' | 'empty' | 'ready' | 'error';

export const useLoadFlow = () => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [results, setResults] = useState<LoadFlowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('checking');
  const [selectedMethod, setSelectedMethod] = useState<CalculationMethod>('AC_NEWTON_RAPHSON');
  const [availableMethods, setAvailableMethods] = useState<LoadFlowMethodInfo[]>([]);
  const calculation = useRef({ id: 0 });

  useEffect(() => {
    const request = calculation.current;
    let mounted = true;
    let checkId = 0;
    // Old browser results cannot be associated with the current Fuseki dataset.
    storageRemove('cim_load_flow_results');

    const checkNetwork = async () => {
      const id = ++checkId;
      setNetworkStatus('checking');
      try {
        const stats = await apiService.getStatistics();
        if (mounted && id === checkId) {
          setNetworkStatus(stats.totalTriples > 0 ? 'ready' : 'empty');
        }
      } catch {
        if (mounted && id === checkId) {
          setNetworkStatus('error');
          setError('Unable to check the network. Make sure the backend and Fuseki are running.');
        }
      }
    };

    void apiService.getAvailableMethods()
      .then(methods => {
        if (!mounted) return;
        setAvailableMethods(methods);
        setSelectedMethod(current => methods.some(method => method.id === current && method.available)
          ? current : methods.find(method => method.available)?.id ?? 'DC');
      })
      .catch(() => {
        if (mounted) setError('Unable to check the available calculation methods. Reload this page to retry.');
      });

    const onDataChanged = () => {
      request.id++;
      setResults(null);
      setError(null);
      setIsCalculating(false);
      void checkNetwork();
    };
    void checkNetwork();
    window.addEventListener('cim_data_imported', onDataChanged);
    return () => {
      mounted = false;
      request.id++;
      window.removeEventListener('cim_data_imported', onDataChanged);
    };
  }, []);

  const calculateLoadFlow = async (targetBusId?: string, method?: CalculationMethod) => {
    const calcMethod = method ?? selectedMethod;
    if (isCalculating || networkStatus !== 'ready'
      || !availableMethods.some(option => option.id === calcMethod && option.available)) return;

    const id = ++calculation.current.id;
    setIsCalculating(true);
    setResults(null);
    setError(null);
    try {
      const response = targetBusId
        ? await apiService.calculateLoadFlowForBus(targetBusId, calcMethod)
        : await apiService.calculateLoadFlow(calcMethod);
      if (id !== calculation.current.id) return;
      if (response.busResults.length === 0) {
        setError(response.violations.find(violation => violation.type === 'CALCULATION_ERROR')?.description
          ?? response.violations[0]?.description
          ?? 'No calculable network was found. Import a network with connected buses first.');
        return;
      }
      setResults(response);
    } catch (err) {
      if (id === calculation.current.id) {
        setError(err instanceof Error ? err.message : 'Failed to calculate load flow');
      }
    } finally {
      if (id === calculation.current.id) setIsCalculating(false);
    }
  };

  return {
    isCalculating,
    results,
    error,
    networkStatus,
    calculateLoadFlow,
    selectedMethod,
    setSelectedMethod,
    availableMethods,
  };
};
