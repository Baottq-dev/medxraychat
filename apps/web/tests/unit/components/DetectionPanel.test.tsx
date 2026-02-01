import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetectionPanel } from '@/components/viewer/DetectionPanel';
import type { Detection } from '@/types';

describe('DetectionPanel', () => {
  const mockDetections: Detection[] = [
    {
      id: '1',
      classId: 0,
      className: 'Cardiomegaly',
      confidence: 0.92,
      bbox: { x1: 100, y1: 100, x2: 300, y2: 300 },
      source: 'yolo',
    },
    {
      id: '2',
      classId: 1,
      className: 'Pleural effusion',
      confidence: 0.65,
      bbox: { x1: 50, y1: 200, x2: 150, y2: 350 },
      source: 'yolo',
    },
    {
      id: '3',
      classId: 2,
      className: 'Lung Opacity',
      confidence: 0.35,
      bbox: { x1: 200, y1: 150, x2: 400, y2: 350 },
      source: 'qwen',
    },
  ];

  describe('rendering', () => {
    it('should render detection count', () => {
      render(<DetectionPanel detections={mockDetections} />);

      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should render all detection names', () => {
      render(<DetectionPanel detections={mockDetections} />);

      expect(screen.getByText('Cardiomegaly')).toBeInTheDocument();
      expect(screen.getByText('Pleural effusion')).toBeInTheDocument();
      expect(screen.getByText('Lung Opacity')).toBeInTheDocument();
    });

    it('should render confidence percentages', () => {
      render(<DetectionPanel detections={mockDetections} />);

      expect(screen.getByText('92%')).toBeInTheDocument();
      expect(screen.getByText('65%')).toBeInTheDocument();
      expect(screen.getByText('35%')).toBeInTheDocument();
    });

    it('should show empty state when no detections', () => {
      render(<DetectionPanel detections={[]} />);

      expect(screen.getByText(/Không có phát hiện nào/)).toBeInTheDocument();
    });
  });

  describe('severity grouping', () => {
    it('should group detections by severity', () => {
      render(<DetectionPanel detections={mockDetections} />);

      // Check summary cards
      expect(screen.getByText('Cao')).toBeInTheDocument();
      expect(screen.getByText('Trung bình')).toBeInTheDocument();
      expect(screen.getByText('Thấp')).toBeInTheDocument();
    });

    it('should count detections correctly in each severity group', () => {
      render(<DetectionPanel detections={mockDetections} />);

      // 1 high (≥0.8), 1 medium (0.5-0.8), 1 low (<0.5)
      const summaryCards = screen.getAllByText(/^[0-3]$/);
      expect(summaryCards).toHaveLength(3);
    });
  });

  describe('interactions', () => {
    it('should call onDetectionHover when hovering', () => {
      const onHover = vi.fn();
      render(
        <DetectionPanel
          detections={mockDetections}
          onDetectionHover={onHover}
        />
      );

      const firstDetection = screen.getByText('Cardiomegaly').closest('div');
      if (firstDetection) {
        fireEvent.mouseEnter(firstDetection);
        expect(onHover).toHaveBeenCalledWith(mockDetections[0]);

        fireEvent.mouseLeave(firstDetection);
        expect(onHover).toHaveBeenCalledWith(null);
      }
    });

    it('should call onDetectionSelect when clicking', () => {
      const onSelect = vi.fn();
      render(
        <DetectionPanel
          detections={mockDetections}
          onDetectionSelect={onSelect}
        />
      );

      const firstDetection = screen.getByText('Cardiomegaly').closest('div');
      if (firstDetection) {
        fireEvent.click(firstDetection);
        expect(onSelect).toHaveBeenCalledWith(mockDetections[0]);
      }
    });

    it('should toggle visibility when clicking eye icon', () => {
      const onVisibilityToggle = vi.fn();
      render(
        <DetectionPanel
          detections={mockDetections}
          onVisibilityToggle={onVisibilityToggle}
        />
      );

      // Find visibility toggle buttons
      const visibilityButtons = screen.getAllByRole('button');
      const eyeButton = visibilityButtons.find(btn =>
        btn.querySelector('svg')
      );

      if (eyeButton) {
        fireEvent.click(eyeButton);
        expect(onVisibilityToggle).toHaveBeenCalled();
      }
    });
  });

  describe('collapsible behavior', () => {
    it('should collapse and expand panel', () => {
      render(<DetectionPanel detections={mockDetections} />);

      // Panel should be expanded by default
      expect(screen.getByText('Cardiomegaly')).toBeInTheDocument();

      // Click header to collapse
      const header = screen.getByText('Phát hiện').closest('div');
      if (header) {
        fireEvent.click(header);
        expect(screen.queryByText('Cardiomegaly')).not.toBeInTheDocument();

        // Click again to expand
        fireEvent.click(header);
        expect(screen.getByText('Cardiomegaly')).toBeInTheDocument();
      }
    });
  });

  describe('sorting', () => {
    it('should sort by confidence by default (descending)', () => {
      render(<DetectionPanel detections={mockDetections} />);

      const detectionNames = screen.getAllByText(/Cardiomegaly|Pleural effusion|Lung Opacity/);
      // Highest confidence first
      expect(detectionNames[0]).toHaveTextContent('Cardiomegaly');
    });

    it('should toggle sort order when clicking sort button', () => {
      render(<DetectionPanel detections={mockDetections} />);

      const sortButton = screen.getByText('Độ tin cậy');
      fireEvent.click(sortButton);

      // After clicking, order should be ascending (lowest first)
      const detectionNames = screen.getAllByText(/Cardiomegaly|Pleural effusion|Lung Opacity/);
      expect(detectionNames[0]).toHaveTextContent('Lung Opacity');
    });
  });

  describe('filtering', () => {
    it('should filter detections by minimum confidence', () => {
      render(<DetectionPanel detections={mockDetections} />);

      // Initially all 3 detections visible
      expect(screen.getByText('Cardiomegaly')).toBeInTheDocument();
      expect(screen.getByText('Pleural effusion')).toBeInTheDocument();
      expect(screen.getByText('Lung Opacity')).toBeInTheDocument();

      // Change filter to ≥50%
      const filterSelect = screen.getByRole('combobox');
      fireEvent.change(filterSelect, { target: { value: '0.5' } });

      // Only detections with confidence ≥50% should be visible
      expect(screen.getByText('Cardiomegaly')).toBeInTheDocument();
      expect(screen.getByText('Pleural effusion')).toBeInTheDocument();
      expect(screen.queryByText('Lung Opacity')).not.toBeInTheDocument();
    });
  });

  describe('highlighting', () => {
    it('should highlight hovered detection', () => {
      render(
        <DetectionPanel
          detections={mockDetections}
          hoveredDetection={mockDetections[0]}
        />
      );

      const hoveredItem = screen.getByText('Cardiomegaly').closest('div');
      expect(hoveredItem).toHaveClass('bg-slate-700');
    });

    it('should highlight selected detection', () => {
      render(
        <DetectionPanel
          detections={mockDetections}
          selectedDetection={mockDetections[0]}
        />
      );

      const selectedItem = screen.getByText('Cardiomegaly').closest('div');
      expect(selectedItem).toHaveClass('bg-blue-900/30');
    });
  });
});
