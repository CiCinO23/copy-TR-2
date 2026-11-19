import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPingHealth,
  detectSleepWakeupDrift,
  shouldAbortStaleInFlightSync,
  appendCacheBuster,
} from '../syncResilience';
import { createCentralizedSyncScheduler } from '../realtimeSyncWorker';

describe('syncResilience (Separate Exchange Pings & Sleep/Background Trade Sync)', () => {
  it('classifies Binance and KuCoin ping health independently (good, warn, bad, offline)', () => {
    assert.deepEqual(classifyPingHealth(true, 42), { status: 'good', labelMs: '42ms' });
    assert.deepEqual(classifyPingHealth(true, 350), { status: 'good', labelMs: '350ms' });
    assert.deepEqual(classifyPingHealth(true, 520), { status: 'warn', labelMs: '520ms' });
    assert.deepEqual(classifyPingHealth(true, 1120), { status: 'bad', labelMs: '1120ms' });
    assert.deepEqual(classifyPingHealth(false, 80), { status: 'offline', labelMs: '--' });
    assert.deepEqual(classifyPingHealth(true, null), { status: 'offline', labelMs: '--' });
    assert.deepEqual(classifyPingHealth(true, undefined), { status: 'offline', labelMs: '--' });
  });

  it('detects OS sleep / Android Doze wall-clock drift accurately', () => {
    const base = 1_700_000_000_000;
    // Normal 2.5s background tick -> no drift
    const normal = detectSleepWakeupDrift(base, base + 2600, 2500);
    assert.equal(normal.drifted, false);
    assert.equal(normal.elapsedMs, 2600);

    // Phone slept for 45s while hidden -> drift detected!
    const slept = detectSleepWakeupDrift(base, base + 45_000, 2500);
    assert.equal(slept.drifted, true);
    assert.equal(slept.elapsedMs, 45_000);

    // Zero or invalid previous tick -> no false positive
    assert.equal(detectSleepWakeupDrift(0, base, 2500).drifted, false);
  });

  it('aborts hung pre-sleep sync immediately on wakeup/urgent alert but preserves fresh normal in-flight sync', () => {
    const start = 1_700_000_000_000;

    // Normal poll while a 3s sync is in flight -> wait (do not abort)
    assert.equal(
      shouldAbortStaleInFlightSync({
        isSyncInFlight: true,
        syncStartedAt: start,
        now: start + 3000,
        isWakeupOrUrgent: false,
      }),
      false
    );

    // Urgent wakeup from sleep while a 3s pre-sleep fetch is stuck -> abort immediately!
    assert.equal(
      shouldAbortStaleInFlightSync({
        isSyncInFlight: true,
        syncStartedAt: start,
        now: start + 3000,
        isWakeupOrUrgent: true,
      }),
      true
    );

    // Deadlocked normal sync > 8s -> force-abort
    assert.equal(
      shouldAbortStaleInFlightSync({
        isSyncInFlight: true,
        syncStartedAt: start,
        now: start + 8500,
        isWakeupOrUrgent: false,
      }),
      true
    );

    // No sync in flight -> never abort
    assert.equal(
      shouldAbortStaleInFlightSync({
        isSyncInFlight: false,
        syncStartedAt: start,
        now: start + 20_000,
        isWakeupOrUrgent: true,
      }),
      false
    );
  });

  it('appends cache-busting _t query parameter safely to GET URLs with or without existing params', () => {
    assert.equal(
      appendCacheBuster('/bapi/futures/v1/friendly/future/copy-trade/lead-data/positions?portfolioId=123', 1700000123),
      '/bapi/futures/v1/friendly/future/copy-trade/lead-data/positions?portfolioId=123&_t=1700000123'
    );
    assert.equal(
      appendCacheBuster('/fapi/v1/ping', 1700000123),
      '/fapi/v1/ping?_t=1700000123'
    );
  });

  it('CentralizedSyncScheduler fires urgent background syncs & notifies visibility transitions cleanly', () => {
    const visibilityEvents: string[] = [];
    const tickMetas: Array<{ reason: string; urgent: boolean }> = [];
    let wakeupHookCalls = 0;

    const scheduler = createCentralizedSyncScheduler({
      enableBlobWorker: false,
      wakeupDebounceMs: 300,
      onVisibilityStateChange: (state) => visibilityEvents.push(state),
      onWakeupSync: () => {
        wakeupHookCalls += 1;
      },
    });

    scheduler.registerTask({
      id: 'copied-traders-sync',
      intervalMs: 1500,
      hiddenIntervalMs: 2500,
      runWhenHidden: true,
      runOnWakeup: true,
      onTick: (meta) => {
        if (meta) tickMetas.push(meta);
      },
    });

    scheduler.registerTask({
      id: 'exchange-ping-sync',
      intervalMs: 8000,
      runWhenHidden: false,
      runOnWakeup: true,
      onTick: () => {},
    });

    scheduler.start();
    assert.deepEqual(visibilityEvents, ['visible']);

    // Transition to hidden: SW must be notified immediately
    scheduler.handleVisibilityChange('hidden');
    assert.deepEqual(visibilityEvents, ['visible', 'hidden']);

    // Urgent background trigger (e.g. SW detected a whale/trader trade while phone is asleep)
    scheduler.triggerUrgentBackgroundSync('sw_trade_detected');
    assert.equal(wakeupHookCalls, 1);
    assert.equal(tickMetas.length, 1);
    assert.deepEqual(tickMetas[0], { reason: 'sw_trade_detected', urgent: true });

    // Immediate second urgent trigger (e.g. sleep drift recovery) must NOT be blocked by debounce
    scheduler.triggerUrgentBackgroundSync('sleep_drift');
    assert.equal(tickMetas.length, 2);
    assert.deepEqual(tickMetas[1], { reason: 'sleep_drift', urgent: true });

    scheduler.stop();
  });
});
