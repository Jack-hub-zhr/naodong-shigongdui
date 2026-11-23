import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { CrewProvider, useCrew } from './src/state/CrewProvider';
import { ThemeProvider, useTheme, useThemedStyles } from './src/state/ThemeProvider';
import { RootTabs } from './src/navigation/RootTabs';
import { NoticeBanner } from './src/ui/NoticeBanner';
import { LogoMark } from './src/ui/Mark';
import { spacing, text, type ThemeColors } from './src/theme';
import { COPY } from './src/copy';

function BootScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.boot}>
      <LogoMark size={76} />
      <Text style={[text.title, styles.bootTitle]}>{COPY.brand.displayName}</Text>
      <Text style={[text.small, styles.bootSlogan]}>{COPY.brand.slogan}</Text>
      <ActivityIndicator color={colors.accentText} style={styles.bootSpinner} />
      <Text style={[text.micro, styles.bootLoading]}>{COPY.common.loading}</Text>
    </View>
  );
}

function Shell() {
  const { state } = useCrew();
  const { colors, resolved } = useTheme();
  const styles = useThemedStyles(createStyles);

  const navTheme = useMemo(() => {
    const base = resolved === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accentText,
        background: colors.bg,
        card: colors.surfaceRaised,
        text: colors.text,
        border: colors.line,
        notification: colors.yellow,
      },
    };
  }, [colors, resolved]);

  if (!state.hydrated) return <BootScreen />;

  return (
    <View style={styles.shell}>
      <NavigationContainer theme={navTheme} documentTitle={{ enabled: false }}>
        <RootTabs />
      </NavigationContainer>
      <NoticeBanner />
    </View>
  );
}

function ThemedApp() {
  const { resolved } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <View style={styles.root}>
        <View style={styles.frame}>
          <Shell />
        </View>
      </View>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <CrewProvider>
          <ThemedApp />
        </CrewProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.ink,
      alignItems: 'center',
    },
    frame: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.bg,
      overflow: 'hidden',
    },
    shell: { flex: 1 },
    boot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.xxl,
    },
    bootTitle: { color: colors.text, marginTop: spacing.xl },
    bootSlogan: { color: colors.muted, marginTop: spacing.sm, textAlign: 'center' },
    bootSpinner: { marginTop: spacing.xxxl },
    bootLoading: { color: colors.faint, marginTop: spacing.md, letterSpacing: 0.2 },
  });
