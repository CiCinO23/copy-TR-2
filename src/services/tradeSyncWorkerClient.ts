import {
  computeWorkerSyncPlanBatch,
  type WorkerSyncBatchRequest,
  type WorkerSyncBatchResponse,
} from './tradeSyncWorkerLogic';
import type {
  TradeSyncWorkerIncomingMessage,
  TradeSyncWorkerOutgoingMessage,
} from '../workers/tradeSync.worker';

interface PendingWorkerRequest {
  request: WorkerSyncBatchRequest;
  resolve: (res: WorkerSyncBatchResponse) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export interface TradeSyncWorkerTelemetry {
  isWorkerSupported: boolean;
  isWorkerActive: boolean;
  totalBatchesOffloaded: number;
  totalWorkerThreadBatches: number;
  totalRawItemsProcessed: number;
  lastBatchDurationMs: number;
}

class TradeSyncWorkerClient {
  private worker: Worker | null = null;
  private workerFailedPermanently = false;
  private pendingRequests = new Map<string, PendingWorkerRequest>();
  private requestCounter = 0;

  private totalBatchesOffloaded = 0;
  private totalWorkerThreadBatches = 0;
  private totalRawItemsProcessed = 0;
  private lastBatchDurationMs = 0;

  public isWorkerSupported(): boolean {
    return typeof window !== 'undefined' && typeof Worker !== 'undefined' && !this.workerFailedPermanently;
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (!this.isWorkerSupported()) return null;

    try {
      const w = new Worker(new URL('../workers/tradeSync.worker.ts', import.meta.url), {
        type: 'module',
        name: 'CopyTR-TradeSyncWorker',
      });

      w.onmessage = (event: MessageEvent<TradeSyncWorkerOutgoingMessage>) => {
        const msg = event?.data;
        if (!msg || !msg.requestId) return;

        const pending = this.pendingRequests.get(msg.requestId);
        if (!pending) return;

        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(msg.requestId);

        if (msg.type === 'SYNC_BATCH_RESULT' && msg.payload) {
          this.totalBatchesOffloaded++;
          this.totalWorkerThreadBatches++;
          this.totalRawItemsProcessed += msg.payload.totalRawItemsProcessed;
          this.lastBatchDurationMs = msg.payload.durationMs;
          pending.resolve(msg.payload);
        } else {
          // Fallback to async main-thread execution on worker error
          this.runFallbackAsync(pending.request).then(pending.resolve);
        }
      };

      w.onerror = () => {
        // Fallback any in-flight requests cleanly without dropping data
        const activeList = Array.from(this.pendingRequests.values());
        this.pendingRequests.clear();
        for (const item of activeList) {
          clearTimeout(item.timeoutId);
          this.runFallbackAsync(item.request).then(item.resolve);
        }
        try {
          w.terminate();
        } catch {
          // ignore
        }
        this.worker = null;
      };

      this.worker = w;
      return w;
    } catch {
      this.workerFailedPermanently = true;
      this.worker = null;
      return null;
    }
  }

  private runFallbackAsync(request: WorkerSyncBatchRequest): Promise<WorkerSyncBatchResponse> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const res = computeWorkerSyncPlanBatch(request, false);
        this.totalBatchesOffloaded++;
        this.totalRawItemsProcessed += res.totalRawItemsProcessed;
        this.lastBatchDurationMs = res.durationMs;
        resolve(res);
      }, 0);
    });
  }

  /**
   * Offloads a batch of trader sync payloads (positions, latestRecords, positionHistory)
   * to the dedicated Web Worker thread so the main UI thread never freezes or lags.
   */
  public offloadSyncBatchToWorker(
    request: Omit<WorkerSyncBatchRequest, 'requestId'> & { requestId?: string },
    timeoutMs: number = 4500
  ): Promise<WorkerSyncBatchResponse> {
    const requestId =
      request.requestId || `sync_worker_${Date.now()}_${++this.requestCounter}`;
    const fullRequest: WorkerSyncBatchRequest = {
      ...request,
      requestId,
    };

    const workerInstance = this.ensureWorker();
    if (!workerInstance) {
      return this.runFallbackAsync(fullRequest);
    }

    return new Promise<WorkerSyncBatchResponse>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          this.runFallbackAsync(fullRequest).then(resolve);
        }
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        request: fullRequest,
        resolve,
        timeoutId,
      });

      try {
        const message: TradeSyncWorkerIncomingMessage = {
          type: 'COMPUTE_SYNC_BATCH',
          payload: fullRequest,
        };
        workerInstance.postMessage(message);
      } catch {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        this.runFallbackAsync(fullRequest).then(resolve);
      }
    });
  }

  public getTelemetry(): TradeSyncWorkerTelemetry {
    return {
      isWorkerSupported: this.isWorkerSupported(),
      isWorkerActive: this.worker !== null,
      totalBatchesOffloaded: this.totalBatchesOffloaded,
      totalWorkerThreadBatches: this.totalWorkerThreadBatches,
      totalRawItemsProcessed: this.totalRawItemsProcessed,
      lastBatchDurationMs: this.lastBatchDurationMs,
    };
  }

  /**
   * Recycled during low-memory cleanup if no requests are currently in flight.
   */
  public recycleIdleWorker(): void {
    if (this.pendingRequests.size > 0) return;
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
  }
}

export const tradeSyncWorkerClient = new TradeSyncWorkerClient();
