import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWorkerSyncPlanBatch } from '../tradeSyncWorkerLogic';
import { PaperEngine } from '../paperTrading';
import { mobileNotifications } from '../mobileNotifications';
import type {
  TraderLatestRecord,
  TraderOpenPosition,
  TraderPositionHistoryItem,
} from '../../types';

// Provide a clean in-memory localStorage mock for Node.js tests
const memoryStorage = new Map<string, string>();
let setItemCallCount = 0;
(globalThis as any).localStorage = {
  getItem: (k: string) => (memoryStorage.has(k) ? memoryStorage.get(k)! : null),
  setItem: (k: string, v: string) => {
    setItemCallCount++;
    memoryStorage.set(k, String(v));
  },
  removeItem: (k: string) => {
    memoryStorage.delete(k);
  },
  clear: () => {
    memoryStorage.clear();
  },
};

test('computeWorkerSyncPlanBatch: offloads filtering of permanently closed trades, already-applied records, and stale sync versions (v2.18)', () => {
  const tOld = Date.now() - 3600_000;
  const tClose = Date.now() - 1800_000;
  const tNew = Date.now() - 10_000;

  const closedPos: TraderOpenPosition = {
    id: 'pos_closed_btc',
    symbol: 'BTCUSDT',
    collateral: 'USDT',
    positionAmount: 1,
    side: 'LONG',
    entryPrice: 88000,
    markPrice: 89000,
    breakEvenPrice: 88000,
    unrealizedProfit: 1000,
    cumRealized: 0,
    notionalValue: 89000,
    leverage: 5,
    isolated: false,
    roePercent: 5,
    entryTime: tOld,
    lastUpdateTime: tOld,
    currentScalePercent: 100,
    scaleAdjustments: [],
  };

  const activePos: TraderOpenPosition = {
    id: 'pos_active_eth',
    symbol: 'ETHUSDT',
    collateral: 'USDT',
    positionAmount: 10,
    side: 'SHORT',
    entryPrice: 3100,
    markPrice: 3080,
    breakEvenPrice: 3100,
    unrealizedProfit: 200,
    cumRealized: 0,
    notionalValue: 30800,
    leverage: 5,
    isolated: false,
    roePercent: 3.2,
    entryTime: tNew,
    lastUpdateTime: tNew,
    currentScalePercent: 100,
    scaleAdjustments: [],
  };

  const closedHistory: TraderPositionHistoryItem[] = [
    {
      id: 'hist_btc_1',
      symbol: 'BTCUSDT',
      side: 'LONG',
      opened: tOld,
      closed: tClose,
      avgCost: 88000,
      avgClosePrice: 89000,
      closingPnl: 1000,
      maxOpenInterest: 1,
      closedVolume: 1,
      isolated: false,
      scaleAdjustments: [],
    },
  ];

  const batchResponse = computeWorkerSyncPlanBatch(
    {
      requestId: 'req_test_1',
      tasks: [
        {
          taskId: 't_1',
          traderId: 'trader_fast',
          traderName: 'FastTrader',
          source: 'COPY_TRADING',
          accountId: 'acc_default',
          positions: [closedPos, activePos],
          latestRecords: [],
          positionHistory: closedHistory,
        },
      ],
      accountsByKey: {
        acc_default: {
          accountId: 'acc_default',
          accountName: 'الحساب الافتراضي 1',
          settings: {
            mode: 'VIRTUAL',
            virtualInitialBalance: 1000,
            tradeValueUsdt: 25,
            leverage: 5,
            commissionPercent: 0.06,
            maxConcurrentTrades: 5,
            takeProfitPercent: 0,
            stopLossPercent: 0,
            enforceUserSizeOnCopy: true,
          },
          positions: [],
          checkpoint: null,
        },
      },
      currentPrices: { BTCUSDT: 89000, ETHUSDT: 3080 },
    },
    true
  );

  assert.equal(batchResponse.executedInWorkerThread, true);
  assert.equal(batchResponse.results.length, 1);
  const res = batchResponse.results[0];
  assert.equal(res.isSkippedStale, false);
  assert.equal(res.hasActionableChanges, true);
  // Permanently closed BTCUSDT must be filtered out inside the worker; only active ETHUSDT remains
  assert.equal(res.filteredPositions.length, 1);
  assert.equal(res.filteredPositions[0].symbol, 'ETHUSDT');
  assert.equal(res.staleChoiceIdsToRemove.includes('choice_acc_default_trader_fast_BTCUSDT_LONG'), true);
});

test('PaperEngine.syncMultipleTradersOffMainThread and runInBatch process large multi-trader batches without main-thread storage thrashing (v2.18)', async () => {
  memoryStorage.clear();
  mobileNotifications.clearAllNotifications();
  const engine = new PaperEngine();
  engine.clearAllDataAndReset({ scope: 'ALL_ACCOUNTS' });
  engine.updateSettings({ maxConcurrentTrades: 20, promptOnUnfavorableLateEntry: false });

  const now = Date.now();
  const positions: TraderOpenPosition[] = [];
  const records: TraderLatestRecord[] = [];

  // Build a large batch of 15 open positions and 30 historical records
  for (let i = 1; i <= 15; i++) {
    const sym = `COIN${i}USDT`;
    positions.push({
      id: `whale_pos_${i}`,
      symbol: sym,
      collateral: 'USDT',
      positionAmount: 100,
      side: i % 2 === 0 ? 'LONG' : 'SHORT',
      entryPrice: 100,
      markPrice: 100,
      breakEvenPrice: 100,
      unrealizedProfit: 0,
      cumRealized: 0,
      notionalValue: 10000,
      leverage: 5,
      isolated: false,
      roePercent: 0,
      entryTime: now - 5000,
      lastUpdateTime: now - 5000,
      currentScalePercent: 100,
      scaleAdjustments: [],
    });
  }

  for (let r = 1; r <= 30; r++) {
    records.push({
      id: `rec_${r}`,
      symbol: `OLD${r}USDT`,
      baseAsset: `OLD${r}`,
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'MARKET',
      positionSide: 'LONG',
      actionType: 'ENTRY',
      actionLabelAr: 'دخول',
      volumePercent: 100,
      remainingPercentAfter: 100,
      executedQty: 10,
      avgPrice: 50,
      totalPnl: 0,
      orderTime: now - 3600_000,
    });
  }

  setItemCallCount = 0;

  const { logs, workerResponse } = await engine.syncMultipleTradersOffMainThread(
    [
      {
        traderId: 'whale_bulk_1',
        traderName: 'BulkWhale',
        source: 'SMART_MONEY',
        accountId: 'acc_default',
        positions,
        latestRecords: records,
        forceImmediateExecution: true,
      },
    ],
    {}
  );

  assert.equal(logs.filter((l) => l.action === 'POSITION_SYNC').length, 15);
  assert.equal(engine.getAccount().positions.filter((p) => p.status === 'OPEN').length, 15);
  assert.equal(workerResponse.totalRawItemsProcessed, 45);
  // Because of runInBatch coalescing, localStorage.setItem is only called once at the end of the batch (8 keys total: 7 engine state keys + 1 notification key) instead of 15 * 8 = 120 times!
  assert.ok(
    setItemCallCount <= 10,
    `Expected coalesced batch storage writes (<= 10), got ${setItemCallCount}`
  );

  // Second sync with the exact same 15 open positions and 30 records must detect 0 actionable changes in the worker and perform 0 storage writes!
  setItemCallCount = 0;
  const secondRun = await engine.syncMultipleTradersOffMainThread(
    [
      {
        traderId: 'whale_bulk_1',
        traderName: 'BulkWhale',
        source: 'SMART_MONEY',
        accountId: 'acc_default',
        positions,
        latestRecords: records,
        forceImmediateExecution: true,
      },
    ],
    {}
  );
  assert.equal(secondRun.logs.length, 0);
  assert.equal(secondRun.workerResponse.results[0].hasActionableChanges, false);
  assert.equal(setItemCallCount, 0);
});
