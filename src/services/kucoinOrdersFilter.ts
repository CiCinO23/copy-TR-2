import type { KuCoinOrderRecord } from '../types';

export type OrderSideFilter = 'ALL' | 'BUY' | 'SELL';

export interface KuCoinOrdersFilterCriteria {
  side: OrderSideFilter;
  symbol: string; // 'ALL' or specific symbol or search query
  searchQuery?: string;
}

export interface FilteredKuCoinOrdersStats {
  totalCount: number;
  buyCount: number;
  sellCount: number;
  uniqueSymbols: string[];
}

/**
 * Maps KuCoin futures/spot symbols (e.g. XBTUSDTM, ETH-USDT, SOLUSDTM) to standard ticker aliases
 * so filtering by "BTC" or "BTCUSDT" also matches "XBTUSDTM", and vice versa.
 */
export function getNormalizedSymbolAliases(symbol: string): string[] {
  const raw = (symbol || '').toUpperCase().trim();
  if (!raw) return [];

  const aliases = new Set<string>([raw]);

  // Remove hyphen and trailing M (KuCoin futures suffix)
  const withoutHyphen = raw.replace(/-/g, '');
  aliases.add(withoutHyphen);

  if (withoutHyphen.endsWith('USDTM')) {
    const base = withoutHyphen.slice(0, -5);
    const normalizedBase = base === 'XBT' ? 'BTC' : base;
    aliases.add(base);
    aliases.add(normalizedBase);
    aliases.add(`${normalizedBase}USDT`);
    aliases.add(`${base}USDT`);
  } else if (withoutHyphen.endsWith('USDT')) {
    const base = withoutHyphen.slice(0, -4);
    const kucoinBase = base === 'BTC' ? 'XBT' : base;
    aliases.add(base);
    aliases.add(kucoinBase);
    aliases.add(`${kucoinBase}USDTM`);
  }

  return Array.from(aliases);
}

/**
 * Returns a human-friendly display pair for a KuCoin symbol (e.g., XBTUSDTM -> XBTUSDTM (BTCUSDT))
 */
export function getReadableSymbolBadge(symbol: string): {
  primary: string;
  coinSymbol: string;
  secondary?: string;
} {
  const raw = (symbol || '').toUpperCase().trim();
  const withoutHyphen = raw.replace(/-/g, '');
  if (withoutHyphen === 'XBTUSDTM' || withoutHyphen === 'XBTUSDT') {
    return { primary: raw, coinSymbol: 'BTCUSDT', secondary: 'BTCUSDT' };
  }
  if (withoutHyphen.endsWith('USDTM')) {
    const base = withoutHyphen.slice(0, -5);
    return { primary: raw, coinSymbol: `${base}USDT`, secondary: `${base}USDT` };
  }
  return { primary: raw, coinSymbol: withoutHyphen };
}

/**
 * Pure function to filter KuCoin recent orders by side (buy/sell) and symbol/query.
 */
export function filterKuCoinRecentOrders(
  orders: KuCoinOrderRecord[],
  criteria: KuCoinOrdersFilterCriteria
): KuCoinOrderRecord[] {
  if (!Array.isArray(orders) || orders.length === 0) return [];

  const sideFilter = criteria.side || 'ALL';
  const selectedSymbol = (criteria.symbol || 'ALL').toUpperCase().trim();
  const rawSearch = (criteria.searchQuery || '').toUpperCase().trim();

  return orders.filter((order) => {
    const normalizedOrderSide = (order.side || '').toLowerCase() === 'buy' ? 'BUY' : 'SELL';

    // 1. Filter by trade side (BUY / SELL)
    if (sideFilter === 'BUY' && normalizedOrderSide !== 'BUY') {
      return false;
    }
    if (sideFilter === 'SELL' && normalizedOrderSide !== 'SELL') {
      return false;
    }

    const aliases = getNormalizedSymbolAliases(order.symbol);

    // 2. Filter by selected symbol dropdown/chip
    if (selectedSymbol && selectedSymbol !== 'ALL') {
      const selectedAliases = getNormalizedSymbolAliases(selectedSymbol);
      const matchesSelected = aliases.some((a) => selectedAliases.includes(a));
      if (!matchesSelected) {
        return false;
      }
    }

    // 3. Filter by free-text symbol search query
    if (rawSearch.length > 0) {
      const matchesQuery = aliases.some((alias) => alias.includes(rawSearch));
      if (!matchesQuery) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Computes summary counts (total, buy, sell, unique symbols) for a list of KuCoinOrderRecord items.
 */
export function summarizeKuCoinOrders(orders: KuCoinOrderRecord[]): FilteredKuCoinOrdersStats {
  const safeOrders = Array.isArray(orders) ? orders : [];
  let buyCount = 0;
  let sellCount = 0;
  const symbolSet = new Set<string>();

  for (const ord of safeOrders) {
    if ((ord.side || '').toLowerCase() === 'buy') {
      buyCount += 1;
    } else {
      sellCount += 1;
    }
    if (ord.symbol) {
      symbolSet.add(ord.symbol.toUpperCase().trim());
    }
  }

  return {
    totalCount: safeOrders.length,
    buyCount,
    sellCount,
    uniqueSymbols: Array.from(symbolSet),
  };
}
