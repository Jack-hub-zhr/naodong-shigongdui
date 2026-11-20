import { Platform } from 'react-native';
import type { CrewRole, ProviderId } from '../types';

export type ProviderKind = 'openai' | 'gemini';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  short: string;
  kind: ProviderKind;
  baseUrl: string;
  defaultModel: string;
  reviewModel: string;
  family: string;
  reviewFamily: string;
  /** 每分钟请求上限（免费层） */
  rpm: number;
  /** 每日请求上限（免费层） */
  rpd: number;
  tpm: number;
  keyLabel: string;
  keyDoc: string;
  roleNote: string;
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    short: 'DEEPSEEK',
    kind: 'openai',
    baseUrl: '',
    defaultModel: 'deepseek-chat',
    reviewModel: 'deepseek-chat',
    family: 'DeepSeek',
    reviewFamily: 'DeepSeek',
    rpm: 60,
    rpd: 10000,
    tpm: 120000,
    keyLabel: 'DEEPSEEK_API_KEY',
    keyDoc: 'platform.deepseek.com/api_keys',
    roleNote: '服务端托管 · 四个工种统一施工',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    short: 'GROQ',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    reviewModel: 'llama-3.3-70b-versatile',
    family: 'Llama',
    reviewFamily: 'Llama',
    rpm: 30,
    rpd: 14400,
    tpm: 6000,
    keyLabel: 'GROQ_API_KEY',
    keyDoc: 'console.groq.com/keys',
    roleNote: '快速试错轮 · 低延迟',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    short: 'GEMINI',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    reviewModel: 'gemini-2.5-flash',
    family: 'Gemini',
    reviewFamily: 'Gemini',
    rpm: 5,
    rpd: 1500,
    tpm: 250000,
    keyLabel: 'GEMINI_API_KEY',
    keyDoc: 'aistudio.google.com/apikey',
    roleNote: '质量轮 / 最终验收前一轮',
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    short: 'NIM',
    kind: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    reviewModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
    family: 'Llama',
    reviewFamily: 'Nemotron',
    rpm: 40,
    rpd: 1000,
    tpm: 40000,
    keyLabel: 'NVIDIA_NIM_API_KEY',
    keyDoc: 'build.nvidia.com',
    roleNote: '故障转移兜底',
  },
};

/** 页面展示与路由使用的提供商顺序（DeepSeek 为默认施工队） */
export const PROVIDER_ORDER: ProviderId[] = ['deepseek'];

/** 额度与持久化需要覆盖全部历史提供商键，避免旧数据丢失 */
export const ALL_PROVIDER_IDS: ProviderId[] = ['deepseek', 'gemini', 'groq', 'nvidia'];

/**
 * 服务端 API 地址。
 * - 显式配置 EXPO_PUBLIC_API_BASE 时使用该地址；
 * - Web 构建默认与页面同源（返回空字符串）；
 * - 原生端未配置时返回 null，走直连提供商（仅本地开发）。
 */
export function apiBase(): string | null {
  const explicit = (process.env.EXPO_PUBLIC_API_BASE ?? '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return '';
  return null;
}

/** 是否通过服务端中转（密钥只存在于服务器） */
export function isServerMode(): boolean {
  return apiBase() !== null;
}

function readKey(id: ProviderId): string {
  switch (id) {
    case 'deepseek':
      return isServerMode() ? 'server' : (process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY ?? '').trim();
    case 'groq':
      return (process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '').trim();
    case 'gemini':
      return (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim();
    case 'nvidia':
      return (process.env.EXPO_PUBLIC_NVIDIA_NIM_API_KEY ?? '').trim();
    default:
      return '';
  }
}

export function providerKey(id: ProviderId): string {
  return readKey(id);
}

export function isProviderConfigured(id: ProviderId): boolean {
  return readKey(id).length > 8;
}

export function configuredProviders(): ProviderId[] {
  return PROVIDER_ORDER.filter(isProviderConfigured);
}

/**
 * 按工种路由（AGENTS.md 同步维护）。
 * - 调度：Gemini（质量优先）
 * - 产品 / 开发：Groq Llama（快速迭代）
 * - 审查：Gemini / Nemotron，永远与开发工种不同模型家族，避免同源偏见
 */
export type RouteRole = Exclude<CrewRole, 'USER' | 'SYSTEM'> | 'PLEASER';

export const ROLE_ROUTES: Record<RouteRole, ProviderId[]> = {
  ORCHESTRATOR: ['deepseek'],
  PRODUCT: ['deepseek'],
  BUILDER: ['deepseek'],
  REVIEWER: ['deepseek'],
  PLEASER: ['deepseek'],
};

export interface RouteEntry {
  provider: ProviderConfig;
  model: string;
  family: string;
}

/**
 * 计算某个工种的提供商路由。
 * builderFamily 存在时，审查工种会跳过同一模型家族（同源偏见保护）。
 */
export function routeFor(
  role: RouteRole,
  builderFamily?: string,
): RouteEntry[] {
  const route = ROLE_ROUTES[role] ?? ROLE_ROUTES.PRODUCT;
  const entries = route.map((id) => {
    const provider = PROVIDERS[id];
    const isReview = role === 'REVIEWER';
    return {
      provider,
      model: isReview ? provider.reviewModel : provider.defaultModel,
      family: isReview ? provider.reviewFamily : provider.family,
    };
  });

  if (role === 'REVIEWER' && builderFamily) {
    const filtered = entries.filter((entry) => entry.family !== builderFamily);
    if (filtered.length > 0) return filtered;
  }
  return entries;
}

export const DEMO_MODE_DEFAULT = (() => {
  const flag = (process.env.EXPO_PUBLIC_DEMO_MODE ?? '').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  if (flag === '1' || flag === 'true' || flag === 'on') return true;
  // 服务端托管模式下永远走真实接口
  if (isServerMode()) return false;
  // 未显式配置时：有 Key 走真实 API，没有 Key 自动演示
  return configuredProviders().length === 0;
})();

export const PROVIDER_DOC_LINKS: Record<ProviderId, string> = {
  deepseek: 'https://platform.deepseek.com/api_keys',
  groq: 'https://console.groq.com/keys',
  gemini: 'https://aistudio.google.com/apikey',
  nvidia: 'https://build.nvidia.com',
};
