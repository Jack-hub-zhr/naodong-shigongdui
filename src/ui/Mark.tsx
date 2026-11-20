import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { ThemeColors } from '../theme';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';

const ICON = require('../../assets/icon.png');

export function LogoMark({ size = 40, ring = true }: { size?: number; ring?: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View
      style={[
        styles.logoWrap,
        { width: size, height: size, borderRadius: size * 0.28 },
        ring && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
      ]}
    >
      <Image source={ICON} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}

export type TabIconName = 'brainstorm' | 'construction' | 'review' | 'profile';

export function TabIcon({
  name,
  color,
  size = 24,
}: {
  name: TabIconName;
  color: string;
  size?: number;
}) {
  const stroke = color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'brainstorm' && (
        <>
          <Path
            d="M12 3.4a5.1 5.1 0 0 1 3.1 9.1c-.6.5-1 1.2-1 2H9.9c0-.8-.4-1.5-1-2A5.1 5.1 0 0 1 12 3.4Z"
            stroke={stroke}
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
          <Path d="M9.8 17.6h4.4M10.4 20.4h3.2" stroke={stroke} strokeWidth={1.7} strokeLinecap="round" />
          <Path d="M12 7.2 10.6 10h2.1l-1.1 2.9" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {name === 'construction' && (
        <>
          <Path
            d="M5.2 14.7c0-3.6 2.9-6.1 6.8-6.1s6.8 2.5 6.8 6.1"
            stroke={stroke}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
          <Path d="M3.2 15.6h17.6" stroke={stroke} strokeWidth={1.9} strokeLinecap="round" />
          <Path d="M12 4.2v4.4" stroke={stroke} strokeWidth={1.7} strokeLinecap="round" />
        </>
      )}
      {name === 'review' && (
        <>
          <Rect x="4.2" y="3.4" width="15.6" height="17.2" rx="3" stroke={stroke} strokeWidth={1.7} />
          <Path d="M8.4 12.1l2.4 2.4 4.8-5.1" stroke={stroke} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {name === 'profile' && (
        <>
          <Circle cx="12" cy="8.2" r="3.5" stroke={stroke} strokeWidth={1.7} />
          <Path d="M4.8 20.2c.5-3.4 3.4-5.6 7.2-5.6s6.7 2.2 7.2 5.6" stroke={stroke} strokeWidth={1.7} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    logoWrap: {
      overflow: 'hidden',
      backgroundColor: colors.surfaceSunken,
    },
  });
