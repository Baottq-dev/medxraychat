# MedXrayChat Web App

Web application for MedXrayChat - AI-powered medical X-ray analysis platform.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS + shadcn/ui
- **State Management**: Zustand
- **Medical Imaging**: Cornerstone.js
- **HTTP Client**: Axios
- **Real-time**: WebSocket

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/v1/ws
NEXT_PUBLIC_APP_NAME=MedXrayChat
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Landing page
│   ├── login/             # Authentication
│   ├── register/
│   ├── dashboard/         # Main dashboard
│   └── viewer/            # DICOM viewer
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── viewer/            # Medical imaging components
│   │   ├── DicomViewer.tsx
│   │   ├── AnnotationOverlay.tsx
│   │   ├── MeasurementOverlay.tsx
│   │   └── DetectionOverlay.tsx
│   ├── chat/              # AI chat components
│   └── providers/         # Context providers
├── stores/                # Zustand stores
│   ├── auth-store.ts
│   ├── study-store.ts
│   ├── viewer-store.ts
│   └── chat-store.ts
├── hooks/                 # Custom hooks
│   ├── use-toast.ts
│   └── use-websocket.ts
├── lib/                   # Utilities
│   ├── api-client.ts
│   └── utils.ts
└── types/                 # TypeScript types
    └── index.ts
```

## Features

### 🔬 DICOM Viewer

- Native DICOM support via Cornerstone.js
- Zoom, Pan, Rotate, Flip
- Window/Level adjustment
- Image navigation

### ✏️ Annotation Tools

- Freehand drawing
- Arrow annotations
- Ellipse & Rectangle
- Text labels
- Marker points

### 📏 Measurement Tools

- Distance measurement (mm)
- Angle measurement (degrees)
- Area measurement (mm²)
- Cobb angle for scoliosis

### 🤖 AI Analysis

- YOLOv11 detection (22 pathologies)
- Qwen3-VL analysis
- Real-time results overlay
- Confidence scores

### 💬 AI Chat

- WebSocket real-time
- Image context awareness
- Analysis explanations
- Report generation

## Development

```bash
# Run development server
npm run dev

# Type checking
npm run type-check

# Lint
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

## Docker

```bash
# Build image
docker build -t medxraychat-web -f ../docker/Dockerfile.frontend .

# Run container
docker run -p 3000:3000 medxraychat-web
```

## License

MIT License - MedXrayChat Team
