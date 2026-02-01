// Types for the application

// Auth types
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'doctor' | 'technician' | 'user';
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  role?: string;
}

// Study & Image types
export interface Study {
  id: string;
  patientId: string;
  patientName: string;
  studyDate: string;
  modality: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'reviewed';
  imageCount: number;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DicomImage {
  id: string;
  studyId: string;
  filename: string;
  sopInstanceUid: string;
  seriesInstanceUid: string;
  imageNumber: number;
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  photometricInterpretation: string;
  pixelSpacing?: [number, number];
  windowCenter?: number;
  windowWidth?: number;
  thumbnailUrl?: string;
  imageUrl: string;
  createdAt: string;
}

// Annotation types
export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  id: string;
  imageId?: string;
  type: 'freehand' | 'arrow' | 'ellipse' | 'rectangle' | 'text' | 'marker';
  points: Point[];
  text?: string;
  color: string;
  strokeWidth: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Measurement types
export type MeasurementType = 'distance' | 'angle' | 'area' | 'cobb_angle';

export interface Measurement {
  id: string;
  imageId?: string;
  type: MeasurementType;
  points: Point[];
  value: number;
  unit: string;
  label?: string;
  color?: string;
  createdBy?: string;
  createdAt?: string;
}

// AI Analysis types
export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Detection {
  id: string;
  classId: number;
  className: string;
  confidence: number;
  bbox: BoundingBox;
  description?: string;
  source?: string;
}

export interface AIAnalysisResult {
  id: string;
  imageId: string;
  detections: Detection[];
  summary: string;
  findings: string[];
  recommendations?: string[];
  processingTime: number;
  modelVersion: string;
  createdAt: string;
}

// Chat types
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageId?: string;
  bboxReferences?: Detection[];
  analysisResult?: AIAnalysisResult;
  tokensUsed?: number;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  studyId?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// Report types
export interface Report {
  id: string;
  studyId: string;
  title: string;
  content: string;
  findings: string[];
  conclusion: string;
  recommendations: string[];
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  createdBy: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

// Dashboard types
export interface DashboardStats {
  totalStudies: number;
  analysesToday: number;
  chatSessions: number;
  reports: number;
}

// Viewer state types
export interface ViewerState {
  zoom: number;
  pan: Point;
  rotation: number;
  flip: { horizontal: boolean; vertical: boolean };
  windowLevel: { center: number; width: number };
  invert: boolean;
}

export interface ViewerTool {
  id: string;
  name: string;
  icon: string;
  cursor: string;
  active: boolean;
}
