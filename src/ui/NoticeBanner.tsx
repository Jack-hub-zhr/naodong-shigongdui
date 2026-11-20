import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, text, type ThemeColors } from '../theme';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';
import { useCrew } from '../state/CrewProvider';
import { useResponsiveLayout } from './primitives';

export function NoticeBanner() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { store, state } = useCrew();
  const { contentMaxWidth } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const notice = state.notice;

  useEffect(() => {
    if (notice) {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [notice?.id]);

  if (!notice) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + 8,
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }),
            },
          ],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={notice.text}
        onPress={() => store.dismissNotice()}
        style={({ pressed }) => [
          styles.banner,
          { maxWidth: contentMaxWidth },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.mark} />
        <Text style={[text.small, styles.text]} numberOfLines={3}>
          {notice.text}
        </Text>
        <Text style={[text.micro, { color: colors.faint, marginLeft: 6 }]}>关闭</Text>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      zIndex: 200,
    },
    banner: {
      width: '100%',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 60,
      backgroundColor: colors.surfaceRaised,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      shadowColor: colors.black,
      shadowOpacity: 0.14,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    pressed: { opacity: 0.78 },
    mark: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.yellow,
    },
    text: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 20 },
  });
