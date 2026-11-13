/**
 * Pure business logic for:
 * 1) Evaluating previous/reconnection trades based on whether the current market price is in the user's favor
 * 2) Calculating near-current-price Stop-Loss when securing an open position ("تأمين الصفقة")
 * 3) Checking whether a secured Stop-Loss is triggered by live market price movement
 * 4) Resolving the live market execution price so orders always execute at the current price
 * 5) Direct late-entry calculation: entering directly with the net remaining position value (e.g. 150% or 50%)
 *    without repeating or replaying all past scale-in / partial-exit operations.
 */

import type {
  ActiveCopiedTrader,
  PendingReconnectTradeChoice,
  PositionScaleAdjustment,
} from '../types';

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

/**
 * Formats a timestamp into a clean, readable Arabic date & time string with Latin digits.
 */
export function formatTradeTimestampAr(ts?: number): string {
  if (!ts || ts <= 0 || isNaN(ts)) return '--';
  try {
    return new Date(ts)
      .toLocaleString('ar-EG-u-nu-latn', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  } catch {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * Formats a price cleanly according to magnitude.
 */
export function formatTradePriceClean(price?: number): string {
  if (price === undefined || price === null || isNaN(price) || price <= 0) return '0.00';
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

export interface LateEntryComparisonDetails {
  isLateEntry: boolean;
  delayMs: number;
  delayTextAr: string;
  traderPriceStr: string;
  traderTimeStr: string;
  userPriceStr: string;
  userTimeStr: string;
  traderEntryLineAr: string;
  userEntryLineAr: string;
  combinedSummaryAr: string;
}

/**
 * Formats both the Trader's Entry Price + Time and the User's Entry Price + Time
 * whenever entering a trade (especially when entering late after the trader).
 */
export function formatLateEntryComparisonDetails(params: {
  traderEntryPrice?: number;
  traderEntryTime?: number;
  userEntryPrice: number;
  userEntryTime: number;
}): LateEntryComparisonDetails {
  const safeUserPrice = params.userEntryPrice > 0 ? params.userEntryPrice : 0;
  const safeTraderPrice =
    params.traderEntryPrice && params.traderEntryPrice > 0
      ? params.traderEntryPrice
      : safeUserPrice;
  const safeUserTime = params.userEntryTime > 0 ? params.userEntryTime : Date.now();
  const safeTraderTime =
    params.traderEntryTime && params.traderEntryTime > 0
      ? params.traderEntryTime
      : safeUserTime;

  const delayMs = Math.max(0, safeUserTime - safeTraderTime);
  const isLateEntry = delayMs > 1000 || Math.abs(safeTraderPrice - safeUserPrice) > 0.000001;

  let delayTextAr = 'دخول متزامن';
  if (delayMs >= 60000) {
    const totalMinutes = Math.floor(delayMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const mins = totalMinutes % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days} يوم`);
    if (hours > 0) parts.push(`${hours} س`);
    if (mins > 0) parts.push(`${mins} د`);
    delayTextAr = `دخول متأخر عن المتداول بـ ${parts.join(' و ')}`;
  } else if (delayMs > 1000) {
    const secs = Math.max(1, Math.floor(delayMs / 1000));
    delayTextAr = `دخول متأخر عن المتداول بـ ${secs} ث`;
  } else if (isLateEntry) {
    delayTextAr = 'دخول متأخر عن المتداول';
  }

  const traderPriceStr = formatTradePriceClean(safeTraderPrice);
  const traderTimeStr = formatTradeTimestampAr(safeTraderTime);
  const userPriceStr = formatTradePriceClean(safeUserPrice);
  const userTimeStr = formatTradeTimestampAr(safeUserTime);

  const traderEntryLineAr = `سعر دخول المتداول: ${traderPriceStr}$ (الوقت: ${traderTimeStr})`;
  const userEntryLineAr = `سعر دخولي: ${userPriceStr}$ (الوقت: ${userTimeStr})`;
  const combinedSummaryAr = `${traderEntryLineAr} • ${userEntryLineAr}`;

  return {
    isLateEntry,
    delayMs,
    delayTextAr,
    traderPriceStr,
    traderTimeStr,
    userPriceStr,
    userTimeStr,
    traderEntryLineAr,
    userEntryLineAr,
    combinedSummaryAr,
  };
}

/**
 * Computes the net remaining position size & single direct entry adjustment when entering late
 * on a copied trader's existing open position.
 * Instead of repeating all historical scale-ins (+50%) and partial withdrawals (-50%),
 * the app enters directly in ONE operation with the net remaining percentage (e.g. 150% or 50%),
 * and records both the trader's entry price + time and the user's entry price + time.
 */
export function calculateLateEntryNetPositionState(params: {
  baseMarginUsdt: number;
  leverage: number;
  executionPrice: number;
  side: 'LONG' | 'SHORT';
  traderEntryPrice?: number;
  traderEntryTime?: number;
  traderCurrentScalePercent?: number;
  traderScaleAdjustments?: PositionScaleAdjustment[];
  scaleInSamePercentAsTrader?: boolean;
  scaleInFixedValueUsdt?: number;
  entryTimestamp?: number;
}): {
  netScalePercent: number;
  netMarginUsdt: number;
  directQuantity: number;
  singleDirectAdjustment: PositionScaleAdjustment;
  lateEntryComparison: LateEntryComparisonDetails;
} {
  const baseMargin = Math.max(0.5, Number(params.baseMarginUsdt) || 25);
  const leverage = Math.max(1, Number(params.leverage) || 5);
  const safePrice = params.executionPrice > 0 ? params.executionPrice : 50;
  const samePctMode = params.scaleInSamePercentAsTrader !== false;
  const fixedScaleVal = Math.max(1, Number(params.scaleInFixedValueUsdt) || 10);

  let netScalePct = 100;
  let netMargin = baseMargin;

  if (params.traderScaleAdjustments && params.traderScaleAdjustments.length > 0) {
    let runningMargin = baseMargin;
    let runningScale = 100;

    for (const adj of params.traderScaleAdjustments) {
      if (adj.actionType === 'INITIAL_ENTRY') {
        runningMargin = baseMargin;
        runningScale = 100;
      } else if (adj.actionType === 'SCALE_IN') {
        const traderPct = Math.max(5, Math.abs(adj.volumePercent || 25));
        if (samePctMode) {
          const addedMargin = Number((baseMargin * (traderPct / 100)).toFixed(2));
          runningMargin = Number((runningMargin + addedMargin).toFixed(2));
          runningScale += traderPct;
        } else {
          const addedMargin = Number(fixedScaleVal.toFixed(2));
          const equivPct = Math.max(1, Math.round((addedMargin / baseMargin) * 100));
          runningMargin = Number((runningMargin + addedMargin).toFixed(2));
          runningScale += equivPct;
        }
      } else if (adj.actionType === 'PARTIAL_EXIT') {
        const withdrawPct = Math.min(95, Math.max(5, Math.abs(adj.volumePercent || 25)));
        const withdrawnMargin = Number((runningMargin * (withdrawPct / 100)).toFixed(2));
        runningMargin = Number(Math.max(0.5, runningMargin - withdrawnMargin).toFixed(2));
        runningScale = Math.max(5, Math.round(runningScale * (1 - withdrawPct / 100)));
      }
    }

    netScalePct = runningScale;
    netMargin = runningMargin;
  }

  // If traderCurrentScalePercent is explicitly set and differs from 100 when no adjustments list changed it
  if (
    params.traderCurrentScalePercent &&
    params.traderCurrentScalePercent > 0 &&
    netScalePct === 100 &&
    params.traderCurrentScalePercent !== 100
  ) {
    netScalePct = Math.max(5, Math.round(params.traderCurrentScalePercent));
    netMargin = Number(Math.max(0.5, baseMargin * (netScalePct / 100)).toFixed(2));
  }

  const directQuantity = Number(((netMargin * leverage) / safePrice).toFixed(5));
  const ts = params.entryTimestamp || Date.now();
  const sideLabel = params.side === 'LONG' ? 'شراء Long' : 'بيع Short';

  const lateEntryComparison = formatLateEntryComparisonDetails({
    traderEntryPrice: params.traderEntryPrice ?? safePrice,
    traderEntryTime: params.traderEntryTime ?? ts,
    userEntryPrice: safePrice,
    userEntryTime: ts,
  });

  const hasTraderInfo = Boolean(params.traderEntryPrice || params.traderEntryTime);
  const baseActionLabel =
    netScalePct !== 100
      ? `دخول مباشر بقيمة الصفقة المتبقية (${sideLabel} ${netScalePct}% • ${netMargin.toFixed(2)}$ بدون تكرار العمليات السابقة)`
      : `فتح الصفقة بالسعر الحالي للسوق (${sideLabel} 100% • ${netMargin.toFixed(2)}$)`;

  const actionLabelAr = hasTraderInfo
    ? `${baseActionLabel} — ${lateEntryComparison.combinedSummaryAr}`
    : baseActionLabel;

  const singleDirectAdjustment: PositionScaleAdjustment = {
    id: `direct_entry_${ts}`,
    actionType: 'INITIAL_ENTRY',
    actionLabelAr,
    timestamp: ts,
    volumePercent: netScalePct,
    remainingPercentAfter: netScalePct,
    executedQty: directQuantity,
    price: safePrice,
    traderEntryPrice: params.traderEntryPrice && params.traderEntryPrice > 0 ? params.traderEntryPrice : safePrice,
    traderEntryTime: params.traderEntryTime && params.traderEntryTime > 0 ? params.traderEntryTime : ts,
    marginDeltaUsdt: netMargin,
  };

  return {
    netScalePercent: netScalePct,
    netMarginUsdt: netMargin,
    directQuantity,
    singleDirectAdjustment,
    lateEntryComparison,
  };
}

/**
 * Ensures that historical trader records (SCALE_IN / PARTIAL_EXIT) that occurred BEFORE or AT
 * the time the user entered the position are NEVER replayed, because the user already entered
 * directly with the net remaining position value.
 */
export function shouldApplyTraderRecordAfterEntry(params: {
  recordTimestamp: number;
  userPositionOpenTime: number;
}): boolean {
  if (!params.recordTimestamp || !params.userPositionOpenTime) return false;
  return params.recordTimestamp > params.userPositionOpenTime;
}

/**
 * Builds a deterministic, poll-invariant deduplication key for any trader sync event
 * (order record, scale adjustment, or live position quantity reduction).
 */
export function buildStableTraderEventKey(params: {
  kind: 'REC' | 'ADJ' | 'QTY_DROP' | 'QTY_SCALE';
  symbol: string;
  actionType: 'ENTRY' | 'SCALE_IN' | 'PARTIAL_EXIT' | 'EXIT' | 'FULL_EXIT';
  timestamp?: number;
  volumePercent?: number;
  quantity?: number;
  rawId?: string;
}): string {
  const sym = String(params.symbol || '').toUpperCase().trim();
  const ts = Math.round(Number(params.timestamp || 0));
  const pct = Math.round(Math.abs(Number(params.volumePercent || 0)));
  const qty = Number(params.quantity || 0).toFixed(5);
  if (params.kind === 'ADJ' && params.rawId) {
    return `adj:${sym}:${params.actionType}:${params.rawId}`;
  }
  return `${params.kind.toLowerCase()}:${sym}:${params.actionType}:${ts}:${pct}:${qty}`;
}

/**
 * Multi-layer idempotency check ensuring a PARTIAL_EXIT / SCALE_IN / EXIT event
 * can NEVER execute or emit notifications more than once across repeated polls or page reloads.
 */
export function hasSyncEventBeenApplied(params: {
  appliedSyncEventIds?: string[];
  scaleAdjustments?: PositionScaleAdjustment[];
  candidateKeys: string[];
  actionType: 'SCALE_IN' | 'PARTIAL_EXIT' | 'FULL_EXIT';
  eventTimestamp?: number;
}): boolean {
  const keys = params.candidateKeys.filter(Boolean);
  const storedSet = new Set(params.appliedSyncEventIds || []);
  for (const key of keys) {
    if (storedSet.has(key)) {
      return true;
    }
  }

  const adjustments = params.scaleAdjustments || [];
  for (const adj of adjustments) {
    if (adj.sourceEventId && keys.includes(adj.sourceEventId)) {
      return true;
    }
    if (keys.includes(adj.id)) {
      return true;
    }
    if (
      adj.actionType === params.actionType &&
      params.eventTimestamp &&
      params.eventTimestamp > 0 &&
      adj.timestamp > 0 &&
      Math.abs(adj.timestamp - params.eventTimestamp) < 60000
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Computes the partial exit percentage when a trader reduces their live open position quantity
 * between polls (ignoring noise under 5%). Returns 0 if no genuine reduction occurred.
 */
export function calculatePositionQuantityDropPartialExitPct(params: {
  previousQty?: number;
  currentQty?: number;
}): number {
  const prev = Number(params.previousQty || 0);
  const curr = Number(params.currentQty || 0);
  if (prev <= 0 || curr <= 0 || curr >= prev) {
    return 0;
  }
  const dropRatio = (prev - curr) / prev;
  if (dropRatio < 0.05) {
    return 0;
  }
  return Math.min(95, Math.max(5, Math.round(dropRatio * 100)));
}

