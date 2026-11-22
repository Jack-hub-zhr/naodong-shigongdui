import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { radius, type ThemeColors } from '../theme';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';

const MIN_FRAME_HEIGHT = 280;
const MAX_FRAME_HEIGHT = 820;

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
      } catch (ignored) {
        try {
          Object.defineProperty(Window.prototype, name, { configurable: true, get: function () { return memoryStorage(); } });
        } catch (ignoredToo) {}
      }
    }
  });

  // 把内容真实高度告诉外层，避免开始按钮被压在预览框可视区域之外
  function reportHeight() {
    try {
      var body = document.body;
      var root = document.documentElement;
      if (!body) return;
      // 暂时取消 100% / flex 拉伸，量到内容本身的高度，避免随预览框无限增高
      var saved = {
        rootMin: root.style.minHeight,
        bodyMin: body.style.minHeight,
        bodyHeight: body.style.height,
        bodyDisplay: body.style.display
      };
      root.style.minHeight = '0';
      body.style.minHeight = '0';
      body.style.height = 'auto';
      body.style.display = 'block';
      var height = Math.ceil(body.scrollHeight);
      root.style.minHeight = saved.rootMin;
      body.style.minHeight = saved.bodyMin;
      body.style.height = saved.bodyHeight;
      body.style.display = saved.bodyDisplay;
      if (height > 0) window.parent.postMessage({ type: '__nd_frame_height', height: height }, '*');
    } catch (error) {}
  }
  reportHeight();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reportHeight);
  } else {
    setTimeout(reportHeight, 0);
  }
  window.addEventListener('load', reportHeight);
  try {
    if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(document.documentElement);
  } catch (error) {}
  setTimeout(reportHeight, 400);
  setTimeout(reportHeight, 1200);
  setTimeout(reportHeight, 2600);
  document.addEventListener('click', function () { setTimeout(reportHeight, 120); }, true);
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
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [frameHeight, setFrameHeight] = useState(height);

  useEffect(() => {
    setFrameHeight(height);
  }, [html, height]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const onMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const payload = event.data as { type?: string; height?: number } | null;
      if (!payload || payload.type !== '__nd_frame_height') return;
      const next = Number(payload.height);
      if (!Number.isFinite(next) || next <= 0) return;
      setFrameHeight(Math.min(Math.max(Math.round(next), MIN_FRAME_HEIGHT), MAX_FRAME_HEIGHT));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.wrap, { height: frameHeight }]}>
        {React.createElement('iframe' as any, {
          ref: frameRef,
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
