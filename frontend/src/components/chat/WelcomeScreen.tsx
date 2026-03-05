import { Bot, Sparkles, Activity, Zap, Database, MessageSquare, Filter } from 'lucide-react';

interface SuggestedQuestion {
  question: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  category: string;
}

interface WelcomeScreenProps {
  suggestedQuestions: SuggestedQuestion[];
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  onQuestionClick: (question: string) => void;
}

export const WelcomeScreen = ({
  suggestedQuestions,
  activeCategory,
  onCategoryChange,
  onQuestionClick,
}: WelcomeScreenProps) => {
  const filteredQuestions = activeCategory
    ? suggestedQuestions.filter(q => q.category === activeCategory)
    : suggestedQuestions;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-accent-500 to-accent-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-accent-500/20">
          <Bot className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Welcome to GraphRAG Chat</h2>
        <p className="text-neutral-400">
          Ask questions about your CIM power network. Calculate load flow, 
          explore substations, analyze transmission lines.
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <span className="text-sm text-neutral-400 mr-2">Filter:</span>
        <button
          onClick={() => onCategoryChange(null)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeCategory === null
              ? 'bg-accent-500 text-white'
              : 'bg-primary-800 text-neutral-300 hover:bg-primary-700'
          }`}
        >
          All
        </button>
        <button
          onClick={() => onCategoryChange('loadflow')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeCategory === 'loadflow'
              ? 'bg-accent-500 text-white'
              : 'bg-primary-800 text-neutral-300 hover:bg-primary-700'
          }`}
        >
          Load Flow
        </button>
        <button
          onClick={() => onCategoryChange('network')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeCategory === 'network'
              ? 'bg-accent-500 text-white'
              : 'bg-primary-800 text-neutral-300 hover:bg-primary-700'
          }`}
        >
          Network
        </button>
        <button
          onClick={() => onCategoryChange('query')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeCategory === 'query'
              ? 'bg-accent-500 text-white'
              : 'bg-primary-800 text-neutral-300 hover:bg-primary-700'
          }`}
        >
          Queries
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {filteredQuestions.map((item, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick(item.question)}
            className="group flex items-start gap-3 p-4 bg-primary-800/50 rounded-xl border border-primary-700/30 hover:border-accent-500/50 hover:bg-primary-800 transition-all duration-200 text-left"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent-500/20 group-hover:bg-accent-500/30 flex items-center justify-center transition-colors">
              <item.icon className="w-5 h-5 text-accent-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white group-hover:text-accent-400 transition-colors">
                {item.question}
              </p>
              <p className="text-xs text-neutral-500 mt-1">{item.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-800/50 rounded-full text-sm text-neutral-400 border border-primary-700/30">
          <Sparkles className="w-4 h-4 text-accent-400" />
          Claude AI Agent · GraphRAG · Qdrant Vector Search
        </div>
      </div>
    </div>
  );
};
