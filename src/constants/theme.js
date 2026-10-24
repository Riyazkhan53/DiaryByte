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
  { key: 'personal', label: 'Personal', color: '#007AFF' },
  { key: 'work', label: 'Work', color: '#34C759' },
  { key: 'travel', label: 'Travel', color: '#FF9500' },
  { key: 'health', label: 'Health', color: '#FF3B30' },
  { key: 'ideas', label: 'Ideas', color: '#5856D6' },
];

// iOS-style glass palette. Screens sit on GlassBackground (a soft gradient
// with coloured glows), and surfaces are translucent so the glows tint them.
// `sheet` is near-opaque for modals, which sit over busy content.
export const LIGHT_THEME = {
  background: '#F2F2F7',
  backgroundGradient: ['#F7F5FF', '#EEF3FF', '#FBF1F8'],
  glows: ['rgba(10, 132, 255, 0.38)', 'rgba(175, 82, 222, 0.32)', 'rgba(52, 199, 89, 0.26)', 'rgba(255, 149, 0, 0.26)'],
  surface: 'rgba(255, 255, 255, 0.72)',
  surfaceAlt: 'rgba(118, 118, 128, 0.12)',
  sheet: 'rgba(255, 255, 255, 0.97)',
  glassSurface: 'rgba(255, 255, 255, 0.62)',
  glassSurfaceStrong: 'rgba(255, 255, 255, 0.82)',
  border: 'rgba(255, 255, 255, 0.95)',
  borderNeutral: 'rgba(60, 60, 67, 0.14)',
  text: '#1C1C1E',
  textSecondary: '#3A3A3C',
  textMuted: '#8A8A8E',
  primary: '#007AFF',
  primaryDark: '#0062CC',
  onPrimary: '#FFFFFF',
  secondary: '#5856D6',
  secondaryDark: '#4644B8',
  accent: '#0A8FD0',
  danger: '#FF3B30',
  shadow: 'rgba(31, 38, 135, 0.12)',
  statusBar: 'dark',
};

export const DARK_THEME = {
  background: '#000000',
  backgroundGradient: ['#04050C', '#090A14', '#0D0716'],
  glows: ['rgba(10, 132, 255, 0.48)', 'rgba(191, 90, 242, 0.40)', 'rgba(48, 209, 88, 0.22)', 'rgba(255, 55, 95, 0.28)'],
  surface: 'rgba(44, 44, 50, 0.58)',
  surfaceAlt: 'rgba(118, 118, 128, 0.24)',
  sheet: 'rgba(28, 28, 30, 0.98)',
  glassSurface: 'rgba(255, 255, 255, 0.07)',
  glassSurfaceStrong: 'rgba(255, 255, 255, 0.12)',
  border: 'rgba(255, 255, 255, 0.13)',
  borderNeutral: 'rgba(84, 84, 88, 0.6)',
  text: '#FFFFFF',
  textSecondary: '#D1D1D6',
  textMuted: '#8E8E93',
  primary: '#0A84FF',
  primaryDark: '#409CFF',
  onPrimary: '#FFFFFF',
  secondary: '#5E5CE6',
  secondaryDark: '#7D7AFF',
  accent: '#0A9FE0',
  danger: '#FF453A',
  shadow: 'rgba(0, 0, 0, 0.5)',
  statusBar: 'light',
};
