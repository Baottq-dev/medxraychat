'use client';

import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  className?: string;
}

export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2 text-slate-400', className)}>
      <Bot className="h-5 w-5" />
      <div className="flex gap-1">
        <TypingDot delay={0} />
        <TypingDot delay={150} />
        <TypingDot delay={300} />
      </div>
      <span className="text-sm ml-1">AI đang nhập...</span>
    </div>
  );
}

interface TypingDotProps {
  delay: number;
}

function TypingDot({ delay }: TypingDotProps) {
  return (
    <span
      className="w-2 h-2 rounded-full bg-slate-500 animate-bounce"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

export default TypingIndicator;
