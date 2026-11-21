import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeKuCoinOrder,
  executeKuCoinOrdersBatch,
  loadKuCoinOrderHistory,
  clearKuCoinOrderHistory,
  type KuCoinOrderRequestParams,
} from '../kucoinApi';
import type { KuCoinConfig } from '../../types';

function setupMemoryLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, val: string) => {
      store.set(key, String(val));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

const LIVE_FUTURES_CONFIG: KuCoinConfig = {
  apiKey: '67a1b2c3d4e5f60001234567',
  apiSecret: 'secret-key-test-12345',
  passphrase: 'passphrase-test-12345',
  apiType: 'REAL',
  marketType: 'FUTURES',
  enableLiveExecution: true,
  defaultLeverage: 5,
  maxOrderUsdt: 100,
};

test('executeKuCoinOrder (v2.22): executes multiple trader position modifications concurrently via Promise.all to minimize total latency', async () => {
  setupMemoryLocalStorage();
  clearKuCoinOrderHistory();

  const perRequestDelayMs = 60;
  let activeInFlight = 0;
  let maxConcurrentInFlight = 0;

  const mockFetcher = async (params: { bodyStr?: string }) => {
    activeInFlight++;
    maxConcurrentInFlight = Math.max(maxConcurrentInFlight, activeInFlight);
    await new Promise((resolve) => setTimeout(resolve, perRequestDelayMs));
    activeInFlight--;
    const parsed = params.bodyStr ? JSON.parse(params.bodyStr) : {};
    return {
      ok: true,
      code: '200000',
      data: {
        orderId: `KC_PARALLEL_${parsed.symbol}_${parsed.clientOid}`,
      },
    };
  };

  const batchOrders: KuCoinOrderRequestParams[] = [
    {
      config: LIVE_FUTURES_CONFIG,
      binanceSymbol: 'BTCUSDT',
      side: 'LONG',
      amountUsdt: 25,
      entryPrice: 64000,
      leverage: 5,
      sourceTraderName: 'HoangThaiCrypto94 (الحساب 1)',
      sourceSignal: 'تدعيم صفقة BTCUSDT (+25%)',
    },
    {
      config: LIVE_FUTURES_CONFIG,
      binanceSymbol: 'ETHUSDT',
      side: 'LONG',
      amountUsdt: 25,
      entryPrice: 1800,
      leverage: 5,
      sourceTraderName: 'HoangThaiCrypto94 (الحساب 1)',
      sourceSignal: 'تدعيم صفقة ETHUSDT (+50%)',
    },
    {
      config: LIVE_FUTURES_CONFIG,
      binanceSymbol: 'SOLUSDT',
      side: 'SHORT',
      amountUsdt: 15,
      entryPrice: 145,
      leverage: 5,
      sourceTraderName: 'HoangThaiCrypto94 (الحساب 1)',
      sourceSignal: 'انسحاب جزئي SOLUSDT (-30%)',
    },
    {
      config: LIVE_FUTURES_CONFIG,
      binanceSymbol: 'XRPUSDT',
      side: 'SHORT',
      amountUsdt: 25,
      entryPrice: 0.95,
      leverage: 5,
      sourceTraderName: 'HoangThaiCrypto94 (الحساب 1)',
      sourceSignal: 'إغلاق كامل XRPUSDT (-100%)',
    },
  ];

  const startMs = Date.now();
  const results = await executeKuCoinOrder(batchOrders, {
    customEndpointFetcher: mockFetcher as any,
  });
  const elapsedMs = Date.now() - startMs;

  // All 4 orders must have been in-flight simultaneously via Promise.all
  assert.equal(results.length, 4);
  assert.equal(maxConcurrentInFlight, 4, 'Expected all 4 orders to run concurrently in Promise.all');

  // Sequential execution would take >= 240ms (4 * 60ms); parallel execution completes in ~60-130ms
  assert.ok(
    elapsedMs < perRequestDelayMs * 3,
    `Expected parallel execution latency (${elapsedMs}ms) to be well below sequential latency (${perRequestDelayMs * 4}ms)`
  );

  // Every order must have a distinct id/clientOid and DONE status
  const uniqueIds = new Set(results.map((r) => r.id));
  assert.equal(uniqueIds.size, 4);
  assert.ok(results.every((r) => r.status === 'DONE' && r.isRealKuCoin === true));

  // Verify atomic persistence in localStorage
  const storedHistory = loadKuCoinOrderHistory();
  assert.equal(storedHistory.length, 4);
});

test('executeKuCoinOrder (v2.22): supports single-order execution and resilient batch execution when one order throws', async () => {
  setupMemoryLocalStorage();
  clearKuCoinOrderHistory();

  // 1. Single order call returns single KuCoinOrderRecord
  const singleOrder = await executeKuCoinOrder({
    config: { ...LIVE_FUTURES_CONFIG, enableLiveExecution: false },
    binanceSymbol: 'BNBUSDT',
    side: 'LONG',
    amountUsdt: 20,
    entryPrice: 600,
    leverage: 5,
    sourceTraderName: 'TraderOne',
    sourceSignal: 'Single Entry',
  });
  assert.equal(singleOrder.symbol, 'BNBUSDTM');
  assert.equal(singleOrder.status, 'SIMULATED');

  // 2. Batch with one throwing request does not abort sibling orders in Promise.all
  let callIdx = 0;
  const flakyFetcher = async () => {
    callIdx++;
    if (callIdx === 2) {
      throw new Error('Simulated network timeout on order #2');
    }
    return {
      ok: true,
      code: '200000',
      data: { orderId: `KC_OK_${callIdx}` },
    };
  };

  const batchResults = await executeKuCoinOrdersBatch(
    [
      {
        config: LIVE_FUTURES_CONFIG,
        binanceSymbol: 'ADAUSDT',
        side: 'LONG',
        amountUsdt: 20,
        entryPrice: 0.75,
        leverage: 5,
      },
      {
        config: LIVE_FUTURES_CONFIG,
        binanceSymbol: 'AVAXUSDT',
        side: 'SHORT',
        amountUsdt: 20,
        entryPrice: 25,
        leverage: 5,
      },
      {
        config: LIVE_FUTURES_CONFIG,
        binanceSymbol: 'LINKUSDT',
        side: 'LONG',
        amountUsdt: 20,
        entryPrice: 15,
        leverage: 5,
      },
    ],
    { customEndpointFetcher: flakyFetcher as any }
  );

  assert.equal(batchResults.length, 3);
  assert.equal(batchResults[0].status, 'DONE');
  assert.notEqual(batchResults[1].status, 'SIMULATED');
  assert.equal(batchResults[1].status, 'UNKNOWN_TIMEOUT');
  assert.equal(batchResults[2].status, 'DONE');
});
