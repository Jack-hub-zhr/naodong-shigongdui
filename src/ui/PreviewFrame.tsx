import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { radius, type ThemeColors } from '../theme';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';

// 原生端用 WebView 预览成品；Web 端用 iframe（两者互不打包执行）
const NativeWebView: any =
  Platform.OS === 'web' ? null : require('react-native-webview').WebView;

/**
 * 预览运行在 sandbox iframe 里，没有 allow-same-origin，
 * 直接访问 localStorage / sessionStorage 会抛 SecurityError，
 * 导致成品脚本在执行到一半时中断（开始按钮点不动）。
 * 这里在文档最前面注入内存版存储，保证成品脚本能完整跑完。
 */
const STORAGE_SHIM = `<script>
(function () {
  function memoryStorage() {
    var data = Object.create(null);
    return {
      getItem: function (key) { key = String(key); return key in data ? data[key] : null; },
      setItem: function (key, value) { data[String(key)] = String(value); },
      removeItem: function (key) { delete data[String(key)]; },
      clear: function () { data = Object.create(null); },
      key: function (index) { var keys = Object.keys(data); return index >= 0 && index < keys.length ? keys[index] : null; },
      get length() { return Object.keys(data).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try {
      window[name].getItem('__nd_probe__');
    } catch (error) {
      try {
        Object.defineProperty(window, name, { configurable: true, value: memoryStorage() });
      } catch (ignored) {}
    }
  });
})();
</script>`;

function withPreviewShim(html: string): string {
  const shim = `${STORAGE_SHIM}`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => `${match}${shim}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (match) => `${match}${shim}`);
  return shim + html;
}

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
          srcDoc: withPreviewShim(html),
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
