import { useState } from 'react';
import { Bot, Activity, Sparkles, Database } from 'lucide-react';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { WelcomeScreen } from '@/components/chat/WelcomeScreen';
import { ChatInput } from '@/components/chat/ChatInput';
import { useChatSession } from '@/hooks/useChatSession';
import { useChatMessages } from '@/hooks/useChatMessages';

const SUGGESTED_QUESTIONS = [
  {
    question: 'Calculate load flow for the network',
    icon: Activity,
    description: 'Full network power flow analysis',
    category: 'loadflow'
  },
  {
    question: 'What is the voltage at a specific bus?',
    icon: Activity,
    description: 'Query voltage at any bus in the network',
    category: 'loadflow'
  },
  {
    question: 'Calculate load flow at a specific bus',
    icon: Activity,
    description: 'Analyze power flow for a particular bus',
    category: 'loadflow'
  },
  {
    question: 'What substations are in the network?',
    icon: Database,
    description: 'List all substations',
    category: 'network'
  },
  {
    question: 'What is the total generation capacity?',
    icon: Activity,
    description: 'View generation statistics',
    category: 'network'
  },
  {
    question: 'Show me all transmission lines',
    icon: Activity,
    description: 'List transmission infrastructure',
    category: 'network'
  },
  {
    question: 'What generators are in the network?',
    icon: Activity,
    description: 'List all generators',
    category: 'query'
  },
  {
    question: 'Show the network topology',
    icon: Database,
    description: 'Network structure overview',
    category: 'query'
  },
];

const GraphRAGChat = () => {
  const [input, setInput] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

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
  } = useChatMessages(sessionId);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input, (title) => updateSessionTitle(sessionId, title));
    setInput('');
  };

  const handleQuestionClick = (question: string) => {
    sendMessage(question, (title) => updateSessionTitle(sessionId, title));
  };

  const handleDeleteSession = (sid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(sid);
  };

  const showWelcome = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-primary-950">
      <ChatSidebar
        sessions={sessions}
        sessionId={sessionId}
        onCreateNew={createNewSession}
        onSelectSession={selectSession}
        onDeleteSession={handleDeleteSession}
      />

      <div className="flex-1 flex flex-col">
        <header className="bg-primary-900/50 border-b border-primary-700/30 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Bot className="w-6 h-6 text-accent-400" />
                GraphRAG Chat
              </h1>
              <p className="text-sm text-neutral-400">Explore your Knowledge Graph using natural language</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Activity className="w-4 h-4 text-emerald-400" />
              Connected
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6 bg-primary-950">
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
                <ChatMessage key={message.id} message={message} />
              ))}
              {isLoading && (
                <div className="flex gap-4 mb-6">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-lg shadow-accent-500/20">
                    <Bot className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-primary-800/50 border border-primary-700/30 rounded-bl-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-primary-700/30 bg-primary-900/50 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              input={input}
              isLoading={isLoading}
              onInputChange={setInput}
              onSend={handleSend}
            />
            <div className="flex items-center justify-between mt-2 text-xs text-neutral-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-accent-400" />
                  Load Flow: <span className="text-accent-400">Active</span>
                </span>
                <span className="flex items-center gap-1">
                  <Database className="w-3 h-3 text-emerald-400" />
                  Knowledge Graph: <span className="text-emerald-400">Connected</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GraphRAGChat;
