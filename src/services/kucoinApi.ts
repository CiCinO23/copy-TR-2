import {
  KuCoinConfig,
  KuCoinConnectionState,
  KuCoinPosition,
  KuCoinOrderRecord,
} from '../types';

const KUCOIN_CONFIG_STORAGE_KEY = 'whale_copy_kucoin_config_v1';
const KUCOIN_ORDERS_STORAGE_KEY = 'whale_copy_kucoin_orders_v1';

export const DEFAULT_KUCOIN_CONFIG: KuCoinConfig = {
  apiKey: '',
  apiSecret: '',
  passphrase: '',
  apiType: 'REAL',
  marketType: 'FUTURES',
  enableLiveExecution: false,
  defaultLeverage: 5,
  maxOrderUsdt: 50,
};

export function loadKuCoinConfig(): KuCoinConfig {
  try {
    const raw = localStorage.getItem(KUCOIN_CONFIG_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_KUCOIN_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to load KuCoin config:', e);
  }
  return DEFAULT_KUCOIN_CONFIG;
}

export function saveKuCoinConfig(config: KuCoinConfig): void {
  try {
    localStorage.setItem(KUCOIN_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save KuCoin config:', e);
  }
}

export function clearKuCoinConfig(): KuCoinConfig {
  try {
    localStorage.removeItem(KUCOIN_CONFIG_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear KuCoin config:', e);
  }
  return DEFAULT_KUCOIN_CONFIG;
}

const INITIAL_SEEDED_KUCOIN_ORDERS: KuCoinOrderRecord[] = [
  {
    id: 'kc_seed_1',
    orderId: 'KC_6732910482',
    clientOid: 'kc_seed_btc_buy_1',
    symbol: 'XBTUSDTM',
    side: 'buy',
    type: 'market',
    price: 96420.5,
    size: 2,
    dealSize: 2,
    status: 'DONE',
    createdAt: Date.now() - 1000 * 60 * 14,
    sourceTraderName: 'SatoshiWhale',
    sourceSignal: 'فتح صفقة شراء جديدة بالسعر الحالي (LONG)',
    isRealKuCoin: false,
  },
  {
    id: 'kc_seed_2',
    orderId: 'KC_6732908819',
    clientOid: 'kc_seed_eth_sell_2',
    symbol: 'ETHUSDTM',
    side: 'sell',
    type: 'market',
    price: 2784.2,
    size: 4,
    dealSize: 4,
    status: 'DONE',
    createdAt: Date.now() - 1000 * 60 * 32,
    sourceTraderName: 'AlphaSniper',
    sourceSignal: 'فتح صفقة بيع جديدة بالسعر الحالي (SHORT)',
    isRealKuCoin: false,
  },
  {
    id: 'kc_seed_3',
    orderId: 'KC_6732904110',
    clientOid: 'kc_seed_sol_buy_3',
    symbol: 'SOLUSDTM',
    side: 'buy',
    type: 'market',
    price: 198.45,
    size: 8,
    dealSize: 8,
    status: 'SIMULATED',
    createdAt: Date.now() - 1000 * 60 * 55,
    sourceTraderName: 'i386',
    sourceSignal: 'تدعيم صفقة حوت بالسعر الحالي (+25%)',
    isRealKuCoin: false,
  },
  {
    id: 'kc_seed_4',
    orderId: 'KC_6732899502',
    clientOid: 'kc_seed_xbt_sell_4',
    symbol: 'XBTUSDTM',
    side: 'sell',
    type: 'market',
    price: 96890.0,
    size: 1,
    dealSize: 1,
    status: 'DONE',
    createdAt: Date.now() - 1000 * 60 * 95,
    sourceTraderName: 'SatoshiWhale',
    sourceSignal: 'انسحاب جزئي للمتداول (-50%): إغلاق 50% بالسعر الحالي',
    isRealKuCoin: false,
  },
  {
    id: 'kc_seed_5',
    orderId: 'KC_6732891204',
    clientOid: 'kc_seed_xrp_buy_5',
    symbol: 'XRPUSDTM',
    side: 'buy',
    type: 'market',
    price: 2.482,
    size: 50,
    dealSize: 50,
    status: 'SIMULATED',
    createdAt: Date.now() - 1000 * 60 * 140,
    sourceTraderName: 'Bran Brandon',
    sourceSignal: 'فتح صفقة شراء جديدة بالسعر الحالي (LONG)',
    isRealKuCoin: false,
  },
  {
    id: 'kc_seed_6',
    orderId: 'KC_6732884011',
    clientOid: 'kc_seed_bnb_sell_6',
    symbol: 'BNBUSDTM',
    side: 'sell',
    type: 'market',
    price: 654.8,
    size: 3,
    dealSize: 3,
    status: 'DONE',
    createdAt: Date.now() - 1000 * 60 * 210,
    sourceTraderName: 'AlphaSniper',
    sourceSignal: 'إغلاق كامل لصفقة المتداول المنسوخ (100%)',
    isRealKuCoin: false,
  },
];

export function loadKuCoinOrderHistory(): KuCoinOrderRecord[] {
  try {
    const raw = localStorage.getItem(KUCOIN_ORDERS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    localStorage.setItem(KUCOIN_ORDERS_STORAGE_KEY, JSON.stringify(INITIAL_SEEDED_KUCOIN_ORDERS));
    return INITIAL_SEEDED_KUCOIN_ORDERS;
  } catch {
    return INITIAL_SEEDED_KUCOIN_ORDERS;
  }
}

export function saveKuCoinOrderRecord(record: KuCoinOrderRecord): void {
  try {
    const existing = loadKuCoinOrderHistory();
    const updated = [record, ...existing.filter((r) => r.id !== record.id)].slice(0, 50);
    localStorage.setItem(KUCOIN_ORDERS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save KuCoin order record:', e);
  }
}

export function clearKuCoinOrderHistory(): KuCoinOrderRecord[] {
  try {
    localStorage.setItem(KUCOIN_ORDERS_STORAGE_KEY, JSON.stringify([]));
  } catch (e) {
    console.warn('Failed to clear KuCoin order history:', e);
  }
  return [];
}

/**
 * Native Web Crypto HMAC-SHA256 signature generation (Base64 encoded)
 * KuCoin requires: Base64(HmacSHA256(endpoint_string, apiSecret))
 */
async function generateHmacSha256Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Binance Futures Symbol (e.g. BTCUSDT) to KuCoin Futures Symbol (e.g. XBTUSDTM) or Spot (BTC-USDT)
 */
export function convertToKuCoinSymbol(binanceSymbol: string, isFutures: boolean = true): string {
  const clean = binanceSymbol.toUpperCase().trim();
  if (isFutures) {
    if (clean === 'BTCUSDT') return 'XBTUSDTM';
    if (clean.endsWith('USDT')) {
      const base = clean.replace('USDT', '');
      return `${base}USDTM`;
    }
    return `${clean}M`;
  }
  // Spot: BTC-USDT
  if (clean.endsWith('USDT')) {
    const base = clean.replace('USDT', '');
    return `${base}-USDT`;
  }
  return clean;
}

/**
 * Test Connection and Fetch KuCoin Account Balance & Active Positions
 */
export async function testKuCoinConnectionAndFetchData(
  config: KuCoinConfig
): Promise<KuCoinConnectionState> {
  const hasKeys =
    config.apiKey.trim().length > 0 &&
    config.apiSecret.trim().length > 0 &&
    config.passphrase.trim().length > 0;

  const startMs = Date.now();

  // 1. First test public server time to verify KuCoin API connectivity
  let serverTimestamp = Date.now();
  let latencyMs = 0;
  try {
    const timeRes = await fetch('/kucoin/api/v1/timestamp');
    latencyMs = Date.now() - startMs;
    if (timeRes.ok) {
      const timeJson = await timeRes.json();
      if (timeJson && timeJson.data) {
        serverTimestamp = Number(timeJson.data);
      }
    }
  } catch (err: any) {
    return {
      isTesting: false,
      isConnected: false,
      isAuthenticated: false,
      serverTimeFormatted: null,
      latencyMs: null,
      usdtBalance: 0,
      availableUsdt: 0,
      positions: [],
      recentOrders: loadKuCoinOrderHistory(),
      statusMessageAr: 'فشل الاتصال بخادم KuCoin',
      errorMessageAr: err.message || 'تعذر الوصول إلى سيرفرات KuCoin API',
    };
  }

  // If user hasn't provided API credentials, return public connection OK with virtual breakdown
  if (!hasKeys) {
    return {
      isTesting: false,
      isConnected: true,
      isAuthenticated: false,
      serverTimeFormatted: new Date(serverTimestamp).toLocaleTimeString('en-GB'),
      latencyMs,
      usdtBalance: 1000.0,
      availableUsdt: 1000.0,
      spotBalanceUsdt: 350.0,
      futuresBalanceUsdt: 550.0,
      mainBalanceUsdt: 100.0,
      marginBalanceUsdt: 0.0,
      inOrderUsdt: 0.0,
      unrealizedPnlUsdt: 0.0,
      positions: [],
      recentOrders: loadKuCoinOrderHistory(),
      statusMessageAr: 'متصل بـ KuCoin العام (جاهز للمحاكاة بدون مفاتيح أو أدخل مفاتيحك للتداول الحقيقي)',
      errorMessageAr: null,
    };
  }

  // 2. Authenticate with KuCoin API
  try {
    const nowStr = String(serverTimestamp || Date.now());
    const method = 'GET';
    const endpoint = '/api/v1/accounts?currency=USDT';
    const signPayload = `${nowStr}${method}${endpoint}`;
    const sign = await generateHmacSha256Base64(config.apiSecret.trim(), signPayload);
    const passSign = await generateHmacSha256Base64(config.apiSecret.trim(), config.passphrase.trim());

    const accRes = await fetch(`/kucoin${endpoint}`, {
      method,
      headers: {
        'KC-API-KEY': config.apiKey.trim(),
        'KC-API-SIGN': sign,
        'KC-API-TIMESTAMP': nowStr,
        'KC-API-PASSPHRASE': passSign,
        'KC-API-KEY-VERSION': '2',
        Accept: 'application/json',
      },
    });

    const accJson = await accRes.json();

    if (accRes.ok && accJson.code === '200000') {
      let usdtBal = 0;
      let availUsdt = 0;
      let spotBal = 0;
      let mainBal = 0;
      let marginBal = 0;
      let holdsUsdt = 0;

      if (Array.isArray(accJson.data)) {
        for (const a of accJson.data) {
          if (a.currency === 'USDT') {
            const b = parseFloat(a.balance || '0');
            const av = parseFloat(a.available || '0');
            const hd = parseFloat(a.holds || '0');
            usdtBal += b;
            availUsdt += av;
            holdsUsdt += hd;
            if (a.type === 'trade' || a.type === ' trade_hf') {
              spotBal += b;
            } else if (a.type === 'main') {
              mainBal += b;
            } else if (a.type === 'margin' || a.type === 'isolated') {
              marginBal += b;
            } else {
              spotBal += b;
            }
          }
        }
      }

      // Fetch KuCoin Futures Account Overview & Positions
      let futuresBal = 0;
      let unrealizedPnl = 0;
      const positions: KuCoinPosition[] = [];
      try {
        const futAccEndpoint = '/api/v1/account-overview?currency=USDT';
        const futAccPayload = `${nowStr}${method}${futAccEndpoint}`;
        const futAccSign = await generateHmacSha256Base64(config.apiSecret.trim(), futAccPayload);
        const futAccRes = await fetch(`/kucoin-futures${futAccEndpoint}`, {
          method,
          headers: {
            'KC-API-KEY': config.apiKey.trim(),
            'KC-API-SIGN': futAccSign,
            'KC-API-TIMESTAMP': nowStr,
            'KC-API-PASSPHRASE': passSign,
            'KC-API-KEY-VERSION': '2',
            Accept: 'application/json',
          },
        });
        if (futAccRes.ok) {
          const futAccJson = await futAccRes.json();
          if (futAccJson?.data) {
            const fEq = parseFloat(futAccJson.data.accountEquity || '0');
            const fAv = parseFloat(futAccJson.data.availableBalance || '0');
            const fUpnl = parseFloat(futAccJson.data.unrealisedPNL || '0');
            if (fEq > 0) {
              futuresBal = fEq;
              usdtBal += fEq;
              availUsdt += fAv;
              unrealizedPnl = fUpnl;
            }
          }
        }

        const futEndpoint = '/api/v1/positions';
        const futPayload = `${nowStr}${method}${futEndpoint}`;
        const futSign = await generateHmacSha256Base64(config.apiSecret.trim(), futPayload);

        const posRes = await fetch(`/kucoin-futures${futEndpoint}`, {
          method,
          headers: {
            'KC-API-KEY': config.apiKey.trim(),
            'KC-API-SIGN': futSign,
            'KC-API-TIMESTAMP': nowStr,
            'KC-API-PASSPHRASE': passSign,
            'KC-API-KEY-VERSION': '2',
            Accept: 'application/json',
          },
        });

        if (posRes.ok) {
          const posJson = await posRes.json();
          if (Array.isArray(posJson.data)) {
            for (const p of posJson.data) {
              const qty = parseFloat(p.currentQty || '0');
              if (Math.abs(qty) > 0) {
                positions.push({
                  symbol: p.symbol || 'XBTUSDTM',
                  currentQty: Math.abs(qty),
                  side: qty > 0 ? 'LONG' : 'SHORT',
                  entryPrice: parseFloat(p.avgEntryPrice || '0'),
                  markPrice: parseFloat(p.markPrice || '0'),
                  realisedPnl: parseFloat(p.realisedGrossCost || '0'),
                  unrealisedPnl: parseFloat(p.unrealisedPnl || '0'),
                  leverage: Number(p.realLeverage || 5),
                  marginType: p.crossMode ? 'Cross' : 'Isolated',
                  isOpen: p.isOpen !== false,
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('KuCoin Futures positions fetch warning:', e);
      }

      return {
        isTesting: false,
        isConnected: true,
        isAuthenticated: true,
        serverTimeFormatted: new Date(serverTimestamp).toLocaleTimeString('en-GB'),
        latencyMs,
        usdtBalance: Number(usdtBal.toFixed(2)),
        availableUsdt: Number(availUsdt.toFixed(2)),
        spotBalanceUsdt: Number(spotBal.toFixed(2)),
        futuresBalanceUsdt: Number(futuresBal.toFixed(2)),
        mainBalanceUsdt: Number(mainBal.toFixed(2)),
        marginBalanceUsdt: Number(marginBal.toFixed(2)),
        inOrderUsdt: Number(holdsUsdt.toFixed(2)),
        unrealizedPnlUsdt: Number(unrealizedPnl.toFixed(2)),
        positions,
        recentOrders: loadKuCoinOrderHistory(),
        statusMessageAr: `حساب KuCoin متصل وموثق بنجاح • الرصيد: ${availUsdt.toFixed(2)} USDT`,
        errorMessageAr: null,
      };
    } else {
      const err = accJson.msg || `رمز الخطأ من KuCoin: ${accJson.code}`;
      return {
        isTesting: false,
        isConnected: true,
        isAuthenticated: false,
        serverTimeFormatted: new Date(serverTimestamp).toLocaleTimeString('en-GB'),
        latencyMs,
        usdtBalance: 0,
        availableUsdt: 0,
        spotBalanceUsdt: 0,
        futuresBalanceUsdt: 0,
        mainBalanceUsdt: 0,
        marginBalanceUsdt: 0,
        inOrderUsdt: 0,
        unrealizedPnlUsdt: 0,
        positions: [],
        recentOrders: loadKuCoinOrderHistory(),
        statusMessageAr: 'فشل توثيق مفاتيح KuCoin API',
        errorMessageAr: `استجابة KuCoin: ${err}`,
      };
    }
  } catch (err: any) {
    return {
      isTesting: false,
      isConnected: true,
      isAuthenticated: false,
      serverTimeFormatted: new Date(serverTimestamp).toLocaleTimeString('en-GB'),
      latencyMs,
      usdtBalance: 0,
      availableUsdt: 0,
      spotBalanceUsdt: 0,
      futuresBalanceUsdt: 0,
      mainBalanceUsdt: 0,
      marginBalanceUsdt: 0,
      inOrderUsdt: 0,
      unrealizedPnlUsdt: 0,
      positions: [],
      recentOrders: loadKuCoinOrderHistory(),
      statusMessageAr: 'خطأ أثناء فحص مفاتيح KuCoin',
      errorMessageAr: err.message || 'خطأ غير معروف في التحقق من المفاتيح',
    };
  }
}

/**
 * Execute an Order on KuCoin based on Binance Signal / Copy Trader
 */
export async function executeKuCoinOrder(params: {
  config: KuCoinConfig;
  binanceSymbol: string;
  side: 'LONG' | 'SHORT';
  amountUsdt: number;
  entryPrice: number;
  leverage: number;
  sourceTraderName?: string;
  sourceSignal?: string;
}): Promise<KuCoinOrderRecord> {
  const kucoinSymbol = convertToKuCoinSymbol(
    params.binanceSymbol,
    params.config.marketType === 'FUTURES'
  );
  const kucoinSide = params.side === 'LONG' ? 'buy' : 'sell';
  const clientOid = `kc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const orderSize = Math.max(1, Math.round((params.amountUsdt * params.leverage) / (params.entryPrice || 100)));

  // If live execution is OFF, record a simulated KuCoin execution record
  if (!params.config.enableLiveExecution || !params.config.apiKey) {
    const simulatedRecord: KuCoinOrderRecord = {
      id: clientOid,
      orderId: `SIM_${Date.now()}`,
      clientOid,
      symbol: kucoinSymbol,
      side: kucoinSide,
      type: 'market',
      price: params.entryPrice,
      size: orderSize,
      dealSize: orderSize,
      status: 'SIMULATED',
      createdAt: Date.now(),
      sourceTraderName: params.sourceTraderName,
      sourceSignal: params.sourceSignal || 'Binance Copy Signal',
      isRealKuCoin: false,
    };
    saveKuCoinOrderRecord(simulatedRecord);
    return simulatedRecord;
  }

  // LIVE KuCoin Order Placement
  try {
    const nowStr = String(Date.now());
    const method = 'POST';
    const isFutures = params.config.marketType === 'FUTURES';

    if (isFutures) {
      // KuCoin Futures Order Endpoint: POST /api/v1/orders
      const endpoint = '/api/v1/orders';
      const bodyObj = {
        clientOid,
        side: kucoinSide,
        symbol: kucoinSymbol,
        leverage: params.leverage || params.config.defaultLeverage,
        type: 'market',
        size: orderSize,
      };
      const bodyStr = JSON.stringify(bodyObj);
      const signPayload = `${nowStr}${method}${endpoint}${bodyStr}`;
      const sign = await generateHmacSha256Base64(params.config.apiSecret.trim(), signPayload);
      const passSign = await generateHmacSha256Base64(
        params.config.apiSecret.trim(),
        params.config.passphrase.trim()
      );

      const res = await fetch(`/kucoin-futures${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': params.config.apiKey.trim(),
          'KC-API-SIGN': sign,
          'KC-API-TIMESTAMP': nowStr,
          'KC-API-PASSPHRASE': passSign,
          'KC-API-KEY-VERSION': '2',
        },
        body: bodyStr,
      });

      const json = await res.json();
      if (res.ok && json.code === '200000') {
        const record: KuCoinOrderRecord = {
          id: clientOid,
          orderId: json.data?.orderId || clientOid,
          clientOid,
          symbol: kucoinSymbol,
          side: kucoinSide,
          type: 'market',
          price: params.entryPrice,
          size: orderSize,
          dealSize: orderSize,
          status: 'NEW',
          createdAt: Date.now(),
          sourceTraderName: params.sourceTraderName,
          sourceSignal: params.sourceSignal || 'Binance Signal -> KuCoin Execution',
          isRealKuCoin: true,
        };
        saveKuCoinOrderRecord(record);
        return record;
      } else {
        throw new Error(json.msg || `فشل إرسال الأمر إلى KuCoin (كود ${json.code})`);
      }
    } else {
      // KuCoin Spot Order Endpoint: POST /api/v1/orders
      const endpoint = '/api/v1/orders';
      const bodyObj = {
        clientOid,
        side: kucoinSide,
        symbol: kucoinSymbol,
        type: 'market',
        funds: String(params.amountUsdt),
      };
      const bodyStr = JSON.stringify(bodyObj);
      const signPayload = `${nowStr}${method}${endpoint}${bodyStr}`;
      const sign = await generateHmacSha256Base64(params.config.apiSecret.trim(), signPayload);
      const passSign = await generateHmacSha256Base64(
        params.config.apiSecret.trim(),
        params.config.passphrase.trim()
      );

      const res = await fetch(`/kucoin${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': params.config.apiKey.trim(),
          'KC-API-SIGN': sign,
          'KC-API-TIMESTAMP': nowStr,
          'KC-API-PASSPHRASE': passSign,
          'KC-API-KEY-VERSION': '2',
        },
        body: bodyStr,
      });

      const json = await res.json();
      if (res.ok && json.code === '200000') {
        const record: KuCoinOrderRecord = {
          id: clientOid,
          orderId: json.data?.orderId || clientOid,
          clientOid,
          symbol: kucoinSymbol,
          side: kucoinSide,
          type: 'market',
          price: params.entryPrice,
          size: orderSize,
          dealSize: orderSize,
          status: 'NEW',
          createdAt: Date.now(),
          sourceTraderName: params.sourceTraderName,
          sourceSignal: params.sourceSignal || 'Binance Spot Signal -> KuCoin',
          isRealKuCoin: true,
        };
        saveKuCoinOrderRecord(record);
        return record;
      } else {
        throw new Error(json.msg || `فشل إرسال الأمر إلى KuCoin (كود ${json.code})`);
      }
    }
  } catch (err: any) {
    console.error('KuCoin live order failed:', err);
    throw err;
  }
}
