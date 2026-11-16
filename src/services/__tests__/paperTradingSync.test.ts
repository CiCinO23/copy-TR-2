import test from 'node:test';
import assert from 'node:assert/strict';

// Lightweight localStorage polyfill for running PaperEngine deterministically in Node
const memoryStorage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, val: string) => {
    memoryStorage.set(key, String(val));
  },
  removeItem: (key: string) => {
    memoryStorage.delete(key);
  },
  clear: () => {
    memoryStorage.clear();
  },
};

import { PaperEngine } from '../paperTrading';
import { mobileNotifications } from '../mobileNotifications';
import type { TraderLatestRecord, TraderOpenPosition } from '../../types';

test('PaperEngine syncTraderPositionsAndRecords executes PARTIAL_EXIT once and never loops across repeated polls', () => {
  memoryStorage.clear();
  mobileNotifications.clearAllNotifications();
  const engine = new PaperEngine();
  engine.clearAllDataAndReset({ scope: 'ALL_ACCOUNTS' });

  const baseTime = Date.now() - 10_000;
  const openPos: TraderOpenPosition = {
    id: 'pos_btc_1',
    symbol: 'BTCUSDT',
    collateral: 'USDT',
    positionAmount: 1.0,
    initialPositionAmount: 1.0,
    side: 'LONG',
    entryPrice: 90000,
    markPrice: 90000,
    breakEvenPrice: 90000,
    unrealizedProfit: 0,
    cumRealized: 0,
    notionalValue: 90000,
    leverage: 5,
    isolated: false,
    roePercent: 0,
    entryTime: baseTime,
    lastUpdateTime: baseTime,
    currentScalePercent: 100,
    scaleAdjustments: [
      {
        id: 'pos_btc_1_entry',
        actionType: 'INITIAL_ENTRY',
        actionLabelAr: 'فتح',
        timestamp: baseTime,
        volumePercent: 100,
        remainingPercentAfter: 100,
        executedQty: 1.0,
        price: 90000,
      },
    ],
  };

  // Initial sync: opens 1 copied position
  const initialLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_1',
    traderName: 'ProWhale',
    source: 'COPY_TRADING',
    positions: [openPos],
    latestRecords: [],
    currentPrices: { BTCUSDT: 90000 },
  });
  assert.equal(initialLogs.filter((l) => l.action === 'POSITION_SYNC').length, 1);

  // Now trader withdraws 40% (remaining 0.60 BTC, scale 60%) AFTER user openTime
  const partialExitTs = Date.now() + 2000;
  const partialRecord: TraderLatestRecord = {
    id: 'trader_1_ord_BTCUSDT_LONG_SELL_1',
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    side: 'SELL',
    type: 'MARKET',
    positionSide: 'LONG',
    actionType: 'PARTIAL_EXIT',
    actionLabelAr: 'انسحاب جزئي -40%',
    volumePercent: -40,
    remainingPercentAfter: 60,
    executedQty: 0.4,
    avgPrice: 91500,
    totalPnl: 600,
    orderTime: partialExitTs,
    entryTime: baseTime,
    exitTime: partialExitTs,
  };

  const reducedPos: TraderOpenPosition = {
    ...openPos,
    positionAmount: 0.6,
    lastUpdateTime: partialExitTs,
    currentScalePercent: 60,
    scaleAdjustments: [
      ...openPos.scaleAdjustments,
      {
        id: 'pos_btc_1_partial_40',
        actionType: 'PARTIAL_EXIT',
        actionLabelAr: 'انسحاب جزئي -40%',
        timestamp: partialExitTs,
        volumePercent: -40,
        remainingPercentAfter: 60,
        executedQty: 0.4,
        price: 91500,
      },
    ],
  };

  // Poll #1 with partial exit signal (present in latestRecords, scaleAdjustments, AND quantity drop)
  const firstWithdrawLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_1',
    traderName: 'ProWhale',
    source: 'COPY_TRADING',
    positions: [reducedPos],
    latestRecords: [partialRecord],
    currentPrices: { BTCUSDT: 91500 },
  });
  assert.equal(
    firstWithdrawLogs.filter((l) => l.action === 'PARTIAL_EXIT').length,
    1,
    'PARTIAL_EXIT must execute immediately and exactly once on first detection'
  );

  const partialNotifsAfterFirst = mobileNotifications
    .getNotifications()
    .filter((n) => n.actionType === 'PARTIAL_EXIT');
  assert.equal(partialNotifsAfterFirst.length, 1);

  // Polls #2 .. #13: exact same data polled repeatedly (even with >60s drift on order_id/updateTime)
  for (let i = 0; i < 12; i++) {
    const repeatLogs = engine.syncTraderPositionsAndRecords({
      traderId: 'trader_1',
      traderName: 'ProWhale',
      source: 'COPY_TRADING',
      positions: [reducedPos],
      latestRecords: [partialRecord],
      currentPrices: { BTCUSDT: 91500 + i },
    });
    assert.equal(
      repeatLogs.filter((l) => l.action === 'PARTIAL_EXIT').length,
      0,
      `Poll repeat #${i + 1} must NOT re-emit PARTIAL_EXIT`
    );
  }

  assert.equal(
    mobileNotifications.getNotifications().filter((n) => n.actionType === 'PARTIAL_EXIT').length,
    1,
    'Total PARTIAL_EXIT notifications must remain 1 across 12 repeated polls'
  );

  // Now simulate a live quantity drop WITHOUT an order-history record yet (0.6 -> 0.3 = -50%)
  const liveDropTs = partialExitTs + 90_000;
  const secondReducedPos: TraderOpenPosition = {
    ...reducedPos,
    positionAmount: 0.3,
    lastUpdateTime: liveDropTs,
    currentScalePercent: 30,
  };

  const liveDropLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_1',
    traderName: 'ProWhale',
    source: 'COPY_TRADING',
    positions: [secondReducedPos],
    latestRecords: [partialRecord],
    currentPrices: { BTCUSDT: 92000 },
  });
  assert.equal(
    liveDropLogs.filter((l) => l.action === 'PARTIAL_EXIT').length,
    1,
    'Live positionAmount drop must execute partial withdrawal immediately in 1 sync cycle'
  );

  // Repeat 5 more polls with the 0.3 quantity — must NEVER fire again
  for (let i = 0; i < 5; i++) {
    const repeatDropLogs = engine.syncTraderPositionsAndRecords({
      traderId: 'trader_1',
      traderName: 'ProWhale',
      source: 'COPY_TRADING',
      positions: [secondReducedPos],
      latestRecords: [partialRecord],
      currentPrices: { BTCUSDT: 92000 },
    });
    assert.equal(repeatDropLogs.filter((l) => l.action === 'PARTIAL_EXIT').length, 0);
  }

  assert.equal(
    mobileNotifications.getNotifications().filter((n) => n.actionType === 'PARTIAL_EXIT').length,
    2
  );
});

test('PaperEngine enforces per-trader versioning & lastProcessedActionId while keeping independent symbols unblocked', () => {
  memoryStorage.clear();
  mobileNotifications.clearAllNotifications();
  const engine = new PaperEngine();
  engine.clearAllDataAndReset({ scope: 'ALL_ACCOUNTS' });

  const baseTime = Date.now() - 20_000;
  const btcPos: TraderOpenPosition = {
    id: 'pos_btc',
    symbol: 'BTCUSDT',
    collateral: 'USDT',
    positionAmount: 1,
    side: 'LONG',
    entryPrice: 90000,
    markPrice: 90000,
    breakEvenPrice: 90000,
    unrealizedProfit: 0,
    cumRealized: 0,
    notionalValue: 90000,
    leverage: 5,
    isolated: false,
    roePercent: 0,
    entryTime: baseTime,
    lastUpdateTime: baseTime,
    currentScalePercent: 100,
    scaleAdjustments: [],
  };
  const ethPos: TraderOpenPosition = {
    id: 'pos_eth',
    symbol: 'ETHUSDT',
    collateral: 'USDT',
    positionAmount: 10,
    side: 'SHORT',
    entryPrice: 3000,
    markPrice: 3000,
    breakEvenPrice: 3000,
    unrealizedProfit: 0,
    cumRealized: 0,
    notionalValue: 30000,
    leverage: 5,
    isolated: false,
    roePercent: 0,
    entryTime: baseTime,
    lastUpdateTime: baseTime,
    currentScalePercent: 100,
    scaleAdjustments: [],
  };

  // Version 1: Initial entry on BTC & ETH
  engine.syncTraderPositionsAndRecords({
    traderId: 'trader_ver',
    traderName: 'VersionedTrader',
    source: 'COPY_TRADING',
    positions: [btcPos, ethPos],
    latestRecords: [],
    currentPrices: { BTCUSDT: 90000, ETHUSDT: 3000 },
    syncVersion: 1,
    actionId: 'batch_init_1',
  });

  const cp1 = engine.getTraderSyncCheckpoint('trader_ver', 'COPY_TRADING');
  assert.ok(cp1);
  assert.equal(cp1.version, 1);
  assert.ok(cp1.lastProcessedActionId);
  assert.equal(engine.hasProcessedTraderAction('trader_ver', 'batch_init_1', 'COPY_TRADING'), true);

  // Stale/duplicate sync request with syncVersion <= 1 or same actionId must be completely ignored
  const tPartial = Date.now() + 3000;
  const partialBtcRec: TraderLatestRecord = {
    id: 'rec_btc_withdraw_50',
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    side: 'SELL',
    type: 'MARKET',
    positionSide: 'LONG',
    actionType: 'PARTIAL_EXIT',
    actionLabelAr: 'انسحاب -50%',
    volumePercent: -50,
    remainingPercentAfter: 50,
    executedQty: 0.5,
    avgPrice: 91000,
    totalPnl: 500,
    orderTime: tPartial,
  };

  const staleLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_ver',
    traderName: 'VersionedTrader',
    source: 'COPY_TRADING',
    positions: [{ ...btcPos, positionAmount: 0.5 }, ethPos],
    latestRecords: [partialBtcRec],
    currentPrices: { BTCUSDT: 91000, ETHUSDT: 3000 },
    syncVersion: 1,
  });
  assert.equal(staleLogs.length, 0);

  // Duplicate actionId must also be skipped even if syncVersion omitted
  const dupActionLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_ver',
    traderName: 'VersionedTrader',
    source: 'COPY_TRADING',
    positions: [{ ...btcPos, positionAmount: 0.5 }, ethPos],
    latestRecords: [partialBtcRec],
    currentPrices: { BTCUSDT: 91000, ETHUSDT: 3000 },
    actionId: 'batch_init_1',
  });
  assert.equal(dupActionLogs.length, 0);

  // Now advance syncVersion: 2 -> BTCUSDT partial exit executes once, and ETHUSDT partial exit 5s later executes independently
  const ethRec: TraderLatestRecord = {
    id: 'rec_eth_withdraw_30',
    symbol: 'ETHUSDT',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    side: 'BUY',
    type: 'MARKET',
    positionSide: 'SHORT',
    actionType: 'PARTIAL_EXIT',
    actionLabelAr: 'انسحاب -30%',
    volumePercent: -30,
    remainingPercentAfter: 70,
    executedQty: 3,
    avgPrice: 2950,
    totalPnl: 150,
    orderTime: tPartial + 5000,
  };

  const v2Logs = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_ver',
    traderName: 'VersionedTrader',
    source: 'COPY_TRADING',
    positions: [
      { ...btcPos, positionAmount: 0.5 },
      { ...ethPos, positionAmount: 7 },
    ],
    latestRecords: [partialBtcRec, ethRec],
    currentPrices: { BTCUSDT: 91000, ETHUSDT: 2950 },
    syncVersion: 2,
    actionId: 'batch_partial_2',
  });
  assert.equal(v2Logs.filter((l) => l.action === 'PARTIAL_EXIT').length, 2);

  const cp2 = engine.getTraderSyncCheckpoint('trader_ver', 'COPY_TRADING');
  assert.ok(cp2);
  assert.ok(cp2.version >= 2);
  assert.equal(engine.hasProcessedTraderAction('trader_ver', 'batch_partial_2', 'COPY_TRADING'), true);

  // Repeating the exact same batch with higher syncVersion still skips both already-processed records!
  const v3RepeatLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_ver',
    traderName: 'VersionedTrader',
    source: 'COPY_TRADING',
    positions: [
      { ...btcPos, positionAmount: 0.5 },
      { ...ethPos, positionAmount: 7 },
    ],
    latestRecords: [partialBtcRec, ethRec],
    currentPrices: { BTCUSDT: 91000, ETHUSDT: 2950 },
    syncVersion: 3,
    actionId: 'batch_partial_3_replay',
  });
  assert.equal(v3RepeatLogs.filter((l) => l.action === 'PARTIAL_EXIT').length, 0);
});

test('PaperEngine executes late unfavorable trades automatically at market price when promptOnUnfavorableLateEntry is unchecked', () => {
  memoryStorage.clear();
  mobileNotifications.clearAllNotifications();
  const engine = new PaperEngine();
  engine.clearAllDataAndReset({ scope: 'ALL_ACCOUNTS' });

  const oldEntryTime = Date.now() - 3600_000;
  // Unfavorable for late LONG copy: trader entered at 85,000, current price is 92,000 (+8.2%)
  const lateLongPos: TraderOpenPosition = {
    id: 'pos_late_btc',
    symbol: 'BTCUSDT',
    collateral: 'USDT',
    positionAmount: 1,
    side: 'LONG',
    entryPrice: 85000,
    markPrice: 92000,
    breakEvenPrice: 85000,
    unrealizedProfit: 7000,
    cumRealized: 0,
    notionalValue: 92000,
    leverage: 5,
    isolated: false,
    roePercent: 40,
    entryTime: oldEntryTime,
    lastUpdateTime: oldEntryTime,
    currentScalePercent: 100,
    scaleAdjustments: [],
  };

  // 1. Default behavior (promptOnUnfavorableLateEntry = true): creates pending choice, does NOT open
  engine.updateSettings({ promptOnUnfavorableLateEntry: true });
  const logsWithPrompt = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_late',
    traderName: 'LateTrader',
    source: 'COPY_TRADING',
    positions: [lateLongPos],
    latestRecords: [],
    currentPrices: { BTCUSDT: 92000 },
  });
  assert.equal(logsWithPrompt.filter((l) => l.action === 'POSITION_SYNC').length, 0);
  assert.equal(
    engine.getAccount().positions.filter((p) => p.status === 'OPEN').length,
    0
  );

  // 2. Unchecked behavior (promptOnUnfavorableLateEntry = false): immediately enters at live market price (92,000)
  engine.updateSettings({ promptOnUnfavorableLateEntry: false });
  const logsAutoEnter = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_late',
    traderName: 'LateTrader',
    source: 'COPY_TRADING',
    positions: [lateLongPos],
    latestRecords: [],
    currentPrices: { BTCUSDT: 92000 },
  });

  assert.equal(logsAutoEnter.filter((l) => l.action === 'POSITION_SYNC').length, 1);
  const openPos = engine.getAccount().positions.find((p) => p.status === 'OPEN');
  assert.ok(openPos);
  assert.equal(openPos.symbol, 'BTCUSDT');
  assert.equal(openPos.entryPrice, 92000);
  assert.equal(openPos.traderEntryPrice, 85000);
  const snap = engine.getSnapshot({ BTCUSDT: 92000 });
  assert.equal((snap.pendingReconnectChoices || []).length, 0);
});

test('PaperEngine NEVER opens permanently closed or historical latestRecords trades and never loops open/close', () => {
  memoryStorage.clear();
  mobileNotifications.clearAllNotifications();
  const engine = new PaperEngine();
  engine.clearAllDataAndReset({ scope: 'ALL_ACCOUNTS' });
  engine.updateSettings({ promptOnUnfavorableLateEntry: false });

  const oldEntryTs = Date.now() - 7200_000;
  const oldExitTs = Date.now() - 3600_000;

  const historicalRecords: TraderLatestRecord[] = [
    {
      id: 'hist_exit_btc',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      side: 'SELL',
      type: 'MARKET',
      positionSide: 'LONG',
      actionType: 'EXIT',
      actionLabelAr: 'خروج كامل',
      volumePercent: -100,
      remainingPercentAfter: 0,
      executedQty: 1,
      avgPrice: 91000,
      totalPnl: 1000,
      orderTime: oldExitTs,
      entryTime: oldEntryTs,
      exitTime: oldExitTs,
    },
    {
      id: 'hist_entry_btc',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'MARKET',
      positionSide: 'LONG',
      actionType: 'ENTRY',
      actionLabelAr: 'دخول أولي',
      volumePercent: 100,
      remainingPercentAfter: 100,
      executedQty: 1,
      avgPrice: 90000,
      totalPnl: 0,
      orderTime: oldEntryTs,
      entryTime: oldEntryTs,
    },
    {
      id: 'hist_entry_sol',
      symbol: 'SOLUSDT',
      baseAsset: 'SOL',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'MARKET',
      positionSide: 'LONG',
      actionType: 'ENTRY',
      actionLabelAr: 'دخول قديم',
      volumePercent: 100,
      remainingPercentAfter: 100,
      executedQty: 10,
      avgPrice: 180,
      totalPnl: 0,
      orderTime: oldEntryTs,
      entryTime: oldEntryTs,
    },
  ];

  // 1. Trader currently has NO open positions (positions: []), only historical latestRecords:
  // Engine must NOT open historical/closed trades!
  for (let i = 0; i < 5; i++) {
    const logs = engine.syncTraderPositionsAndRecords({
      traderId: 'trader_hist_only',
      traderName: 'HistTrader',
      source: 'COPY_TRADING',
      positions: [],
      latestRecords: historicalRecords,
      currentPrices: { BTCUSDT: 89500, SOLUSDT: 175 },
    });
    assert.equal(logs.length, 0);
    assert.equal(engine.getAccount().positions.length, 0);
  }

  // 2. Even if stale API cache temporarily passes a BTCUSDT LONG position that already has EXIT in latestRecords,
  // it must be filtered out and never opened!
  const staleClosedPos: TraderOpenPosition = {
    id: 'stale_btc_pos',
    symbol: 'BTCUSDT',
    collateral: 'USDT',
    positionAmount: 1,
    side: 'LONG',
    entryPrice: 90000,
    markPrice: 91000,
    breakEvenPrice: 90000,
    unrealizedProfit: 1000,
    cumRealized: 0,
    notionalValue: 91000,
    leverage: 5,
    isolated: false,
    roePercent: 5,
    entryTime: oldEntryTs,
    lastUpdateTime: oldEntryTs,
    currentScalePercent: 100,
    scaleAdjustments: [],
  };

  const staleLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_hist_only',
    traderName: 'HistTrader',
    source: 'COPY_TRADING',
    positions: [staleClosedPos],
    latestRecords: historicalRecords,
    currentPrices: { BTCUSDT: 89500 },
  });
  assert.equal(staleLogs.length, 0);
  assert.equal(engine.getAccount().positions.length, 0);

  // 3. Live open trade opens once, then trader exits -> must close once and NEVER re-open on repeated polls
  const liveEntryTs = Date.now() - 10_000;
  const livePos: TraderOpenPosition = {
    id: 'live_eth_1',
    symbol: 'ETHUSDT',
    collateral: 'USDT',
    positionAmount: 5,
    side: 'SHORT',
    entryPrice: 3000,
    markPrice: 2980,
    breakEvenPrice: 3000,
    unrealizedProfit: 100,
    cumRealized: 0,
    notionalValue: 14900,
    leverage: 5,
    isolated: false,
    roePercent: 3,
    entryTime: liveEntryTs,
    lastUpdateTime: liveEntryTs,
    currentScalePercent: 100,
    scaleAdjustments: [],
  };

  const openLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_loop_guard',
    traderName: 'LoopGuard',
    source: 'COPY_TRADING',
    positions: [livePos],
    latestRecords: [],
    currentPrices: { ETHUSDT: 2980 },
  });
  assert.equal(openLogs.filter((l) => l.action === 'POSITION_SYNC').length, 1);

  const exitTs = Date.now() + 2000;
  const exitRecord: TraderLatestRecord = {
    id: 'eth_exit_final',
    symbol: 'ETHUSDT',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    side: 'BUY',
    type: 'MARKET',
    positionSide: 'SHORT',
    actionType: 'EXIT',
    actionLabelAr: 'خروج كامل',
    volumePercent: -100,
    remainingPercentAfter: 0,
    executedQty: 5,
    avgPrice: 2950,
    totalPnl: 250,
    orderTime: exitTs,
    entryTime: liveEntryTs,
    exitTime: exitTs,
  };

  const closeLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'trader_loop_guard',
    traderName: 'LoopGuard',
    source: 'COPY_TRADING',
    positions: [],
    latestRecords: [exitRecord],
    currentPrices: { ETHUSDT: 2950 },
  });
  assert.equal(closeLogs.filter((l) => l.action === 'EXIT').length, 1);
  assert.equal(engine.getAccount().positions.filter((p) => p.status === 'OPEN').length, 0);
  assert.equal(engine.getAccount().positions.filter((p) => p.status === 'CLOSED').length, 1);

  // Now simulate repeated polls where stale `livePos` re-appears from cache -> must NEVER re-open!
  for (let i = 0; i < 6; i++) {
    const loopLogs = engine.syncTraderPositionsAndRecords({
      traderId: 'trader_loop_guard',
      traderName: 'LoopGuard',
      source: 'COPY_TRADING',
      positions: [livePos],
      latestRecords: [],
      currentPrices: { ETHUSDT: 2950 + i },
    });
    assert.equal(loopLogs.length, 0);
    assert.equal(engine.getAccount().positions.filter((p) => p.status === 'OPEN').length, 0);
    assert.equal(engine.getAccount().positions.filter((p) => p.status === 'CLOSED').length, 1);
  }
});

test('PaperEngine executes SMART_MONEY whale trades and live SCALE_IN immediately in the exact same moment even when price is higher than whale entry', () => {
  memoryStorage.clear();
  mobileNotifications.clearAllNotifications();
  const engine = new PaperEngine();
  engine.clearAllDataAndReset({ scope: 'ALL_ACCOUNTS' });
  // Even with promptOnUnfavorableLateEntry = true, SMART_MONEY whale trades must execute immediately!
  engine.updateSettings({ promptOnUnfavorableLateEntry: true });

  const whaleEntryTime = Date.now() - 1800_000; // 30 minutes ago
  const whalePos: TraderOpenPosition = {
    id: 'whale_pos_btc_1',
    symbol: 'BTCUSDT',
    collateral: 'USDT',
    positionAmount: 2.0,
    initialPositionAmount: 2.0,
    side: 'LONG',
    entryPrice: 88000,
    markPrice: 91500, // Profitable LONG (+3.97%), which previously got blocked by PROMPT_USER_CHOICE
    breakEvenPrice: 88000,
    unrealizedProfit: 7000,
    cumRealized: 0,
    notionalValue: 183000,
    leverage: 10,
    isolated: false,
    roePercent: 39.7,
    entryTime: whaleEntryTime,
    lastUpdateTime: whaleEntryTime,
    currentScalePercent: 100,
    scaleAdjustments: [
      {
        id: 'whale_pos_btc_1_init',
        actionType: 'INITIAL_ENTRY',
        actionLabelAr: 'فتح',
        timestamp: whaleEntryTime,
        volumePercent: 100,
        remainingPercentAfter: 100,
        executedQty: 2.0,
        price: 88000,
      },
    ],
  };

  const syncLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'whale_smart_1',
    traderName: 'SmartWhaleAlpha',
    source: 'SMART_MONEY',
    positions: [whalePos],
    latestRecords: [],
    currentPrices: { BTCUSDT: 91500 },
  });

  // Must open immediately in the exact same moment without waiting in pendingReconnectChoices
  assert.equal(syncLogs.filter((l) => l.action === 'POSITION_SYNC').length, 1);
  const openPositions = engine.getAccount().positions.filter((p) => p.status === 'OPEN');
  assert.equal(openPositions.length, 1);
  assert.equal(openPositions[0].symbol, 'BTCUSDT');
  assert.equal(openPositions[0].entryPrice, 91500);
  assert.equal(openPositions[0].sourceType, 'SMART_MONEY');
  assert.equal((engine.getSnapshot({ BTCUSDT: 91500 }).pendingReconnectChoices || []).length, 0);

  // Now whale scales in +50% (positionAmount increases from 2.0 to 3.0) live in Positions
  const scaleInTs = Date.now() + 3000;
  const scaledWhalePos: TraderOpenPosition = {
    ...whalePos,
    positionAmount: 3.0,
    markPrice: 91800,
    lastUpdateTime: scaleInTs,
    currentScalePercent: 150,
  };

  const scaleInLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'whale_smart_1',
    traderName: 'SmartWhaleAlpha',
    source: 'SMART_MONEY',
    positions: [scaledWhalePos],
    latestRecords: [],
    currentPrices: { BTCUSDT: 91800 },
  });

  assert.equal(
    scaleInLogs.filter((l) => l.action === 'SCALE_IN').length,
    1,
    'Live whale positionAmount increase (+50%) must execute SCALE_IN immediately'
  );
  const updatedPos = engine.getAccount().positions.find((p) => p.status === 'OPEN');
  assert.ok(updatedPos);
  assert.equal(updatedPos.currentScalePercent, 150);

  // Subsequent poll with same 3.0 quantity must NOT re-trigger SCALE_IN
  const repeatScaleLogs = engine.syncTraderPositionsAndRecords({
    traderId: 'whale_smart_1',
    traderName: 'SmartWhaleAlpha',
    source: 'SMART_MONEY',
    positions: [scaledWhalePos],
    latestRecords: [],
    currentPrices: { BTCUSDT: 91800 },
  });
  assert.equal(repeatScaleLogs.filter((l) => l.action === 'SCALE_IN').length, 0);
});
