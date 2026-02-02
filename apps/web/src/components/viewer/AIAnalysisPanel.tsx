'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DicomImage, ChatMessage } from '@/types';
import {
  Sparkles,
  Loader2,
  Send,
  Download,
  Stethoscope,
  Zap,
  User,
  Bot,
  AlertCircle,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AIAnalysisPanelProps {
  currentImage: DicomImage | null;
  studyId: string | null;
  className?: string;
}

// Quick prompts for analysis
const QUICK_PROMPTS = [
  { label: 'Phân tích', prompt: 'Phân tích ảnh X-quang này và đưa ra nhận xét chi tiết' },
  { label: 'Bất thường?', prompt: 'Có phát hiện bất thường nào trong ảnh này không?' },
  { label: 'Giải thích', prompt: 'Giải thích chi tiết các phát hiện trong ảnh' },
  { label: 'Tổng kết', prompt: 'Tổng kết ngắn gọn về tình trạng trong ảnh X-quang này' },
];

export function AIAnalysisPanel({ currentImage, studyId, className }: AIAnalysisPanelProps) {
  const {
    currentAnalysis,
    isAnalyzing,
    analyzeImage,
    messages,
    sendMessage,
    sendMessageStream,
    isSending,
    isStreaming,
    streamingContent,
    createSession,
    currentSession,
    fetchSessionByStudy,
  } = useChatStore();

  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load existing session when studyId changes
  useEffect(() => {
    if (studyId && (!currentSession || currentSession.studyId !== studyId)) {
      fetchSessionByStudy(studyId);
    }
  }, [studyId, currentSession, fetchSessionByStudy]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAnalyze = async () => {
    if (!currentImage) {
      toast({
        title: 'Không có ảnh',
        description: 'Vui lòng chọn ảnh để phân tích',
        variant: 'destructive',
      });
      return;
    }

    if (!studyId) {
      toast({
        title: 'Lỗi',
        description: 'Không tìm thấy thông tin nghiên cứu',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Create session if needed (must include studyId)
      if (!currentSession) {
        await createSession(studyId, 'AI Analysis');
      }

      // Send analysis request as a streaming message
      await sendMessageStream('Phân tích ảnh X-quang này và đưa ra nhận xét chi tiết về các phát hiện, bất thường (nếu có), và đề xuất.', currentImage.id);
    } catch (error) {
      toast({
        title: 'Lỗi phân tích',
        description: 'Không thể phân tích ảnh. Vui lòng thử lại.',
        variant: 'destructive',
      });
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    if (!studyId) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng chọn một nghiên cứu trước',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Create session if needed
      if (!currentSession) {
        await createSession(studyId, 'AI Chat');
      }

      const messageToSend = chatInput;
      setChatInput('');
      await sendMessageStream(messageToSend, currentImage?.id);
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: 'Không thể gửi tin nhắn',
        variant: 'destructive',
      });
    }
  };

  const handleQuickPrompt = async (prompt: string) => {
    if (!studyId) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng chọn một nghiên cứu trước',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (!currentSession) {
        await createSession(studyId, 'AI Analysis');
      }
      await sendMessageStream(prompt, currentImage?.id);
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: 'Không thể gửi tin nhắn',
        variant: 'destructive',
      });
    }
  };

  const handleExportReport = () => {
    toast({
      title: 'Xuất báo cáo',
      description: 'Tính năng đang được phát triển',
    });
  };

  return (
    <div className={cn('flex flex-col h-full bg-slate-800 border-l border-slate-700', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/20">
            <Bot className="h-4 w-4 text-blue-400" />
          </div>
          <span className="font-medium text-white text-sm">Trợ lý AI</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Quick Analyze Button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
            onClick={handleAnalyze}
            disabled={!currentImage || isAnalyzing || isSending || isStreaming}
          >
            {isAnalyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            <span className="ml-1">Phân tích</span>
          </Button>
          {/* Export Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-white"
            onClick={handleExportReport}
            disabled={messages.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3">
        {!currentImage ? (
          // No image state
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 rounded-full bg-slate-700/50 mb-4">
              <Stethoscope className="h-8 w-8 text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm">
              Chọn ảnh từ danh sách để bắt đầu phân tích
            </p>
          </div>
        ) : messages.length === 0 ? (
          // Empty chat state - ready to analyze
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 rounded-full bg-blue-500/10 mb-4">
              <Sparkles className="h-8 w-8 text-blue-400" />
            </div>
            <p className="text-white font-medium mb-2">AI sẵn sàng hỗ trợ</p>
            <p className="text-slate-400 text-sm mb-4">
              Nhấn "Phân tích" hoặc nhập câu hỏi về ảnh X-quang
            </p>

            {/* Quick prompts as buttons */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-[240px]">
              {QUICK_PROMPTS.map((item, index) => (
                <button
                  key={index}
                  className="px-3 py-2 text-xs bg-slate-700/50 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors text-left"
                  onClick={() => handleQuickPrompt(item.prompt)}
                  disabled={isSending || isStreaming}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Chat messages
          <div className="space-y-3">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}

            {/* Loading indicator when AI is responding (only show if not streaming) */}
            {(isSending || isAnalyzing) && !isStreaming && (
              <div className="flex gap-2">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="bg-slate-700 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Đang xử lý...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Chat Input */}
      <div className="border-t border-slate-700 p-3 space-y-2">
        {/* Quick prompts (only show when have messages) */}
        {messages.length > 0 && currentImage && (
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.slice(0, 3).map((item, index) => (
              <button
                key={index}
                className="px-2 py-1 text-xs bg-slate-700/50 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-300 transition-colors"
                onClick={() => handleQuickPrompt(item.prompt)}
                disabled={isSending || isStreaming}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Input field */}
        <div className="flex gap-2">
          <Input
            placeholder={currentImage ? "Hỏi về ảnh X-quang..." : "Chọn ảnh để bắt đầu..."}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            className="bg-slate-700 border-slate-600 text-sm text-white placeholder:text-slate-500"
            disabled={isSending || isStreaming || !currentImage}
          />
          <Button
            size="icon"
            className="bg-blue-600 hover:bg-blue-700 flex-shrink-0"
            onClick={handleSendMessage}
            disabled={!chatInput.trim() || isSending || isStreaming || !currentImage}
          >
            {isSending || isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Chat bubble component with rich formatting for AI responses
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          isUser ? 'bg-blue-600' : 'bg-slate-600'
        )}
      >
        {isUser ? <User className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-white" />}
      </div>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm',
          isUser ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200'
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none prose-headings:text-slate-100 prose-headings:font-semibold prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-strong:text-yellow-300 prose-em:text-blue-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        {/* Timestamp */}
        <div className={cn(
          'text-xs mt-1',
          isUser ? 'text-blue-200' : 'text-slate-500'
        )}>
          {new Date(message.createdAt).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    </div>
  );
}
