import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, type ThemeColors } from '../theme';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';
import type { LogEntry } from '../types';
import { RoleChip } from './primitives';

export function formatClock(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function LogRow({
  entry,
  onDecisionPress,
  isPendingDecision,
}: {
  entry: LogEntry;
  onDecisionPress?: (entry: LogEntry) => void;
  isPendingDecision?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const toneColor = {
    INFO: colors.lineStrong,
    PASS: colors.success,
    FAIL: colors.danger,
    DECISION: colors.yellow,
    HANDOFF: colors.info,
  }[entry.tone];
  const clickable = Boolean(entry.rollbackable && entry.decisionId && onDecisionPress);

  return (
    <View style={styles.row}>
      <View style={styles.timeCol}>
        <Text style={styles.time}>{formatClock(entry.at)}</Text>
      </View>
      <View style={styles.railCol}>
        <View style={styles.rail} />
        <View
          style={[
            styles.dot,
            { backgroundColor: toneColor, opacity: entry.tone === 'INFO' ? 0.65 : 1 },
          ]}
        />
      </View>
      <View style={styles.content}>
        <View style={styles.headRow}>
          <RoleChip role={entry.role} />
          {entry.tone === 'FAIL' ? <Text style={[styles.toneTag, styles.toneTagFail]}>未通过</Text> : null}
          {entry.tone === 'PASS' ? <Text style={[styles.toneTag, styles.toneTagPass]}>通过</Text> : null}
          {entry.tone === 'DECISION' && isPendingDecision ? (
            <Text style={[styles.toneTag, styles.toneTagWait]}>待你拍板</Text>
          ) : null}
        </View>
        <Text
          style={[
            styles.logText,
            entry.tone === 'FAIL' && { color: colors.danger },
            entry.tone === 'PASS' && { color: colors.textSoft },
          ]}
        >
          {entry.text}
        </Text>
        {entry.decisionMarker ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`决策点 ${entry.decisionMarker}，可回退`}
            onPress={() => onDecisionPress?.(entry)}
            disabled={!clickable}
            style={({ pressed }) => [
              styles.decisionTag,
              pressed && clickable && { opacity: 0.7 },
            ]}
          >
            <View style={styles.decisionDot} />
            <Text style={styles.decisionText}>决策点 {entry.decisionMarker}</Text>
            {clickable ? <Text style={styles.decisionAction}>回退</Text> : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', paddingVertical: spacing.md },
    timeCol: { width: 54, paddingTop: 1 },
    time: { fontFamily: fonts.mono, fontSize: 10.5, lineHeight: 16, color: colors.faint },
    railCol: { width: 18, alignItems: 'center' },
    rail: {
      position: 'absolute',
      top: 15,
      bottom: -spacing.md,
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.line,
    },
    dot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      marginTop: 4,
      borderWidth: 2,
      borderColor: colors.surfaceSunken,
    },
    content: { flex: 1, paddingLeft: spacing.xs, paddingBottom: spacing.xs },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' },
    logText: { color: colors.textSoft, fontSize: 14, lineHeight: 22 },
    toneTag: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '600',
      borderRadius: radius.pill,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    toneTagFail: { color: colors.danger, backgroundColor: colors.dangerWash },
    toneTagPass: { color: colors.success, backgroundColor: colors.successWash },
    toneTagWait: { color: colors.accentText, backgroundColor: colors.yellowWash },
    decisionTag: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.yellowWashStrong,
      backgroundColor: colors.yellowWash,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    decisionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.yellow },
    decisionText: { fontSize: 11, color: colors.accentText, fontWeight: '600' },
    decisionAction: { fontSize: 11, color: colors.accentText, marginLeft: spacing.xs },
  });
