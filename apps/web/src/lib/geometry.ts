import { Point } from '@/types';

/**
 * Calculate Euclidean distance between two points in pixels
 */
export function distance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Calculate distance in millimeters
 * @param p1 - Start point
 * @param p2 - End point
 * @param pixelSpacing - mm per pixel (from DICOM metadata)
 */
export function distanceMm(p1: Point, p2: Point, pixelSpacing: number): number {
  return distance(p1, p2) * pixelSpacing;
}

/**
 * Format distance for display
 */
export function formatDistance(distanceMm: number): string {
  if (distanceMm >= 10) {
    return `${distanceMm.toFixed(1)} mm`;
  }
  return `${distanceMm.toFixed(2)} mm`;
}

/**
 * Calculate angle between three points (vertex in middle)
 * @param arm1End - End point of first arm
 * @param vertex - Vertex point (middle)
 * @param arm2End - End point of second arm
 * @returns Angle in degrees
 */
export function calculateAngle(arm1End: Point, vertex: Point, arm2End: Point): number {
  const v1 = { x: arm1End.x - vertex.x, y: arm1End.y - vertex.y };
  const v2 = { x: arm2End.x - vertex.x, y: arm2End.y - vertex.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;

  const radians = Math.atan2(Math.abs(cross), dot);
  return radians * (180 / Math.PI);
}

/**
 * Format angle for display
 */
export function formatAngle(degrees: number): string {
  return `${degrees.toFixed(1)}°`;
}

/**
 * Calculate Cobb angle for scoliosis measurement
 * @param line1Start - Start point of first line (superior endplate)
 * @param line1End - End point of first line
 * @param line2Start - Start point of second line (inferior endplate)
 * @param line2End - End point of second line
 * @returns Cobb angle in degrees
 */
export function calculateCobbAngle(
  line1Start: Point,
  line1End: Point,
  line2Start: Point,
  line2End: Point
): number {
  // Calculate direction vectors
  const v1 = { x: line1End.x - line1Start.x, y: line1End.y - line1Start.y };
  const v2 = { x: line2End.x - line2Start.x, y: line2End.y - line2Start.y };

  // Calculate angle between lines
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = dot / (mag1 * mag2);
  const clampedCos = Math.max(-1, Math.min(1, cosAngle));
  const radians = Math.acos(clampedCos);

  return radians * (180 / Math.PI);
}

/**
 * Calculate area of polygon using Shoelace formula
 * @param points - Array of polygon vertices
 * @returns Area in square pixels
 */
export function calculateArea(points: Point[]): number {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculate area in mm²
 */
export function areaMmSquared(points: Point[], pixelSpacing: number): number {
  return calculateArea(points) * pixelSpacing * pixelSpacing;
}

/**
 * Format area for display
 */
export function formatArea(areaMmSq: number): string {
  const areaCmSq = areaMmSq / 100;
  if (areaCmSq >= 1) {
    return `${areaCmSq.toFixed(2)} cm²`;
  }
  return `${areaMmSq.toFixed(1)} mm²`;
}

/**
 * Calculate distance from point to line segment
 */
export function pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  return distance(point, { x: xx, y: yy });
}

/**
 * Check if point is inside polygon (Ray casting algorithm)
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Calculate centroid of polygon
 */
export function calculateCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

/**
 * Calculate midpoint between two points
 */
export function midpoint(p1: Point, p2: Point): Point {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

/**
 * Rotate a point around a center point
 */
export function rotatePoint(point: Point, center: Point, angleDegrees: number): Point {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/**
 * Get bounding box of points
 */
export function getBoundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  
  return {
    minX: Math.min(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)),
    maxX: Math.max(...points.map(p => p.x)),
    maxY: Math.max(...points.map(p => p.y)),
  };
}

/**
 * Scale points relative to origin
 */
export function scalePoints(points: Point[], scale: number, origin: Point = { x: 0, y: 0 }): Point[] {
  return points.map(p => ({
    x: origin.x + (p.x - origin.x) * scale,
    y: origin.y + (p.y - origin.y) * scale,
  }));
}

/**
 * Translate points by offset
 */
export function translatePoints(points: Point[], offset: Point): Point[] {
  return points.map(p => ({
    x: p.x + offset.x,
    y: p.y + offset.y,
  }));
}
