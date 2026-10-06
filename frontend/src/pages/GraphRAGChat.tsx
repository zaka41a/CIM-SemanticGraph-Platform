import { useState, useEffect, useCallback, useRef, type ElementType } from 'react';
import { Bot, Activity, Sparkles, Database, Download, WifiOff, Wifi, Maximize2, Minimize2, MessageSquare, Plus, Trash2 } from 'lucide-react';
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

type LlmProvider = Awaited<ReturnType<typeof apiService.getLlmProviders>>[number];
type IndexingStatus = Awaited<ReturnType<typeof apiService.getIndexingStatus>>;
type PowerflowStatus = Awaited<ReturnType<typeof apiService.getPowerflowHealth>>;
type RuntimeTone = 'neutral' | 'positive' | 'warning' | 'critical';

interface RuntimeIndicator {
  value: string;
  tone: RuntimeTone;
}

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

const RUNTIME_TONES: Record<RuntimeTone, string> = {
  neutral: 'text-neutral-400',
  positive: 'text-emerald-400',
  warning: 'text-accent-400',
  critical: 'text-red-400',
};

function qdrantIndicator(status: IndexingStatus | null | undefined): RuntimeIndicator {
  if (status === undefined) return { value: 'Checking', tone: 'neutral' };
  if (status === null || !status.qdrantAvailable) return { value: 'Unavailable', tone: 'critical' };
  if (status.indexedEntities === 0) return { value: 'Index empty', tone: 'warning' };
  const noun = status.indexedEntities === 1 ? 'entity' : 'entities';
  return {
    value: `${NUMBER_FORMAT.format(status.indexedEntities)} ${noun}`,
    tone: 'positive',
  };
}

function powerflowIndicator(status: PowerflowStatus | null | undefined): RuntimeIndicator {
  if (status === undefined) return { value: 'Checking', tone: 'neutral' };
  if (status === null || !status.dcSolver) return { value: 'Unavailable', tone: 'critical' };
  if (status.pandapowerAvailable) return { value: 'AC and OPF ready', tone: 'positive' };
  return { value: 'DC solver ready', tone: 'warning' };
}

function RuntimeStatus({
  icon: Icon,
  label,
  indicator,
}: {
  icon: ElementType;
  label: string;
  indicator: RuntimeIndicator;
}) {
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${indicator.value}`}>
      <Icon className={`w-3.5 h-3.5 ${RUNTIME_TONES[indicator.tone]}`} aria-hidden="true" />
      <span className="text-neutral-500">{label}</span>
      <span className={`font-medium tabular-nums ${RUNTIME_TONES[indicator.tone]}`}>
        {indicator.value}
      </span>
    </div>
  );
}

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

const GraphRAGChat = () => {
  const [input, setInput] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus | null>();
  const [powerflowStatus, setPowerflowStatus] = useState<PowerflowStatus | null>();
  const [fullscreen, setFullscreen] = useState(false);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  const [providers, setProviders] = useState<LlmProvider[] | null>();
  const [selectedProvider, setSelectedProvider] = useState<string>(() => localStorage.getItem('cim_llm_provider') || '');

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

  useEffect(() => {
    let mounted = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      const [backend, indexing, powerflow, models] = await Promise.allSettled([
        apiService.checkBackendHealth(),
        apiService.getIndexingStatus(),
        apiService.getPowerflowHealth(),
        apiService.getLlmProviders(),
      ]);
      checking = false;
      if (!mounted) return;

      setBackendOnline(backend.status === 'fulfilled' && backend.value);
      setIndexingStatus(indexing.status === 'fulfilled' ? indexing.value : null);
      setPowerflowStatus(powerflow.status === 'fulfilled' ? powerflow.value : null);
      if (models.status === 'fulfilled') {
        const list = models.value;
        setProviders(list);
        setSelectedProvider(prev => {
          if (list.some(p => p.id === prev && p.available)) return prev;
          const preferred = list.find(p => p.isDefault && p.available)
            ?? list.find(p => p.available)
            ?? list.find(p => p.id === prev)
            ?? list.find(p => p.isDefault)
            ?? list[0];
          return preferred?.id ?? '';
        });
      } else {
        setProviders(null);
      }
    };
    void check();
    const interval = setInterval(check, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        chatInputRef.current?.focus();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'E' && messages.length > 0) {
        e.preventDefault();
        const session = sessions.find(s => s.id === sessionId);
        exportToMarkdown(messages, session?.title ?? 'CIM Chat');
      }
      if ((e.key === 'F11') || (e.ctrlKey && e.shiftKey && e.key === 'F')) {
        e.preventDefault();
        setFullscreen(f => !f);
      }
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
  const qdrantStatus = qdrantIndicator(indexingStatus);
  const loadFlowStatus = powerflowIndicator(powerflowStatus);
  const activeProvider = providers?.find(provider => provider.id === selectedProvider);
  const providerStatus: RuntimeIndicator = providers === undefined
    ? { value: 'Checking', tone: 'neutral' }
    : providers === null
      ? { value: 'Unavailable', tone: 'critical' }
      : activeProvider?.available
        ? { value: `${activeProvider.model} (configured)`, tone: 'positive' }
        : { value: 'Not configured', tone: 'warning' };

  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 flex bg-primary-950'
    : 'flex h-[calc(100vh-64px)] bg-primary-950';

  return (
    <div className={containerClass}>
      {!fullscreen && (
        <div className="hidden xl:flex flex-shrink-0">
          <ChatSidebar
            sessions={sessions}
            sessionId={sessionId}
            onCreateNew={createNewSession}
            onSelectSession={selectSession}
            onDeleteSession={handleDeleteSession}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-primary-900/50 border-b border-primary-700/30 px-4 sm:px-6 py-4 flex-shrink-0">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <MessageSquare size={26} className="text-accent-400" />
                GraphRAG Chat
              </h1>
              <p className="text-sm text-neutral-400 mt-1">AI Agent with semantic search and load flow tools</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={createNewSession}
                className={`items-center gap-1.5 px-3 py-1.5 bg-primary-800/60 hover:bg-primary-700/80 border border-primary-700/40 hover:border-primary-600 rounded-lg text-xs text-neutral-300 hover:text-white transition-colors ${fullscreen ? 'inline-flex' : 'inline-flex xl:hidden'}`}
                title="Start a new conversation"
              >
                <Plus className="w-3.5 h-3.5" />
                New chat
              </button>

              <div className={`items-center gap-2 min-w-0 ${fullscreen ? 'flex' : 'flex xl:hidden'}`}>
                <select
                  value={sessionId}
                  onChange={e => selectSession(e.target.value)}
                  aria-label="Conversation"
                  className="min-w-0 max-w-[180px] px-3 py-1.5 bg-primary-800/60 border border-primary-700/40 rounded-lg text-xs text-neutral-300 focus:outline-none focus:border-accent-500/50"
                >
                  {sessions.map(session => (
                    <option key={session.id} value={session.id}>{session.title}</option>
                  ))}
                </select>
                <button
                  onClick={e => handleDeleteSession(sessionId, e)}
                  aria-label="Delete current conversation"
                  title="Delete current conversation"
                  className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {providers && providers.length > 0 && (
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  aria-label="LLM provider"
                  title="Choose the LLM provider"
                  className="min-w-0 max-w-full sm:min-w-[220px] px-3 py-1.5 bg-primary-800/60 border border-primary-700/40 hover:border-primary-600 rounded-lg text-xs text-neutral-300 focus:outline-none focus:border-accent-500/50 cursor-pointer"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.available} className="bg-primary-900">
                      {p.label}{p.available ? '' : ' (not configured)'}
                    </option>
                  ))}
                </select>
              )}

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

              <div className="flex items-center gap-1.5 text-xs" aria-live="polite">
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

        <div ref={messagesAreaRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 bg-primary-950">
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

        <div className="border-t border-primary-700/30 bg-primary-900/50 px-4 sm:px-6 py-4 flex-shrink-0">
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
            <div
              className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-xs"
              aria-label="GraphRAG runtime status"
              aria-live="polite"
            >
              <RuntimeStatus icon={Database} label="Vector index" indicator={qdrantStatus} />
              <RuntimeStatus icon={Activity} label="Power flow" indicator={loadFlowStatus} />
              <RuntimeStatus icon={Sparkles} label="Model" indicator={providerStatus} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GraphRAGChat;
