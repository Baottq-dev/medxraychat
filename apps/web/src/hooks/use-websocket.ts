'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useChatStore } from '@/stores';
import type { ChatMessage } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/api/v1/ws';

interface UseWebSocketOptions {
  sessionId: string;
  onMessage?: (message: ChatMessage) => void;
  onTyping?: (isTyping: boolean) => void;
  autoConnect?: boolean;
}

export function useWebSocket({
  sessionId,
  onMessage,
  onTyping,
  autoConnect = true,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  
  const [isConnecting, setIsConnecting] = useState(false);
  const { setConnected, addMessage, isConnected } = useChatStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    
    // Get auth token from storage
    let token = '';
    try {
      const storage = localStorage.getItem('auth-storage');
      if (storage) {
        const parsed = JSON.parse(storage);
        token = parsed.state?.tokens?.accessToken || '';
      }
    } catch {
      console.error('Failed to get auth token');
    }

    const wsUrl = `${WS_URL}/chat/${sessionId}?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      setIsConnecting(false);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'message') {
          const message: ChatMessage = {
            id: data.id,
            sessionId: data.session_id,
            role: data.role,
            content: data.content,
            imageId: data.image_id,
            createdAt: data.created_at,
          };
          
          addMessage(message);
          onMessage?.(message);
        } else if (data.type === 'typing') {
          onTyping?.(data.is_typing);
        } else if (data.type === 'error') {
          console.error('WebSocket error:', data.message);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      setConnected(false);
      setIsConnecting(false);
      wsRef.current = null;

      // Attempt reconnect if not intentionally closed
      if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, [sessionId, setConnected, addMessage, onMessage, onTyping]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }
    
    setConnected(false);
  }, [setConnected]);

  const sendMessage = useCallback((content: string, imageId?: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return false;
    }

    wsRef.current.send(JSON.stringify({
      type: 'message',
      content,
      image_id: imageId,
    }));
    
    return true;
  }, []);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'typing',
      is_typing: isTyping,
    }));
  }, []);

  useEffect(() => {
    if (autoConnect && sessionId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [sessionId, autoConnect, connect, disconnect]);

  return {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendMessage,
    sendTyping,
  };
}
