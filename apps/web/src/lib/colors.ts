/**
 * Color mapping for VinDR-CXR pathology classes
 * Based on severity and visual distinction
 */

// VinDR-CXR 22 classes with distinct colors
export const PATHOLOGY_COLORS: Record<string, string> = {
  // Critical findings - Red tones
  'Aortic enlargement': '#DC2626',
  'Cardiomegaly': '#EF4444',
  'Nodule/Mass': '#B91C1C',
  'Lung tumor': '#991B1B',
  
  // Lung parenchyma - Orange/Yellow tones
  'Pulmonary fibrosis': '#EA580C',
  'Pleural thickening': '#F97316',
  'Lung Opacity': '#FBBF24',
  'Consolidation': '#F59E0B',
  'Infiltration': '#D97706',
  
  // Pleural - Blue tones
  'Pleural effusion': '#0EA5E9',
  'Pneumothorax': '#0284C7',
  
  // Structural - Green tones
  'Atelectasis': '#22C55E',
  'Emphysema': '#16A34A',
  'COPD': '#15803D',
  'Lung cavity': '#14532D',
  
  // Calcification/ILD - Purple tones
  'Calcification': '#8B5CF6',
  'ILD': '#7C3AED',
  'Tuberculosis': '#6D28D9',
  
  // Other - Pink/Gray tones
  'Other lesion': '#EC4899',
  'Edema': '#DB2777',
  'Enlarged PA': '#BE185D',
  
  // Fractures - Distinct colors
  'Rib fracture': '#F43F5E',
  'Clavicle fracture': '#FB7185',
  
  // Normal
  'No finding': '#10B981',
};

/**
 * Get color for a pathology class
 * @param className - The pathology class name
 * @returns Hex color string
 */
export function getPathologyColor(className: string): string {
  return PATHOLOGY_COLORS[className] || '#6366F1'; // Default indigo
}

/**
 * Alias for getPathologyColor - used for bounding box colors in detection overlay
 * @param className - The pathology class name
 * @returns Hex color string
 */
export function getBboxColor(className: string): string {
  return getPathologyColor(className);
}

/**
 * Get contrasting text color (white or black) for a background color
 * @param hexColor - Hex color string
 * @returns 'white' or 'black'
 */
export function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Annotation tool colors
 */
export const ANNOTATION_COLORS = {
  freehand: '#FF6B6B',
  arrow: '#FFA500',
  ellipse: '#9B59B6',
  rectangle: '#3498DB',
  text: '#2ECC71',
  marker: '#E74C3C',
};

/**
 * Measurement tool colors
 */
export const MEASUREMENT_COLORS = {
  distance: '#FFEB3B',
  angle: '#00BCD4',
  area: '#4CAF50',
  cobb_angle: '#FF9800',
};

/**
 * Severity colors for findings
 */
export const SEVERITY_COLORS = {
  normal: '#10B981',    // Green
  mild: '#FBBF24',      // Yellow
  moderate: '#F97316',  // Orange
  severe: '#EF4444',    // Red
  critical: '#DC2626',  // Dark Red
};

/**
 * Get severity color
 */
export function getSeverityColor(severity: string): string {
  return SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.normal;
}

/**
 * Generate a random color for new annotations
 */
export function generateRandomColor(): string {
  const colors = [
    '#FF6B6B', '#FFA500', '#9B59B6', '#3498DB', '#2ECC71',
    '#E74C3C', '#1ABC9C', '#F39C12', '#8E44AD', '#16A085',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Adjust color opacity
 * @param hexColor - Hex color string
 * @param opacity - Opacity value (0-1)
 * @returns RGBA string
 */
export function colorWithOpacity(hexColor: string, opacity: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Lighten a color
 * @param hexColor - Hex color string
 * @param percent - Percentage to lighten (0-100)
 */
export function lightenColor(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  const newR = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
  const newG = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
  const newB = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Darken a color
 * @param hexColor - Hex color string
 * @param percent - Percentage to darken (0-100)
 */
export function darkenColor(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  const newR = Math.max(0, Math.round(r * (1 - percent / 100)));
  const newG = Math.max(0, Math.round(g * (1 - percent / 100)));
  const newB = Math.max(0, Math.round(b * (1 - percent / 100)));
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}
