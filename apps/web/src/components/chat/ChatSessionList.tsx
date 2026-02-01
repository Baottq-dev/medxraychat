'use client';

import { useState } from 'react';
import { useChatStore } from '@/stores';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  Plus,
  Trash2,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils';
import type { ChatSession } from '@/types';

interface ChatSessionListProps {
  className?: string;
}

export function ChatSessionList({ className = '' }: ChatSessionListProps) {
  const {
    sessions,
    currentSession,
    isLoading,
    setCurrentSession,
    createSession,
    fetchMessages,
  } = useChatStore();

  const [isCreating, setIsCreating] = useState(false);

  const handleSelectSession = async (session: ChatSession) => {
    setCurrentSession(session);
    await fetchMessages(session.id);
  };

  const handleCreateSession = async () => {
    setIsCreating(true);
    try {
      await createSession(undefined, 'New Chat');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-slate-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-medium text-white flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Chat Sessions
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-white"
          onClick={handleCreateSession}
          disabled={isCreating}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="loading-spinner w-6 h-6 text-blue-500" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center p-4">
            <MessageSquare className="h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm text-slate-500">Chưa có chat session</p>
            <Button
              variant="link"
              size="sm"
              className="text-blue-400 mt-2"
              onClick={handleCreateSession}
            >
              Tạo session mới
            </Button>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={currentSession?.id === session.id}
                onClick={() => handleSelectSession(session)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Session item component
function SessionItem({
  session,
  isActive,
  onClick,
}: {
  session: ChatSession;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'w-full text-left p-3 rounded-lg transition-colors',
        isActive
          ? 'bg-blue-600/20 border border-blue-500/30'
          : 'hover:bg-slate-800 border border-transparent'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'font-medium truncate',
              isActive ? 'text-blue-400' : 'text-slate-200'
            )}
          >
            {session.title}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            {formatDateTime(session.updatedAt)}
          </div>
          {session.messages.length > 0 && (
            <p className="text-xs text-slate-500 truncate mt-1">
              {session.messages[session.messages.length - 1]?.content.slice(0, 50)}...
            </p>
          )}
        </div>
        <ChevronRight
          className={cn(
            'h-4 w-4 flex-shrink-0',
            isActive ? 'text-blue-400' : 'text-slate-600'
          )}
        />
      </div>
    </button>
  );
}
