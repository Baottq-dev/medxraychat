'use client';

import { Sparkles, MessageSquare, Zap, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  onNewSession: () => void;
  className?: string;
}

export function EmptyState({ onNewSession, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full text-center p-6',
        className
      )}
    >
      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
        <Sparkles className="h-8 w-8 text-blue-500" />
      </div>

      {/* Title */}
      <h3 className="text-lg font-medium text-white mb-2">
        AI Assistant sẵn sàng hỗ trợ
      </h3>

      {/* Description */}
      <p className="text-slate-400 mb-6 max-w-sm">
        Hỏi bất kỳ câu hỏi nào về ảnh X-quang đang xem.
        AI sẽ phân tích và đưa ra nhận xét chuyên môn.
      </p>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 w-full max-w-md">
        <FeatureCard
          icon={<Zap className="h-4 w-4" />}
          title="Phân tích nhanh"
          description="YOLO + Qwen3-VL"
        />
        <FeatureCard
          icon={<MessageSquare className="h-4 w-4" />}
          title="Hội thoại"
          description="Hỏi đáp liên tục"
        />
        <FeatureCard
          icon={<HelpCircle className="h-4 w-4" />}
          title="Giải thích"
          description="Chi tiết phát hiện"
        />
      </div>

      {/* CTA Button */}
      <Button onClick={onNewSession} className="bg-blue-600 hover:bg-blue-700">
        <Sparkles className="h-4 w-4 mr-2" />
        Bắt đầu phân tích
      </Button>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="p-3 rounded-lg bg-slate-800/50 text-left">
      <div className="text-blue-500 mb-1">{icon}</div>
      <div className="text-sm font-medium text-white">{title}</div>
      <div className="text-xs text-slate-400">{description}</div>
    </div>
  );
}

export default EmptyState;
