/**
 * Pure business logic for:
 * 1) Evaluating previous/reconnection trades based on whether the current market price is in the user's favor
 * 2) Calculating near-current-price Stop-Loss when securing an open position ("تأمين الصفقة")
 * 3) Checking whether a secured Stop-Loss is triggered by live market price movement
 * 4) Resolving the live market execution price so orders always execute at the current price
 */

import type { ActiveCopiedTrader, PendingReconnectTradeChoice } from '../types';

export interface PriceAdvantageEvaluation {
  isFavorable: boolean;
  decision: 'EXECUTE_IMMEDIATELY' | 'PROMPT_USER_CHOICE';
  priceDiffPercent: number;
  reasonAr: string;
}

/**
 * Evaluates a previous/existing trade upon app opening or reconnection:
 * - If SHORT (بيع):
 *   - Current price >= Entry price -> Favorable (السعر الحالي أعلى/أفضل من سعر الدخول) -> EXECUTE_IMMEDIATELY
 *   - Current price < Entry price -> Unfavorable (السعر الحالي أقل/أسوأ من سعر الدخول) -> PROMPT_USER_CHOICE
 * - If LONG (شراء):
 *   - Current price <= Entry price -> Favorable (السعر الحالي أدنى/أفضل من سعر الدخول) -> EXECUTE_IMMEDIATELY
 *   - Current price > Entry price -> Unfavorable (السعر الحالي أعلى/أسوأ من سعر الدخول) -> PROMPT_USER_CHOICE
 */
export function evaluatePreviousTradePriceAdvantage(params: {
  side: 'LONG' | 'SHORT';
  traderEntryPrice: number;
  currentMarketPrice: number;
}): PriceAdvantageEvaluation {
  const { side, traderEntryPrice, currentMarketPrice } = params;
  const safeEntry = traderEntryPrice > 0 ? traderEntryPrice : currentMarketPrice;
  const safeCurrent = currentMarketPrice > 0 ? currentMarketPrice : safeEntry;

  if (safeEntry <= 0 || safeCurrent <= 0) {
    return {
      isFavorable: true,
      decision: 'EXECUTE_IMMEDIATELY',
      priceDiffPercent: 0,
      reasonAr: 'تنفيذ مباشر بالسعر الحالي للسوق',
    };
  }

  const rawDiffPct = ((safeCurrent - safeEntry) / safeEntry) * 100;
  const priceDiffPercent = Number(rawDiffPct.toFixed(3));

  if (side === 'SHORT') {
    // بيع (SHORT): السعر الحالي أعلى من أو يساوي سعر الدخول = في مصلحة المستخدم
    if (safeCurrent >= safeEntry) {
      return {
        isFavorable: true,
        decision: 'EXECUTE_IMMEDIATELY',
        priceDiffPercent,
        reasonAr: `صفقة بيع (SHORT) والسعر الحالي (${safeCurrent}) أعلى/أفضل من سعر الدخول (${safeEntry}) — تم التنفيذ مباشرة بالسعر الحالي`,
      };
    } else {
      return {
        isFavorable: false,
        decision: 'PROMPT_USER_CHOICE',
        priceDiffPercent,
        reasonAr: `صفقة بيع (SHORT) والسعر الحالي (${safeCurrent}) أقل من سعر الدخول (${safeEntry}) (${priceDiffPercent}%) — بانتظار اختيارك للتنفيذ`,
      };
    }
  } else {
    // شراء (LONG): السعر الحالي أدنى من أو يساوي سعر الدخول = في مصلحة المستخدم
    if (safeCurrent <= safeEntry) {
      return {
        isFavorable: true,
        decision: 'EXECUTE_IMMEDIATELY',
        priceDiffPercent,
        reasonAr: `صفقة شراء (LONG) والسعر الحالي (${safeCurrent}) أدنى/أفضل من سعر الدخول (${safeEntry}) — تم التنفيذ مباشرة بالسعر الحالي`,
      };
    } else {
      return {
        isFavorable: false,
        decision: 'PROMPT_USER_CHOICE',
        priceDiffPercent,
        reasonAr: `صفقة شراء (LONG) والسعر الحالي (${safeCurrent}) أعلى من سعر الدخول (${safeEntry}) (+${priceDiffPercent}%) — بانتظار اختيارك للتنفيذ`,
      };
    }
  }
}

/**
 * Calculates the Stop-Loss price near the current live market price to secure an open position ("تأمين الصفقة").
 * - For LONG: places stop-loss slightly below current market price (currentPrice * (1 - bufferPercent/100))
 * - For SHORT: places stop-loss slightly above current market price (currentPrice * (1 + bufferPercent/100))
 */
export function calculateSecureStopLossPrice(params: {
  side: 'LONG' | 'SHORT';
  currentMarketPrice: number;
  bufferPercent?: number;
}): number {
  const { side, currentMarketPrice, bufferPercent = 0.2 } = params;
  const safeBuffer = Math.min(Math.max(0.05, bufferPercent), 5);
  const factor = side === 'LONG' ? 1 - safeBuffer / 100 : 1 + safeBuffer / 100;
  const rawStop = currentMarketPrice * factor;
  const decimals = currentMarketPrice >= 100 ? 2 : currentMarketPrice >= 1 ? 4 : 6;
  return Number(rawStop.toFixed(decimals));
}

/**
 * Checks whether an open position's Stop-Loss price has been reached or crossed by the live market price.
 */
export function isStopLossTriggered(params: {
  side: 'LONG' | 'SHORT';
  stopLossPrice?: number;
  currentMarketPrice: number;
}): boolean {
  const { side, stopLossPrice, currentMarketPrice } = params;
  if (!stopLossPrice || stopLossPrice <= 0 || currentMarketPrice <= 0) {
    return false;
  }
  if (side === 'LONG') {
    return currentMarketPrice <= stopLossPrice;
  } else {
    return currentMarketPrice >= stopLossPrice;
  }
}

/**
 * Resolves the current live market price for immediate market execution ("بالسعر الحالي وليس برقم ثابت").
 */
export function resolveLiveMarketExecutionPrice(
  symbol: string,
  livePricesMap: Record<string, number>,
  fallbackMarkPrice?: number,
  fallbackEntryPrice?: number
): number {
  const sym = String(symbol || '').toUpperCase().trim();
  if (livePricesMap && livePricesMap[sym] && livePricesMap[sym] > 0) {
    return livePricesMap[sym];
  }
  if (fallbackMarkPrice && fallbackMarkPrice > 0) {
    return fallbackMarkPrice;
  }
  if (fallbackEntryPrice && fallbackEntryPrice > 0) {
    return fallbackEntryPrice;
  }
  return 50;
}

/**
 * Filters pending reconnect/previous trade choices so that ONLY trades belonging to
 * the copied trader(s) on the current page (active virtual account) are shown.
 * Excludes any sample/demo choices or trades from uncopied traders or other accounts.
 */
export function filterPendingChoicesForCopiedTradersOnPage(
  choices: PendingReconnectTradeChoice[],
  copiedTraders: ActiveCopiedTrader[],
  activeAccountId: string
): PendingReconnectTradeChoice[] {
  if (!Array.isArray(choices) || choices.length === 0) return [];
  if (!Array.isArray(copiedTraders) || copiedTraders.length === 0) return [];

  const targetAccId = activeAccountId || 'acc_default';
  const pageCopiedTraders = copiedTraders.filter(
    (ct) => (ct.accountId || 'acc_default') === targetAccId
  );

  if (pageCopiedTraders.length === 0) return [];

  return choices.filter((choice) => {
    if (!choice || String(choice.id || '').startsWith('choice_sample_')) {
      return false;
    }
    const choiceAccId = choice.accountId || 'acc_default';
    if (choiceAccId !== targetAccId) {
      return false;
    }
    return pageCopiedTraders.some(
      (ct) =>
        (ct.traderId === choice.traderId && ct.source === choice.source) ||
        ct.nickname === choice.traderName
    );
  });
}

