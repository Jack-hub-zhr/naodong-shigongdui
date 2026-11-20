import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProviderId, ProviderQuotaSnapshot } from '../types';
import { ALL_PROVIDER_IDS, PROVIDERS, PROVIDER_ORDER, isProviderConfigured } from './providers';

const STORAGE_KEY = 'naodong.quota.v1';

export interface QuotaCheck {
  ok: boolean;
  reason?: 'RPD' | 'SIMULATED';
  waitMs: number;
  message?: string;
}

interface PersistedQuota {
  day: string;
  used: Record<ProviderId, number>;
  simulatedExhausted: boolean;
}

function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function emptyUsed(): Record<ProviderId, number> {
  const result = {} as Record<ProviderId, number>;
  for (const id of ALL_PROVIDER_IDS) result[id] = 0;
  return result;
}

function emptyRecent(): Record<ProviderId, number[]> {
  const result = {} as Record<ProviderId, number[]>;
  for (const id of ALL_PROVIDER_IDS) result[id] = [];
  return result;
}

/**
 * 每个提供商独立令牌桶：
 * - RPM 用 60 秒滑动窗口（内存）
 * - RPD 按自然日持久化
 * 施工队串行调用，避免聚合速率触发免费层滥用标记。
 */
class QuotaBook {
  private day = dayKey();
  private used: Record<ProviderId, number> = emptyUsed();
  private simulatedExhausted = false;
  private recent: Record<ProviderId, number[]> = emptyRecent();
  private listeners = new Set<() => void>();
  private hydrated = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshotCache: Record<ProviderId, ProviderQuotaSnapshot> | null = null;

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedQuota>;
        if (parsed.day === dayKey()) {
          this.used = { ...emptyUsed(), ...(parsed.used ?? {}) };
          this.simulatedExhausted = Boolean(parsed.simulatedExhausted);
        }
      }
    } catch {
      // 读不到就当作新的一天
    }
    this.rolloverIfNeeded();
    this.emit();
  }

  private rolloverIfNeeded(): boolean {
    const today = dayKey();
    if (today !== this.day) {
      this.day = today;
      this.used = emptyUsed();
      this.recent = emptyRecent();
      this.persist();
      return true;
    }
    return false;
  }

  get currentDay(): string {
    return this.day;
  }

  get isSimulatedExhausted(): boolean {
    return this.simulatedExhausted;
  }

  /** 到达新的一天后自动恢复（由 App 启动时调用） */
  checkNewDay(): boolean {
    const changed = this.rolloverIfNeeded();
    if (changed) this.emit();
    return changed;
  }

  check(id: ProviderId): QuotaCheck {
    this.rolloverIfNeeded();
    if (this.simulatedExhausted) {
      return {
        ok: false,
        reason: 'SIMULATED',
        waitMs: 0,
        message: '今日免费额度已用尽（模拟）',
      };
    }
    const config = PROVIDERS[id];
    if (this.used[id] >= config.rpd) {
      return { ok: false, reason: 'RPD', waitMs: 0, message: `${config.name} 今日额度已用尽` };
    }
    this.pruneRecent(id);
    if (this.recent[id].length >= config.rpm) {
      const waitMs = Math.max(50, 60_000 - (Date.now() - this.recent[id][0]) + 50);
      return { ok: true, waitMs };
    }
    return { ok: true, waitMs: 0 };
  }

  record(id: ProviderId): void {
    this.rolloverIfNeeded();
    this.used[id] += 1;
    this.recent[id].push(Date.now());
    this.invalidate();
    this.persist();
    this.emit();
  }

  setSimulatedExhausted(value: boolean): void {
    this.simulatedExhausted = value;
    this.invalidate();
    this.persist();
    this.emit();
  }

  snapshot(): Record<ProviderId, ProviderQuotaSnapshot> {
    this.rolloverIfNeeded();
    if (this.snapshotCache) return this.snapshotCache;
    const result = {} as Record<ProviderId, ProviderQuotaSnapshot>;
    for (const id of ALL_PROVIDER_IDS) {
      const config = PROVIDERS[id];
      this.pruneRecent(id);
      result[id] = {
        id,
        used: this.used[id],
        limit: config.rpd,
        rpm: config.rpm,
        rpmUsed: this.recent[id].length,
        day: this.day,
        simulatedExhausted: this.simulatedExhausted,
        configured: isProviderConfigured(id),
      };
    }
    this.snapshotCache = result;
    return result;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async reset(): Promise<void> {
    this.day = dayKey();
    this.used = emptyUsed();
    this.simulatedExhausted = false;
    this.recent = emptyRecent();
    this.invalidate();
    await AsyncStorage.removeItem(STORAGE_KEY);
    this.emit();
  }

  private pruneRecent(id: ProviderId): void {
    const cutoff = Date.now() - 60_000;
    this.recent[id] = this.recent[id].filter((at) => at > cutoff);
  }

  private invalidate(): void {
    this.snapshotCache = null;
  }

  private emit(): void {
    this.invalidate();
    this.listeners.forEach((listener) => listener());
  }

  private persist(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const payload: PersistedQuota = {
        day: this.day,
        used: this.used,
        simulatedExhausted: this.simulatedExhausted,
      };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }, 200);
  }
}

export const quotaBook = new QuotaBook();

export function totalRemainingToday(): number {
  return PROVIDER_ORDER.reduce((sum, id) => {
    const snap = quotaBook.snapshot()[id];
    return sum + Math.max(0, snap.limit - snap.used);
  }, 0);
}

export function hasAnyConfiguredProvider(): boolean {
  return PROVIDER_ORDER.some(isProviderConfigured);
}

export function allQuotaExhausted(): boolean {
  if (quotaBook.isSimulatedExhausted) return true;
  return PROVIDER_ORDER.every((id) => quotaBook.check(id).reason === 'RPD');
}
