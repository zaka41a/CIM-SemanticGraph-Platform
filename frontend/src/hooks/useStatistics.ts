import { useState, useEffect, useCallback } from 'react';
import { apiService } from '@/services/api';
import { GraphStatistics } from '@/types';

const DATA_IMPORT_EVENT = 'cim_data_imported';

export const useStatistics = (autoRefresh: boolean = true, interval: number = 10000) => {
  const [stats, setStats] = useState<GraphStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatistics = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiService.getStatistics();
      setStats(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatistics();

    if (autoRefresh) {
      const refreshInterval = setInterval(loadStatistics, interval);
      return () => clearInterval(refreshInterval);
    }
  }, [autoRefresh, interval, loadStatistics]);

  // Refresh immediately when data is imported elsewhere in the app
  useEffect(() => {
    const handleDataImport = () => { loadStatistics(); };
    window.addEventListener(DATA_IMPORT_EVENT, handleDataImport);
    return () => window.removeEventListener(DATA_IMPORT_EVENT, handleDataImport);
  }, [loadStatistics]);

  return {
    stats,
    loading,
    error,
    refresh: loadStatistics,
  };
};
