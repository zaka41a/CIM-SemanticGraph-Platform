import { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, ArrowRight, Upload } from 'lucide-react';

// The canonical keys that the platform understands
const CANONICAL_OPTIONS = [
  { value: '', label: '- skip this column -' },
  { value: 'id',         label: 'id - unique identifier' },
  { value: 'name',       label: 'name - entity name' },
  { value: 'region',     label: 'region - geographic region' },
  { value: 'voltage',    label: 'voltage - nominal voltage (kV)' },
  { value: 'substation', label: 'substation - parent substation' },
  { value: 'bus',        label: 'bus - connected bus' },
  { value: 'from',       label: 'from - from-bus (lines)' },
  { value: 'to',         label: 'to - to-bus (lines)' },
  { value: 'r',          label: 'r - resistance (Ω)' },
  { value: 'x',          label: 'x - reactance (Ω)' },
  { value: 'length',     label: 'length - line length (km)' },
  { value: 'hv_bus',     label: 'hv_bus - high-voltage bus (transformers)' },
  { value: 'lv_bus',     label: 'lv_bus - low-voltage bus (transformers)' },
  { value: 'rated_s',    label: 'rated_s - rated apparent power (MVA)' },
  { value: 'max_p',      label: 'max_p - max active power (MW)' },
  { value: 'min_p',      label: 'min_p - min active power (MW)' },
  { value: 'p',          label: 'p - active power (MW)' },
  { value: 'q',          label: 'q - reactive power (MVAr)' },
];

const SHEET_TYPE_OPTIONS = [
  { value: '',            label: '- skip this sheet -' },
  { value: 'substation',  label: 'Substations' },
  { value: 'bus',         label: 'Buses / Nodes' },
  { value: 'line',        label: 'Transmission Lines' },
  { value: 'transformer', label: 'Transformers' },
  { value: 'generator',   label: 'Generators' },
  { value: 'load',        label: 'Loads / Consumers' },
  { value: 'voltage',     label: 'Voltage Levels' },
];

interface SheetAnalysis {
  sheetName: string;
  detectedType: string | null;
  rawColumns: string[];
  recognizedColumns: Record<string, string>;
  unknownColumns: string[];
  rowCount: number;
}

interface ExcelAnalysis {
  fileName: string;
  sheets: SheetAnalysis[];
}

interface Props {
  analysis: ExcelAnalysis;
  onClose: () => void;
  onImport: (mapping: Record<string, Record<string, string>>) => void;
  isImporting: boolean;
}

export const ExcelMappingModal = ({ analysis, onClose, onImport, isImporting }: Props) => {
  // sheetMappings[sheetName][rawCol] = canonicalKey
  const [sheetMappings, setSheetMappings] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    analysis.sheets.forEach(sheet => {
      init[sheet.sheetName] = {};
      // Pre-fill unknown columns with empty (user must choose)
      sheet.unknownColumns.forEach(col => { init[sheet.sheetName][col] = ''; });
    });
    return init;
  });

  // sheetTypeOverrides[sheetName] = type
  const [sheetTypeOverrides, setSheetTypeOverrides] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    analysis.sheets.forEach(s => { if (!s.detectedType) init[s.sheetName] = ''; });
    return init;
  });

  const setColumnMapping = (sheetName: string, rawCol: string, canonical: string) => {
    setSheetMappings(prev => ({
      ...prev,
      [sheetName]: { ...prev[sheetName], [rawCol]: canonical },
    }));
  };

  const setSheetType = (sheetName: string, type: string) => {
    setSheetTypeOverrides(prev => ({ ...prev, [sheetName]: type }));
  };

  const handleImport = () => {
    // Build final mapping object: include column mappings + __sheet_type__ hints
    const finalMapping: Record<string, Record<string, string>> = {};
    analysis.sheets.forEach(sheet => {
      const colMap = { ...(sheetMappings[sheet.sheetName] || {}) };
      // Remove empty mappings (skip columns)
      Object.keys(colMap).forEach(k => { if (!colMap[k]) delete colMap[k]; });
      // Inject sheet type override if needed
      const override = sheetTypeOverrides[sheet.sheetName];
      if (override) colMap['__sheet_type__'] = override;
      finalMapping[sheet.sheetName] = colMap;
    });
    onImport(finalMapping);
  };

  const hasUnresolved = analysis.sheets.some(s =>
    (!s.detectedType && !sheetTypeOverrides[s.sheetName]) ||
    s.unknownColumns.some(col => !sheetMappings[s.sheetName]?.[col])
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-primary-900 border border-primary-700/50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-primary-700/30">
          <div>
            <h2 className="text-lg font-bold text-white">Excel Column Mapping</h2>
            <p className="text-sm text-neutral-400 mt-0.5">{analysis.fileName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-primary-700/50 text-neutral-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {analysis.sheets.map(sheet => (
            <div key={sheet.sheetName} className="rounded-xl border border-primary-700/30 bg-primary-800/30 overflow-hidden">
              {/* Sheet header */}
              <div className="flex items-center justify-between px-4 py-3 bg-primary-800/50 border-b border-primary-700/30">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white">{sheet.sheetName}</span>
                  <span className="text-xs text-neutral-500">{sheet.rowCount} rows</span>
                  {sheet.detectedType ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                      {sheet.detectedType}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                      undetected
                    </span>
                  )}
                </div>
                {sheet.unknownColumns.length === 0 && sheet.detectedType && (
                  <CheckCircle2 size={16} className="text-emerald-400" />
                )}
              </div>

              <div className="p-4 space-y-4">
                {/* Sheet type override if not detected */}
                {!sheet.detectedType && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-amber-300 mb-2">Sheet type not recognized. Select the type:</p>
                      <select
                        value={sheetTypeOverrides[sheet.sheetName] || ''}
                        onChange={e => setSheetType(sheet.sheetName, e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-primary-900 border border-primary-600 text-sm text-white focus:outline-none focus:border-accent-500"
                      >
                        {SHEET_TYPE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Recognized columns */}
                {Object.keys(sheet.recognizedColumns).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-neutral-400 mb-2">Recognized columns</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(sheet.recognizedColumns).map(([raw, canonical]) => (
                        <div key={raw} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <span className="text-xs text-neutral-300 truncate flex-1">{raw}</span>
                          <ArrowRight size={12} className="text-emerald-500 flex-shrink-0" />
                          <span className="text-xs text-emerald-400 font-mono">{canonical}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unknown columns - user must map */}
                {sheet.unknownColumns.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-neutral-400 mb-2 flex items-center gap-1.5">
                      <AlertTriangle size={12} className="text-amber-400" />
                      Unknown columns - please map:
                    </p>
                    <div className="space-y-2">
                      {sheet.unknownColumns.map(col => (
                        <div key={col} className="flex items-center gap-3">
                          <span className="text-sm text-neutral-300 w-36 truncate font-mono">{col}</span>
                          <ArrowRight size={14} className="text-neutral-600 flex-shrink-0" />
                          <select
                            value={sheetMappings[sheet.sheetName]?.[col] || ''}
                            onChange={e => setColumnMapping(sheet.sheetName, col, e.target.value)}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-primary-900 border border-primary-600 text-sm text-white focus:outline-none focus:border-accent-500"
                          >
                            {CANONICAL_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sheet.unknownColumns.length === 0 && sheet.detectedType && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> All columns recognized automatically
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-primary-700/30 flex items-center justify-between gap-4">
          <p className="text-xs text-neutral-500">
            {hasUnresolved
              ? 'Some sheets or columns are not fully mapped'
              : 'Ready to import'}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-primary-600 text-neutral-400 hover:text-white hover:border-primary-500 text-sm transition-colors">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-accent-500/20"
            >
              {isImporting ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Importing...</>
              ) : (
                <><Upload size={16} />Import with Mapping</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
