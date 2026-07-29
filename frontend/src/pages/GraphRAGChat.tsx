import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Activity, Sparkles, Database, Download, WifiOff, Wifi, Maximize2, Minimize2, MessageSquare } from 'lucide-react';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { WelcomeScreen } from '@/components/chat/WelcomeScreen';
import { ChatInput, ChatInputHandle } from '@/components/chat/ChatInput';
import { useChatSession } from '@/hooks/useChatSession';
import { useChatMessages } from '@/hooks/useChatMessages';
import { apiService } from '@/services/api';

const SUGGESTED_QUESTIONS = [
  {
    question: 'Calculate load flow for the network',
    icon: Activity,
    description: 'Full network power flow analysis',
    category: 'loadflow',
  },
  {
    question: 'What is the voltage at a specific bus?',
    icon: Activity,
    description: 'Query voltage at any bus in the network',
    category: 'loadflow',
  },
  {
    question: 'Calculate load flow at a specific bus',
    icon: Activity,
    description: 'Analyze power flow for a particular bus',
    category: 'loadflow',
  },
  {
    question: 'What substations are in the network?',
    icon: Database,
    description: 'List all substations',
    category: 'network',
  },
  {
    question: 'What is the total generation capacity?',
    icon: Activity,
    description: 'View generation statistics',
    category: 'network',
  },
  {
    question: 'Show me all transmission lines',
    icon: Activity,
    description: 'List transmission infrastructure',
    category: 'network',
  },
  {
    question: 'What generators are in the network?',
    icon: Activity,
    description: 'List all generators',
    category: 'query',
  },
  {
    question: 'Show the network topology',
    icon: Database,
    description: 'Network structure overview',
    category: 'query',
  },
];

// ── Export helpers ─────────────────────────────────────────────────────────────
function exportToMarkdown(messages: ReturnType<typeof useChatMessages>['messages'], title: string) {
  const lines: string[] = [`# ${title}`, `*Exported ${new Date().toLocaleString()}*`, ''];
  for (const m of messages) {
    if (m.role === 'user') {
      lines.push(`**You:** ${m.content}`, '');
    } else {
      lines.push(`**Assistant:** ${m.content}`, '');
      if (m.sources?.length) {
        lines.push(`*Sources: ${m.sources.map(s => s.split('#').pop()).join(', ')}*`, '');
      }
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cim-chat-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ──────────────────────────────────────────────────────────────────
const GraphRAGChat = () => {
  const [input, setInput] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  type LlmProvider = { id: string; label: string; model: string; available: boolean; isDefault: boolean };
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>(() => localStorage.getItem('cim_llm_provider') || '');

  useEffect(() => {
    apiService.getLlmProviders()
      .then((list) => {
        setProviders(list);
        setSelectedProvider(prev => {
          if (prev && list.some(p => p.id === prev && p.available)) return prev;
          const def = list.find(p => p.isDefault && p.available) ?? list.find(p => p.available);
          return def?.id ?? prev;
        });
      })
      .catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    if (selectedProvider) localStorage.setItem('cim_llm_provider', selectedProvider);
  }, [selectedProvider]);

  const {
    sessionId,
    sessions,
    createNewSession,
    selectSession,
    deleteSession,
    updateSessionTitle,
  } = useChatSession();

  const {
    messages,
    isLoading,
    messagesEndRef,
    sendMessage,
    stopGeneration,
    setFeedback,
    getLastUserQuestion,
  } = useChatMessages(sessionId, selectedProvider);

  // Real backend health polling
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const ok = await apiService.checkBackendHealth();
      if (mounted) setBackendOnline(ok);
    };
    check();
    const interval = setInterval(check, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K → focus chat input
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        chatInputRef.current?.focus();
      }
      // Ctrl+Shift+E → export
      if (e.ctrlKey && e.shiftKey && e.key === 'E' && messages.length > 0) {
        e.preventDefault();
        const session = sessions.find(s => s.id === sessionId);
        exportToMarkdown(messages, session?.title ?? 'CIM Chat');
      }
      // F11 or Ctrl+Shift+F → fullscreen
      if ((e.key === 'F11') || (e.ctrlKey && e.shiftKey && e.key === 'F')) {
        e.preventDefault();
        setFullscreen(f => !f);
      }
      // Escape → exit fullscreen
      if (e.key === 'Escape' && fullscreen) {
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [messages, sessions, sessionId, fullscreen]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendMessage(input, (title) => updateSessionTitle(sessionId, title));
    setInput('');
  }, [input, isLoading, sendMessage, sessionId, updateSessionTitle]);

  const handleQuestionClick = useCallback((question: string) => {
    sendMessage(question, (title) => updateSessionTitle(sessionId, title));
  }, [sendMessage, sessionId, updateSessionTitle]);

  const handleRecallLast = useCallback(() => {
    const last = getLastUserQuestion();
    if (last) setInput(last);
  }, [getLastUserQuestion]);

  const handleDeleteSession = (sid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(sid);
  };

  const handleExport = () => {
    const session = sessions.find(s => s.id === sessionId);
    exportToMarkdown(messages, session?.title ?? 'CIM Chat');
  };

  const showWelcome = messages.length === 0;

  // Fullscreen uses fixed overlay covering the entire viewport
  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 flex bg-primary-950'
    : 'flex h-[calc(100vh-64px)] bg-primary-950';

  return (
    <div className={containerClass}>
      {/* Sidebar - hidden in fullscreen */}
      {!fullscreen && (
        <ChatSidebar
          sessions={sessions}
          sessionId={sessionId}
          onCreateNew={createNewSession}
          onSelectSession={selectSession}
          onDeleteSession={handleDeleteSession}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-primary-900/50 border-b border-primary-700/30 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <MessageSquare size={26} className="text-accent-400" />
                GraphRAG Chat
              </h1>
              <p className="text-sm text-neutral-400 mt-1">AI Agent with semantic search and load flow tools</p>
            </div>
            <div className="flex items-center gap-3">
              {/* LLM provider selector */}
              {providers.length > 0 && (
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  title="Choose the LLM provider"
                  className="px-3 py-1.5 bg-primary-800/60 border border-primary-700/40 hover:border-primary-600 rounded-lg text-xs text-neutral-300 focus:outline-none focus:border-accent-500/50 cursor-pointer"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.available} className="bg-primary-900">
                      {p.label}{p.available ? '' : ' (no key)'}
                    </option>
                  ))}
                </select>
              )}

              {/* Export button */}
              {messages.length > 0 && (
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-800/60 hover:bg-primary-700/80 border border-primary-700/40 hover:border-primary-600 rounded-lg text-xs text-neutral-300 hover:text-white transition-all"
                  title="Export conversation as Markdown (Ctrl+Shift+E)"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
              )}

              {/* Fullscreen button */}
              <button
                onClick={() => setFullscreen(f => !f)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-800/60 hover:bg-primary-700/80 border border-primary-700/40 hover:border-primary-600 rounded-lg text-xs text-neutral-300 hover:text-white transition-all"
                title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (Ctrl+Shift+F)'}
              >
                {fullscreen
                  ? <Minimize2 className="w-3.5 h-3.5" />
                  : <Maximize2 className="w-3.5 h-3.5" />}
                {fullscreen ? 'Exit' : 'Fullscreen'}
              </button>

              {/* Connection status */}
              <div className="flex items-center gap-1.5 text-xs">
                {backendOnline === null ? (
                  <><Activity className="w-4 h-4 text-neutral-500 animate-pulse" /><span className="text-neutral-500">Checking…</span></>
                ) : backendOnline ? (
                  <><Wifi className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">Online</span></>
                ) : (
                  <><WifiOff className="w-4 h-4 text-red-400" /><span className="text-red-400">Offline</span></>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Messages area */}
        <div ref={messagesAreaRef} className="flex-1 overflow-y-auto px-6 py-6 bg-primary-950">
          {showWelcome ? (
            <WelcomeScreen
              suggestedQuestions={SUGGESTED_QUESTIONS}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              onQuestionClick={handleQuestionClick}
            />
          ) : (
            <div className="max-w-4xl mx-auto">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  onFeedback={setFeedback}
                  onFollowUpClick={handleQuestionClick}
                />
              ))}

              {/* Loading indicator only when no streaming message yet */}
              {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex gap-4 mb-6">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-lg shadow-accent-500/20">
                    <Bot className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-primary-800/50 border border-primary-700/30 rounded-bl-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-primary-700/30 bg-primary-900/50 px-6 py-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              ref={chatInputRef}
              input={input}
              isLoading={isLoading}
              onInputChange={setInput}
              onSend={handleSend}
              onStop={stopGeneration}
              onRecallLast={handleRecallLast}
            />
            <div className="flex items-center justify-between mt-2 text-xs text-neutral-600">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-accent-400" />
                  <span className="text-neutral-500">Load Flow</span>
                  <span className="text-accent-400">Active</span>
                </span>
                <span className="flex items-center gap-1">
                  <Database className="w-3 h-3 text-emerald-400" />
                  <span className="text-neutral-500">Qdrant</span>
                  <span className="text-emerald-400">Indexed</span>
                </span>
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-accent-400" />
                  <span className="text-neutral-500">GPT-5.5</span>
                </span>
              </div>
              <span className="text-neutral-600">Ctrl+K focus · Ctrl+Shift+E export · Ctrl+Shift+F fullscreen</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GraphRAGChat;
