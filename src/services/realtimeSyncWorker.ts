/**
 * Dedicated Blob Web Worker heartbeat ticker so copy-trading synchronization continues
 * immediately every few seconds even when the browser tab or mobile app is in the background
 * (bypassing main-thread background setInterval throttling).
 */

export interface RealtimeSyncTickerHandle {
  stop: () => void;
  setIntervalMs: (intervalMs: number) => void;
}

export function startRealtimeSyncTicker(
  onTick: () => void,
  initialIntervalMs: number = 2500
): RealtimeSyncTickerHandle {
  const safeMs = Math.max(1500, initialIntervalMs);

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
            const nextMs = Math.max(1500, Number(data.intervalMs) || 2500);
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
        if (ev.data?.type === 'TICK') {
          onTick();
        }
      };

      return {
        stop: () => {
          try {
            worker.postMessage({ type: 'STOP' });
            worker.terminate();
            URL.revokeObjectURL(blobUrl);
          } catch {
            // ignore
          }
        },
        setIntervalMs: (intervalMs: number) => {
          try {
            worker.postMessage({ type: 'SET_INTERVAL', intervalMs });
          } catch {
            // ignore
          }
        },
      };
    } catch {
      // Fallback below if CSP blocks blob workers
    }
  }

  let fallbackTimer: ReturnType<typeof setInterval> | null = setInterval(onTick, safeMs);
  return {
    stop: () => {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    },
    setIntervalMs: (intervalMs: number) => {
      const nextMs = Math.max(1500, intervalMs);
      if (fallbackTimer) clearInterval(fallbackTimer);
      fallbackTimer = setInterval(onTick, nextMs);
    },
  };
}
