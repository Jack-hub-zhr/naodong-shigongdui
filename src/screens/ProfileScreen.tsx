import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COPY } from '../copy';
import { radius, spacing, text, type ThemeColors, type ThemeMode } from '../theme';
import { useCrew } from '../state/CrewProvider';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';
import { PROVIDER_ORDER, PROVIDERS, isProviderConfigured } from '../ai/providers';
import type { Project } from '../types';
import {
  Card,
  EmptyState,
  GhostButton,
  Pill,
  ProgressBar,
  ScreenHeader,
  ScreenShell,
  SectionLabel,
  SegmentedControl,
  StatusBadge,
  Toggle,
  useResponsiveLayout,
} from '../ui/primitives';
import { LogoMark as BrandMark } from '../ui/Mark';
import { exportArtifact, shareArtifact } from '../services/export';

type FilterKey = 'all' | 'building' | 'awaiting' | 'delivered' | 'paused';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: COPY.profile.historyFilters.all },
  { key: 'building', label: COPY.profile.historyFilters.building },
  { key: 'awaiting', label: COPY.profile.historyFilters.awaiting },
  { key: 'delivered', label: COPY.profile.historyFilters.delivered },
  { key: 'paused', label: COPY.profile.historyFilters.paused },
];

function matches(project: Project, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'building') {
    return ['PENDING', 'BUILDING', 'REVIEWING', 'REWORKING'].includes(project.status);
  }
  if (filter === 'awaiting') return project.status === 'AWAITING_USER';
  if (filter === 'delivered') return project.status === 'DELIVERED';
  return project.status === 'PAUSED';
}

function formatWhen(at: number): string {
  const date = new Date(at);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const hh = `${date.getHours()}`.padStart(2, '0');
  const mm = `${date.getMinutes()}`.padStart(2, '0');
  return sameDay ? `今天 ${hh}:${mm}` : `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`;
}

export function ProfileScreen() {
  const { store, state } = useCrew();
  const { colors, mode, setMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { isDesktop, contentMaxWidth } = useResponsiveLayout();
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [confirmReset, setConfirmReset] = useState(false);

  const projects = useMemo(
    () => state.projects.filter((project) => matches(project, filter)),
    [state.projects, filter],
  );

  const openProject = (project: Project) => {
    store.setActive(project.id);
    const target = project.status === 'AWAITING_USER' ? COPY.tabs.review : COPY.tabs.construction;
    navigation.navigate(target);
  };

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: COPY.profile.appearanceSystem },
    { value: 'dark', label: COPY.profile.appearanceDark },
    { value: 'light', label: COPY.profile.appearanceLight },
  ];

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          eyebrow={COPY.profile.eyebrow}
          title={COPY.profile.title}
          subtitle={COPY.profile.subtitle}
          right={<BrandMark size={40} ring={false} />}
        />

        <View
          style={[
            styles.body,
            { maxWidth: contentMaxWidth },
            isDesktop && styles.bodyDesktop,
          ]}
        >
          <View style={isDesktop ? styles.column : styles.columnMobile}>
          <View>
            <SectionLabel>{COPY.profile.appearanceTitle}</SectionLabel>
            <Card>
              <SegmentedControl
                options={themeOptions}
                value={mode}
                onChange={setMode}
                accessibilityLabel={COPY.profile.appearanceTitle}
              />
              <Text style={[text.small, styles.settingHint]}>{COPY.profile.appearanceHint}</Text>
            </Card>
          </View>

          <View>
            <SectionLabel>{COPY.profile.quotaTitle}</SectionLabel>
            <Text style={[text.small, styles.sectionHint]}>{COPY.profile.quotaHint}</Text>
            <Card style={styles.groupCard}>
              {PROVIDER_ORDER.map((id, index) => {
                const provider = PROVIDERS[id];
                const quota = state.quotas[id];
                const remaining = Math.max(0, quota.limit - quota.used);
                const configured = isProviderConfigured(id);
                return (
                  <View key={id}>
                    {index > 0 ? <View style={styles.insetDivider} /> : null}
                    <View style={styles.providerRow}>
                      <View style={styles.quotaHead}>
                        <View style={{ flex: 1 }}>
                          <Text style={[text.bodyStrong, { color: colors.text }]}>{provider.name}</Text>
                          <Text style={[text.micro, styles.providerModel]} numberOfLines={1}>
                            {provider.defaultModel}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.modeTag,
                            { backgroundColor: configured ? colors.successWash : colors.surfaceSunken },
                          ]}
                        >
                          <Text style={[text.micro, { color: configured ? colors.success : colors.faint, fontSize: 10 }]}>
                            {configured ? '服务端托管' : COPY.profile.notConfigured}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.quotaLine}>
                        <Text style={[text.small, { color: colors.textSoft }]}>
                          今日已用 {quota.used} · 剩余约 {remaining} 次
                        </Text>
                        <Text style={[text.micro, { color: colors.faint }]}>
                          {quota.rpmUsed}/{provider.rpm} RPM
                        </Text>
                      </View>
                      <ProgressBar value={quota.used / Math.max(1, quota.limit)} />
                      <View style={styles.quotaFoot}>
                        <Text style={[text.micro, styles.providerNote]}>
                          每日上限 {provider.rpd}/日 · {provider.roleNote}
                        </Text>
                        {quota.simulatedExhausted ? (
                          <Text style={[text.micro, { color: colors.danger }]}>{COPY.profile.simulated}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>

          <View>
            <SectionLabel>{COPY.profile.settingsTitle}</SectionLabel>
            <Card style={styles.groupCard}>
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[text.bodyStrong, { color: colors.text }]}>{COPY.profile.demoMode}</Text>
                  <Text style={[text.small, styles.rowHint]}>{COPY.profile.demoModeHint}</Text>
                </View>
                <Toggle value={state.demoMode} onChange={(next) => store.setDemoMode(next)} />
              </View>
              <View style={styles.insetDivider} />
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[text.bodyStrong, { color: colors.text }]}>施工模型</Text>
                  <Text style={[text.small, styles.rowHint]}>
                    DeepSeek 由服务端统一调用，密钥不会下发到浏览器。
                  </Text>
                </View>
                <Text style={[text.micro, { color: colors.success }]}>deepseek-chat</Text>
              </View>
            </Card>
          </View>

          </View>
          <View style={isDesktop ? styles.column : styles.columnMobile}>
          <View>
            <View style={styles.historyHead}>
              <SectionLabel>{COPY.profile.historyTitle}</SectionLabel>
              {state.projects.length > 0 ? (
                <Text style={[text.small, { color: colors.faint }]}>{state.projects.length} 个</Text>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {FILTERS.map((item) => (
                <Pill
                  key={item.key}
                  label={item.label}
                  active={filter === item.key}
                  color={colors.accentText}
                  onPress={() => setFilter(item.key)}
                />
              ))}
            </ScrollView>

            {projects.length === 0 ? (
              <EmptyState
                title={COPY.profile.historyEmpty}
                body={COPY.brainstorm.subtitle}
                action={<GhostButton label={COPY.construction.goSubmit} onPress={() => navigation.navigate(COPY.tabs.brainstorm)} />}
              />
            ) : (
              projects.map((project) => (
                <Pressable
                  key={project.id}
                  accessibilityRole="button"
                  accessibilityLabel={project.title}
                  onPress={() => openProject(project)}
                  style={({ pressed }) => [pressed && { opacity: 0.72 }]}
                >
                  <Card style={styles.historyCard}>
                    <View style={styles.historyTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[text.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                          {project.title}
                        </Text>
                        <Text style={[text.small, styles.historyMeta]} numberOfLines={1}>
                          {project.tag} · {formatWhen(project.createdAt)} · 第 {project.round || 1} 轮
                          {project.reworkRounds > 0 ? ` · 返工 ${project.reworkRounds} 次` : ''}
                        </Text>
                      </View>
                      <StatusBadge status={project.status} />
                    </View>
                    <View style={styles.historyActions}>
                      {project.status === 'DELIVERED' ? (
                        <>
                          <GhostButton
                            label={COPY.profile.exportHtml}
                            small
                            onPress={async () => {
                              await exportArtifact(project);
                              store.announce(COPY.profile.exported);
                            }}
                          />
                          <GhostButton label={COPY.profile.shareText} small onPress={() => void shareArtifact(project)} />
                        </>
                      ) : null}
                      <GhostButton label={COPY.profile.openLog} small onPress={() => openProject(project)} />
                      {project.status === 'AWAITING_USER' ? (
                        <GhostButton
                          label={COPY.profile.reopen}
                          small
                          active
                          onPress={() => {
                            store.setActive(project.id);
                            navigation.navigate(COPY.tabs.review);
                          }}
                        />
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              ))
            )}
          </View>

          <Card style={styles.aboutCard}>
            <BrandMark size={44} ring={false} />
            <View style={{ flex: 1 }}>
              <Text style={[text.h2, { color: colors.text }]}>{COPY.brand.fullName}</Text>
              <Text style={[text.small, styles.aboutSlogan]}>{COPY.profile.aboutSlogan}</Text>
              <Text style={[text.micro, styles.aboutMeta]}>
                {COPY.profile.aboutBody} · {COPY.profile.aboutMeta}
              </Text>
            </View>
          </Card>
          <Text style={[text.micro, styles.serialNote]}>{COPY.profile.serialNote}</Text>

          <View>
            {confirmReset ? (
              <Card>
                <Text style={[text.body, { color: colors.textSoft }]}>{COPY.profile.resetAsk}</Text>
                <View style={styles.resetActions}>
                  <GhostButton
                    label={COPY.profile.resetConfirm}
                    danger
                    onPress={async () => {
                      await store.resetAll();
                      setConfirmReset(false);
                    }}
                    style={{ flex: 1 }}
                  />
                  <GhostButton label={COPY.common.cancel} onPress={() => setConfirmReset(false)} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : (
              <GhostButton label={COPY.profile.resetData} danger onPress={() => setConfirmReset(true)} />
            )}
          </View>
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: { paddingBottom: 140 },
    body: {
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: spacing.xxl,
      gap: spacing.xxxl,
    },
    bodyDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxl },
    columnMobile: { gap: spacing.xxxl },
    column: { flex: 1, minWidth: 0, gap: spacing.xxxl },
    settingHint: { color: colors.muted, marginTop: spacing.md, textAlign: 'center' },
    sectionHint: { color: colors.faint, marginTop: -spacing.xs, marginBottom: spacing.md },
    groupCard: { padding: 0, overflow: 'hidden' },
    insetDivider: { height: 0.5, backgroundColor: colors.line, marginLeft: spacing.xl },
    providerRow: { padding: spacing.xl },
    quotaHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    providerModel: { color: colors.faint, marginTop: 3 },
    modeTag: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5 },
    quotaLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.md, gap: spacing.sm },
    quotaFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
    providerNote: { color: colors.faint, flex: 1, lineHeight: 16 },
    settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.xl },
    rowHint: { color: colors.muted, marginTop: 4, maxWidth: 340 },
    historyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    filters: { gap: spacing.sm, paddingBottom: spacing.lg },
    historyCard: { marginBottom: spacing.md },
    historyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    historyMeta: { color: colors.faint, marginTop: 4 },
    historyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
    aboutCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    aboutSlogan: { color: colors.muted, marginTop: 3 },
    aboutMeta: { color: colors.faint, marginTop: spacing.sm, lineHeight: 16 },
    serialNote: { color: colors.faint, textAlign: 'center', marginTop: -spacing.xl, lineHeight: 17 },
    resetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  });
