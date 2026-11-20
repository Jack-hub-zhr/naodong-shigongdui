import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { radius, type ThemeColors } from '../theme';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';

// 原生端用 WebView 预览成品；Web 端用 iframe（两者互不打包执行）
const NativeWebView: any =
  Platform.OS === 'web' ? null : require('react-native-webview').WebView;

export function PreviewFrame({
  html,
  height = 360,
}: {
  html: string;
  height?: number;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.wrap, { height }]}>
        {React.createElement('iframe' as any, {
          srcDoc: html,
          title: '成品预览',
          sandbox: 'allow-scripts allow-forms allow-modals allow-popups',
          style: {
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.lg,
          },
        })}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <NativeWebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled
        setSupportMultipleWindows={false}
        showsVerticalScrollIndicator={false}
        allowsInlineMediaPlayback
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSunken,
    },
    webview: { flex: 1, backgroundColor: colors.surfaceSunken },
  });
