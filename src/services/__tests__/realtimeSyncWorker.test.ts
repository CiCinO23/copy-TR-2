import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCentralizedSyncScheduler } from '../realtimeSyncWorker';

describe('CentralizedSyncScheduler (Global Sync Interval & Visibility Lifecycle Management)', () => {
  it('cleans up foreground-only interval handles when hidden and restores them when visible', () => {
    let copiedTraderTicks = 0;
    let marketMetadataTicks = 0;

    const scheduler = createCentralizedSyncScheduler({
      enableBlobWorker: false,
      wakeupDebounceMs: 500,
    });

    scheduler.registerTask({
      id: 'copied-traders-sync',
      intervalMs: 4500,
      hiddenIntervalMs: 5000,
      runWhenHidden: true,
      runOnWakeup: true,
      onTick: () => {
        copiedTraderTicks += 1;
      },
    });

    scheduler.registerTask({
      id: 'market-metadata-sync',
      intervalMs: 15000,
      runWhenHidden: false,
      runOnWakeup: true,
      onTick: () => {
        marketMetadataTicks += 1;
      },
    });

    scheduler.start();

    const visibleDiag = scheduler.getDiagnostics();
    assert.equal(visibleDiag.isRunning, true);
    assert.equal(visibleDiag.visibilityState, 'visible');
    assert.deepEqual(visibleDiag.activeIntervalTaskIds, [
      'copied-traders-sync',
      'market-metadata-sync',
    ]);

    // Switch to hidden: foreground-only market-metadata-sync interval handle must be cleaned up
    scheduler.handleVisibilityChange('hidden');
    const hiddenDiag = scheduler.getDiagnostics();
    assert.equal(hiddenDiag.visibilityState, 'hidden');
    assert.deepEqual(hiddenDiag.activeIntervalTaskIds, ['copied-traders-sync']);

    // Triggering market-metadata-sync while hidden must be blocked
    scheduler.triggerTaskNow('market-metadata-sync', true);
    assert.equal(marketMetadataTicks, 0);

    // Switch back to visible: both interval handles restored and a single coalesced wakeup fires
    scheduler.handleVisibilityChange('visible');
    const restoredDiag = scheduler.getDiagnostics();
    assert.equal(restoredDiag.visibilityState, 'visible');
    assert.deepEqual(restoredDiag.activeIntervalTaskIds, [
      'copied-traders-sync',
      'market-metadata-sync',
    ]);
    assert.equal(restoredDiag.wakeupCount, 1);
    assert.equal(copiedTraderTicks, 1);
    assert.equal(marketMetadataTicks, 1);

    // Rapid duplicate wakeup calls within debounce window must be coalesced (no resource conflict)
    const firedFocus = scheduler.triggerWakeupSync('focus');
    const firedPageShow = scheduler.triggerWakeupSync('pageshow');
    assert.equal(firedFocus, false);
    assert.equal(firedPageShow, false);
    assert.equal(copiedTraderTicks, 1);
    assert.equal(marketMetadataTicks, 1);

    // Stop scheduler: all interval handles and listeners must be cleaned up
    scheduler.stop();
    const stoppedDiag = scheduler.getDiagnostics();
    assert.equal(stoppedDiag.isRunning, false);
    assert.deepEqual(stoppedDiag.activeIntervalTaskIds, []);
    assert.equal(stoppedDiag.activeListenerCount, 0);
  });

  it('unregisters individual tasks and cleans up their interval handles cleanly', () => {
    const scheduler = createCentralizedSyncScheduler({
      enableBlobWorker: false,
    });

    scheduler.registerTask({
      id: 'task-a',
      intervalMs: 3000,
      runWhenHidden: true,
      onTick: () => {},
    });
    scheduler.registerTask({
      id: 'task-b',
      intervalMs: 6000,
      runWhenHidden: false,
      onTick: () => {},
    });

    scheduler.start();
    assert.deepEqual(scheduler.getDiagnostics().activeIntervalTaskIds, ['task-a', 'task-b']);

    scheduler.unregisterTask('task-b');
    assert.deepEqual(scheduler.getDiagnostics().activeIntervalTaskIds, ['task-a']);

    scheduler.stop();
    assert.deepEqual(scheduler.getDiagnostics().activeIntervalTaskIds, []);
  });
});
