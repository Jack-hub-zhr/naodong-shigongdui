import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, spacing, text, type ThemeColors } from '../theme';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';
import type { Project } from '../types';
import { COPY } from '../copy';
import { Card, GhostButton, PrimaryButton, SectionLabel, useResponsiveLayout } from './primitives';
import { PreviewFrame } from './PreviewFrame';
import { openArtifact } from '../services/export';

export function FinalReviewCard({
  project,
  onApprove,
  onRework,
}: {
  project: Project;
  onApprove: () => void;
  onRework: (order: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { isDesktop } = useResponsiveLayout();
  const [delightOpen, setDelightOpen] = useState(false);
  const [reworkOpen, setReworkOpen] = useState(false);
  const [order, setOrder] = useState('');
  const artifact = project.artifact;
  const review = project.review;
  const failed = review?.findings.filter((item) => !item.passed) ?? [];
  const passedCount = review ? review.findings.filter((item) => item.passed).length : 0;

  if (!artifact) {
    return (
      <Card>
        <Text style={[text.body, { color: colors.muted }]}>成品还在吊装中，稍等一会儿。</Text>
      </Card>
    );
  }

  return (
    <Card raised style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.badge}>
          <Text style={[text.micro, { color: colors.success }]}>{COPY.review.finalEyebrow}</Text>
        </View>
        <Text style={[text.micro, { color: colors.faint }]}>
          {COPY.review.artifactMeta(artifact.round, artifact.version)}
        </Text>
      </View>

      <Text style={[text.title, { color: colors.text, marginTop: spacing.sm }]} numberOfLines={2}>
        {artifact.title}
      </Text>
      <Text style={[text.small, { color: colors.muted, marginTop: 4 }]}>{COPY.review.previewHint}</Text>

      <View style={[styles.contentColumns, isDesktop && styles.contentColumnsDesktop]}>
        <View style={isDesktop ? styles.previewColumn : undefined}>
      <View style={styles.previewSection}>
        <PreviewFrame html={artifact.html} height={isDesktop ? 480 : 380} />
      </View>

      {Platform.OS === 'web' ? (
        <GhostButton
          label={COPY.review.previewOpen}
          small
          onPress={() => openArtifact(project)}
          style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
        />
      ) : null}

      <View style={styles.metaRow}>
        <Text style={[text.micro, { color: colors.faint }]}>
          自检 {passedCount}/{review?.findings.length ?? 0} 项通过
        </Text>
        <Text style={[text.micro, { color: colors.faint }]}>
          {project.round} 轮施工 · {project.reworkRounds} 次返工
        </Text>
      </View>

        </View>
        <View style={isDesktop ? styles.detailColumn : undefined}>
      {failed.length > 0 ? (
        <View style={styles.riskBox}>
          <Text style={[text.micro, { color: colors.danger }]}>已知风险（已标注，交给你定夺）</Text>
          {failed.slice(0, 3).map((item) => (
            <Text key={item.id} style={[text.small, styles.riskText]}>
              · {item.detail}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.acceptanceSection}>
        <SectionLabel>{COPY.review.acceptanceTitle}</SectionLabel>
        {project.spec?.acceptance.map((item, index) => (
          <View key={`${index}-${item}`} style={styles.checkRow}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={[text.small, { color: colors.textSoft, flex: 1 }]}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.delightBox}>
        <GhostButton
          label={`${COPY.review.delightTitle} · ${project.delight?.length ?? 0} 条 ${delightOpen ? '收起' : '展开'}`}
          onPress={() => setDelightOpen((prev) => !prev)}
          active={delightOpen}
          small
        />
        {delightOpen ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={[text.micro, { color: colors.faint, marginBottom: spacing.sm }]}>
              {COPY.review.delightHint}
            </Text>
            {(project.delight ?? []).map((item, index) => (
              <View
                key={`${index}-${item.requirement}`}
                style={[styles.delightItem, item.kind === 'IMPLICIT' && styles.delightImplicit]}
              >
                <View style={styles.delightHead}>
                  <Text
                    style={[
                      text.micro,
                      { color: item.kind === 'IMPLICIT' ? colors.accentText : colors.info, fontSize: 9.5 },
                    ]}
                  >
                    {item.kind === 'IMPLICIT' ? COPY.review.delightImplicit : COPY.review.delightExplicit}
                  </Text>
                </View>
                <Text style={[text.small, { color: colors.muted, marginTop: 3 }]}>{item.requirement}</Text>
                <Text style={[text.small, { color: colors.text, marginTop: 2, lineHeight: 20 }]}>
                  {item.response}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
        </View>
      </View>

      {reworkOpen ? (
        <View style={styles.reworkBox}>
          <Text style={[text.micro, { color: colors.orange }]}>{COPY.review.rework}</Text>
          <TextInput
            value={order}
            onChangeText={setOrder}
            placeholder={COPY.review.reworkPlaceholder}
            placeholderTextColor={colors.faint}
            multiline
            style={styles.reworkInput}
            accessibilityLabel={COPY.review.reworkPlaceholder}
          />
          <Text style={[text.micro, { color: colors.faint, marginTop: 6 }]}>{COPY.review.reworkHint}</Text>
          <View style={styles.reworkActions}>
            <PrimaryButton
              label={COPY.review.reworkSubmit}
              onPress={() => {
                if (!order.trim()) return;
                onRework(order.trim());
                setOrder('');
                setReworkOpen(false);
              }}
              disabled={!order.trim()}
              style={{ flex: 1 }}
            />
            <GhostButton label={COPY.review.reworkCancel} onPress={() => setReworkOpen(false)} />
          </View>
        </View>
      ) : (
        <View style={styles.finalActions}>
          <PrimaryButton label={COPY.review.approve} onPress={onApprove} style={{ flex: 1.2 }} />
          <GhostButton
            label={COPY.review.rework}
            danger
            onPress={() => setReworkOpen(true)}
            style={{ flex: 1 }}
          />
        </View>
      )}
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
    badge: {
      backgroundColor: colors.successWash,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 5,
    },
    contentColumns: { width: '100%' },
    contentColumnsDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxl },
    previewColumn: { flex: 1.2, minWidth: 0 },
    detailColumn: { flex: 0.8, minWidth: 0 },
    previewSection: { marginTop: spacing.xl },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    riskBox: {
      marginTop: spacing.lg,
      backgroundColor: colors.dangerWash,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    riskText: { color: colors.textSoft, marginTop: spacing.sm, lineHeight: 20 },
    acceptanceSection: {
      marginTop: spacing.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      paddingTop: spacing.xl,
    },
    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: 5 },
    checkIcon: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.successWash,
      color: colors.success,
      fontSize: 12,
      lineHeight: 22,
      fontWeight: '700',
      textAlign: 'center',
    },
    delightBox: {
      marginTop: spacing.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      paddingTop: spacing.xl,
    },
    delightItem: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSunken,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    delightImplicit: { borderColor: colors.yellowWashStrong, backgroundColor: colors.yellowWash },
    delightHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    reworkBox: {
      marginTop: spacing.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSunken,
      borderRadius: radius.lg,
      padding: spacing.xl,
    },
    reworkInput: {
      marginTop: spacing.md,
      minHeight: 104,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.lineStrong,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceRaised,
      color: colors.text,
      padding: spacing.lg,
      fontSize: 14,
      lineHeight: 21,
      textAlignVertical: 'top',
    },
    reworkActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    finalActions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      paddingTop: spacing.xl,
    },
  });
