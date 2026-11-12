import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePreviousTradePriceAdvantage,
  calculateSecureStopLossPrice,
  isStopLossTriggered,
  resolveLiveMarketExecutionPrice,
  filterPendingChoicesForCopiedTradersOnPage,
} from '../tradeExecutionRules';
import type { ActiveCopiedTrader, PendingReconnectTradeChoice } from '../../types';

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
  // LONG at 1000 with 0.2% buffer -> stopLoss at 998
  const longSl = calculateSecureStopLossPrice({
    side: 'LONG',
    currentMarketPrice: 1000,
    bufferPercent: 0.2,
  });
  assert.equal(longSl, 998);
  assert.equal(isStopLossTriggered({ side: 'LONG', stopLossPrice: longSl, currentMarketPrice: 999 }), false);
  assert.equal(isStopLossTriggered({ side: 'LONG', stopLossPrice: longSl, currentMarketPrice: 998 }), true);
  assert.equal(isStopLossTriggered({ side: 'LONG', stopLossPrice: longSl, currentMarketPrice: 997 }), true);

  // SHORT at 1000 with 0.2% buffer -> stopLoss at 1002
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
    {
      id: 'choice_acc_2_trader_copied_1_ETHUSDT_LONG',
      createdAt: 2000,
      traderId: 'trader_copied_1',
      traderName: 'CopiedMaster',
      source: 'COPY_TRADING',
      accountId: 'acc_2',
      accountName: 'حساب 2',
      symbol: 'ETHUSDT',
      side: 'LONG',
      traderEntryPrice: 2400,
      currentMarketPrice: 2500,
      priceDiffPercent: 4.16,
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
  assert.equal(filteredForDefault[0].symbol, 'BTCUSDT');

  // When no trader is copied on acc_2, returns empty array
  const filteredForAcc2 = filterPendingChoicesForCopiedTradersOnPage(
    allChoices,
    copiedTraders,
    'acc_2'
  );
  assert.equal(filteredForAcc2.length, 0);
});

