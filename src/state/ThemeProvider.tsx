import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  darkColors,
  lightColors,
  type ResolvedTheme,
  type ThemeColors,
  type ThemeMode,
} from '../theme';

const STORAGE_KEY = 'naodong.theme.v1';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<ResolvedTheme>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'system' || saved === 'dark' || saved === 'light') {
          setModeState(saved);
        }
      })
      .catch(() => undefined);

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => subscription.remove();
  }, []);

  const resolved: ResolvedTheme = mode === 'system' ? systemScheme : mode;
  const colors = resolved === 'dark' ? darkColors : lightColors;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = resolved;
    document.documentElement.style.backgroundColor = colors.ink;
    document.body.style.backgroundColor = colors.ink;
    document.body.style.margin = '0';
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', colors.bg);
  }, [colors, resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolved,
      colors,
      setMode: (next) => {
        setModeState(next);
        void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
      },
    }),
    [colors, mode, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return context;
}

/** 让模块级样式工厂随主题重新计算，避免 StyleSheet 缓存旧颜色。 */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors]);
}
