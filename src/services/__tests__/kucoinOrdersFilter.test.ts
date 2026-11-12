import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterKuCoinRecentOrders,
  getNormalizedSymbolAliases,
  summarizeKuCoinOrders,
} from '../kucoinOrdersFilter';
import type { KuCoinOrderRecord } from '../../types';

const SAMPLE_ORDERS: KuCoinOrderRecord[] = [
  {
    id: 'ord_1',
    orderId: 'KC_1001',
    clientOid: 'kc_1001',
    symbol: 'XBTUSDTM',
    side: 'buy',
    type: 'market',
    price: 96420.5,
    size: 2,
    dealSize: 2,
    status: 'DONE',
    createdAt: 1731360000000,
    sourceTraderName: 'SatoshiWhale',
    sourceSignal: 'فتح صفقة شراء جديدة بالسعر الحالي',
    isRealKuCoin: true,
  },
  {
    id: 'ord_2',
    orderId: 'KC_1002',
    clientOid: 'kc_1002',
    symbol: 'ETHUSDTM',
    side: 'sell',
    type: 'market',
    price: 2785.0,
    size: 5,
    dealSize: 5,
    status: 'DONE',
    createdAt: 1731360300000,
    sourceTraderName: 'AlphaSniper',
    sourceSignal: 'فتح صفقة بيع جديدة بالسعر الحالي',
    isRealKuCoin: true,
  },
  {
    id: 'ord_3',
    orderId: 'KC_1003',
    clientOid: 'kc_1003',
    symbol: 'SOLUSDTM',
    side: 'buy',
    type: 'market',
    price: 198.4,
    size: 10,
    dealSize: 10,
    status: 'SIMULATED',
    createdAt: 1731360600000,
    sourceTraderName: '0x8f9c...3e21',
    sourceSignal: 'تدعيم صفقة حوت (+25%)',
    isRealKuCoin: false,
  },
  {
    id: 'ord_4',
    orderId: 'KC_1004',
    clientOid: 'kc_1004',
    symbol: 'XBTUSDTM',
    side: 'sell',
    type: 'market',
    price: 96950.0,
    size: 1,
    dealSize: 1,
    status: 'DONE',
    createdAt: 1731360900000,
    sourceTraderName: 'SatoshiWhale',
    sourceSignal: 'انسحاب جزئي للمتداول (-50%)',
    isRealKuCoin: true,
  },
];

describe('KuCoin Recent Orders Filtering & Symbol Normalization', () => {
  it('returns all orders when side is ALL and symbol is ALL', () => {
    const res = filterKuCoinRecentOrders(SAMPLE_ORDERS, { side: 'ALL', symbol: 'ALL' });
    assert.equal(res.length, 4);
  });

  it('filters strictly by BUY (شراء) or SELL (بيع)', () => {
    const buys = filterKuCoinRecentOrders(SAMPLE_ORDERS, { side: 'BUY', symbol: 'ALL' });
    assert.equal(buys.length, 2);
    assert.ok(buys.every((o) => o.side === 'buy'));

    const sells = filterKuCoinRecentOrders(SAMPLE_ORDERS, { side: 'SELL', symbol: 'ALL' });
    assert.equal(sells.length, 2);
    assert.ok(sells.every((o) => o.side === 'sell'));
  });

  it('filters by exact KuCoin symbol (e.g. ETHUSDTM or XBTUSDTM)', () => {
    const ethOnly = filterKuCoinRecentOrders(SAMPLE_ORDERS, {
      side: 'ALL',
      symbol: 'ETHUSDTM',
    });
    assert.equal(ethOnly.length, 1);
    assert.equal(ethOnly[0].id, 'ord_2');

    const xbtOnly = filterKuCoinRecentOrders(SAMPLE_ORDERS, {
      side: 'ALL',
      symbol: 'XBTUSDTM',
    });
    assert.equal(xbtOnly.length, 2);
  });

  it('matches standard BTC / BTCUSDT search queries against KuCoin XBTUSDTM', () => {
    const aliases = getNormalizedSymbolAliases('XBTUSDTM');
    assert.ok(aliases.includes('BTC'));
    assert.ok(aliases.includes('BTCUSDT'));

    const btcSearch = filterKuCoinRecentOrders(SAMPLE_ORDERS, {
      side: 'ALL',
      symbol: 'ALL',
      searchQuery: 'btc',
    });
    assert.equal(btcSearch.length, 2);
    assert.ok(btcSearch.every((o) => o.symbol === 'XBTUSDTM'));
  });

  it('combines side filter (BUY/SELL) with symbol filter accurately', () => {
    const xbtSell = filterKuCoinRecentOrders(SAMPLE_ORDERS, {
      side: 'SELL',
      symbol: 'XBTUSDTM',
    });
    assert.equal(xbtSell.length, 1);
    assert.equal(xbtSell[0].id, 'ord_4');

    const ethBuy = filterKuCoinRecentOrders(SAMPLE_ORDERS, {
      side: 'BUY',
      symbol: 'ETHUSDTM',
    });
    assert.equal(ethBuy.length, 0);
  });

  it('computes summary stats accurately', () => {
    const stats = summarizeKuCoinOrders(SAMPLE_ORDERS);
    assert.equal(stats.totalCount, 4);
    assert.equal(stats.buyCount, 2);
    assert.equal(stats.sellCount, 2);
    assert.deepEqual(stats.uniqueSymbols, ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM']);
  });
});
