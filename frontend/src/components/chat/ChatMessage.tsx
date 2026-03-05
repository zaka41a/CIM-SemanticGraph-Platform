import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot, User, Copy, Check, ThumbsUp, ThumbsDown,
  ChevronDown, ChevronRight, Wrench, Zap, Search,
  Database, GitBranch, Activity, Clock, Sparkles,
} from 'lucide-react';
import { ChatMessage as ChatMessageType } from '@/types';

// ── CIM URI → human-readable label ────────────────────────────────────────────
const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Substation: Database,
  GeneratingUnit: Zap,
  ACLineSegment: GitBranch,
  TransformerWinding: Activity,
  BusbarSection: Activity,
  EnergyConsumer: Activity,
};

function parseSource(uri: string): { label: string; type: string } {
  const fragment = uri.split('#').pop() ?? uri.split('/').pop() ?? uri;
  const parts = fragment.split('_');
  // Try to detect CIM type prefix: e.g. "Substation_Dusseldorf_220kV"
  const knownTypes = Object.keys(TYPE_ICONS);
  const matchedType = knownTypes.find(t => parts[0] === t || fragment.startsWith(t));
  if (matchedType) {
    const label = parts.slice(1).join(' ') || fragment;
    return { label, type: matchedType };
  }
  // Fallback: clean up underscores
  return { label: fragment.replace(/_/g, ' ').substring(0, 40), type: 'Entity' };
}

// ── Tool call accordion item ───────────────────────────────────────────────────
const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  semantic_search: Search,
  sparql_query: Database,
  load_flow: Activity,
  get_entity_details: GitBranch,
  graph_traverse: GitBranch,
};

function ToolCallItem({
  tool,
  input,
  chars,
}: {
  tool: string;
  input: Record<string, any>;
  chars?: number;
}) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICONS[tool] ?? Wrench;
  const done = chars !== undefined;

  return (
    <div className="border border-primary-700/40 rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-primary-800/60 hover:bg-primary-800 transition-colors text-left"
      >
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${done ? 'text-emerald-400' : 'text-yellow-400 animate-pulse'}`} />
        <span className="font-mono text-neutral-300 flex-1">{tool}</span>
        {done && <span className="text-neutral-500">{chars} chars</span>}
        {!done && <span className="text-yellow-400/70 text-xs">running…</span>}
        {open ? <ChevronDown className="w-3 h-3 text-neutral-500" /> : <ChevronRight className="w-3 h-3 text-neutral-500" />}
      </button>
      {open && (
        <div className="px-3 py-2 bg-primary-900/60 font-mono text-neutral-400 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
          {JSON.stringify(input, null, 2)}
        </div>
      )}
    </div>
  );
}

// ── Streaming cursor ───────────────────────────────────────────────────────────
const StreamingCursor = () => (
  <span className="inline-block w-0.5 h-4 bg-accent-400 ml-0.5 animate-pulse align-middle" />
);

// ── Main component ─────────────────────────────────────────────────────────────
interface ChatMessageProps {
  message: ChatMessageType;
  onFeedback?: (id: string, feedback: 'up' | 'down') => void;
  onFollowUpClick?: (question: string) => void;
}

export const ChatMessage = ({ message, onFeedback, onFollowUpClick }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasToolCalls = (message.toolCalls?.length ?? 0) > 0;

  return (
    <div className={`flex gap-4 mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-lg shadow-accent-500/20 mt-1">
          <Bot className="w-5 h-5 text-white" />
        </div>
      )}

      <div className={`flex flex-col max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>

        {/* Tool calls accordion (assistant only) */}
        {!isUser && hasToolCalls && (
          <div className="w-full mb-2 space-y-1">
            {message.toolCalls!.map((tc, idx) => (
              <ToolCallItem
                key={idx}
                tool={tc.tool}
                input={tc.input}
                chars={message.toolResults?.[tc.tool]}
              />
            ))}
          </div>
        )}

        {/* Message bubble */}
        <div className="group relative w-full">
          <div
            className={`px-4 py-3 rounded-2xl ${
              isUser
                ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white rounded-br-sm shadow-lg shadow-accent-500/20'
                : 'bg-primary-800/70 text-neutral-100 rounded-bl-sm border border-primary-700/30'
            }`}
          >
            {isUser ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none
                prose-headings:text-accent-400 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                prose-strong:text-white prose-code:text-accent-300 prose-code:bg-primary-900/60
                prose-code:px-1 prose-code:rounded prose-pre:bg-primary-900/80 prose-pre:border
                prose-pre:border-primary-700/40 prose-table:text-xs prose-td:px-2 prose-td:py-1
                prose-th:px-2 prose-th:py-1 prose-a:text-accent-400">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
                {message.streaming && <StreamingCursor />}
              </div>
            )}
          </div>

          {/* Copy button (hover) */}
          {!isUser && message.content && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-primary-700/80 hover:bg-primary-600 rounded-lg transition-all"
              title="Copy message"
            >
              {copied
                ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
            </button>
          )}
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-3 mt-1 px-1">
          <span className="text-xs text-neutral-500">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isUser && message.executionTimeMs && !message.streaming && (
            <span className="flex items-center gap-1 text-xs text-neutral-600">
              <Clock className="w-3 h-3" />
              {(message.executionTimeMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>

        {/* Confidence bar */}
        {!isUser && message.confidence !== undefined && !message.streaming && (
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500 px-1">
            <span>Confidence</span>
            <div className="w-20 h-1.5 bg-primary-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  message.confidence > 0.7 ? 'bg-emerald-500' :
                  message.confidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${(message.confidence) * 100}%` }}
              />
            </div>
            <span>{Math.round(message.confidence * 100)}%</span>
          </div>
        )}

        {/* Sources */}
        {!isUser && (message.sources?.length ?? 0) > 0 && !message.streaming && (
          <div className="mt-2 flex flex-wrap gap-1.5 max-w-full px-1">
            {message.sources!.slice(0, 5).map((src, idx) => {
              const { label, type } = parseSource(src);
              const Icon = TYPE_ICONS[type] ?? Database;
              return (
                <div
                  key={idx}
                  title={src}
                  className="flex items-center gap-1 px-2 py-1 bg-accent-500/10 text-accent-400 rounded-lg text-xs border border-accent-500/20 hover:border-accent-500/50 transition-colors"
                >
                  <Icon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[120px]">{label}</span>
                </div>
              );
            })}
            {message.sources!.length > 5 && (
              <div className="px-2 py-1 bg-primary-700/50 text-neutral-400 rounded-lg text-xs">
                +{message.sources!.length - 5} more
              </div>
            )}
          </div>
        )}

        {/* Feedback buttons */}
        {!isUser && !message.streaming && message.content && onFeedback && (
          <div className="mt-2 flex items-center gap-2 px-1">
            <span className="text-xs text-neutral-600">Helpful?</span>
            <button
              onClick={() => onFeedback(message.id, 'up')}
              className={`p-1 rounded transition-colors ${
                message.feedback === 'up'
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-neutral-500 hover:text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onFeedback(message.id, 'down')}
              className={`p-1 rounded transition-colors ${
                message.feedback === 'down'
                  ? 'text-red-400 bg-red-500/10'
                  : 'text-neutral-500 hover:text-red-400 hover:bg-red-500/10'
              }`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Follow-up suggestions */}
        {!isUser && !message.streaming && (message.followUpSuggestions?.length ?? 0) > 0 && onFollowUpClick && (
          <div className="mt-3 flex flex-wrap gap-2 px-1">
            <span className="w-full flex items-center gap-1 text-xs text-neutral-500 mb-1">
              <Sparkles className="w-3 h-3 text-accent-400" />
              Follow-up suggestions
            </span>
            {message.followUpSuggestions!.map((q, idx) => (
              <button
                key={idx}
                onClick={() => onFollowUpClick(q)}
                className="px-3 py-1.5 bg-primary-800/50 hover:bg-primary-700/80 border border-primary-700/30 hover:border-accent-500/40 text-xs text-neutral-300 hover:text-white rounded-lg transition-all text-left"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary-700 flex items-center justify-center border border-primary-600/50 mt-1">
          <User className="w-5 h-5 text-neutral-300" />
        </div>
      )}
    </div>
  );
};
