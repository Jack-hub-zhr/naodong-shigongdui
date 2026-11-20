import React, { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COPY } from '../copy';
import { radius, spacing, text, type ThemeColors } from '../theme';
import { useCrew } from '../state/CrewProvider';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';
import type { CrewRole, LogEntry, Project } from '../types';
import {
  Card,
  EmptyState,
  GhostButton,
  PrimaryButton,
  RoleChip,
  ScreenHeader,
  ScreenShell,
  SectionLabel,
  StatusBadge,
  StatusStepper,
  useResponsiveLayout,
} from '../ui/primitives';
import { LogRow, formatClock } from '../ui/log';
import { PROVIDERS } from '../ai/providers';

export function ConstructionScreen() {
  const { store, state } = useCrew();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { isDesktop, contentMaxWidth } = useResponsiveLayout();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const logRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [expanded, setExpanded] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<LogEntry | null>(null);

  const project =
    state.projects.find((item) => item.id === state.activeId) ?? state.projects[0];

  const visibleLogs = useMemo(() => {
    if (!project) return [];
    return expanded ? project.logs : project.logs.slice(-48);
  }, [project, expanded]);

  const crewRoles: CrewRole[] = ['ORCHESTRATOR', 'PRODUCT', 'BUILDER', 'REVIEWER'];
  const lastByRole = useMemo(() => {
    const map = {} as Partial<Record<CrewRole, LogEntry>>;
    for (const entry of project?.logs ?? []) {
      if (crewRoles.includes(entry.role)) map[entry.role] = entry;
    }
    return map;
  }, [project]);

  if (!project) {
    return (
      <ScreenShell>
        <ScreenHeader
          eyebrow={COPY.construction.eyebrow}
          title={COPY.construction.title}
          subtitle={COPY.construction.subtitle}
        />
        <View style={[styles.emptyWrap, { maxWidth: contentMaxWidth }]}>
          <EmptyState
            title={COPY.construction.emptyTitle}
            body={COPY.construction.emptyBody}
            action={
              <PrimaryButton
                label={COPY.construction.goSubmit}
                onPress={() => navigation.navigate(COPY.tabs.brainstorm)}
              />
            }
          />
        </View>
      </ScreenShell>
    );
  }

  const pausedText = project.pausedReason
    ? COPY.construction.pausedReason[project.pausedReason] ?? COPY.construction.pausedBody
    : COPY.construction.pausedBody;
  const isPaused = project.status === 'PAUSED';
  const isAwaiting = project.status === 'AWAITING_USER';
  const providerName = project.lastProvider
    ? PROVIDERS[project.lastProvider]?.name ?? '免费通道'
    : null;

  const pageContent = (
    <>
        <ScreenHeader
          eyebrow={COPY.construction.eyebrow}
          title={COPY.construction.title}
          subtitle={COPY.construction.subtitle}
          right={<StatusBadge status={project.status} />}
        />

        {state.projects.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.switcherScroll}
            contentContainerStyle={[
              styles.switcher,
              { maxWidth: contentMaxWidth },
              isDesktop && styles.switcherDesktop,
            ]}
          >
            {state.projects.map((item) => {
              const active = item.id === project.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  onPress={() => store.setActive(item.id)}
                  style={[styles.switchItem, active && styles.switchItemActive]}
                >
                  <View
                    style={[
                      styles.switchDot,
                      {
                        backgroundColor:
                          item.status === 'DELIVERED'
                            ? colors.success
                            : item.status === 'PAUSED'
                              ? colors.danger
                              : item.status === 'AWAITING_USER'
                                ? colors.info
                                : colors.yellow,
                      },
                    ]}
                  />
                  <Text
                    style={[text.micro, { color: active ? colors.text : colors.muted }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View
          style={[
            styles.body,
            { maxWidth: contentMaxWidth },
            isDesktop && styles.bodyDesktop,
          ]}
        >
          <View style={isDesktop ? styles.summaryColumn : styles.columnMobile}>
          <Card raised style={styles.projectCard}>
            <View style={styles.projectHead}>
              <View style={styles.projectTitleWrap}>
                <Text style={[text.micro, styles.projectMeta]}>
                  {project.tag} · 更新于 {formatClock(project.updatedAt)}
                </Text>
                <Text style={[text.title, styles.projectTitle]} numberOfLines={2}>
                  {project.title}
                </Text>
              </View>
            </View>

            <Text style={[text.small, styles.promptQuote]} numberOfLines={3}>
              “{project.prompt}”
            </Text>

            <View style={styles.metaRow}>
              <PillMeta label={COPY.construction.round(project.round || 1)} />
              {project.reworkRounds > 0 ? (
                <PillMeta label={COPY.construction.reworkRound(project.reworkRounds)} tone={colors.orange} />
              ) : null}
              {providerName ? <PillMeta label={`由 ${providerName} 施工`} /> : null}
              {project.status === 'PENDING' ? (
                <PillMeta label={COPY.construction.queued} tone={colors.muted} />
              ) : null}
            </View>

            <View style={styles.stepperWrap}>
              <StatusStepper status={project.status} />
            </View>
          </Card>

          <Card style={[styles.crewCard, isDesktop && styles.crewCardDesktop]}>
            <View style={styles.crewHead}>
              <SectionLabel>施工队员</SectionLabel>
              <Text style={[text.micro, { color: colors.faint }]}>
                {COPY.construction.round(project.round)}
              </Text>
            </View>
            <View style={styles.crewList}>
              {crewRoles.map((role) => {
                const entry = lastByRole[role];
                return (
                  <View key={role} style={styles.crewRow}>
                    <RoleChip role={role} />
                    <Text
                      numberOfLines={3}
                      style={[
                        text.small,
                        { color: entry ? colors.textSoft : colors.faint, flex: 1, lineHeight: 19 },
                      ]}
                    >
                      {entry?.text ?? '待命中'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>

          {isAwaiting ? (
            <Card style={styles.callout}>
              <Text style={[text.bodyStrong, { color: colors.accentText }]}>
                {COPY.construction.waitingTitle}
              </Text>
              <Text style={[text.small, { color: colors.textSoft, marginTop: 4 }]}>
                {COPY.construction.waitingBody}
              </Text>
              <PrimaryButton
                label={COPY.construction.goReview}
                onPress={() => navigation.navigate(COPY.tabs.review)}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}

          {isPaused ? (
            <Card style={styles.pauseCard}>
              <Text style={[text.bodyStrong, { color: colors.danger }]}>
                {COPY.construction.pausedTitle}
              </Text>
              <Text style={[text.small, { color: colors.textSoft, marginTop: 4 }]}>{pausedText}</Text>
              <View style={styles.pauseActions}>
                <PrimaryButton
                  label={COPY.construction.resume}
                  onPress={() => store.resume(project.id)}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ) : null}

          </View>
          <View style={isDesktop ? styles.logColumn : styles.columnMobile}>
          <View style={styles.logHead}>
            <SectionLabel>
              {COPY.construction.title} · {project.logs.length}
            </SectionLabel>
            {project.status === 'BUILDING' || project.status === 'REVIEWING' ? (
              <View style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={[text.micro, { color: colors.accentText }]}>施工中</Text>
              </View>
            ) : null}
          </View>

          {rollbackTarget?.decisionId ? (
            <Card style={styles.rollbackCard}>
              <Text style={[text.bodyStrong, { color: colors.accentText }]}>
                {COPY.construction.rollbackTitle} {rollbackTarget.decisionMarker}
              </Text>
              <Text style={[text.small, { color: colors.muted, marginTop: 4 }]}>
                {COPY.construction.rollbackAsk(rollbackTarget.decisionMarker ?? '')}
              </Text>
              <View style={styles.rollbackActions}>
                <PrimaryButton
                  label={COPY.construction.rollbackConfirm}
                  onPress={() => {
                    store.rollbackToDecision(project.id, rollbackTarget.decisionId!);
                    setRollbackTarget(null);
                  }}
                  style={{ flex: 1 }}
                />
                <GhostButton label={COPY.common.cancel} onPress={() => setRollbackTarget(null)} />
              </View>
            </Card>
          ) : null}

          <Card style={[styles.logCard, isDesktop && styles.logCardDesktop]}>
            {isDesktop ? (
              <ScrollView
                ref={logRef}
                style={styles.logScroll}
                contentContainerStyle={styles.logScrollContent}
                showsVerticalScrollIndicator
                onContentSizeChange={() => {
                  if (project.status !== 'AWAITING_USER' && project.status !== 'DELIVERED') {
                    logRef.current?.scrollToEnd({ animated: true });
                  }
                }}
              >
                <LogList
                  logs={visibleLogs}
                  project={project}
                  onDecisionPress={(target) => setRollbackTarget(target)}
                />
                {project.logs.length > 48 && !expanded ? (
                  <GhostButton
                    label={`${COPY.construction.showAll}（${project.logs.length}）`}
                    small
                    onPress={() => setExpanded(true)}
                    style={{ marginTop: spacing.sm }}
                  />
                ) : null}
              </ScrollView>
            ) : (
              <>
                <LogList
                  logs={visibleLogs}
                  project={project}
                  onDecisionPress={(target) => setRollbackTarget(target)}
                />
                {project.logs.length > 48 && !expanded ? (
                  <GhostButton
                    label={`${COPY.construction.showAll}（${project.logs.length}）`}
                    small
                    onPress={() => setExpanded(true)}
                    style={{ marginTop: spacing.sm }}
                  />
                ) : null}
              </>
            )}
          </Card>
          </View>
        </View>
    </>
  );

  return (
    <ScreenShell>
      {isDesktop ? (
        <View style={styles.desktopRoot}>{pageContent}</View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (project.status !== 'AWAITING_USER' && project.status !== 'DELIVERED') {
              scrollRef.current?.scrollToEnd({ animated: true });
            }
          }}
        >
          {pageContent}
        </ScrollView>
      )}
    </ScreenShell>
  );
}

function LogList({
  logs,
  project,
  onDecisionPress,
}: {
  logs: LogEntry[];
  project: Project;
  onDecisionPress: (entry: LogEntry) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  if (logs.length === 0) {
    return (
      <Text style={[text.small, { color: colors.faint }]}>
        施工队正在准备工具，第一条日志马上来。
      </Text>
    );
  }

  return (
    <>
      {logs.map((entry) => (
        <LogRow
          key={entry.id}
          entry={entry}
          onDecisionPress={onDecisionPress}
          isPendingDecision={project.pending?.decisionId === entry.decisionId}
        />
      ))}
    </>
  );
}

function PillMeta({ label, tone }: { label: string; tone?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.metaPill}>
      <Text style={[text.micro, { color: tone ?? colors.faint, fontSize: 10 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    emptyWrap: {
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: spacing.xxl,
      marginTop: spacing.xl,
    },
    scroll: { flex: 1, width: '100%' },
    scrollContent: { paddingBottom: 140 },
    desktopRoot: { flex: 1, width: '100%', minHeight: 0, paddingBottom: 92 },
    switcherScroll: { flexGrow: 0, flexShrink: 0 },
    switcher: {
      paddingHorizontal: spacing.xxl,
      gap: spacing.sm,
      paddingBottom: spacing.lg,
    },
    switchItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      maxWidth: 180,
      backgroundColor: colors.surface,
    },
    switchItemActive: { borderColor: colors.yellow, backgroundColor: colors.yellowWash },
    switchDot: { width: 5, height: 5, borderRadius: 3 },
    body: {
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: spacing.xxl,
      gap: spacing.lg,
    },
    bodyDesktop: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.xxl,
      minHeight: 0,
    },
    columnMobile: { gap: spacing.lg },
    summaryColumn: { flex: 0.85, minWidth: 0, minHeight: 0, gap: spacing.lg },
    logColumn: { flex: 1.15, minWidth: 0, minHeight: 0, gap: spacing.lg },
    crewCard: { gap: spacing.md },
    crewCardDesktop: { flex: 1, minHeight: 0 },
    crewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    crewList: { gap: spacing.lg },
    crewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    switcherDesktop: { width: '100%', alignSelf: 'center' },
    projectCard: { backgroundColor: colors.surfaceRaised },
    projectHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    projectTitleWrap: { flex: 1 },
    projectMeta: { color: colors.faint, marginBottom: spacing.xs },
    projectTitle: { color: colors.text, fontSize: 22, lineHeight: 28 },
    promptQuote: {
      color: colors.muted,
      marginTop: spacing.md,
      lineHeight: 21,
    },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.lg },
    metaPill: {
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceSunken,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      maxWidth: 240,
    },
    stepperWrap: {
      marginTop: spacing.lg,
      paddingTop: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    callout: {
      borderColor: colors.line,
      backgroundColor: colors.surfaceRaised,
    },
    pauseCard: {
      borderColor: colors.line,
      backgroundColor: colors.dangerWash,
    },
    pauseActions: { flexDirection: 'row', marginTop: spacing.md },
    logHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.sm },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.yellow },
    logCard: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
    },
    logCardDesktop: { flex: 1, minHeight: 0 },
    logScroll: { flex: 1, minHeight: 0 },
    logScrollContent: { paddingVertical: spacing.xs, paddingRight: spacing.xs },
    rollbackCard: {
      borderColor: colors.lineStrong,
      backgroundColor: colors.surfaceRaised,
    },
    rollbackActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  });
