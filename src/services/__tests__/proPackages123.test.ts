import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateKuCoinFuturesContractsSize } from '../kucoinApi';
import {
  DEFAULT_KUCOIN_SECURITY_CONFIG,
  hashPinSync,
  isPinHashed,
  verifyPinCode,
  isDefaultPinActive,
  validatePinChange,
  performBiometricAuthentication,
} from '../kucoinSecurityLock';
import { PaperEngine } from '../paperTrading';
import {
  calculateLiquidationPrice,
  updateTrailingStopForPosition,
  evaluateCopySlippageGuard,
  evaluateDailyLossCircuitBreaker,
  isSymbolAllowedByFilter,
  resolveEffectiveCopySide,
  calculateProportionalCopyMargin,
  calculateTraderQualityScore,
  computeProAccountAnalytics,
  exportPositionsToCsv,
} from '../proRiskAndAnalytics';
import type { PaperPosition } from '../../types';

// ============================================================================
// 1. KuCoin Futures Contract Sizing (Package 1)
// ============================================================================

test('calculateKuCoinFuturesContractsSize respects XBTUSDTM, ETHUSDTM, DOGEUSDTM, PEPEUSDTM multipliers and min floor', () => {
  // XBTUSDTM: multiplier = 0.001 BTC/contract. At $100,000 BTC, 1 contract = $100 notional.
  // $500 notional => 0.005 BTC => 5 contracts.
  const btc = calculateKuCoinFuturesContractsSize('XBTUSDTM', 500, 100_000);
  assert.equal(btc.multiplier, 0.001);
  assert.equal(btc.lotSize, 1);
  assert.equal(btc.contracts, 5);

  // ETHUSDTM: multiplier = 0.01 ETH/contract. At $3,000 ETH, 1 contract = $30 notional.
  // $300 notional => 0.1 ETH => 10 contracts.
  const eth = calculateKuCoinFuturesContractsSize('ETHUSDTM', 300, 3_000);
  assert.equal(eth.multiplier, 0.01);
  assert.equal(eth.contracts, 10);

  // DOGEUSDTM: multiplier = 100 DOGE/contract. At $0.20 DOGE, 1 contract = $20 notional.
  // $100 notional => 500 DOGE => 5 contracts.
  const doge = calculateKuCoinFuturesContractsSize('DOGEUSDTM', 100, 0.2);
  assert.equal(doge.multiplier, 100);
  assert.equal(doge.contracts, 5);

  // PEPEUSDTM: multiplier = 1,000,000 PEPE/contract. At $0.00001, 1 contract = $10 notional.
  // $50 notional => 5,000,000 PEPE => 5 contracts.
  const pepe = calculateKuCoinFuturesContractsSize('PEPEUSDTM', 50, 0.00001);
  assert.equal(pepe.multiplier, 1_000_000);
  assert.equal(pepe.contracts, 5);

  // Tiny order still enforces minimum 1 contract floor
  const tiny = calculateKuCoinFuturesContractsSize('XBTUSDTM', 1, 100_000);
  assert.equal(tiny.contracts, 1);
});

// ============================================================================
// 2. Security Lock Hardening: Salted PIN Hash & Fail-Closed Biometrics (Package 1)
// ============================================================================

test('hashPinSync produces deterministic salted hash and verifyPinCode validates both hash and legacy plaintext', () => {
  const hash1234 = hashPinSync('1234');
  assert.equal(isPinHashed(hash1234), true);
  assert.notEqual(hash1234, '1234');
  assert.equal(hashPinSync('١٢٣٤'), hash1234); // Arabic-Indic normalization

  assert.equal(verifyPinCode('1234', hash1234), true);
  assert.equal(verifyPinCode('9999', hash1234), false);
  assert.equal(verifyPinCode('5678', '5678'), true); // Legacy plaintext compatibility

  assert.equal(isDefaultPinActive(DEFAULT_KUCOIN_SECURITY_CONFIG), true);
  assert.equal(
    isDefaultPinActive({
      ...DEFAULT_KUCOIN_SECURITY_CONFIG,
      pinHash: hashPinSync('8426'),
    }),
    false
  );

  const changeOk = validatePinChange('1234', hash1234, '8426', '8426');
  assert.equal(changeOk.valid, true);
  assert.equal(changeOk.newPinHash, hashPinSync('8426'));

  const changeBadCurrent = validatePinChange('0000', hash1234, '8426', '8426');
  assert.equal(changeBadCurrent.valid, false);
});

test('performBiometricAuthentication fails closed when hardware biometrics are unavailable', async () => {
  const result = await performBiometricAuthentication(null);
  assert.equal(result.success, false);
  assert.equal(result.methodUsed, 'BIOMETRIC_UNAVAILABLE');
});

// ============================================================================
// 3. PaperEngine: Exact Commission Accounting, Auto-Liquidation, Trailing Stop,
//    Real Pending Limit Orders & Inline Risk Editing (Packages 1 & 3)
// ============================================================================

test('PaperEngine avoids double-counting commission across open -> partialExit -> close', () => {
  const engine = new PaperEngine();
  engine.reset(1000);
  engine.updateSettings({ commissionPercent: 0.1, leverage: 10, tradeValueUsdt: 100 });

  // Open LONG BTC at $100,000 with $100 margin, 10x lev => $1,000 notional, entry fee = $1.00
  const pos = engine.openPosition(
    'BTCUSDT',
    'LONG',
    0.01,
    100_000,
    10,
    'Test',
    'MANUAL',
    undefined,
    undefined,
    undefined,
    100,
    100
  );

  // Immediately after open: availableBalance = 1000 - 100 (margin) - 1 (entry fee) = 899
  const snapAfterOpen = engine.getSnapshot({ BTCUSDT: 100_000 });
  assert.equal(Number(snapAfterOpen.availableBalance.toFixed(2)), 899);

  // Partial exit 50% at $100,000 (0 price PnL): notional closed = $500, exit fee = $0.50
  // Returned margin = $50, exit fee = $0.50 => availableBalance = 899 + 50 - 0.50 = 948.50
  engine.partialExitPosition(pos.id, 50, 100_000, Date.now());
  const snapAfterPartial = engine.getSnapshot({ BTCUSDT: 100_000 });
  assert.equal(Number(snapAfterPartial.availableBalance.toFixed(2)), 948.5);

  // Close remaining 50% at $100,000 (0 price PnL): notional closed = $500, exit fee = $0.50
  // Returned margin = $50, exit fee = $0.50 => final balance = 948.50 + 50 - 0.50 = 998.00
  // Total commissions paid = $1.00 (entry) + $0.50 (partial) + $0.50 (close) = $2.00 exact!
  const closed = engine.closePosition(pos.id, 100_000, Date.now());
  const snapFinal = engine.getSnapshot({ BTCUSDT: 100_000 });

  assert.equal(Number(snapFinal.availableBalance.toFixed(2)), 998);
  assert.equal(Number(snapFinal.totalCommissionsPaid.toFixed(2)), 2);
  assert.equal(Number((closed.realizedPnl || 0).toFixed(2)), -2);
});

test('PaperEngine triggers Auto-Liquidation and queues drained auto-log', () => {
  const engine = new PaperEngine();
  engine.reset(1000);
  engine.drainTriggeredAutoLogs();

  // Open LONG ETH at $3,000 with 20x leverage -> liq price ~ $2,865
  const pos = engine.openPosition(
    'ETHUSDT',
    'LONG',
    1,
    3000,
    20,
    'Liq Test',
    'MANUAL',
    undefined,
    undefined,
    undefined,
    100,
    150
  );
  assert.ok((pos.liquidationPrice || 0) > 2800 && (pos.liquidationPrice || 0) < 2900);

  // Price drops below liquidation price ($2,800)
  const logs = engine.checkAndExecuteStopLosses({ ETHUSDT: 2800 });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'EXIT');
  assert.ok(logs[0].messageAr.includes('تصفية'));

  const drained = engine.drainTriggeredAutoLogs();
  assert.equal(drained.length, 1);
  assert.equal(drained[0].symbol, 'ETHUSDT');
  assert.equal(engine.drainTriggeredAutoLogs().length, 0);

  const snap = engine.getSnapshot({ ETHUSDT: 2800 });
  const openPositions = snap.positions.filter((p) => p.status === 'OPEN');
  const closedPositions = snap.positions.filter((p) => p.status === 'CLOSED');
  assert.equal(openPositions.length, 0);
  assert.equal(closedPositions[0].closeReason, 'LIQUIDATION');
});

test('PaperEngine ratchets Trailing Stop-Loss and closes automatically on retracement', () => {
  const engine = new PaperEngine();
  engine.reset(1000);
  engine.drainTriggeredAutoLogs();

  const pos = engine.openPosition(
    'SOLUSDT',
    'LONG',
    10,
    100,
    5,
    'Trail Test',
    'MANUAL',
    undefined,
    undefined,
    undefined,
    100,
    200,
    undefined,
    100,
    undefined,
    undefined,
    2 // 2% trailing stop
  );

  // Price rallies to $120 -> SL should ratchet to $120 * 0.98 = $117.6
  let logs = engine.checkAndExecuteStopLosses({ SOLUSDT: 120 });
  assert.equal(logs.length, 0);
  const openPos = engine
    .getSnapshot({ SOLUSDT: 120 })
    .positions.find((p) => p.id === pos.id && p.status === 'OPEN');
  assert.ok(openPos);
  assert.equal(Number((openPos.stopLossPrice || 0).toFixed(2)), 117.6);

  // Price pulls back to $117.0 -> Trailing SL triggers close!
  logs = engine.checkAndExecuteStopLosses({ SOLUSDT: 117 });
  assert.equal(logs.length, 1);
  const remainingOpen = engine
    .getSnapshot({ SOLUSDT: 117 })
    .positions.filter((p) => p.status === 'OPEN');
  assert.equal(remainingOpen.length, 0);
});

test('PaperEngine manages Real Pending Limit Orders (queue, untouched wait, touch fill, cancel)', () => {
  const engine = new PaperEngine();
  engine.reset(1000);
  engine.drainTriggeredAutoLogs();

  const order1 = engine.createPendingLimitOrder({
    symbol: 'BTCUSDT',
    side: 'LONG',
    limitPrice: 90_000,
    marginUsdt: 50,
    leverage: 10,
    stopLossPrice: 88_000,
    takeProfitPrice: 96_000,
    trailingStopPercent: 1.5,
  });

  const order2 = engine.createPendingLimitOrder({
    symbol: 'ETHUSDT',
    side: 'SHORT',
    limitPrice: 4_000,
    marginUsdt: 50,
    leverage: 5,
  });

  assert.equal(engine.getPendingLimitOrders().length, 2);

  // Cancel ETHUSDT order
  assert.equal(engine.cancelPendingLimitOrder(order2.id), true);
  assert.equal(engine.getPendingLimitOrders().length, 1);

  // Price still above BTCUSDT LONG limit (95,000 > 90,000) -> stays pending
  let fillLogs = engine.checkAndExecutePendingLimitOrders({ BTCUSDT: 95_000 });
  assert.equal(fillLogs.length, 0);
  assert.equal(engine.getPendingLimitOrders().length, 1);
  assert.equal(
    engine.getSnapshot({ BTCUSDT: 95_000 }).positions.filter((p) => p.status === 'OPEN').length,
    0
  );

  // Price touches 89,900 <= 90,000 -> executes limit order at 90,000!
  fillLogs = engine.checkAndExecutePendingLimitOrders({ BTCUSDT: 89_900 });
  assert.equal(fillLogs.length, 1);
  assert.equal(fillLogs[0].action, 'ENTRY');
  assert.equal(engine.getPendingLimitOrders().length, 0);

  const openAfterFill = engine
    .getSnapshot({ BTCUSDT: 89_900 })
    .positions.filter((p) => p.status === 'OPEN');
  assert.equal(openAfterFill.length, 1);
  assert.equal(openAfterFill[0].symbol, 'BTCUSDT');
  assert.equal(openAfterFill[0].entryPrice, 90_000);
  assert.equal(openAfterFill[0].stopLossPrice, 88_650); // Trailing 1.5% on 90,000 tightened SL above 88,000
  assert.equal(openAfterFill[0].takeProfitPrice, 96_000);
  assert.equal(openAfterFill[0].trailingStopPercent, 1.5);
  assert.equal(order1.status, 'PENDING');
});

test('PaperEngine supports updatePositionRiskLevels and moveStopLossToBreakEven', () => {
  const engine = new PaperEngine();
  engine.reset(1000);

  const pos = engine.openPosition(
    'BNBUSDT',
    'LONG',
    1,
    600,
    5,
    'Risk Edit Test',
    'MANUAL',
    undefined,
    undefined,
    undefined,
    100,
    120
  );

  const edited = engine.updatePositionRiskLevels(pos.id, {
    stopLossPrice: 570,
    takeProfitPrice: 660,
    trailingStopPercent: 2.5,
  });
  assert.equal(edited.stopLossPrice, 570);
  assert.equal(edited.takeProfitPrice, 660);
  assert.equal(edited.trailingStopPercent, 2.5);

  // Rejects moving to break-even when live price is still at/below entry + 0.08%
  assert.throws(() => engine.moveStopLossToBreakEven(pos.id, undefined, 600), /نقطة الدخول/);

  // Succeeds when live price has moved into profit past break-even
  const be = engine.moveStopLossToBreakEven(pos.id, undefined, 610);
  assert.ok((be.stopLossPrice || 0) > 600 && (be.stopLossPrice || 0) < 601);
  assert.equal(be.isSecuredNearCurrent, true);
});

// ============================================================================
// 4. Pro Risk Engine & Analytics Pure Functions (Package 3)
// ============================================================================

test('proRiskAndAnalytics: liquidation, trailing stop, slippage guard, circuit breaker, filters, reverse & proportional sizing', () => {
  // Liquidation price
  const longLiq = calculateLiquidationPrice(100, 10, 'LONG', 0.005);
  assert.equal(longLiq, 90.5);
  const shortLiq = calculateLiquidationPrice(100, 10, 'SHORT', 0.005);
  assert.equal(shortLiq, 109.5);

  // Trailing stop pure ratchet
  const trail1 = updateTrailingStopForPosition(
    { side: 'LONG', entryPrice: 100, trailingStopPercent: 5 },
    110
  );
  assert.equal(trail1.updated, true);
  assert.equal(trail1.stopLossPrice, 104.5);

  // Slippage guard: LONG trader at 100, live at 102 => 2% unfavorable -> blocked if max 1%
  const slipBlocked = evaluateCopySlippageGuard(100, 102, 'LONG', 1);
  assert.equal(slipBlocked.allowed, false);
  assert.equal(slipBlocked.unfavorableSlippagePercent, 2);

  // Favorable improvement (live 97 < 100 for LONG) is always allowed
  const slipFav = evaluateCopySlippageGuard(100, 97, 'LONG', 0.5);
  assert.equal(slipFav.allowed, true);
  assert.equal(slipFav.unfavorableSlippagePercent, 0);

  // Symbol Whitelist & Blacklist
  assert.equal(isSymbolAllowedByFilter('BTCUSDT', ['BTC', 'ETH'], []).allowed, true);
  assert.equal(isSymbolAllowedByFilter('SOLUSDT', ['BTC', 'ETH'], []).allowed, false);
  assert.equal(isSymbolAllowedByFilter('PEPEUSDT', [], ['PEPE']).allowed, false);

  // Reverse Copy
  assert.equal(resolveEffectiveCopySide('LONG', false), 'LONG');
  assert.equal(resolveEffectiveCopySide('LONG', true), 'SHORT');
  assert.equal(resolveEffectiveCopySide('SHORT', true), 'LONG');

  // Proportional Copy Sizing
  const propMargin = calculateProportionalCopyMargin({
    settings: {
      tradeValueUsdt: 25,
      proportionalCopyMode: true,
      proportionalCopyMultiplier: 1,
    },
    traderNotionalUsdt: 50_000, // 50k / 10x = 5,000 margin = 10% of 50k ref equity
    traderLeverage: 10,
    traderReferenceEquityUsdt: 50_000,
    userAccountEquityUsdt: 2_000,
    availableBalanceUsdt: 2_000,
  });
  assert.equal(propMargin, 200); // 10% of 2,000

  // Daily Loss Circuit Breaker
  const now = Date.now();
  const losingPos: PaperPosition = {
    id: 'p_loss',
    accountId: 'acc_default',
    accountName: 'Default',
    symbol: 'BTCUSDT',
    side: 'LONG',
    entryPrice: 100,
    exitPrice: 90,
    quantity: 10,
    leverage: 5,
    marginUsdt: 200,
    commissionUsdt: 1,
    openTime: now - 3600_000,
    closeTime: now - 1000,
    status: 'CLOSED',
    realizedPnl: -120,
    sourceType: 'COPY_TRADING',
    sourceTraderName: 'Whale A',
  };

  const cb = evaluateDailyLossCircuitBreaker({
    positions: [losingPos],
    unrealizedPnlUsdt: -10,
    initialBalance: 1000,
    dailyLossLimitPercent: 10,
    nowMs: now,
  });
  assert.equal(cb.tripped, true);
  assert.equal(cb.dailyLossPercent, 13);
});

test('proRiskAndAnalytics: Trader Quality Score, Pro Analytics & UTF-8 BOM CSV Export', () => {
  const elite = calculateTraderQualityScore({
    roi: 180,
    winRate: 84,
    mdd: 7,
    sharpRatio: 3.5,
    leadingDays: 120,
    pnl: 150_000,
  });
  assert.equal(elite.tier, 'ELITE');
  assert.ok(elite.score >= 82 && elite.score <= 100);

  const risky = calculateTraderQualityScore({
    roi: -15,
    winRate: 30,
    mdd: 55,
    sharpRatio: -0.5,
    leadingDays: 5,
    pnl: -20_000,
  });
  assert.equal(risky.tier, 'HIGH_RISK');
  assert.ok(risky.score < 48);

  const now = Date.now();
  const samplePositions: PaperPosition[] = [
    {
      id: 'p1',
      accountId: 'acc_default',
      accountName: 'Main',
      symbol: 'BTCUSDT',
      side: 'LONG',
      entryPrice: 100_000,
      exitPrice: 105_000,
      quantity: 0.02,
      leverage: 10,
      marginUsdt: 200,
      commissionUsdt: 2,
      openTime: now - 7200_000,
      closeTime: now - 3600_000,
      status: 'CLOSED',
      realizedPnl: 98,
      sourceType: 'COPY_TRADING',
      sourceTraderName: 'Alpha',
    },
    {
      id: 'p2',
      accountId: 'acc_default',
      accountName: 'Main',
      symbol: 'ETHUSDT',
      side: 'SHORT',
      entryPrice: 3000,
      exitPrice: 3100,
      quantity: 0.5,
      leverage: 10,
      marginUsdt: 150,
      commissionUsdt: 1.5,
      openTime: now - 3000_000,
      closeTime: now - 1000_000,
      status: 'CLOSED',
      realizedPnl: -51.5,
      sourceType: 'SMART_MONEY',
      sourceTraderName: 'Beta',
    },
  ];

  const analytics = computeProAccountAnalytics(samplePositions, 1000, 1046.5);
  assert.equal(analytics.totalClosedTrades, 2);
  assert.equal(analytics.winCount, 1);
  assert.equal(analytics.lossCount, 1);
  assert.equal(analytics.winRatePercent, 50);
  assert.equal(analytics.totalRealizedPnl, 46.5);
  assert.equal(analytics.bestSymbol?.symbol, 'BTCUSDT');
  assert.equal(analytics.worstSymbol?.symbol, 'ETHUSDT');
  assert.equal(analytics.traderLeaderboard[0].traderName, 'Alpha');
  assert.ok(analytics.equityCurve.length >= 3);

  const csv = exportPositionsToCsv(samplePositions);
  assert.equal(csv.startsWith('\uFEFFID,Symbol,Side'), true);
  assert.ok(csv.includes('BTCUSDT'));
  assert.ok(csv.includes('ETHUSDT'));
});
