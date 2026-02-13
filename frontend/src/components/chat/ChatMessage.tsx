import { Bot, User } from 'lucide-react';
import { ChatMessage as ChatMessageType } from '@/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const hasMarkdown = message.content.includes('|') || message.content.includes('##') || message.content.includes('**');

  return (
    <div className={`flex gap-4 mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-lg shadow-accent-500/20">
          <Bot className="w-5 h-5 text-white" />
        </div>
      )}

      <div className={`flex flex-col max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white rounded-br-sm shadow-lg shadow-accent-500/20'
              : 'bg-primary-800/70 text-neutral-100 rounded-bl-sm border border-primary-700/30'
          }`}
        >
          {hasMarkdown ? (
            <div 
              className="text-sm leading-relaxed whitespace-pre-wrap prose prose-invert prose-sm max-w-none
                         prose-headings:text-accent-400 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                         prose-strong:text-white prose-table:text-xs
                         prose-td:px-2 prose-td:py-1 prose-th:px-2 prose-th:py-1
                         prose-table:border-primary-700 prose-td:border-primary-700 prose-th:border-primary-700"
              dangerouslySetInnerHTML={{ 
                __html: message.content
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/## (.*?)(\n|$)/g, '<h3 class="text-lg">$1</h3>')
                  .replace(/### (.*?)(\n|$)/g, '<h4 class="text-base">$1</h4>')
                  .replace(/✅/g, '<span class="text-emerald-400">✅</span>')
                  .replace(/⚠️/g, '<span class="text-yellow-400">⚠️</span>')
                  .replace(/❌/g, '<span class="text-red-400">❌</span>')
                  .replace(/\n/g, '<br/>')
              }}
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          )}
        </div>
        <span className="text-xs text-neutral-500 mt-1 px-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 max-w-full">
            {message.sources.slice(0, 3).map((source, idx) => (
              <div
                key={idx}
                className="px-2 py-1 bg-accent-500/10 text-accent-400 rounded-lg text-xs border border-accent-500/30"
              >
                {source.split('#').pop()?.substring(0, 30)}
              </div>
            ))}
            {message.sources.length > 3 && (
              <div className="px-2 py-1 bg-primary-700/50 text-neutral-400 rounded-lg text-xs">
                +{message.sources.length - 3} more
              </div>
            )}
          </div>
        )}

        {!isUser && message.confidence !== undefined && (
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
            <span>Confidence:</span>
            <div className="w-16 h-1.5 bg-primary-700 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  message.confidence > 0.7 ? 'bg-emerald-500' : 
                  message.confidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${(message.confidence || 0) * 100}%` }}
              />
            </div>
            <span>{Math.round((message.confidence || 0) * 100)}%</span>
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary-700 flex items-center justify-center border border-primary-600/50">
          <User className="w-5 h-5 text-neutral-300" />
        </div>
      )}
    </div>
  );
};
