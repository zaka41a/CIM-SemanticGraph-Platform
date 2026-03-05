import { Upload, FileText, Code, FileSpreadsheet, Table, Lightbulb, FileCode2, Share2, Code2, Leaf, Search } from 'lucide-react';
import { FileUploader } from '@/components/dataimport/FileUploader';
import { FormatSelector } from '@/components/dataimport/FormatSelector';
import { ImportResult } from '@/components/dataimport/ImportResult';
import { ExcelMappingModal } from '@/components/dataimport/ExcelMappingModal';
import { useDataImport } from '@/hooks/useDataImport';

const formats = [
  { name: 'CIM/XML',  icon: FileCode2, color: 'from-blue-500 to-indigo-600' },
  { name: 'CIM/RDF',  icon: Share2,    color: 'from-violet-500 to-purple-600' },
  { name: 'RDF/XML',  icon: Code2,     color: 'from-orange-500 to-amber-600' },
  { name: 'TURTLE',   icon: Leaf,      color: 'from-emerald-500 to-green-600' },
];

const excelSheets = [
  { name: 'Substations', columns: 'id, name, region' },
  { name: 'Buses', columns: 'id, name, voltage, substation' },
  { name: 'Lines', columns: 'id, name, from, to, length, r, x' },
  { name: 'Transformers', columns: 'id, name, hv_bus, lv_bus, rated_s' },
  { name: 'Generators', columns: 'id, name, bus, max_p, min_p' },
  { name: 'Loads', columns: 'id, name, bus, p, q' }
];

const DataImport = () => {
  const {
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
    handleAnalyzeAndMap,
    excelAnalysis,
    showMappingModal,
    setShowMappingModal,
    handleImportWithMapping,
  } = useDataImport();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800/50 via-primary-900/50 to-primary-950/50 p-8 border border-primary-700/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl shadow-lg shadow-accent-500/20">
              <Upload size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">Data Import</h1>
              <p className="text-neutral-300">
                Import CIM data files into the Knowledge Graph with semantic reasoning
              </p>
            </div>
          </div>
          {file && (
            <div className="flex items-center gap-3 px-4 py-2 bg-accent-500/10 border border-accent-500/30 rounded-xl">
              <FileText size={20} className="text-accent-400" />
              <span className="text-accent-400 font-semibold">{file.name}</span>
            </div>
          )}
        </div>
      </div>

      <div className="card relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-accent-500/5 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="p-5 border-b border-primary-700/30 bg-primary-800/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Upload Data File</h3>
                <p className="text-xs text-neutral-400 mt-0.5">Select import type and upload your file</p>
              </div>
              <div className="flex gap-2 bg-primary-800/50 p-1 rounded-xl">
                <button
                  onClick={() => { setImportType('cim'); setFile(null); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                    importType === 'cim'
                      ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/30'
                      : 'text-neutral-400 hover:text-white hover:bg-primary-700/50'
                  }`}
                >
                  <Code size={16} />
                  CIM/RDF
                </button>
                <button
                  onClick={() => { setImportType('excel'); setFile(null); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                    importType === 'excel'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'text-neutral-400 hover:text-white hover:bg-primary-700/50'
                  }`}
                >
                  <FileSpreadsheet size={16} />
                  Excel
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {importType === 'cim' && (
              <FormatSelector
                formats={formats}
                selectedFormat={format}
                onFormatChange={setFormat}
              />
            )}

            {importType === 'excel' && (
              <div>
                <label className="block text-sm font-semibold text-neutral-300 mb-4">
                  Expected Excel Sheets
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {excelSheets.map((sheet) => (
                    <div
                      key={sheet.name}
                      className="p-3 rounded-xl border border-primary-700/30 bg-primary-800/30 hover:border-accent-500/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Table size={16} className="text-accent-400" />
                        <span className="text-sm font-medium text-white">{sheet.name}</span>
                      </div>
                      <p className="text-xs text-neutral-500">{sheet.columns}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-start gap-2 text-xs text-neutral-400">
                  <Lightbulb size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <span>Column names can be in English or French. First row must be headers.</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-neutral-300 mb-4">
                Choose File
              </label>
              <FileUploader
                file={file}
                onFileChange={setFile}
                accept={importType === 'excel' ? '.xlsx,.xls' : '.xml,.rdf,.ttl,.owl'}
              />
            </div>

            <div className="flex gap-3">
              {importType === 'excel' && (
                <button
                  onClick={handleAnalyzeAndMap}
                  disabled={!file || isUploading}
                  className="flex-1 py-4 bg-primary-700/50 hover:bg-primary-700 border border-primary-600/50 hover:border-accent-500/50 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all font-semibold flex items-center justify-center gap-3"
                >
                  <Search size={20} />
                  Analyze &amp; Map Columns
                </button>
              )}
              <button
                onClick={handleImport}
                disabled={!file || isUploading}
                className="flex-1 py-4 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 disabled:from-neutral-600 disabled:to-neutral-700 disabled:cursor-not-allowed text-white rounded-xl transition-all font-semibold shadow-lg shadow-accent-500/20 hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-3"
              >
                {isUploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload size={20} />
                    Import to Knowledge Graph
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ImportResult result={result} error={error} />

      {showMappingModal && excelAnalysis && (
        <ExcelMappingModal
          analysis={excelAnalysis}
          onClose={() => setShowMappingModal(false)}
          onImport={handleImportWithMapping}
          isImporting={isUploading}
        />
      )}
    </div>
  );
};

export default DataImport;
