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
  /** 卡片顶部高光描边 */
  sheen: string;
  /** 阴影基色 */
  shadowColor: string;
  shadowOpacity: number;
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
  sheen: 'rgba(255, 255, 255, 0.9)',
  shadowColor: '#0B1220',
  shadowOpacity: 0.1,
};

export const darkColors: ThemeColors = {
  ink: '#03050B',
  bg: '#060A14',
  surface: '#0A111E',
  surfaceRaised: '#0E1727',
  surfaceSunken: '#080E1A',
  line: 'rgba(124, 160, 255, 0.14)',
  lineStrong: 'rgba(124, 160, 255, 0.26)',
  yellow: '#FFC53D',
  yellowBright: '#FFD873',
  yellowDim: '#C99A16',
  yellowWash: 'rgba(255, 197, 61, 0.14)',
  yellowWashStrong: 'rgba(255, 197, 61, 0.26)',
  onYellow: '#14100A',
  accentText: '#FFD873',
  text: '#EAF0FF',
  textSoft: '#C6D2E8',
  muted: '#93A2BD',
  faint: '#64748B',
  danger: '#FF6B7A',
  dangerWash: 'rgba(255, 107, 122, 0.12)',
  success: '#4ADE9B',
  successWash: 'rgba(74, 222, 155, 0.12)',
  info: '#4DA3FF',
  purple: '#A78BFA',
  orange: '#FFA53D',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(2, 5, 12, 0.72)',
  sheen: 'rgba(148, 184, 255, 0.20)',
  shadowColor: '#000000',
  shadowOpacity: 0.55,
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

type ShadowLevel = 'card' | 'raised' | 'floating' | 'glow';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 随主题变化的层叠阴影：深色下更重，亮色下更柔。 */
export function elevation(colors: ThemeColors, level: ShadowLevel = 'card') {
  const scale: Record<ShadowLevel, { y: number; blur: number; opacity: number }> = {
    card: { y: 10, blur: 30, opacity: 1 },
    raised: { y: 16, blur: 44, opacity: 1.3 },
    floating: { y: 22, blur: 56, opacity: 1.6 },
    glow: { y: 10, blur: 30, opacity: 1 },
  };
  const spec = scale[level];
  const color = level === 'glow' ? colors.yellow : colors.shadowColor;
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: spec.y },
      shadowOpacity: Math.min(0.9, colors.shadowOpacity * spec.opacity),
      shadowRadius: spec.blur / 2,
    },
    android: { elevation: level === 'card' ? 3 : level === 'raised' ? 6 : 9 },
    default: {
      boxShadow: `0 ${spec.y}px ${spec.blur}px ${hexToRgba(
        color,
        Math.min(0.9, colors.shadowOpacity * spec.opacity),
      )}, inset 0 1px 0 ${colors.sheen}`,
    },
  }) as Record<string, unknown>;
}

/** Web 过渡：容器属性变化时自动补间，原生端忽略。 */
export function webTransition(properties: string, duration = 200): Record<string, unknown> {
  if (Platform.OS !== 'web') return {};
  return {
    transitionProperty: properties,
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
  };
}

/** Web 悬停提升，原生端不生效。 */
export function webHover(style: Record<string, unknown>): Record<string, unknown> {
  return Platform.OS === 'web' ? style : {};
}
