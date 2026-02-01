import { describe, it, expect } from 'vitest';
import {
  distance,
  distanceMm,
  formatDistance,
  calculateAngle,
  formatAngle,
  calculateArea,
  areaMmSquared,
  formatArea,
  pointInPolygon,
  midpoint,
  calculateCentroid,
} from '@/lib/geometry';

describe('Geometry Utilities', () => {
  describe('distance', () => {
    it('should calculate distance between two points', () => {
      expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
      expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
      expect(distance({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1);
    });
  });

  describe('distanceMm', () => {
    it('should calculate distance in millimeters', () => {
      const pixelSpacing = 0.1; // 0.1mm per pixel
      expect(distanceMm({ x: 0, y: 0 }, { x: 100, y: 0 }, pixelSpacing)).toBe(10);
    });
  });

  describe('formatDistance', () => {
    it('should format distance correctly', () => {
      expect(formatDistance(15.5)).toBe('15.5 mm');
      expect(formatDistance(5.123)).toBe('5.12 mm');
      expect(formatDistance(0.5)).toBe('0.50 mm');
    });
  });

  describe('calculateAngle', () => {
    it('should calculate angle between three points', () => {
      // 90 degree angle
      const arm1 = { x: 0, y: 1 };
      const vertex = { x: 0, y: 0 };
      const arm2 = { x: 1, y: 0 };
      expect(Math.round(calculateAngle(arm1, vertex, arm2))).toBe(90);
    });

    it('should calculate 180 degree angle', () => {
      const arm1 = { x: -1, y: 0 };
      const vertex = { x: 0, y: 0 };
      const arm2 = { x: 1, y: 0 };
      expect(Math.round(calculateAngle(arm1, vertex, arm2))).toBe(180);
    });

    it('should calculate 45 degree angle', () => {
      const arm1 = { x: 1, y: 1 };
      const vertex = { x: 0, y: 0 };
      const arm2 = { x: 1, y: 0 };
      expect(Math.round(calculateAngle(arm1, vertex, arm2))).toBe(45);
    });
  });

  describe('formatAngle', () => {
    it('should format angle correctly', () => {
      expect(formatAngle(90)).toBe('90.0°');
      expect(formatAngle(45.5)).toBe('45.5°');
    });
  });

  describe('calculateArea', () => {
    it('should calculate area of a square', () => {
      const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      expect(calculateArea(square)).toBe(100);
    });

    it('should calculate area of a triangle', () => {
      const triangle = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];
      expect(calculateArea(triangle)).toBe(50);
    });

    it('should return 0 for less than 3 points', () => {
      expect(calculateArea([{ x: 0, y: 0 }])).toBe(0);
      expect(calculateArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
    });
  });

  describe('areaMmSquared', () => {
    it('should calculate area in mm²', () => {
      const square = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const pixelSpacing = 0.1;
      expect(areaMmSquared(square, pixelSpacing)).toBe(100); // 10mm x 10mm = 100mm²
    });
  });

  describe('formatArea', () => {
    it('should format area in mm² for small areas', () => {
      expect(formatArea(50)).toBe('50.0 mm²');
    });

    it('should format area in cm² for large areas', () => {
      expect(formatArea(150)).toBe('1.50 cm²');
      expect(formatArea(1000)).toBe('10.00 cm²');
    });
  });

  describe('pointInPolygon', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    it('should return true for point inside polygon', () => {
      expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
      expect(pointInPolygon({ x: 1, y: 1 }, square)).toBe(true);
    });

    it('should return false for point outside polygon', () => {
      expect(pointInPolygon({ x: -1, y: 5 }, square)).toBe(false);
      expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    });
  });

  describe('midpoint', () => {
    it('should calculate midpoint correctly', () => {
      const mid = midpoint({ x: 0, y: 0 }, { x: 10, y: 10 });
      expect(mid).toEqual({ x: 5, y: 5 });
    });
  });

  describe('calculateCentroid', () => {
    it('should calculate centroid of polygon', () => {
      const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const centroid = calculateCentroid(square);
      expect(centroid).toEqual({ x: 5, y: 5 });
    });

    it('should return origin for empty array', () => {
      expect(calculateCentroid([])).toEqual({ x: 0, y: 0 });
    });
  });
});
