import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COPY } from '../copy';
import { radius, spacing, text, type ThemeColors } from '../theme';
import { useCrew } from '../state/CrewProvider';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';
import { Card, EmptyState, GhostButton, PrimaryButton, ScreenHeader, ScreenShell, SectionLabel, StatusBadge, useResponsiveLayout } from '../ui/primitives';
import { DecisionCard } from '../ui/DecisionCard';
import { FinalReviewCard } from '../ui/FinalReviewCard';
import { exportArtifact, shareArtifact } from '../services/export';

export function ReviewScreen() {
  const { store, state } = useCrew();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentMaxWidth } = useResponsiveLayout();

  const awaiting = useMemo(
    () => state.projects.filter((item) => item.status === 'AWAITING_USER' && item.pending),
    [state.projects],
  );

  const active =
    state.projects.find((item) => item.id === state.activeId && item.pending) ?? awaiting[0];
  const activeDecision =
    active?.pending?.kind === 'DECISION'
      ? active.decisions.find((item) => item.id === active.pending?.decisionId)
      : undefined;

  const delivered = state.projects.find(
    (item) => item.id === state.activeId && item.status === 'DELIVERED',
  );

  const building = active
    ? active.status === 'BUILDING' || active.status === 'REVIEWING' || active.status === 'REWORKING'
    : false;

  const goConstruction = () => navigation.navigate(COPY.tabs.construction);

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          eyebrow={COPY.review.eyebrow}
          title={COPY.review.title}
          subtitle={COPY.review.subtitle}
          right={
            awaiting.length > 0 ? (
              <View style={styles.countBadge}>
                <Text style={[text.micro, { color: colors.onYellow }]}>{awaiting.length}</Text>
              </View>
            ) : undefined
          }
        />

        <View style={[styles.body, { maxWidth: contentMaxWidth }]}>
          {activeDecision && active ? (
            <DecisionCard
              decision={activeDecision}
              onChoose={(choice) => store.chooseDecision(active.id, activeDecision.id, choice)}
              onRetry={() => store.retryDecisionAt(active.id, activeDecision.id)}
            />
          ) : null}

          {active?.pending?.kind === 'FINAL' ? (
            <FinalReviewCard
              project={active}
              onApprove={() => store.acceptFinal(active.id)}
              onRework={(order) => store.submitRework(active.id, order)}
            />
          ) : null}

          {building && active ? (
            <Card style={styles.buildingCard}>
              <View style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={[text.micro, { color: colors.accentText }]}>施工中</Text>
              </View>
              <Text style={[text.h2, { color: colors.text, marginTop: spacing.sm }]}>
                施工队正在按你的选择继续试错
              </Text>
              <Text style={[text.small, { color: colors.muted, marginTop: 6 }]}>
                第 {active.round} 轮 · 详细动作在施工日志里滚动
              </Text>
              <PrimaryButton
                label={COPY.construction.title}
                onPress={goConstruction}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}

          {delivered && !active ? (
            <Card raised style={styles.deliveredCard}>
              <StatusBadge status={delivered.status} />
              <Text style={[text.h2, styles.deliveredTitle]}>{COPY.review.approved}</Text>
              <Text style={[text.small, styles.deliveredBody]}>
                成品已归档到「{COPY.tabs.profile}」，可随时导出或分享。
              </Text>
              <View style={styles.deliveredActions}>
                <PrimaryButton
                  label={COPY.profile.exportHtml}
                  onPress={async () => {
                    await exportArtifact(delivered);
                    store.announce(COPY.profile.exported);
                  }}
                  style={{ flex: 1 }}
                />
                <GhostButton label={COPY.profile.shareText} onPress={() => void shareArtifact(delivered)} />
              </View>
              <View style={styles.deliveredProject}>
                <Text style={[text.h2, styles.deliveredProjectTitle]} numberOfLines={2}>
                  {delivered.title}
                </Text>
                <Text style={[text.small, styles.deliveredSummary]} numberOfLines={2}>
                  {delivered.spec?.summary}
                </Text>
                <GhostButton
                  label={COPY.profile.openLog}
                  small
                  onPress={() => {
                    store.setActive(delivered.id);
                    goConstruction();
                  }}
                  style={styles.deliveredLogButton}
                />
              </View>
            </Card>
          ) : null}

          {!activeDecision && active?.pending?.kind !== 'FINAL' && !building && !delivered ? (
            <EmptyState
              title={COPY.review.emptyTitle}
              body={COPY.review.emptyBody}
              action={<PrimaryButton label={COPY.construction.title} onPress={goConstruction} />}
            />
          ) : null}

          {awaiting.length > 1 ? (
            <View style={styles.queueSection}>
              <SectionLabel>{COPY.review.reviewCount(awaiting.length)}</SectionLabel>
              <View style={styles.queueList}>
                {awaiting.map((item, index) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    onPress={() => store.setActive(item.id)}
                    style={({ pressed }) => [
                      styles.queueItem,
                      index > 0 && styles.queueItemBorder,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View style={styles.queueCopy}>
                      <Text style={[text.bodyStrong, styles.queueTitle]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[text.micro, styles.queueMeta]}>
                        {item.pending?.kind === 'FINAL' ? '最终交付' : '裁决点'} · 第 {item.round} 轮
                      </Text>
                    </View>
                    <StatusBadge status={item.status} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {state.projects.some((item) => item.status === 'DELIVERED') && active ? (
            <View style={styles.queueSection}>
              <SectionLabel>{COPY.review.allDelivered}</SectionLabel>
              <View style={styles.queueList}>
                {state.projects
                  .filter((item) => item.status === 'DELIVERED')
                  .slice(0, 5)
                  .map((item, index) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={item.title}
                      onPress={() => {
                        store.setActive(item.id);
                      }}
                      style={({ pressed }) => [
                        styles.queueItem,
                        index > 0 && styles.queueItemBorder,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <View style={styles.queueCopy}>
                        <Text style={[text.bodyStrong, styles.queueTitle]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[text.micro, styles.queueMeta]}>
                          {item.reworkRounds > 0
                            ? `已返工 ${item.reworkRounds} 轮 · 已交付`
                            : '一次通过 · 已交付'}
                        </Text>
                      </View>
                      <Text style={[text.micro, styles.deliveredLabel]}>已交付</Text>
                    </Pressable>
                  ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrollContent: { paddingBottom: 140 },
    body: {
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: spacing.xxl,
      gap: spacing.lg,
    },
    countBadge: {
      minWidth: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.yellow,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    buildingCard: { borderColor: colors.line, backgroundColor: colors.surfaceRaised },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.yellow },
    deliveredCard: { alignItems: 'stretch', borderColor: colors.line },
    deliveredTitle: { color: colors.text, marginTop: spacing.md },
    deliveredBody: { color: colors.muted, marginTop: 6 },
    deliveredActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignSelf: 'stretch',
      marginTop: spacing.lg,
    },
    deliveredProject: {
      alignSelf: 'stretch',
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    deliveredProjectTitle: { color: colors.text },
    deliveredSummary: { color: colors.muted, marginTop: spacing.xs },
    deliveredLogButton: { marginTop: spacing.md, alignSelf: 'flex-start' },
    queueSection: { marginTop: spacing.lg },
    queueList: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    queueItem: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    queueItemBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    rowPressed: { opacity: 0.65 },
    queueCopy: { flex: 1 },
    queueTitle: { color: colors.text },
    queueMeta: { color: colors.faint, marginTop: 3 },
    deliveredLabel: { color: colors.success },
  });
