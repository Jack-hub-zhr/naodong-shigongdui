import type { RoleKey } from './brand';

export type Tag = '工具' | '小游戏' | '页面' | '自动化' | '其他';

export const TAGS: Tag[] = ['工具', '小游戏', '页面', '自动化', '其他'];

export type ProjectStatus =
  | 'PENDING'
  | 'BUILDING'
  | 'REVIEWING'
  | 'AWAITING_USER'
  | 'REWORKING'
  | 'DELIVERED'
  | 'PAUSED';

export type PendingKind = 'DECISION' | 'FINAL';

export type ProviderId = 'deepseek' | 'groq' | 'gemini' | 'nvidia';

export type CrewRole = RoleKey;

export type LogTone = 'INFO' | 'PASS' | 'FAIL' | 'DECISION' | 'HANDOFF';

export interface LogEntry {
  id: string;
  at: number;
  role: CrewRole;
  text: string;
  tone: LogTone;
  decisionId?: string;
  /** 决策点 A / B / C */
  decisionMarker?: string;
  /** 是否可回退（决策点日志） */
  rollbackable?: boolean;
}

export interface DecisionOption {
  key: 'A' | 'B';
  label: string;
  body: string;
  tradeoff: string;
}

export interface DecisionPoint {
  id: string;
  index: number;
  marker: string;
  title: string;
  context: string;
  optionA: DecisionOption;
  optionB: DecisionOption;
  chosen?: 'A' | 'B';
  status: 'OPEN' | 'RESOLVED';
  attempts: number;
  resolvedAt?: number;
  resolutionNote?: string;
}

export interface Spec {
  summary: string;
  goal: string;
  inScope: string[];
  outOfScope: string[];
  acceptance: string[];
  decisions: DecisionPoint[];
  implicitPreference: string;
}

export interface ReviewFinding {
  id: string;
  check: string;
  passed: boolean;
  detail: string;
}

export interface ReviewReport {
  round: number;
  at: number;
  findings: ReviewFinding[];
  passed: boolean;
}

export interface Artifact {
  round: number;
  version: number;
  title: string;
  html: string;
  features: string[];
  pathNote: string;
  createdAt: number;
}

export interface DelightItem {
  requirement: string;
  response: string;
  kind: 'EXPLICIT' | 'IMPLICIT';
}

export type PauseReason = 'QUOTA' | 'NO_PROVIDER' | 'ERROR' | 'QUOTA_SIM';

/** 调度工种被中断后，恢复时回到哪一段 */
export type RunTask = 'START' | 'DECISION' | 'REWORK' | 'FINAL';

export interface Project {
  id: string;
  title: string;
  prompt: string;
  tag: Tag;
  createdAt: number;
  updatedAt: number;
  status: ProjectStatus;
  round: number;
  reworkRounds: number;
  spec?: Spec;
  decisions: DecisionPoint[];
  pending?: { kind: PendingKind; decisionId?: string };
  artifact?: Artifact;
  review?: ReviewReport;
  delight?: DelightItem[];
  logs: LogEntry[];
  pausedReason?: PauseReason;
  pausedAt?: number;
  resumeTask?: RunTask;
  acceptedAt?: number;
  lastProvider?: ProviderId;
  /** 用户返工单历史 */
  reworkOrders: string[];
  /** 恢复后待触发通知 */
  notifyOnResume?: boolean;
}

export interface Notice {
  id: string;
  text: string;
  at: number;
}

export interface AppState {
  hydrated: boolean;
  projects: Project[];
  activeId?: string;
  demoMode: boolean;
  notice?: Notice;
  /** 用于强制刷新派生视图 */
  revision: number;
}
