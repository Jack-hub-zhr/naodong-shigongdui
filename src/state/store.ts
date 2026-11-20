import AsyncStorage from '@react-native-async-storage/async-storage';
import { COPY } from '../copy';
import type {
  AppState,
  Artifact,
  DecisionPoint,
  Project,
  RunTask,
  Spec,
  Tag,
} from '../types';
import { AllProvidersFailedError } from '../ai/client';
import { configuredProviders, DEMO_MODE_DEFAULT } from '../ai/providers';
import { quotaBook } from '../ai/quota';
import { failureSummary } from '../ai/reviewer';
import {
  runBuilder,
  runDelight,
  runInspection,
  runProduct,
  runReviewNarrative,
  type CrewDeps,
} from '../ai/crew';
import { retryDecision, shortTitle } from '../demo/content';
import { pushLocalNotification } from '../services/notifications';

const STORAGE_KEY = 'naodong.state.v1';
const MAX_LOGS = 260;

type Listener = () => void;
type QueueEntry = { id: string; task: RunTask };

interface PersistedState {
  version: 1;
  projects: Project[];
  activeId?: string;
  demoMode: boolean;
  savedAt: number;
}

const initialState = (): AppState => ({
  hydrated: false,
  projects: [],
  activeId: undefined,
  demoMode: DEMO_MODE_DEFAULT,
  quotas: quotaBook.snapshot(),
  notice: undefined,
  revision: 0,
});

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sameDay(ts: number, now = Date.now()): boolean {
  const a = new Date(ts);
  const b = new Date(now);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

class CrewStore {
  private state: AppState = initialState();
  private listeners = new Set<Listener>();
  private queue: QueueEntry[] = [];
  private pumping = false;
  private eventProjectId: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private quotaUnsub?: () => void;

  // ---------- React binding ----------
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AppState => this.state;

  private emit(): void {
    this.state = { ...this.state, revision: this.state.revision + 1 };
    this.listeners.forEach((listener) => listener());
  }

  private patch(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  // ---------- 查询 ----------
  project(id?: string | null): Project | undefined {
    if (!id) return undefined;
    return this.state.projects.find((item) => item.id === id);
  }

  get activeProject(): Project | undefined {
    return this.project(this.state.activeId) ?? this.state.projects[0];
  }

  get awaitingProjects(): Project[] {
    return this.state.projects.filter(
      (item) => item.status === 'AWAITING_USER' && item.pending,
    );
  }

  // ---------- 生命周期 ----------
  async hydrate(): Promise<void> {
    if (this.state.hydrated) return;
    await quotaBook.hydrate();
    let projects: Project[] = [];
    let activeId: string | undefined;
    let demoMode = DEMO_MODE_DEFAULT;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (Array.isArray(parsed.projects)) projects = parsed.projects;
        activeId = parsed.activeId;
        if (typeof parsed.demoMode === 'boolean') demoMode = parsed.demoMode;
      }
    } catch {
      // 数据损坏就重来，不阻塞进场
    }

    const today = Date.now();
    const restored = projects.map((project) => {
      const item: Project = {
        ...project,
        logs: Array.isArray(project.logs) ? project.logs.slice(-MAX_LOGS) : [],
        decisions: Array.isArray(project.decisions) ? project.decisions : [],
        reworkOrders: Array.isArray(project.reworkOrders) ? project.reworkOrders : [],
      };
      if (item.status === 'BUILDING' || item.status === 'REVIEWING' || item.status === 'REWORKING') {
        item.status = 'PENDING';
        item.resumeTask = item.resumeTask ?? 'START';
        item.logs.push({
          id: uid('log'),
          at: today,
          role: 'SYSTEM',
          text: COPY.logs.restart,
          tone: 'INFO',
        });
      }
      return item;
    });

    this.state = {
      ...this.state,
      hydrated: true,
      projects: restored,
      activeId,
      demoMode,
      quotas: quotaBook.snapshot(),
    };
    this.emit();

    this.quotaUnsub?.();
    this.quotaUnsub = quotaBook.subscribe(() => {
      this.patch({ quotas: quotaBook.snapshot() });
    });

    restored.forEach((item) => {
      if (item.status === 'PENDING') {
        this.enqueue(item.id, item.resumeTask ?? 'START');
      } else if (
        item.status === 'PAUSED' &&
        item.pausedReason === 'QUOTA' &&
        item.pausedAt &&
        !sameDay(item.pausedAt)
      ) {
        this.log(item.id, 'SYSTEM', COPY.logs.resumedAuto, 'PASS');
        this.patchProject(item.id, { status: 'PENDING', pausedReason: undefined });
        this.enqueue(item.id, item.resumeTask ?? 'START');
      }
    });
    void this.pump();
  }

  // ---------- 用户动作 ----------
  submit(prompt: string, tag: Tag): Project | undefined {
    const clean = prompt.trim();
    if (!clean) return undefined;
    const now = Date.now();
    const project: Project = {
      id: uid('idea'),
      title: shortTitle(clean),
      prompt: clean,
      tag,
      createdAt: now,
      updatedAt: now,
      status: 'PENDING',
      round: 0,
      reworkRounds: 0,
      decisions: [],
      logs: [],
      reworkOrders: [],
      resumeTask: 'START',
    };
    const busy = this.pumping || this.queue.length > 0;
    const withLog: Project = {
      ...project,
      logs: [
        {
          id: uid('log'),
          at: now,
          role: 'ORCHESTRATOR',
          text: COPY.logs.received(project.title),
          tone: 'INFO',
        },
        ...(busy
          ? [
              {
                id: uid('log'),
                at: now,
                role: 'SYSTEM' as const,
                text: COPY.logs.queued,
                tone: 'INFO' as const,
              },
            ]
          : []),
      ],
    };
    this.patch({
      projects: [withLog, ...this.state.projects],
      activeId: project.id,
    });
    this.notice(COPY.brainstorm.submitted);
    this.save();
    if (quotaBook.isSimulatedExhausted) {
      this.pause(withLog.id, 'START', 'QUOTA_SIM', COPY.logs.pausedQuota);
      return this.project(withLog.id);
    }
    this.enqueue(project.id, 'START');
    return withLog;
  }

  setActive(id: string): void {
    this.patch({ activeId: id });
    this.save();
  }

  chooseDecision(projectId: string, decisionId: string, choice: 'A' | 'B'): void {
    const project = this.project(projectId);
    if (!project || project.pending?.decisionId !== decisionId) return;
    const decision = project.decisions.find((item) => item.id === decisionId);
    if (!decision) return;
    const option = choice === 'A' ? decision.optionA : decision.optionB;

    const nextDecisions = project.decisions.map((item) =>
      item.id === decisionId
        ? {
            ...item,
            chosen: choice,
            status: 'RESOLVED' as const,
            resolvedAt: Date.now(),
            resolutionNote: `你选择了 ${choice} 方案`,
          }
        : item,
    );
    this.patchProject(projectId, {
      decisions: nextDecisions,
      pending: undefined,
      status: 'BUILDING',
    });
    this.log(
      projectId,
      'ORCHESTRATOR',
      COPY.logs.decisionChosen(decision.index, `${choice}·${option.label}`),
      'HANDOFF',
    );
    this.notice(COPY.review.choiceRecorded(`${choice}·${option.label}`));
    this.enqueue(projectId, 'DECISION');
  }

  retryDecisionAt(projectId: string, decisionId: string): void {
    const project = this.project(projectId);
    if (!project || project.pending?.decisionId !== decisionId) return;
    const decision = project.decisions.find((item) => item.id === decisionId);
    if (!decision) return;
    const refreshed = retryDecision(decision, decision.attempts + 1);
    this.patchProject(projectId, {
      decisions: project.decisions.map((item) => (item.id === decisionId ? refreshed : item)),
    });
    this.log(projectId, 'ORCHESTRATOR', COPY.logs.decisionRetry(decision.index), 'DECISION', {
      decisionId,
      decisionMarker: decision.marker,
      rollbackable: true,
    });
  }

  acceptFinal(projectId: string): void {
    const project = this.project(projectId);
    if (!project || project.pending?.kind !== 'FINAL') return;
    this.patchProject(projectId, {
      status: 'DELIVERED',
      pending: undefined,
      acceptedAt: Date.now(),
    });
    this.log(projectId, 'ORCHESTRATOR', COPY.logs.accepted, 'PASS');
    this.notice(COPY.review.approved);
  }

  submitRework(projectId: string, order: string): void {
    const project = this.project(projectId);
    if (!project || project.pending?.kind !== 'FINAL') return;
    const clean = order.trim();
    if (!clean) return;

    const lastResolved = [...project.decisions].reverse().find((item) => item.status === 'RESOLVED');
    let nextDecisions = project.decisions;
    if (lastResolved) {
      const alternative = lastResolved.chosen === 'A' ? 'B' : 'A';
      const option = alternative === 'A' ? lastResolved.optionA : lastResolved.optionB;
      nextDecisions = project.decisions.map((item) =>
        item.id === lastResolved.id
          ? {
              ...item,
              chosen: alternative,
              attempts: item.attempts + 1,
              resolutionNote: `返工单要求换路径：${alternative}·${option.label}`,
            }
          : item,
      );
    }

    this.patchProject(projectId, {
      decisions: nextDecisions,
      pending: undefined,
      status: 'REWORKING',
      reworkRounds: project.reworkRounds + 1,
      reworkOrders: [...project.reworkOrders, clean],
    });
    this.log(projectId, 'USER', COPY.logs.reworkOrder(clean.slice(0, 40)), 'HANDOFF');
    if (lastResolved) {
      this.log(projectId, 'ORCHESTRATOR', COPY.logs.reworkRollback(lastResolved.marker), 'DECISION', {
        decisionId: lastResolved.id,
        decisionMarker: lastResolved.marker,
        rollbackable: true,
      });
    }
    this.notice(COPY.review.reworked(project.reworkRounds + 1));
    this.enqueue(projectId, 'REWORK');
  }

  rollbackToDecision(projectId: string, decisionId: string): void {
    const project = this.project(projectId);
    if (!project) return;
    if (['PENDING', 'BUILDING', 'REVIEWING', 'REWORKING'].includes(project.status)) {
      this.notice(COPY.construction.rollbackBlockedRunning);
      return;
    }
    const target = project.decisions.find((item) => item.id === decisionId);
    if (!target) return;
    const decisions: DecisionPoint[] = project.decisions.map((item) =>
      item.index >= target.index
        ? { ...item, chosen: undefined, status: 'OPEN', resolutionNote: undefined, resolvedAt: undefined }
        : item,
    );
    this.patchProject(projectId, {
      decisions,
      pending: undefined,
      status: 'AWAITING_USER',
    });
    this.log(projectId, 'USER', COPY.logs.rollbackUser(target.marker), 'HANDOFF');
    this.log(projectId, 'ORCHESTRATOR', COPY.logs.reworkRollback(target.marker), 'DECISION', {
      decisionId,
      decisionMarker: target.marker,
      rollbackable: true,
    });
    void this.pauseForDecision(projectId, target.index - 1);
  }

  resume(projectId: string): void {
    const project = this.project(projectId);
    if (!project || project.status !== 'PAUSED') return;
    if (quotaBook.isSimulatedExhausted) {
      this.notice(COPY.errors.quotaStill);
      return;
    }
    if (!this.state.demoMode && configuredProviders().length === 0) {
      this.notice(COPY.errors.noKey);
      return;
    }
    this.patchProject(projectId, {
      status: 'PENDING',
      pausedReason: undefined,
      pausedAt: undefined,
      pending: undefined,
    });
    this.log(projectId, 'SYSTEM', COPY.logs.resumed, 'PASS');
    this.notice(COPY.notifications.resumed(project.title));
    this.enqueue(projectId, project.resumeTask ?? 'START');
  }

  setDemoMode(value: boolean): void {
    this.patch({ demoMode: value });
    this.notice(value ? COPY.profile.modeDemo : COPY.profile.modeReal);
    this.save();
  }

  setQuotaSimulated(value: boolean): void {
    quotaBook.setSimulatedExhausted(value);
    this.notice(value ? COPY.profile.simulated : COPY.profile.quotaHint);
    if (value) {
      const queued = this.state.projects.find((item) => item.status === 'PENDING');
      if (queued) {
        this.pause(queued.id, queued.resumeTask ?? 'START', 'QUOTA_SIM', COPY.logs.pausedQuota);
        return;
      }
      const runningProject = this.state.projects.find((item) => item.status === 'BUILDING');
      if (runningProject) {
        this.log(runningProject.id, 'SYSTEM', COPY.logs.simQuota, 'FAIL');
      }
    }
  }

  dismissNotice(): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.patch({ notice: undefined });
  }

  announce(text: string): void {
    this.notice(text);
  }

  async resetAll(): Promise<void> {
    this.queue = [];
    this.state = {
      ...initialState(),
      hydrated: true,
      demoMode: this.state.demoMode,
      quotas: quotaBook.snapshot(),
    };
    this.emit();
    await AsyncStorage.removeItem(STORAGE_KEY);
    await quotaBook.reset();
    this.notice(COPY.profile.resetDone);
  }

  // ---------- 内部：日志 / 状态 / 通知 ----------
  private patchProject(id: string, patch: Partial<Project>): void {
    this.patch({
      projects: this.state.projects.map((item) =>
        item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item,
      ),
    });
    this.save();
  }

  private log(
    projectId: string,
    role: Project['logs'][number]['role'],
    text: string,
    tone: Project['logs'][number]['tone'],
    extra?: Partial<Project['logs'][number]>,
  ): void {
    const entry = {
      id: uid('log'),
      at: Date.now(),
      role,
      text,
      tone,
      ...extra,
    };
    const project = this.project(projectId);
    if (!project) return;
    const logs = [...project.logs, entry].slice(-MAX_LOGS);
    this.patchProject(projectId, { logs });
  }

  private notice(text: string): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    const notice = { id: uid('notice'), text, at: Date.now() };
    this.patch({ notice });
    this.noticeTimer = setTimeout(() => {
      if (this.state.notice?.id === notice.id) {
        this.patch({ notice: undefined });
      }
    }, 5200);
  }

  private async notify(projectId: string, text: string): Promise<void> {
    this.notice(text);
    void pushLocalNotification(COPY.brand.fullName, text);
  }

  private save(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const payload: PersistedState = {
        version: 1,
        projects: this.state.projects,
        activeId: this.state.activeId,
        demoMode: this.state.demoMode,
        savedAt: Date.now(),
      };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
    }, 320);
  }

  // ---------- 内部：调度队列 ----------
  private enqueue(id: string, task: RunTask): void {
    if (!this.queue.some((entry) => entry.id === id)) {
      this.queue.push({ id, task });
    }
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift()!;
        this.eventProjectId = entry.id;
        try {
          await this.execute(entry);
        } catch (error) {
          this.handleFailure(entry, error);
        }
      }
    } finally {
      this.pumping = false;
      this.eventProjectId = null;
    }
  }

  private async execute(entry: QueueEntry): Promise<void> {
    const project = this.project(entry.id);
    if (!project || project.status === 'DELIVERED') return;
    switch (entry.task) {
      case 'START':
        await this.flowStart(entry.id);
        break;
      case 'DECISION':
        await this.flowFromDecision(entry.id);
        break;
      case 'REWORK':
        await this.flowRework(entry.id);
        break;
      case 'FINAL':
        await this.produceFinal(entry.id);
        break;
      default:
        break;
    }
  }

  private deps(): CrewDeps {
    return {
      demo: this.state.demoMode,
      builderFamily: undefined,
      onEvent: (_type, message) => {
        if (this.eventProjectId) {
          this.log(this.eventProjectId, 'SYSTEM', message, 'INFO');
        }
      },
    };
  }

  private pace(multiplier = 1): Promise<void> {
    const base = this.state.demoMode ? 380 + Math.random() * 420 : 80;
    return new Promise((resolve) => setTimeout(resolve, base * multiplier));
  }

  // ---------- 内部：施工流程 ----------
  private async flowStart(projectId: string): Promise<void> {
    let project = this.project(projectId);
    if (!project) return;

    this.patchProject(projectId, {
      status: 'BUILDING',
      pausedReason: undefined,
      pausedAt: undefined,
      pending: undefined,
    });
    this.log(
      projectId,
      'ORCHESTRATOR',
      COPY.logs.dispatch('产品工种 / 开发工种 / 审查工种'),
      'HANDOFF',
    );
    this.log(
      projectId,
      'SYSTEM',
      this.state.demoMode ? COPY.logs.demoEngine : COPY.logs.realEngine,
      'INFO',
    );
    await this.pace();

    this.log(projectId, 'PRODUCT', COPY.logs.productStart, 'INFO');
    await this.pace();
    const product = await runProduct(project.prompt, project.tag, this.deps());
    const spec: Spec = product.spec;
    this.patchProject(projectId, {
      spec,
      decisions: spec.decisions,
      lastProvider: product.provider,
    });
    this.log(projectId, 'PRODUCT', COPY.logs.specReady(spec.acceptance.length), 'PASS');
    this.log(projectId, 'PRODUCT', COPY.logs.decisionsReady(spec.decisions.length), 'DECISION');
    await this.pace();

    project = this.project(projectId)!;
    await this.buildAndReview(projectId, 1, this.state.demoMode);
    await this.pauseForDecision(projectId, 0);
  }

  private async flowFromDecision(projectId: string): Promise<void> {
    const project = this.project(projectId);
    if (!project) return;
    const openDecision = project.decisions.find((item) => item.status === 'OPEN');
    this.log(
      projectId,
      'ORCHESTRATOR',
      COPY.logs.buildAfterChoice(project.decisions.filter((d) => d.chosen).length),
      'HANDOFF',
    );
    await this.pace();
    await this.buildAndReview(projectId, project.round + 1, false);

    const refreshed = this.project(projectId);
    if (!refreshed) return;
    const nextOpen = refreshed.decisions.find((item) => item.status === 'OPEN');
    if (nextOpen) {
      await this.pauseForDecision(projectId, nextOpen.index - 1);
      return;
    }
    await this.produceFinal(projectId);
    void openDecision;
  }

  private async flowRework(projectId: string): Promise<void> {
    const project = this.project(projectId);
    if (!project) return;
    const order = project.reworkOrders[project.reworkOrders.length - 1] ?? '';
    this.log(projectId, 'ORCHESTRATOR', COPY.logs.reworkStart(project.round + 1), 'HANDOFF');
    await this.pace();
    this.patchProject(projectId, { status: 'BUILDING' });
    await this.buildAndReview(projectId, project.round + 1, false, order);
    await this.produceFinal(projectId);
  }

  private async buildAndReview(
    projectId: string,
    startRound: number,
    includeMissing: boolean,
    reworkOrder?: string,
  ): Promise<void> {
    let round = startRound;
    let artifact: Artifact | undefined;
    let attempts = 0;

    while (attempts < 3) {
      let project = this.project(projectId);
      if (!project) return;
      this.patchProject(projectId, { status: 'BUILDING' });
      this.log(projectId, 'BUILDER', COPY.logs.buildStart(round), 'INFO');
      await this.pace();
      const built = await runBuilder(project, this.deps(), {
        round,
        includeMissing: includeMissing && attempts === 0,
        reworkOrder: attempts === 0 ? reworkOrder : undefined,
        previous: artifact ?? project.artifact,
      });
      artifact = built.artifact;
      this.patchProject(projectId, {
        artifact,
        round,
        lastProvider: built.provider,
      });
      this.log(projectId, 'BUILDER', COPY.logs.buildDone(round), 'HANDOFF');
      await this.pace();

      project = this.project(projectId)!;
      this.patchProject(projectId, { status: 'REVIEWING' });
      this.log(projectId, 'REVIEWER', COPY.logs.reviewStart(round), 'INFO');
      await this.pace();
      const { report } = await runInspection(project, artifact);
      const narrative = await runReviewNarrative(project, report, this.deps());
      this.patchProject(projectId, { review: report });

      const failed = report.findings.filter((item) => !item.passed);
      if (report.passed) {
        this.log(projectId, 'REVIEWER', COPY.logs.reviewPass(round, report.findings.length), 'PASS');
        return;
      }

      this.log(
        projectId,
        'REVIEWER',
        COPY.logs.reviewFail(failed.length, narrative || failureSummary(report)),
        'FAIL',
      );
      attempts += 1;
      if (attempts >= 3) {
        this.log(projectId, 'REVIEWER', COPY.logs.riskNote, 'FAIL');
        return;
      }
      round += 1;
      this.log(projectId, 'ORCHESTRATOR', COPY.logs.reworkStart(round), 'HANDOFF');
      this.patchProject(projectId, { status: 'REWORKING' });
      await this.pace();
      reworkOrder = failureSummary(report);
      includeMissing = false;
    }
  }

  private async pauseForDecision(projectId: string, index: number): Promise<void> {
    const project = this.project(projectId);
    if (!project) return;
    const decision = project.decisions[index];
    if (!decision) {
      await this.produceFinal(projectId);
      return;
    }
    this.patchProject(projectId, {
      status: 'AWAITING_USER',
      pending: { kind: 'DECISION', decisionId: decision.id },
      pausedReason: undefined,
      resumeTask: undefined,
      decisions: project.decisions.map((item) =>
        item.id === decision.id ? { ...item, status: 'OPEN' as const } : item,
      ),
    });
    this.log(
      projectId,
      'ORCHESTRATOR',
      COPY.logs.decisionReached(decision.index, decision.title),
      'DECISION',
      {
        decisionId: decision.id,
        decisionMarker: decision.marker,
        rollbackable: true,
      },
    );
    await this.pace();
    await this.notify(projectId, COPY.notifications.decision(decision.index));
  }

  private async produceFinal(projectId: string): Promise<void> {
    const project = this.project(projectId);
    if (!project || !project.artifact || !project.spec) {
      this.pause(projectId, 'FINAL', 'ERROR', COPY.logs.pausedError);
      return;
    }
    const delight = await runDelight(project, project.artifact, this.deps());
    this.patchProject(projectId, {
      delight,
      status: 'AWAITING_USER',
      pending: { kind: 'FINAL' },
      pausedReason: undefined,
      resumeTask: undefined,
    });
    this.log(projectId, 'ORCHESTRATOR', COPY.logs.finalReady, 'HANDOFF');
    await this.pace();
    const refreshed = this.project(projectId);
    const text =
      (refreshed?.reworkRounds ?? 0) > 0
        ? COPY.notifications.awaitingRework(refreshed?.reworkRounds ?? 0)
        : COPY.notifications.delivered(refreshed?.title ?? '脑洞');
    await this.notify(projectId, text);
  }

  private handleFailure(entry: QueueEntry, error: unknown): void {
    if (error instanceof AllProvidersFailedError) {
      if (error.quotaExhausted) {
        this.pause(entry.id, entry.task, 'QUOTA', COPY.logs.pausedQuota);
      } else if (error.noProvider) {
        this.pause(entry.id, entry.task, 'NO_PROVIDER', COPY.logs.pausedProvider);
      } else {
        this.pause(entry.id, entry.task, 'ERROR', COPY.logs.pausedError);
      }
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.log(entry.id, 'SYSTEM', message.slice(0, 120), 'FAIL');
    this.pause(entry.id, entry.task, 'ERROR', COPY.logs.pausedError);
  }

  private pause(projectId: string, task: RunTask, reason: Project['pausedReason'], message: string): void {
    const project = this.project(projectId);
    if (!project) return;
    if (project.status === 'PAUSED') return;
    this.patchProject(projectId, {
      status: 'PAUSED',
      pausedReason: reason,
      pausedAt: Date.now(),
      resumeTask: task,
      pending: undefined,
    });
    this.log(projectId, 'SYSTEM', message, 'FAIL');
    void this.notify(projectId, COPY.notifications.paused);
  }
}

export const crewStore = new CrewStore();
