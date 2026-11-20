import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { radius, shadow, spacing, text, type ThemeColors } from '../theme';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';
import { BRAND } from '../brand';
import { COPY, STATUS_STEP_LABEL } from '../copy';
import type { CrewRole, ProjectStatus, Tag } from '../types';
import { LogoMark } from './Mark';

function useUi() {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  return { ...theme, styles };
}

export function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  return { width, isDesktop, contentMaxWidth: isDesktop ? 1120 : 680 };
}

export function ScreenShell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { styles } = useUi();
  return (
    <SafeAreaView style={[styles.safe, style]} edges={['top', 'left', 'right']}>
      {children}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const { styles } = useUi();
  const { contentMaxWidth } = useResponsiveLayout();
  return (
    <View style={[styles.header, { maxWidth: contentMaxWidth }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[text.small, styles.eyebrow]}>{eyebrow}</Text>
          <Text style={[text.display, styles.headerTitle]}>{title}</Text>
        </View>
        {right ?? <LogoMark size={40} ring={false} />}
      </View>
      {subtitle ? <Text style={[text.body, styles.headerSub]}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({
  children,
  style,
  raised,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  raised?: boolean;
}) {
  const { styles } = useUi();
  return <View style={[styles.card, raised && styles.cardRaised, style]}>{children}</View>;
}

export function HazardBar({ height = 4 }: { height?: number }) {
  const { colors } = useUi();
  return (
    <View style={{ height, borderRadius: height / 2, overflow: 'hidden', opacity: 0.9 }}>
      <Svg width="100%" height={height}>
        <Defs>
          <Pattern id="hazard" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <Rect width="12" height="18" fill={colors.yellow} />
            <Rect x="12" width="6" height="18" fill={colors.onYellow} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#hazard)" />
      </Svg>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { styles } = useUi();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryBtn,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[text.bodyStrong, styles.primaryLabel]}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  active,
  danger,
  small,
  style,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  active?: boolean;
  danger?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { colors, styles } = useUi();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghostBtn,
        small && styles.ghostSmall,
        active && styles.ghostActive,
        danger && styles.ghostDanger,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          text.bodyStrong,
          { color: danger ? colors.danger : active ? colors.accentText : colors.textSoft },
          small && { fontSize: 13 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Pill({
  label,
  color,
  active,
  onPress,
}: {
  label: string;
  color?: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { colors, styles } = useUi();
  const tone = color ?? colors.muted;
  const content = (
    <View
      style={[
        styles.pill,
        { borderColor: active ? `${tone}55` : 'transparent' },
        { backgroundColor: active ? `${tone}18` : colors.surfaceSunken },
      ]}
    >
      <Text style={[text.small, { color: active ? tone : colors.muted, fontWeight: '500' }]}>{label}</Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.65 }]}>
      {content}
    </Pressable>
  );
}

export function TagPill({ tag, active, onPress }: { tag: Tag; active?: boolean; onPress?: () => void }) {
  const { colors } = useUi();
  const tagColors: Record<Tag, string> = {
    工具: colors.info,
    小游戏: colors.orange,
    页面: colors.purple,
    自动化: colors.success,
    其他: colors.muted,
  };
  return <Pill label={tag} color={tagColors[tag]} active={active} onPress={onPress} />;
}

export function RoleChip({ role }: { role: CrewRole }) {
  const { colors, styles } = useUi();
  const roleColor: Record<CrewRole, string> = {
    ORCHESTRATOR: colors.accentText,
    PRODUCT: colors.info,
    BUILDER: colors.orange,
    REVIEWER: colors.purple,
    USER: colors.success,
    SYSTEM: colors.muted,
  };
  const color = roleColor[role];
  return (
    <View style={styles.roleChip}>
      <View style={[styles.roleDot, { backgroundColor: color }]} />
      <Text style={[text.micro, { color: colors.muted, fontSize: 10 }]}>{BRAND.roleNames[role]}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const { colors, styles } = useUi();
  const statusColors: Record<ProjectStatus, string> = {
    PENDING: colors.muted,
    BUILDING: colors.accentText,
    REVIEWING: colors.purple,
    AWAITING_USER: colors.info,
    REWORKING: colors.orange,
    DELIVERED: colors.success,
    PAUSED: colors.danger,
  };
  const color = statusColors[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: `${color}14` }]}>
      <View style={[styles.roleDot, { backgroundColor: color }]} />
      <Text style={[text.micro, { color }]}>{COPY.status[status]}</Text>
    </View>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const { colors, styles } = useUi();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${clamped * 100}%`, backgroundColor: color ?? colors.yellow }]} />
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  const { styles } = useUi();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.toggleTrack, value && styles.toggleTrackOn, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const { colors, styles } = useUi();
  return (
    <View style={styles.segmented} accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[text.small, { color: selected ? colors.text : colors.muted, fontWeight: selected ? '600' : '400' }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StatusStepper({ status }: { status: ProjectStatus }) {
  const { colors, styles } = useUi();
  const steps = ['PENDING', 'BUILDING', 'REVIEWING', 'AWAITING_USER', 'REWORKING', 'DELIVERED'] as const;
  const current = steps.indexOf(status as (typeof steps)[number]);
  return (
    <View style={styles.stepper}>
      {steps.map((step, index) => {
        const reached = current >= 0 && index <= current;
        const isCurrent = status === step;
        const color = status === 'PAUSED' ? colors.danger : isCurrent ? colors.yellow : reached ? colors.yellowDim : colors.lineStrong;
        return (
          <View key={step} style={styles.stepItem}>
            <View style={styles.stepLineWrap}>
              {index > 0 ? (
                <View style={[styles.stepLine, { backgroundColor: index <= current ? colors.yellowDim : colors.line }]} />
              ) : null}
              <View style={[styles.stepDot, { borderColor: color }, (reached || isCurrent) && { backgroundColor: color }]} />
            </View>
            <Text style={[text.micro, { fontSize: 9, color: isCurrent ? colors.accentText : reached ? colors.textSoft : colors.faint }]}>
              {STATUS_STEP_LABEL[step]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { styles } = useUi();
  return <Text style={[text.small, styles.sectionLabel]}>{children}</Text>;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const { colors, styles } = useUi();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyMark}>
        <LogoMark size={40} ring={false} />
      </View>
      <Text style={[text.title, { color: colors.text, textAlign: 'center', fontSize: 22 }]}>{title}</Text>
      <Text style={[text.body, { color: colors.muted, textAlign: 'center', marginTop: spacing.sm, maxWidth: 320 }]}>{body}</Text>
      {action ? <View style={{ marginTop: spacing.xl, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Divider() {
  const { styles } = useUi();
  return <View style={styles.divider} />;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    eyebrow: { color: colors.muted, marginBottom: 2 },
    headerTitle: { color: colors.text },
    headerSub: { color: colors.muted, marginTop: spacing.md, maxWidth: 430, fontSize: 15, lineHeight: 22 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 0.5,
      borderColor: colors.line,
      borderRadius: radius.lg,
      padding: spacing.xl,
      ...shadow.card,
    },
    cardRaised: { backgroundColor: colors.surfaceRaised },
    primaryBtn: {
      backgroundColor: colors.yellow,
      borderRadius: radius.md,
      minHeight: 50,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    primaryLabel: { color: colors.onYellow, fontSize: 16, fontWeight: '600' },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    disabled: { opacity: 0.35 },
    ghostBtn: {
      borderRadius: radius.md,
      minHeight: 46,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSunken,
    },
    ghostSmall: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm },
    ghostActive: { backgroundColor: colors.yellowWash },
    ghostDanger: { backgroundColor: colors.dangerWash },
    pill: {
      borderWidth: 0.5,
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    roleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSunken,
      paddingHorizontal: 9,
      paddingVertical: 4,
      alignSelf: 'flex-start',
    },
    roleDot: { width: 6, height: 6, borderRadius: 3 },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignSelf: 'flex-start',
    },
    progressTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceSunken,
      overflow: 'hidden',
    },
    progressFill: { height: 4, borderRadius: 2 },
    toggleTrack: {
      width: 51,
      height: 31,
      borderRadius: 16,
      backgroundColor: colors.lineStrong,
      padding: 2,
      justifyContent: 'center',
    },
    toggleTrackOn: { backgroundColor: colors.yellow },
    toggleKnob: {
      width: 27,
      height: 27,
      borderRadius: 14,
      backgroundColor: colors.white,
      ...shadow.card,
    },
    toggleKnobOn: { alignSelf: 'flex-end' },
    segmented: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceSunken,
      borderRadius: radius.md,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1,
      minHeight: 38,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentSelected: {
      backgroundColor: colors.surfaceRaised,
      ...shadow.card,
    },
    stepper: { flexDirection: 'row', marginTop: spacing.md },
    stepItem: { flex: 1, alignItems: 'center', gap: 5 },
    stepLineWrap: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
    stepLine: { position: 'absolute', left: '-50%', right: '50%', height: 1 },
    stepDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, backgroundColor: colors.bg },
    sectionLabel: { color: colors.muted, fontWeight: '600', marginBottom: spacing.sm },
    empty: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      paddingVertical: spacing.huge,
      paddingHorizontal: spacing.xxl,
      alignItems: 'center',
    },
    emptyMark: {
      width: 68,
      height: 68,
      borderRadius: 22,
      backgroundColor: colors.yellowWash,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xl,
    },
    divider: { height: 0.5, backgroundColor: colors.line, marginVertical: spacing.md },
  });
