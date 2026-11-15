/**
 * Dedicated Blob Web Worker + MessageChannel heartbeat ticker so copy-trading synchronization
 * continues every few seconds even when the browser tab or mobile app is minimized (in another app)
 * or when the phone screen is locked (bypassing main-thread background setInterval throttling).
 */

export interface RealtimeSyncTickerHandle {
  stop: () => void;
  setIntervalMs: (intervalMs: number) => void;
  triggerNow: () => void;
}

export function startRealtimeSyncTicker(
  onTick: () => void,
  initialIntervalMs: number = 3500
): RealtimeSyncTickerHandle {
  const safeMs = Math.max(1500, initialIntervalMs);
  let lastTickAt = 0;

  const fireTickDeduped = () => {
    const now = Date.now();
    // Prevent duplicate simultaneous ticks within 900ms if both Worker and backup timer fire
    if (now - lastTickAt < 900) return;
    lastTickAt = now;
    try {
      onTick();
    } catch {
      // ignore
    }
  };

  // Backup main-thread interval in case the OS pauses the Worker or vice-versa
  let backupTimer: ReturnType<typeof setInterval> | null = setInterval(fireTickDeduped, safeMs);

  // Use a dedicated Blob Web Worker in browser environments
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
    try {
      const workerCode = `
        let timer = null;
        let currentMs = ${safeMs};
        function restartTimer() {
          if (timer) clearInterval(timer);
          timer = setInterval(() => {
            postMessage({ type: 'TICK', ts: Date.now() });
          }, currentMs);
        }
        self.onmessage = function(e) {
          const data = e.data || {};
          if (data.type === 'SET_INTERVAL') {
            const nextMs = Math.max(1500, Number(data.intervalMs) || 3500);
            if (nextMs !== currentMs) {
              currentMs = nextMs;
              restartTimer();
            }
          } else if (data.type === 'PING') {
            postMessage({ type: 'TICK', ts: Date.now() });
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
        if (ev.data?.type === 'TICK') {
          fireTickDeduped();
        }
      };

      return {
        stop: () => {
          if (backupTimer) {
            clearInterval(backupTimer);
            backupTimer = null;
          }
          try {
            worker.postMessage({ type: 'STOP' });
            worker.terminate();
            URL.revokeObjectURL(blobUrl);
          } catch {
            // ignore
          }
        },
        setIntervalMs: (intervalMs: number) => {
          const nextMs = Math.max(1500, intervalMs);
          if (backupTimer) clearInterval(backupTimer);
          backupTimer = setInterval(fireTickDeduped, nextMs);
          try {
            worker.postMessage({ type: 'SET_INTERVAL', intervalMs: nextMs });
          } catch {
            // ignore
          }
        },
        triggerNow: () => {
          lastTickAt = 0;
          fireTickDeduped();
        },
      };
    } catch {
      // Fallback below if CSP blocks blob workers
    }
  }

  return {
    stop: () => {
      if (backupTimer) {
        clearInterval(backupTimer);
        backupTimer = null;
      }
    },
    setIntervalMs: (intervalMs: number) => {
      const nextMs = Math.max(1500, intervalMs);
      if (backupTimer) clearInterval(backupTimer);
      backupTimer = setInterval(fireTickDeduped, nextMs);
    },
    triggerNow: () => {
      lastTickAt = 0;
      fireTickDeduped();
    },
  };
}
