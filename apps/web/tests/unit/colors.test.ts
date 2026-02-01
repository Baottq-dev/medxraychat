import { describe, it, expect } from 'vitest';
import {
  getPathologyColor,
  getContrastColor,
  getSeverityColor,
  colorWithOpacity,
  lightenColor,
  darkenColor,
  PATHOLOGY_COLORS,
} from '@/lib/colors';

describe('Color Utilities', () => {
  describe('getPathologyColor', () => {
    it('should return correct color for known pathologies', () => {
      expect(getPathologyColor('Cardiomegaly')).toBe('#EF4444');
      expect(getPathologyColor('Pleural effusion')).toBe('#0EA5E9');
      expect(getPathologyColor('No finding')).toBe('#10B981');
    });

    it('should return default color for unknown pathologies', () => {
      expect(getPathologyColor('Unknown Disease')).toBe('#6366F1');
    });
  });

  describe('getContrastColor', () => {
    it('should return white for dark backgrounds', () => {
      expect(getContrastColor('#000000')).toBe('#FFFFFF');
      expect(getContrastColor('#333333')).toBe('#FFFFFF');
    });

    it('should return black for light backgrounds', () => {
      expect(getContrastColor('#FFFFFF')).toBe('#000000');
      expect(getContrastColor('#EEEEEE')).toBe('#000000');
    });
  });

  describe('getSeverityColor', () => {
    it('should return correct severity colors', () => {
      expect(getSeverityColor('normal')).toBe('#10B981');
      expect(getSeverityColor('mild')).toBe('#FBBF24');
      expect(getSeverityColor('moderate')).toBe('#F97316');
      expect(getSeverityColor('severe')).toBe('#EF4444');
      expect(getSeverityColor('critical')).toBe('#DC2626');
    });

    it('should return normal color for unknown severity', () => {
      expect(getSeverityColor('unknown')).toBe('#10B981');
    });
  });

  describe('colorWithOpacity', () => {
    it('should convert hex to rgba with opacity', () => {
      expect(colorWithOpacity('#FF0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
      expect(colorWithOpacity('#00FF00', 1)).toBe('rgba(0, 255, 0, 1)');
      expect(colorWithOpacity('#0000FF', 0)).toBe('rgba(0, 0, 255, 0)');
    });
  });

  describe('lightenColor', () => {
    it('should lighten colors', () => {
      // Black lightened by 50% should be gray
      const lightened = lightenColor('#000000', 50);
      expect(lightened).toBe('#808080');
    });

    it('should not exceed white', () => {
      const lightened = lightenColor('#FFFFFF', 50);
      expect(lightened).toBe('#ffffff');
    });
  });

  describe('darkenColor', () => {
    it('should darken colors', () => {
      // White darkened by 50% should be gray
      const darkened = darkenColor('#FFFFFF', 50);
      expect(darkened).toBe('#808080');
    });

    it('should not go below black', () => {
      const darkened = darkenColor('#000000', 50);
      expect(darkened).toBe('#000000');
    });
  });

  describe('PATHOLOGY_COLORS', () => {
    it('should have colors for all VinDR-CXR classes', () => {
      const expectedClasses = [
        'Aortic enlargement',
        'Cardiomegaly',
        'Pulmonary fibrosis',
        'Pleural thickening',
        'Pleural effusion',
        'Nodule/Mass',
        'Lung Opacity',
        'Consolidation',
        'Infiltration',
        'Pneumothorax',
        'Atelectasis',
        'Emphysema',
        'No finding',
      ];

      expectedClasses.forEach((cls) => {
        expect(PATHOLOGY_COLORS[cls]).toBeDefined();
      });
    });
  });
});
