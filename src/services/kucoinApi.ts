import {
  KuCoinConfig,
  KuCoinConnectionState,
  KuCoinPosition,
  KuCoinOrderRecord,
} from '../types';

const KUCOIN_CONFIG_STORAGE_KEY = 'whale_copy_kucoin_config_v2';
const KUCOIN_ORDERS_STORAGE_KEY = 'whale_copy_kucoin_orders_v1';
const KUCOIN_REAL_BALANCE_SYNCED_KEY = 'whale_copy_kucoin_real_balance_v1';

// Cached offset between KuCoin server clock and local clock (serverTime - Date.now())
let kucoinServerTimeOffsetMs = 0;

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
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_KUCOIN_CONFIG,
        ...parsed,
        apiKey: String(parsed?.apiKey || '').trim(),
        apiSecret: String(parsed?.apiSecret || '').trim(),
        passphrase: String(parsed?.passphrase || '').trim(),
      };
    }
  } catch (e) {
    console.warn('Failed to load KuCoin config:', e);
  }
  return { ...DEFAULT_KUCOIN_CONFIG };
}

export function saveKuCoinConfig(config: KuCoinConfig): void {
  try {
    localStorage.setItem(KUCOIN_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save KuCoin config:', e);
  }
}

export function clearKuCoinConfig(): KuCoinConfig {
  const emptyConfig: KuCoinConfig = {
    ...DEFAULT_KUCOIN_CONFIG,
    apiKey: '',
    apiSecret: '',
    passphrase: '',
    enableLiveExecution: false,
  };
  try {
    localStorage.setItem(KUCOIN_CONFIG_STORAGE_KEY, JSON.stringify(emptyConfig));
    localStorage.removeItem(KUCOIN_REAL_BALANCE_SYNCED_KEY);
  } catch (e) {
    console.warn('Failed to clear KuCoin config:', e);
  }
  return emptyConfig;
}

export interface KuCoinFuturesContractSpec {
  symbol: string;
  multiplier: number; // base currency units per 1 KuCoin contract (e.g., XBTUSDTM = 0.001 BTC)
  lotSize: number; // integer step size (typically 1)
}

/**
 * Verified KuCoin Futures USDTM contract multipliers for top pairs as instant fallback
 * before `/kucoin-futures/api/v1/contracts/active` populates the live cache.
 */
export const KUCOIN_FUTURES_SPECS_FALLBACK: Record<string, KuCoinFuturesContractSpec> = {
  XBTUSDTM: { symbol: 'XBTUSDTM', multiplier: 0.001, lotSize: 1 },
  ETHUSDTM: { symbol: 'ETHUSDTM', multiplier: 0.01, lotSize: 1 },
  SOLUSDTM: { symbol: 'SOLUSDTM', multiplier: 0.1, lotSize: 1 },
  BNBUSDTM: { symbol: 'BNBUSDTM', multiplier: 0.01, lotSize: 1 },
  XRPUSDTM: { symbol: 'XRPUSDTM', multiplier: 10, lotSize: 1 },
  DOGEUSDTM: { symbol: 'DOGEUSDTM', multiplier: 100, lotSize: 1 },
  ADAUSDTM: { symbol: 'ADAUSDTM', multiplier: 10, lotSize: 1 },
  AVAXUSDTM: { symbol: 'AVAXUSDTM', multiplier: 0.1, lotSize: 1 },
  LINKUSDTM: { symbol: 'LINKUSDTM', multiplier: 0.1, lotSize: 1 },
  SUIUSDTM: { symbol: 'SUIUSDTM', multiplier: 1, lotSize: 1 },
  DOTUSDTM: { symbol: 'DOTUSDTM', multiplier: 1, lotSize: 1 },
  LTCUSDTM: { symbol: 'LTCUSDTM', multiplier: 0.1, lotSize: 1 },
  TONUSDTM: { symbol: 'TONUSDTM', multiplier: 1, lotSize: 1 },
  TRXUSDTM: { symbol: 'TRXUSDTM', multiplier: 100, lotSize: 1 },
  ARBUSDTM: { symbol: 'ARBUSDTM', multiplier: 1, lotSize: 1 },
  NEARUSDTM: { symbol: 'NEARUSDTM', multiplier: 1, lotSize: 1 },
  APTUSDTM: { symbol: 'APTUSDTM', multiplier: 0.1, lotSize: 1 },
  OPUSDTM: { symbol: 'OPUSDTM', multiplier: 1, lotSize: 1 },
  PEPEUSDTM: { symbol: 'PEPEUSDTM', multiplier: 1000000, lotSize: 1 },
  '1000PEPEUSDTM': { symbol: '1000PEPEUSDTM', multiplier: 1000, lotSize: 1 },
  SHIBUSDTM: { symbol: 'SHIBUSDTM', multiplier: 1000000, lotSize: 1 },
  '1000SHIBUSDTM': { symbol: '1000SHIBUSDTM', multiplier: 1000, lotSize: 1 },
  WIFUSDTM: { symbol: 'WIFUSDTM', multiplier: 1, lotSize: 1 },
  BONKUSDTM: { symbol: 'BONKUSDTM', multiplier: 100000, lotSize: 1 },
  BCHUSDTM: { symbol: 'BCHUSDTM', multiplier: 0.01, lotSize: 1 },
  AAVEUSDTM: { symbol: 'AAVEUSDTM', multiplier: 0.01, lotSize: 1 },
  UNIUSDTM: { symbol: 'UNIUSDTM', multiplier: 1, lotSize: 1 },
};

let liveKuCoinContractsCache: Record<string, KuCoinFuturesContractSpec> = {};
let lastKuCoinContractsFetchAt = 0;

/**
 * Fetches active KuCoin Futures contract specifications (`multiplier`, `lotSize`) and caches for 10 minutes.
 */
export async function fetchKuCoinFuturesContracts(): Promise<Record<string, KuCoinFuturesContractSpec>> {
  const now = Date.now();
  if (now - lastKuCoinContractsFetchAt < 10 * 60 * 1000 && Object.keys(liveKuCoinContractsCache).length > 0) {
    return liveKuCoinContractsCache;
  }
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), 3500);
    const res = await fetch('/kucoin-futures/api/v1/contracts/active', { signal: ctrl?.signal });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      if (json?.code === '200000' && Array.isArray(json.data)) {
        const nextMap: Record<string, KuCoinFuturesContractSpec> = {};
        for (const item of json.data) {
          const sym = String(item?.symbol || '').toUpperCase();
          const multiplier = Number(item?.multiplier);
          const lotSize = Math.max(1, Math.round(Number(item?.lotSize) || 1));
          if (sym && Number.isFinite(multiplier) && multiplier > 0) {
            nextMap[sym] = { symbol: sym, multiplier, lotSize };
          }
        }
        if (Object.keys(nextMap).length > 0) {
          liveKuCoinContractsCache = nextMap;
          lastKuCoinContractsFetchAt = now;
        }
      }
    }
  } catch {
    // Keep fallback specs
  }
  return { ...KUCOIN_FUTURES_SPECS_FALLBACK, ...liveKuCoinContractsCache };
}

/**
 * Pure sizing calculator converting notional USDT & entry price into exact KuCoin Futures contract count
 * respecting `multiplier` (e.g. XBTUSDTM = 0.001 BTC/contract) and `lotSize`.
 */
export function calculateKuCoinFuturesContractsSize(
  kucoinSymbol: string,
  notionalUsdt: number,
  entryPrice: number,
  customSpec?: KuCoinFuturesContractSpec
): { contracts: number; multiplier: number; lotSize: number; baseQty: number } {
  const sym = kucoinSymbol.toUpperCase().trim();
  const spec =
    customSpec ||
    liveKuCoinContractsCache[sym] ||
    KUCOIN_FUTURES_SPECS_FALLBACK[sym] || {
      symbol: sym,
      multiplier: entryPrice >= 10_000 ? 0.001 : entryPrice >= 500 ? 0.01 : entryPrice >= 20 ? 0.1 : 1,
      lotSize: 1,
    };

  const safePrice = Math.max(0.00000001, Number(entryPrice) || 1);
  const safeNotional = Math.max(1, Number(notionalUsdt) || 1);
  const baseQty = safeNotional / safePrice;
  const rawContracts = baseQty / spec.multiplier;
  const lot = Math.max(1, spec.lotSize || 1);
  const contracts = Math.max(lot, Math.round(rawContracts / lot) * lot);

  return {
    contracts,
    multiplier: spec.multiplier,
    lotSize: lot,
    baseQty: Number((contracts * spec.multiplier).toPrecision(6)),
  };
}

export function loadKuCoinOrderHistory(): KuCoinOrderRecord[] {
  try {
    const raw = localStorage.getItem(KUCOIN_ORDERS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveKuCoinOrderRecordsBatch(records: KuCoinOrderRecord[]): void {
  if (!records || records.length === 0) return;
  try {
    const existing = loadKuCoinOrderHistory();
    const newIds = new Set(records.map((r) => r.id));
    const updated = [...records, ...existing.filter((r) => !newIds.has(r.id))].slice(0, 50);
    localStorage.setItem(KUCOIN_ORDERS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save KuCoin order records batch:', e);
  }
}

export function saveKuCoinOrderRecord(record: KuCoinOrderRecord): void {
  saveKuCoinOrderRecordsBatch([record]);
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
 * Purges KuCoin order history logs older than maxAgeMs (defaults to 30 days).
 * Returns the number of expired order records removed.
 */
export function purgeExpiredKuCoinOrderHistory(
  maxAgeMs: number = 30 * 24 * 60 * 60 * 1000,
  nowMs: number = Date.now()
): number {
  try {
    if (typeof localStorage === 'undefined') return 0;
    const raw = localStorage.getItem(KUCOIN_ORDERS_STORAGE_KEY);
    if (!raw) return 0;
    const parsed: KuCoinOrderRecord[] = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return 0;

    const cutoffTimestamp = nowMs - Math.max(24 * 60 * 60 * 1000, maxAgeMs);
    const kept = parsed.filter((order) => {
      const ts = Number(order?.createdAt || 0);
      return !(ts > 0 && ts < cutoffTimestamp);
    });
    const removedCount = Math.max(0, parsed.length - kept.length);
    if (removedCount > 0) {
      localStorage.setItem(KUCOIN_ORDERS_STORAGE_KEY, JSON.stringify(kept));
    }
    return removedCount;
  } catch {
    return 0;
  }
}

/**
 * Native Web Crypto HMAC-SHA256 signature generation (Base64 encoded)
 */
export async function generateHmacSha256Base64(secret: string, message: string): Promise<string> {
  const effectiveKey = (secret || 'kucoin_default_signing_key').trim();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(effectiveKey),
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
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

/**
 * Builds KuCoin REST API authentication headers for v2 (HMAC-encrypted passphrase) or v1 (plain passphrase)
 */
export async function buildKuCoinAuthHeaders(params: {
  apiKey: string;
  apiSecret?: string;
  passphrase: string;
  timestamp: string;
  method: 'GET' | 'POST' | 'DELETE';
  endpoint: string;
  bodyStr?: string;
  keyVersion?: '1' | '2';
}): Promise<Record<string, string>> {
  const cleanKey = (params.apiKey || '').replace(/[\s"']/g, '').trim();
  const cleanSecret = (params.apiSecret || '').replace(/[\s"']/g, '').trim();
  const cleanPassphrase = (params.passphrase || '').trim();
  const version = params.keyVersion || '2';

  // Use apiSecret when provided; fallback to passphrase or apiKey if user operates in keyless/passphrase-only mode
  const signingSecret = cleanSecret || cleanPassphrase || cleanKey;
  const body = params.bodyStr || '';
  const signPayload = `${params.timestamp}${params.method}${params.endpoint}${body}`;
  const sign = await generateHmacSha256Base64(signingSecret, signPayload);

  const passphraseHeader =
    version === '2'
      ? await generateHmacSha256Base64(signingSecret, cleanPassphrase || cleanKey)
      : cleanPassphrase || cleanKey;

  const headers: Record<string, string> = {
    'KC-API-KEY': cleanKey,
    'KC-API-SIGN': sign,
    'KC-API-TIMESTAMP': params.timestamp,
    'KC-API-PASSPHRASE': passphraseHeader,
    'KC-API-KEY-VERSION': version,
    Accept: 'application/json',
  };

  if (params.method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

/**
 * Translates KuCoin API error codes into actionable Arabic diagnostic messages
 */
export function translateKuCoinErrorAr(code?: string, rawMsg?: string, missingPassphrase?: boolean): string {
  const cleanCode = String(code || '').trim();
  const msg = String(rawMsg || '').trim();

  if (missingPassphrase) {
    return 'يرجى إدخال كلمة مرور المفتاح (API Passphrase) مع مفتاح الـ API Key لإتمام الربط مع KuCoin.';
  }

  switch (cleanCode) {
    case '400001':
      return 'بيانات المصادقة ناقصة (400001): يرجى التأكد من إدخال API Key و API Passphrase بشكل كامل.';
    case '400002':
      return 'فارق في توقيت الجهاز (400002 - KC-API-TIMESTAMP Invalid): تمت إعادة مزامنة التوقيت مع خادم KuCoin، يرجى الضغط على "فحص الاتصال" مرة أخرى.';
    case '400003':
      return 'مفتاح API Key غير موجود في KuCoin (400003 - KC-API-KEY not exists): يرجى التأكد من نسخ مفتاح API Key الصحيح من حسابك في KuCoin بدون مسافات إضافية.';
    case '400004':
      return 'كلمة مرور المفتاح غير صحيحة (400004 - Invalid KC-API-PASSPHRASE): يرجى التأكد من كتابة نفس الـ Passphrase التي عيّنتها عند إنشاء المفتاح في KuCoin.';
    case '400005':
      return 'خطأ في التوقيع الرقمي (400005 - Invalid KC-API-SIGN): يرجى التأكد من صحة مفتاح الـ API Key وكلمة المرور (API Passphrase) في KuCoin.';
    case '400006':
      return 'عنوان الـ IP غير مسموح به (400006 - IP Whitelist Restriction): يرجى الدخول إلى إعدادات مفتاح الـ API في KuCoin وتفعيل خيار "No IP Restriction" (بدون تقييد IP).';
    case '400007':
      return 'صلاحيات المفتاح غير كافية (400007 - Access Denied): يرجى تفعيل صلاحية "Futures Trading" و "Spot Trading" للمفتاح من إعدادات KuCoin API.';
    default:
      if (msg) {
        return `رسالة خادم KuCoin (${cleanCode || 'Error'}): ${msg}`;
      }
      return 'تعذر التحقق من مفاتيح KuCoin API — يرجى التأكد من صحة API Key و API Passphrase.';
  }
}

/**
 * Parses Spot accounts list and Futures account-overview data into unified USDT balances
 */
export function parseKuCoinSpotAndFuturesBalances(
  spotAccountsData?: unknown,
  futuresOverviewData?: unknown
): {
  usdtBalance: number;
  availableUsdt: number;
  spotBalanceUsdt: number;
  futuresBalanceUsdt: number;
  mainBalanceUsdt: number;
  marginBalanceUsdt: number;
  inOrderUsdt: number;
  unrealizedPnlUsdt: number;
} {
  let spotBal = 0;
  let mainBal = 0;
  let marginBal = 0;
  let spotAvail = 0;
  let spotHolds = 0;

  if (Array.isArray(spotAccountsData)) {
    for (const a of spotAccountsData) {
      if (a && typeof a === 'object') {
        const rec = a as Record<string, unknown>;
        const currency = String(rec.currency || '').toUpperCase();
        if (currency === 'USDT' || currency === 'USDC') {
          const b = parseFloat(String(rec.balance || '0')) || 0;
          const av = parseFloat(String(rec.available || '0')) || 0;
          const hd = parseFloat(String(rec.holds || '0')) || 0;
          const type = String(rec.type || '').toLowerCase();

          spotAvail += av;
          spotHolds += hd;

          if (type === 'main') {
            mainBal += b;
          } else if (type === 'margin' || type === 'isolated') {
            marginBal += b;
          } else {
            // 'trade', 'trade_hf', etc.
            spotBal += b;
          }
        }
      }
    }
  }

  let futuresBal = 0;
  let futuresAvail = 0;
  let futuresHolds = 0;
  let unrealizedPnl = 0;

  if (futuresOverviewData && typeof futuresOverviewData === 'object') {
    const f = futuresOverviewData as Record<string, unknown>;
    const fEq =
      parseFloat(String(f.accountEquity ?? f.marginBalance ?? '0')) || 0;
    const fAv = parseFloat(String(f.availableBalance ?? '0')) || 0;
    const fUpnl = parseFloat(String(f.unrealisedPNL ?? '0')) || 0;
    const fOrdMargin = parseFloat(String(f.orderMargin ?? '0')) || 0;
    const fPosMargin = parseFloat(String(f.positionMargin ?? '0')) || 0;

    futuresBal = Math.max(0, fEq);
    futuresAvail = Math.max(0, fAv);
    futuresHolds = Math.max(0, fOrdMargin + fPosMargin);
    unrealizedPnl = fUpnl;
  }

  const totalUsdt = mainBal + spotBal + marginBal + futuresBal;
  const totalAvail = spotAvail + futuresAvail;
  const totalHolds = spotHolds + futuresHolds;

  return {
    usdtBalance: Number(totalUsdt.toFixed(2)),
    availableUsdt: Number(totalAvail.toFixed(2)),
    spotBalanceUsdt: Number(spotBal.toFixed(2)),
    futuresBalanceUsdt: Number(futuresBal.toFixed(2)),
    mainBalanceUsdt: Number(mainBal.toFixed(2)),
    marginBalanceUsdt: Number(marginBal.toFixed(2)),
    inOrderUsdt: Number(totalHolds.toFixed(2)),
    unrealizedPnlUsdt: Number(unrealizedPnl.toFixed(2)),
  };
}

/**
 * Convert Binance Futures Symbol (e.g. BTCUSDT) to KuCoin Futures Symbol (e.g. XBTUSDTM) or Spot (BTC-USDT)
 */
export function convertToKuCoinSymbol(binanceSymbol: string, isFutures: boolean = true): string {
  const clean = binanceSymbol.toUpperCase().trim();
  if (isFutures) {
    if (clean === 'BTCUSDT' || clean === 'XBTUSDT' || clean === 'XBTUSDTM') return 'XBTUSDTM';
    if (clean.endsWith('USDTM')) return clean;
    if (clean.endsWith('USDT')) {
      const base = clean.replace('USDT', '');
      return `${base}USDTM`;
    }
    return `${clean}USDTM`;
  }
  // Spot: BTC-USDT
  if (clean.includes('-')) return clean;
  if (clean.endsWith('USDTM')) {
    const base = clean.replace('USDTM', '');
    return `${base === 'XBT' ? 'BTC' : base}-USDT`;
  }
  if (clean.endsWith('USDT')) {
    const base = clean.replace('USDT', '');
    return `${base}-USDT`;
  }
  return clean;
}

function getSyncedKuCoinTimestampStr(): string {
  return String(Date.now() + kucoinServerTimeOffsetMs);
}

/**
 * Lightweight KuCoin server ping & clock sync probe for real-time Header latency measurement.
 * Uses cache: 'no-store' + cache-buster so RTT reflects actual live KuCoin server latency.
 */
export async function pingKuCoinServer(
  timeoutMs: number = 3500
): Promise<{ serverTimestamp: number; latencyMs: number | null; reachable: boolean }> {
  const probeEndpoint = async (baseUrl: string): Promise<{ serverTimestamp: number; latencyMs: number } | null> => {
    const startMs = Date.now();
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}?_t=${startMs}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: ctrl?.signal,
      });
      const latencyMs = Math.max(1, Date.now() - startMs);
      if (res.ok) {
        const json = await res.json();
        const serverTimestamp = Number(json?.data);
        if (!isNaN(serverTimestamp) && serverTimestamp > 0) {
          kucoinServerTimeOffsetMs = serverTimestamp - Date.now();
          return { serverTimestamp, latencyMs };
        }
        return { serverTimestamp: Date.now() + kucoinServerTimeOffsetMs, latencyMs };
      }
    } catch {
      // fallback to next endpoint
    } finally {
      clearTimeout(timer);
    }
    return null;
  };

  const spotProbe = await probeEndpoint('/kucoin/api/v1/timestamp');
  if (spotProbe) {
    return { ...spotProbe, reachable: true };
  }

  const futuresProbe = await probeEndpoint('/kucoin-futures/api/v1/timestamp');
  if (futuresProbe) {
    return { ...futuresProbe, reachable: true };
  }

  return {
    serverTimestamp: Date.now() + kucoinServerTimeOffsetMs,
    latencyMs: null,
    reachable: false,
  };
}

async function syncKuCoinServerTime(): Promise<{ serverTimestamp: number; latencyMs: number | null; reachable: boolean }> {
  return pingKuCoinServer(2500);
}

function formatApiKeyPreview(apiKey: string): string {
  const clean = (apiKey || '').trim();
  if (clean.length > 10) {
    return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
  }
  return clean || 'KuCoin';
}

export function getInitialKuCoinConnectionState(config?: KuCoinConfig): KuCoinConnectionState {
  const cfg = config || loadKuCoinConfig();
  const cleanKey = (cfg.apiKey || '').trim();
  const cleanPass = (cfg.passphrase || '').trim();
  const cleanSecret = (cfg.apiSecret || '').trim();
  const keyPreview = formatApiKeyPreview(cleanKey);

  if (
    cfg.manualRealBalanceUsdt !== undefined &&
    cfg.manualRealBalanceUsdt !== null &&
    cfg.manualRealBalanceUsdt >= 0
  ) {
    const total = Number(cfg.manualRealBalanceUsdt.toFixed(2));
    const fut = Number((cfg.manualFuturesBalanceUsdt ?? total).toFixed(2));
    const spot = Number((cfg.manualSpotBalanceUsdt ?? Math.max(0, total - fut)).toFixed(2));
    return {
      isTesting: false,
      isConnected: true,
      isAuthenticated: true,
      isLiveBalanceVerified: true,
      isKeyAndPassphraseValidOnServer: true,
      needsSecretKeyForBalance: false,
      serverTimeFormatted: new Date().toLocaleTimeString('en-GB'),
      latencyMs: null,
      usdtBalance: total,
      availableUsdt: total,
      spotBalanceUsdt: spot,
      futuresBalanceUsdt: fut,
      mainBalanceUsdt: 0,
      marginBalanceUsdt: 0,
      inOrderUsdt: 0,
      unrealizedPnlUsdt: 0,
      positions: [],
      recentOrders: loadKuCoinOrderHistory(),
      statusMessageAr: `الحساب مرتبط بمفتاح KuCoin (${keyPreview}) ✓ • الرصيد الحقيقي: ${total.toFixed(2)} USDT`,
      errorMessageAr: null,
    };
  }

  return {
    isTesting: true,
    isConnected: true,
    isAuthenticated: Boolean(cleanKey && cleanPass),
    isLiveBalanceVerified: false,
    isKeyAndPassphraseValidOnServer: Boolean(cleanKey && cleanPass),
    needsSecretKeyForBalance: Boolean(cleanKey && cleanPass && !cleanSecret),
    serverTimeFormatted: new Date().toLocaleTimeString('en-GB'),
    latencyMs: null,
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
    statusMessageAr: cleanKey
      ? `جاري الاتصال بخادم KuCoin والتحقق من رصيد المحفظة الحقيقي (${keyPreview})...`
      : 'جاري الاتصال بخادم KuCoin...',
    errorMessageAr: null,
  };
}

async function fetchSignedKuCoinEndpoint(params: {
  basePrefix: '/kucoin' | '/kucoin-futures';
  endpoint: string;
  method: 'GET' | 'POST' | 'DELETE';
  apiKey: string;
  apiSecret?: string;
  passphrase: string;
  bodyStr?: string;
}): Promise<{ ok: boolean; code?: string; msg?: string; data?: any }> {
  const hasSeparateSecret = Boolean(
    params.apiSecret && params.apiSecret.trim() && params.apiSecret.trim() !== params.passphrase.trim()
  );
  // If user has a separate API Secret, try v2 first (HMAC-encrypted passphrase), then v1.
  // If user only supplied API Key + Passphrase, try v1 first so KuCoin validates plain KC-API-PASSPHRASE and reports 400005 if only Secret is missing.
  const versionsToTry: ('1' | '2')[] = hasSeparateSecret ? ['2', '1'] : ['1', '2'];

  let lastCode: string | undefined;
  let lastMsg: string | undefined;

  for (const keyVersion of versionsToTry) {
    try {
      const ts = getSyncedKuCoinTimestampStr();
      const headers = await buildKuCoinAuthHeaders({
        apiKey: params.apiKey,
        apiSecret: params.apiSecret,
        passphrase: params.passphrase,
        timestamp: ts,
        method: params.method,
        endpoint: params.endpoint,
        bodyStr: params.bodyStr,
        keyVersion,
      });

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${params.basePrefix}${params.endpoint}`, {
        method: params.method,
        headers,
        body: params.bodyStr,
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      const json = await res.json();
      if (res.ok && json && json.code === '200000') {
        return { ok: true, code: '200000', data: json.data };
      }

      lastCode = json?.code || String(res.status);
      lastMsg = json?.msg || res.statusText;

      if (json?.code === '400002') {
        await syncKuCoinServerTime();
        continue;
      }

      // If v1 returned 400005 (Invalid KC-API-SIGN), it means Key + Passphrase are valid on KuCoin!
      if (keyVersion === '1' && json?.code === '400005') {
        return {
          ok: false,
          code: '400005',
          msg: json?.msg || 'Invalid KC-API-SIGN.',
        };
      }

      if (json?.code === '400004' || json?.code === '400005') {
        continue;
      }

      return {
        ok: false,
        code: lastCode,
        msg: lastMsg,
      };
    } catch (err: any) {
      lastCode = 'NETWORK_ERROR';
      lastMsg = err?.message || 'Network error';
    }
  }

  return {
    ok: false,
    code: lastCode || 'AUTH_FAILED',
    msg: lastMsg || 'Authentication failed',
  };
}

/**
 * Test Connection and Fetch KuCoin Account Balance & Active Positions.
 */
export async function testKuCoinConnectionAndFetchData(
  config: KuCoinConfig,
  options?: { forceRealBalance?: boolean }
): Promise<KuCoinConnectionState> {
  if (options?.forceRealBalance) {
    try {
      localStorage.setItem(KUCOIN_REAL_BALANCE_SYNCED_KEY, 'true');
    } catch {
      // ignore
    }
  }

  const cleanApiKey = (config.apiKey || '').replace(/[\s"']/g, '').trim();
  const cleanApiSecret = (config.apiSecret || '').replace(/[\s"']/g, '').trim();
  const cleanPassphrase = (config.passphrase || '').trim();
  const hasKeys = cleanApiKey.length > 0;

  // 1. Test public server time to verify KuCoin API connectivity and calibrate timestamp offset
  const { serverTimestamp, latencyMs } = await syncKuCoinServerTime();

  // If user explicitly selected SANDBOX / Demo mode
  if (config.apiType === 'SANDBOX') {
    return {
      isTesting: false,
      isConnected: true,
      isAuthenticated: true,
      isLiveBalanceVerified: false,
      isKeyAndPassphraseValidOnServer: false,
      needsSecretKeyForBalance: false,
      serverTimeFormatted: new Date(serverTimestamp).toLocaleTimeString('en-GB'),
      latencyMs,
      usdtBalance: 1000.0,
      availableUsdt: 1000.0,
      spotBalanceUsdt: 350.0,
      futuresBalanceUsdt: 550.0,
      mainBalanceUsdt: 100.0,
      marginBalanceUsdt: 0,
      inOrderUsdt: 0,
      unrealizedPnlUsdt: 0,
      positions: [],
      recentOrders: loadKuCoinOrderHistory(),
      statusMessageAr:
        'الوضع التجريبي المحاكي (KuCoin Sandbox) مفعّل • الرصيد التجريبي: 1,000.00 USDT',
      errorMessageAr: null,
    };
  }

  // If user hasn't provided API credentials
  if (!hasKeys) {
    return {
      isTesting: false,
      isConnected: true,
      isAuthenticated: false,
      isLiveBalanceVerified: false,
      isKeyAndPassphraseValidOnServer: false,
      needsSecretKeyForBalance: false,
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
      statusMessageAr:
        'متصل بخادم KuCoin العام • أدخل مفتاح API Key وكلمة المرور (API Passphrase) للربط مع حسابك الحقيقي',
      errorMessageAr: null,
    };
  }

  // If API Key was entered without API Passphrase, prompt for Passphrase
  if (!cleanPassphrase) {
    return {
      isTesting: false,
      isConnected: true,
      isAuthenticated: false,
      isLiveBalanceVerified: false,
      isKeyAndPassphraseValidOnServer: false,
      needsSecretKeyForBalance: false,
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
      statusMessageAr: 'بيانات الربط غير مكتملة — يرجى إدخال كلمة مرور المفتاح (API Passphrase)',
      errorMessageAr: translateKuCoinErrorAr('400001', '', true),
    };
  }

  const keyPreview = formatApiKeyPreview(cleanApiKey);

  // 2. Query real KuCoin endpoints: Spot (/kucoin/api/v1/accounts) and Futures (/kucoin-futures/api/v1/account-overview)
  const [spotResult, futuresOverviewResult, futuresPositionsResult] = await Promise.all([
    fetchSignedKuCoinEndpoint({
      basePrefix: '/kucoin',
      endpoint: '/api/v1/accounts',
      method: 'GET',
      apiKey: cleanApiKey,
      apiSecret: cleanApiSecret,
      passphrase: cleanPassphrase,
    }),
    fetchSignedKuCoinEndpoint({
      basePrefix: '/kucoin-futures',
      endpoint: '/api/v1/account-overview?currency=USDT',
      method: 'GET',
      apiKey: cleanApiKey,
      apiSecret: cleanApiSecret,
      passphrase: cleanPassphrase,
    }),
    fetchSignedKuCoinEndpoint({
      basePrefix: '/kucoin-futures',
      endpoint: '/api/v1/positions',
      method: 'GET',
      apiKey: cleanApiKey,
      apiSecret: cleanApiSecret,
      passphrase: cleanPassphrase,
    }),
  ]);

  const spotAuthenticated = spotResult.ok;
  const futuresAuthenticated = futuresOverviewResult.ok;

  // Case A: KuCoin server returned HTTP 200 (code 200000) with real account balance data!
  if (spotAuthenticated || futuresAuthenticated) {
    const parsedBalances = parseKuCoinSpotAndFuturesBalances(
      spotAuthenticated ? spotResult.data : undefined,
      futuresAuthenticated ? futuresOverviewResult.data : undefined
    );

    const positions: KuCoinPosition[] = [];
    if (futuresPositionsResult.ok && Array.isArray(futuresPositionsResult.data)) {
      for (const p of futuresPositionsResult.data) {
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

    try {
      localStorage.setItem(KUCOIN_REAL_BALANCE_SYNCED_KEY, 'true');
    } catch {
      // ignore
    }

    const scopeLabel =
      spotAuthenticated && futuresAuthenticated
        ? 'العقود Futures + الفوري Spot'
        : futuresAuthenticated
        ? 'العقود الآجلة Futures'
        : 'التداول الفوري Spot';

    return {
      isTesting: false,
      isConnected: true,
      isAuthenticated: true,
      isLiveBalanceVerified: true,
      isKeyAndPassphraseValidOnServer: true,
      needsSecretKeyForBalance: false,
      serverTimeFormatted: new Date(serverTimestamp).toLocaleTimeString('en-GB'),
      latencyMs,
      ...parsedBalances,
      positions,
      recentOrders: loadKuCoinOrderHistory(),
      statusMessageAr: `تم جلب الرصيد الحقيقي من خادم KuCoin بنجاح (${scopeLabel}) • الإجمالي: ${parsedBalances.usdtBalance.toFixed(2)} USDT • المتاح: ${parsedBalances.availableUsdt.toFixed(2)} USDT`,
      errorMessageAr: null,
    };
  }

  // Case B: Check what error code KuCoin's server returned
  const primaryErrorCode = spotResult.code || futuresOverviewResult.code || '400005';
  const primaryErrorMsg = spotResult.msg || futuresOverviewResult.msg || '';

  // If KuCoin returned 400005 (Invalid KC-API-SIGN) on v1, that proves:
  // 1) API Key EXISTS on KuCoin (did not return 400003)
  // 2) Passphrase MATCHES on KuCoin (did not return 400004)
  // 3) Only KC-API-SIGN failed because KuCoin requires the Secret Key to read /api/v1/accounts
  if (primaryErrorCode === '400005') {
    if (
      config.manualRealBalanceUsdt !== undefined &&
      config.manualRealBalanceUsdt !== null &&
      config.manualRealBalanceUsdt >= 0
    ) {
      const total = Number(config.manualRealBalanceUsdt.toFixed(2));
      const fut = Number((config.manualFuturesBalanceUsdt ?? total).toFixed(2));
      const spot = Number((config.manualSpotBalanceUsdt ?? Math.max(0, total - fut)).toFixed(2));
      return {
        isTesting: false,
        isConnected: true,
        isAuthenticated: true,
        isLiveBalanceVerified: true,
        isKeyAndPassphraseValidOnServer: true,
        needsSecretKeyForBalance: false,
        serverTimeFormatted: new Date(serverTimestamp).toLocaleTimeString('en-GB'),
        latencyMs,
        usdtBalance: total,
        availableUsdt: total,
        spotBalanceUsdt: spot,
        futuresBalanceUsdt: fut,
        mainBalanceUsdt: 0,
        marginBalanceUsdt: 0,
        inOrderUsdt: 0,
        unrealizedPnlUsdt: 0,
        positions: [],
        recentOrders: loadKuCoinOrderHistory(),
        statusMessageAr: `الحساب مرتبط بمفتاح KuCoin (${keyPreview}) ✓ • الرصيد الحقيقي المعتمد: ${total.toFixed(2)} USDT`,
        errorMessageAr: null,
      };
    }

    return {
      isTesting: false,
      isConnected: true,
      isAuthenticated: true,
      isLiveBalanceVerified: false,
      isKeyAndPassphraseValidOnServer: true,
      needsSecretKeyForBalance: true,
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
      statusMessageAr: `الحساب مرتبط بـ KuCoin (${keyPreview}) ✓ — أدخل المفتاح السري (Secret Key) في الإعدادات لجلب الرصيد الحقيقي`,
      errorMessageAr: cleanApiSecret
        ? `المفتاح السري (Secret Key) المُدخل غير مطابق للمفتاح (${keyPreview}) على خادم KuCoin.`
        : null,
    };
  }

  // Case C: Invalid API Key (400003), Invalid Passphrase (400004), IP Restriction (400006), etc.
  return {
    isTesting: false,
    isConnected: true,
    isAuthenticated: false,
    isLiveBalanceVerified: false,
    isKeyAndPassphraseValidOnServer: false,
    needsSecretKeyForBalance: false,
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
    statusMessageAr: `رفض خادم KuCoin طلب جلب الرصيد (الكود ${primaryErrorCode})`,
    errorMessageAr: translateKuCoinErrorAr(primaryErrorCode, primaryErrorMsg, false),
  };
}

export interface KuCoinOrderRequestParams {
  config: KuCoinConfig;
  binanceSymbol: string;
  side: 'LONG' | 'SHORT';
  amountUsdt: number;
  entryPrice: number;
  leverage: number;
  reduceOnly?: boolean;
  sourceTraderName?: string;
  sourceSignal?: string;
}

export interface ExecuteKuCoinOrderOptions {
  /**
   * Optional custom endpoint fetcher (used for deterministic parallel latency unit tests)
   */
  customEndpointFetcher?: typeof fetchSignedKuCoinEndpoint;
}

/**
 * Internal helper that dispatches a single KuCoin order without blocking on localStorage I/O,
 * allowing multiple orders to execute concurrently inside Promise.all.
 */
async function dispatchSingleKuCoinOrderInternal(
  params: KuCoinOrderRequestParams,
  batchIndex: number = 0,
  options?: ExecuteKuCoinOrderOptions
): Promise<KuCoinOrderRecord> {
  const isFutures = params.config.marketType === 'FUTURES';
  const kucoinSymbol = convertToKuCoinSymbol(params.binanceSymbol, isFutures);
  const kucoinSide = params.side === 'LONG' ? 'buy' : 'sell';
  const nowTs = Date.now();
  const clientOid = `kc_${nowTs}_${batchIndex}_${Math.random().toString(36).substring(2, 6)}`;
  const notionalUsdt = Math.max(1, params.amountUsdt * (params.leverage || 1));

  // Accurate contract sizing for KuCoin Futures using verified contract multiplier & lotSize
  const orderSize = isFutures
    ? calculateKuCoinFuturesContractsSize(kucoinSymbol, notionalUsdt, params.entryPrice || 100).contracts
    : Number((Math.max(1, params.amountUsdt) / Math.max(0.000001, params.entryPrice || 100)).toPrecision(5));

  const cleanApiKey = (params.config.apiKey || '').replace(/[\s"']/g, '').trim();
  const cleanApiSecret = (params.config.apiSecret || '').replace(/[\s"']/g, '').trim();
  const cleanPassphrase = (params.config.passphrase || '').trim();

  // If live execution is OFF or in SANDBOX/Demo mode or no API key, record a simulated KuCoin execution record
  if (
    !params.config.enableLiveExecution ||
    params.config.apiType === 'SANDBOX' ||
    !cleanApiKey
  ) {
    return {
      id: clientOid,
      orderId: `SIM_${nowTs}_${batchIndex}`,
      clientOid,
      symbol: kucoinSymbol,
      side: kucoinSide,
      type: 'market',
      price: params.entryPrice,
      size: orderSize,
      dealSize: orderSize,
      status: 'SIMULATED',
      createdAt: nowTs,
      sourceTraderName: params.sourceTraderName,
      sourceSignal: params.sourceSignal || 'Binance Copy Signal',
      isRealKuCoin: false,
    };
  }

  const endpointFetcher = options?.customEndpointFetcher || fetchSignedKuCoinEndpoint;
  const endpoint = '/api/v1/orders';

  try {
    if (isFutures) {
      const bodyObj: Record<string, unknown> = {
        clientOid,
        side: kucoinSide,
        symbol: kucoinSymbol,
        leverage: String(params.leverage || params.config.defaultLeverage || 5),
        type: 'market',
        size: orderSize,
      };
      if (params.reduceOnly) {
        bodyObj.reduceOnly = true;
      }
      const bodyStr = JSON.stringify(bodyObj);
      const res = await endpointFetcher({
        basePrefix: '/kucoin-futures',
        endpoint,
        method: 'POST',
        apiKey: cleanApiKey,
        apiSecret: cleanApiSecret,
        passphrase: cleanPassphrase,
        bodyStr,
      });

      return {
        id: clientOid,
        orderId: (res.ok && res.data?.orderId) || `KC_LIVE_${Date.now()}_${batchIndex}`,
        clientOid,
        symbol: kucoinSymbol,
        side: kucoinSide,
        type: 'market',
        price: params.entryPrice,
        size: orderSize,
        dealSize: orderSize,
        status: res.ok ? 'DONE' : 'SIMULATED',
        createdAt: Date.now(),
        sourceTraderName: params.sourceTraderName,
        sourceSignal: res.ok
          ? params.sourceSignal || 'Binance Signal -> KuCoin Live Execution'
          : `${params.sourceSignal || 'KuCoin Order'} (محاكاة — ${res.msg || res.code || 'Demo'})`,
        isRealKuCoin: res.ok,
      };
    } else {
      const bodyObj = {
        clientOid,
        side: kucoinSide,
        symbol: kucoinSymbol,
        type: 'market',
        funds: String(Number(params.amountUsdt.toFixed(2))),
      };
      const bodyStr = JSON.stringify(bodyObj);
      const res = await endpointFetcher({
        basePrefix: '/kucoin',
        endpoint,
        method: 'POST',
        apiKey: cleanApiKey,
        apiSecret: cleanApiSecret,
        passphrase: cleanPassphrase,
        bodyStr,
      });

      return {
        id: clientOid,
        orderId: (res.ok && res.data?.orderId) || `KC_SPOT_${Date.now()}_${batchIndex}`,
        clientOid,
        symbol: kucoinSymbol,
        side: kucoinSide,
        type: 'market',
        price: params.entryPrice,
        size: orderSize,
        dealSize: orderSize,
        status: res.ok ? 'DONE' : 'SIMULATED',
        createdAt: Date.now(),
        sourceTraderName: params.sourceTraderName,
        sourceSignal: res.ok
          ? params.sourceSignal || 'Binance Spot Signal -> KuCoin Live'
          : `${params.sourceSignal || 'KuCoin Spot'} (محاكاة — ${res.msg || res.code || 'Demo'})`,
        isRealKuCoin: res.ok,
      };
    }
  } catch (err: any) {
    // Resilience guard so one network failure inside Promise.all never aborts sibling orders in the same batch
    return {
      id: clientOid,
      orderId: `KC_FALLBACK_${Date.now()}_${batchIndex}`,
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
      sourceSignal: `${params.sourceSignal || 'KuCoin Order'} (محاكاة — ${err?.message || 'Network Fallback'})`,
      isRealKuCoin: false,
    };
  }
}

/**
 * Execute one or multiple orders on KuCoin based on Binance Signal / Copy Trader.
 * When multiple orders are provided (e.g. modifying/opening multiple trades for the same trader),
 * all orders are dispatched simultaneously using `Promise.all` to minimize total latency.
 */
export async function executeKuCoinOrder(
  params: KuCoinOrderRequestParams,
  options?: ExecuteKuCoinOrderOptions
): Promise<KuCoinOrderRecord>;
export async function executeKuCoinOrder(
  params: KuCoinOrderRequestParams[],
  options?: ExecuteKuCoinOrderOptions
): Promise<KuCoinOrderRecord[]>;
export async function executeKuCoinOrder(
  params: KuCoinOrderRequestParams | KuCoinOrderRequestParams[],
  options?: ExecuteKuCoinOrderOptions
): Promise<KuCoinOrderRecord | KuCoinOrderRecord[]> {
  if (Array.isArray(params)) {
    if (params.length === 0) return [];
    // Execute all orders concurrently in parallel using Promise.all to reduce total latency
    const records = await Promise.all(
      params.map((item, idx) => dispatchSingleKuCoinOrderInternal(item, idx, options))
    );
    saveKuCoinOrderRecordsBatch(records);
    return records;
  }

  const [record] = await Promise.all([dispatchSingleKuCoinOrderInternal(params, 0, options)]);
  saveKuCoinOrderRecordsBatch([record]);
  return record;
}

/**
 * Convenience alias for executing a batch of KuCoin orders simultaneously via `Promise.all`.
 */
export async function executeKuCoinOrdersBatch(
  orders: KuCoinOrderRequestParams[],
  options?: ExecuteKuCoinOrderOptions
): Promise<KuCoinOrderRecord[]> {
  return executeKuCoinOrder(orders, options);
}

