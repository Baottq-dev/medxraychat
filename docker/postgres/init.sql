-- MedXrayChat Database Schema
-- PostgreSQL 16

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'doctor',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for email lookup
CREATE INDEX idx_users_email ON users(email);

-- Studies table (DICOM Study equivalent)
CREATE TABLE studies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id VARCHAR(64),
    patient_name VARCHAR(255),
    patient_age INTEGER,
    patient_sex VARCHAR(10),
    study_date TIMESTAMP WITH TIME ZONE,
    modality VARCHAR(16) DEFAULT 'CR',
    description TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_studies_user ON studies(user_id);
CREATE INDEX idx_studies_patient ON studies(patient_id);
CREATE INDEX idx_studies_date ON studies(study_date DESC);

-- Images table
CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE,
    file_path VARCHAR(512) NOT NULL,
    original_filename VARCHAR(255),
    file_size_bytes BIGINT,
    width INTEGER,
    height INTEGER,
    bits_stored INTEGER DEFAULT 8,
    window_center FLOAT,
    window_width FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_images_study ON images(study_id);

-- AI Analysis Results
CREATE TABLE ai_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    image_id UUID REFERENCES images(id) ON DELETE CASCADE,
    -- YOLO detections: [{class_id, class_name, bbox: [x1,y1,x2,y2], confidence}, ...]
    yolo_detections JSONB DEFAULT '[]'::jsonb,
    -- Qwen-VL detections (if any)
    qwen_detections JSONB DEFAULT '[]'::jsonb,
    -- Fused results after WBF
    fused_detections JSONB DEFAULT '[]'::jsonb,
    -- Qwen-VL analysis text
    analysis_text TEXT,
    -- Processing metadata
    yolo_model_version VARCHAR(50),
    qwen_model_version VARCHAR(50),
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_results_image ON ai_results(image_id);

-- Chat Sessions
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_study ON chat_sessions(study_id);
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);

-- Chat Messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    -- Reference to image if message includes image context
    image_id UUID REFERENCES images(id) ON DELETE SET NULL,
    -- Bounding boxes referenced in this message
    bbox_references JSONB DEFAULT '[]'::jsonb,
    -- Token usage for AI messages
    tokens_used INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);

-- Diagnosis Reports (generated from AI analysis)
CREATE TABLE diagnosis_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Report content
    findings TEXT,
    impression TEXT,
    recommendations TEXT,
    -- AI-generated vs doctor-edited
    is_ai_generated BOOLEAN DEFAULT TRUE,
    is_finalized BOOLEAN DEFAULT FALSE,
    finalized_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reports_study ON diagnosis_reports(study_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_studies_updated_at BEFORE UPDATE ON studies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON diagnosis_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin123)
-- Note: Change this password in production!
INSERT INTO users (email, hashed_password, full_name, role) VALUES
('admin@medxray.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.lEYZhXO/xu6z6.', 'Admin User', 'admin');

COMMENT ON TABLE users IS 'User accounts for doctors and administrators';
COMMENT ON TABLE studies IS 'Medical imaging studies containing X-ray images';
COMMENT ON TABLE images IS 'Individual X-ray images within a study';
COMMENT ON TABLE ai_results IS 'AI analysis results including YOLO detections and Qwen-VL analysis';
COMMENT ON TABLE chat_sessions IS 'Chat sessions for AI-assisted diagnosis';
COMMENT ON TABLE chat_messages IS 'Individual messages in chat sessions';
COMMENT ON TABLE diagnosis_reports IS 'Final diagnosis reports generated from AI analysis';
