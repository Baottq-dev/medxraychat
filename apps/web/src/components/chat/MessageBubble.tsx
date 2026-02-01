'use client';

import { useState } from 'react';
import { Bot, User, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage, AIAnalysisResult } from '@/types';

interface MessageBubbleProps {
  message: ChatMessage;
  className?: string;
}

export function MessageBubble({ message, className }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      {!isUser && <AvatarIcon type="assistant" />}

      <div
        className={cn(
          'max-w-[80%] rounded-lg p-3',
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-slate-800 text-slate-200'
        )}
      >
        {/* Message content */}
        <MessageContent content={message.content} />

        {/* Analysis result if present */}
        {message.analysisResult && (
          <AnalysisResultPreview result={message.analysisResult} />
        )}

        {/* Actions for AI messages */}
        {!isUser && (
          <MessageActions copied={copied} onCopy={handleCopy} />
        )}
      </div>

      {isUser && <AvatarIcon type="user" />}
    </div>
  );
}

// Avatar icon component
interface AvatarIconProps {
  type: 'user' | 'assistant';
}

function AvatarIcon({ type }: AvatarIconProps) {
  return (
    <div
      className={cn(
        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
        type === 'user' ? 'bg-slate-600' : 'bg-blue-600'
      )}
    >
      {type === 'user' ? (
        <User className="h-5 w-5 text-white" />
      ) : (
        <Bot className="h-5 w-5 text-white" />
      )}
    </div>
  );
}

// Message content renderer
interface MessageContentProps {
  content: string;
}

function MessageContent({ content }: MessageContentProps) {
  // Split content by newlines and render each line
  const lines = content.split('\n');

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {lines.map((line, i) => (
        <p key={i} className="mb-1 last:mb-0">
          {line || '\u00A0'} {/* Non-breaking space for empty lines */}
        </p>
      ))}
    </div>
  );
}

// Analysis result preview
interface AnalysisResultPreviewProps {
  result: AIAnalysisResult;
  maxItems?: number;
}

function AnalysisResultPreview({ result, maxItems = 5 }: AnalysisResultPreviewProps) {
  const detections = result.detections;
  const visibleDetections = detections.slice(0, maxItems);
  const remainingCount = detections.length - maxItems;

  return (
    <div className="mt-3 pt-3 border-t border-slate-700">
      <div className="text-xs text-slate-400 mb-2">
        🔍 {detections.length} phát hiện
      </div>
      <div className="space-y-1">
        {visibleDetections.map((det, i) => (
          <DetectionItem key={i} detection={det} />
        ))}
        {remainingCount > 0 && (
          <div className="text-xs text-slate-500">
            +{remainingCount} more...
          </div>
        )}
      </div>

      {/* Summary if available */}
      {result.summary && (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          <p className="text-xs text-slate-400">{result.summary}</p>
        </div>
      )}
    </div>
  );
}

// Individual detection item
interface DetectionItemProps {
  detection: {
    className: string;
    confidence: number;
  };
}

function DetectionItem({ detection }: DetectionItemProps) {
  const confidencePercent = (detection.confidence * 100).toFixed(0);
  const confidenceColor = getConfidenceColor(detection.confidence);

  return (
    <div className="text-xs flex justify-between items-center">
      <span className="truncate">{detection.className}</span>
      <span className={cn('ml-2 font-medium', confidenceColor)}>
        {confidencePercent}%
      </span>
    </div>
  );
}

// Helper function to get color based on confidence
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-400';
  if (confidence >= 0.5) return 'text-yellow-400';
  return 'text-slate-400';
}

// Message actions
interface MessageActionsProps {
  copied: boolean;
  onCopy: () => void;
}

function MessageActions({ copied, onCopy }: MessageActionsProps) {
  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700/50">
      <button
        className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
        onClick={onCopy}
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-green-500" />
            <span className="text-green-500">Đã copy</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            Copy
          </>
        )}
      </button>
    </div>
  );
}

export default MessageBubble;
