import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import type { ChatMessage } from '@/types';

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

describe('MessageBubble', () => {
  const userMessage: ChatMessage = {
    id: '1',
    role: 'user',
    content: 'Hello, can you analyze this X-ray?',
    createdAt: new Date().toISOString(),
  };

  const assistantMessage: ChatMessage = {
    id: '2',
    role: 'assistant',
    content: 'I can see several findings in this X-ray image.',
    createdAt: new Date().toISOString(),
  };

  const messageWithAnalysis: ChatMessage = {
    id: '3',
    role: 'assistant',
    content: 'Analysis complete.',
    createdAt: new Date().toISOString(),
    analysisResult: {
      detections: [
        { id: '1', classId: 0, className: 'Cardiomegaly', confidence: 0.85, bbox: { x1: 0, y1: 0, x2: 100, y2: 100 } },
        { id: '2', classId: 1, className: 'Pleural effusion', confidence: 0.72, bbox: { x1: 50, y1: 50, x2: 150, y2: 150 } },
      ],
      summary: 'Found 2 abnormalities',
      findings: ['Enlarged heart', 'Fluid in lungs'],
      recommendations: ['Follow up recommended'],
    },
  };

  describe('rendering', () => {
    it('should render user message correctly', () => {
      render(<MessageBubble message={userMessage} />);

      expect(screen.getByText(userMessage.content)).toBeInTheDocument();
    });

    it('should render assistant message correctly', () => {
      render(<MessageBubble message={assistantMessage} />);

      expect(screen.getByText(assistantMessage.content)).toBeInTheDocument();
    });

    it('should apply different styles for user vs assistant', () => {
      const { rerender } = render(<MessageBubble message={userMessage} />);
      const userBubble = screen.getByText(userMessage.content).closest('div');
      expect(userBubble).toHaveClass('bg-blue-600');

      rerender(<MessageBubble message={assistantMessage} />);
      const assistantBubble = screen.getByText(assistantMessage.content).closest('div');
      expect(assistantBubble).toHaveClass('bg-slate-800');
    });
  });

  describe('analysis result display', () => {
    it('should display detection count', () => {
      render(<MessageBubble message={messageWithAnalysis} />);

      expect(screen.getByText(/2 phát hiện/)).toBeInTheDocument();
    });

    it('should display detection names', () => {
      render(<MessageBubble message={messageWithAnalysis} />);

      expect(screen.getByText('Cardiomegaly')).toBeInTheDocument();
      expect(screen.getByText('Pleural effusion')).toBeInTheDocument();
    });

    it('should display confidence percentages', () => {
      render(<MessageBubble message={messageWithAnalysis} />);

      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('72%')).toBeInTheDocument();
    });
  });

  describe('copy functionality', () => {
    it('should show copy button for assistant messages', () => {
      render(<MessageBubble message={assistantMessage} />);

      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    it('should not show copy button for user messages', () => {
      render(<MessageBubble message={userMessage} />);

      expect(screen.queryByText('Copy')).not.toBeInTheDocument();
    });

    it('should copy message content to clipboard on click', async () => {
      render(<MessageBubble message={assistantMessage} />);

      const copyButton = screen.getByText('Copy');
      fireEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(assistantMessage.content);
    });

    it('should show "Đã copy" after clicking copy', async () => {
      vi.useFakeTimers();
      render(<MessageBubble message={assistantMessage} />);

      const copyButton = screen.getByText('Copy');
      fireEvent.click(copyButton);

      expect(await screen.findByText('Đã copy')).toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe('multiline content', () => {
    it('should render multiline content correctly', () => {
      const multilineMessage: ChatMessage = {
        id: '4',
        role: 'assistant',
        content: 'Line 1\nLine 2\nLine 3',
        createdAt: new Date().toISOString(),
      };

      render(<MessageBubble message={multilineMessage} />);

      expect(screen.getByText('Line 1')).toBeInTheDocument();
      expect(screen.getByText('Line 2')).toBeInTheDocument();
      expect(screen.getByText('Line 3')).toBeInTheDocument();
    });
  });
});
