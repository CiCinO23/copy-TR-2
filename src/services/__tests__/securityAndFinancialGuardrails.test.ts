import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  hashPinPbkdf2,
  verifyPinPbkdf2,
  encryptSecretWithPin,
  decryptSecretWithPin,
  isEncryptedVaultPayload,
  setActiveSessionPin,
  clearActiveSessionPin,
} from '../secureVault';
import {
  saveKuCoinConfigEncrypted,
  loadKuCoinConfig,
  unlockKuCoinConfigWithPin,
  reencryptKuCoinSecretsOnPinChange,
  executeKuCoinOrder,
  calculateKuCoinFuturesContractsSize,
  clearKuCoinOrderHistory,
} from '../kucoinApi';
import {
  reconcilePaperWithKuCoinPositions,
  resolveKuCoinExitSizing,
  buildKuCoinStopOrderPayload,
} from '../kucoinReconciliation';
import type { KuCoinConfig, KuCoinPosition, PaperPosition } from '../../types';

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
  return store;
}

const BASE_LIVE_CONFIG: KuCoinConfig = {
  apiKey: '67a1b2c3d4e5f60001234567',
  apiSecret: 'super-secret-kucoin-api-secret-999',
  passphrase: 'super-secret-passphrase-777',
  apiType: 'REAL',
  marketType: 'FUTURES',
  enableLiveExecution: true,
  defaultLeverage: 5,
  maxOrderUsdt: 50,
};

describe('Security Vault (PBKDF2-SHA256 & AES-256-GCM Secret Encryption)', () => {
  it('derives salted 256-bit PBKDF2-SHA256 hashes and verifies accurately', async () => {
    const h1 = await hashPinPbkdf2('849271');
    const h2 = await hashPinPbkdf2('849271');
    assert.ok(h1.startsWith('pbkdf2_v2:'));
    assert.notEqual(h1, h2, 'Each hash must have a unique random 128-bit salt');

    assert.equal(await verifyPinPbkdf2('849271', h1), true);
    assert.equal(await verifyPinPbkdf2('849271', h2), true);
    assert.equal(await verifyPinPbkdf2('849272', h1), false);
  });

  it('encrypts & decrypts secrets with AES-256-GCM and fails closed on wrong PIN or ciphertext tampering', async () => {
    const cipher = await encryptSecretWithPin('my-kucoin-secret', '849271');
    assert.equal(isEncryptedVaultPayload(cipher), true);
    assert.equal(cipher.includes('my-kucoin-secret'), false);

    assert.equal(await decryptSecretWithPin(cipher, '849271'), 'my-kucoin-secret');
    assert.equal(await decryptSecretWithPin(cipher, '999999'), null);

    // Tamper with ciphertext payload -> GCM auth tag MUST reject it
    const tampered = cipher.slice(0, -4) + (cipher.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    assert.equal(await decryptSecretWithPin(tampered, '849271'), null);
  });

  it('stores KuCoin secrets encrypted in localStorage, never plaintext, and re-encrypts on PIN change', async () => {
    const store = setupMemoryLocalStorage();
    clearActiveSessionPin();
    setActiveSessionPin('849271');

    await saveKuCoinConfigEncrypted(BASE_LIVE_CONFIG, '849271');
    const rawStored = store.get('whale_copy_kucoin_config_v2') || '';
    assert.ok(rawStored.length > 0, 'Encrypted config must be persisted');
    assert.equal(rawStored.includes('super-secret-kucoin-api-secret-999'), false);
    assert.equal(rawStored.includes('super-secret-passphrase-777'), false);
    assert.equal(rawStored.includes('enc_v1:'), true);

    // Locked load must NOT expose plaintext secrets
    clearActiveSessionPin();
    const lockedLoad = loadKuCoinConfig();
    assert.equal(lockedLoad.hasEncryptedSecrets, true);
    assert.equal(lockedLoad.apiSecret, '');
    assert.equal(lockedLoad.passphrase, '');

    // Wrong PIN cannot unlock secrets
    const badUnlock = await unlockKuCoinConfigWithPin('000000');
    assert.equal(badUnlock.apiSecret, '');
    assert.equal(badUnlock.passphrase, '');

    // Correct PIN decrypts secrets into memory
    const goodUnlock = await unlockKuCoinConfigWithPin('849271');
    assert.equal(goodUnlock.apiSecret, BASE_LIVE_CONFIG.apiSecret);
    assert.equal(goodUnlock.passphrase, BASE_LIVE_CONFIG.passphrase);

    // Re-encrypt on PIN change -> old PIN stops working, new PIN works
    const reencrypted = await reencryptKuCoinSecretsOnPinChange('849271', '739152');
    assert.equal(reencrypted.hasEncryptedSecrets, true);
    assert.equal(reencrypted.apiSecret, BASE_LIVE_CONFIG.apiSecret);
    const oldPinAfterChange = await unlockKuCoinConfigWithPin('849271');
    assert.equal(oldPinAfterChange.apiSecret, '');
    const unlockedNew = await unlockKuCoinConfigWithPin('739152');
    assert.equal(unlockedNew.apiSecret, BASE_LIVE_CONFIG.apiSecret);
    assert.equal(unlockedNew.passphrase, BASE_LIVE_CONFIG.passphrase);
  });
});

describe('Financial Guardrails in KuCoin Live Execution', () => {
  it('blocks live non-exit orders exceeding maxOrderUsdt with REJECTED_GUARD without hitting KuCoin', async () => {
    setupMemoryLocalStorage();
    clearKuCoinOrderHistory();

    let apiCalled = false;
    const result = await executeKuCoinOrder(
      {
        config: { ...BASE_LIVE_CONFIG, maxOrderUsdt: 50 },
        binanceSymbol: 'ETHUSDT',
        side: 'LONG',
        amountUsdt: 75, // exceeds maxOrderUsdt=50
        entryPrice: 3000,
        leverage: 5,
      },
      {
        customEndpointFetcher: async () => {
          apiCalled = true;
          return { ok: true, code: '200000', data: { orderId: 'SHOULD_NOT_RUN' } };
        },
      }
    );

    assert.equal(apiCalled, false);
    assert.equal(result.status, 'REJECTED_GUARD');
    assert.equal(result.errorCode, 'MAX_ORDER_USDT_EXCEEDED');
  });

  it('rejects live orders when minOrderQty exceeds budget instead of rounding up to 1 contract', async () => {
    setupMemoryLocalStorage();
    clearKuCoinOrderHistory();

    // XBTUSDTM: 1 contract = 0.001 BTC = $100 at $100,000 BTC.
    // $10 margin * 5x = $50 notional < $100 minimum contract!
    const sizing = calculateKuCoinFuturesContractsSize('XBTUSDTM', 50, 100_000);
    assert.equal(sizing.contracts, 0);
    assert.equal(sizing.budgetExceeded, true);

    let apiCalled = false;
    const result = await executeKuCoinOrder(
      {
        config: { ...BASE_LIVE_CONFIG, maxOrderUsdt: 100 },
        binanceSymbol: 'BTCUSDT',
        side: 'LONG',
        amountUsdt: 10,
        entryPrice: 100_000,
        leverage: 5,
      },
      {
        customEndpointFetcher: async () => {
          apiCalled = true;
          return { ok: true, code: '200000', data: { orderId: 'SHOULD_NOT_RUN' } };
        },
      }
    );

    assert.equal(apiCalled, false);
    assert.equal(result.status, 'REJECTED_GUARD');
    assert.equal(result.errorCode, 'MIN_CONTRACT_EXCEEDS_BUDGET');
  });

  it('records KuCoin API rejections as FAILED and NEVER as SIMULATED', async () => {
    setupMemoryLocalStorage();
    clearKuCoinOrderHistory();

    const result = await executeKuCoinOrder(
      {
        config: BASE_LIVE_CONFIG,
        binanceSymbol: 'ETHUSDT',
        side: 'LONG',
        amountUsdt: 20,
        entryPrice: 3000,
        leverage: 5,
      },
      {
        customEndpointFetcher: async () => ({
          ok: false,
          code: '300003',
          msg: 'Balance insufficient',
        }),
      }
    );

    assert.equal(result.status, 'FAILED');
    assert.notEqual(result.status, 'SIMULATED');
    assert.equal(result.errorCode, '300003');
  });

  it('verifies timed-out POST orders via clientOid lookup and recovers DONE if executed on KuCoin', async () => {
    setupMemoryLocalStorage();
    clearKuCoinOrderHistory();

    const calls: string[] = [];
    const result = await executeKuCoinOrder(
      {
        config: BASE_LIVE_CONFIG,
        binanceSymbol: 'ETHUSDT',
        side: 'LONG',
        amountUsdt: 20,
        entryPrice: 3000,
        leverage: 5,
      },
      {
        customEndpointFetcher: async (params) => {
          calls.push(`${params.method} ${params.endpoint}`);
          if (params.method === 'POST') {
            return {
              ok: false,
              code: 'NETWORK_TIMEOUT',
              msg: 'Request timed out',
              isTimeout: true,
            };
          }
          // GET /api/v1/orders/byClientOid confirms KuCoin actually executed it!
          return {
            ok: true,
            code: '200000',
            data: { id: 'KC_RECOVERED_98765', status: 'done' },
          };
        },
      }
    );

    assert.equal(calls[0], 'POST /api/v1/orders');
    assert.ok(calls[1].startsWith('GET /api/v1/orders/byClientOid?clientOid='));
    assert.equal(result.status, 'DONE');
    assert.equal(result.orderId, 'KC_RECOVERED_98765');
  });

  it('sends closeOrder: true on full exits and places exchange-native SL/TP stop orders on live entry', async () => {
    setupMemoryLocalStorage();
    clearKuCoinOrderHistory();

    const payloads: Array<{ method: string; endpoint: string; body: any }> = [];
    const mockFetcher = async (params: { method: string; endpoint: string; bodyStr?: string }) => {
      const body = params.bodyStr ? JSON.parse(params.bodyStr) : undefined;
      payloads.push({ method: params.method, endpoint: params.endpoint, body });
      return {
        ok: true,
        code: '200000',
        data: { orderId: `KC_ORD_${payloads.length}` },
      };
    };

    // 1. Live Entry WITH Stop-Loss & Take-Profit
    const entryOrder = await executeKuCoinOrder(
      {
        config: BASE_LIVE_CONFIG,
        binanceSymbol: 'ETHUSDT',
        side: 'LONG',
        amountUsdt: 20,
        entryPrice: 3000,
        leverage: 5,
        stopLossPrice: 2850,
        takeProfitPrice: 3300,
      },
      { customEndpointFetcher: mockFetcher as any }
    );

    assert.equal(entryOrder.status, 'DONE');
    assert.ok(entryOrder.stopLossOrderId, 'Exchange-native SL order ID must be attached');
    assert.ok(entryOrder.takeProfitOrderId, 'Exchange-native TP order ID must be attached');

    const slCall = payloads.find((p) => p.body?.stop === 'down' && p.body?.closeOrder === true);
    const tpCall = payloads.find((p) => p.body?.stop === 'up' && p.body?.closeOrder === true);
    assert.ok(slCall, 'Expected exchange-native SL conditional order payload');
    assert.equal(slCall!.body.side, 'sell');
    assert.equal(slCall!.body.stopPriceType, 'MP');
    assert.equal(slCall!.body.reduceOnly, true);

    assert.ok(tpCall, 'Expected exchange-native TP conditional order payload');
    assert.equal(tpCall!.body.side, 'sell');
    assert.equal(tpCall!.body.stopPriceType, 'MP');
    assert.equal(tpCall!.body.reduceOnly, true);

    // 2. Full Exit uses KuCoin's atomic closeOrder: true (no residual dust contracts)
    const exitPayloads: any[] = [];
    const exitOrder = await executeKuCoinOrder(
      {
        config: BASE_LIVE_CONFIG,
        binanceSymbol: 'ETHUSDT',
        side: 'SHORT',
        amountUsdt: 20,
        entryPrice: 3100,
        leverage: 5,
        reduceOnly: true,
        closeFullPosition: true,
      },
      {
        customEndpointFetcher: async (params) => {
          exitPayloads.push(params.bodyStr ? JSON.parse(params.bodyStr) : {});
          return { ok: true, code: '200000', data: { orderId: 'KC_CLOSE_ALL' } };
        },
      }
    );

    assert.equal(exitOrder.status, 'DONE');
    assert.equal(exitPayloads[0].closeOrder, true);
    assert.equal(exitPayloads[0].size, undefined);
  });
});

describe('Live Position Reconciliation & Real Exit Sizing', () => {
  it('detects MISSING_ON_KUCOIN, UNTRACKED_ON_KUCOIN, SIDE_MISMATCH, and SIZE_MISMATCH', () => {
    const paperOpen: PaperPosition[] = [
      {
        id: 'p1',
        symbol: 'BTCUSDT',
        side: 'LONG',
        entryPrice: 100_000,
        quantity: 0.01,
        leverage: 5,
        marginUsdt: 200,
        commissionUsdt: 0.4,
        status: 'OPEN',
        openTime: Date.now(),
        sourceType: 'MANUAL',
      },
      {
        id: 'p2',
        symbol: 'ETHUSDT',
        side: 'LONG',
        entryPrice: 3000,
        quantity: 0.1,
        leverage: 5,
        marginUsdt: 60,
        commissionUsdt: 0.12,
        status: 'OPEN',
        openTime: Date.now(),
        sourceType: 'MANUAL',
      },
      {
        id: 'p3',
        symbol: 'SOLUSDT',
        side: 'SHORT',
        entryPrice: 150,
        quantity: 10,
        leverage: 5,
        marginUsdt: 300,
        commissionUsdt: 0.6,
        status: 'OPEN',
        openTime: Date.now(),
        sourceType: 'MANUAL',
      },
    ];

    const liveKuCoin: KuCoinPosition[] = [
      // ETHUSDT exists on KuCoin as SHORT (SIDE_MISMATCH)
      {
        symbol: 'ETHUSDTM',
        side: 'SHORT',
        currentQty: 10,
        entryPrice: 3000,
        markPrice: 3010,
        realisedPnl: 0,
        unrealisedPnl: -1,
        leverage: 5,
        marginType: 'ISOLATED',
        isOpen: true,
      },
      // SOLUSDT exists on KuCoin as SHORT but only 2 contracts vs 10 expected (SIZE_MISMATCH)
      {
        symbol: 'SOLUSDTM',
        side: 'SHORT',
        currentQty: 2,
        entryPrice: 150,
        markPrice: 148,
        realisedPnl: 0,
        unrealisedPnl: 4,
        leverage: 5,
        marginType: 'ISOLATED',
        isOpen: true,
      },
      // XRPUSDT exists ONLY on KuCoin (UNTRACKED_ON_KUCOIN)
      {
        symbol: 'XRPUSDTM',
        side: 'LONG',
        currentQty: 5,
        entryPrice: 0.9,
        markPrice: 0.92,
        realisedPnl: 0,
        unrealisedPnl: 1,
        leverage: 5,
        marginType: 'ISOLATED',
        isOpen: true,
      },
    ];

    const report = reconcilePaperWithKuCoinPositions(paperOpen, liveKuCoin);
    assert.equal(report.isSynced, false);

    const byType = new Map(report.discrepancies.map((d) => [d.type, d]));
    assert.equal(byType.get('MISSING_ON_KUCOIN')?.symbol, 'BTCUSDT');
    assert.equal(byType.get('SIDE_MISMATCH')?.symbol, 'ETHUSDT');
    assert.equal(byType.get('SIZE_MISMATCH')?.symbol, 'SOLUSDT');
    assert.equal(byType.get('UNTRACKED_ON_KUCOIN')?.symbol, 'XRPUSDT');
  });

  it('derives partial exit contracts from actual KuCoin open contracts and uses closeOrder for full exits', () => {
    const livePos: KuCoinPosition[] = [
      {
        symbol: 'ETHUSDTM',
        side: 'LONG',
        currentQty: 17,
        entryPrice: 3000,
        markPrice: 3200,
        realisedPnl: 0,
        unrealisedPnl: 34,
        leverage: 5,
        marginType: 'ISOLATED',
        isOpen: true,
      },
    ];

    const fullExit = resolveKuCoinExitSizing({
      kucoinSymbol: 'ETHUSDTM',
      isFullExit: true,
      liveKuCoinPositions: livePos,
      fallbackBaseQuantity: 0.1,
      multiplier: 0.01,
      lotSize: 1,
    });
    assert.equal(fullExit.useCloseOrderFlag, true);
    assert.equal(fullExit.exactContracts, 17);
    assert.equal(fullExit.source, 'EXCHANGE_CLOSE_ALL');

    const partial50 = resolveKuCoinExitSizing({
      kucoinSymbol: 'ETHUSDTM',
      isFullExit: false,
      exitPercent: 50,
      liveKuCoinPositions: livePos,
      fallbackBaseQuantity: 0.1,
      multiplier: 0.01,
      lotSize: 1,
    });
    assert.equal(partial50.useCloseOrderFlag, false);
    assert.equal(partial50.exactContracts, 8); // Math.floor(17 * 0.5) = 8
    assert.equal(partial50.source, 'LIVE_KUCOIN_QTY');
  });

  it('builds valid exchange-native SL and TP payloads for LONG and SHORT positions', () => {
    const slLong = buildKuCoinStopOrderPayload({
      clientOid: 'oid_sl_1',
      kucoinSymbol: 'ETHUSDTM',
      positionSide: 'LONG',
      kind: 'STOP_LOSS',
      triggerPrice: 2850.1234,
      leverage: 10,
    });
    assert.equal(slLong.side, 'sell');
    assert.equal(slLong.stop, 'down');
    assert.equal(slLong.stopPriceType, 'MP');
    assert.equal(slLong.closeOrder, true);
    assert.equal(slLong.reduceOnly, true);
    assert.equal(slLong.stopPrice, '2850.12');

    const slShort = buildKuCoinStopOrderPayload({
      clientOid: 'oid_sl_2',
      kucoinSymbol: 'ETHUSDTM',
      positionSide: 'SHORT',
      kind: 'STOP_LOSS',
      triggerPrice: 3150,
      leverage: 10,
    });
    assert.equal(slShort.side, 'buy');
    assert.equal(slShort.stop, 'up');
    assert.equal(slShort.closeOrder, true);
  });
});
