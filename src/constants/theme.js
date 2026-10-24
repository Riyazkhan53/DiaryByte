export const MOODS = [
  { emoji: '😊', label: 'Happy' },
  { emoji: '😌', label: 'Calm' },
  { emoji: '🤩', label: 'Excited' },
  { emoji: '😔', label: 'Sad' },
  { emoji: '😤', label: 'Frustrated' },
  { emoji: '😴', label: 'Tired' },
  { emoji: '🤔', label: 'Thoughtful' },
  { emoji: '❤️', label: 'Loved' },
];

export const CATEGORIES = [
  { key: 'personal', label: 'Personal', color: '#90CAF9' },
  { key: 'work', label: 'Work', color: '#A5D6A7' },
  { key: 'travel', label: 'Travel', color: '#FFCC80' },
  { key: 'health', label: 'Health', color: '#EF9A9A' },
  { key: 'ideas', label: 'Ideas', color: '#B39DDB' },
];

// Glass-morphism palette. Surfaces are translucent so the gradient background
// shows through; borders are subtle and light.
export const LIGHT_THEME = {
  background: '#F0F4F8',
  backgroundGradient: ['#E8F5E9', '#E1F5FE', '#F3E5F5'],
  surface: 'rgba(255, 255, 255, 0.72)',
  surfaceAlt: 'rgba(255, 255, 255, 0.52)',
  glassSurface: 'rgba(255, 255, 255, 0.35)',
  glassSurfaceStrong: 'rgba(255, 255, 255, 0.55)',
  border: 'rgba(255, 255, 255, 0.85)',
  borderNeutral: 'rgba(207, 216, 220, 0.6)',
  text: '#2C3E50',
  textSecondary: '#5D6D7E',
  textMuted: '#78909C',
  primary: '#66BB6A',
  primaryDark: '#43A047',
  secondary: '#9575CD',
  secondaryDark: '#7E57C2',
  accent: '#29B6F6',
  danger: '#EF5350',
  headerGradient: ['rgba(197, 225, 199, 0.85)', 'rgba(179, 229, 252, 0.85)', 'rgba(225, 190, 231, 0.85)'],
  shadow: 'rgba(123, 104, 238, 0.18)',
  statusBar: 'dark',
};

export const DARK_THEME = {
  background: '#0B0F19',
  backgroundGradient: ['#0D1B1E', '#0A1520', '#120A1C'],
  surface: 'rgba(30, 41, 59, 0.72)',
  surfaceAlt: 'rgba(30, 41, 59, 0.52)',
  glassSurface: 'rgba(255, 255, 255, 0.08)',
  glassSurfaceStrong: 'rgba(255, 255, 255, 0.14)',
  border: 'rgba(255, 255, 255, 0.12)',
  borderNeutral: 'rgba(74, 85, 104, 0.6)',
  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  primary: '#66BB6A',
  primaryDark: '#4CAF50',
  secondary: '#9575CD',
  secondaryDark: '#7E57C2',
  accent: '#4FC3F7',
  danger: '#E57373',
  headerGradient: ['rgba(27, 94, 32, 0.75)', 'rgba(1, 87, 155, 0.75)', 'rgba(74, 20, 140, 0.75)'],
  shadow: 'rgba(0, 0, 0, 0.45)',
  statusBar: 'light',
};
