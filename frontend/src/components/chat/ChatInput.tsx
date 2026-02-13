import { Send } from 'lucide-react';

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
}

export const ChatInput = ({ input, isLoading, onInputChange, onSend }: ChatInputProps) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border-t border-primary-700/30 bg-primary-900/50 px-6 py-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about your CIM network..."
            className="flex-1 px-4 py-3 bg-primary-800 border border-primary-700/50 rounded-xl focus:outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20 transition-all text-white placeholder-neutral-500"
            disabled={isLoading}
          />
          <button
            onClick={onSend}
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 disabled:from-neutral-700 disabled:to-neutral-800 disabled:cursor-not-allowed rounded-xl transition-all font-medium text-white shadow-lg shadow-accent-500/20 flex items-center gap-2"
          >
            <Send className="w-5 h-5" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
