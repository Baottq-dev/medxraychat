import { create } from 'zustand';
import type { ChatMessage, ChatSession, AIAnalysisResult } from '@/types';
import { apiClient } from '@/lib/api-client';

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
  
  // WebSocket
  isConnected: boolean;

  // Actions
  fetchSessions: () => Promise<void>;
  fetchSessionByStudy: (studyId: string) => Promise<ChatSession | null>;
  createSession: (studyId?: string, title?: string) => Promise<ChatSession>;
  setCurrentSession: (session: ChatSession | null) => void;
  fetchMessages: (sessionId: string) => Promise<void>;
  sendMessage: (content: string, imageId?: string) => Promise<void>;
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
