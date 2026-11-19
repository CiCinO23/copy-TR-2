/**
 * Pure, decoupled utilities for:
 * 1. Exchange Ping Health classification (separate Binance & KuCoin indicators)
 * 2. Sleep / Doze wall-clock drift detection for mobile background resilience
 * 3. Stale in-flight sync abort decisions upon wakeup / urgent trade events
 * 4. Cache-busting URL construction for real-time Binance & KuCoin endpoints
 */

export type PingHealthStatus = 'good' | 'warn' | 'bad' | 'offline';

export interface PingHealthSummary {
  status: PingHealthStatus;
  labelMs: string;
}

/**
 * Classifies an exchange's live ping status for Header indicators.
 * - offline: not connected or null latency
 * - good: <= 350ms
 * - warn: 351ms..850ms
 * - bad: > 850ms
 */
export function classifyPingHealth(
  isConnected: boolean,
  latencyMs: number | null | undefined
): PingHealthSummary {
  if (!isConnected || latencyMs === null || latencyMs === undefined || !Number.isFinite(latencyMs)) {
    return { status: 'offline', labelMs: '--' };
  }
  const rounded = Math.max(1, Math.round(latencyMs));
  if (rounded <= 350) {
    return { status: 'good', labelMs: `${rounded}ms` };
  }
  if (rounded <= 850) {
    return { status: 'warn', labelMs: `${rounded}ms` };
  }
  return { status: 'bad', labelMs: `${rounded}ms` };
}

/**
 * Detects whether a timer tick experienced OS sleep / Android Doze / iOS background throttling
 * by comparing wall-clock elapsed time against the expected interval.
 */
export function detectSleepWakeupDrift(
  lastTickAt: number,
  now: number,
  expectedIntervalMs: number
): { drifted: boolean; elapsedMs: number } {
  if (!lastTickAt || lastTickAt <= 0 || !now || now <= lastTickAt) {
    return { drifted: false, elapsedMs: 0 };
  }
  const elapsedMs = now - lastTickAt;
  const threshold = Math.max(expectedIntervalMs * 2.2, expectedIntervalMs + 3500);
  return {
    drifted: elapsedMs >= threshold,
    elapsedMs,
  };
}

/**
 * Decides whether an existing in-flight sync batch should be aborted so a fresh sync
 * can run immediately (e.g., when waking from phone sleep or receiving a Service Worker trade alert).
 */
export function shouldAbortStaleInFlightSync(params: {
  isSyncInFlight: boolean;
  syncStartedAt: number;
  now: number;
  isWakeupOrUrgent: boolean;
  normalDeadlockMs?: number;
  wakeupStaleMs?: number;
}): boolean {
  if (!params.isSyncInFlight) return false;
  const elapsed = Math.max(0, params.now - params.syncStartedAt);
  const normalLimit = params.normalDeadlockMs ?? 8000;
  const wakeupLimit = params.wakeupStaleMs ?? 2000;
  if (params.isWakeupOrUrgent) {
    return elapsed >= wakeupLimit;
  }
  return elapsed >= normalLimit;
}

/**
 * Appends a `_t=<timestamp>` cache-busting query parameter to GET URLs so
 * browser HTTP caches, WebView caches, and intermediate proxies never serve stale trade positions.
 */
export function appendCacheBuster(url: string, timestamp: number = Date.now()): string {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_t=${Math.floor(timestamp)}`;
}
