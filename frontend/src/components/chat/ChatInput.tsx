import { useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onRecallLast?: () => void;
}

export const ChatInput = ({
  input,
  isLoading,
  onInputChange,
  onSend,
  onStop,
  onRecallLast,
}: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isLoading) return;
      onSend();
    }
    if (e.key === 'Escape' && isLoading && onStop) {
      onStop();
    }
    // ↑ arrow on empty input → recall last question
    if (e.key === 'ArrowUp' && !input && onRecallLast) {
      e.preventDefault();
      onRecallLast();
    }
  };

  return (
    <div className="flex gap-3 items-end">
      <textarea
        ref={textareaRef}
        rows={1}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question about your CIM network… (Enter to send, Shift+Enter for new line, ↑ to recall)"
        className="flex-1 px-4 py-3 bg-primary-800 border border-primary-700/50 rounded-xl focus:outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20 transition-all text-white placeholder-neutral-500 resize-none overflow-hidden leading-relaxed text-sm"
        disabled={false}
        style={{ minHeight: '48px', maxHeight: '160px' }}
      />

      {isLoading ? (
        <button
          onClick={onStop}
          className="flex-shrink-0 px-5 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 hover:border-red-500/70 rounded-xl transition-all font-medium text-red-400 flex items-center gap-2 text-sm"
          title="Stop generation (Esc)"
        >
          <Square className="w-4 h-4 fill-current" />
          Stop
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={!input.trim()}
          className="flex-shrink-0 px-5 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 disabled:from-neutral-700 disabled:to-neutral-800 disabled:cursor-not-allowed rounded-xl transition-all font-medium text-white shadow-lg shadow-accent-500/20 flex items-center gap-2 text-sm"
          title="Send (Enter)"
        >
          <Send className="w-4 h-4" />
          Send
        </button>
      )}
    </div>
  );
};
