import { Plus, MessageSquare, Trash2, Sparkles } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  timestamp: Date;
}

interface ChatSidebarProps {
  sessions: ChatSession[];
  sessionId: string;
  onCreateNew: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
}

export const ChatSidebar = ({
  sessions,
  sessionId,
  onCreateNew,
  onSelectSession,
  onDeleteSession,
}: ChatSidebarProps) => {
  return (
    <div className="w-72 bg-primary-900 border-r border-primary-700/30 flex flex-col">
      <div className="p-4 border-b border-primary-700/30">
        <button
          onClick={onCreateNew}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 rounded-xl transition-all font-medium text-white shadow-lg shadow-accent-500/20"
        >
          <Plus className="w-5 h-5" />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center text-neutral-400 py-8 text-sm">
              No chat history
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`group w-full flex items-start gap-3 p-3 rounded-lg transition-all ${
                  sessionId === session.id
                    ? 'bg-primary-800 text-white border border-accent-500/30'
                    : 'hover:bg-primary-800/50 text-neutral-300'
                }`}
              >
                <button
                  onClick={() => onSelectSession(session.id)}
                  className="flex-1 flex items-start gap-3 text-left min-w-0"
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{session.title}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {session.timestamp.toLocaleDateString()}
                    </p>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id, e);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-red-400 rounded transition-all flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-4 border-t border-primary-700/30 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-accent-400" />
          GraphRAG + LLM
        </div>
      </div>
    </div>
  );
};
