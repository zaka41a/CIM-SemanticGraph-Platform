import { useState } from 'react';
import { apiService } from '@/services/api';

export const useDataImport = () => {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<string>('RDF/XML');
  const [importType, setImportType] = useState<'cim' | 'excel'>('cim');
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [excelAnalysis, setExcelAnalysis] = useState<any>(null);
  const [showMappingModal, setShowMappingModal] = useState(false);

  const handleImport = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setResult(null);

    try {
      let response;
      if (importType === 'excel') {
        response = await apiService.importExcel(file);
      } else {
        response = await apiService.importCimData(file, format);
      }
      setResult(response);

      // Notify the rest of the app after a short delay so the backend can update statistics
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('cim_data_imported', {
          detail: { importType, format, fileName: file.name },
        }));
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to import data');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalyzeAndMap = async () => {
    if (!file) return;
    setError(null);
    setIsUploading(true);
    try {
      const analysis = await apiService.analyzeExcel(file);
      setExcelAnalysis(analysis);
      setShowMappingModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleImportWithMapping = async (mapping: Record<string, Record<string, string>>) => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiService.importExcelWithMapping(file, mapping);
      setResult(response);
      setShowMappingModal(false);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('cim_data_imported', {
          detail: { importType, fileName: file.name }
        }));
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to import data');
    } finally {
      setIsUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setExcelAnalysis(null);
    setShowMappingModal(false);
  };

  return {
    file,
    format,
    importType,
    isUploading,
    result,
    error,
    excelAnalysis,
    showMappingModal,
    setFile,
    setFormat,
    setImportType,
    handleImport,
    handleAnalyzeAndMap,
    handleImportWithMapping,
    setShowMappingModal,
    reset,
  };
};
