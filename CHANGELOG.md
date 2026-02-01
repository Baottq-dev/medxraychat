# Changelog

All notable changes to MedXrayChat will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- React/Next.js web application migration
- Cornerstone.js 3D integration for DICOM viewing
- Zustand state management
- TailwindCSS styling with dark mode
- Medical annotation tools (freehand, arrow, ellipse, text)
- Measurement tools (distance, angle, area, Cobb angle)
- AI-powered chat interface with WebSocket
- CI/CD pipelines with GitHub Actions

### Changed
- Project structure reorganized to monorepo layout
- Backend moved to `apps/api/`
- Frontend migrated from Flutter to Next.js in `apps/web/`
- Docker configurations moved to `infra/docker/`

### Deprecated
- Flutter desktop application (will be removed in v1.0.0)

## [0.1.0] - 2024-01-31

### Added
- Initial release
- FastAPI backend with PostgreSQL
- Flutter desktop application
- YOLO-based pathology detection
- Qwen3-VL integration for AI analysis
- Basic authentication system
- Study management
- Real-time chat with WebSocket
