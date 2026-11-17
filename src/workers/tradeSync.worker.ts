import {
  computeWorkerSyncPlanBatch,
  type WorkerSyncBatchRequest,
  type WorkerSyncBatchResponse,
} from '../services/tradeSyncWorkerLogic';

export interface TradeSyncWorkerIncomingMessage {
  type: 'COMPUTE_SYNC_BATCH' | 'PING';
  payload?: WorkerSyncBatchRequest;
}

export interface TradeSyncWorkerOutgoingMessage {
  type: 'SYNC_BATCH_RESULT' | 'SYNC_BATCH_ERROR' | 'PONG';
  requestId?: string;
  payload?: WorkerSyncBatchResponse;
  error?: string;
}

const workerScope: any = typeof self !== 'undefined' ? self : null;

if (workerScope && typeof workerScope.postMessage === 'function') {
  workerScope.onmessage = (event: MessageEvent<TradeSyncWorkerIncomingMessage>) => {
    const msg = event?.data;
    if (!msg) return;

    if (msg.type === 'PING') {
      const pong: TradeSyncWorkerOutgoingMessage = { type: 'PONG' };
      workerScope.postMessage(pong);
      return;
    }

    if (msg.type === 'COMPUTE_SYNC_BATCH' && msg.payload) {
      const reqId = msg.payload.requestId;
      try {
        const response = computeWorkerSyncPlanBatch(msg.payload, true);
        const out: TradeSyncWorkerOutgoingMessage = {
          type: 'SYNC_BATCH_RESULT',
          requestId: reqId,
          payload: response,
        };
        workerScope.postMessage(out);
      } catch (err: any) {
        const errMsg: TradeSyncWorkerOutgoingMessage = {
          type: 'SYNC_BATCH_ERROR',
          requestId: reqId,
          error: err?.message || 'Worker batch computation failed',
        };
        workerScope.postMessage(errMsg);
      }
    }
  };
}
