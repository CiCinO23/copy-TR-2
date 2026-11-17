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
  ManualPositionDeltaAction,
  PaperPosition,
  PendingReconnectTradeChoice,
  PositionScaleAdjustment,
  TraderLatestRecord,
  TraderOpenPosition,
  TraderPositionHistoryItem,
  TraderSyncCheckpoint,
} from '../types';
import { formatDateTimeWestern } from '../utils/formatters';

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
  promptOnUnfavorableLateEntry?: boolean;
}): PriceAdvantageEvaluation {
  const { side, traderEntryPrice, currentMarketPrice } = params;
  const shouldPrompt = params.promptOnUnfavorableLateEntry !== false;
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
    } else if (!shouldPrompt) {
      return {
        isFavorable: false,
        decision: 'EXECUTE_IMMEDIATELY',
        priceDiffPercent,
        reasonAr: `صفقة بيع (SHORT) والسعر الحالي (${safeCurrent}) أقل من سعر الدخول (${safeEntry}) (${priceDiffPercent}%) — تم إلغاء خيار الانتظار ودخل النظام آلياً بسعر السوق`,
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
    } else if (!shouldPrompt) {
      return {
        isFavorable: false,
        decision: 'EXECUTE_IMMEDIATELY',
        priceDiffPercent,
        reasonAr: `صفقة شراء (LONG) والسعر الحالي (${safeCurrent}) أعلى من سعر الدخول (${safeEntry}) (+${priceDiffPercent}%) — تم إلغاء خيار الانتظار ودخل النظام آلياً بسعر السوق`,
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
 * Formats a timestamp into a clean date & time string (YYYY-MM-DD HH:mm:ss) with Western Latin digits.
 */
export function formatTradeTimestampAr(ts?: number): string {
  if (!ts || ts <= 0 || isNaN(ts)) return '--';
  return formatDateTimeWestern(ts);
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

/**
 * Computes the scale-in percentage when a whale or trader increases their live open position quantity
 * between polls (ignoring noise under 5%). Returns 0 if no genuine increase occurred.
 */
export function calculatePositionQuantityIncreaseScaleInPct(params: {
  previousQty?: number;
  currentQty?: number;
}): number {
  const prev = Number(params.previousQty || 0);
  const curr = Number(params.currentQty || 0);
  if (prev <= 0 || curr <= 0 || curr <= prev) {
    return 0;
  }
  const increaseRatio = (curr - prev) / prev;
  if (increaseRatio < 0.05) {
    return 0;
  }
  return Math.min(300, Math.max(5, Math.round(increaseRatio * 100)));
}

/**
 * Determines whether an incoming whale or trader position should be executed IMMEDIATELY
 * in the exact same moment (في نفس اللحظة) at the live market price without waiting for manual confirmation:
 * 1) Whale trades (`source === 'SMART_MONEY'`) always execute immediately unless `forcePromptOnWhale` is true.
 * 2) Explicit immediate execution (`forceImmediateExecution === true`).
 * 3) User disabled `promptOnUnfavorableLateEntry`.
 * 4) Newly opened live trades (opened within the last 3 minutes or after `copiedStartedAt`).
 */
export function shouldExecuteWhaleOrLiveTradeImmediately(params: {
  source: 'COPY_TRADING' | 'SMART_MONEY';
  entryTime?: number;
  copiedStartedAt?: number;
  now?: number;
  promptOnUnfavorableLateEntry?: boolean;
  forceImmediateExecution?: boolean;
  forcePromptOnWhale?: boolean;
}): boolean {
  if (params.forceImmediateExecution) {
    return true;
  }
  if (params.promptOnUnfavorableLateEntry === false) {
    return true;
  }
  if (params.source === 'SMART_MONEY' && !params.forcePromptOnWhale) {
    return true;
  }
  const now = params.now && params.now > 0 ? params.now : Date.now();
  const entryTs = Number(params.entryTime || 0);
  if (entryTs > 0) {
    // Any live trade opened within the last 3 minutes is a fresh signal, not an old reconnect trade
    if (now - entryTs <= 180_000) {
      return true;
    }
    // Any trade opened at or after the moment the user started copying this trader/whale
    if (params.copiedStartedAt && params.copiedStartedAt > 0 && entryTs >= params.copiedStartedAt - 15_000) {
      return true;
    }
  }
  return false;
}

/**
 * Builds a deterministic, trader-scoped action ID for versioning and lastProcessedActionId checkpointing.
 */
export function buildTraderActionId(params: {
  traderId: string;
  symbol: string;
  actionType: 'ENTRY' | 'SCALE_IN' | 'PARTIAL_EXIT' | 'FULL_EXIT';
  rawId?: string;
  timestamp?: number;
  volumePercent?: number;
  quantity?: number;
}): string {
  const tid = String(params.traderId || 'unknown').trim();
  const sym = String(params.symbol || '').toUpperCase().trim();
  const ts = Math.round(Number(params.timestamp || 0));
  const pct = Math.round(Math.abs(Number(params.volumePercent || 0)));
  const qty = Number(params.quantity || 0).toFixed(5);
  if (params.rawId && String(params.rawId).trim()) {
    return `ta:${tid}:${sym}:${params.actionType}:${String(params.rawId).trim()}`;
  }
  return `ta:${tid}:${sym}:${params.actionType}:${ts}:${pct}:${qty}`;
}

/**
 * Checks a per-trader sync checkpoint (version + lastProcessedActionId + processedActionIds + per-symbol recency)
 * so any already-processed sync action is skipped cleanly.
 */
export function isTraderActionAlreadyProcessed(params: {
  checkpoint?: {
    version: number;
    lastProcessedActionId: string | null;
    lastProcessedTimestamp: number;
    processedActionIds: string[];
    lastActionsBySymbol?: Record<
      string,
      { actionId: string; actionType: string; timestamp: number }
    >;
  } | null;
  incomingSyncVersion?: number;
  candidateActionIds: string[];
  symbol?: string;
  actionType?: 'SCALE_IN' | 'PARTIAL_EXIT' | 'FULL_EXIT';
  eventTimestamp?: number;
}): boolean {
  const cp = params.checkpoint;
  if (!cp) return false;

  if (
    params.incomingSyncVersion !== undefined &&
    params.incomingSyncVersion <= cp.version
  ) {
    return true;
  }

  const candidates = params.candidateActionIds.filter(Boolean);
  if (cp.lastProcessedActionId && candidates.includes(cp.lastProcessedActionId)) {
    return true;
  }

  const processedSet = new Set(cp.processedActionIds || []);
  for (const candidate of candidates) {
    if (processedSet.has(candidate)) {
      return true;
    }
  }

  if (params.symbol && params.actionType && params.eventTimestamp && params.eventTimestamp > 0) {
    const symKey = String(params.symbol).toUpperCase().trim();
    const lastForSym = cp.lastActionsBySymbol?.[symKey];
    if (
      lastForSym &&
      lastForSym.actionType === params.actionType &&
      lastForSym.timestamp > 0 &&
      Math.abs(lastForSym.timestamp - params.eventTimestamp) < 60000
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a candidate trader position is ALREADY permanently closed
 * according to `latestRecords` (an EXIT without any newer ENTRY) or `positionHistory`.
 * Prevents fetching/deriving/opening old or permanently closed historical trades.
 */
export function isTraderTradePermanentlyClosed(params: {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryTime?: number;
  latestRecords?: TraderLatestRecord[];
  positionHistory?: TraderPositionHistoryItem[];
}): boolean {
  const sym = String(params.symbol || '').toUpperCase().trim();
  const entryTs = Number(params.entryTime || 0);
  const records = params.latestRecords || [];
  const history = params.positionHistory || [];

  const matchingRecords = records
    .filter((r) => {
      if (String(r.symbol || '').toUpperCase().trim() !== sym) return false;
      if (r.positionSide === 'LONG' || r.positionSide === 'SHORT') {
        return r.positionSide === params.side;
      }
      return true;
    })
    .sort((a, b) => (a.exitTime || a.orderTime || 0) - (b.exitTime || b.orderTime || 0));

  let latestEntryAfterExitTs = 0;
  let latestExitTs = 0;
  for (const r of matchingRecords) {
    const recTs = Number(r.exitTime || r.orderTime || 0);
    if (r.actionType === 'EXIT') {
      if (recTs > latestExitTs) latestExitTs = recTs;
    } else if (r.actionType === 'ENTRY' || r.actionType === 'SCALE_IN') {
      if (recTs > latestEntryAfterExitTs) latestEntryAfterExitTs = recTs;
    }
  }

  // If a full EXIT occurred after/at this position's entryTime and no newer ENTRY followed it
  if (latestExitTs > 0 && latestEntryAfterExitTs <= latestExitTs + 5_000) {
    if (entryTs <= 0 || latestExitTs >= entryTs - 60_000) {
      return true;
    }
  }

  // Also check explicit closed positionHistory for the same symbol & side
  for (const h of history) {
    if (String(h.symbol || '').toUpperCase().trim() !== sym) continue;
    if (h.side !== params.side) continue;
    const statusStr = String((h as any).status || '').trim().toLowerCase();
    if (statusStr === 'partially closed') continue;
    const closedTs = Number(h.closed || 0);
    const openedTs = Number(h.opened || 0);
    if (closedTs <= 0) continue;

    // Only consider closed if no newer ENTRY record opened after that close
    const hasNewerEntryAfterClose =
      latestEntryAfterExitTs > closedTs + 5_000 || (entryTs > 0 && entryTs > closedTs + 5_000);
    if (hasNewerEntryAfterClose) continue;

    if (entryTs > 0) {
      if (closedTs >= entryTs - 60_000 || (openedTs > 0 && Math.abs(openedTs - entryTs) < 120_000)) {
        return true;
      }
    } else {
      return true;
    }
  }

  return false;
}

/**
 * Prevents re-opening a trader position that has ALREADY been synced/entered/closed
 * for this account, stopping endless open/close sync loops.
 * Allows opening only if it is a genuinely NEW trade (newer entryTime & unseen action ID).
 */
export function hasTraderEntryAlreadyBeenSynced(params: {
  traderId: string;
  traderName?: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  rawPositionId?: string;
  entryTime?: number;
  accountPositions: PaperPosition[];
  checkpoint?: TraderSyncCheckpoint | null;
}): boolean {
  const sym = String(params.symbol || '').toUpperCase().trim();
  const entryTs = Number(params.entryTime || 0);

  const belongsToTrader = (p: PaperPosition) =>
    p.symbol.toUpperCase() === sym &&
    p.side === params.side &&
    (p.sourceTraderId === params.traderId ||
      (!!params.traderName && p.sourceTraderName === params.traderName));

  // 1. Already open right now
  if (params.accountPositions.some((p) => p.status === 'OPEN' && belongsToTrader(p))) {
    return true;
  }

  // 2. Already copied & closed for this same trader entry (or closed after/around this entryTime)
  let hasClosedMatchInAccount = false;
  for (const p of params.accountPositions) {
    if (p.status !== 'CLOSED' || !belongsToTrader(p)) continue;
    hasClosedMatchInAccount = true;
    const pTraderEntry = Number(p.traderEntryTime || 0);
    const pCloseTime = Number(p.closeTime || 0);
    const pOpenTime = Number(p.openTime || 0);

    if (entryTs > 0) {
      if (pTraderEntry > 0 && Math.abs(pTraderEntry - entryTs) < 120_000) {
        return true;
      }
      if (pCloseTime > 0 && entryTs <= pCloseTime + 5_000) {
        return true;
      }
      if (pOpenTime > 0 && entryTs <= pOpenTime && pCloseTime > 0) {
        return true;
      }
    } else if (pCloseTime > 0) {
      return true;
    }
  }

  // 3. Per-trader checkpoint already recorded a FULL_EXIT at/after this entryTime,
  // or recorded this exact ENTRY when the account still holds history for this trader+symbol
  const cp = params.checkpoint;
  if (cp) {
    const lastForSym = cp.lastActionsBySymbol?.[sym];
    if (
      lastForSym &&
      lastForSym.actionType === 'FULL_EXIT' &&
      entryTs > 0 &&
      lastForSym.timestamp >= entryTs - 5_000
    ) {
      return true;
    }

    if (hasClosedMatchInAccount) {
      const idWithRaw = buildTraderActionId({
        traderId: params.traderId,
        symbol: sym,
        actionType: 'ENTRY',
        rawId: params.rawPositionId,
        timestamp: entryTs,
      });
      const idByTime = buildTraderActionId({
        traderId: params.traderId,
        symbol: sym,
        actionType: 'ENTRY',
        timestamp: entryTs,
      });
      const processed = new Set(cp.processedActionIds || []);
      if (
        (params.rawPositionId && processed.has(idWithRaw)) ||
        (entryTs > 0 && processed.has(idByTime))
      ) {
        return true;
      }
      if (
        lastForSym &&
        lastForSym.actionType === 'ENTRY' &&
        entryTs > 0 &&
        lastForSym.timestamp >= entryTs - 5_000
      ) {
        return true;
      }
    }
  }

  return false;
}

export interface AccountDrawdownAlertStateRecord {
  alertedAtThreshold: number;
  peakAlertedDrawdown: number;
  lastAlertTimestamp: number;
  isArmed?: boolean;
  recoveryConfirmationCount?: number;
}

export interface DrawdownAlertEvaluationResult {
  shouldAlert: boolean;
  stateChanged: boolean;
  nextState: AccountDrawdownAlertStateRecord | null;
}

/**
 * Pure decision function for Virtual Account Drawdown Alerts (`DRAWDOWN_ALERT`).
 * Prevents duplicate low-balance notification storms when reconnecting to the internet
 * after a disconnection or when partial price updates oscillate around the threshold:
 * 1. Suppresses evaluation while offline (`isOnline === false`) or during the post-reconnect
 *    stabilization grace window (`reconnectGracePeriodMs`, default 4,000ms) so out-of-order
 *    or partial price maps never reset the alert lock or trigger false spikes.
 * 2. Locks an account's drawdown wave (`isArmed = false`) after alerting so repeated syncs
 *    at the same drawdown level never emit duplicate notifications.
 * 3. Only escalates within an active drawdown wave if drawdown worsens by >= +5% AND at least
 *    `minEscalationCooldownMs` (default 5 minutes) has elapsed since the previous alert
 *    (or if the user explicitly lowered `thresholdPercent` in settings).
 * 4. Requires sustained recovery (`requiredRecoveryConfirmations`, default 3 consecutive checks
 *    at <= 85% of threshold after at least 60s) AND `minRepeatCooldownMs` (default 15 minutes)
 *    before re-arming for a future drawdown wave.
 */
export function evaluateAccountDrawdownAlertDecision(params: {
  drawdownPercent: number;
  thresholdPercent: number;
  previousState?: AccountDrawdownAlertStateRecord | null;
  now?: number;
  isOnline?: boolean;
  lastOnlineReconnectAt?: number;
  reconnectGracePeriodMs?: number;
  minRepeatCooldownMs?: number;
  minEscalationCooldownMs?: number;
  requiredRecoveryConfirmations?: number;
}): DrawdownAlertEvaluationResult {
  const ddPct = parseFloat(Math.max(0, Number(params.drawdownPercent) || 0).toFixed(2));
  const threshold = Math.max(0.5, Number(params.thresholdPercent) || 10);
  const now = params.now && params.now > 0 ? params.now : Date.now();
  const isOnline = params.isOnline ?? true;
  const lastReconnectAt = Number(params.lastOnlineReconnectAt || 0);
  const reconnectGraceMs = params.reconnectGracePeriodMs ?? 4_000;
  const minRepeatCooldownMs = params.minRepeatCooldownMs ?? 15 * 60 * 1000;
  const minEscalationCooldownMs = params.minEscalationCooldownMs ?? 5 * 60 * 1000;
  const requiredConfirmations = Math.max(2, params.requiredRecoveryConfirmations ?? 3);

  const prev: AccountDrawdownAlertStateRecord | null = params.previousState
    ? {
        alertedAtThreshold: Number(params.previousState.alertedAtThreshold || threshold),
        peakAlertedDrawdown: Number(params.previousState.peakAlertedDrawdown || 0),
        lastAlertTimestamp: Number(params.previousState.lastAlertTimestamp || 0),
        isArmed: Boolean(params.previousState.isArmed ?? false),
        recoveryConfirmationCount: Number(params.previousState.recoveryConfirmationCount || 0),
      }
    : null;

  // 1. Offline or inside post-reconnect stabilization window: never reset state or emit duplicate alerts
  if (!isOnline) {
    return {
      shouldAlert: false,
      stateChanged: false,
      nextState: prev,
    };
  }

  if (
    lastReconnectAt > 0 &&
    now >= lastReconnectAt &&
    now - lastReconnectAt < reconnectGraceMs
  ) {
    return {
      shouldAlert: false,
      stateChanged: false,
      nextState: prev,
    };
  }

  // 2. Account is at or above the drawdown threshold
  if (ddPct >= threshold) {
    if (!prev) {
      return {
        shouldAlert: true,
        stateChanged: true,
        nextState: {
          alertedAtThreshold: threshold,
          peakAlertedDrawdown: ddPct,
          lastAlertTimestamp: now,
          isArmed: false,
          recoveryConfirmationCount: 0,
        },
      };
    }

    const elapsedSinceLastAlert = Math.max(0, now - prev.lastAlertTimestamp);
    const thresholdWasLoweredByUser = threshold < prev.alertedAtThreshold - 0.01;
    const worsenedSignificantly = ddPct >= prev.peakAlertedDrawdown + 5;

    let shouldAlert = false;
    if (thresholdWasLoweredByUser) {
      shouldAlert = true;
    } else if (prev.isArmed) {
      // Account had previously recovered; only alert if repeat cooldown elapsed or drawdown worsened by >= 5%
      shouldAlert =
        elapsedSinceLastAlert >= minRepeatCooldownMs ||
        (worsenedSignificantly && elapsedSinceLastAlert >= minEscalationCooldownMs);
    } else {
      // Account is still in the same drawdown wave: only alert if worsened by >= 5% AND escalation cooldown elapsed
      shouldAlert = worsenedSignificantly && elapsedSinceLastAlert >= minEscalationCooldownMs;
    }

    if (shouldAlert) {
      return {
        shouldAlert: true,
        stateChanged: true,
        nextState: {
          alertedAtThreshold: threshold,
          peakAlertedDrawdown: Math.max(ddPct, prev.peakAlertedDrawdown),
          lastAlertTimestamp: now,
          isArmed: false,
          recoveryConfirmationCount: 0,
        },
      };
    }

    const nextPeak = Math.max(ddPct, prev.peakAlertedDrawdown);
    const stateChanged =
      nextPeak !== prev.peakAlertedDrawdown ||
      prev.recoveryConfirmationCount !== 0 ||
      prev.isArmed !== false;

    return {
      shouldAlert: false,
      stateChanged,
      nextState: {
        ...prev,
        peakAlertedDrawdown: nextPeak,
        isArmed: false,
        recoveryConfirmationCount: 0,
      },
    };
  }

  // 3. Account is below the drawdown threshold
  if (!prev) {
    return {
      shouldAlert: false,
      stateChanged: false,
      nextState: null,
    };
  }

  const elapsedSinceLastAlert = Math.max(0, now - prev.lastAlertTimestamp);
  // Require drawdown to drop below 85% of threshold AND at least 60 seconds after the alert
  // so rapid price-map oscillations during internet reconnection never count as recovery
  if (ddPct <= threshold * 0.85 && elapsedSinceLastAlert >= 60_000) {
    const nextConfirmations = (prev.recoveryConfirmationCount || 0) + 1;
    const shouldRearm =
      nextConfirmations >= requiredConfirmations && elapsedSinceLastAlert >= minRepeatCooldownMs;

    if (shouldRearm && !prev.isArmed) {
      return {
        shouldAlert: false,
        stateChanged: true,
        nextState: {
          ...prev,
          isArmed: true,
          recoveryConfirmationCount: nextConfirmations,
        },
      };
    }

    if (nextConfirmations !== (prev.recoveryConfirmationCount || 0)) {
      return {
        shouldAlert: false,
        stateChanged: true,
        nextState: {
          ...prev,
          recoveryConfirmationCount: nextConfirmations,
        },
      };
    }
  }

  return {
    shouldAlert: false,
    stateChanged: false,
    nextState: prev,
  };
}

/**
 * Collects all deterministic deduplication keys for a trader position's existing scaleAdjustments
 * so that when a position is opened for the first time, all historical adjustments already folded
 * into its net entry size are marked as applied and never re-applied on subsequent manual clicks.
 */
export function buildInitialAppliedEventKeysForOpenPosition(
  symbol: string,
  scaleAdjustments?: PositionScaleAdjustment[]
): string[] {
  const sym = String(symbol || '').toUpperCase().trim();
  const keys = new Set<string>();
  for (const adj of scaleAdjustments || []) {
    if (adj.actionType !== 'SCALE_IN' && adj.actionType !== 'PARTIAL_EXIT') {
      continue;
    }
    const keyAdj = buildStableTraderEventKey({
      kind: 'ADJ',
      symbol: sym,
      actionType: adj.actionType,
      rawId: adj.id,
      timestamp: adj.timestamp,
      volumePercent: adj.volumePercent,
      quantity: adj.executedQty,
    });
    const keyRec = buildStableTraderEventKey({
      kind: 'REC',
      symbol: sym,
      actionType: adj.actionType,
      timestamp: adj.timestamp,
      volumePercent: adj.volumePercent,
      quantity: adj.executedQty,
    });
    keys.add(keyAdj);
    keys.add(keyRec);
    if (adj.id) keys.add(adj.id);
    if (adj.sourceEventId) keys.add(adj.sourceEventId);
  }
  return Array.from(keys);
}

export interface ManualSinglePositionCopyPlan {
  decision: 'OPEN_NEW' | 'DO_NOTHING_ALREADY_COPIED' | 'SYNC_DELTAS_ONLY';
  existingPosition: PaperPosition | null;
  deltaActions: ManualPositionDeltaAction[];
  initialAppliedEventKeys: string[];
}

/**
 * Evaluates what should happen when the user manually clicks "نسخ الصفقة" on a single trader/whale position:
 * - If the trade is NOT yet open in the target virtual account -> 'OPEN_NEW'
 * - If the trade IS already open in the target virtual account:
 *   - If there are NO uncopied partial exits (سحوبات جزئية) or scale-ins (تدعيم) -> 'DO_NOTHING_ALREADY_COPIED'
 *   - If there ARE uncopied partial exits or scale-ins -> 'SYNC_DELTAS_ONLY' (returns only the uncopied delta actions)
 */
export function evaluateManualSinglePositionCopyPlan(params: {
  incomingPos: TraderOpenPosition;
  traderName?: string;
  traderId?: string;
  existingOpenPositions: PaperPosition[];
  executionPrice: number;
}): ManualSinglePositionCopyPlan {
  const { incomingPos, traderName, traderId, existingOpenPositions, executionPrice } = params;
  const sym = String(incomingPos.symbol || '').toUpperCase().trim();
  const safePrice =
    executionPrice > 0
      ? executionPrice
      : incomingPos.markPrice > 0
      ? incomingPos.markPrice
      : incomingPos.entryPrice;

  const initialAppliedEventKeys = buildInitialAppliedEventKeysForOpenPosition(
    sym,
    incomingPos.scaleAdjustments
  );

  const cleanTraderName = String(traderName || '').trim().toLowerCase();
  const cleanTraderId = String(traderId || '').trim();

  const candidatesForSymAndSide = (existingOpenPositions || []).filter(
    (p) =>
      p.status === 'OPEN' &&
      String(p.symbol || '').toUpperCase().trim() === sym &&
      p.side === incomingPos.side
  );

  // Match open position by traderId/traderName first, or fallback to same symbol+side if no conflicting trader
  let existingPosition: PaperPosition | null = null;
  for (const p of candidatesForSymAndSide) {
    const pTid = String(p.sourceTraderId || '').trim();
    const pTname = String(p.sourceTraderName || '').trim().toLowerCase();
    if (
      (cleanTraderId && pTid && cleanTraderId === pTid) ||
      (cleanTraderName && pTname && cleanTraderName === pTname)
    ) {
      existingPosition = p;
      break;
    }
  }

  if (!existingPosition && candidatesForSymAndSide.length > 0) {
    const nonConflicting = candidatesForSymAndSide.find((p) => {
      const pTid = String(p.sourceTraderId || '').trim();
      const pTname = String(p.sourceTraderName || '').trim().toLowerCase();
      const idConflict = Boolean(cleanTraderId && pTid && cleanTraderId !== pTid);
      const nameConflict = Boolean(cleanTraderName && pTname && cleanTraderName !== pTname);
      return !idConflict && !nameConflict;
    });
    existingPosition = nonConflicting || candidatesForSymAndSide[0];
  }

  if (!existingPosition) {
    return {
      decision: 'OPEN_NEW',
      existingPosition: null,
      deltaActions: [],
      initialAppliedEventKeys,
    };
  }

  const deltaActions: ManualPositionDeltaAction[] = [];
  const queuedEventKeys = new Set<string>();
  const existingAppliedIds = existingPosition.appliedSyncEventIds || [];
  const existingAdjustments = existingPosition.scaleAdjustments || [];
  const existingScalePct = Math.round(Number(existingPosition.currentScalePercent || 100));
  const incomingScalePct = Math.round(Number(incomingPos.currentScalePercent || 100));

  // 1. Check explicit scaleAdjustments on incomingPos for uncopied SCALE_IN or PARTIAL_EXIT events
  const sortedIncomingAdjs = [...(incomingPos.scaleAdjustments || [])].sort(
    (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
  );

  for (const adj of sortedIncomingAdjs) {
    if (adj.actionType !== 'SCALE_IN' && adj.actionType !== 'PARTIAL_EXIT') {
      continue;
    }

    const keyAdj = buildStableTraderEventKey({
      kind: 'ADJ',
      symbol: sym,
      actionType: adj.actionType,
      rawId: adj.id,
      timestamp: adj.timestamp,
      volumePercent: adj.volumePercent,
      quantity: adj.executedQty,
    });
    const keyRec = buildStableTraderEventKey({
      kind: 'REC',
      symbol: sym,
      actionType: adj.actionType,
      timestamp: adj.timestamp,
      volumePercent: adj.volumePercent,
      quantity: adj.executedQty,
    });
    const candidateKeys = [keyAdj, keyRec, adj.id, adj.sourceEventId].filter(
      (k): k is string => Boolean(k)
    );

    if (candidateKeys.some((k) => queuedEventKeys.has(k))) {
      continue;
    }

    const alreadyApplied = hasSyncEventBeenApplied({
      appliedSyncEventIds: existingAppliedIds,
      scaleAdjustments: existingAdjustments,
      candidateKeys,
      actionType: adj.actionType,
      eventTimestamp: adj.timestamp,
    });

    if (alreadyApplied) {
      continue;
    }

    // Guard for legacy positions opened before appliedSyncEventIds was tracked:
    // If the adjustment happened at/before existingPosition.openTime AND the net scale percent already matches,
    // it was already folded into existingPosition at initial late-entry time.
    const wasFoldedAtInitialEntry =
      existingAppliedIds.length === 0 &&
      adj.timestamp > 0 &&
      existingPosition.openTime > 0 &&
      adj.timestamp <= existingPosition.openTime &&
      existingScalePct === incomingScalePct;

    if (wasFoldedAtInitialEntry) {
      continue;
    }

    const volPct = Math.max(5, Math.abs(Math.round(Number(adj.volumePercent || 25))));
    const adjPrice = adj.price && adj.price > 0 ? adj.price : safePrice;
    const adjTs = adj.timestamp && adj.timestamp > 0 ? adj.timestamp : Date.now();

    for (const k of candidateKeys) {
      queuedEventKeys.add(k);
    }

    deltaActions.push({
      actionType: adj.actionType,
      volumePercent: adj.actionType === 'PARTIAL_EXIT' ? Math.min(95, volPct) : volPct,
      price: adjPrice,
      timestamp: adjTs,
      sourceEventId: keyAdj,
      candidateKeys,
    });
  }

  // 2. If no discrete scaleAdjustments were unapplied, check live trader quantity delta
  const currentTraderQty = Math.abs(Number(incomingPos.positionAmount || 0));
  const previousTraderQty = Math.abs(Number(existingPosition.lastSyncedTraderQty || 0));
  if (deltaActions.length === 0 && previousTraderQty > 0 && currentTraderQty > 0) {
    const dropPct = calculatePositionQuantityDropPartialExitPct({
      previousQty: previousTraderQty,
      currentQty: currentTraderQty,
    });
    if (dropPct >= 5) {
      const qtyDropKey = buildStableTraderEventKey({
        kind: 'QTY_DROP',
        symbol: sym,
        actionType: 'PARTIAL_EXIT',
        volumePercent: dropPct,
        quantity: currentTraderQty,
      });
      const candidateKeys = [qtyDropKey];
      if (
        !hasSyncEventBeenApplied({
          appliedSyncEventIds: existingAppliedIds,
          scaleAdjustments: existingAdjustments,
          candidateKeys,
          actionType: 'PARTIAL_EXIT',
        })
      ) {
        deltaActions.push({
          actionType: 'PARTIAL_EXIT',
          volumePercent: dropPct,
          price: safePrice,
          timestamp: incomingPos.lastUpdateTime || Date.now(),
          sourceEventId: qtyDropKey,
          candidateKeys,
        });
      }
    } else {
      const scaleInPct = calculatePositionQuantityIncreaseScaleInPct({
        previousQty: previousTraderQty,
        currentQty: currentTraderQty,
      });
      if (scaleInPct >= 5) {
        const qtyScaleKey = buildStableTraderEventKey({
          kind: 'QTY_SCALE',
          symbol: sym,
          actionType: 'SCALE_IN',
          volumePercent: scaleInPct,
          quantity: currentTraderQty,
        });
        const candidateKeys = [qtyScaleKey];
        if (
          !hasSyncEventBeenApplied({
            appliedSyncEventIds: existingAppliedIds,
            scaleAdjustments: existingAdjustments,
            candidateKeys,
            actionType: 'SCALE_IN',
          })
        ) {
          deltaActions.push({
            actionType: 'SCALE_IN',
            volumePercent: scaleInPct,
            price: safePrice,
            timestamp: incomingPos.lastUpdateTime || Date.now(),
            sourceEventId: qtyScaleKey,
            candidateKeys,
          });
        }
      }
    }
  }

  // 3. Fallback: check net scale percentage difference (currentScalePercent)
  if (
    deltaActions.length === 0 &&
    incomingScalePct > 0 &&
    existingScalePct > 0 &&
    Math.abs(incomingScalePct - existingScalePct) >= 5
  ) {
    if (incomingScalePct < existingScalePct) {
      const withdrawPct = Math.min(
        95,
        Math.max(5, Math.round(((existingScalePct - incomingScalePct) / existingScalePct) * 100))
      );
      const scaleDropKey = buildStableTraderEventKey({
        kind: 'ADJ',
        symbol: sym,
        actionType: 'PARTIAL_EXIT',
        rawId: `scale_diff_${existingScalePct}_to_${incomingScalePct}`,
        volumePercent: withdrawPct,
      });
      const candidateKeys = [scaleDropKey];
      if (
        !hasSyncEventBeenApplied({
          appliedSyncEventIds: existingAppliedIds,
          scaleAdjustments: existingAdjustments,
          candidateKeys,
          actionType: 'PARTIAL_EXIT',
        })
      ) {
        deltaActions.push({
          actionType: 'PARTIAL_EXIT',
          volumePercent: withdrawPct,
          price: safePrice,
          timestamp: incomingPos.lastUpdateTime || Date.now(),
          sourceEventId: scaleDropKey,
          candidateKeys,
        });
      }
    } else {
      const addPct = Math.min(300, Math.max(5, Math.round(incomingScalePct - existingScalePct)));
      const scaleAddKey = buildStableTraderEventKey({
        kind: 'ADJ',
        symbol: sym,
        actionType: 'SCALE_IN',
        rawId: `scale_diff_${existingScalePct}_to_${incomingScalePct}`,
        volumePercent: addPct,
      });
      const candidateKeys = [scaleAddKey];
      if (
        !hasSyncEventBeenApplied({
          appliedSyncEventIds: existingAppliedIds,
          scaleAdjustments: existingAdjustments,
          candidateKeys,
          actionType: 'SCALE_IN',
        })
      ) {
        deltaActions.push({
          actionType: 'SCALE_IN',
          volumePercent: addPct,
          price: safePrice,
          timestamp: incomingPos.lastUpdateTime || Date.now(),
          sourceEventId: scaleAddKey,
          candidateKeys,
        });
      }
    }
  }

  if (deltaActions.length === 0) {
    return {
      decision: 'DO_NOTHING_ALREADY_COPIED',
      existingPosition,
      deltaActions: [],
      initialAppliedEventKeys,
    };
  }

  return {
    decision: 'SYNC_DELTAS_ONLY',
    existingPosition,
    deltaActions,
    initialAppliedEventKeys,
  };
}

