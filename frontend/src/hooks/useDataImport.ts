import { useState } from 'react';
import { apiService } from '@/services/api';

export const useDataImport = () => {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<string>('RDF/XML');
  const [importType, setImportType] = useState<'cim' | 'excel'>('cim');
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
      
      // Emit event to notify that a new file has been imported
      // Wait a delay to let the backend update statistics
      console.log('Import successful, dispatching refresh event in 1 second...');
      setTimeout(() => {
        console.log('Dispatching cim_data_imported event...');
        const event = new CustomEvent('cim_data_imported', { 
          detail: { importType, format, fileName: file.name } 
        });
        window.dispatchEvent(event);
        console.log('Event dispatched:', event);
      }, 1000); // 1 second delay to give the backend time to process
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
  };

  return {
    file,
    format,
    importType,
    isUploading,
    result,
    error,
    setFile,
    setFormat,
    setImportType,
    handleImport,
    reset,
  };
};
