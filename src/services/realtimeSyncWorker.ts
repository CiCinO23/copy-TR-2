/**
 * Centralized Background Scheduler & Real-Time Sync Worker
 *
 * Manages all periodic synchronization tasks (copied-traders sync, market metadata refresh,
 * exchange ping probes, Service Worker heartbeats, and Android Native heartbeats) from a single coordinator.
 *
 * Key responsibilities:
 * 1. Properly cleans up (clearInterval) and reconfigures all interval handles whenever
 *    the app's visibilityState changes ('visible' <-> 'hidden'), preventing stacked timers,
 *    queued main-thread timer bursts, and resource conflicts.
 * 2. Pauses foreground-only tasks (such as heavy 24h market metadata polling) while hidden
 *    so background bandwidth and sockets are reserved exclusively for copied-trader & whale execution.
 * 3. Detects OS sleep / Android Doze / iOS background clock drift inside both the dedicated
 *    Blob Worker and main thread, firing an immediate urgent resync on wakeup.
 * 4. Coalesces/debounces duplicate wakeup events ('visibilitychange', 'focus', 'pageshow', 'online')
 *    while honoring urgent trade alerts ('SW_DETECTED_TRADE_UPDATE', 'SW_FORCE_SYNC_NOW', 'native_resume').
 */

import { detectSleepWakeupDrift } from './syncResilience';

export type AppVisibilityState = 'visible' | 'hidden';

export interface SyncTickMeta {
  reason: string;
  urgent: boolean;
}

export interface ScheduledSyncTaskConfig {
  id: string;
  intervalMs: number;
  hiddenIntervalMs?: number;
  runWhenHidden: boolean;
  runOnWakeup?: boolean;
  minDedupGapMs?: number;
  onTick: (meta?: SyncTickMeta) => void | Promise<void>;
}

export interface CentralizedSchedulerOptions {
  shouldPauseAll?: () => boolean;
  onServiceWorkerNotificationClick?: (data: { accountId?: string | null; url?: string }) => void;
  onServiceWorkerHeartbeatAck?: () => void;
  onVisibilityStateChange?: (state: AppVisibilityState) => void;
  onWakeupSync?: (reason: string) => void;
  wakeupDebounceMs?: number;
  enableBlobWorker?: boolean;
}

export interface SchedulerDiagnostics {
  isRunning: boolean;
  visibilityState: AppVisibilityState;
  registeredTaskIds: string[];
  activeIntervalTaskIds: string[];
  activeListenerCount: number;
  workerActive: boolean;
  wakeupCount: number;
  sleepDriftCount: number;
}

interface InternalTaskEntry extends ScheduledSyncTaskConfig {
  lastTickAt: number;
  intervalHandle: ReturnType<typeof setInterval> | null;
}

export class CentralizedSyncScheduler {
  private tasks: Map<string, InternalTaskEntry> = new Map();
  private listenerCleanups: Array<() => void> = [];
  private worker: Worker | null = null;
  private workerBlobUrl: string | null = null;
  private isRunning: boolean = false;
  private visibilityState: AppVisibilityState = 'visible';
  private lastWakeupAt: number = 0;
  private wakeupCount: number = 0;
  private sleepDriftCount: number = 0;
  private lastMainClockCheckAt: number = Date.now();
  private options: Required<
    Pick<CentralizedSchedulerOptions, 'wakeupDebounceMs' | 'enableBlobWorker'>
  > &
    CentralizedSchedulerOptions;

  constructor(options: CentralizedSchedulerOptions = {}) {
    this.options = {
      wakeupDebounceMs: options.wakeupDebounceMs ?? 450,
      enableBlobWorker: options.enableBlobWorker ?? true,
      ...options,
    };
    this.visibilityState = this.readDocumentVisibility();
  }

  private readDocumentVisibility(): AppVisibilityState {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return 'hidden';
    }
    return 'visible';
  }

  /**
   * Register or update a periodic synchronization task.
   */
  public registerTask(config: ScheduledSyncTaskConfig): void {
    const existing = this.tasks.get(config.id);
    if (existing?.intervalHandle) {
      clearInterval(existing.intervalHandle);
      existing.intervalHandle = null;
    }

    const entry: InternalTaskEntry = {
      ...config,
      intervalMs: Math.max(1000, config.intervalMs),
      hiddenIntervalMs: Math.max(1000, config.hiddenIntervalMs ?? config.intervalMs),
      runOnWakeup: config.runOnWakeup ?? true,
      minDedupGapMs: config.minDedupGapMs ?? 600,
      lastTickAt: existing?.lastTickAt ?? 0,
      intervalHandle: null,
    };

    this.tasks.set(config.id, entry);

    if (this.isRunning) {
      this.reconcileTaskIntervalsForVisibility();
    }
  }

  /**
   * Unregister a specific task and immediately clean up its interval handle.
   */
  public unregisterTask(id: string): void {
    const entry = this.tasks.get(id);
    if (!entry) return;
    if (entry.intervalHandle) {
      clearInterval(entry.intervalHandle);
      entry.intervalHandle = null;
    }
    this.tasks.delete(id);
    if (this.isRunning) {
      this.syncWorkerIntervalWithTasks();
    }
  }

  /**
   * Start the centralized scheduler, attaching lifecycle listeners and scheduling active tasks.
   */
  public start(): void {
    if (this.isRunning) {
      this.reconcileTaskIntervalsForVisibility();
      return;
    }

    this.isRunning = true;
    this.lastMainClockCheckAt = Date.now();
    this.visibilityState = this.readDocumentVisibility();
    this.initBlobWorkerIfSupported();
    this.attachLifecycleListeners();
    this.reconcileTaskIntervalsForVisibility();
    this.options.onVisibilityStateChange?.(this.visibilityState);
  }

  /**
   * Stop the scheduler and deterministically clean up all listeners, interval handles, and workers.
   */
  public stop(): void {
    this.isRunning = false;
    this.clearAllIntervalHandles();
    this.detachLifecycleListeners();
    this.terminateBlobWorker();
  }

  /**
   * Explicitly transition visibility state ('visible' | 'hidden'), cleaning up all previous
   * interval handles before establishing the new schedule to prevent resource conflicts.
   */
  public handleVisibilityChange(nextState?: AppVisibilityState): void {
    const resolvedState = nextState ?? this.readDocumentVisibility();
    const prevState = this.visibilityState;
    this.visibilityState = resolvedState;

    if (!this.isRunning) return;

    // Inform listeners (such as Service Worker) immediately about background/foreground transition
    if (prevState !== resolvedState) {
      this.options.onVisibilityStateChange?.(resolvedState);
    }

    // 1. Clean up all existing interval handles before reconfiguring for the new visibility state
    this.clearAllIntervalHandles();

    // 2. Establish new non-conflicting interval handles for the current visibility state
    this.reconcileTaskIntervalsForVisibility();

    // 3. If transitioning from hidden -> visible, trigger a single coalesced urgent wakeup sync
    if (prevState === 'hidden' && resolvedState === 'visible') {
      this.triggerWakeupSync('visibilitychange');
    }
  }

  /**
   * Coalesced wakeup trigger invoked by 'visibilitychange', 'focus', 'pageshow', or 'online'.
   */
  public triggerWakeupSync(reason: string = 'manual'): boolean {
    if (!this.isRunning) return false;
    if (this.options.shouldPauseAll?.()) return false;

    const now = Date.now();
    if (now - this.lastWakeupAt < this.options.wakeupDebounceMs) {
      return false;
    }
    this.lastWakeupAt = now;
    this.wakeupCount += 1;
    this.lastMainClockCheckAt = now;

    this.options.onWakeupSync?.(reason);

    for (const task of this.tasks.values()) {
      if (!task.runOnWakeup) continue;
      if (this.visibilityState === 'hidden' && !task.runWhenHidden) continue;
      this.executeTaskTick(task, true, { reason, urgent: true });
    }
    return true;
  }

  /**
   * Urgent background trigger used when the OS wakes from sleep/Doze (clock drift detected),
   * when the Service Worker detects a live trader/whale open or close, or when Android Native
   * background service pulses the WebView. Bypasses stale dedup guards cleanly.
   */
  public triggerUrgentBackgroundSync(reason: string = 'urgent_bg'): void {
    if (!this.isRunning) return;
    if (this.options.shouldPauseAll?.()) return;

    this.lastMainClockCheckAt = Date.now();
    this.options.onWakeupSync?.(reason);

    for (const task of this.tasks.values()) {
      if (!task.runWhenHidden) continue;
      this.executeTaskTick(task, true, { reason, urgent: true });
    }
  }

  /**
   * Trigger a specific task immediately (respecting deduplication unless force=true).
   */
  public triggerTaskNow(taskId: string, force: boolean = true, reason: string = 'manual'): void {
    if (this.options.shouldPauseAll?.()) return;
    const task = this.tasks.get(taskId);
    if (!task) return;
    this.executeTaskTick(task, force, { reason, urgent: force });
  }

  public getDiagnostics(): SchedulerDiagnostics {
    const registeredTaskIds: string[] = [];
    const activeIntervalTaskIds: string[] = [];

    for (const [id, task] of this.tasks.entries()) {
      registeredTaskIds.push(id);
      if (task.intervalHandle !== null) {
        activeIntervalTaskIds.push(id);
      }
    }

    return {
      isRunning: this.isRunning,
      visibilityState: this.visibilityState,
      registeredTaskIds,
      activeIntervalTaskIds,
      activeListenerCount: this.listenerCleanups.length,
      workerActive: this.worker !== null,
      wakeupCount: this.wakeupCount,
      sleepDriftCount: this.sleepDriftCount,
    };
  }

  private executeTaskTick(
    task: InternalTaskEntry,
    force: boolean = false,
    meta: SyncTickMeta = { reason: 'interval', urgent: false }
  ): void {
    if (!this.isRunning) return;
    if (this.options.shouldPauseAll?.()) return;
    if (this.visibilityState === 'hidden' && !task.runWhenHidden) return;

    const now = Date.now();
    const minGap = task.minDedupGapMs ?? 600;
    if (!force && now - task.lastTickAt < minGap) {
      return;
    }
    task.lastTickAt = now;

    try {
      const result = task.onTick(meta);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {});
      }
    } catch {
      // Prevent task exception from breaking scheduler loop
    }
  }

  private clearAllIntervalHandles(): void {
    for (const task of this.tasks.values()) {
      if (task.intervalHandle !== null) {
        clearInterval(task.intervalHandle);
        task.intervalHandle = null;
      }
    }
  }

  private reconcileTaskIntervalsForVisibility(): void {
    // Always clear existing interval handles first to guarantee zero duplicate timers
    this.clearAllIntervalHandles();

    if (!this.isRunning) return;

    for (const task of this.tasks.values()) {
      if (this.visibilityState === 'hidden') {
        // Do not schedule foreground-only tasks while hidden
        if (!task.runWhenHidden) {
          continue;
        }
        const hiddenMs = task.hiddenIntervalMs ?? task.intervalMs;
        // When a Blob Worker is active, keep a low-frequency main-thread backup watchdog so
        // if a mobile OS suspends the Blob Worker thread, background ticks still recover seamlessly.
        const mainThreadBgIntervalMs =
          this.worker !== null ? Math.max(hiddenMs * 2, 5000) : hiddenMs;
        task.intervalHandle = setInterval(() => {
          const now = Date.now();
          const drift = detectSleepWakeupDrift(
            this.lastMainClockCheckAt,
            now,
            mainThreadBgIntervalMs
          );
          this.lastMainClockCheckAt = now;
          if (drift.drifted) {
            this.sleepDriftCount += 1;
            this.executeTaskTick(task, true, { reason: 'sleep_drift', urgent: true });
          } else {
            this.executeTaskTick(task, false, { reason: 'bg_interval', urgent: false });
          }
        }, mainThreadBgIntervalMs);
      } else {
        // App is visible: schedule clean main-thread interval handle for each task
        task.intervalHandle = setInterval(() => {
          const now = Date.now();
          const drift = detectSleepWakeupDrift(this.lastMainClockCheckAt, now, task.intervalMs);
          this.lastMainClockCheckAt = now;
          if (drift.drifted && task.runWhenHidden) {
            this.sleepDriftCount += 1;
            this.executeTaskTick(task, true, { reason: 'sleep_drift', urgent: true });
          } else {
            this.executeTaskTick(task, false, { reason: 'interval', urgent: false });
          }
        }, task.intervalMs);
      }
    }

    this.syncWorkerIntervalWithTasks();
  }

  private initBlobWorkerIfSupported(): void {
    if (!this.options.enableBlobWorker) return;
    if (this.worker !== null) return;
    if (
      typeof window === 'undefined' ||
      typeof Worker === 'undefined' ||
      typeof Blob === 'undefined'
    ) {
      return;
    }

    try {
      const workerCode = `
        let timer = null;
        let currentMs = 2500;
        let lastTickTs = Date.now();
        function restartTimer() {
          if (timer) clearInterval(timer);
          if (currentMs <= 0) return;
          lastTickTs = Date.now();
          timer = setInterval(() => {
            const now = Date.now();
            const elapsed = now - lastTickTs;
            lastTickTs = now;
            const driftThreshold = Math.max(currentMs * 2.2, currentMs + 3500);
            if (elapsed >= driftThreshold) {
              postMessage({ type: 'WORKER_WAKEUP_DRIFT', ts: now, elapsedMs: elapsed });
            } else {
              postMessage({ type: 'WORKER_TICK', ts: now });
            }
          }, currentMs);
        }
        self.onmessage = function(e) {
          const data = e.data || {};
          if (data.type === 'CONFIGURE_WORKER_INTERVAL') {
            const nextMs = Number(data.intervalMs) || 0;
            if (nextMs !== currentMs) {
              currentMs = nextMs;
              restartTimer();
            }
          } else if (data.type === 'STOP') {
            if (timer) {
              clearInterval(timer);
              timer = null;
            }
          }
        };
        restartTimer();
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      const worker = new Worker(blobUrl);

      worker.onmessage = (ev) => {
        if (ev.data?.type === 'WORKER_WAKEUP_DRIFT') {
          this.sleepDriftCount += 1;
          this.triggerUrgentBackgroundSync('sleep_drift');
        } else if (ev.data?.type === 'WORKER_TICK') {
          this.handleBackgroundWorkerTick();
        }
      };

      this.worker = worker;
      this.workerBlobUrl = blobUrl;
    } catch {
      this.worker = null;
      this.workerBlobUrl = null;
    }
  }

  private handleBackgroundWorkerTick(): void {
    if (!this.isRunning) return;
    if (this.options.shouldPauseAll?.()) return;

    this.lastMainClockCheckAt = Date.now();
    for (const task of this.tasks.values()) {
      if (!task.runWhenHidden) continue;
      // When visible, the main-thread interval is already active; executeTaskTick deduplicates via minDedupGapMs
      this.executeTaskTick(task, false, { reason: 'worker_tick', urgent: false });
    }
  }

  private syncWorkerIntervalWithTasks(): void {
    if (!this.worker) return;
    let fastestBgMs = 0;
    for (const task of this.tasks.values()) {
      if (task.runWhenHidden) {
        const ms =
          this.visibilityState === 'hidden'
            ? task.hiddenIntervalMs ?? task.intervalMs
            : task.intervalMs;
        if (fastestBgMs === 0 || ms < fastestBgMs) {
          fastestBgMs = ms;
        }
      }
    }
    try {
      this.worker.postMessage({
        type: 'CONFIGURE_WORKER_INTERVAL',
        intervalMs: fastestBgMs,
      });
    } catch {
      // ignore
    }
  }

  private terminateBlobWorker(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'STOP' });
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    if (this.workerBlobUrl) {
      try {
        URL.revokeObjectURL(this.workerBlobUrl);
      } catch {
        // ignore
      }
      this.workerBlobUrl = null;
    }
  }

  private attachLifecycleListeners(): void {
    // Clean up any prior listeners first to prevent duplicate attachments
    this.detachLifecycleListeners();

    if (typeof document !== 'undefined') {
      const onVisibilityChange = () => {
        this.handleVisibilityChange(this.readDocumentVisibility());
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      this.listenerCleanups.push(() => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      });
    }

    if (typeof window !== 'undefined') {
      const onOnline = () => this.triggerWakeupSync('online');
      const onFocus = () => {
        if (this.readDocumentVisibility() === 'visible') {
          this.triggerWakeupSync('focus');
        }
      };
      const onPageShow = () => {
        this.handleVisibilityChange('visible');
        this.triggerWakeupSync('pageshow');
      };

      window.addEventListener('online', onOnline);
      window.addEventListener('focus', onFocus);
      window.addEventListener('pageshow', onPageShow);

      // Register Android Native background service heartbeat hook centrally
      const prevHeartbeat = window.__copyTrNativeHeartbeat;
      window.__copyTrNativeHeartbeat = (source?: string) => {
        if (this.options.shouldPauseAll?.()) return;
        const isUrgentResume = source === 'native_resume' || source === 'native_urgent';
        if (isUrgentResume) {
          this.triggerUrgentBackgroundSync('native_resume');
          return;
        }
        for (const task of this.tasks.values()) {
          if (task.runWhenHidden) {
            this.executeTaskTick(task, true, { reason: source || 'native_heartbeat', urgent: true });
          }
        }
      };

      this.listenerCleanups.push(() => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pageshow', onPageShow);
        if (window.__copyTrNativeHeartbeat !== prevHeartbeat) {
          window.__copyTrNativeHeartbeat = prevHeartbeat;
        }
      });
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const onSwMessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'SW_DETECTED_TRADE_UPDATE' || data.type === 'SW_FORCE_SYNC_NOW') {
          this.options.onServiceWorkerHeartbeatAck?.();
          this.triggerUrgentBackgroundSync(
            data.type === 'SW_DETECTED_TRADE_UPDATE' ? 'sw_trade_detected' : 'sw_force_sync'
          );
        } else if (data.type === 'SW_BACKGROUND_HEARTBEAT') {
          this.options.onServiceWorkerHeartbeatAck?.();
          if (!this.options.shouldPauseAll?.()) {
            for (const task of this.tasks.values()) {
              if (task.runWhenHidden) {
                this.executeTaskTick(task, false, { reason: 'sw_heartbeat', urgent: false });
              }
            }
          }
        } else if (data.type === 'NOTIFICATION_CLICKED_FROM_LOCKSCREEN') {
          this.options.onServiceWorkerNotificationClick?.(data.data || {});
        }
      };

      navigator.serviceWorker.addEventListener('message', onSwMessage);
      this.listenerCleanups.push(() => {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      });
    }
  }

  private detachLifecycleListeners(): void {
    while (this.listenerCleanups.length > 0) {
      const cleanup = this.listenerCleanups.pop();
      try {
        cleanup?.();
      } catch {
        // ignore
      }
    }
  }
}

export function createCentralizedSyncScheduler(
  options?: CentralizedSchedulerOptions
): CentralizedSyncScheduler {
  return new CentralizedSyncScheduler(options);
}

/**
 * Legacy-compatible single-task wrapper around CentralizedSyncScheduler
 */
export interface RealtimeSyncTickerHandle {
  stop: () => void;
  setIntervalMs: (intervalMs: number) => void;
  triggerNow: () => void;
}

export function startRealtimeSyncTicker(
  onTick: () => void,
  initialIntervalMs: number = 4500
): RealtimeSyncTickerHandle {
  const scheduler = new CentralizedSyncScheduler();
  const taskId = 'default-realtime-sync';
  scheduler.registerTask({
    id: taskId,
    intervalMs: initialIntervalMs,
    hiddenIntervalMs: initialIntervalMs,
    runWhenHidden: true,
    runOnWakeup: true,
    onTick,
  });
  scheduler.start();

  return {
    stop: () => scheduler.stop(),
    setIntervalMs: (nextMs: number) => {
      scheduler.registerTask({
        id: taskId,
        intervalMs: nextMs,
        hiddenIntervalMs: nextMs,
        runWhenHidden: true,
        runOnWakeup: true,
        onTick,
      });
    },
    triggerNow: () => scheduler.triggerTaskNow(taskId, true),
  };
}
