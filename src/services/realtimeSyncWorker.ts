/**
 * Centralized Background Scheduler & Real-Time Sync Worker
 *
 * Manages all periodic synchronization tasks (copied-traders sync, market metadata refresh,
 * Service Worker heartbeats, and Android Native heartbeats) from a single coordinator.
 *
 * Key responsibilities:
 * 1. Properly cleans up (clearInterval) and reconfigures all interval handles whenever
 *    the app's visibilityState changes ('visible' <-> 'hidden'), preventing stacked timers,
 *    queued main-thread timer bursts, and resource conflicts.
 * 2. Pauses foreground-only tasks (such as heavy 24h market metadata polling) while hidden
 *    so background bandwidth and sockets are reserved exclusively for copied-trader execution.
 * 3. Coalesces/debounces wakeup events ('visibilitychange', 'focus', 'pageshow', 'online')
 *    so returning to the app triggers a single clean sync cycle instead of overlapping bursts.
 * 4. Tracks all registered event listeners and interval/worker handles for deterministic cleanup.
 */

export type AppVisibilityState = 'visible' | 'hidden';

export interface ScheduledSyncTaskConfig {
  id: string;
  intervalMs: number;
  hiddenIntervalMs?: number;
  runWhenHidden: boolean;
  runOnWakeup?: boolean;
  minDedupGapMs?: number;
  onTick: () => void | Promise<void>;
}

export interface CentralizedSchedulerOptions {
  shouldPauseAll?: () => boolean;
  onServiceWorkerNotificationClick?: (data: { accountId?: string | null; url?: string }) => void;
  onServiceWorkerHeartbeatAck?: () => void;
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
  private options: Required<
    Pick<CentralizedSchedulerOptions, 'wakeupDebounceMs' | 'enableBlobWorker'>
  > &
    CentralizedSchedulerOptions;

  constructor(options: CentralizedSchedulerOptions = {}) {
    this.options = {
      wakeupDebounceMs: options.wakeupDebounceMs ?? 1200,
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
      minDedupGapMs: config.minDedupGapMs ?? 850,
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
    this.visibilityState = this.readDocumentVisibility();
    this.initBlobWorkerIfSupported();
    this.attachLifecycleListeners();
    this.reconcileTaskIntervalsForVisibility();
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

    // 1. Clean up all existing interval handles before reconfiguring for the new visibility state
    this.clearAllIntervalHandles();

    // 2. Establish new non-conflicting interval handles for the current visibility state
    this.reconcileTaskIntervalsForVisibility();

    // 3. If transitioning from hidden -> visible, trigger a single coalesced wakeup sync
    if (prevState === 'hidden' && resolvedState === 'visible') {
      this.triggerWakeupSync('visibilitychange');
    }
  }

  /**
   * Coalesced wakeup trigger invoked by 'visibilitychange', 'focus', 'pageshow', or 'online'.
   */
  public triggerWakeupSync(_reason: string = 'manual'): boolean {
    if (!this.isRunning) return false;
    if (this.options.shouldPauseAll?.()) return false;

    const now = Date.now();
    if (now - this.lastWakeupAt < this.options.wakeupDebounceMs) {
      return false;
    }
    this.lastWakeupAt = now;
    this.wakeupCount += 1;

    for (const task of this.tasks.values()) {
      if (!task.runOnWakeup) continue;
      if (this.visibilityState === 'hidden' && !task.runWhenHidden) continue;
      this.executeTaskTick(task, true);
    }
    return true;
  }

  /**
   * Trigger a specific task immediately (respecting deduplication unless force=true).
   */
  public triggerTaskNow(taskId: string, force: boolean = true): void {
    if (this.options.shouldPauseAll?.()) return;
    const task = this.tasks.get(taskId);
    if (!task) return;
    this.executeTaskTick(task, force);
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
    };
  }

  private executeTaskTick(task: InternalTaskEntry, force: boolean = false): void {
    if (!this.isRunning) return;
    if (this.options.shouldPauseAll?.()) return;
    if (this.visibilityState === 'hidden' && !task.runWhenHidden) return;

    const now = Date.now();
    const minGap = task.minDedupGapMs ?? 850;
    if (!force && now - task.lastTickAt < minGap) {
      return;
    }
    task.lastTickAt = now;

    try {
      const result = task.onTick();
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
        // When hidden and a dedicated Blob Worker is active, let the Worker drive background ticks
        // so the browser does not queue main-thread setInterval callbacks and burst-fire them on wakeup.
        if (this.worker !== null) {
          continue;
        }
        const hiddenMs = task.hiddenIntervalMs ?? task.intervalMs;
        task.intervalHandle = setInterval(() => {
          this.executeTaskTick(task, false);
        }, hiddenMs);
      } else {
        // App is visible: schedule clean main-thread interval handle for each task
        task.intervalHandle = setInterval(() => {
          this.executeTaskTick(task, false);
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
        let currentMs = 4500;
        function restartTimer() {
          if (timer) clearInterval(timer);
          if (currentMs <= 0) return;
          timer = setInterval(() => {
            postMessage({ type: 'WORKER_TICK', ts: Date.now() });
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
        if (ev.data?.type === 'WORKER_TICK') {
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

    for (const task of this.tasks.values()) {
      if (!task.runWhenHidden) continue;
      // When visible, the main-thread interval is already active; executeTaskTick deduplicates via minDedupGapMs
      this.executeTaskTick(task, false);
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
      window.__copyTrNativeHeartbeat = () => {
        if (this.options.shouldPauseAll?.()) return;
        for (const task of this.tasks.values()) {
          if (task.runWhenHidden) {
            this.executeTaskTick(task, false);
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
        if (data.type === 'SW_BACKGROUND_HEARTBEAT' || data.type === 'SW_DETECTED_TRADE_UPDATE') {
          this.options.onServiceWorkerHeartbeatAck?.();
          if (!this.options.shouldPauseAll?.()) {
            for (const task of this.tasks.values()) {
              if (task.runWhenHidden) {
                this.executeTaskTick(task, false);
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
