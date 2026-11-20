import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, text, type ThemeColors } from '../theme';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';
import type { DecisionPoint } from '../types';
import { COPY } from '../copy';
import { Card, GhostButton, PrimaryButton, useResponsiveLayout } from './primitives';

export function DecisionCard({
  decision,
  onChoose,
  onRetry,
}: {
  decision: DecisionPoint;
  onChoose: (choice: 'A' | 'B') => void;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { isDesktop } = useResponsiveLayout();
  const resolved = decision.status === 'RESOLVED';
  return (
    <Card raised style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.eyebrowWrap}>
          <View style={styles.pulse} />
          <Text style={[text.micro, styles.eyebrow]}>{COPY.review.decisionEyebrow(decision.index)}</Text>
        </View>
        {decision.attempts > 0 ? (
          <Text style={[text.micro, { color: colors.orange }]}>
            {COPY.review.retryNote(decision.attempts)}
          </Text>
        ) : null}
      </View>

      <Text style={[text.h2, styles.title]}>{decision.title}</Text>
      <Text style={[text.small, styles.context]}>{decision.context}</Text>

      <View style={[styles.options, isDesktop && styles.optionsDesktop]}>
        {[decision.optionA, decision.optionB].map((option) => {
          const picked = resolved && decision.chosen === option.key;
          const dimmed = resolved && decision.chosen !== option.key;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityLabel={`${COPY.review[option.key]} ${option.label}`}
              onPress={() => onChoose(option.key)}
              style={({ pressed }) => [
                styles.option,
                isDesktop && styles.optionDesktop,
                picked && styles.optionPicked,
                dimmed && styles.optionDimmed,
                pressed && { opacity: 0.82 },
              ]}
            >
              <View style={styles.optionHead}>
                <View style={[styles.optionKey, picked && styles.optionKeyPicked]}>
                  <Text style={[text.micro, { color: picked ? colors.onYellow : colors.muted, fontSize: 10 }]}>
                    {option.key}
                  </Text>
                </View>
                <Text style={[text.bodyStrong, { color: colors.text, flex: 1 }]} numberOfLines={2}>
                  {option.label}
                </Text>
                {picked ? <Text style={[text.micro, { color: colors.accentText }]}>已选</Text> : null}
              </View>
              <Text style={[text.small, { color: colors.textSoft, marginTop: 6 }]}>{option.body}</Text>
              <Text style={[text.micro, styles.tradeoff]}>{option.tradeoff}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[text.micro, styles.hint]}>{COPY.review.decisionHint}</Text>

      <View style={styles.actions}>
        <PrimaryButton label={COPY.review.pickA} onPress={() => onChoose('A')} style={styles.actionBtn} />
        <PrimaryButton label={COPY.review.pickB} onPress={() => onChoose('B')} style={styles.actionBtn} />
      </View>
      <GhostButton label={COPY.review.tryAnother} onPress={onRetry} style={{ marginTop: spacing.sm }} />
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: { borderColor: colors.line, padding: spacing.xxl },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
    },
    eyebrowWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
    pulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.yellow },
    eyebrow: { color: colors.accentText, letterSpacing: 0.4, fontWeight: '600' },
    title: { color: colors.text, marginTop: spacing.lg, lineHeight: 26 },
    context: { color: colors.muted, marginTop: spacing.sm, lineHeight: 21 },
    options: { gap: spacing.md, marginTop: spacing.xl },
    optionsDesktop: { flexDirection: 'row', alignItems: 'stretch' },
    optionDesktop: { flex: 1, minWidth: 0 },
    option: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      padding: spacing.lg,
    },
    optionPicked: {
      borderWidth: 1,
      borderColor: colors.yellowDim,
      backgroundColor: colors.yellowWash,
    },
    optionDimmed: { opacity: 0.45 },
    optionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    optionKey: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionKeyPicked: { backgroundColor: colors.yellow, borderColor: colors.yellow },
    tradeoff: {
      color: colors.muted,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      fontSize: 11,
      lineHeight: 17,
    },
    hint: { color: colors.faint, marginTop: spacing.lg, lineHeight: 17 },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
    actionBtn: { flex: 1, minHeight: 48 },
  });
