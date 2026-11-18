import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePreviousTradePriceAdvantage,
  calculateSecureStopLossPrice,
  isStopLossTriggered,
  resolveLiveMarketExecutionPrice,
  filterPendingChoicesForCopiedTradersOnPage,
  calculateLateEntryNetPositionState,
  shouldApplyTraderRecordAfterEntry,
  formatLateEntryComparisonDetails,
  buildStableTraderEventKey,
  hasSyncEventBeenApplied,
  calculatePositionQuantityDropPartialExitPct,
  calculatePositionQuantityIncreaseScaleInPct,
  shouldExecuteWhaleOrLiveTradeImmediately,
  buildTraderActionId,
  isTraderActionAlreadyProcessed,
  formatTradeTimestampAr,
  isTraderTradePermanentlyClosed,
  hasTraderEntryAlreadyBeenSynced,
  evaluateAccountDrawdownAlertDecision,
  evaluateManualSinglePositionCopyPlan,
  isTakeProfitTriggered,
  calculateSlTpPriceByPriceMovePercent,
  evaluateManualOrderRiskReward,
  inferRecordPositionSide,
  reconcileTraderPositionBeforeCopy,
  reconcileAllTraderPositionsBeforeCopy,
} from '../tradeExecutionRules';
import type {
  ActiveCopiedTrader,
  PaperPosition,
  PendingReconnectTradeChoice,
  PositionScaleAdjustment,
  TraderLatestRecord,
  TraderOpenPosition,
  TraderPositionHistoryItem,
} from '../../types';

test('evaluatePreviousTradePriceAdvantage: SHORT with currentPrice > entryPrice executes immediately', () => {
  const result = evaluatePreviousTradePriceAdvantage({
    side: 'SHORT',
    traderEntryPrice: 100,
    currentMarketPrice: 105,
  });
  assert.equal(result.isFavorable, true);
  assert.equal(result.decision, 'EXECUTE_IMMEDIATELY');
  assert.equal(result.priceDiffPercent, 5);
});

test('evaluatePreviousTradePriceAdvantage: SHORT with currentPrice < entryPrice prompts user choice via notification', () => {
  const result = evaluatePreviousTradePriceAdvantage({
    side: 'SHORT',
    traderEntryPrice: 100,
    currentMarketPrice: 95,
  });
  assert.equal(result.isFavorable, false);
  assert.equal(result.decision, 'PROMPT_USER_CHOICE');
  assert.equal(result.priceDiffPercent, -5);
});

test('evaluatePreviousTradePriceAdvantage: LONG with currentPrice < entryPrice executes immediately', () => {
  const result = evaluatePreviousTradePriceAdvantage({
    side: 'LONG',
    traderEntryPrice: 100,
    currentMarketPrice: 95,
  });
  assert.equal(result.isFavorable, true);
  assert.equal(result.decision, 'EXECUTE_IMMEDIATELY');
  assert.equal(result.priceDiffPercent, -5);
});

test('evaluatePreviousTradePriceAdvantage: LONG with currentPrice > entryPrice prompts user choice via notification', () => {
  const result = evaluatePreviousTradePriceAdvantage({
    side: 'LONG',
    traderEntryPrice: 100,
    currentMarketPrice: 105,
  });
  assert.equal(result.isFavorable, false);
  assert.equal(result.decision, 'PROMPT_USER_CHOICE');
  assert.equal(result.priceDiffPercent, 5);
});

test('calculateSecureStopLossPrice and isStopLossTriggered work for LONG and SHORT', () => {
  const longSl = calculateSecureStopLossPrice({
    side: 'LONG',
    currentMarketPrice: 1000,
    bufferPercent: 0.2,
  });
  assert.equal(longSl, 998);
  assert.equal(isStopLossTriggered({ side: 'LONG', stopLossPrice: longSl, currentMarketPrice: 999 }), false);
  assert.equal(isStopLossTriggered({ side: 'LONG', stopLossPrice: longSl, currentMarketPrice: 998 }), true);
  assert.equal(isStopLossTriggered({ side: 'LONG', stopLossPrice: longSl, currentMarketPrice: 997 }), true);

  const shortSl = calculateSecureStopLossPrice({
    side: 'SHORT',
    currentMarketPrice: 1000,
    bufferPercent: 0.2,
  });
  assert.equal(shortSl, 1002);
  assert.equal(isStopLossTriggered({ side: 'SHORT', stopLossPrice: shortSl, currentMarketPrice: 1001 }), false);
  assert.equal(isStopLossTriggered({ side: 'SHORT', stopLossPrice: shortSl, currentMarketPrice: 1002 }), true);
  assert.equal(isStopLossTriggered({ side: 'SHORT', stopLossPrice: shortSl, currentMarketPrice: 1003 }), true);
});

test('resolveLiveMarketExecutionPrice always prefers current live price over fixed/fallback entry price', () => {
  const livePrices = { BTC: 91234.5, ETH: 2510.25 };
  assert.equal(resolveLiveMarketExecutionPrice('BTC', livePrices, 89000, 88000), 91234.5);
  assert.equal(resolveLiveMarketExecutionPrice('SOL', livePrices, 185.4, 180.0), 185.4);
});

test('filterPendingChoicesForCopiedTradersOnPage returns only trades of copied trader on the active page', () => {
  const copiedTraders: ActiveCopiedTrader[] = [
    {
      traderId: 'trader_copied_1',
      nickname: 'CopiedMaster',
      avatarUrl: '',
      source: 'COPY_TRADING',
      copyBudgetUsdt: 25,
      leverageOverride: null,
      startedAt: 1000,
      syncedPositionsCount: 2,
      syncedRecordsCount: 5,
      autoFollowRecords: true,
      accountId: 'acc_default',
      accountName: 'الحساب الافتراضي 1',
    },
  ];

  const allChoices: PendingReconnectTradeChoice[] = [
    {
      id: 'choice_acc_default_trader_copied_1_BTCUSDT_SHORT',
      createdAt: 2000,
      traderId: 'trader_copied_1',
      traderName: 'CopiedMaster',
      source: 'COPY_TRADING',
      accountId: 'acc_default',
      accountName: 'الحساب الافتراضي 1',
      symbol: 'BTCUSDT',
      side: 'SHORT',
      traderEntryPrice: 92000,
      currentMarketPrice: 91000,
      priceDiffPercent: -1.08,
      leverage: 5,
      marginUsdt: 25,
    },
    {
      id: 'choice_sample_12345',
      createdAt: 2000,
      traderId: 'ct_lead_whale_1',
      traderName: 'AlphaWhale_Pro',
      source: 'COPY_TRADING',
      accountId: 'acc_default',
      accountName: 'الحساب الافتراضي 1',
      symbol: 'BTCUSDT',
      side: 'SHORT',
      traderEntryPrice: 70000,
      currentMarketPrice: 68000,
      priceDiffPercent: -2.85,
      leverage: 5,
      marginUsdt: 25,
    },
  ];

  const filteredForDefault = filterPendingChoicesForCopiedTradersOnPage(
    allChoices,
    copiedTraders,
    'acc_default'
  );
  assert.equal(filteredForDefault.length, 1);
  assert.equal(filteredForDefault[0].traderId, 'trader_copied_1');
});

test('calculateLateEntryNetPositionState: enters directly with net remaining value (e.g. 150% or 50%) without repeating past operations', () => {
  // Case 1: Trader had scaled in +50% in the past -> Net remaining is 150% -> enters directly with 37.50$ (for 25$ base) in 1 single operation
  const pastScaleInAdjs: PositionScaleAdjustment[] = [
    {
      id: 'adj_1',
      actionType: 'INITIAL_ENTRY',
      actionLabelAr: 'فتح',
      timestamp: 1000,
      volumePercent: 100,
      remainingPercentAfter: 100,
      executedQty: 1,
      price: 90000,
    },
    {
      id: 'adj_2',
      actionType: 'SCALE_IN',
      actionLabelAr: 'تدعيم +50%',
      timestamp: 2000,
      volumePercent: 50,
      remainingPercentAfter: 150,
      executedQty: 0.5,
      price: 91000,
    },
  ];

  const state150 = calculateLateEntryNetPositionState({
    baseMarginUsdt: 25,
    leverage: 5,
    executionPrice: 90000,
    side: 'LONG',
    traderScaleAdjustments: pastScaleInAdjs,
    scaleInSamePercentAsTrader: true,
  });

  assert.equal(state150.netScalePercent, 150);
  assert.equal(state150.netMarginUsdt, 37.5);
  assert.equal(state150.singleDirectAdjustment.actionType, 'INITIAL_ENTRY');
  assert.equal(state150.singleDirectAdjustment.volumePercent, 150);
  assert.equal(state150.singleDirectAdjustment.remainingPercentAfter, 150);

  // Case 2: Trader had partially exited -50% in the past -> Net remaining is 50% -> enters directly with 12.50$ (for 25$ base) in 1 single operation
  const pastPartialExitAdjs: PositionScaleAdjustment[] = [
    {
      id: 'adj_1',
      actionType: 'INITIAL_ENTRY',
      actionLabelAr: 'فتح',
      timestamp: 1000,
      volumePercent: 100,
      remainingPercentAfter: 100,
      executedQty: 1,
      price: 2500,
    },
    {
      id: 'adj_2',
      actionType: 'PARTIAL_EXIT',
      actionLabelAr: 'سحب -50%',
      timestamp: 2000,
      volumePercent: -50,
      remainingPercentAfter: 50,
      executedQty: 0.5,
      price: 2600,
    },
  ];

  const state50 = calculateLateEntryNetPositionState({
    baseMarginUsdt: 25,
    leverage: 5,
    executionPrice: 2600,
    side: 'SHORT',
    traderScaleAdjustments: pastPartialExitAdjs,
    scaleInSamePercentAsTrader: true,
  });

  assert.equal(state50.netScalePercent, 50);
  assert.equal(state50.netMarginUsdt, 12.5);
  assert.equal(state50.singleDirectAdjustment.actionType, 'INITIAL_ENTRY');
  assert.equal(state50.singleDirectAdjustment.volumePercent, 50);
  assert.equal(state50.singleDirectAdjustment.remainingPercentAfter, 50);

  // Verify shouldApplyTraderRecordAfterEntry skips past records and allows only future records
  assert.equal(
    shouldApplyTraderRecordAfterEntry({ recordTimestamp: 2000, userPositionOpenTime: 3000 }),
    false
  );
  assert.equal(
    shouldApplyTraderRecordAfterEntry({ recordTimestamp: 4000, userPositionOpenTime: 3000 }),
    true
  );
});

test('formatLateEntryComparisonDetails and calculateLateEntryNetPositionState format both trader entry price+time and user entry price+time on late entry', () => {
  const traderTime = Date.UTC(2026, 10, 12, 8, 15, 0); // 08:15 UTC
  const userTime = traderTime + 45 * 60 * 1000; // 45 minutes later

  const comp = formatLateEntryComparisonDetails({
    traderEntryPrice: 91250.5,
    traderEntryTime: traderTime,
    userEntryPrice: 90840.25,
    userEntryTime: userTime,
  });

  assert.equal(comp.isLateEntry, true);
  assert.equal(comp.delayMs, 45 * 60 * 1000);
  assert.ok(comp.delayTextAr.includes('45 د'));
  assert.equal(comp.traderPriceStr, '91250.50');
  assert.equal(comp.userPriceStr, '90840.25');
  assert.ok(comp.traderEntryLineAr.includes('سعر دخول المتداول: 91250.50$'));
  assert.ok(comp.traderEntryLineAr.includes('الوقت:'));
  assert.ok(comp.userEntryLineAr.includes('سعر دخولي: 90840.25$'));
  assert.ok(comp.userEntryLineAr.includes('الوقت:'));

  const stateWithLateInfo = calculateLateEntryNetPositionState({
    baseMarginUsdt: 25,
    leverage: 5,
    executionPrice: 90840.25,
    side: 'LONG',
    traderEntryPrice: 91250.5,
    traderEntryTime: traderTime,
    entryTimestamp: userTime,
    traderCurrentScalePercent: 150,
  });

  assert.equal(stateWithLateInfo.singleDirectAdjustment.traderEntryPrice, 91250.5);
  assert.equal(stateWithLateInfo.singleDirectAdjustment.traderEntryTime, traderTime);
  assert.equal(stateWithLateInfo.singleDirectAdjustment.price, 90840.25);
  assert.equal(stateWithLateInfo.singleDirectAdjustment.timestamp, userTime);
  assert.ok(stateWithLateInfo.singleDirectAdjustment.actionLabelAr.includes('سعر دخول المتداول: 91250.50$'));
  assert.ok(stateWithLateInfo.singleDirectAdjustment.actionLabelAr.includes('سعر دخولي: 90840.25$'));
});

test('buildStableTraderEventKey, hasSyncEventBeenApplied, and calculatePositionQuantityDropPartialExitPct prevent duplicate partial exits', () => {
  const keyA = buildStableTraderEventKey({
    kind: 'REC',
    symbol: 'BTCUSDT',
    actionType: 'PARTIAL_EXIT',
    timestamp: 1700000100000,
    volumePercent: 35,
    quantity: 0.25,
  });
  const keyB = buildStableTraderEventKey({
    kind: 'REC',
    symbol: 'btcusdt',
    actionType: 'PARTIAL_EXIT',
    timestamp: 1700000100000,
    volumePercent: -35,
    quantity: 0.25,
  });
  assert.equal(keyA, keyB);

  assert.equal(
    hasSyncEventBeenApplied({
      appliedSyncEventIds: [keyA],
      scaleAdjustments: [],
      candidateKeys: [keyB],
      actionType: 'PARTIAL_EXIT',
      eventTimestamp: 1700009999999, // even far in the future, ID match blocks re-execution
    }),
    true
  );

  assert.equal(
    hasSyncEventBeenApplied({
      appliedSyncEventIds: [],
      scaleAdjustments: [
        {
          id: 'pos_partial_1',
          actionType: 'PARTIAL_EXIT',
          actionLabelAr: 'انسحاب',
          timestamp: 1700000100000,
          volumePercent: -35,
          remainingPercentAfter: 65,
          executedQty: 0.1,
          price: 90000,
          sourceEventId: keyA,
        },
      ],
      candidateKeys: [keyA],
      actionType: 'PARTIAL_EXIT',
      eventTimestamp: 1700009999999,
    }),
    true
  );

  assert.equal(calculatePositionQuantityDropPartialExitPct({ previousQty: 10, currentQty: 9.7 }), 0);
  assert.equal(calculatePositionQuantityDropPartialExitPct({ previousQty: 10, currentQty: 12 }), 0);
  assert.equal(calculatePositionQuantityDropPartialExitPct({ previousQty: 10, currentQty: 6 }), 40);
});

test('evaluatePreviousTradePriceAdvantage executes immediately at market when promptOnUnfavorableLateEntry is false', () => {
  const shortUnfavAuto = evaluatePreviousTradePriceAdvantage({
    side: 'SHORT',
    traderEntryPrice: 100,
    currentMarketPrice: 95,
    promptOnUnfavorableLateEntry: false,
  });
  assert.equal(shortUnfavAuto.isFavorable, false);
  assert.equal(shortUnfavAuto.decision, 'EXECUTE_IMMEDIATELY');
  assert.equal(shortUnfavAuto.priceDiffPercent, -5);

  const longUnfavAuto = evaluatePreviousTradePriceAdvantage({
    side: 'LONG',
    traderEntryPrice: 100,
    currentMarketPrice: 108,
    promptOnUnfavorableLateEntry: false,
  });
  assert.equal(longUnfavAuto.isFavorable, false);
  assert.equal(longUnfavAuto.decision, 'EXECUTE_IMMEDIATELY');
  assert.equal(longUnfavAuto.priceDiffPercent, 8);
});

test('buildTraderActionId and isTraderActionAlreadyProcessed validate version, lastProcessedActionId, and per-symbol recency', () => {
  const actionId1 = buildTraderActionId({
    traderId: 'trader_abc',
    symbol: 'BTCUSDT',
    actionType: 'PARTIAL_EXIT',
    rawId: 'ord_99',
    timestamp: 1700000100000,
  });
  const checkpoint = {
    version: 3,
    lastProcessedActionId: actionId1,
    lastProcessedTimestamp: 1700000100000,
    processedActionIds: [actionId1],
    lastActionsBySymbol: {
      BTCUSDT: {
        actionId: actionId1,
        actionType: 'PARTIAL_EXIT',
        timestamp: 1700000100000,
      },
    },
  };

  assert.equal(
    isTraderActionAlreadyProcessed({ checkpoint, incomingSyncVersion: 3, candidateActionIds: [] }),
    true
  );
  assert.equal(
    isTraderActionAlreadyProcessed({
      checkpoint,
      incomingSyncVersion: 4,
      candidateActionIds: [actionId1],
    }),
    true
  );
  assert.equal(
    isTraderActionAlreadyProcessed({
      checkpoint,
      incomingSyncVersion: 4,
      candidateActionIds: ['new_action_eth'],
      symbol: 'ETHUSDT',
      actionType: 'PARTIAL_EXIT',
      eventTimestamp: 1700000105000,
    }),
    false
  );
  assert.equal(
    isTraderActionAlreadyProcessed({
      checkpoint,
      incomingSyncVersion: 4,
      candidateActionIds: ['btc_live_qty_drop'],
      symbol: 'BTCUSDT',
      actionType: 'PARTIAL_EXIT',
      eventTimestamp: 1700000120000,
    }),
    true
  );
});

test('formatTradeTimestampAr renders full date (YYYY-MM-DD) in front of time (HH:mm:ss) with Western digits', () => {
  const ts = Date.UTC(2026, 4, 14, 9, 5, 30);
  const formatted = formatTradeTimestampAr(ts);
  assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(/[\u0660-\u0669\u06F0-\u06F9]/.test(formatted), false);
});

test('isTraderTradePermanentlyClosed detects exited trades and permits genuinely newer re-entries', () => {
  const tEntryOld = 1700000000000;
  const tExitOld = 1700003600000;
  const tEntryNew = 1700007200000;

  const closedRecords: TraderLatestRecord[] = [
    {
      id: 'rec_exit_1',
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
      avgPrice: 92000,
      totalPnl: 2000,
      orderTime: tExitOld,
      entryTime: tEntryOld,
      exitTime: tExitOld,
    },
    {
      id: 'rec_entry_1',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'MARKET',
      positionSide: 'LONG',
      actionType: 'ENTRY',
      actionLabelAr: 'دخول',
      volumePercent: 100,
      remainingPercentAfter: 100,
      executedQty: 1,
      avgPrice: 90000,
      totalPnl: 0,
      orderTime: tEntryOld,
      entryTime: tEntryOld,
    },
  ];

  const history: TraderPositionHistoryItem[] = [
    {
      id: 'hist_1',
      symbol: 'ETHUSDT',
      side: 'SHORT',
      opened: tEntryOld,
      closed: tExitOld,
      avgCost: 3000,
      avgClosePrice: 2900,
      closingPnl: 100,
      maxOpenInterest: 1,
      closedVolume: 1,
      isolated: false,
      scaleAdjustments: [],
    },
  ];

  assert.equal(
    isTraderTradePermanentlyClosed({
      symbol: 'BTCUSDT',
      side: 'LONG',
      entryTime: tEntryOld,
      latestRecords: closedRecords,
      positionHistory: history,
    }),
    true
  );

  assert.equal(
    isTraderTradePermanentlyClosed({
      symbol: 'ETHUSDT',
      side: 'SHORT',
      entryTime: tEntryOld,
      latestRecords: closedRecords,
      positionHistory: history,
    }),
    true
  );

  // Newer ENTRY after the prior EXIT must NOT be marked closed
  const recordsWithNewEntry: TraderLatestRecord[] = [
    {
      id: 'rec_entry_new',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'MARKET',
      positionSide: 'LONG',
      actionType: 'ENTRY',
      actionLabelAr: 'دخول جديد',
      volumePercent: 100,
      remainingPercentAfter: 100,
      executedQty: 1,
      avgPrice: 93000,
      totalPnl: 0,
      orderTime: tEntryNew,
      entryTime: tEntryNew,
    },
    ...closedRecords,
  ];

  assert.equal(
    isTraderTradePermanentlyClosed({
      symbol: 'BTCUSDT',
      side: 'LONG',
      entryTime: tEntryNew,
      latestRecords: recordsWithNewEntry,
      positionHistory: history,
    }),
    false
  );
});

test('hasTraderEntryAlreadyBeenSynced blocks re-opening closed historical entries while allowing genuinely new entries', () => {
  const tOldEntry = 1700000000000;
  const tClosed = 1700001800000;
  const tBrandNewEntry = 1700009000000;

  const closedPos: PaperPosition = {
    id: 'paper_closed_1',
    accountId: 'acc_default',
    symbol: 'SOLUSDT',
    side: 'LONG',
    entryPrice: 180,
    exitPrice: 185,
    quantity: 2,
    marginUsdt: 25,
    leverage: 5,
    openTime: tOldEntry + 60_000,
    closeTime: tClosed,
    traderEntryTime: tOldEntry,
    status: 'CLOSED',
    sourceTraderId: 'trader_x',
    sourceTraderName: 'TraderX',
    sourceType: 'COPY_TRADING',
    commissionUsdt: 0,
  };

  assert.equal(
    hasTraderEntryAlreadyBeenSynced({
      traderId: 'trader_x',
      traderName: 'TraderX',
      symbol: 'SOLUSDT',
      side: 'LONG',
      entryTime: tOldEntry,
      accountPositions: [closedPos],
    }),
    true
  );

  assert.equal(
    hasTraderEntryAlreadyBeenSynced({
      traderId: 'trader_x',
      traderName: 'TraderX',
      symbol: 'SOLUSDT',
      side: 'LONG',
      entryTime: tBrandNewEntry,
      accountPositions: [closedPos],
    }),
    false
  );
});

test('isTraderTradePermanentlyClosed ignores Partially Closed rows and hasTraderEntryAlreadyBeenSynced permits syncing open positions after account reset', () => {
  const tOpened = 1700005000000;
  const openPosHistItem = {
    id: 'hist_open_1',
    symbol: 'SPCXUSDT',
    side: 'LONG' as const,
    opened: tOpened,
    closed: 0,
    avgCost: 130,
    avgClosePrice: 0,
    closingPnl: 0,
    maxOpenInterest: 100,
    closedVolume: 20,
    isolated: false,
    scaleAdjustments: [],
    status: 'Partially Closed',
  };

  assert.equal(
    isTraderTradePermanentlyClosed({
      symbol: 'SPCXUSDT',
      side: 'LONG',
      entryTime: tOpened,
      latestRecords: [],
      positionHistory: [openPosHistItem as TraderPositionHistoryItem],
    }),
    false
  );

  // If accountPositions is empty (e.g. after clearing history / resetting), an ENTRY checkpoint must NOT block syncing the open position
  const entryActionId = buildTraderActionId({
    traderId: 'trader_open',
    symbol: 'BTCUSDT',
    actionType: 'ENTRY',
    rawId: 'pos_1',
    timestamp: tOpened,
  });

  assert.equal(
    hasTraderEntryAlreadyBeenSynced({
      traderId: 'trader_open',
      symbol: 'BTCUSDT',
      side: 'LONG',
      rawPositionId: 'pos_1',
      entryTime: tOpened,
      accountPositions: [],
      checkpoint: {
        key: 'acc_default::COPY_TRADING::trader_open',
        accountId: 'acc_default',
        source: 'COPY_TRADING',
        traderId: 'trader_open',
        traderName: 'OpenTrader',
        version: 1,
        lastProcessedActionId: entryActionId,
        lastProcessedTimestamp: tOpened,
        processedActionIds: [entryActionId],
        lastActionsBySymbol: {
          BTCUSDT: {
            actionId: entryActionId,
            actionType: 'ENTRY',
            timestamp: tOpened,
          },
        },
        updatedAt: tOpened,
      },
    }),
    false
  );
});

test('calculatePositionQuantityIncreaseScaleInPct and shouldExecuteWhaleOrLiveTradeImmediately support instant whale trade execution', () => {
  assert.equal(calculatePositionQuantityIncreaseScaleInPct({ previousQty: 10, currentQty: 10.2 }), 0);
  assert.equal(calculatePositionQuantityIncreaseScaleInPct({ previousQty: 10, currentQty: 8 }), 0);
  assert.equal(calculatePositionQuantityIncreaseScaleInPct({ previousQty: 10, currentQty: 15 }), 50);

  // SMART_MONEY whale trades ALWAYS execute immediately regardless of age
  assert.equal(
    shouldExecuteWhaleOrLiveTradeImmediately({
      source: 'SMART_MONEY',
      entryTime: 1700000000000,
      now: 1700009999999,
    }),
    true
  );

  // Fresh COPY_TRADING trade opened within 3 minutes executes immediately
  assert.equal(
    shouldExecuteWhaleOrLiveTradeImmediately({
      source: 'COPY_TRADING',
      entryTime: 1700000000000 - 30_000,
      now: 1700000000000,
    }),
    true
  );

  // Trade opened after copiedStartedAt executes immediately
  assert.equal(
    shouldExecuteWhaleOrLiveTradeImmediately({
      source: 'COPY_TRADING',
      entryTime: 1700005000000,
      copiedStartedAt: 1700004000000,
      now: 1700009000000,
    }),
    true
  );

  // Older COPY_TRADING trade opened hours before copiedStartedAt without forceImmediateExecution returns false
  assert.equal(
    shouldExecuteWhaleOrLiveTradeImmediately({
      source: 'COPY_TRADING',
      entryTime: 1700000000000,
      copiedStartedAt: 1700005000000,
      now: 1700006000000,
    }),
    false
  );
});

test('evaluateAccountDrawdownAlertDecision prevents duplicate low-balance notifications on internet reconnect and price oscillation (v2.16)', () => {
  const t0 = 1700000000000;

  // 1. First time crossing 10% threshold (at 11.2%) alerts once
  const first = evaluateAccountDrawdownAlertDecision({
    drawdownPercent: 11.2,
    thresholdPercent: 10,
    previousState: null,
    now: t0,
    isOnline: true,
  });
  assert.equal(first.shouldAlert, true);
  assert.ok(first.nextState);
  assert.equal(first.nextState.isArmed, false);

  // 2. Rapid oscillation down to 5% (e.g. partial price map on reconnect 500ms later) and back to 11.5% must NOT re-arm or re-alert
  const oscDown = evaluateAccountDrawdownAlertDecision({
    drawdownPercent: 5.0,
    thresholdPercent: 10,
    previousState: first.nextState,
    now: t0 + 500,
    isOnline: true,
  });
  assert.equal(oscDown.shouldAlert, false);
  assert.equal(oscDown.nextState?.isArmed, false);

  const oscUp = evaluateAccountDrawdownAlertDecision({
    drawdownPercent: 11.5,
    thresholdPercent: 10,
    previousState: oscDown.nextState,
    now: t0 + 1000,
    isOnline: true,
  });
  assert.equal(oscUp.shouldAlert, false);

  // 3. During offline -> online reconnect grace window (within 4000ms of lastOnlineReconnectAt), never alerts or resets state
  const reconnectTick = evaluateAccountDrawdownAlertDecision({
    drawdownPercent: 18.0, // even if +6.8% higher during the 4s reconnect stabilization window
    thresholdPercent: 10,
    previousState: oscUp.nextState,
    now: t0 + 10_000,
    isOnline: true,
    lastOnlineReconnectAt: t0 + 8_500,
    reconnectGracePeriodMs: 4000,
  });
  assert.equal(reconnectTick.shouldAlert, false);

  // 4. Escalation (+5% worse, e.g. 17.0%) within 1 minute of first alert is suppressed by minEscalationCooldownMs (5 minutes)
  const earlyEscalation = evaluateAccountDrawdownAlertDecision({
    drawdownPercent: 17.0,
    thresholdPercent: 10,
    previousState: oscUp.nextState,
    now: t0 + 60_000,
    isOnline: true,
  });
  assert.equal(earlyEscalation.shouldAlert, false);

  // 5. After 6 minutes (> 5 min escalation cooldown), if drawdown worsened by >= 5% (to 17.0%), it alerts once
  const validEscalation = evaluateAccountDrawdownAlertDecision({
    drawdownPercent: 17.0,
    thresholdPercent: 10,
    previousState: oscUp.nextState,
    now: t0 + 6 * 60_000,
    isOnline: true,
  });
  assert.equal(validEscalation.shouldAlert, true);
});

test('evaluateManualSinglePositionCopyPlan: opens new position once, does nothing if already copied with no changes, and copies ONLY uncopied deltas (v2.17)', () => {
  const tEntry = 1700000000000;
  const incomingPos: TraderOpenPosition = {
    id: 'pos_btc_1',
    symbol: 'BTCUSDT',
    collateral: 'USDT',
    positionAmount: 1.0,
    side: 'LONG',
    entryPrice: 90000,
    markPrice: 91000,
    breakEvenPrice: 90000,
    unrealizedProfit: 1000,
    cumRealized: 0,
    notionalValue: 91000,
    leverage: 5,
    isolated: false,
    roePercent: 5.5,
    entryTime: tEntry,
    lastUpdateTime: tEntry,
    currentScalePercent: 100,
    scaleAdjustments: [
      {
        id: 'init_1',
        actionType: 'INITIAL_ENTRY',
        actionLabelAr: 'فتح',
        timestamp: tEntry,
        volumePercent: 100,
        remainingPercentAfter: 100,
        executedQty: 1.0,
        price: 90000,
      },
    ],
  };

  // 1. Not copied yet -> OPEN_NEW
  const planNew = evaluateManualSinglePositionCopyPlan({
    incomingPos,
    traderName: 'AlphaTrader',
    existingOpenPositions: [],
    executionPrice: 91000,
  });
  assert.equal(planNew.decision, 'OPEN_NEW');
  assert.equal(planNew.existingPosition, null);

  // 2. Already copied & open with no new adjustments -> DO_NOTHING_ALREADY_COPIED
  const existingPos: PaperPosition = {
    id: 'paper_pos_1',
    accountId: 'acc_default',
    symbol: 'BTCUSDT',
    side: 'LONG',
    quantity: 0.00137,
    marginUsdt: 25,
    initialMarginUsdt: 25,
    entryPrice: 91000,
    leverage: 5,
    commissionUsdt: 0.05,
    status: 'OPEN',
    openTime: tEntry + 5000,
    traderEntryTime: tEntry,
    currentScalePercent: 100,
    sourceTraderName: 'AlphaTrader',
    sourceType: 'COPY_TRADING',
    appliedSyncEventIds: [...planNew.initialAppliedEventKeys],
    lastSyncedTraderQty: 1.0,
    scaleAdjustments: [],
  };

  const planAlreadyCopied = evaluateManualSinglePositionCopyPlan({
    incomingPos,
    traderName: 'AlphaTrader',
    existingOpenPositions: [existingPos],
    executionPrice: 91000,
  });
  assert.equal(planAlreadyCopied.decision, 'DO_NOTHING_ALREADY_COPIED');
  assert.equal(planAlreadyCopied.deltaActions.length, 0);

  // 3. Already copied, and trader has an uncopied PARTIAL_EXIT (-40%) -> SYNC_DELTAS_ONLY
  const tPartial = tEntry + 60_000;
  const posWithUncopiedPartialExit: TraderOpenPosition = {
    ...incomingPos,
    positionAmount: 0.6,
    lastUpdateTime: tPartial,
    currentScalePercent: 60,
    scaleAdjustments: [
      ...incomingPos.scaleAdjustments,
      {
        id: 'partial_exit_40',
        actionType: 'PARTIAL_EXIT',
        actionLabelAr: 'انسحاب جزئي -40%',
        timestamp: tPartial,
        volumePercent: -40,
        remainingPercentAfter: 60,
        executedQty: 0.4,
        price: 92000,
      },
    ],
  };

  const planDelta = evaluateManualSinglePositionCopyPlan({
    incomingPos: posWithUncopiedPartialExit,
    traderName: 'AlphaTrader',
    existingOpenPositions: [existingPos],
    executionPrice: 92000,
  });
  assert.equal(planDelta.decision, 'SYNC_DELTAS_ONLY');
  assert.equal(planDelta.deltaActions.length, 1);
  assert.equal(planDelta.deltaActions[0].actionType, 'PARTIAL_EXIT');
  assert.equal(planDelta.deltaActions[0].volumePercent, 40);
});

test('isTakeProfitTriggered and calculateSlTpPriceByPriceMovePercent work for LONG and SHORT', () => {
  // LONG at 1000: +5% TP = 1050, -2% SL = 980
  const longTp = calculateSlTpPriceByPriceMovePercent({
    side: 'LONG',
    entryPrice: 1000,
    movePercent: 5,
    kind: 'TAKE_PROFIT',
  });
  const longSl = calculateSlTpPriceByPriceMovePercent({
    side: 'LONG',
    entryPrice: 1000,
    movePercent: 2,
    kind: 'STOP_LOSS',
  });
  assert.equal(longTp, 1050);
  assert.equal(longSl, 980);
  assert.equal(isTakeProfitTriggered({ side: 'LONG', takeProfitPrice: longTp, currentMarketPrice: 1049 }), false);
  assert.equal(isTakeProfitTriggered({ side: 'LONG', takeProfitPrice: longTp, currentMarketPrice: 1050 }), true);
  assert.equal(isTakeProfitTriggered({ side: 'LONG', takeProfitPrice: longTp, currentMarketPrice: 1060 }), true);

  // SHORT at 1000: +5% TP = 950, -2% SL = 1020
  const shortTp = calculateSlTpPriceByPriceMovePercent({
    side: 'SHORT',
    entryPrice: 1000,
    movePercent: 5,
    kind: 'TAKE_PROFIT',
  });
  const shortSl = calculateSlTpPriceByPriceMovePercent({
    side: 'SHORT',
    entryPrice: 1000,
    movePercent: 2,
    kind: 'STOP_LOSS',
  });
  assert.equal(shortTp, 950);
  assert.equal(shortSl, 1020);
  assert.equal(isTakeProfitTriggered({ side: 'SHORT', takeProfitPrice: shortTp, currentMarketPrice: 951 }), false);
  assert.equal(isTakeProfitTriggered({ side: 'SHORT', takeProfitPrice: shortTp, currentMarketPrice: 950 }), true);
  assert.equal(isTakeProfitTriggered({ side: 'SHORT', takeProfitPrice: shortTp, currentMarketPrice: 940 }), true);
});

test('evaluateManualOrderRiskReward calculates notional, liquidation price, SL loss, TP profit, and R:R ratio', () => {
  const evalLong = evaluateManualOrderRiskReward({
    side: 'LONG',
    entryPrice: 1000,
    marginUsdt: 100,
    leverage: 10,
    commissionPercent: 0,
    stopLossPrice: 980, // -2% price move -> -20% ROE -> -20 USDT
    takeProfitPrice: 1060, // +6% price move -> +60% ROE -> +60 USDT
  });

  assert.equal(evalLong.notionalUsdt, 1000);
  assert.equal(evalLong.quantity, 1);
  assert.equal(evalLong.stopLossValid, true);
  assert.equal(evalLong.takeProfitValid, true);
  assert.equal(evalLong.estimatedLossAtSlUsdt, -20);
  assert.equal(evalLong.estimatedLossAtSlRoePercent, -20);
  assert.equal(evalLong.estimatedProfitAtTpUsdt, 60);
  assert.equal(evalLong.estimatedProfitAtTpRoePercent, 60);
  assert.equal(evalLong.riskRewardRatio, 3);
});

test('reconcileTraderPositionBeforeCopy (v2.21): discards finished/closed trades before copying so they never open and close 3s later', () => {
  const tOpen = 1_715_000_000_000;
  const tClose = tOpen + 60_000;

  const candidatePos: TraderOpenPosition = {
    id: 'pos_closed_btc',
    symbol: 'BTCUSDT',
    collateral: 'USDT',
    positionAmount: 0.5,
    initialPositionAmount: 0.5,
    side: 'LONG',
    entryPrice: 90000,
    markPrice: 91000,
    breakEvenPrice: 90010,
    unrealizedProfit: 500,
    cumRealized: 0,
    notionalValue: 45500,
    leverage: 10,
    isolated: false,
    roePercent: 11,
    entryTime: tOpen,
    lastUpdateTime: tOpen,
    currentScalePercent: 100,
    scaleAdjustments: [
      {
        id: 'adj_init',
        actionType: 'INITIAL_ENTRY',
        actionLabelAr: 'فتح الصفقة 100%',
        timestamp: tOpen,
        volumePercent: 100,
        remainingPercentAfter: 100,
        executedQty: 0.5,
        price: 90000,
      },
    ],
  };

  // Case 1: Trader has an EXIT order in latestRecords after entryTime
  const exitRecord: TraderLatestRecord = {
    id: 'rec_exit_1',
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    side: 'SELL',
    type: 'MARKET',
    positionSide: 'BOTH',
    actionType: 'EXIT',
    actionLabelAr: 'خروج كامل -100%',
    volumePercent: -100,
    remainingPercentAfter: 0,
    executedQty: 0.5,
    avgPrice: 91000,
    totalPnl: 500,
    orderTime: tClose,
    entryTime: tOpen,
    exitTime: tClose,
  };

  const resWithExitRecord = reconcileTraderPositionBeforeCopy({
    position: candidatePos,
    latestRecords: [exitRecord],
    positionHistory: [],
    traderId: 'trader_1',
  });
  assert.equal(resWithExitRecord.isFinished, true);
  assert.equal(resWithExitRecord.reconciledPosition, null);
  assert.equal(resWithExitRecord.netRemainingScalePercent, 0);

  // Case 2: Position history reports >= 98% of maxOpenInterest withdrawn ("Partially Closed" or "All Closed")
  const closedHistory: TraderPositionHistoryItem = {
    id: 'hist_1',
    symbol: 'BTCUSDT',
    side: 'LONG',
    opened: tOpen,
    closed: tClose,
    avgCost: 90000,
    avgClosePrice: 91000,
    closingPnl: 500,
    maxOpenInterest: 0.5,
    closedVolume: 0.5,
    isolated: false,
    scaleAdjustments: [],
  };

  const resWithClosedHistory = reconcileTraderPositionBeforeCopy({
    position: candidatePos,
    latestRecords: [],
    positionHistory: [closedHistory],
    traderId: 'trader_1',
  });
  assert.equal(resWithClosedHistory.isFinished, true);
  assert.equal(resWithClosedHistory.reconciledPosition, null);
});

test('reconcileTraderPositionBeforeCopy (v2.21): reconciles scale-ins and partial withdrawals and copies ONLY what remains', () => {
  const tPriorClose = 1_715_000_000_000;
  const tOpen = tPriorClose + 120_000;
  const tScaleIn = tOpen + 180_000;
  const tPartialExit = tOpen + 360_000;

  // Trader had a prior closed position at tPriorClose (which must be ignored)
  // Then opened a new BTCUSDT SHORT at tOpen (100%), scaled in +50% (150%), and withdrew -40% -> remaining = 90%
  const candidatePos: TraderOpenPosition = {
    id: 'pos_active_btc_short',
    symbol: 'BTCUSDT',
    collateral: 'USDT',
    positionAmount: 0.9,
    initialPositionAmount: 1.0,
    side: 'SHORT',
    entryPrice: 95000,
    markPrice: 94000,
    breakEvenPrice: 94950,
    unrealizedProfit: 900,
    cumRealized: 300,
    notionalValue: 84600,
    leverage: 10,
    isolated: false,
    roePercent: 10.6,
    entryTime: tOpen,
    lastUpdateTime: tPartialExit,
    currentScalePercent: 90,
    scaleAdjustments: [
      // Stale adjustment from prior closed cycle (before tPriorClose) that must be stripped
      {
        id: 'stale_adj_before_close',
        actionType: 'SCALE_IN',
        actionLabelAr: 'تدعيم قديم +100%',
        timestamp: tPriorClose - 60_000,
        volumePercent: 100,
        remainingPercentAfter: 200,
        executedQty: 1.0,
        price: 96000,
      },
      {
        id: 'adj_entry',
        actionType: 'INITIAL_ENTRY',
        actionLabelAr: 'فتح الصفقة الأولي 100%',
        timestamp: tOpen,
        volumePercent: 100,
        remainingPercentAfter: 100,
        executedQty: 1.0,
        price: 95000,
      },
      {
        id: 'adj_scale_in',
        actionType: 'SCALE_IN',
        actionLabelAr: 'تدعيم +50%',
        timestamp: tScaleIn,
        volumePercent: 50,
        remainingPercentAfter: 150,
        executedQty: 0.5,
        price: 95500,
      },
      {
        id: 'adj_partial_exit',
        actionType: 'PARTIAL_EXIT',
        actionLabelAr: 'سحب جزئي -40%',
        timestamp: tPartialExit,
        volumePercent: -40,
        remainingPercentAfter: 90,
        executedQty: 0.6,
        price: 94200,
      },
    ],
  };

  const priorClosedHist: TraderPositionHistoryItem = {
    id: 'hist_prior',
    symbol: 'BTCUSDT',
    side: 'SHORT',
    opened: tPriorClose - 300_000,
    closed: tPriorClose,
    avgCost: 96000,
    avgClosePrice: 95200,
    closingPnl: 800,
    maxOpenInterest: 1.0,
    closedVolume: 1.0,
    isolated: false,
    scaleAdjustments: [],
  };

  const reconciled = reconcileTraderPositionBeforeCopy({
    position: candidatePos,
    latestRecords: [],
    positionHistory: [priorClosedHist],
    traderId: 'trader_2',
  });

  assert.equal(reconciled.isFinished, false);
  assert.ok(reconciled.reconciledPosition);
  assert.equal(reconciled.scaleInCount, 1);
  assert.equal(reconciled.partialExitCount, 1);
  assert.equal(reconciled.netRemainingScalePercent, 90);
  assert.equal(reconciled.reconciledPosition.currentScalePercent, 90);

  // Verify calculateLateEntryNetPositionState copies ONLY the remaining 90% (22.5 USDT on a 25 USDT base trade)
  const lateState = calculateLateEntryNetPositionState({
    baseMarginUsdt: 25,
    leverage: 10,
    executionPrice: 94000,
    side: 'SHORT',
    traderEntryPrice: reconciled.reconciledPosition.entryPrice,
    traderEntryTime: reconciled.reconciledPosition.entryTime,
    traderCurrentScalePercent: reconciled.reconciledPosition.currentScalePercent,
    traderScaleAdjustments: reconciled.reconciledPosition.scaleAdjustments,
    scaleInSamePercentAsTrader: true,
  });
  assert.equal(lateState.netScalePercent, 90);
  assert.equal(lateState.netMarginUsdt, 22.5);
});

test('reconcileAllTraderPositionsBeforeCopy (v2.21): reconciles direct quantity reductions (e.g. maxOpenInterest 0.17 -> current 0.11 = 65%) and filters closed positions', () => {
  const tOpen = 1_715_500_000_000;

  const partiallyClosedPos: TraderOpenPosition = {
    id: 'pos_partial_qty',
    symbol: 'BTCUSDT',
    collateral: 'USDT',
    positionAmount: 0.11,
    initialPositionAmount: 0.17,
    side: 'SHORT',
    entryPrice: 74986.88,
    markPrice: 74200,
    breakEvenPrice: 75000,
    unrealizedProfit: 86.55,
    cumRealized: 132.42,
    notionalValue: 8162,
    leverage: 10,
    isolated: false,
    roePercent: 10.6,
    entryTime: tOpen,
    lastUpdateTime: tOpen + 60_000,
    currentScalePercent: 100,
    scaleAdjustments: [
      {
        id: 'adj_init',
        actionType: 'INITIAL_ENTRY',
        actionLabelAr: 'فتح الصفقة الأولي 100%',
        timestamp: tOpen,
        volumePercent: 100,
        remainingPercentAfter: 100,
        executedQty: 0.17,
        price: 74986.88,
      },
    ],
  };

  const batch = reconcileAllTraderPositionsBeforeCopy({
    positions: [partiallyClosedPos],
    latestRecords: [],
    positionHistory: [],
    traderId: 'trader_partial',
  });

  assert.equal(batch.openPositions.length, 1);
  assert.equal(batch.discardedFinishedPositions.length, 0);
  assert.equal(batch.openPositions[0].currentScalePercent, 65);
  assert.equal(batch.openPositions[0].positionAmount, 0.11);
  assert.equal(inferRecordPositionSide({ positionSide: 'BOTH', side: 'SELL', actionType: 'EXIT' }), 'LONG');
  assert.equal(inferRecordPositionSide({ positionSide: 'BOTH', side: 'BUY', actionType: 'EXIT' }), 'SHORT');
});



