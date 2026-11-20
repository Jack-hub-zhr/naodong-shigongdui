import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Tag } from '../types';
import { TAGS } from '../types';
import { COPY } from '../copy';
import { spacing, text, type ThemeColors } from '../theme';
import { useCrew } from '../state/CrewProvider';
import { useTheme, useThemedStyles } from '../state/ThemeProvider';
import {
  Card,
  PrimaryButton,
  ScreenHeader,
  ScreenShell,
  SectionLabel,
  StatusBadge,
  TagPill,
  useResponsiveLayout,
} from '../ui/primitives';
import { inferTag, shortTitle } from '../demo/content';

export function BrainstormScreen() {
  const { store, state } = useCrew();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { isDesktop, contentMaxWidth } = useResponsiveLayout();
  const [value, setValue] = useState('');
  const [tag, setTag] = useState<Tag | null>(null);
  const [error, setError] = useState('');

  const recent = useMemo(() => state.projects.slice(0, 4), [state.projects]);

  const submit = () => {
    if (!value.trim()) {
      setError(COPY.brainstorm.emptyPrompt);
      return;
    }
    const project = store.submit(value, tag ?? inferTag(value));
    if (!project) return;
    setValue('');
    setError('');
    navigation.navigate(COPY.tabs.construction);
  };

  return (
    <ScreenShell>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader
            eyebrow={COPY.brainstorm.eyebrow}
            title={COPY.brainstorm.title}
            subtitle={COPY.brainstorm.subtitle}
          />
          <View
            style={[
              styles.responsiveBody,
              { maxWidth: contentMaxWidth },
              isDesktop && styles.responsiveBodyDesktop,
            ]}
          >
            <View style={isDesktop ? styles.mainColumn : undefined}>
          <Card raised style={[styles.composer, isDesktop && styles.desktopComposer]}>
            <TextInput
              value={value}
              onChangeText={(next) => {
                setValue(next);
                if (error) setError('');
              }}
              placeholder={COPY.brainstorm.placeholder}
              placeholderTextColor={colors.faint}
              multiline
              textAlignVertical="top"
              style={styles.input}
              accessibilityLabel={COPY.brainstorm.placeholder}
            />
            <View style={styles.counterRow}>
              <Text style={[text.micro, styles.counterText]}>
                {value.trim().length > 0 ? `${value.trim().length} 字` : '一句话就够'}
              </Text>
              <Text style={[text.micro, styles.noticeText]}>{COPY.brainstorm.activeNotice}</Text>
            </View>

            <View style={styles.tagSection}>
              <SectionLabel>{COPY.brainstorm.tagLabel}</SectionLabel>
              <View style={styles.tagRow}>
                {TAGS.map((item) => (
                  <TagPill
                    key={item}
                    tag={item}
                    active={tag === item}
                    onPress={() => setTag(item)}
                  />
                ))}
              </View>
            </View>

            {error ? <Text style={[text.small, styles.error]}>{error}</Text> : null}

            <PrimaryButton
              label={COPY.brainstorm.submit}
              onPress={submit}
              style={styles.submitButton}
            />
            <Text style={[text.micro, styles.submitHint]}>{COPY.brainstorm.submitHint}</Text>
          </Card>
            </View>
            <View style={isDesktop ? styles.sideColumn : undefined}>

          <View style={[styles.examples, isDesktop && styles.desktopExamples]}>
            <SectionLabel>{COPY.brainstorm.exampleLabel}</SectionLabel>
            <Card style={styles.listCard}>
              {COPY.brainstorm.examples.map((example, index) => (
                <Pressable
                  key={example}
                  accessibilityRole="button"
                  accessibilityLabel={example}
                  onPress={() => setValue(example)}
                  style={({ pressed }) => [
                    styles.exampleRow,
                    index > 0 && styles.listRowBorder,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Text style={[text.small, styles.exampleText]}>{example}</Text>
                </Pressable>
              ))}
            </Card>
          </View>

          {recent.length > 0 ? (
            <View style={[styles.recentSection, isDesktop && styles.desktopRecent]}>
              <SectionLabel>{COPY.brainstorm.recent}</SectionLabel>
              <Card style={styles.listCard}>
                {recent.map((project, index) => (
                  <Pressable
                    key={project.id}
                    accessibilityRole="button"
                    accessibilityLabel={project.title}
                    onPress={() => {
                      store.setActive(project.id);
                      navigation.navigate(
                        project.status === 'AWAITING_USER' ? COPY.tabs.review : COPY.tabs.construction,
                      );
                    }}
                    style={({ pressed }) => [
                      styles.recentItem,
                      index > 0 && styles.listRowBorder,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View style={styles.recentCopy}>
                      <Text style={[text.bodyStrong, styles.recentTitle]} numberOfLines={1}>
                        {project.title || shortTitle(project.prompt)}
                      </Text>
                      <Text style={[text.micro, styles.recentMeta]}>
                        {project.tag} · {COPY.construction.round(project.round || 1)}
                      </Text>
                    </View>
                    <StatusBadge status={project.status} />
                  </Pressable>
                ))}
              </Card>
            </View>
          ) : null}
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: { paddingBottom: spacing.huge },
    responsiveBody: { width: '100%', alignSelf: 'center' },
    responsiveBodyDesktop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xxl,
      paddingHorizontal: spacing.xxl,
    },
    mainColumn: { flex: 1.25, minWidth: 0 },
    sideColumn: { flex: 0.75, minWidth: 0 },
    desktopComposer: { marginHorizontal: 0 },
    desktopExamples: { paddingHorizontal: 0, marginTop: 0 },
    desktopRecent: { paddingHorizontal: 0 },
    composer: {
      marginHorizontal: spacing.xxl,
      padding: 0,
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.line,
    },
    input: {
      minHeight: 148,
      color: colors.text,
      fontSize: 17,
      lineHeight: 26,
      fontWeight: '400',
      paddingHorizontal: spacing.xl,
      paddingTop: 18,
      paddingBottom: spacing.lg,
    },
    counterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    counterText: { color: colors.faint, flexShrink: 0 },
    noticeText: { color: colors.faint, flex: 1, textAlign: 'right', lineHeight: 16 },
    tagSection: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    error: { color: colors.danger, marginTop: spacing.md, marginHorizontal: spacing.xl },
    submitButton: { marginHorizontal: spacing.xl, marginTop: spacing.lg },
    submitHint: {
      color: colors.faint,
      marginTop: spacing.sm,
      marginBottom: spacing.xl,
      marginHorizontal: spacing.xl,
      textAlign: 'center',
    },
    examples: { paddingHorizontal: spacing.xxl, marginTop: spacing.xxxl },
    listCard: { padding: 0 },
    exampleRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
    listRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    rowPressed: { opacity: 0.65 },
    exampleText: { color: colors.textSoft, lineHeight: 21 },
    recentSection: { paddingHorizontal: spacing.xxl, marginTop: spacing.xxxl },
    recentItem: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    recentCopy: { flex: 1 },
    recentTitle: { color: colors.text },
    recentMeta: { color: colors.faint, marginTop: 3 },
    bottomSpacer: { height: 120 },
  });
