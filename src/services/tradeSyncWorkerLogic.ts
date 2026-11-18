import type {
  PaperPosition,
  PositionScaleAdjustment,
  TradeExecutionSettings,
  TraderLatestRecord,
  TraderOpenPosition,
  TraderPositionHistoryItem,
  TraderSyncCheckpoint,
} from '../types';
import {
  buildStableTraderEventKey,
  buildTraderActionId,
  calculatePositionQuantityDropPartialExitPct,
  calculatePositionQuantityIncreaseScaleInPct,
  hasSyncEventBeenApplied,
  hasTraderEntryAlreadyBeenSynced,
  inferRecordPositionSide,
  isTraderActionAlreadyProcessed,
  isTraderTradePermanentlyClosed,
  reconcileAllTraderPositionsBeforeCopy,
  shouldApplyTraderRecordAfterEntry,
} from './tradeExecutionRules';

export interface WorkerTraderSyncInputTask {
  taskId: string;
  traderId: string;
  traderName: string;
  source: 'COPY_TRADING' | 'SMART_MONEY';
  accountId: string;
  positions: TraderOpenPosition[];
  latestRecords: TraderLatestRecord[];
  positionHistory?: TraderPositionHistoryItem[];
  marginPerTradeUsdt?: number;
  checkReconnectAdvantage?: boolean;
  forceImmediateExecution?: boolean;
  copiedStartedAt?: number;
  syncVersion?: number;
  actionId?: string;
  isPartialOrRateLimited?: boolean;
}

export interface WorkerAccountContext {
  accountId: string;
  accountName: string;
  settings: TradeExecutionSettings;
  positions: PaperPosition[];
  checkpoint?: TraderSyncCheckpoint | null;
}

export interface WorkerSyncBatchRequest {
  requestId: string;
  tasks: WorkerTraderSyncInputTask[];
  accountsByKey: Record<string, WorkerAccountContext>;
  currentPrices: Record<string, number>;
  now?: number;
}

export interface WorkerPrecomputedTraderSyncResult {
  taskId: string;
  traderId: string;
  traderName: string;
  source: 'COPY_TRADING' | 'SMART_MONEY';
  accountId: string;
  isSkippedStale: boolean;
  hasActionableChanges: boolean;
  /** Filtered positions that are genuinely active (not permanently closed) */
  filteredPositions: TraderOpenPosition[];
  /** Filtered latestRecords that are actionable and not yet applied */
  actionableRecords: TraderLatestRecord[];
  /** Choice IDs for permanently closed positions that should be pruned */
  staleChoiceIdsToRemove: string[];
  marginPerTradeUsdt?: number;
  checkReconnectAdvantage?: boolean;
  forceImmediateExecution?: boolean;
  copiedStartedAt?: number;
  syncVersion?: number;
  actionId?: string;
  isPartialOrRateLimited?: boolean;
  metrics: {
    rawPositionsCount: number;
    rawRecordsCount: number;
    rawHistoryCount: number;
    filteredPositionsCount: number;
    actionableRecordsCount: number;
  };
}

export interface WorkerSyncBatchResponse {
  requestId: string;
  results: WorkerPrecomputedTraderSyncResult[];
  totalRawItemsProcessed: number;
  totalActionableTasks: number;
  durationMs: number;
  executedInWorkerThread: boolean;
}

/**
 * Pure, thread-safe batch sync computation that runs inside the Web Worker (or fallback async task).
 * Offloads all O(N * M) scanning, sorting, deduplication key generation, closed-trade verification,
 * and historical adjustment filtering away from the main UI thread.
 */
export function computeWorkerSyncPlanBatch(
  request: WorkerSyncBatchRequest,
  executedInWorkerThread: boolean = false
): WorkerSyncBatchResponse {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const now = request.now && request.now > 0 ? request.now : Date.now();
  const results: WorkerPrecomputedTraderSyncResult[] = [];
  let totalRawItemsProcessed = 0;
  let totalActionableTasks = 0;

  for (const task of request.tasks || []) {
    const accKey = `${task.accountId || 'acc_default'}::${task.source}::${task.traderId}`;
    const ctx =
      request.accountsByKey[accKey] ||
      request.accountsByKey[task.accountId || 'acc_default'];

    const rawPositions = task.positions || [];
    const rawRecords = task.latestRecords || [];
    const rawHistory = task.positionHistory || [];
    totalRawItemsProcessed += rawPositions.length + rawRecords.length + rawHistory.length;

    const checkpoint = ctx?.checkpoint || null;

    // 1. Fast check if the entire batch version or actionId was already processed
    if (
      checkpoint &&
      ((task.syncVersion !== undefined && task.syncVersion <= checkpoint.version) ||
        (task.actionId &&
          isTraderActionAlreadyProcessed({
            checkpoint,
            candidateActionIds: [task.actionId],
          })))
    ) {
      results.push({
        taskId: task.taskId,
        traderId: task.traderId,
        traderName: task.traderName,
        source: task.source,
        accountId: task.accountId,
        isSkippedStale: true,
        hasActionableChanges: false,
        filteredPositions: [],
        actionableRecords: [],
        staleChoiceIdsToRemove: [],
        marginPerTradeUsdt: task.marginPerTradeUsdt,
        checkReconnectAdvantage: task.checkReconnectAdvantage,
        forceImmediateExecution: task.forceImmediateExecution,
        copiedStartedAt: task.copiedStartedAt,
        syncVersion: task.syncVersion,
        actionId: task.actionId,
        isPartialOrRateLimited: task.isPartialOrRateLimited,
        metrics: {
          rawPositionsCount: rawPositions.length,
          rawRecordsCount: rawRecords.length,
          rawHistoryCount: rawHistory.length,
          filteredPositionsCount: 0,
          actionableRecordsCount: 0,
        },
      });
      continue;
    }

    const accountPositions = ctx?.positions || [];
    const openTraderPositionsInAcc = accountPositions.filter(
      (p) =>
        p.status === 'OPEN' &&
        (p.sourceTraderId === task.traderId || p.sourceTraderName === task.traderName)
    );

    // Pre-reconcile all incoming trader positions against latestRecords and positionHistory (v2.21)
    // so finished trades are discarded before copying and open trades carry only their net remaining size
    const preReconciled = reconcileAllTraderPositionsBeforeCopy({
      positions: rawPositions,
      latestRecords: rawRecords,
      positionHistory: rawHistory,
      traderId: task.traderId,
    });
    const reconciledOpenPositions = preReconciled.openPositions;

    // 2. Pre-filter `latestRecords` in chronological order (keep only unapplied records matching an open position)
    const sortedRecords = [...rawRecords.slice(0, 40)].sort(
      (a, b) => (a.orderTime || 0) - (b.orderTime || 0)
    );
    const actionableRecords: TraderLatestRecord[] = [];

    for (const rec of sortedRecords) {
      if (
        rec.actionType !== 'EXIT' &&
        rec.actionType !== 'PARTIAL_EXIT' &&
        rec.actionType !== 'SCALE_IN'
      ) {
        continue;
      }

      const recSide = inferRecordPositionSide(rec);

      const matchingOpen = openTraderPositionsInAcc.find(
        (p) =>
          p.symbol.toUpperCase() === String(rec.symbol || '').toUpperCase() &&
          p.side === recSide
      );
      if (!matchingOpen) continue;

      const traderPos = reconciledOpenPositions.find(
        (tp) =>
          tp.symbol.toUpperCase() === matchingOpen.symbol.toUpperCase() &&
          tp.side === matchingOpen.side
      );

      const isAfterOurEntry = shouldApplyTraderRecordAfterEntry({
        recordTimestamp: rec.orderTime,
        userPositionOpenTime: matchingOpen.openTime,
        traderPositionEntryTime: matchingOpen.traderEntryTime,
      });

      if (rec.actionType === 'EXIT') {
        const isAfterTraderEntry =
          !matchingOpen.traderEntryTime ||
          rec.orderTime >= matchingOpen.traderEntryTime - 5_000;
        if ((!isAfterOurEntry && traderPos) || !isAfterTraderEntry) continue;
        const eventKey = buildStableTraderEventKey({
          kind: 'REC',
          symbol: rec.symbol,
          actionType: 'FULL_EXIT',
          timestamp: rec.orderTime,
          volumePercent: -100,
          quantity: rec.executedQty,
        });
        const traderActionId = buildTraderActionId({
          traderId: task.traderId,
          symbol: rec.symbol,
          actionType: 'FULL_EXIT',
          rawId: rec.id,
          timestamp: rec.orderTime,
          volumePercent: 100,
          quantity: rec.executedQty,
        });
        const candidateKeys = [traderActionId, eventKey, `rec_id:${rec.id}`];
        const alreadyApplied =
          hasSyncEventBeenApplied({
            appliedSyncEventIds: matchingOpen.appliedSyncEventIds,
            scaleAdjustments: matchingOpen.scaleAdjustments,
            candidateKeys,
            actionType: 'FULL_EXIT',
            eventTimestamp: rec.orderTime,
          }) ||
          isTraderActionAlreadyProcessed({
            checkpoint,
            candidateActionIds: candidateKeys,
            symbol: rec.symbol,
            actionType: 'FULL_EXIT',
            eventTimestamp: rec.orderTime,
          });
        if (!alreadyApplied) {
          actionableRecords.push(rec);
        }
      } else if (rec.actionType === 'PARTIAL_EXIT') {
        if (!isAfterOurEntry) continue;
        const withdrawPct = Math.min(95, Math.max(5, Math.abs(rec.volumePercent || 30)));
        const eventKey = buildStableTraderEventKey({
          kind: 'REC',
          symbol: rec.symbol,
          actionType: 'PARTIAL_EXIT',
          timestamp: rec.orderTime,
          volumePercent: withdrawPct,
          quantity: rec.executedQty,
        });
        const traderActionId = buildTraderActionId({
          traderId: task.traderId,
          symbol: rec.symbol,
          actionType: 'PARTIAL_EXIT',
          rawId: rec.id,
          timestamp: rec.orderTime,
          volumePercent: withdrawPct,
          quantity: rec.executedQty,
        });
        const candidateKeys = [traderActionId, eventKey, `rec_id:${rec.id}`];
        const alreadyApplied =
          hasSyncEventBeenApplied({
            appliedSyncEventIds: matchingOpen.appliedSyncEventIds,
            scaleAdjustments: matchingOpen.scaleAdjustments,
            candidateKeys,
            actionType: 'PARTIAL_EXIT',
            eventTimestamp: rec.orderTime,
          }) ||
          isTraderActionAlreadyProcessed({
            checkpoint,
            candidateActionIds: candidateKeys,
            symbol: rec.symbol,
            actionType: 'PARTIAL_EXIT',
            eventTimestamp: rec.orderTime,
          });
        if (!alreadyApplied) {
          actionableRecords.push(rec);
        }
      } else if (rec.actionType === 'SCALE_IN') {
        if (!isAfterOurEntry) continue;
        const addPct = Math.max(5, Math.abs(rec.volumePercent || 30));
        const eventKey = buildStableTraderEventKey({
          kind: 'REC',
          symbol: rec.symbol,
          actionType: 'SCALE_IN',
          timestamp: rec.orderTime,
          volumePercent: addPct,
          quantity: rec.executedQty,
        });
        const traderActionId = buildTraderActionId({
          traderId: task.traderId,
          symbol: rec.symbol,
          actionType: 'SCALE_IN',
          rawId: rec.id,
          timestamp: rec.orderTime,
          volumePercent: addPct,
          quantity: rec.executedQty,
        });
        const candidateKeys = [traderActionId, eventKey, `rec_id:${rec.id}`];
        const alreadyApplied =
          hasSyncEventBeenApplied({
            appliedSyncEventIds: matchingOpen.appliedSyncEventIds,
            scaleAdjustments: matchingOpen.scaleAdjustments,
            candidateKeys,
            actionType: 'SCALE_IN',
            eventTimestamp: rec.orderTime,
          }) ||
          isTraderActionAlreadyProcessed({
            checkpoint,
            candidateActionIds: candidateKeys,
            symbol: rec.symbol,
            actionType: 'SCALE_IN',
            eventTimestamp: rec.orderTime,
          });
        if (!alreadyApplied) {
          actionableRecords.push(rec);
        }
      }
    }

    // 3. Pre-filter `positions` and prune already-applied scaleAdjustments on open positions
    const filteredPositions: TraderOpenPosition[] = [];
    const staleChoiceIdsToRemove: string[] = [];
    let hasPositionLevelChanges = false;

    for (const discarded of preReconciled.discardedFinishedPositions) {
      const symUpper = String(discarded.symbol || '').toUpperCase().trim();
      staleChoiceIdsToRemove.push(
        `choice_${task.accountId || 'acc_default'}_${task.traderId}_${symUpper}_${discarded.side}`
      );
    }

    for (const pos of reconciledOpenPositions) {
      const symUpper = String(pos.symbol || '').toUpperCase().trim();
      const matchingUserOpen = openTraderPositionsInAcc.find(
        (p) => p.symbol.toUpperCase() === symUpper && p.side === pos.side
      );

      if (matchingUserOpen) {
        // Position is currently open in user's account -> check if there are any unapplied adjustments or qty changes
        const unappliedAdjs: PositionScaleAdjustment[] = [];
        for (const adj of pos.scaleAdjustments || []) {
          if (adj.actionType !== 'PARTIAL_EXIT' && adj.actionType !== 'SCALE_IN') {
            unappliedAdjs.push(adj);
            continue;
          }
          const isAfterOurEntry = shouldApplyTraderRecordAfterEntry({
            recordTimestamp: adj.timestamp,
            userPositionOpenTime: matchingUserOpen.openTime,
            traderPositionEntryTime: matchingUserOpen.traderEntryTime,
          });
          if (!isAfterOurEntry) continue;

          const pct =
            adj.actionType === 'PARTIAL_EXIT'
              ? Math.min(95, Math.max(5, Math.abs(adj.volumePercent || 30)))
              : Math.max(5, Math.abs(adj.volumePercent || 30));
          const adjKey = buildStableTraderEventKey({
            kind: 'ADJ',
            symbol: symUpper,
            actionType: adj.actionType,
            timestamp: adj.timestamp,
            volumePercent: pct,
            quantity: adj.executedQty,
            rawId: adj.id,
          });
          const traderActionId = buildTraderActionId({
            traderId: task.traderId,
            symbol: symUpper,
            actionType: adj.actionType,
            rawId: adj.id,
            timestamp: adj.timestamp,
            volumePercent: pct,
            quantity: adj.executedQty,
          });
          const candidateKeys = [traderActionId, adjKey, adj.id, `adj:${adj.id}`];
          const alreadyApplied =
            hasSyncEventBeenApplied({
              appliedSyncEventIds: matchingUserOpen.appliedSyncEventIds,
              scaleAdjustments: matchingUserOpen.scaleAdjustments,
              candidateKeys,
              actionType: adj.actionType,
              eventTimestamp: adj.timestamp,
            }) ||
            isTraderActionAlreadyProcessed({
              checkpoint,
              candidateActionIds: candidateKeys,
              symbol: symUpper,
              actionType: adj.actionType,
              eventTimestamp: adj.timestamp,
            });
          if (!alreadyApplied) {
            unappliedAdjs.push(adj);
            hasPositionLevelChanges = true;
          }
        }

        // Check live quantity drop or increase
        if (matchingUserOpen.lastSyncedTraderQty === undefined && pos.positionAmount > 0) {
          hasPositionLevelChanges = true;
        } else if (matchingUserOpen.lastSyncedTraderQty && pos.positionAmount > 0) {
          const dropPct = calculatePositionQuantityDropPartialExitPct({
            previousQty: matchingUserOpen.lastSyncedTraderQty,
            currentQty: pos.positionAmount,
          });
          const addPct = calculatePositionQuantityIncreaseScaleInPct({
            previousQty: matchingUserOpen.lastSyncedTraderQty,
            currentQty: pos.positionAmount,
          });
          if (
            dropPct >= 5 ||
            addPct >= 5 ||
            matchingUserOpen.lastSyncedTraderQty !== pos.positionAmount
          ) {
            hasPositionLevelChanges = true;
          }
        }

        filteredPositions.push({
          ...pos,
          scaleAdjustments: unappliedAdjs,
        });
        continue;
      }

      // Position is NOT currently open in user's account -> verify inside worker if permanently closed or already synced
      if (
        hasTraderEntryAlreadyBeenSynced({
          traderId: task.traderId,
          traderName: task.traderName,
          symbol: symUpper,
          side: pos.side,
          rawPositionId: pos.id,
          entryTime: pos.entryTime,
          accountPositions,
          checkpoint,
        })
      ) {
        continue;
      }

      // Genuinely new candidate position to open or prompt!
      hasPositionLevelChanges = true;
      filteredPositions.push(pos);
    }

    // 4. Check if any userOpenPos is missing from trader's open positions (indicating full exit)
    if (!task.isPartialOrRateLimited) {
      const isTransientEmpty =
        reconciledOpenPositions.length === 0 && rawRecords.length === 0 && rawHistory.length === 0;
      if (!isTransientEmpty) {
        for (const userOpenPos of openTraderPositionsInAcc) {
          const stillOpen = reconciledOpenPositions.some(
            (tp) =>
              tp.symbol.toUpperCase() === userOpenPos.symbol.toUpperCase() &&
              tp.side === userOpenPos.side
          );
          const hasExplicitCloseSignal = isTraderTradePermanentlyClosed({
            symbol: userOpenPos.symbol,
            side: userOpenPos.side,
            entryTime: userOpenPos.traderEntryTime || userOpenPos.openTime,
            latestRecords: rawRecords,
            positionHistory: rawHistory,
          });
          const withinInitialOpenGraceWindow =
            now - userOpenPos.openTime < 15_000 && !hasExplicitCloseSignal;
          if (!stillOpen && !withinInitialOpenGraceWindow) {
            hasPositionLevelChanges = true;
          }
        }
      }
    }

    const hasActionableChanges =
      actionableRecords.length > 0 ||
      hasPositionLevelChanges ||
      staleChoiceIdsToRemove.length > 0 ||
      Boolean(task.actionId) ||
      task.syncVersion !== undefined;

    if (hasActionableChanges) {
      totalActionableTasks++;
    }

    results.push({
      taskId: task.taskId,
      traderId: task.traderId,
      traderName: task.traderName,
      source: task.source,
      accountId: task.accountId,
      isSkippedStale: false,
      hasActionableChanges,
      filteredPositions,
      actionableRecords,
      staleChoiceIdsToRemove,
      marginPerTradeUsdt: task.marginPerTradeUsdt,
      checkReconnectAdvantage: task.checkReconnectAdvantage,
      forceImmediateExecution: task.forceImmediateExecution,
      copiedStartedAt: task.copiedStartedAt,
      syncVersion: task.syncVersion,
      actionId: task.actionId,
      isPartialOrRateLimited: task.isPartialOrRateLimited,
      metrics: {
        rawPositionsCount: rawPositions.length,
        rawRecordsCount: rawRecords.length,
        rawHistoryCount: rawHistory.length,
        filteredPositionsCount: filteredPositions.length,
        actionableRecordsCount: actionableRecords.length,
      },
    });
  }

  const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    requestId: request.requestId,
    results,
    totalRawItemsProcessed,
    totalActionableTasks,
    durationMs: Number(Math.max(0, finishedAt - startedAt).toFixed(2)),
    executedInWorkerThread,
  };
}
