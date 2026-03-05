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

// Extract Tailwind color name from the gradient string (e.g. "from-emerald-500 to-green-600" → "emerald")
const getBadge = (color: string) => {
  const match = color.match(/from-(\w+)-/);
  return match ? match[1] : 'accent';
};

export const FormatSelector = ({ formats, selectedFormat, onFormatChange }: FormatSelectorProps) => {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-300 mb-4">
        Select Format
      </label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {formats.map((fmt) => {
          const Icon = fmt.icon;
          const isSelected = selectedFormat === fmt.name;
          return (
            <button
              key={fmt.name}
              onClick={() => onFormatChange(fmt.name)}
              className={`group p-4 rounded-xl border transition-all duration-300 hover:scale-[1.02] ${
                isSelected
                  ? 'border-white/20 bg-primary-800/60 shadow-lg'
                  : 'border-primary-700/30 bg-primary-800/30 hover:border-white/10 hover:bg-primary-700/40'
              }`}
            >
              <div className="flex flex-col items-center gap-2.5">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${fmt.color} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className={`text-sm font-semibold transition-colors ${
                  isSelected ? 'text-white' : 'text-neutral-400 group-hover:text-white'
                }`}>
                  {fmt.name}
                </span>
                {isSelected && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold bg-gradient-to-r ${fmt.color} text-white`}>
                    Selected
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
