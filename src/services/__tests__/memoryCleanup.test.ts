import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEffectiveCacheLimitKb,
  evaluateMemoryPressure,
  filterExpiredHistoryLogsByAge,
  memoryCleanupService,
  MemoryCleanupConfig,
  DEFAULT_HISTORY_RETENTION_DAYS,
} from '../memoryCleanup';
import { paperEngine } from '../paperTrading';
import { mobileNotifications } from '../mobileNotifications';

const baseConfig: MemoryCleanupConfig = {
  enabled: true,
  heapThresholdPercent: 70,
  maxCacheSizeKb: 400,
  periodicIntervalSeconds: 30,
  lowEndDeviceMode: false,
  historyRetentionDays: 30,
  autoCleanExpiredLogsOnStartup: true,
};

describe('MemoryCleanupService & Pure Evaluation Logic (v2.14 & v2.19)', () => {
  it('calculates effective cache limit with 35% reduction for low-end devices or RAM <= 4GB', () => {
    assert.equal(calculateEffectiveCacheLimitKb(baseConfig, 8), 400);
    assert.equal(calculateEffectiveCacheLimitKb(baseConfig, 4), 260);
    assert.equal(
      calculateEffectiveCacheLimitKb({ ...baseConfig, lowEndDeviceMode: true }, 8),
      260
    );
  });

  it('returns NONE when memory and cache utilization are within safe limits', () => {
    const res = evaluateMemoryPressure({
      usedHeapBytes: 40 * 1024 * 1024,
      heapLimitBytes: 100 * 1024 * 1024,
      totalEstimatedCacheKb: 120,
      totalCachedItems: 45,
      deviceMemoryGb: 8,
      config: baseConfig,
    });

    assert.equal(res.shouldCleanup, false);
    assert.equal(res.mode, 'NONE');
    assert.equal(res.utilizationPercent, 40);
  });

  it('triggers SOFT cleanup when heap or cache reaches configured threshold (70%)', () => {
    const res = evaluateMemoryPressure({
      usedHeapBytes: 72 * 1024 * 1024,
      heapLimitBytes: 100 * 1024 * 1024,
      totalEstimatedCacheKb: 150,
      totalCachedItems: 60,
      deviceMemoryGb: 8,
      config: baseConfig,
    });

    assert.equal(res.shouldCleanup, true);
    assert.equal(res.mode, 'SOFT');
    assert.equal(res.utilizationPercent, 72);
  });

  it('triggers AGGRESSIVE cleanup when heap reaches critical threshold (>= threshold + 15%) or cache reaches 100%', () => {
    const criticalHeap = evaluateMemoryPressure({
      usedHeapBytes: 88 * 1024 * 1024,
      heapLimitBytes: 100 * 1024 * 1024,
      totalEstimatedCacheKb: 100,
      totalCachedItems: 40,
      deviceMemoryGb: 8,
      config: baseConfig,
    });
    assert.equal(criticalHeap.shouldCleanup, true);
    assert.equal(criticalHeap.mode, 'AGGRESSIVE');

    const fullCache = evaluateMemoryPressure({
      usedHeapBytes: 30 * 1024 * 1024,
      heapLimitBytes: 100 * 1024 * 1024,
      totalEstimatedCacheKb: 420,
      totalCachedItems: 80,
      deviceMemoryGb: 8,
      config: baseConfig,
    });
    assert.equal(fullCache.shouldCleanup, true);
    assert.equal(fullCache.mode, 'AGGRESSIVE');
  });

  it('respects disabled config and does not trigger automatic cleanup', () => {
    const res = evaluateMemoryPressure({
      usedHeapBytes: 92 * 1024 * 1024,
      heapLimitBytes: 100 * 1024 * 1024,
      totalEstimatedCacheKb: 500,
      totalCachedItems: 600,
      deviceMemoryGb: 2,
      config: { ...baseConfig, enabled: false },
    });

    assert.equal(res.shouldCleanup, false);
    assert.equal(res.mode, 'NONE');
  });

  it('executes performCleanup and OS_LOW_MEMORY cleanup while preserving active OPEN positions', () => {
    const openPos = paperEngine.openPosition(
      'BTCUSDT',
      'LONG',
      0.01,
      85000,
      10,
      undefined,
      'MANUAL'
    );
    assert.ok(openPos, 'Should open a test position');

    const beforeOpenCount = paperEngine
      .getSnapshot({ BTCUSDT: 85100 })
      .positions.filter((p) => p.status === 'OPEN').length;
    assert.ok(beforeOpenCount >= 1);

    const manualRes = memoryCleanupService.performCleanup('MANUAL');
    assert.equal(manualRes.executed, true);
    assert.equal(manualRes.mode, 'MANUAL');

    const osLowMemRes = memoryCleanupService.checkAndCleanupIfNeeded('OS_LOW_MEMORY');
    assert.equal(osLowMemRes.executed, true);
    assert.equal(osLowMemRes.mode, 'AGGRESSIVE');

    const afterOpenCount = paperEngine
      .getSnapshot({ BTCUSDT: 85100 })
      .positions.filter((p) => p.status === 'OPEN').length;
    assert.equal(
      afterOpenCount,
      beforeOpenCount,
      'Memory cleanup must never close or delete active OPEN positions'
    );

    const snap = memoryCleanupService.getSnapshot();
    assert.ok(snap.cleanupRunCount >= 2);
    assert.ok(snap.lastCleanupAt !== null);
  });

  it('filterExpiredHistoryLogsByAge removes logs older than 30 days and keeps recent logs (v2.19)', () => {
    const now = Date.UTC(2026, 10, 17, 12, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const sampleLogs = [
      { id: 'log_recent_1', ts: now - 5 * dayMs },
      { id: 'log_recent_29d', ts: now - 29 * dayMs },
      { id: 'log_expired_31d', ts: now - 31 * dayMs },
      { id: 'log_expired_60d', ts: now - 60 * dayMs },
    ];

    const result = filterExpiredHistoryLogsByAge(
      sampleLogs,
      (item) => item.ts,
      now,
      DEFAULT_HISTORY_RETENTION_DAYS
    );

    assert.equal(result.removedCount, 2);
    assert.deepEqual(
      result.kept.map((item) => item.id),
      ['log_recent_1', 'log_recent_29d']
    );
  });

  it('runStartupHistoryCleanup automatically purges >30-day closed trades and notifications while keeping recent history and OPEN positions (v2.19)', () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // 1. Open and close two trades: one closed 40 days ago (expired) and one closed 3 days ago (recent)
    const oldClosedPos = paperEngine.openPosition(
      'ETHUSDT',
      'LONG',
      0.1,
      2500,
      10,
      undefined,
      'MANUAL'
    );
    assert.ok(oldClosedPos);
    paperEngine.closePosition(oldClosedPos.id, 2550);
    // Backdate closeTime and openTime to 40 days ago
    const acc = paperEngine.getAccount();
    const storedOldPos = acc.positions.find((p) => p.id === oldClosedPos.id);
    assert.ok(storedOldPos);
    storedOldPos.openTime = now - 41 * dayMs;
    storedOldPos.closeTime = now - 40 * dayMs;

    const recentClosedPos = paperEngine.openPosition(
      'SOLUSDT',
      'SHORT',
      1,
      190,
      10,
      undefined,
      'MANUAL'
    );
    assert.ok(recentClosedPos);
    paperEngine.closePosition(recentClosedPos.id, 185);
    const storedRecentPos = acc.positions.find((p) => p.id === recentClosedPos.id);
    assert.ok(storedRecentPos);
    storedRecentPos.openTime = now - 4 * dayMs;
    storedRecentPos.closeTime = now - 3 * dayMs;

    // Also open an active position that was opened 45 days ago — it is still OPEN, so it MUST NOT be deleted
    const longRunningOpenPos = paperEngine.openPosition(
      'BNBUSDT',
      'LONG',
      0.5,
      600,
      5,
      undefined,
      'MANUAL'
    );
    assert.ok(longRunningOpenPos);
    const storedOpenPos = acc.positions.find((p) => p.id === longRunningOpenPos.id);
    assert.ok(storedOpenPos);
    storedOpenPos.openTime = now - 45 * dayMs;

    // 2. Backdate an existing notification to 35 days ago (expired) so startup cleanup purges it
    const internalNotifs = (
      mobileNotifications as unknown as {
        notifications: Array<{ id: string; timestamp: number }>;
      }
    ).notifications;
    internalNotifs.push({
      id: 'notif_expired_35d',
      timestamp: now - 35 * dayMs,
    } as any);

    // 3. Run startup history cleanup
    const startupRes = memoryCleanupService.runStartupHistoryCleanup({
      nowMs: now,
      retentionDays: 30,
      force: true,
    });

    assert.equal(startupRes.executed, true);
    assert.equal(startupRes.retentionDays, 30);
    assert.ok(startupRes.removedClosedPositions >= 1, 'Should remove closed trade older than 30 days');
    assert.ok(startupRes.removedNotifications >= 1, 'Should remove notification older than 30 days');
    assert.ok(startupRes.totalExpiredLogsRemoved >= 2);

    // Verify 40-day closed position was removed, 3-day closed position was kept, and 45-day OPEN position was preserved
    const afterPositions = paperEngine.getAccount().positions;
    assert.equal(
      afterPositions.some((p) => p.id === oldClosedPos.id),
      false,
      '40-day-old closed position must be purged on startup'
    );
    assert.equal(
      afterPositions.some((p) => p.id === recentClosedPos.id),
      true,
      '3-day-old closed position must be retained'
    );
    assert.equal(
      afterPositions.some((p) => p.id === longRunningOpenPos.id && p.status === 'OPEN'),
      true,
      'Active OPEN position must never be purged even if opened > 30 days ago'
    );

    const afterNotifs = mobileNotifications.getNotifications();
    assert.equal(
      afterNotifs.some((n) => n.id === 'notif_expired_35d'),
      false,
      '35-day-old notification must be purged on startup'
    );

    const telemetry = memoryCleanupService.getSnapshot();
    assert.equal(telemetry.startupCleanupExecuted, true);
    assert.equal(telemetry.historyRetentionDays, 30);
    assert.ok(telemetry.expiredHistoryLogsPurgedCount >= 2);
  });
});
