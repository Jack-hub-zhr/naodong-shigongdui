import { Platform } from 'react-native';

export type ThemeMode = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

/**
 * Apple 风格的双色主题。
 * 施工黄只用于品牌与关键动作，中性色承担大部分界面层级。
 */
export interface ThemeColors {
  ink: string;
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  line: string;
  lineStrong: string;
  yellow: string;
  yellowBright: string;
  yellowDim: string;
  yellowWash: string;
  yellowWashStrong: string;
  onYellow: string;
  accentText: string;
  text: string;
  textSoft: string;
  muted: string;
  faint: string;
  danger: string;
  dangerWash: string;
  success: string;
  successWash: string;
  info: string;
  purple: string;
  orange: string;
  white: string;
  black: string;
  overlay: string;
}

export const lightColors: ThemeColors = {
  ink: '#E9E9EE',
  bg: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EFEFF2',
  line: 'rgba(29, 29, 31, 0.10)',
  lineStrong: 'rgba(29, 29, 31, 0.18)',
  yellow: '#FFB800',
  yellowBright: '#FFD35C',
  yellowDim: '#B47A00',
  yellowWash: 'rgba(255, 184, 0, 0.12)',
  yellowWashStrong: 'rgba(255, 184, 0, 0.20)',
  onYellow: '#1D1D1F',
  accentText: '#8F5E00',
  text: '#1D1D1F',
  textSoft: '#48484A',
  muted: '#6E6E73',
  faint: '#8E8E93',
  danger: '#D70015',
  dangerWash: 'rgba(215, 0, 21, 0.08)',
  success: '#248A3D',
  successWash: 'rgba(36, 138, 61, 0.09)',
  info: '#007AFF',
  purple: '#8944AB',
  orange: '#C25000',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.24)',
};

export const darkColors: ThemeColors = {
  ink: '#000000',
  bg: '#0A0A0C',
  surface: '#161618',
  surfaceRaised: '#1C1C1E',
  surfaceSunken: '#101012',
  line: 'rgba(255, 255, 255, 0.10)',
  lineStrong: 'rgba(255, 255, 255, 0.18)',
  yellow: '#FFB800',
  yellowBright: '#FFD35C',
  yellowDim: '#D8A000',
  yellowWash: 'rgba(255, 184, 0, 0.14)',
  yellowWashStrong: 'rgba(255, 184, 0, 0.24)',
  onYellow: '#1D1D1F',
  accentText: '#FFD35C',
  text: '#F5F5F7',
  textSoft: '#D1D1D6',
  muted: '#98989D',
  faint: '#6E6E73',
  danger: '#FF6961',
  dangerWash: 'rgba(255, 105, 97, 0.12)',
  success: '#63D98B',
  successWash: 'rgba(99, 217, 139, 0.12)',
  info: '#64D2FF',
  purple: '#BF5AF2',
  orange: '#FF9F0A',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.64)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

export const fonts = {
  ui: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  }),
  uiBold: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
  }),
} as const;

export const text = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const, letterSpacing: -0.7 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.4 },
  h2: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 19, fontWeight: '400' as const },
  micro: { fontSize: 11, lineHeight: 16, fontWeight: '500' as const },
  mono: { fontSize: 12, lineHeight: 19, fontFamily: fonts.mono },
} as const;

export const shadow = {
  card: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 24,
    },
    android: { elevation: 2 },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 24,
    },
  }),
} as const;
