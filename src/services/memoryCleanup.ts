import {
  cleanupCopyTraderCaches,
  getCopyTraderCacheStats,
} from './copyAndSmartMoneyApi';
import {
  cleanupBinancePriceCache,
  getBinancePriceCacheStats,
} from './binanceApi';
import { paperEngine } from './paperTrading';
import { mobileNotifications } from './mobileNotifications';
import { purgeExpiredKuCoinOrderHistory } from './kucoinApi';
import { ActiveCopiedTrader } from '../types';

export const MEMORY_CLEANUP_STORAGE_KEY = 'whale_memory_cleanup_config_v1';
export const DEFAULT_HISTORY_RETENTION_DAYS = 30;
export const HISTORY_RETENTION_MS = DEFAULT_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface MemoryCleanupConfig {
  enabled: boolean;
  heapThresholdPercent: number;
  maxCacheSizeKb: number;
  periodicIntervalSeconds: number;
  lowEndDeviceMode: boolean;
  historyRetentionDays?: number;
  autoCleanExpiredLogsOnStartup?: boolean;
}

export interface MemoryPressureEvaluationInput {
  usedHeapBytes: number | null;
  heapLimitBytes: number | null;
  totalEstimatedCacheKb: number;
  totalCachedItems: number;
  deviceMemoryGb: number | null;
  config: MemoryCleanupConfig;
}

export interface MemoryPressureEvaluationResult {
  shouldCleanup: boolean;
  mode: 'NONE' | 'SOFT' | 'AGGRESSIVE';
  utilizationPercent: number;
  effectiveMaxCacheKb: number;
  reasonAr: string;
}

export interface MemoryCleanupResult {
  executed: boolean;
  mode: 'NONE' | 'SOFT' | 'AGGRESSIVE' | 'MANUAL' | 'STARTUP';
  freedItemsCount: number;
  freedEstimatedKb: number;
  timestamp: number;
  reasonAr: string;
}

export interface StartupHistoryCleanupResult {
  executed: boolean;
  retentionDays: number;
  cutoffTimestamp: number;
  removedClosedPositions: number;
  removedCheckpoints: number;
  removedStaleChoices: number;
  removedNotifications: number;
  removedKuCoinOrders: number;
  totalExpiredLogsRemoved: number;
  timestamp: number;
  reasonAr: string;
}

export interface MemoryTelemetrySnapshot {
  config: MemoryCleanupConfig;
  usedHeapMb: number | null;
  heapLimitMb: number | null;
  deviceMemoryGb: number | null;
  utilizationPercent: number;
  effectiveMaxCacheKb: number;
  totalEstimatedCacheKb: number;
  totalCachedItems: number;
  copyTraderCacheEntries: number;
  priceCacheSymbols: number;
  closedHistoryItems: number;
  notificationsCount: number;
  cleanupRunCount: number;
  totalItemsFreed: number;
  totalKbFreed: number;
  lastCleanupAt: number | null;
  lastCleanupReasonAr: string | null;
  historyRetentionDays: number;
  startupCleanupExecuted: boolean;
  lastStartupCleanupAt: number | null;
  expiredHistoryLogsPurgedCount: number;
}

declare global {
  interface Window {
    __copyTrPerformMemoryCleanup?: (source?: string) => MemoryCleanupResult;
  }
}

export function detectLowEndDevice(): boolean {
  try {
    if (typeof navigator !== 'undefined') {
      const devMem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      if (typeof devMem === 'number' && devMem > 0 && devMem <= 4) {
        return true;
      }
      const cores = navigator.hardwareConcurrency;
      if (typeof cores === 'number' && cores > 0 && cores <= 4) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

export const DEFAULT_MEMORY_CLEANUP_CONFIG: MemoryCleanupConfig = {
  enabled: true,
  heapThresholdPercent: 70,
  maxCacheSizeKb: 360,
  periodicIntervalSeconds: 30,
  lowEndDeviceMode: detectLowEndDevice(),
  historyRetentionDays: DEFAULT_HISTORY_RETENTION_DAYS,
  autoCleanExpiredLogsOnStartup: true,
};

/**
 * Pure helper function to filter out any history logs whose timestamp is strictly older
 * than the retention window (defaults to 30 days) relative to `nowMs`.
 * Items without a positive timestamp are preserved safely.
 */
export function filterExpiredHistoryLogsByAge<T>(
  items: readonly T[],
  getTimestamp: (item: T) => number | undefined | null,
  nowMs: number = Date.now(),
  retentionDays: number = DEFAULT_HISTORY_RETENTION_DAYS
): {
  kept: T[];
  removedCount: number;
  cutoffTimestamp: number;
} {
  const safeDays = Math.max(1, Number(retentionDays) || DEFAULT_HISTORY_RETENTION_DAYS);
  const cutoffTimestamp = nowMs - safeDays * 24 * 60 * 60 * 1000;
  const kept: T[] = [];
  let removedCount = 0;

  for (const item of items) {
    const rawTs = getTimestamp(item);
    const ts = typeof rawTs === 'number' && Number.isFinite(rawTs) ? rawTs : 0;
    if (ts > 0 && ts < cutoffTimestamp) {
      removedCount += 1;
    } else {
      kept.push(item);
    }
  }

  return {
    kept,
    removedCount,
    cutoffTimestamp,
  };
}

/**
 * Pure helper to compute effective cache size ceiling (in KB) taking low-end device mode into account.
 */
export function calculateEffectiveCacheLimitKb(
  config: MemoryCleanupConfig,
  deviceMemoryGb: number | null = null
): number {
  const baseLimit = Math.max(100, Number(config.maxCacheSizeKb) || 360);
  const isConstrained =
    config.lowEndDeviceMode || (deviceMemoryGb !== null && deviceMemoryGb > 0 && deviceMemoryGb <= 4);
  return isConstrained ? Math.max(100, Math.round(baseLimit * 0.65)) : baseLimit;
}

/**
 * Pure function that evaluates current heap & application cache metrics against configured thresholds.
 */
export function evaluateMemoryPressure(
  input: MemoryPressureEvaluationInput
): MemoryPressureEvaluationResult {
  const {
    usedHeapBytes,
    heapLimitBytes,
    totalEstimatedCacheKb,
    totalCachedItems,
    deviceMemoryGb,
    config,
  } = input;

  const effectiveMaxCacheKb = calculateEffectiveCacheLimitKb(config, deviceMemoryGb);
  const thresholdPct = Math.min(95, Math.max(40, Number(config.heapThresholdPercent) || 70));

  let heapPercent = 0;
  if (
    typeof usedHeapBytes === 'number' &&
    typeof heapLimitBytes === 'number' &&
    heapLimitBytes > 0
  ) {
    heapPercent = Math.min(100, Math.round((usedHeapBytes / heapLimitBytes) * 100));
  }

  const cachePercent = Math.min(
    100,
    Math.round((Math.max(0, totalEstimatedCacheKb) / Math.max(1, effectiveMaxCacheKb)) * 100)
  );

  const utilizationPercent = Math.max(heapPercent, cachePercent);

  if (!config.enabled) {
    return {
      shouldCleanup: false,
      mode: 'NONE',
      utilizationPercent,
      effectiveMaxCacheKb,
      reasonAr: 'التنظيف التلقائي للذاكرة متوقف من الإعدادات',
    };
  }

  // 1. Critical / Aggressive threshold (>= threshold + 15% or >= 85%)
  const aggressiveThreshold = Math.min(95, thresholdPct + 15);
  if (heapPercent >= aggressiveThreshold || cachePercent >= 100 || totalCachedItems >= 450) {
    return {
      shouldCleanup: true,
      mode: 'AGGRESSIVE',
      utilizationPercent,
      effectiveMaxCacheKb,
      reasonAr:
        heapPercent >= aggressiveThreshold
          ? `تجاوز استهلاك ذاكرة النظام الحد الحرج (${heapPercent}% ≥ ${aggressiveThreshold}%)`
          : `وصول حجم البيانات المؤقتة (Cache) إلى الحد الأقصى (${totalEstimatedCacheKb} KB / ${effectiveMaxCacheKb} KB)`,
    };
  }

  // 2. Standard threshold (>= thresholdPct)
  if (utilizationPercent >= thresholdPct || totalCachedItems >= 260) {
    return {
      shouldCleanup: true,
      mode: 'SOFT',
      utilizationPercent,
      effectiveMaxCacheKb,
      reasonAr:
        heapPercent >= thresholdPct
          ? `وصول استهلاك الذاكرة إلى حد التنظيف المحدد (${heapPercent}% ≥ ${thresholdPct}%)`
          : `تجاوز الكاش المؤقت حد التنظيف الدوري (${utilizationPercent}% ≥ ${thresholdPct}%)`,
    };
  }

  return {
    shouldCleanup: false,
    mode: 'NONE',
    utilizationPercent,
    effectiveMaxCacheKb,
    reasonAr: 'استهلاك الذاكرة ضمن النطاق الآمن',
  };
}

class MemoryCleanupService {
  private config: MemoryCleanupConfig = { ...DEFAULT_MEMORY_CLEANUP_CONFIG };
  private cleanupRunCount: number = 0;
  private totalItemsFreed: number = 0;
  private totalKbFreed: number = 0;
  private lastCleanupAt: number | null = null;
  private lastCleanupReasonAr: string | null = null;
  private startupCleanupExecuted: boolean = false;
  private lastStartupCleanupAt: number | null = null;
  private expiredHistoryLogsPurgedCount: number = 0;
  private listeners: Set<(snapshot: MemoryTelemetrySnapshot) => void> = new Set();

  constructor() {
    this.config = this.loadConfig();
    if (typeof window !== 'undefined') {
      window.__copyTrPerformMemoryCleanup = (source?: string) => {
        return this.performCleanup(
          'AGGRESSIVE',
          source === 'OS_LOW_MEMORY'
            ? 'إشعار انخفاض الذاكرة من نظام التشغيل (OS Low Memory Trim)'
            : 'تنظيف فوري للذاكرة والبيانات المؤقتة'
        );
      };
    }

    // Automatically purge old History Logs (> 30 days) on application startup
    // to guarantee permanent fast responsiveness.
    if (this.config.autoCleanExpiredLogsOnStartup !== false) {
      this.runStartupHistoryCleanup();
    }
  }

  private loadConfig(): MemoryCleanupConfig {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(MEMORY_CLEANUP_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            ...DEFAULT_MEMORY_CLEANUP_CONFIG,
            ...parsed,
            historyRetentionDays:
              Math.max(1, Number(parsed?.historyRetentionDays) || DEFAULT_HISTORY_RETENTION_DAYS),
            autoCleanExpiredLogsOnStartup:
              parsed?.autoCleanExpiredLogsOnStartup !== undefined
                ? Boolean(parsed.autoCleanExpiredLogsOnStartup)
                : true,
          };
        }
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_MEMORY_CLEANUP_CONFIG };
  }

  private saveConfig(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MEMORY_CLEANUP_STORAGE_KEY, JSON.stringify(this.config));
      }
    } catch {
      // ignore
    }
  }

  public getConfig(): MemoryCleanupConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<MemoryCleanupConfig>): MemoryCleanupConfig {
    this.config = {
      ...this.config,
      ...partial,
      historyRetentionDays: Math.max(
        1,
        Number(partial.historyRetentionDays ?? this.config.historyRetentionDays) ||
          DEFAULT_HISTORY_RETENTION_DAYS
      ),
    };
    this.saveConfig();
    this.emitChange();
    return { ...this.config };
  }

  public subscribe(listener: (snapshot: MemoryTelemetrySnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((cb) => cb(snap));
  }

  private readJsHeapMetrics(): {
    usedHeapBytes: number | null;
    heapLimitBytes: number | null;
    deviceMemoryGb: number | null;
  } {
    let usedHeapBytes: number | null = null;
    let heapLimitBytes: number | null = null;
    let deviceMemoryGb: number | null = null;

    try {
      if (typeof performance !== 'undefined') {
        const perfMem = (
          performance as unknown as {
            memory?: {
              usedJSHeapSize?: number;
              totalJSHeapSize?: number;
              jsHeapSizeLimit?: number;
            };
          }
        ).memory;
        if (perfMem && typeof perfMem.usedJSHeapSize === 'number') {
          usedHeapBytes = perfMem.usedJSHeapSize;
          heapLimitBytes = perfMem.jsHeapSizeLimit || perfMem.totalJSHeapSize || null;
        }
      }
      if (typeof navigator !== 'undefined') {
        const devMem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
        if (typeof devMem === 'number' && devMem > 0) {
          deviceMemoryGb = devMem;
        }
      }
    } catch {
      // ignore
    }

    return { usedHeapBytes, heapLimitBytes, deviceMemoryGb };
  }

  private getActiveCopiedTraderIdsAndSymbols(): {
    traderIds: string[];
    openSymbols: string[];
  } {
    const traderIds: string[] = [];
    try {
      if (typeof localStorage !== 'undefined') {
        for (const key of ['whale_copied_traders_ct', 'whale_copied_traders_sm']) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const arr: ActiveCopiedTrader[] = JSON.parse(raw);
            if (Array.isArray(arr)) {
              for (const item of arr) {
                if (item?.traderId) traderIds.push(item.traderId);
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }

    const snap = paperEngine.getSnapshot({});
    const openSymbols = snap.positions
      .filter((p) => p.status === 'OPEN')
      .map((p) => p.symbol.toUpperCase());

    return { traderIds, openSymbols };
  }

  public getSnapshot(): MemoryTelemetrySnapshot {
    const { usedHeapBytes, heapLimitBytes, deviceMemoryGb } = this.readJsHeapMetrics();
    const ctStats = getCopyTraderCacheStats();
    const priceStats = getBinancePriceCacheStats();
    const paperStats = paperEngine.getMemoryCacheStats();
    const notificationsCount = mobileNotifications.getNotifications().length;
    const notifKb = Math.round(notificationsCount * 0.65);

    const totalEstimatedCacheKb = Math.max(
      1,
      ctStats.estimatedKb + priceStats.estimatedKb + paperStats.estimatedKb + notifKb
    );
    const totalCachedItems =
      ctStats.totalEntries +
      priceStats.symbolCount +
      paperStats.closedPositionsCount +
      paperStats.checkpointEntriesCount +
      notificationsCount;

    const evaluation = evaluateMemoryPressure({
      usedHeapBytes,
      heapLimitBytes,
      totalEstimatedCacheKb,
      totalCachedItems,
      deviceMemoryGb,
      config: this.config,
    });

    const retentionDays = Math.max(
      1,
      Number(this.config.historyRetentionDays) || DEFAULT_HISTORY_RETENTION_DAYS
    );

    return {
      config: { ...this.config, historyRetentionDays: retentionDays },
      usedHeapMb:
        usedHeapBytes !== null ? Number((usedHeapBytes / (1024 * 1024)).toFixed(1)) : null,
      heapLimitMb:
        heapLimitBytes !== null ? Number((heapLimitBytes / (1024 * 1024)).toFixed(0)) : null,
      deviceMemoryGb,
      utilizationPercent: evaluation.utilizationPercent,
      effectiveMaxCacheKb: evaluation.effectiveMaxCacheKb,
      totalEstimatedCacheKb,
      totalCachedItems,
      copyTraderCacheEntries: ctStats.totalEntries,
      priceCacheSymbols: priceStats.symbolCount,
      closedHistoryItems: paperStats.closedPositionsCount + paperStats.checkpointEntriesCount,
      notificationsCount,
      cleanupRunCount: this.cleanupRunCount,
      totalItemsFreed: this.totalItemsFreed,
      totalKbFreed: this.totalKbFreed,
      lastCleanupAt: this.lastCleanupAt,
      lastCleanupReasonAr: this.lastCleanupReasonAr,
      historyRetentionDays: retentionDays,
      startupCleanupExecuted: this.startupCleanupExecuted,
      lastStartupCleanupAt: this.lastStartupCleanupAt,
      expiredHistoryLogsPurgedCount: this.expiredHistoryLogsPurgedCount,
    };
  }

  /**
   * Automatically cleans up old History Logs (Closed trades, trader sync checkpoints,
   * stale pending choices, mobile notifications log, and KuCoin execution orders)
   * that exceeded 30 days (`historyRetentionDays`) at application startup
   * to guarantee permanent fast responsiveness.
   */
  public runStartupHistoryCleanup(options?: {
    nowMs?: number;
    retentionDays?: number;
    force?: boolean;
  }): StartupHistoryCleanupResult {
    const nowMs = options?.nowMs ?? Date.now();
    const retentionDays = Math.max(
      1,
      Number(options?.retentionDays ?? this.config.historyRetentionDays) ||
        DEFAULT_HISTORY_RETENTION_DAYS
    );
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
    const cutoffTimestamp = nowMs - maxAgeMs;

    if (!options?.force && this.config.autoCleanExpiredLogsOnStartup === false) {
      return {
        executed: false,
        retentionDays,
        cutoffTimestamp,
        removedClosedPositions: 0,
        removedCheckpoints: 0,
        removedStaleChoices: 0,
        removedNotifications: 0,
        removedKuCoinOrders: 0,
        totalExpiredLogsRemoved: 0,
        timestamp: nowMs,
        reasonAr: 'تنظيف السجلات القديمة عند بدء التشغيل متوقف من الإعدادات',
      };
    }

    // 1. Purge >30-day closed positions, old per-symbol sync checkpoints, and stale choices in PaperEngine
    const paperPurge = paperEngine.purgeExpiredHistoryLogs(maxAgeMs, nowMs);

    // 2. Purge >30-day mobile trade notification logs
    const removedNotifications = mobileNotifications.purgeExpiredNotifications(maxAgeMs, nowMs);

    // 3. Purge >30-day KuCoin execution order history logs
    const removedKuCoinOrders = purgeExpiredKuCoinOrderHistory(maxAgeMs, nowMs);

    const totalExpiredLogsRemoved =
      paperPurge.totalRemoved + removedNotifications + removedKuCoinOrders;

    this.startupCleanupExecuted = true;
    this.lastStartupCleanupAt = nowMs;
    this.expiredHistoryLogsPurgedCount += totalExpiredLogsRemoved;

    const reasonAr =
      totalExpiredLogsRemoved > 0
        ? `تنظيف تلقائي عند بدء التشغيل: تم حذف ${totalExpiredLogsRemoved} سجل قديم تجاوز ${retentionDays} يوماً`
        : `فحص بدء التشغيل مكتمل: لا توجد سجلات قديمة تتجاوز ${retentionDays} يوماً`;

    if (totalExpiredLogsRemoved > 0) {
      const freedKb = Math.max(4, Math.round(totalExpiredLogsRemoved * 0.85));
      this.cleanupRunCount += 1;
      this.totalItemsFreed += totalExpiredLogsRemoved;
      this.totalKbFreed += freedKb;
      this.lastCleanupAt = nowMs;
      this.lastCleanupReasonAr = reasonAr;
    } else if (!this.lastCleanupReasonAr) {
      this.lastCleanupAt = nowMs;
      this.lastCleanupReasonAr = reasonAr;
    }

    this.emitChange();

    return {
      executed: true,
      retentionDays,
      cutoffTimestamp,
      removedClosedPositions: paperPurge.removedClosedPositions,
      removedCheckpoints: paperPurge.removedCheckpoints,
      removedStaleChoices: paperPurge.removedStaleChoices,
      removedNotifications,
      removedKuCoinOrders,
      totalExpiredLogsRemoved,
      timestamp: nowMs,
      reasonAr,
    };
  }

  /**
   * Periodically called by CentralizedSyncScheduler or at startup to check memory pressure and evict stale caches.
   */
  public checkAndCleanupIfNeeded(
    triggerSource: 'PERIODIC' | 'VISIBILITY_HIDDEN' | 'OS_LOW_MEMORY' | 'STARTUP' = 'PERIODIC'
  ): MemoryCleanupResult {
    if (triggerSource === 'STARTUP') {
      const startupRes = this.runStartupHistoryCleanup();
      return {
        executed: startupRes.executed,
        mode: 'STARTUP',
        freedItemsCount: startupRes.totalExpiredLogsRemoved,
        freedEstimatedKb: Math.max(
          startupRes.totalExpiredLogsRemoved > 0 ? 4 : 0,
          Math.round(startupRes.totalExpiredLogsRemoved * 0.85)
        ),
        timestamp: startupRes.timestamp,
        reasonAr: startupRes.reasonAr,
      };
    }

    if (!this.config.enabled) {
      return {
        executed: false,
        mode: 'NONE',
        freedItemsCount: 0,
        freedEstimatedKb: 0,
        timestamp: Date.now(),
        reasonAr: 'التنظيف التلقائي غير مفعّل',
      };
    }

    if (triggerSource === 'OS_LOW_MEMORY') {
      return this.performCleanup(
        'AGGRESSIVE',
        'تنبيه انخفاض ذاكرة الجهاز (OS Low Memory) — مسح شامل للكاش المؤقت'
      );
    }

    const { usedHeapBytes, heapLimitBytes, deviceMemoryGb } = this.readJsHeapMetrics();
    const beforeSnap = this.getSnapshot();
    const evaluation = evaluateMemoryPressure({
      usedHeapBytes,
      heapLimitBytes,
      totalEstimatedCacheKb: beforeSnap.totalEstimatedCacheKb,
      totalCachedItems: beforeSnap.totalCachedItems,
      deviceMemoryGb,
      config: this.config,
    });

    if (evaluation.shouldCleanup) {
      return this.performCleanup(
        evaluation.mode === 'AGGRESSIVE' ? 'AGGRESSIVE' : 'SOFT',
        evaluation.reasonAr
      );
    }

    // Even when below threshold, perform a lightweight TTL eviction of expired non-copied trader cache entries
    const { traderIds } = this.getActiveCopiedTraderIdsAndSymbols();
    const maxAgeMs = this.config.lowEndDeviceMode ? 25_000 : 45_000;
    const maxEntries = this.config.lowEndDeviceMode ? 6 : 12;
    const expiredEvicted = cleanupCopyTraderCaches({
      keepPortfolioIds: traderIds,
      maxAgeMs,
      maxEntries,
      forceClearAll: false,
    });

    if (expiredEvicted > 0) {
      const freedKb = Math.max(4, expiredEvicted * 10);
      this.cleanupRunCount += 1;
      this.totalItemsFreed += expiredEvicted;
      this.totalKbFreed += freedKb;
      this.lastCleanupAt = Date.now();
      this.lastCleanupReasonAr = 'تنظيف دوري للسجلات المؤقتة المنتهية الصلاحية (TTL Eviction)';
      this.emitChange();
      return {
        executed: true,
        mode: 'SOFT',
        freedItemsCount: expiredEvicted,
        freedEstimatedKb: freedKb,
        timestamp: this.lastCleanupAt,
        reasonAr: this.lastCleanupReasonAr,
      };
    }

    return {
      executed: false,
      mode: 'NONE',
      freedItemsCount: 0,
      freedEstimatedKb: 0,
      timestamp: Date.now(),
      reasonAr: evaluation.reasonAr,
    };
  }

  /**
   * Executes an immediate SOFT, AGGRESSIVE, or MANUAL memory cleanup across all caches
   * and also purges any History Logs older than 30 days (`historyRetentionDays`).
   * Never deletes active virtual accounts or OPEN positions.
   */
  public performCleanup(
    mode: 'SOFT' | 'AGGRESSIVE' | 'MANUAL' = 'MANUAL',
    customReasonAr?: string
  ): MemoryCleanupResult {
    const beforeSnap = this.getSnapshot();
    const { traderIds, openSymbols } = this.getActiveCopiedTraderIdsAndSymbols();
    const isDeep = mode === 'AGGRESSIVE' || mode === 'MANUAL';
    const retentionDays = Math.max(
      1,
      Number(this.config.historyRetentionDays) || DEFAULT_HISTORY_RETENTION_DAYS
    );
    const maxHistoryAgeMs = retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // 1. Clean up Copy Trading & Smart Money API caches
    const freedTraderEntries = cleanupCopyTraderCaches({
      keepPortfolioIds: isDeep ? [] : traderIds,
      maxAgeMs: isDeep ? 0 : this.config.lowEndDeviceMode ? 20_000 : 35_000,
      maxEntries: isDeep ? 0 : this.config.lowEndDeviceMode ? 5 : 10,
      forceClearAll: isDeep,
    });

    // 2. Clean up non-watched Binance price cache symbols
    const freedPriceSymbols = cleanupBinancePriceCache({
      keepSymbols: openSymbols,
      forceClearAll: false,
    });

    // 3. Trim excess historical closed positions, sync checkpoints, and >30-day logs in PaperEngine
    const freedPaperItems = paperEngine.trimHistoricalMemoryCache({
      maxClosedPerAccount: isDeep ? 35 : this.config.lowEndDeviceMode ? 40 : 60,
      maxCheckpointItems: isDeep ? 80 : 120,
      maxDismissedChoices: isDeep ? 60 : 100,
      maxHistoryAgeMs,
      nowMs: now,
    });

    // 4. Trim old read notifications and >30-day notification logs in MobileNotificationService
    const freedNotifs = mobileNotifications.trimNotificationsCache(
      isDeep ? 25 : this.config.lowEndDeviceMode ? 30 : 45,
      maxHistoryAgeMs,
      now
    );

    // 5. Purge >30-day KuCoin order history logs
    const freedKuCoinOrders = purgeExpiredKuCoinOrderHistory(maxHistoryAgeMs, now);

    // 6. Notify Android Native APK bridge if available to clear WebView transient cache & run GC
    try {
      const win = typeof window !== 'undefined' ? (window as unknown as {
        AndroidAppControl?: { performNativeMemoryCleanup?: () => void };
      }) : null;
      win?.AndroidAppControl?.performNativeMemoryCleanup?.();
    } catch {
      // ignore
    }

    const afterSnap = this.getSnapshot();
    const freedItemsCount =
      freedTraderEntries + freedPriceSymbols + freedPaperItems + freedNotifs + freedKuCoinOrders;
    const freedEstimatedKb = Math.max(
      freedItemsCount > 0 ? 8 : 0,
      beforeSnap.totalEstimatedCacheKb - afterSnap.totalEstimatedCacheKb
    );

    this.cleanupRunCount += 1;
    this.totalItemsFreed += freedItemsCount;
    this.totalKbFreed += freedEstimatedKb;
    this.lastCleanupAt = now;
    this.lastCleanupReasonAr =
      customReasonAr ||
      (mode === 'MANUAL'
        ? 'تنظيف يدوي فوري للكاش والسجلات الأقدم من 30 يوماً'
        : mode === 'AGGRESSIVE'
        ? 'تنظيف عميق تلقائي عند وصول الذاكرة للحد الأعلى'
        : 'تنظيف دوري تلقائي للبيانات المؤقتة والسجلات القديمة');

    this.emitChange();

    return {
      executed: true,
      mode,
      freedItemsCount,
      freedEstimatedKb,
      timestamp: now,
      reasonAr: this.lastCleanupReasonAr,
    };
  }
}

export const memoryCleanupService = new MemoryCleanupService();
