import { Code, Database, FileText, Server } from 'lucide-react';

interface Format {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface FormatSelectorProps {
  formats: Format[];
  selectedFormat: string;
  onFormatChange: (format: string) => void;
}

export const FormatSelector = ({ formats, selectedFormat, onFormatChange }: FormatSelectorProps) => {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-300 mb-4">
        Select Format
      </label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {formats.map((fmt) => {
          const Icon = fmt.icon;
          return (
            <button
              key={fmt.name}
              onClick={() => onFormatChange(fmt.name)}
              className={`group p-4 rounded-xl border transition-all duration-300 hover:scale-[1.02] ${
                selectedFormat === fmt.name
                  ? 'border-accent-500/50 bg-accent-500/10 shadow-lg shadow-accent-500/10'
                  : 'border-primary-700/30 bg-primary-800/30 hover:border-accent-500/30 hover:bg-primary-700/40'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${fmt.color} ${
                  selectedFormat === fmt.name ? 'bg-opacity-20' : 'bg-opacity-10'
                } group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className={`text-sm font-medium transition-colors ${
                  selectedFormat === fmt.name ? 'text-accent-400' : 'text-neutral-300 group-hover:text-accent-400'
                }`}>
                  {fmt.name}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
