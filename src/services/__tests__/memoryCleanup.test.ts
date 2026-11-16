import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEffectiveCacheLimitKb,
  evaluateMemoryPressure,
  memoryCleanupService,
  MemoryCleanupConfig,
} from '../memoryCleanup';
import { paperEngine } from '../paperTrading';

const baseConfig: MemoryCleanupConfig = {
  enabled: true,
  heapThresholdPercent: 70,
  maxCacheSizeKb: 400,
  periodicIntervalSeconds: 30,
  lowEndDeviceMode: false,
};

describe('MemoryCleanupService & Pure Evaluation Logic (v2.14)', () => {
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
});
