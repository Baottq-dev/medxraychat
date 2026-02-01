'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore, useStudyStore } from '@/stores';
import { useWebSocket } from '@/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, Bot, ImageIcon, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { EmptyState } from './EmptyState';

interface ChatInterfaceProps {
  sessionId?: string;
  className?: string;
}

// Quick prompt suggestions
const QUICK_PROMPTS = [
  'Phân tích ảnh này',
  'Có bất thường gì không?',
  'Giải thích các phát hiện',
  'Tổng kết báo cáo',
];

export function ChatInterface({ sessionId, className = '' }: ChatInterfaceProps) {
  const {
    messages,
    currentSession,
    isSending,
    isLoading,
    isAnalyzing,
    sendMessage,
    fetchMessages,
    createSession,
  } = useChatStore();

  const { currentImage } = useStudyStore();

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // WebSocket connection
  const { isConnected, sendMessage: wsSend, sendTyping } = useWebSocket({
    sessionId: currentSession?.id || '',
    onTyping: setIsTyping,
    autoConnect: !!currentSession?.id,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load messages when session changes
  useEffect(() => {
    if (sessionId) {
      fetchMessages(sessionId);
    }
  }, [sessionId, fetchMessages]);

  // Handle send message
  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const messageContent = input.trim();
    setInput('');

    try {
      // If using WebSocket
      if (isConnected && currentSession) {
        wsSend(messageContent, currentImage?.id);
      } else {
        // Fallback to HTTP
        await sendMessage(messageContent, currentImage?.id);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle input change with typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (isConnected) {
      sendTyping(true);
      // Debounce typing indicator off
      setTimeout(() => sendTyping(false), 1000);
    }
  };

  // Create new session if none exists
  const handleNewSession = async () => {
    await createSession(undefined, 'New Analysis Chat');
  };

  return (
    <div className={cn('flex flex-col h-full bg-slate-900', className)}>
      {/* Header */}
      <ChatHeader
        isConnected={isConnected}
        onNewSession={handleNewSession}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <LoadingState />
        ) : messages.length === 0 ? (
          <EmptyState onNewSession={handleNewSession} />
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}

        {/* Typing indicator */}
        {isTyping && <TypingIndicator />}

        {/* Analyzing indicator */}
        {isAnalyzing && <AnalyzingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Current image indicator */}
      {currentImage && (
        <CurrentImageBanner filename={currentImage.filename} />
      )}

      {/* Input */}
      <ChatInput
        ref={inputRef}
        value={input}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        onSend={handleSend}
        onQuickPrompt={setInput}
        disabled={isSending || !currentSession}
        isSending={isSending}
      />
    </div>
  );
}

// Header component
interface ChatHeaderProps {
  isConnected: boolean;
  onNewSession: () => void;
}

function ChatHeader({ isConnected, onNewSession }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-slate-700">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-blue-500" />
        <span className="font-medium text-white">AI Assistant</span>
        {isConnected && (
          <span className="flex items-center gap-1 text-xs text-green-500">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Connected
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-slate-400 hover:text-white"
        onClick={onNewSession}
      >
        <RefreshCw className="h-4 w-4 mr-1" />
        New Chat
      </Button>
    </div>
  );
}

// Loading state
function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
    </div>
  );
}

// Analyzing indicator
function AnalyzingIndicator() {
  return (
    <div className="flex items-center gap-2 p-3 bg-blue-500/10 rounded-lg">
      <Sparkles className="h-5 w-5 text-blue-500 animate-pulse" />
      <span className="text-blue-400">Đang phân tích ảnh...</span>
    </div>
  );
}

// Current image banner
interface CurrentImageBannerProps {
  filename: string;
}

function CurrentImageBanner({ filename }: CurrentImageBannerProps) {
  return (
    <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/50">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <ImageIcon className="h-4 w-4" />
        <span>Đang xem: {filename}</span>
      </div>
    </div>
  );
}

// Chat input component
interface ChatInputProps {
  ref?: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onQuickPrompt: (prompt: string) => void;
  disabled: boolean;
  isSending: boolean;
}

function ChatInput({
  value,
  onChange,
  onKeyPress,
  onSend,
  onQuickPrompt,
  disabled,
  isSending,
}: ChatInputProps) {
  return (
    <div className="p-4 border-t border-slate-700">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={onChange}
          onKeyPress={onKeyPress}
          placeholder="Hỏi về ảnh X-quang..."
          className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
          disabled={disabled}
        />
        <Button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-2 mt-3">
        {QUICK_PROMPTS.map((prompt, index) => (
          <button
            key={index}
            className="text-xs px-3 py-1.5 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            onClick={() => onQuickPrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ChatInterface;
