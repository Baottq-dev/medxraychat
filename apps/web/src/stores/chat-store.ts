import { create } from 'zustand';
import type { ChatMessage, ChatSession, AIAnalysisResult } from '@/types';
import { apiClient, API_BASE_URL } from '@/lib/api-client';

interface ChatState {
  // Data
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  messages: ChatMessage[];

  // AI Analysis
  currentAnalysis: AIAnalysisResult | null;
  isAnalyzing: boolean;

  // Loading states
  isLoading: boolean;
  isSending: boolean;
  error: string | null;

  // Streaming
  streamingContent: string;
  isStreaming: boolean;

  // Tool calling states
  isThinking: boolean;
  toolStatus: string | null;
  currentTool: string | null;

  // WebSocket
  isConnected: boolean;

  // Actions
  fetchSessions: () => Promise<void>;
  fetchSessionByStudy: (studyId: string) => Promise<ChatSession | null>;
  createSession: (studyId?: string, title?: string) => Promise<ChatSession>;
  setCurrentSession: (session: ChatSession | null) => void;
  fetchMessages: (sessionId: string) => Promise<void>;
  sendMessage: (content: string, imageId?: string) => Promise<void>;
  sendMessageStream: (content: string, imageId?: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;

  // AI Analysis
  analyzeImage: (imageId: string) => Promise<AIAnalysisResult>;
  setCurrentAnalysis: (analysis: AIAnalysisResult | null) => void;

  // WebSocket
  setConnected: (connected: boolean) => void;

  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  currentAnalysis: null,
  isAnalyzing: false,
  isLoading: false,
  isSending: false,
  error: null,
  isConnected: false,
  streamingContent: '',
  isStreaming: false,
  isThinking: false,
  toolStatus: null,
  currentTool: null,

  fetchSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await apiClient.get<ChatSession[]>('/chat/sessions');
      set({ sessions, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch sessions',
        isLoading: false,
      });
    }
  },

  fetchSessionByStudy: async (studyId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Get all sessions and find the one for this study
      const sessions = await apiClient.get<ChatSession[]>('/chat/sessions');
      const studySession = sessions.find(s => s.studyId === studyId);
      
      if (studySession) {
        // Fetch messages for this session
        const messages = await apiClient.get<ChatMessage[]>(
          `/chat/sessions/${studySession.id}/messages`
        );
        set({
          sessions,
          currentSession: studySession,
          messages,
          isLoading: false,
        });
        return studySession;
      }
      
      set({ sessions, isLoading: false });
      return null;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch session',
        isLoading: false,
      });
      return null;
    }
  },

  createSession: async (studyId?: string, title?: string) => {
    set({ isLoading: true, error: null });
    try {
      const session = await apiClient.post<ChatSession>('/chat/sessions', {
        study_id: studyId,
        title: title || 'New Chat',
      });
      
      const { sessions } = get();
      set({
        sessions: [session, ...sessions],
        currentSession: session,
        messages: [],
        isLoading: false,
      });
      
      return session;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create session',
        isLoading: false,
      });
      throw error;
    }
  },

  setCurrentSession: (session) => set({ currentSession: session, messages: [] }),

  fetchMessages: async (sessionId: string) => {
    set({ isLoading: true, error: null });
    try {
      const messages = await apiClient.get<ChatMessage[]>(
        `/chat/sessions/${sessionId}/messages`
      );
      set({ messages, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch messages',
        isLoading: false,
      });
    }
  },

  sendMessage: async (content: string, imageId?: string) => {
    const { currentSession } = get();
    if (!currentSession) {
      throw new Error('No active session');
    }

    set({ isSending: true, error: null });
    
    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId: currentSession.id,
      role: 'user',
      content,
      imageId,
      createdAt: new Date().toISOString(),
    };
    
    set((state) => ({
      messages: [...state.messages, userMessage],
    }));

    try {
      const response = await apiClient.post<ChatMessage>(
        `/chat/sessions/${currentSession.id}/messages`,
        { content, image_id: imageId }
      );
      
      // Extract detections from bbox_references and update currentAnalysis for overlay
      if (response.bboxReferences && response.bboxReferences.length > 0) {
        const detections = response.bboxReferences.map((d: any, idx: number) => ({
          id: d.id || `det-${idx}`,
          classId: d.class_id ?? d.classId ?? 0,
          className: d.class_name ?? d.className ?? `Class ${d.class_id}`,
          confidence: d.confidence ?? 0,
          bbox: d.bbox ?? { x1: 0, y1: 0, x2: 0, y2: 0 },
          source: d.source ?? 'yolo',
        }));
        
        set({
          currentAnalysis: {
            id: response.id,
            imageId: imageId || '',
            detections,
            summary: '',
            findings: [],
            processingTime: 0,
            modelVersion: 'yolo-mff',
            createdAt: response.createdAt,
          },
        });
      }
      
      // Add AI response message (keep user message, add AI response)
      set((state) => ({
        messages: [...state.messages, response],
        isSending: false,
      }));
    } catch (error) {
      // Remove failed message
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== userMessage.id),
        error: error instanceof Error ? error.message : 'Failed to send message',
        isSending: false,
      }));
      throw error;
    }
  },

  sendMessageStream: async (content: string, imageId?: string) => {
    const { currentSession } = get();
    if (!currentSession) {
      throw new Error('No active session');
    }

    set({
      isSending: true,
      isStreaming: true,
      streamingContent: '',
      error: null,
      isThinking: false,
      toolStatus: null,
      currentTool: null,
    });

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId: currentSession.id,
      role: 'user',
      content,
      imageId,
      createdAt: new Date().toISOString(),
    };

    // Add placeholder for AI response
    const aiPlaceholder: ChatMessage = {
      id: `streaming-${Date.now()}`,
      sessionId: currentSession.id,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage, aiPlaceholder],
    }));

    try {
      // Get auth token
      const storage = localStorage.getItem('auth-storage');
      let token = '';
      if (storage) {
        const parsed = JSON.parse(storage);
        token = parsed.state?.tokens?.accessToken || '';
      }

      const response = await fetch(
        `${API_BASE_URL}/chat/sessions/${currentSession.id}/messages/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ content, image_id: imageId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to start stream');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let finalMessageId = aiPlaceholder.id;
      let detections: any[] = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep incomplete event in buffer

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;

          const lines = eventBlock.split('\n');
          let eventType = '';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7);
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }

          if (!eventData) continue;

          try {
            const data = JSON.parse(eventData);

            // Handle OpenAI/Anthropic-style events with tool calling support
            switch (data.type) {
              case 'message_start':
                // Message started, metadata available
                break;

              case 'content_block_start':
                // New content block starting - check block type
                if (data.content_block?.type === 'thinking') {
                  set({ isThinking: true, toolStatus: 'Đang phân tích yêu cầu...' });
                } else if (data.content_block?.type === 'tool_use') {
                  set({ isThinking: false, currentTool: 'tool_use' });
                }
                break;

              case 'content_block_delta':
                // Handle thinking phase
                if (data.delta?.type === 'thinking_delta') {
                  set({ toolStatus: data.delta.text || 'Đang suy nghĩ...' });
                }
                // Handle tool status updates
                else if (data.delta?.type === 'tool_status') {
                  set({ toolStatus: data.delta.text || 'Đang thực hiện...' });
                }
                // Handle text content
                else if (data.delta?.type === 'text_delta') {
                  // Clear thinking/tool status when text starts
                  set({ isThinking: false, toolStatus: null, currentTool: null });
                  // Text content delta
                  accumulatedContent += data.delta.text;
                  set((state) => ({
                    streamingContent: accumulatedContent,
                    messages: state.messages.map((m) =>
                      m.id === aiPlaceholder.id
                        ? { ...m, content: accumulatedContent }
                        : m
                    ),
                  }));
                } else if (data.delta?.type === 'detections_delta') {
                  // Detections data from AI analysis
                  try {
                    detections = JSON.parse(data.delta.text);
                    console.log('[Chat] Received detections:', detections.length);
                    const mappedDetections = detections.map((d: any, idx: number) => ({
                      id: d.id || `det-${idx}`,
                      classId: d.class_id ?? d.classId ?? 0,
                      className: d.class_name ?? d.className ?? `Class ${d.class_id}`,
                      confidence: d.confidence ?? 0,
                      bbox: d.bbox ?? { x1: 0, y1: 0, x2: 0, y2: 0 },
                      source: d.source ?? 'yolo',
                    }));

                    console.log('[Chat] Mapped detections for overlay:', mappedDetections);
                    set({
                      currentAnalysis: {
                        id: aiPlaceholder.id,
                        imageId: imageId || '',
                        detections: mappedDetections,
                        summary: '',
                        findings: [],
                        processingTime: 0,
                        modelVersion: 'yolo-mff',
                        createdAt: new Date().toISOString(),
                      },
                    });
                  } catch (e) {
                    console.error('[Chat] Failed to parse detections:', e, data.delta?.text);
                  }
                }
                break;

              case 'content_block_stop':
                // Content block finished - reset thinking if it was a thinking block
                if (get().isThinking) {
                  set({ isThinking: false });
                }
                break;

              case 'message_delta':
                // Usage statistics update
                break;

              case 'message_stop':
                // Final message with ID
                finalMessageId = data.message_id || aiPlaceholder.id;
                set((state) => ({
                  messages: state.messages.map((m) =>
                    m.id === aiPlaceholder.id
                      ? { ...m, id: finalMessageId, content: accumulatedContent, bboxReferences: detections }
                      : m
                  ),
                  isStreaming: false,
                  isSending: false,
                  streamingContent: '',
                  isThinking: false,
                  toolStatus: null,
                  currentTool: null,
                }));
                break;

              case 'ping':
                // Heartbeat - ignore
                break;

              case 'error':
                throw new Error(data.error?.message || 'Stream error');

              // Legacy format support (backward compatibility)
              case 'chunk':
                accumulatedContent += data.data;
                set((state) => ({
                  streamingContent: accumulatedContent,
                  messages: state.messages.map((m) =>
                    m.id === aiPlaceholder.id
                      ? { ...m, content: accumulatedContent }
                      : m
                  ),
                }));
                break;

              case 'detections':
                detections = data.data;
                const mappedDets = detections.map((d: any, idx: number) => ({
                  id: d.id || `det-${idx}`,
                  classId: d.class_id ?? d.classId ?? 0,
                  className: d.class_name ?? d.className ?? `Class ${d.class_id}`,
                  confidence: d.confidence ?? 0,
                  bbox: d.bbox ?? { x1: 0, y1: 0, x2: 0, y2: 0 },
                  source: d.source ?? 'yolo',
                }));
                set({
                  currentAnalysis: {
                    id: aiPlaceholder.id,
                    imageId: imageId || '',
                    detections: mappedDets,
                    summary: '',
                    findings: [],
                    processingTime: 0,
                    modelVersion: 'yolo-mff',
                    createdAt: new Date().toISOString(),
                  },
                });
                break;

              case 'done':
                finalMessageId = data.message_id;
                set((state) => ({
                  messages: state.messages.map((m) =>
                    m.id === aiPlaceholder.id
                      ? { ...m, id: finalMessageId, content: accumulatedContent, bboxReferences: detections }
                      : m
                  ),
                  isStreaming: false,
                  isSending: false,
                  streamingContent: '',
                }));
                break;
            }
          } catch (parseError) {
            // Ignore parse errors for incomplete JSON
          }
        }
      }
    } catch (error) {
      // Remove failed messages
      set((state) => ({
        messages: state.messages.filter(
          (m) => m.id !== userMessage.id && !m.id.startsWith('streaming-')
        ),
        error: error instanceof Error ? error.message : 'Failed to send message',
        isSending: false,
        isStreaming: false,
        streamingContent: '',
        isThinking: false,
        toolStatus: null,
        currentTool: null,
      }));
      throw error;
    }
  },

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  analyzeImage: async (imageId: string) => {
    set({ isAnalyzing: true, error: null });
    try {
      const analysis = await apiClient.post<AIAnalysisResult>('/ai/analyze', {
        image_id: imageId,
      });
      set({ currentAnalysis: analysis, isAnalyzing: false });
      return analysis;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Analysis failed',
        isAnalyzing: false,
      });
      throw error;
    }
  },

  setCurrentAnalysis: (analysis) => set({ currentAnalysis: analysis }),

  setConnected: (connected) => set({ isConnected: connected }),

  clearError: () => set({ error: null }),
}));
